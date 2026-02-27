"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ── Win95 border helpers ─────────────────────────────────────────────
const RAISED =
  "border-2 border-t-[#ffffff] border-l-[#ffffff] border-b-[#808080] border-r-[#808080]";
const SUNKEN =
  "border-2 border-t-[#808080] border-l-[#808080] border-b-[#ffffff] border-r-[#ffffff]";
const PRESSED =
  "border-2 border-t-[#808080] border-l-[#808080] border-b-[#ffffff] border-r-[#ffffff]";

// ── Types ────────────────────────────────────────────────────────────
interface Player {
  username: string;
  status: "online" | "in_game";
}

interface Invite {
  inviteId: string;
  from: string;
  to: string;
  status?: "pending" | "accepted";
  matchId?: string;
}

const POLL_INTERVAL = 3000;

export default function MatchmakingLobby() {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────
  const [players, setPlayers] = useState<Player[]>([]);
  const [sentInvite, setSentInvite] = useState<{
    inviteId: string;
    target: string;
  } | null>(null);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // username or inviteId being acted on

  // Refs for stable polling callbacks
  const sentInviteRef = useRef(sentInvite);
  useEffect(() => {
    sentInviteRef.current = sentInvite;
  }, [sentInvite]);

  // Mock simulation timeouts — cleared on unmount or cancel
  const mockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (mockTimerRef.current) clearTimeout(mockTimerRef.current);
    };
  }, []);

  // ── Fetch players ────────────────────────────────────────────────
  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/matchmaking/players");
      if (!res.ok) return;
      const data = (await res.json()) as { players: Player[] };
      setPlayers(data.players);
    } catch {
      /* silent — will retry on next poll */
    }
  }, []);

  // ── Fetch invitations ────────────────────────────────────────────
  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/matchmaking/invite");
      if (!res.ok) return;
      const data = (await res.json()) as {
        sent: Invite[];
        received: Invite[];
      };

      // Check if our outgoing invite was accepted (backend returns status + matchId)
      const currentSent = sentInviteRef.current;
      if (currentSent) {
        const accepted = data.sent.find(
          (i) => i.inviteId === currentSent.inviteId && i.status === "accepted" && i.matchId,
        );
        if (accepted) {
          setSentInvite(null);
          router.push(`/multiplayer/game?matchId=${accepted.matchId}`);
          return;
        }
        // If the invite disappeared entirely (rejected), clear it
        const stillExists = data.sent.some(
          (i) => i.inviteId === currentSent.inviteId,
        );
        if (!stillExists) {
          setSentInvite(null);
        }
      }

      // Merge server invites with client-side mock invites (mock IDs start with "mock_")
      setReceivedInvites((prev) => {
        const mockInvites = prev.filter((i) => i.inviteId.startsWith("mock_"));
        const serverIds = new Set(data.received.map((i) => i.inviteId));
        const kept = mockInvites.filter((i) => !serverIds.has(i.inviteId));
        return [...data.received, ...kept];
      });
    } catch {
      /* silent */
    }
  }, [router]);

  // ── Polling ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchPlayers();
    fetchInvites();
    const id = setInterval(() => {
      fetchPlayers();
      fetchInvites();
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchPlayers, fetchInvites]);

  // ── Send invite ──────────────────────────────────────────────────
  async function handleInvite(targetUsername: string) {
    setBusy(targetUsername);
    setError(null);
    try {
      const res = await fetch("/api/matchmaking/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUsername }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to send invite.");
        return;
      }
      const data = (await res.json()) as { inviteId: string };
      setSentInvite({ inviteId: data.inviteId, target: targetUsername });

      // ── Mock simulation triggers ──────────────────────────────
      if (data.inviteId.startsWith("inv_")) {
        if (targetUsername === "sweeper42") {
          // Scenario A: inviting sweeper42 → minehunter sends us an invite after 2s
          mockTimerRef.current = setTimeout(() => {
            setReceivedInvites((prev) => [
              ...prev,
              { inviteId: "mock_inv_minehunter", from: "minehunter", to: "" },
            ]);
          }, 2000);
        } else if (targetUsername === "flag_master") {
          // Scenario B: inviting flag_master → they "accept" after 3s
          mockTimerRef.current = setTimeout(() => {
            router.push(
              `/multiplayer/game?matchId=mock_match_${Date.now()}`,
            );
          }, 3000);
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // ── Cancel outgoing invite ───────────────────────────────────────
  function handleCancelInvite() {
    // Clear any pending mock simulation timer
    if (mockTimerRef.current) {
      clearTimeout(mockTimerRef.current);
      mockTimerRef.current = null;
    }
    // In a real implementation, we'd call a cancel endpoint.
    // For now, just clear client state.
    setSentInvite(null);
  }

  // ── Respond to invite ────────────────────────────────────────────
  async function handleRespond(inviteId: string, accept: boolean) {
    setBusy(inviteId);
    setError(null);
    try {
      const res = await fetch("/api/matchmaking/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, accept }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to respond.");
        return;
      }
      if (accept) {
        const data = (await res.json()) as { matchId: string };
        router.push(`/multiplayer/game?matchId=${data.matchId}`);
        return;
      }
      // Rejected — remove from list
      setReceivedInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      className={`${RAISED} bg-ms-silver flex flex-col min-w-[320px] max-w-[420px] w-full`}
    >
      {/* Title bar */}
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Multiplayer Lobby
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Error banner */}
        {error && (
          <p className="text-red-700 text-xs bg-white px-2 py-1">{error}</p>
        )}

        {/* ── Incoming invitations ────────────────────────────────── */}
        {receivedInvites.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">Incoming Invitations</p>
            {receivedInvites.map((inv) => (
              <div
                key={inv.inviteId}
                className={`${SUNKEN} bg-white px-3 py-2 flex items-center justify-between`}
              >
                <span className="text-sm font-mono">
                  {inv.from} wants to play!
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => handleRespond(inv.inviteId, true)}
                    disabled={busy === inv.inviteId}
                    className={`${RAISED} bg-ms-silver px-3 py-0.5 text-xs font-bold cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespond(inv.inviteId, false)}
                    disabled={busy === inv.inviteId}
                    className={`${RAISED} bg-ms-silver px-3 py-0.5 text-xs font-bold cursor-default disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                  >
                    Reject
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Outgoing invite (waiting state) ─────────────────────── */}
        {sentInvite && (
          <div
            className={`${SUNKEN} bg-white px-3 py-2 flex items-center justify-between`}
          >
            <span className="text-sm font-mono">
              Waiting for {sentInvite.target}...
            </span>
            <button
              onClick={handleCancelInvite}
              className={`${RAISED} bg-ms-silver px-3 py-0.5 text-xs font-bold cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Online players list ─────────────────────────────────── */}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">Online Players</p>
          <div
            className={`${SUNKEN} bg-white min-h-[120px] max-h-[240px] overflow-y-auto`}
          >
            {players.length === 0 ? (
              <p className="text-sm text-ms-dark px-3 py-2">
                No players online.
              </p>
            ) : (
              players.map((player) => {
                const inGame = player.status === "in_game";
                const invited = sentInvite?.target === player.username;
                return (
                  <div
                    key={player.username}
                    className="flex items-center justify-between px-3 py-1 hover:bg-[#000080] hover:text-white group"
                  >
                    <span
                      className={`text-sm font-mono ${inGame ? "text-ms-dark group-hover:text-gray-400" : ""}`}
                    >
                      {player.username}
                      {inGame && (
                        <span className="text-xs ml-2 italic">(In Game)</span>
                      )}
                    </span>
                    {!inGame && !invited && !sentInvite && (
                      <button
                        onClick={() => handleInvite(player.username)}
                        disabled={busy === player.username}
                        className={`${busy === player.username ? PRESSED : RAISED} bg-ms-silver px-3 py-0.5 text-xs font-bold cursor-default text-black disabled:opacity-60 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
