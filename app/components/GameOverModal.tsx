"use client";

import { useRouter } from "next/navigation";
import type { EloChange } from "@/app/lib/multiplayer-types";
import { RAISED_OUTER } from "@/app/lib/win95";

const RAISED = RAISED_OUTER;
const BUTTON = `${RAISED} bg-ms-silver px-4 py-1 text-sm font-bold cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`;

export type RematchState = "idle" | "requested" | "waiting" | "declined";

interface GameOverModalProps {
  winner: string;
  playerName: string;
  yourTimeMs: number;
  opponentTimeMs: number;
  opponentDisconnected?: boolean;
  loserPercent?: number;
  playerWins: number;
  opponentWins: number;
  h2hRecord: { wins: number; losses: number } | null;
  eloChange?: EloChange | null;
  rematchState: RematchState;
  onRematchRequest: () => void;
  onRematchDecline: () => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function GameOverModal({
  winner,
  playerName,
  yourTimeMs,
  opponentTimeMs,
  opponentDisconnected,
  loserPercent,
  playerWins,
  opponentWins,
  h2hRecord,
  eloChange,
  rematchState,
  onRematchRequest,
  onRematchDecline,
}: GameOverModalProps) {
  const router = useRouter();
  const didWin = winner === playerName || winner === "You";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#c0c0c0]/70 z-20">
      <div className={`${RAISED} bg-ms-silver flex flex-col min-w-[280px] max-w-[360px] w-full`}>
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
          Game Over
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="text-center">
            {didWin ? (
              <>
                <p className="text-2xl font-bold text-green-700">You win!</p>
                {opponentDisconnected && (
                  <p className="text-xs text-ms-dark mt-1">Opponent disconnected</p>
                )}
                {loserPercent != null && !opponentDisconnected && (
                  <p className="text-xs text-ms-dark mt-1">Opponent cleared {loserPercent}%</p>
                )}
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-red-700">You lose.</p>
                {loserPercent != null && (
                  <p className="text-xs text-ms-dark mt-1">You cleared {loserPercent}% of the board</p>
                )}
              </>
            )}
          </div>

          <div className="text-sm flex flex-col gap-1">
            {yourTimeMs > 0 && (
              <p>Your time: <span className="font-mono font-bold">{formatTime(yourTimeMs)}</span></p>
            )}
            {opponentTimeMs > 0 && (
              <p>Opponent: <span className="font-mono font-bold">{formatTime(opponentTimeMs)}</span></p>
            )}
          </div>

          {/* Series score (shown from second game onward) */}
          {(playerWins + opponentWins > 1) && (
            <div className="text-center font-mono text-sm border-t border-[#a0a0a0] pt-2">
              Series: <span className="font-bold text-blue-600">{playerWins}</span>
              {" - "}
              <span className="font-bold text-rose-600">{opponentWins}</span>
            </div>
          )}

          {/* Head-to-head record (Google-authenticated players only) */}
          {h2hRecord && (
            <div className="text-center font-mono text-xs border-t border-[#a0a0a0] pt-2 text-ms-dark">
              All-time H2H: <span className="font-bold text-blue-600">{h2hRecord.wins}</span>
              {" - "}
              <span className="font-bold text-rose-600">{h2hRecord.losses}</span>
            </div>
          )}

          {/* Elo rating change (Google-authenticated players only) */}
          {eloChange && (
            <div className="text-center font-mono text-sm border-t border-[#a0a0a0] pt-2">
              <span className="text-xs text-ms-dark">Elo: </span>
              <span className="font-bold">{eloChange.oldRating}</span>
              <span className="text-ms-dark"> → </span>
              <span className="font-bold">{eloChange.newRating}</span>
              <span className={`ml-1 font-bold ${eloChange.change >= 0 ? "text-green-700" : "text-red-700"}`}>
                ({eloChange.change >= 0 ? "+" : ""}{eloChange.change})
              </span>
            </div>
          )}

          {/* Rematch UI */}
          <div className="flex flex-col gap-2 items-end">
            {rematchState === "idle" && (
              <div className="flex gap-2">
                <button className={BUTTON} onClick={onRematchRequest}>
                  Rematch
                </button>
                <button className={BUTTON} onClick={() => router.push("/multiplayer")}>
                  Return to Lobby
                </button>
              </div>
            )}

            {rematchState === "requested" && (
              <div className="flex flex-col gap-2 items-end">
                <p className="text-sm font-bold text-[#000080]">Opponent wants a rematch!</p>
                <div className="flex gap-2">
                  <button className={BUTTON} onClick={onRematchRequest}>
                    Accept
                  </button>
                  <button className={BUTTON} onClick={onRematchDecline}>
                    Decline
                  </button>
                </div>
              </div>
            )}

            {rematchState === "waiting" && (
              <div className="flex flex-col gap-2 items-end">
                <p className="text-sm text-ms-dark">Waiting for opponent...</p>
                <button className={BUTTON} onClick={() => router.push("/multiplayer")}>
                  Cancel
                </button>
              </div>
            )}

            {rematchState === "declined" && (
              <button className={BUTTON} onClick={() => router.push("/multiplayer")}>
                Return to Lobby
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
