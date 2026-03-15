import { cellKey, parseKey, Solver } from './solver-types';

export class BasicSolver extends Solver {
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

      for (const [key, adjacentMines] of this.revealedCells) {
        const [r, c] = parseKey(key);
        const unknownNeighbors: string[] = [];
        let knownMineCount = 0;

        for (const [nr, nc] of this.neighbors(r, c)) {
          const nk = cellKey(nr, nc);
          if (this.knownMines.has(nk)) {
            knownMineCount++;
          } else if (!this.revealedCells.has(nk) && !safeCells.has(nk)) {
            unknownNeighbors.push(nk);
          }
        }

        if (unknownNeighbors.length === 0) continue;

        // Rule 1: all unknown neighbors are mines
        if (adjacentMines - knownMineCount === unknownNeighbors.length) {
          for (const nk of unknownNeighbors) {
            this.knownMines.add(nk);
            changed = true;
          }
        }

        // Rule 2: all unknown neighbors are safe
        if (adjacentMines === knownMineCount) {
          for (const nk of unknownNeighbors) {
            safeCells.add(nk);
            changed = true;
          }
        }
      }
    }

    return Array.from(safeCells).map(parseKey);
  }
}
