"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useControls } from "@/app/components/ControlsProvider";
import type { ChordTrigger, SpacebarAction } from "@/app/lib/controls";
import { RAISED_OUTER, RAISED_INNER } from "@/app/lib/win95";

const DISMISSED_KEY = "minesweeper:how-to-play-dismissed:v1";

const CHORD_HINTS: Record<ChordTrigger, string | null> = {
  "both-buttons": "Left+Right on a number clears around it",
  "middle-click": "Middle-click a number clears around it",
  "double-click": "Double-click a number clears around it",
  none: null,
};

const SPACEBAR_HINTS: Record<SpacebarAction, string | null> = {
  "flag-or-chord": "Space flags (or clears) the hovered cell",
  "flag-only": "Space flags the hovered cell",
  off: null,
};

export default function HowToPlayHint() {
  const { controls } = useControls();
  // Hidden until mount so SSR output matches the first client render.
  const [visible, setVisible] = useState(false);

  // Wrapped in Promise.resolve().then() to satisfy react-hooks/set-state-in-effect,
  // same pattern as ControlsProvider's localStorage hydration.
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        if (!localStorage.getItem(DISMISSED_KEY)) setVisible(true);
      } catch { /* storage unavailable — keep hidden */ }
    });
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch { /* storage unavailable — dismiss for this page view only */ }
  };

  const hints = [
    "Left-click reveals",
    "Right-click flags",
    CHORD_HINTS[controls.chordTrigger],
    SPACEBAR_HINTS[controls.spacebarAction],
  ].filter((h): h is string => h !== null);

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] mt-3 px-3 py-2 max-w-[calc(var(--cell-size)*30+1rem)] text-black`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 text-xs leading-5">
          <span className="font-bold">How to play:</span>{" "}
          {hints.map((hint, i) => (
            <span key={hint}>
              {i > 0 && <span className="text-[#808080]"> · </span>}
              {hint}
            </span>
          ))}
          <span className="text-[#808080]"> · </span>
          <Link href="/settings" className="underline whitespace-nowrap">
            Change controls
          </Link>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss how-to-play hint"
          className={`${RAISED_INNER} bg-[#c0c0c0] active:border-t-[#a0a0a0] active:border-l-[#a0a0a0] active:border-b-[#d8d8d8] active:border-r-[#d8d8d8] w-5 h-5 shrink-0 text-[10px] font-bold leading-none flex items-center justify-center cursor-pointer`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
