export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
}

export type BoardSizePreset = "beginner" | "intermediate" | "expert";

// Solver-depth tiers for no-guess mode (board size is always expert).
export type NoGuessDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

export const BOARD_PRESETS: Record<BoardSizePreset, BoardConfig> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

// Expert-board constants; multiplayer and the no-guess generator are fixed to this size.
export const ROWS = BOARD_PRESETS.expert.rows;
export const COLS = BOARD_PRESETS.expert.cols;
export const MINE_COUNT = BOARD_PRESETS.expert.mines;

export type CellState =
  | "unrevealed"
  | "flagged"
  | "question"
  | "revealed"
  | "mine"
  | "mine-clicked"
  | "mine-wrong";

export interface Cell {
  isMine: boolean;
  adjacentMines: number; // 0–8
  state: CellState;
}

export type Board = Cell[][];

export type GamePhase = "idle" | "playing" | "won" | "lost";

export function createEmptyBoard(config: BoardConfig = BOARD_PRESETS.expert): Board {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, (): Cell => ({
      isMine: false,
      adjacentMines: 0,
      state: "unrevealed",
    }))
  );
}

export function generateBoard(
  firstRow: number,
  firstCol: number,
  config: BoardConfig = BOARD_PRESETS.expert,
): Board {
  const { rows, cols, mines } = config;
  const board = createEmptyBoard(config);

  // Build safe zone: clicked cell + all 8 neighbors
  const safeSet = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = firstRow + dr;
      const c = firstCol + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        safeSet.add(`${r},${c}`);
      }
    }
  }

  // Collect non-safe candidate positions
  const candidates: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeSet.has(`${r},${c}`)) {
        candidates.push([r, c]);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Place mines
  for (let i = 0; i < mines; i++) {
    const [r, c] = candidates[i];
    board[r][c].isMine = true;
  }

  // Compute adjacentMines for every non-mine cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
            count++;
          }
        }
      }
      board[r][c].adjacentMines = count;
    }
  }

  return board;
}

export function revealCell(board: Board, row: number, col: number): Board {
  // Copy every cell shallowly; we'll mutate the copy
  const next: Board = board.map(r => r.map(cell => ({ ...cell })));

  const queue: [number, number][] = [[row, col]];
  const visited = new Set<string>();
  visited.add(`${row},${col}`);

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const cell = next[r][c];

    if (cell.state === "flagged") continue;
    cell.state = "revealed";

    if (cell.adjacentMines === 0 && !cell.isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          const key = `${nr},${nc}`;
          if (
            nr >= 0 && nr < next.length &&
            nc >= 0 && nc < next[0].length &&
            !visited.has(key) &&
            (next[nr][nc].state === "unrevealed" || next[nr][nc].state === "question")
          ) {
            visited.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  return next;
}

export interface ToggleFlagOptions {
  questionMarks: boolean;
}

export function toggleFlag(
  board: Board,
  row: number,
  col: number,
  opts: ToggleFlagOptions = { questionMarks: false },
): Board {
  const cell = board[row][col];
  if (cell.state !== "unrevealed" && cell.state !== "flagged" && cell.state !== "question") {
    return board;
  }

  const next: Board = board.map(r => r.map(c => ({ ...c })));
  const current = next[row][col].state;

  if (opts.questionMarks) {
    next[row][col].state =
      current === "unrevealed" ? "flagged" :
      current === "flagged"    ? "question" :
                                 "unrevealed"; // question -> unrevealed
  } else {
    next[row][col].state = current === "flagged" ? "unrevealed" : "flagged";
  }
  return next;
}

export function checkWin(board: Board): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const cell = board[r][c];
      if (!cell.isMine && cell.state !== "revealed") return false;
    }
  }
  return true;
}

export function revealAllMines(
  board: Board,
  clickedRow: number,
  clickedCol: number
): Board {
  const next: Board = board.map(r => r.map(c => ({ ...c })));

  for (let r = 0; r < next.length; r++) {
    for (let c = 0; c < next[0].length; c++) {
      const cell = next[r][c];
      if (r === clickedRow && c === clickedCol) {
        cell.state = "mine-clicked";
      } else if (cell.isMine && cell.state !== "flagged") {
        cell.state = "mine";
      } else if (!cell.isMine && cell.state === "flagged") {
        cell.state = "mine-wrong";
      }
    }
  }

  return next;
}

export function countFlags(board: Board): number {
  let count = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c].state === "flagged") count++;
    }
  }
  return count;
}

export type ChordResult =
  | { hit: false; board: Board }
  | { hit: true; board: Board };

/**
 * Chord-reveal: if the number of adjacent flags equals the cell's adjacentMines,
 * reveal all adjacent unrevealed (non-flagged) cells.
 * Returns null if conditions aren't met (not revealed, wrong flag count, no unrevealed neighbors).
 */
export function chordReveal(board: Board, row: number, col: number): ChordResult | null {
  const cell = board[row][col];
  if (cell.state !== "revealed" || cell.adjacentMines === 0) return null;

  let flagCount = 0;
  const unrevealedNeighbors: [number, number][] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= board.length || nc < 0 || nc >= board[0].length) continue;
      const neighbor = board[nr][nc];
      if (neighbor.state === "flagged") flagCount++;
      else if (neighbor.state === "unrevealed" || neighbor.state === "question") {
        unrevealedNeighbors.push([nr, nc]);
      }
    }
  }

  if (flagCount !== cell.adjacentMines) return null;
  if (unrevealedNeighbors.length === 0) return null;

  // If any unrevealed neighbor is a mine, trigger game over
  const hitMine = unrevealedNeighbors.find(([nr, nc]) => board[nr][nc].isMine);
  if (hitMine) {
    const [mr, mc] = hitMine;
    return { hit: true, board: revealAllMines(board, mr, mc) };
  }

  // Safe to reveal all unrevealed neighbors
  let nextBoard: Board = board;
  for (const [nr, nc] of unrevealedNeighbors) {
    nextBoard = revealCell(nextBoard, nr, nc);
  }
  return { hit: false, board: nextBoard };
}
