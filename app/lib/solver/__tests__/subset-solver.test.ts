import { describe, it, expect } from "vitest";
import { SubsetSolver } from "../subset-solver";
import { cellKey } from "../solver-types";

function revealed(cells: [number, number, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [r, c, adj] of cells) {
    m.set(cellKey(r, c), adj);
  }
  return m;
}

function toKeySet(cells: [number, number][]): Set<string> {
  return new Set(cells.map(([r, c]) => cellKey(r, c)));
}

describe("SubsetSolver", () => {
  // ── BasicSolver capabilities (should still work) ───────────────────

  it("Rule 1: all unknown neighbors are mines", () => {
    const solver = new SubsetSolver(1, 3);
    const safe = solver.findSolvedSquares(revealed([[0, 1, 2]]));
    expect(safe).toHaveLength(0);
  });

  it("Rule 2: all mines accounted for → remaining unknowns are safe", () => {
    // 3x3 board, mine at (0,0).
    // Reveal everything except (0,0) and (1,0).
    // (2,0) adj=0 → (1,0) safe. Then (0,1) adj=1 → (0,0) mine.
    const solver = new SubsetSolver(3, 3);
    const safe = solver.findSolvedSquares(
      revealed([
        [0, 1, 1],
        [0, 2, 0],
        [1, 1, 1],
        [1, 2, 0],
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
      ])
    );

    const keys = toKeySet(safe);
    expect(keys).toContain("1,0");
    expect(keys).not.toContain("0,0");
  });

  it("chain deduction via while(changed) loop", () => {
    // Same as BasicSolver chain test
    const solver = new SubsetSolver(3, 3);
    const safe = solver.findSolvedSquares(
      revealed([
        [0, 1, 1],
        [0, 2, 0],
        [1, 1, 1],
        [1, 2, 0],
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
      ])
    );

    const keys = toKeySet(safe);
    expect(keys).toContain("1,0");
    expect(keys).not.toContain("0,0");
  });

  it("multiple calls — state persists across findSolvedSquares calls", () => {
    // 3x3 board, mine at (0,2).
    const solver = new SubsetSolver(3, 3);

    const safe1 = solver.findSolvedSquares(
      revealed([
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
        [1, 0, 0],
      ])
    );
    const keys1 = toKeySet(safe1);
    expect(keys1).toContain("1,1");
    expect(keys1).toContain("1,2");
    expect(keys1).toContain("0,0");
    expect(keys1).toContain("0,1");

    const safe2 = solver.findSolvedSquares(
      revealed([
        [1, 1, 1],
        [1, 2, 1],
        [0, 0, 0],
        [0, 1, 1],
      ])
    );
    expect(safe2).toHaveLength(0);
  });

  it("empty input — returns empty array", () => {
    const solver = new SubsetSolver(5, 5);
    const safe = solver.findSolvedSquares(new Map());
    expect(safe).toHaveLength(0);
  });

  it("edge cell — fewer than 8 neighbors", () => {
    const solver = new SubsetSolver(3, 3);
    const safe = solver.findSolvedSquares(revealed([[0, 0, 0]]));

    const keys = toKeySet(safe);
    expect(safe).toHaveLength(3);
    expect(keys).toContain("0,1");
    expect(keys).toContain("1,0");
    expect(keys).toContain("1,1");
  });

  // ── Subset-specific patterns ───────────────────────────────────────

  it("1-1 wall: finds safe cells via subset deduction", () => {
    // 2x4 board. Mines at (0,0) and (0,3).
    // Row 0: [M, _, _, M]
    // Row 1: [1, 1, 1, 1]
    //
    // (1,0): {(0,0),(0,1)} has 1 mine
    // (1,1): {(0,0),(0,1),(0,2)} has 1 mine
    // Subset: {(0,0),(0,1)} ⊂ {(0,0),(0,1),(0,2)} → diff {(0,2)} has 0 mines → safe
    // Similarly from the right side:
    // (1,3): {(0,2),(0,3)} has 1 mine
    // (1,2): {(0,1),(0,2),(0,3)} has 1 mine
    // Subset: {(0,2),(0,3)} ⊂ {(0,1),(0,2),(0,3)} → diff {(0,1)} has 0 mines → safe

    const solver = new SubsetSolver(2, 4);
    const safe = solver.findSolvedSquares(
      revealed([
        [1, 0, 1],
        [1, 1, 1],
        [1, 2, 1],
        [1, 3, 1],
      ])
    );

    const keys = toKeySet(safe);
    expect(keys).toContain("0,1");
    expect(keys).toContain("0,2");
  });

  it("1-2-1: finds safe cells via subset deduction", () => {
    // 3x5 board. Mines at (0,1) and (0,3).
    // Row 0: [_, M, _, M, _]   (unrevealed)
    // Row 1: [1, 1, 2, 1, 1]   (revealed) — corrected adj values
    // Row 2: [0, 0, 0, 0, 0]   (revealed)
    //
    // (1,0) adj=1: unknowns {(0,0),(0,1)}, 1 mine
    // (1,1) adj=1: unknowns {(0,0),(0,1),(0,2)}, 1 mine
    // Subset {(0,0),(0,1)} ⊂ {(0,0),(0,1),(0,2)} → {(0,2)} has 0 mines → safe
    //
    // (1,4) adj=1: unknowns {(0,3),(0,4)}, 1 mine
    // (1,3) adj=1: unknowns {(0,2),(0,3),(0,4)}, 1 mine
    // Subset {(0,3),(0,4)} ⊂ {(0,2),(0,3),(0,4)} → {(0,2)} has 0 mines → safe (already known)
    //
    // After (0,2) is safe:
    // (1,2) adj=2: unknowns {(0,1),(0,3)}, 2 mines → Rule 1 → both mines
    // Then (1,0) adj=1: unknowns {(0,0)}, knownMines={(0,1)}, 1-1=0 → Rule 2 → (0,0) safe
    // (1,4) adj=1: unknowns {(0,4)}, knownMines={(0,3)}, 1-1=0 → Rule 2 → (0,4) safe

    const solver = new SubsetSolver(3, 5);
    const safe = solver.findSolvedSquares(
      revealed([
        [1, 0, 1],
        [1, 1, 1],
        [1, 2, 2],
        [1, 3, 1],
        [1, 4, 1],
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
        [2, 3, 0],
        [2, 4, 0],
      ])
    );

    const keys = toKeySet(safe);
    expect(keys).toContain("0,0");
    expect(keys).toContain("0,2");
    expect(keys).toContain("0,4");
  });

  it("non-subset overlap — returns 0 (known limitation)", () => {
    // Groups overlap but neither is a proper subset.
    // 2x4 board. Mines at (0,1) and (0,2).
    // Row 0: [_, M, M, _]
    // Row 1: [1, ?, ?, 1]   — only reveal (1,0) and (1,3)
    //
    // (1,0) adj=1: unknowns {(0,0),(0,1)}, 1 mine
    // (1,3) adj=1: unknowns {(0,2),(0,3)}, 1 mine
    // These groups don't overlap at all — no subset relation.
    // But let me make them overlap without being subsets:
    //
    // 2x5 board. Mine at (0,2).
    // Row 0: [_, _, M, _, _]
    // Row 1: [0, 1, ?, 1, 0]  — reveal (1,0), (1,1), (1,3), (1,4)
    //
    // (1,0) adj=0: unknowns {(0,0),(0,1)} → Rule 2 → both safe. Too easy.
    //
    // Better: 1x5, mines at (0,1) and (0,3).
    // [_, M, _, M, _]
    // Only reveal constraint cells at known positions... but this is 1D, no second row.
    //
    // Use a configuration where groups overlap but neither is a subset:
    // 2x4 board. Mine at (0,1).
    // Row 0: [_, M, _, _]
    // Row 1: [1, 1, 1, 0]
    //
    // (1,3) adj=0: unknowns {(0,2),(0,3)} → safe. Trivial.
    //
    // Simpler approach: just verify the limitation exists.
    // 3x3 board, mine at (1,1).
    // Reveal corners only:
    // (0,0) adj=1: unknowns {(0,1),(1,0),(1,1)}, 1 mine
    // (0,2) adj=1: unknowns {(0,1),(1,1),(1,2)}, 1 mine
    // Groups: {(0,1),(1,0),(1,1)}=1 and {(0,1),(1,1),(1,2)}=1
    // Overlap is {(0,1),(1,1)} — neither group is a subset of the other.
    // SubsetSolver cannot deduce anything.

    const solver = new SubsetSolver(3, 3);
    const safe = solver.findSolvedSquares(
      revealed([
        [0, 0, 1],
        [0, 2, 1],
      ])
    );

    expect(safe).toHaveLength(0);
  });
});
