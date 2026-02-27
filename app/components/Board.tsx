import { Board, GamePhase, COLS } from "@/app/lib/minesweeper";
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
}

export default function BoardComponent({ board, sunkCells, onCellLeftClick, onCellRightClick, onCellMouseEnter, onBoardMouseLeave, onBoardMouseDown, onBoardMouseUp }: BoardProps) {
  return (
    <div
      className="border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1.75rem)` }}
      onMouseLeave={onBoardMouseLeave}
      onContextMenu={e => e.preventDefault()}
      onMouseDown={onBoardMouseDown}
      onMouseUp={onBoardMouseUp}
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
          />
        ))
      )}
    </div>
  );
}
