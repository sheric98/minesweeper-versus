import { describe, it, expect } from "vitest";
import { isSolvable, PerfectSolver, type SolverBoard } from "..";

/**
 * Build a SolverBoard[][] from dimensions and mine positions.
 * Adjacency counts are computed automatically.
 */
function makeBoard(
  rows: number,
  cols: number,
  mines: [number, number][]
): SolverBoard[][] {
  const board: SolverBoard[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ isMine: false, adjacentMines: 0 }))
  );

  const mineSet = new Set(mines.map(([r, c]) => `${r},${c}`));

  for (const [r, c] of mines) {
    board[r][c].isMine = true;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mineSet.has(`${nr},${nc}`)) {
            count++;
          }
        }
      }
      board[r][c].adjacentMines = count;
    }
  }

  return board;
}

describe("isSolvable", () => {
  // --- Solvable boards ---

  it("3x3, 1 mine, start at corner — solvable via flood fill", () => {
    // Mine at (0,2), start at (2,0)
    // Start has adj=0, flood fill reveals most of the board, then constraint solves the rest
    const board = makeBoard(3, 3, [[0, 2]]);
    expect(isSolvable(board, 2, 0)).toBe(true);
  });

  it("4x4, 2 mines — solvable by constraint propagation", () => {
    // Mines at (0,0) and (3,3), start at (2,0)
    // Corner mines are deducible from adjacent number constraints
    const board = makeBoard(4, 4, [[0, 0], [3, 3]]);
    expect(isSolvable(board, 2, 0)).toBe(true);
  });

  it("5x5, corner start — solvable layout", () => {
    // Mines at (1,3) and (3,1), start at (0,0)
    // Start at corner with 0 adjacency triggers flood fill, then constraints resolve
    const board = makeBoard(5, 5, [[1, 3], [3, 1]]);
    expect(isSolvable(board, 0, 0)).toBe(true);
  });

  // --- Unsolvable boards ---

  it("3x3, 2 mines in ambiguous diagonal — unsolvable", () => {
    // Mines at (0,0) and (2,2), start at (1,1)
    // Center sees 2 mines but can't distinguish diagonals from each other
    // Actually let's verify: center has adjacentMines=2. All 8 neighbors are unknown.
    // The constraint is: 2 of 8 neighbors are mines. Not enough to deduce which.
    const board = makeBoard(3, 3, [[0, 0], [2, 2]]);
    expect(isSolvable(board, 1, 1)).toBe(false);
  });

  it("4x4 with insufficient information — unsolvable", () => {
    // 4 corner mines on a 4x4, start at center
    // Center cell sees only 1 mine (0,0), leaving 14 unknowns with 3 remaining mines
    // Not enough constraints to deduce any cell
    const board = makeBoard(4, 4, [[0, 0], [0, 3], [3, 0], [3, 3]]);
    expect(isSolvable(board, 1, 1)).toBe(false);
  });

  // --- Edge cases ---

  it("board with 0 mines — trivially solvable", () => {
    const board = makeBoard(3, 3, []);
    expect(isSolvable(board, 0, 0)).toBe(true);
  });

  it("start cell with adjacentMines=0 — flood fill then solve", () => {
    // Mine at (4,4), start at (0,0) — start has 0 adjacent mines, flood fill expands
    const board = makeBoard(5, 5, [[4, 4]]);
    expect(isSolvable(board, 0, 0)).toBe(true);
  });

  it("single row board (1x5) — non-square geometry", () => {
    // Mine at position 4, start at 0
    // 1x5: [start, _, _, _, mine]
    // Revealing 0 → adjacentMines=0 → flood fill reveals 1,2,3 → cell 3 sees 1 mine → deduce cell 4
    const board = makeBoard(1, 5, [[0, 4]]);
    expect(isSolvable(board, 0, 0)).toBe(true);
  });
});

describe("PerfectSolver.findSolvedSquares", () => {
  it("deduces safe cells from known revealed cells", () => {
    // 3x3 board, mine at (0,2)
    // Constraints: (0,1)=1 → {0,2; 1,2} has 1 mine
    //              (1,1)=1 → {0,2; 1,2; 2,2} has 1 mine
    // Subset reduction: {2,2} has 0 mines → safe
    const solver = new PerfectSolver(3, 3, 1);

    const revealed = new Map<string, number>();
    revealed.set("0,0", 0);
    revealed.set("1,0", 0);
    revealed.set("2,0", 0);
    revealed.set("2,1", 0);
    revealed.set("1,1", 1);
    revealed.set("0,1", 1);

    const safeCells = solver.findSolvedSquares(revealed);

    const safeKeys = safeCells.map(([r, c]) => `${r},${c}`);
    // Subset reduction deduces (2,2) is safe
    expect(safeKeys).toContain("2,2");
    // (0,2) is the mine, should NOT be in safe cells
    expect(safeKeys).not.toContain("0,2");
  });

  it("deduces all mines when cell is surrounded by mines", () => {
    // 3x3 board, all border cells are mines (8 mines), center revealed
    // Center cell has adjacentMines=8, so all 8 neighbors are mines
    const solver = new PerfectSolver(3, 3, 8);

    const revealed = new Map<string, number>();
    revealed.set("1,1", 8);

    const safeCells = solver.findSolvedSquares(revealed);

    // With 8 mines surrounding center and 8 total mines,
    // there are no safe cells to reveal (all unrevealed are mines)
    expect(safeCells).toHaveLength(0);
  });

  it("uses global mine count to prune permutations and find safe cells", () => {
    // 2x3 board, 1 mine at (0,1)
    // Row 0: [_, M, _]     (unrevealed)
    // Row 1: [1, ?, 1]     (reveal (1,0) and (1,2), NOT (1,1))
    //
    // Constraints:
    //   (1,0)=1 → unknowns {(0,0), (0,1), (1,1)}, 1 mine
    //   (1,2)=1 → unknowns {(0,1), (0,2), (1,1)}, 1 mine
    //
    // Groups overlap at {(0,1), (1,1)} but neither is a proper subset → subset deduction fails.
    // With global mine count = 1, the permutation where (0,0)=mine requires (0,2)=mine too
    // (2 mines total > 1 remaining) → pruned. Only valid permutations have the mine at
    // (0,1) or (1,1), so (0,0) and (0,2) are always safe.
    const solver = new PerfectSolver(2, 3, 1);

    const revealed = new Map<string, number>();
    revealed.set("1,0", 1);
    revealed.set("1,2", 1);

    const safeCells = solver.findSolvedSquares(revealed);
    const safeKeys = safeCells.map(([r, c]) => `${r},${c}`);

    expect(safeKeys).toContain("0,0");
    expect(safeKeys).toContain("0,2");
  });

  it("handles multiple rounds of deduction", () => {
    // 5x1 board: [_, _, start, _, mine]
    // Reveal cell 2 (adjacentMines=0), which should flood-fill to neighbors
    // Then reveal cell 3 (adjacentMines=1), deducing cell 4 is a mine → cell 0 and 1 are safe
    const solver = new PerfectSolver(1, 5, 1);

    // Round 1: reveal cells 0-3 (flood fill from start at 2)
    const round1 = new Map<string, number>();
    round1.set("0,0", 0);
    round1.set("0,1", 0);
    round1.set("0,2", 0);
    round1.set("0,3", 1);

    const safeCells = solver.findSolvedSquares(round1);
    // Cell (0,4) is a mine, no safe cells to return
    expect(safeCells).toHaveLength(0);
  });
});
