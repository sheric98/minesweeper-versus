import { ROWS, COLS, MINE_COUNT, Board, createEmptyBoard } from "./minesweeper";
import { isSolvable } from "./solver";

interface SolverBoard {
  isMine: boolean;
  adjacentMines: number;
}

function generateRandomBoard(): SolverBoard[][] {
  const allPositions: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      allPositions.push([r, c]);
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

function findZeroCells(board: SolverBoard[][]): [number, number][] {
  const result: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!board[r][c].isMine && board[r][c].adjacentMines === 0) {
        result.push([r, c]);
      }
    }
  }
  return result;
}

function uniqueStartingRegions(board: SolverBoard[][], zeroCells: [number, number][]): [number, number][] {
  const visited = new Set<string>();
  const representatives: [number, number][] = [];

  for (const [r, c] of zeroCells) {
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    representatives.push([r, c]);

    // BFS to mark all connected zero cells in this region
    const queue: [number, number][] = [[r, c]];
    while (queue.length > 0) {
      const [cr, cc] = queue.shift()!;
      const ck = `${cr},${cc}`;
      if (visited.has(ck)) continue;
      visited.add(ck);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cr + dr;
          const nc = cc + dc;
          if (
            nr >= 0 && nr < ROWS &&
            nc >= 0 && nc < COLS &&
            !visited.has(`${nr},${nc}`) &&
            !board[nr][nc].isMine &&
            board[nr][nc].adjacentMines === 0
          ) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  return representatives;
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

export function generateSolvableBoard(maxAttempts = 1000): SolvableBoardResult {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board = generateRandomBoard();
    const zeroCells = findZeroCells(board);
    if (zeroCells.length === 0) continue;

    const representatives = uniqueStartingRegions(board, zeroCells);
    // Shuffle representatives
    for (let i = representatives.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [representatives[i], representatives[j]] = [representatives[j], representatives[i]];
    }

    for (const [r, c] of representatives) {
      if (isSolvable(board, r, c)) {
        return {
          board: toGameBoard(board),
          startingSquare: { row: r, col: c },
        };
      }
    }
  }

  // Fallback (extremely unlikely)
  const board = generateRandomBoard();
  const zeroCells = findZeroCells(board);
  if (zeroCells.length > 0) {
    const idx = Math.floor(Math.random() * zeroCells.length);
    return {
      board: toGameBoard(board),
      startingSquare: { row: zeroCells[idx][0], col: zeroCells[idx][1] },
    };
  }
  return {
    board: toGameBoard(board),
    startingSquare: { row: 0, col: 0 },
  };
}
