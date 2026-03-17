import { COLS } from "@/app/lib/minesweeper";
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

export type NoGuessDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

const DIFFICULTIES: { value: NoGuessDifficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

interface DifficultySelectorProps {
  difficulty: NoGuessDifficulty;
  onDifficultyChange: (d: NoGuessDifficulty) => void;
}

export default function DifficultySelector({ difficulty, onDifficultyChange }: DifficultySelectorProps) {
  return (
    <div
      className="flex"
      style={{ width: `calc(${COLS} * 1.75rem + 8px)` }}
    >
      {DIFFICULTIES.map(({ value, label }) => {
        const isActive = value === difficulty;
        return (
          <button
            key={value}
            onClick={() => onDifficultyChange(value)}
            className={`flex-1 px-2 py-1 text-xs font-bold cursor-pointer bg-[#c0c0c0] ${isActive ? SUNKEN_INNER : RAISED_INNER}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
