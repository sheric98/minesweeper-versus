import type { Board } from "./minesweeper";
import { ROWS, COLS } from "./minesweeper";

/**
 * Diff two boards to find cells that became "revealed" in `after` but weren't in `before`.
 * Used to determine which cells were revealed by a revealCell/chordReveal call.
 */
export function diffRevealedCells(
  before: Board,
  after: Board,
): { row: number; col: number }[] {
  const revealed: { row: number; col: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (before[r][c].state !== "revealed" && after[r][c].state === "revealed") {
        revealed.push({ row: r, col: c });
      }
    }
  }
  return revealed;
}

/** Count total revealed cells on a board. */
export function countRevealed(board: Board): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].state === "revealed") count++;
    }
  }
  return count;
}

/**
 * Encode a board as JSON: each cell becomes { m: 0|1, a: adjacentMines }.
 * This format is shared by both the mock WebSocket and the Flask backend.
 */
export function encodeBoard(board: Board): string {
  const data = board.map(row =>
    row.map(cell => ({ m: cell.isMine ? 1 : 0, a: cell.adjacentMines })),
  );
  return JSON.stringify(data);
}

/** Decode a JSON-encoded board string back into a Board with all cells unrevealed. */
export function decodeBoard(encoded: string): Board {
  const data = JSON.parse(encoded) as { m: number; a: number }[][];
  return data.map(row =>
    row.map(cell => ({
      isMine: cell.m === 1,
      adjacentMines: cell.a,
      state: "unrevealed" as const,
    })),
  );
}

/**
 * Calculate cooldown duration in ms after a mine hit.
 * deathCount is 0-indexed (count before incrementing): first death = 2s, second = 4s, etc.
 */
export function cooldownDuration(deathCount: number): number {
  return 2000 + deathCount * 2000;
}
