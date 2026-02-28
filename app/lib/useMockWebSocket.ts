import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react";
import type { ClientMessage, ServerMessage, ConnectionState } from "./multiplayer-types";
import { generateBoard, revealCell, ROWS, COLS, MINE_COUNT } from "./minesweeper";
import { encodeBoard } from "./multiplayer-utils";

// Re-export for backwards compatibility
export type { ConnectionState } from "./multiplayer-types";

interface UseMockWebSocketOptions {
  matchId: string;
  onMessage: (msg: ServerMessage) => void;
}

interface UseMockWebSocketReturn {
  send: (msg: ClientMessage) => void;
  connectionState: ConnectionState;
  disconnect: () => void;
}

const TOTAL_SAFE_CELLS = ROWS * COLS - MINE_COUNT;

export default function useMockWebSocket({
  matchId,
  onMessage,
}: UseMockWebSocketOptions): UseMockWebSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  // Store onMessage in a ref so the simulated sequence never goes stale
  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => {
    onMessageRef.current = onMessage;
  });

  // Track all timers for cleanup
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const disconnectedRef = useRef(false);

  // Opponent simulation state
  const opponentSafeCellsRef = useRef<{ row: number; col: number }[]>([]);
  const opponentRevealedRef = useRef(0);
  const opponentDeathCountRef = useRef(0);
  const gameStartTimeRef = useRef(0);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    if (disconnectedRef.current) return;
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const clearAll = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    for (const id of intervalsRef.current) clearInterval(id);
    timersRef.current = [];
    intervalsRef.current = [];
  }, []);

  // Reusable game simulation: match_found → countdown → game_start → opponent moves
  const startGameSimulation = useCallback(() => {
    // Pick a random starting square
    const startRow = Math.floor(Math.random() * ROWS);
    const startCol = Math.floor(Math.random() * COLS);

    // Send match_found
    onMessageRef.current({
      type: "match_found",
      matchId,
      opponent: "CPU_Player",
      startingSquare: [startRow, startCol],
    });

    // Countdown 5, 4, 3, 2, 1
    for (let i = 5; i >= 1; i--) {
      addTimeout(() => {
        onMessageRef.current({ type: "countdown", secondsRemaining: i });
      }, (5 - i + 1) * 1000);
    }

    // After countdown (6s total from match_found), generate board and start game
    addTimeout(() => {
      const board = generateBoard(startRow, startCol);

      // Reveal starting square to get the initial flood-fill
      const revealedBoard = revealCell(board, startRow, startCol);

      // Build list of safe cells the opponent can "reveal" (excluding already-revealed ones)
      const safeCells: { row: number; col: number }[] = [];
      let alreadyRevealed = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!board[r][c].isMine) {
            if (revealedBoard[r][c].state === "revealed") {
              alreadyRevealed++;
            } else {
              safeCells.push({ row: r, col: c });
            }
          }
        }
      }

      // Shuffle safe cells for random opponent reveal order
      for (let i = safeCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [safeCells[i], safeCells[j]] = [safeCells[j], safeCells[i]];
      }

      opponentSafeCellsRef.current = safeCells;
      opponentRevealedRef.current = alreadyRevealed;
      opponentDeathCountRef.current = 0;
      gameStartTimeRef.current = Date.now();

      // Send the encoded board (before revealing starting square — client will do the reveal)
      onMessageRef.current({ type: "game_start", board: encodeBoard(board) });

      // Start opponent simulation
      const opponentTick = () => {
        if (disconnectedRef.current) return;
        if (opponentSafeCellsRef.current.length === 0) return;

        // 10% chance of hitting a mine
        if (Math.random() < 0.1) {
          opponentDeathCountRef.current++;
          onMessageRef.current({
            type: "opponent_hit_mine",
            deathCount: opponentDeathCountRef.current,
          });
          // Schedule next tick after a delay (simulating cooldown)
          addTimeout(opponentTick, 2000 + Math.random() * 1000);
          return;
        }

        // Reveal 1-3 cells per tick (simulating BFS flood-fill)
        const batchSize = Math.min(
          1 + Math.floor(Math.random() * 3),
          opponentSafeCellsRef.current.length,
        );
        const cells: { row: number; col: number }[] = [];
        for (let i = 0; i < batchSize; i++) {
          cells.push(opponentSafeCellsRef.current.shift()!);
        }
        opponentRevealedRef.current += batchSize;

        onMessageRef.current({
          type: "opponent_progress",
          cells,
          revealedCount: opponentRevealedRef.current,
        });

        // Check if opponent won
        if (opponentRevealedRef.current >= TOTAL_SAFE_CELLS) {
          onMessageRef.current({
            type: "game_over",
            winner: "CPU_Player",
            yourTimeMs: Date.now() - gameStartTimeRef.current,
            opponentTimeMs: Date.now() - gameStartTimeRef.current,
          });
          return;
        }

        // Schedule next tick with random delay
        addTimeout(opponentTick, 200 + Math.random() * 300);
      };

      // Start opponent after a brief delay
      addTimeout(opponentTick, 500);
    }, 6000);
  }, [matchId, addTimeout]);

  // Start simulated sequence on mount
  useEffect(() => {
    disconnectedRef.current = false;

    // Step 1: Connect after 300ms
    addTimeout(() => {
      setConnectionState("connected");
      startGameSimulation();
    }, 300);

    return () => {
      disconnectedRef.current = true;
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const send = useCallback((msg: ClientMessage) => {
    if (disconnectedRef.current) return;
    if (msg.type === "game_complete") {
      // Player won — stop opponent simulation and send game_over
      clearAll();
      onMessageRef.current({
        type: "game_over",
        winner: "You",
        yourTimeMs: msg.timeMs,
        opponentTimeMs: Date.now() - gameStartTimeRef.current,
      });
    } else if (msg.type === "rematch_request") {
      // Simulate opponent accepting rematch after a short delay
      clearAll();
      addTimeout(() => {
        onMessageRef.current({ type: "rematch_accepted" });
        // Start a new game simulation after a brief pause
        addTimeout(() => {
          startGameSimulation();
        }, 300);
      }, 500 + Math.random() * 500);
    }
    // Other messages are acknowledged but not processed in mock mode
  }, [clearAll, addTimeout, startGameSimulation]);

  const disconnect = useCallback(() => {
    disconnectedRef.current = true;
    clearAll();
    setConnectionState("disconnected");
  }, [clearAll]);

  return { send, connectionState, disconnect };
}
