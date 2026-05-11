import React from "react";
import { Cell as CellType } from "@/app/lib/minesweeper";
import { RAISED_INNER } from "@/app/lib/win95";

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

const RAISED = RAISED_INNER;
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

  const base = "flex items-center justify-center font-bold font-mono select-none box-border overflow-hidden";
  const sizeStyle: React.CSSProperties = {
    width: "var(--cell-size)",
    height: "var(--cell-size)",
    fontSize: "calc(var(--cell-size) * 0.65)",
  };

  if (state === "unrevealed") {
    return (
      <div
        className={`${base} ${sunk ? SUNKEN : RAISED} bg-[#c0c0c0] cursor-default`}
        style={sizeStyle}
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
        style={sizeStyle}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
      >
        🚩
      </div>
    );
  }

  if (state === "question") {
    return (
      <div
        className={`${base} ${RAISED} bg-[#c0c0c0] cursor-default text-blue-700`}
        style={sizeStyle}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
      >
        ?
      </div>
    );
  }

  if (state === "revealed") {
    const label = adjacentMines > 0 ? String(adjacentMines) : "";
    const color = adjacentMines > 0 ? NUMBER_COLORS[adjacentMines] : "";
    return (
      <div
        className={`${base} ${SUNKEN} bg-[#e0e0e0] ${color}`}
        style={sizeStyle}
        onMouseEnter={handleMouseEnter}
      >
        {label}
      </div>
    );
  }

  if (state === "mine") {
    return (
      <div className={`${base} ${SUNKEN} bg-[#e0e0e0]`} style={sizeStyle} onMouseEnter={handleMouseEnter}>
        💣
      </div>
    );
  }

  if (state === "mine-clicked") {
    return (
      <div className={`${base} ${SUNKEN} bg-red-500`} style={sizeStyle} onMouseEnter={handleMouseEnter}>
        💣
      </div>
    );
  }

  return (
    <div className={`${base} ${RAISED} bg-[#c0c0c0] relative`} style={sizeStyle} onMouseEnter={handleMouseEnter}>
      <span>🚩</span>
      <span
        className="absolute inset-0 flex items-center justify-center text-red-600 font-bold"
        style={{ fontSize: "calc(var(--cell-size) * 0.5)" }}
      >
        ✕
      </span>
    </div>
  );
});

CellComponent.displayName = "Cell";
export default CellComponent;
