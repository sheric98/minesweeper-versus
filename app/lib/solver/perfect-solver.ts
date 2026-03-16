import {
  type Cell,
  type CellKey,
  type SolverBoard,
  Solver,
  cellKey,
  parseKey,
  MineGroup,
  ConnectedMineGroup,
  mergeDisjointedConnectedGroups,
} from './solver-types';

export class PerfectSolver extends Solver {
  private remainingMines: number;
  private connectedGroups = new Map<CellKey, ConnectedMineGroup>();
  private allGroups = new Set<ConnectedMineGroup>();
  private tilesWithoutInformation = new Set<CellKey>();
  private revealedCells = new Set<CellKey>();
  private mineCells = new Set<CellKey>();

  constructor(height: number, width: number, numMines: number, protected useGlobalMineCount = true) {
    super(height, width, numMines);
    this.remainingMines = numMines;

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        this.tilesWithoutInformation.add(cellKey(r, c));
      }
    }
  }

  findSolvedSquares(newlyRevealed: Map<string, number>): [number, number][] {
    // 1. Mark each revealed cell as safe internally
    for (const [key] of newlyRevealed) {
      this.revealedCells.add(key);
      this.tilesWithoutInformation.delete(key);
      const cg = this.connectedGroups.get(key);
      if (cg) cg.markSafe(key);
    }

    // 2. Clean up empty groups, reassess subsets
    this.allGroups = new Set(Array.from(this.allGroups).filter(g => !g.isEmpty()));
    for (const group of Array.from(this.allGroups)) {
      group.reassessForSubsets();
    }

    // 3. Build constraint groups from newly revealed cells
    for (const [key, adjacentMines] of newlyRevealed) {
      if (adjacentMines === 0) continue;

      const [r, c] = parseKey(key);
      const unknownNeighbors = new Set<CellKey>();
      for (const [nr, nc] of this.neighbors(r, c)) {
        const nk = cellKey(nr, nc);
        if (!this.revealedCells.has(nk) && !this.mineCells.has(nk)) {
          unknownNeighbors.add(nk);
        }
      }
      if (unknownNeighbors.size === 0) continue;

      for (const nk of unknownNeighbors) {
        this.tilesWithoutInformation.delete(nk);
      }

      let mineCount = 0;
      for (const [nr, nc] of this.neighbors(r, c)) {
        if (this.mineCells.has(cellKey(nr, nc))) mineCount++;
      }
      const mineGroup = new MineGroup(unknownNeighbors, adjacentMines - mineCount);

      // Deduplicate relevant connected groups
      const relevantSet = new Set<ConnectedMineGroup>();
      for (const cell of unknownNeighbors) {
        const cg = this.connectedGroups.get(cell);
        if (cg) relevantSet.add(cg);
      }
      const relevantConnectedGroups = Array.from(relevantSet);

      if (relevantConnectedGroups.length === 0) {
        const newGroup = new ConnectedMineGroup();
        newGroup.addGroup(mineGroup);
        for (const cell of unknownNeighbors) {
          this.connectedGroups.set(cell, newGroup);
        }
        this.allGroups.add(newGroup);
      } else if (relevantConnectedGroups.length === 1) {
        relevantConnectedGroups[0].addGroup(mineGroup);
        for (const cell of unknownNeighbors) {
          this.connectedGroups.set(cell, relevantConnectedGroups[0]);
        }
      } else {
        const mergedGroup = mergeDisjointedConnectedGroups(relevantConnectedGroups);
        mergedGroup.addGroup(mineGroup);
        for (const cell of mergedGroup.relevantCells) {
          this.connectedGroups.set(cell, mergedGroup);
        }
        this.allGroups.add(mergedGroup);
        for (const group of relevantConnectedGroups) {
          this.allGroups.delete(group);
        }
      }
    }

    // 4. Split disjoint groups
    const newAllGroups = new Set<ConnectedMineGroup>();
    for (const group of this.allGroups) {
      for (const component of group.splitIfDisjoint()) {
        newAllGroups.add(component);
        for (const cell of component.relevantCells) {
          this.connectedGroups.set(cell, component);
        }
      }
    }
    this.allGroups = newAllGroups;

    // 5. Solve all groups
    const toReveal: [number, number][] = [];
    const toMarkMine = new Set<CellKey>();
    let maxMinesUsed = 0;
    for (const group of this.allGroups) {
      const { safeCells, mineCells, maxMinesUsed: groupMax } = group.solveGroups(this.useGlobalMineCount ? this.remainingMines : Infinity);
      for (const c of safeCells) {
        toReveal.push(parseKey(c));
      }
      for (const c of mineCells) toMarkMine.add(c);
      maxMinesUsed += groupMax;
    }

    // 6. Check global mine constraint on unconstrained tiles
    if (this.useGlobalMineCount) {
      const minMinesRemaining = this.remainingMines - maxMinesUsed;
      if (minMinesRemaining === this.tilesWithoutInformation.size) {
        for (const cell of this.tilesWithoutInformation) toMarkMine.add(cell);
      }
    }

    // 7. Process deduced mines internally
    for (const key of toMarkMine) {
      this.mineCells.add(key);
      this.tilesWithoutInformation.delete(key);
      this.remainingMines--;
      const cg = this.connectedGroups.get(key);
      if (cg) cg.markMine(key);
    }

    // 8. Return safe cells
    return toReveal;
  }
}

export class ProbabilisticSolver extends PerfectSolver {
  constructor(height: number, width: number, numMines: number) {
    super(height, width, numMines, false);
  }
}

export function isSolvable(board: SolverBoard[][], startRow: number, startCol: number): boolean {
  const height = board.length;
  const width = board[0].length;
  const numMines = board.flat().filter(c => c.isMine).length;
  const totalSafe = height * width - numMines;

  const solver = new PerfectSolver(height, width, numMines);

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

  // Initial reveal
  let newlyRevealed = revealFloodFill(startRow, startCol);

  // Main solving loop
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
