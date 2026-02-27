"use client";

import { useRouter } from "next/navigation";

const RAISED = "border-2 border-t-[#ffffff] border-l-[#ffffff] border-b-[#808080] border-r-[#808080]";

interface GameOverModalProps {
  winner: string;
  playerName: string;
  yourTimeMs: number;
  opponentTimeMs: number;
  opponentDisconnected?: boolean;
  loserPercent?: number;
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

          <button
            className={`${RAISED} bg-ms-silver px-4 py-1 text-sm font-bold self-end cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
            onClick={() => router.push("/multiplayer")}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
