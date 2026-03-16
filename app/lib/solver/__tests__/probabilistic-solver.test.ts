import { describe, it, expect } from "vitest";
import { ProbabilisticSolver } from "..";

describe("ProbabilisticSolver.findSolvedSquares", () => {
  it("deduces safe cells via subset reduction", () => {
    // 3x3 board, mine at (0,2)
    // Constraints: (0,1)=1 → {0,2; 1,2} has 1 mine
    //              (1,1)=1 → {0,2; 1,2; 2,2} has 1 mine
    // Subset reduction: {2,2} has 0 mines → safe
    const solver = new ProbabilisticSolver(3, 3, 1);

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
    const solver = new ProbabilisticSolver(3, 3, 8);

    const revealed = new Map<string, number>();
    revealed.set("1,1", 8);

    const safeCells = solver.findSolvedSquares(revealed);

    // All 8 unrevealed cells are mines → no safe cells
    expect(safeCells).toHaveLength(0);
  });

  it("handles multiple rounds of deduction", () => {
    // 1x5 board, 1 mine at (0,4)
    // Reveal cells 0-3, cell (0,3)=1 with only unknown neighbor (0,4) → mine
    const solver = new ProbabilisticSolver(1, 5, 1);

    const round1 = new Map<string, number>();
    round1.set("0,0", 0);
    round1.set("0,1", 0);
    round1.set("0,2", 0);
    round1.set("0,3", 1);

    const safeCells = solver.findSolvedSquares(round1);
    // Cell (0,4) is a mine, no safe cells to return
    expect(safeCells).toHaveLength(0);
  });

  it("cannot solve board that requires global mine count constraint", () => {
    // 2x3 board, 1 mine at (0,1)
    // Row 0: [_, M, _]     (unrevealed)
    // Row 1: [1, ?, 1]     (reveal (1,0) and (1,2), NOT (1,1))
    //
    // Constraints:
    //   (1,0)=1 → unknowns {(0,0), (0,1), (1,1)}, 1 mine
    //   (1,2)=1 → unknowns {(0,1), (0,2), (1,1)}, 1 mine
    //
    // Without global mine count, the permutation where (0,0)=mine and (0,2)=mine
    // is also valid (no mine limit to prune it). 3 valid permutations exist and
    // no cell is deterministic in all of them → nothing can be deduced.
    const solver = new ProbabilisticSolver(2, 3, 1);

    const revealed = new Map<string, number>();
    revealed.set("1,0", 1);
    revealed.set("1,2", 1);

    const safeCells = solver.findSolvedSquares(revealed);

    expect(safeCells).toHaveLength(0);
  });
});
