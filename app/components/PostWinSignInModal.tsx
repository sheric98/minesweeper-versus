"use client";

import { useEffect } from "react";
import { RAISED_OUTER } from "@/app/lib/win95";

const RAISED = RAISED_OUTER;

interface Props {
  onClose: () => void;
  onSignIn: () => void;
}

export default function PostWinSignInModal({ onClose, onSignIn }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#c0c0c0]/70"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`${RAISED} bg-ms-silver flex flex-col min-w-[280px] max-w-[360px] w-full`}>
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none flex items-center">
          <span className="flex-1">Save your time?</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`${RAISED} bg-ms-silver text-black text-xs font-bold leading-none w-5 h-5 flex items-center justify-center cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <p className="text-sm">
            You made the top 10! Sign in with Google to save your time to the leaderboard.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className={`${RAISED} bg-ms-silver px-4 py-1.5 text-sm font-bold text-center cursor-default hover:brightness-95 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
