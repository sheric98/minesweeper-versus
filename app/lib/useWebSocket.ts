import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import type { ClientMessage, ServerMessage, ConnectionState } from "./multiplayer-types";

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

interface UseWebSocketOptions {
  matchId: string;
  onMessage: (msg: ServerMessage) => void;
}

interface UseWebSocketReturn {
  send: (msg: ClientMessage) => void;
  connectionState: ConnectionState;
  disconnect: () => void;
}

async function fetchTicket(): Promise<string> {
  const res = await fetch("/api/ws-ticket", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to fetch WS ticket: ${res.status}`);
  }
  const data = (await res.json()) as { ticket: string };
  return data.ticket;
}

export default function useWebSocket({
  matchId,
  onMessage,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => {
    onMessageRef.current = onMessage;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const queueRef = useRef<ClientMessage[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushQueue = useCallback((ws: WebSocket) => {
    const pending = queueRef.current;
    queueRef.current = [];
    for (const msg of pending) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    if (intentionalCloseRef.current) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) {
      console.error("[useWebSocket] NEXT_PUBLIC_WS_URL is not set");
      setConnectionState("disconnected");
      return;
    }

    let ticket: string;
    try {
      ticket = await fetchTicket();
    } catch (err) {
      console.error("[useWebSocket] Ticket fetch failed:", err);
      // Retry or give up
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setConnectionState("reconnecting");
        const delay = BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1);
        retryTimerRef.current = setTimeout(() => { connect(); }, delay);
      } else {
        setConnectionState("disconnected");
      }
      return;
    }

    const ws = new WebSocket(`${wsUrl}/ws?ticket=${encodeURIComponent(ticket)}&matchId=${encodeURIComponent(matchId)}`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (intentionalCloseRef.current) {
        ws.close(1000);
        return;
      }
      retryCountRef.current = 0;
      setConnectionState("connected");
      flushQueue(ws);
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        onMessageRef.current(msg);
      } catch (err) {
        console.error("[useWebSocket] Failed to parse message:", err);
      }
    });

    ws.addEventListener("close", () => {
      if (intentionalCloseRef.current) return;

      // Unexpected close — attempt reconnect
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setConnectionState("reconnecting");
        const delay = BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1);
        retryTimerRef.current = setTimeout(() => { connect(); }, delay);
      } else {
        setConnectionState("disconnected");
      }
    });

    ws.addEventListener("error", () => {
      // The close event will fire after error, which handles reconnection.
      // Nothing extra needed here.
    });
  }, [matchId, flushQueue]);

  // Connect on mount / matchId change
  useEffect(() => {
    intentionalCloseRef.current = false;
    retryCountRef.current = 0;
    queueRef.current = [];
    setConnectionState("connecting");
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const send = useCallback((msg: ClientMessage) => {
    if (intentionalCloseRef.current) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      // Buffer while connecting/reconnecting
      queueRef.current.push(msg);
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setConnectionState("disconnected");
  }, []);

  return { send, connectionState, disconnect };
}
