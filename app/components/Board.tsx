import { Board, GamePhase } from "@/app/lib/minesweeper";
import Cell from "@/app/components/Cell";

interface BoardProps {
  board: Board;
  phase: GamePhase;
  sunkCells: Set<string>;
  onCellLeftClick: (row: number, col: number) => void;
  onCellRightClick: (e: React.MouseEvent, row: number, col: number) => void;
  onCellMouseEnter: (row: number, col: number) => void;
  onBoardMouseLeave: () => void;
  onBoardMouseDown: (e: React.MouseEvent) => void;
  onBoardMouseUp: (e: React.MouseEvent) => void;
  onBoardDoubleClick?: (e: React.MouseEvent) => void;
  onCellTouchStart: (e: React.TouchEvent, row: number, col: number) => void;
  onCellTouchEnd: (e: React.TouchEvent, row: number, col: number) => void;
  onCellTouchMove: (e: React.TouchEvent) => void;
}

export default function BoardComponent({ board, sunkCells, onCellLeftClick, onCellRightClick, onCellMouseEnter, onBoardMouseLeave, onBoardMouseDown, onBoardMouseUp, onBoardDoubleClick, onCellTouchStart, onCellTouchEnd, onCellTouchMove }: BoardProps) {
  return (
    <div
      className="touch-manipulation border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${board[0].length}, var(--cell-size))`, WebkitTouchCallout: "none" } as React.CSSProperties}
      onMouseLeave={onBoardMouseLeave}
      onContextMenu={e => e.preventDefault()}
      onMouseDown={onBoardMouseDown}
      onMouseUp={onBoardMouseUp}
      onDoubleClick={onBoardDoubleClick}
    >
      {board.map((row, r) =>
        row.map((cell, c) => (
          <Cell
            key={`${r}-${c}`}
            cell={cell}
            row={r}
            col={c}
            sunk={sunkCells.has(`${r}-${c}`)}
            onLeftClick={onCellLeftClick}
            onRightClick={onCellRightClick}
            onCellMouseEnter={onCellMouseEnter}
            onTouchStart={onCellTouchStart}
            onTouchEnd={onCellTouchEnd}
            onTouchMove={onCellTouchMove}
          />
        ))
      )}
    </div>
  );
}
