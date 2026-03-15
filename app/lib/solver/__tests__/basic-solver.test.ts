import { describe, it, expect } from "vitest";
import { BasicSolver } from "../basic-solver";
import { cellKey } from "../solver-types";

/**
 * Helper: build a Map<string, number> from an array of [row, col, adjacentMines].
 */
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

describe("BasicSolver", () => {
  // ── Basic functionality (should solve) ──────────────────────────────

  it("Rule 1: all unknown neighbors are mines", () => {
    // 1x3 board, mines at (0,0) and (0,2).
    // Reveal (0,1)=2. Unknowns: {(0,0), (0,2)}. adj=2, 2 unknowns → Rule 1 → both mines.
    // No safe cells returned.
    const solver = new BasicSolver(1, 3);

    const safe = solver.findSolvedSquares(revealed([[0, 1, 2]]));

    // All unknowns are mines, so no safe cells
    expect(safe).toHaveLength(0);
  });

  it("Rule 2: all mines accounted for → remaining unknowns are safe", () => {
    // 3x3 board. Center (1,1) has adj=1.
    // We reveal enough neighbors so that one is already known as a mine.
    // First call: reveal (0,0)=0, (0,1)=1, (0,2)=0, (1,0)=0.
    //   (0,1) has adj=1, unknowns: (1,1), (1,2). Can't solve yet.
    //   (0,0) has adj=0 → unknowns: (1,0) already revealed, (0,1) revealed, (1,1) unknown → safe
    // Actually let me construct a clearer scenario:
    //
    // 4x3 board, mine at (0,2).
    // Reveal: (1,0)=0, (1,1)=1, (1,2)=1, (2,0)=0, (2,1)=0, (2,2)=0
    // (1,1) adj=1, unknowns: (0,0),(0,1),(0,2). Can't solve alone.
    // (1,2) adj=1, unknowns: (0,1),(0,2). Can't solve alone.
    // But (2,0) adj=0 → unknown (1,0) already revealed. No unknowns → skip.
    // Hmm, let me use a simpler setup.
    //
    // 2x3 board, mine at (0,2).
    // Row 0: [0, 1, M]
    // Row 1: [0, 1, 1]
    // Reveal row 1 + (0,0) and (0,1):
    //   (0,0)=0, (0,1)=1, (1,0)=0, (1,1)=1, (1,2)=1
    //   (0,1) adj=1, unknowns: {(0,2)}. 1 unknown = 1 mine → Rule 1 → (0,2) is mine.
    //   (1,2) adj=1, unknowns: {(0,2)}. Already mine. knownMines=1=adj → Rule 2 (no unknowns left).
    //   No safe cells to return since (0,2) is the only unrevealed cell and it's a mine.
    //
    // Better test: after marking mines, Rule 2 should mark remaining unknowns as safe.
    // 3x3 board, mine at (0,0).
    // Row 0: [M, 1, 0]
    // Row 1: [1,  1, 0]
    // Row 2: [0,  0, 0]
    // Reveal: (0,1)=1, (0,2)=0, (1,1)=1, (1,2)=0, (2,0)=0, (2,1)=0, (2,2)=0
    // Unknown: (0,0), (1,0)
    // (0,1) adj=1, unknowns: {(0,0),(1,0)}, knownMines=0. 2≠1, 1≠0. Can't solve.
    // (1,1) adj=1, unknowns: {(0,0),(1,0)}, knownMines=0. Same.
    // (2,0) adj=0, unknowns: {(1,0)}, knownMines=0. 1≠0. adj=0=knownMines=0 → Rule 2 → (1,0) safe!
    // Now (1,0) is safe. Re-loop:
    // (0,1) adj=1, unknowns: {(0,0)}, knownMines=0. 1 unknown = 1 mine → Rule 1 → (0,0) mine.
    // (1,1) adj=1, unknowns: {} (1,0 safe, 0,0 mine), knownMines=1=adj. No unknowns.
    // Safe cells: (1,0)

    const solver = new BasicSolver(3, 3);
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
    expect(keys).not.toContain("0,0"); // mine
  });

  it("zero cell — all unknown neighbors are safe", () => {
    // 3x3 board, no mines near center. Reveal only center with adj=0.
    // All 8 neighbors are unknown, adj=0, knownMines=0 → Rule 2 → all safe
    const solver = new BasicSolver(3, 3);
    const safe = solver.findSolvedSquares(revealed([[1, 1, 0]]));

    const keys = toKeySet(safe);
    expect(safe).toHaveLength(8);
    expect(keys).toContain("0,0");
    expect(keys).toContain("0,1");
    expect(keys).toContain("0,2");
    expect(keys).toContain("1,0");
    expect(keys).toContain("1,2");
    expect(keys).toContain("2,0");
    expect(keys).toContain("2,1");
    expect(keys).toContain("2,2");
  });

  it("chain deduction via while(changed) loop", () => {
    // 1x5 board: [0, 1, ?, 1, 0]  with mine at col 2.
    // Reveal: (0,0)=0, (0,1)=1, (0,3)=1, (0,4)=0
    // Unknown: (0,2)
    // (0,0) adj=0, unknowns: {(0,1)} → already revealed. No unknowns → skip.
    // (0,1) adj=1, unknowns: {(0,2)}. 1=1 → Rule 1 → (0,2) mine.
    // (0,3) adj=1, knownMines now includes (0,2)=1=adj → Rule 2 → no unknowns left.
    // No safe cells since the only unknown was a mine.

    // Better chain test: 1x6, mine at col 0.
    // Board: [M, 1, 0, 0, 0, 0]
    // Reveal: (0,1)=1, (0,2)=0, (0,3)=0, (0,4)=0, (0,5)=0
    // (0,2) adj=0, unknowns: {(0,1)} revealed → skip. Actually (0,1) is revealed.
    // Unknowns of (0,2): only unrevealed non-mine non-safe neighbors. (0,1) is revealed. (0,3) is revealed.
    //   No unknowns → skip.
    // (0,1) adj=1, unknowns: {(0,0)}. 1=1 → Rule 1 → (0,0) mine. No safe.
    //
    // Let me make a real chain:
    // 1x5, mines at col 4.
    // Board: [0, 0, 0, 1, M]
    // Reveal: (0,0)=0, (0,1)=0
    // (0,0) adj=0, unknowns: {(0,1)} revealed → skip.
    // (0,1) adj=0, unknowns: {(0,0)} revealed, {(0,2)} unknown → Rule 2 → (0,2) safe!
    // Changed! Loop again with (0,2) safe:
    // Now if we give adj for (0,2)... wait, BasicSolver only knows adj for cells in revealedCells.
    // (0,2) is marked safe but not revealed (no adj value). It won't be processed as a constraint source.
    // So chain stops here. Safe: {(0,2)}.
    //
    // To get a real chain, we need revealed cells whose constraints cascade.
    // 3x3 board, mine at (0,0).
    // Row 0: [M, 1, 0]
    // Row 1: [1, 1, 0]
    // Row 2: [0, 0, 0]
    // Reveal everything except (0,0) and (1,0):
    //   (0,1)=1, (0,2)=0, (1,1)=1, (1,2)=0, (2,0)=0, (2,1)=0, (2,2)=0
    // Iteration 1:
    //   (0,2) adj=0: unknowns among neighbors: (1,2) revealed → no unknowns.
    //   (2,0) adj=0: unknowns: {(1,0)}. adj=0=knownMines=0 → Rule 2 → (1,0) safe!
    //   changed=true
    // Iteration 2:
    //   (0,1) adj=1: unknowns: {(0,0)}, (1,0) now safe. knownMines=0. 1 unknown, 1 mine → Rule 1 → (0,0) mine!
    //   changed=true
    // Iteration 3:
    //   (1,1) adj=1: knownMines=1 (0,0). unknowns: (1,0) is safe. No unknowns. Skip.
    //   No more changes.
    // Safe: {(1,0)}. (0,0) is mine. Chain: (2,0)→safe(1,0)→mine(0,0).

    const solver = new BasicSolver(3, 3);
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
    // Chain: (2,0) deduces (1,0) safe, then (0,1) deduces (0,0) mine
    expect(keys).toContain("1,0");
    expect(keys).not.toContain("0,0");
  });

  it("multiple calls — state persists across findSolvedSquares calls", () => {
    // 3x3 board, mine at (0,2).
    // Row 0: [0, 1, M]
    // Row 1: [0, 1, 1]
    // Row 2: [0, 0, 0]

    const solver = new BasicSolver(3, 3);

    // First call: reveal bottom + left
    const safe1 = solver.findSolvedSquares(
      revealed([
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
        [1, 0, 0],
      ])
    );
    // (2,0) adj=0: unknowns {(1,0)} already revealed, {(1,1)} unknown → safe
    // (2,1) adj=0: unknowns → (1,0) revealed, (1,1) safe, (1,2) unknown → safe
    // (2,2) adj=0: unknowns → (1,1) safe, (1,2) safe.
    // (1,0) adj=0: unknowns → (0,0) unknown, (0,1) unknown → both safe
    // Chain continues with safe cells, but no new revealed constraint sources.
    const keys1 = toKeySet(safe1);
    expect(keys1).toContain("1,1");
    expect(keys1).toContain("1,2");
    expect(keys1).toContain("0,0");
    expect(keys1).toContain("0,1");

    // Second call: reveal cells found safe in round 1
    const safe2 = solver.findSolvedSquares(
      revealed([
        [1, 1, 1],
        [1, 2, 1],
        [0, 0, 0],
        [0, 1, 1],
      ])
    );
    // Now (0,1) adj=1, unknowns: {(0,2)}. 1=1 → Rule 1 → (0,2) mine.
    // (1,1) adj=1, knownMines: {(0,2)}=1=adj → Rule 2, no unknowns.
    // No safe cells to return (only unknown was a mine)
    expect(safe2).toHaveLength(0);
  });

  it("empty input — returns empty array", () => {
    const solver = new BasicSolver(5, 5);
    const safe = solver.findSolvedSquares(new Map());
    expect(safe).toHaveLength(0);
  });

  it("edge cell — fewer than 8 neighbors", () => {
    // 3x3, reveal corner (0,0) with adj=0. Corner has only 3 neighbors.
    const solver = new BasicSolver(3, 3);
    const safe = solver.findSolvedSquares(revealed([[0, 0, 0]]));

    const keys = toKeySet(safe);
    expect(safe).toHaveLength(3);
    expect(keys).toContain("0,1");
    expect(keys).toContain("1,0");
    expect(keys).toContain("1,1");
  });

  // ── Advanced patterns (should NOT solve) ────────────────────────────

  it("1-2-1 pattern — requires cross-cell reasoning", () => {
    // 3x5 board. Row 1 has revealed cells with values 1, 2, 1.
    // Mines at (0,1) and (0,3).
    //
    // Row 0: [_, M, _, M, _]   (unrevealed)
    // Row 1: [1, 2, 2, 2, 1]   (revealed)
    // Row 2: [0, 0, 0, 0, 0]   (revealed)
    //
    // A perfect solver using 1-2-1 pattern would deduce (0,0), (0,2), (0,4) are safe.
    // BasicSolver cannot: no single cell's constraint is fully determined.

    const solver = new BasicSolver(3, 5);
    const safe = solver.findSolvedSquares(
      revealed([
        [1, 0, 1],
        [1, 1, 2],
        [1, 2, 2],
        [1, 3, 2],
        [1, 4, 1],
        [2, 0, 0],
        [2, 1, 0],
        [2, 2, 0],
        [2, 3, 0],
        [2, 4, 0],
      ])
    );

    // BasicSolver should NOT be able to deduce any safe cells here
    expect(safe).toHaveLength(0);
  });

  it("1-1 wall pattern — requires subset deduction", () => {
    // 2x4 board. Row 1 revealed, row 0 unknown. Mines at (0,0) and (0,1).
    //
    // Row 0: [M, M, _, _]
    // Row 1: [2, 2, 1, 0]
    //
    // (1,3) adj=0 → no unknowns (all neighbors revealed or in row 1). Wait:
    //   neighbors of (1,3): (0,2), (0,3), (1,2). (1,2) revealed. (0,2),(0,3) unknown → safe!
    // OK that trivially solves. Let me pick a harder layout.
    //
    // 2x5 board. Mines at (0,0).
    // Row 0: [M, _, _, _, _]
    // Row 1: [1, 1, 0, 0, 0]
    //
    // (1,2)=0 → unknowns: (0,1),(0,2),(0,3) → all safe. Trivial again.
    //
    // Real 1-1 wall: need subset reasoning where it's not trivially solvable.
    // 2x4 board. Mines at (0,0) and (0,3).
    // Row 0: [M, _, _, M]
    // Row 1: [1, 1, 1, 1]
    //
    // (1,0) adj=1: unknowns {(0,0),(0,1)}, 1 of 2 mines → can't solve
    // (1,1) adj=1: unknowns {(0,0),(0,1),(0,2)}, 1 of 3 → can't solve
    // (1,2) adj=1: unknowns {(0,1),(0,2),(0,3)}, 1 of 3 → can't solve
    // (1,3) adj=1: unknowns {(0,2),(0,3)}, 1 of 2 → can't solve
    //
    // Subset reasoning: (1,0) says {0,0; 0,1} has 1 mine.
    // (1,1) says {0,0; 0,1; 0,2} has 1 mine.
    // Subset: {0,2} has 0 mines → (0,2) safe. BasicSolver can't do this.

    const solver = new BasicSolver(2, 4);
    const safe = solver.findSolvedSquares(
      revealed([
        [1, 0, 1],
        [1, 1, 1],
        [1, 2, 1],
        [1, 3, 1],
      ])
    );

    // BasicSolver cannot deduce that (0,1) and (0,2) are safe
    expect(safe).toHaveLength(0);
  });

  it("ambiguous configuration — neither rule applies", () => {
    // 3x3, reveal center with adj=1. 8 unknown neighbors, 1 mine among them.
    // Neither rule fires: 1 ≠ 8 (Rule 1), 1 ≠ 0 (Rule 2).
    const solver = new BasicSolver(3, 3);
    const safe = solver.findSolvedSquares(revealed([[1, 1, 1]]));
    expect(safe).toHaveLength(0);
  });
});
