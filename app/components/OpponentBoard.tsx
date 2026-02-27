import React from "react";
import { ROWS, COLS } from "@/app/lib/minesweeper";

interface OpponentBoardProps {
  revealedCells: Set<string>; // "row-col" keys
}

const OpponentBoard = React.memo(function OpponentBoard({ revealedCells }: OpponentBoardProps) {
  return (
    <div
      className="border-2 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 0.5rem)` }}
    >
      {Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          const isRevealed = revealedCells.has(`${r}-${c}`);
          return (
            <div
              key={`${r}-${c}`}
              className={
                isRevealed
                  ? "w-2 h-2 bg-[#e0e0e0] border border-[#b0b0b0]"
                  : "w-2 h-2 bg-[#c0c0c0] border border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]"
              }
            />
          );
        }),
      )}
    </div>
  );
});

OpponentBoard.displayName = "OpponentBoard";
export default OpponentBoard;
