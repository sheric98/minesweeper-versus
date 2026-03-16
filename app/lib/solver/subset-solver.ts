import { cellKey, parseKey, Solver, MineGroup, isProperSubset } from './solver-types';
import type { CellKey } from './solver-types';

export class SubsetSolver extends Solver {
  private revealedCells = new Map<string, number>();
  private knownMines = new Set<string>();

  constructor(height: number, width: number) {
    super(height, width, 0);
  }

  findSolvedSquares(newlyRevealed: Map<string, number>): [number, number][] {
    for (const [key, adj] of newlyRevealed) {
      this.revealedCells.set(key, adj);
    }

    let changed = true;
    const safeCells = new Set<string>();

    while (changed) {
      changed = false;

      // 1. Build MineGroups + cell index from all revealed cells
      let groups: MineGroup[] = [];
      let cellToGroups = new Map<CellKey, MineGroup[]>();

      for (const [key, adjacentMines] of this.revealedCells) {
        const [r, c] = parseKey(key);
        const unknowns = new Set<CellKey>();
        let knownMineCount = 0;

        for (const [nr, nc] of this.neighbors(r, c)) {
          const nk = cellKey(nr, nc);
          if (this.knownMines.has(nk)) {
            knownMineCount++;
          } else if (!this.revealedCells.has(nk) && !safeCells.has(nk)) {
            unknowns.add(nk);
          }
        }

        if (unknowns.size === 0) continue;

        const group = new MineGroup(unknowns, adjacentMines - knownMineCount);
        groups.push(group);
        for (const cell of unknowns) {
          let list = cellToGroups.get(cell);
          if (!list) {
            list = [];
            cellToGroups.set(cell, list);
          }
          list.push(group);
        }
      }

      // 2. Subset splitting via cell index (loop until stable)
      let splitOccurred = true;
      while (splitOccurred) {
        splitOccurred = false;

        for (const g of groups) {
          // Find candidate overlapping groups via cells of g
          const candidates = new Set<MineGroup>();
          for (const cell of g.cells) {
            const list = cellToGroups.get(cell);
            if (list) {
              for (const candidate of list) {
                if (candidate !== g) candidates.add(candidate);
              }
            }
          }

          for (const c of candidates) {
            if (isProperSubset(g.cells, c.cells)) {
              // g is a proper subset of c — split c into g and diff
              const diffCells = new Set<CellKey>();
              for (const cell of c.cells) {
                if (!g.cells.has(cell)) diffCells.add(cell);
              }
              const diff = new MineGroup(diffCells, c.mines - g.mines);

              // Remove c from groups and cellToGroups
              groups = groups.filter(x => x !== c);
              for (const cell of c.cells) {
                const list = cellToGroups.get(cell);
                if (list) {
                  const idx = list.indexOf(c);
                  if (idx !== -1) list.splice(idx, 1);
                }
              }

              // Add diff to groups and cellToGroups
              groups.push(diff);
              for (const cell of diffCells) {
                let list = cellToGroups.get(cell);
                if (!list) {
                  list = [];
                  cellToGroups.set(cell, list);
                }
                list.push(diff);
              }

              splitOccurred = true;
              break;
            }
          }

          if (splitOccurred) break;
        }
      }

      // 3. Check for trivially solved groups
      for (const group of groups) {
        if (group.allSafe()) {
          for (const cell of group.cells) {
            safeCells.add(cell);
            changed = true;
          }
        } else if (group.allMines()) {
          for (const cell of group.cells) {
            this.knownMines.add(cell);
            changed = true;
          }
        }
      }
    }

    return Array.from(safeCells).map(parseKey);
  }
}
