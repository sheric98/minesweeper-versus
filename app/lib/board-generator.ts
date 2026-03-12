import { ROWS, COLS, MINE_COUNT, Board, createEmptyBoard } from "./minesweeper";
import { isSolvable } from "./solver";

interface SolverBoard {
  isMine: boolean;
  adjacentMines: number;
}

function generateRandomBoard(startRow: number, startCol: number): SolverBoard[][] {
  // Build safe zone around starting square (the cell + all 8 neighbors)
  const safeZone = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = startRow + dr;
      const nc = startCol + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        safeZone.add(`${nr},${nc}`);
      }
    }
  }

  const allPositions: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!safeZone.has(`${r},${c}`)) {
        allPositions.push([r, c]);
      }
    }
  }

  // Fisher-Yates shuffle then take first MINE_COUNT
  for (let i = allPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
  }

  const mines = new Set<string>();
  for (let i = 0; i < MINE_COUNT; i++) {
    mines.add(`${allPositions[i][0]},${allPositions[i][1]}`);
  }

  const board: SolverBoard[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      isMine: mines.has(`${r},${c}`),
      adjacentMines: 0,
    }))
  );

  // Compute adjacency
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].isMine) {
            count++;
          }
        }
      }
      board[r][c].adjacentMines = count;
    }
  }

  return board;
}

/** Convert solver board format to game Board format */
function toGameBoard(solverBoard: SolverBoard[][]): Board {
  const board = createEmptyBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board[r][c].isMine = solverBoard[r][c].isMine;
      board[r][c].adjacentMines = solverBoard[r][c].adjacentMines;
    }
  }
  return board;
}

export interface SolvableBoardResult {
  board: Board;
  startingSquare: { row: number; col: number };
}

export function generateSolvableBoard(startRow: number, startCol: number, maxAttempts = 1000): SolvableBoardResult {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board = generateRandomBoard(startRow, startCol);
    if (isSolvable(board, startRow, startCol)) {
      return {
        board: toGameBoard(board),
        startingSquare: { row: startRow, col: startCol },
      };
    }
  }

  // Fallback (extremely unlikely)
  const board = generateRandomBoard(startRow, startCol);
  return {
    board: toGameBoard(board),
    startingSquare: { row: startRow, col: startCol },
  };
}
