import React from "react";
import { Cell as CellType } from "@/app/lib/minesweeper";

const NUMBER_COLORS: Record<number, string> = {
  1: "text-blue-700",
  2: "text-green-700",
  3: "text-red-600",
  4: "text-blue-900",
  5: "text-red-900",
  6: "text-cyan-600",
  7: "text-black",
  8: "text-gray-500",
};

const RAISED = "border-2 border-t-[#d8d8d8] border-l-[#d8d8d8] border-b-[#a0a0a0] border-r-[#a0a0a0]";
const SUNKEN = "border border-[#b0b0b0]";

interface CellProps {
  cell: CellType;
  row: number;
  col: number;
  sunk: boolean;
  onLeftClick: (row: number, col: number) => void;
  onRightClick: (e: React.MouseEvent, row: number, col: number) => void;
  onCellMouseEnter: (row: number, col: number) => void;
}

const CellComponent = React.memo(function Cell({
  cell,
  row,
  col,
  sunk,
  onLeftClick,
  onRightClick,
  onCellMouseEnter,
}: CellProps) {
  const { state, adjacentMines } = cell;

  const handleClick = () => onLeftClick(row, col);
  const handleContextMenu = (e: React.MouseEvent) => onRightClick(e, row, col);
  const handleMouseEnter = () => onCellMouseEnter(row, col);

  const base = "w-7 h-7 flex items-center justify-center text-lg font-bold font-mono select-none box-border overflow-hidden";

  if (state === "unrevealed") {
    return (
      <div
        className={`${base} ${sunk ? SUNKEN : RAISED} bg-[#c0c0c0] cursor-default`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
      />
    );
  }

  if (state === "flagged") {
    return (
      <div
        className={`${base} ${RAISED} bg-[#c0c0c0] cursor-default`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
      >
        🚩
      </div>
    );
  }

  if (state === "revealed") {
    const label = adjacentMines > 0 ? String(adjacentMines) : "";
    const color = adjacentMines > 0 ? NUMBER_COLORS[adjacentMines] : "";
    return (
      <div
        className={`${base} ${SUNKEN} bg-[#e0e0e0] ${color}`}
        onMouseEnter={handleMouseEnter}
      >
        {label}
      </div>
    );
  }

  if (state === "mine") {
    return (
      <div className={`${base} ${SUNKEN} bg-[#e0e0e0]`} onMouseEnter={handleMouseEnter}>
        💣
      </div>
    );
  }

  if (state === "mine-clicked") {
    return (
      <div className={`${base} ${SUNKEN} bg-red-500`} onMouseEnter={handleMouseEnter}>
        💣
      </div>
    );
  }

  // mine-wrong: flagged cell that was not a mine
  return (
    <div className={`${base} ${RAISED} bg-[#c0c0c0] relative`} onMouseEnter={handleMouseEnter}>
      <span>🚩</span>
      <span className="absolute inset-0 flex items-center justify-center text-red-600 text-sm font-bold">
        ✕
      </span>
    </div>
  );
});

CellComponent.displayName = "Cell";
export default CellComponent;
