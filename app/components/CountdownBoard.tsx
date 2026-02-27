import { ROWS, COLS } from "@/app/lib/minesweeper";

const RAISED = "border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]";

interface CountdownBoardProps {
  startingSquare: [number, number];
}

export default function CountdownBoard({ startingSquare }: CountdownBoardProps) {
  const [startRow, startCol] = startingSquare;

  return (
    <div
      className="border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1.75rem)` }}
    >
      {Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          const isStart = r === startRow && c === startCol;
          return (
            <div
              key={`${r}-${c}`}
              className={`w-7 h-7 box-border ${RAISED} ${isStart ? "" : "bg-[#c0c0c0]"}`}
              style={isStart ? { animation: "pulse-green 0.8s ease-in-out infinite" } : undefined}
            />
          );
        })
      )}
    </div>
  );
}
