import { ROWS, COLS, MINE_COUNT, Board, createEmptyBoard } from "./minesweeper";
import { cellKey, type Cell, type SolverBoard, Solver, PerfectSolver, ProbabilisticSolver, BasicSolver, SubsetSolver } from "./solver";
import type { NoGuessDifficulty } from "@/app/components/DifficultySelector";

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

function isSolvableBy(board: SolverBoard[][], startRow: number, startCol: number, solver: Solver): boolean {
  const height = board.length;
  const width = board[0].length;
  const numMines = board.flat().filter(c => c.isMine).length;
  const totalSafe = height * width - numMines;

  const state: (string | number)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "unknown")
  );
  let revealedCount = 0;

  function revealFloodFill(r: number, c: number): Map<string, number> {
    const queue: Cell[] = [[r, c]];
    const revealed = new Map<string, number>();
    while (queue.length > 0) {
      const [rr, cc] = queue.shift()!;
      if (state[rr][cc] !== "unknown") continue;
      state[rr][cc] = board[rr][cc].adjacentMines;
      revealedCount++;
      revealed.set(cellKey(rr, cc), board[rr][cc].adjacentMines);
      if (board[rr][cc].adjacentMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = rr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < height && nc >= 0 && nc < width && state[nr][nc] === "unknown") {
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
    return revealed;
  }

  let newlyRevealed = revealFloodFill(startRow, startCol);

  while (newlyRevealed.size > 0) {
    const safeCells = solver.findSolvedSquares(newlyRevealed);

    const allRevealed = new Map<string, number>();
    for (const [r, c] of safeCells) {
      const revealed = revealFloodFill(r, c);
      for (const [key, val] of revealed) {
        allRevealed.set(key, val);
      }
    }

    newlyRevealed = allRevealed;
  }

  return revealedCount === totalSafe;
}

type SolverFactory = () => Solver;

const DIFFICULTY_SOLVERS: Record<NoGuessDifficulty, { target: SolverFactory; lower?: SolverFactory }> = {
  beginner: {
    target: () => new BasicSolver(ROWS, COLS),
  },
  intermediate: {
    target: () => new SubsetSolver(ROWS, COLS),
    lower: () => new BasicSolver(ROWS, COLS),
  },
  advanced: {
    target: () => new ProbabilisticSolver(ROWS, COLS, MINE_COUNT),
    lower: () => new SubsetSolver(ROWS, COLS),
  },
  expert: {
    target: () => new PerfectSolver(ROWS, COLS, MINE_COUNT),
    lower: () => new ProbabilisticSolver(ROWS, COLS, MINE_COUNT),
  },
};

export function generateSolvableBoard(startRow: number, startCol: number, difficulty: NoGuessDifficulty = "expert", maxAttempts = Infinity): SolvableBoardResult {
  const { target, lower } = DIFFICULTY_SOLVERS[difficulty];
  const t0 = performance.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board = generateRandomBoard(startRow, startCol);

    if (!isSolvableBy(board, startRow, startCol, target())) continue;
    if (lower && isSolvableBy(board, startRow, startCol, lower())) continue;

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`[board-gen] ${difficulty}: found in ${attempt + 1} attempts, ${elapsed}ms`);

    return {
      board: toGameBoard(board),
      startingSquare: { row: startRow, col: startCol },
    };
  }

  // Fallback (extremely unlikely)
  const board = generateRandomBoard(startRow, startCol);
  return {
    board: toGameBoard(board),
    startingSquare: { row: startRow, col: startCol },
  };
}
