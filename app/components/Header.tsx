import { GamePhase, COLS } from "@/app/lib/minesweeper";
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

const FACE: Record<GamePhase, string> = {
  idle: "🙂",
  playing: "🙂",
  won: "😎",
  lost: "😵",
};

function pad3(n: number): string {
  return String(Math.max(0, Math.min(999, n))).padStart(3, "0");
}

interface HeaderProps {
  flagsRemaining: number;
  elapsedSeconds: number;
  phase: GamePhase;
  onReset: () => void;
  accentColor?: "blue" | "red";
}

const RAISED = RAISED_INNER;
const SUNKEN_PANEL = SUNKEN_INNER;

const ACCENT_STYLES = {
  blue: "bg-slate-300 border-t-slate-200 border-l-slate-200 border-b-slate-500 border-r-slate-500",
  red: "bg-rose-200 border-t-rose-100 border-l-rose-100 border-b-rose-300 border-r-rose-300",
  default: "bg-[#c0c0c0] border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]",
};

export default function Header({ flagsRemaining, elapsedSeconds, phase, onReset, accentColor }: HeaderProps) {
  const accent = ACCENT_STYLES[accentColor ?? "default"];
  return (
    <div
      className={`flex items-center justify-between px-2 py-1.5 border-4 ${accent}`}
      style={{ width: `calc(${COLS} * 1.75rem + 8px)` }}
    >
      {/* Flag counter */}
      <div className={`${SUNKEN_PANEL} bg-black px-1 py-0.5 font-mono text-red-600 text-xl leading-none min-w-[3ch] text-right`}>
        {pad3(flagsRemaining)}
      </div>

      {/* Reset button */}
      <button
        className={`${RAISED} w-9 h-9 flex items-center justify-center text-lg bg-[#c0c0c0] cursor-pointer active:border-t-[#a0a0a0] active:border-l-[#a0a0a0] active:border-b-[#d8d8d8] active:border-r-[#d8d8d8]`}
        onClick={onReset}
        aria-label="New game"
      >
        {FACE[phase]}
      </button>

      {/* Timer */}
      <div className={`${SUNKEN_PANEL} bg-black px-1 py-0.5 font-mono text-red-600 text-xl leading-none min-w-[3ch] text-right`}>
        {pad3(elapsedSeconds)}
      </div>
    </div>
  );
}
