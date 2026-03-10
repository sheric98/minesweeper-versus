import { ROWS, COLS, MINE_COUNT } from "./minesweeper";

type Cell = [number, number];
type CellKey = string;

function cellKey(r: number, c: number): CellKey {
  return `${r},${c}`;
}

function parseKey(key: CellKey): Cell {
  const [r, c] = key.split(",").map(Number);
  return [r, c];
}

function neighbors(r: number, c: number): Cell[] {
  const result: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        result.push([nr, nc]);
      }
    }
  }
  return result;
}

function* combinations(arr: number[], k: number): Generator<number[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

class MineGroup {
  cells: Set<CellKey>;
  mines: number;

  constructor(cells: Set<CellKey>, mines: number) {
    this.cells = cells;
    this.mines = mines;
  }

  markSafe(cell: CellKey): void {
    this.cells.delete(cell);
  }

  markMine(cell: CellKey): void {
    if (this.cells.delete(cell)) {
      this.mines--;
    }
  }

  empty(): boolean {
    return this.cells.size === 0;
  }

  allMines(): boolean {
    return this.mines === this.cells.size;
  }

  allSafe(): boolean {
    return this.mines === 0;
  }
}

class ConnectedMineGroup {
  relevantCells: Set<CellKey> = new Set();
  subgroupsMap: Map<CellKey, Set<MineGroup>> = new Map();
  numGroups = 0;

  addGroup(group: MineGroup): void {
    if (group.empty()) return;

    const existing = this._isSubsetOfExistingGroup(group);
    if (existing) {
      const [g1, g2] = this._splitGroup(group, existing);
      this.deleteGroup(existing);
      this.addGroup(g1);
      this.addGroup(g2);
      return;
    }

    this.numGroups++;
    for (const cell of group.cells) {
      this.relevantCells.add(cell);
      let set = this.subgroupsMap.get(cell);
      if (!set) {
        set = new Set();
        this.subgroupsMap.set(cell, set);
      }
      set.add(group);
    }
  }

  deleteGroup(group: MineGroup): void {
    this.numGroups--;
    for (const cell of Array.from(group.cells)) {
      const set = this.subgroupsMap.get(cell);
      if (set) {
        set.delete(group);
        if (set.size === 0) {
          this.relevantCells.delete(cell);
          this.subgroupsMap.delete(cell);
        }
      }
    }
  }

  private _isSubsetOfExistingGroup(group: MineGroup): MineGroup | null {
    for (const cell of group.cells) {
      const existing = this.subgroupsMap.get(cell);
      if (!existing) continue;
      for (const eg of existing) {
        if (isProperSubset(eg.cells, group.cells) || isProperSubset(group.cells, eg.cells)) {
          return eg;
        }
      }
    }
    return null;
  }

  private _splitGroup(a: MineGroup, b: MineGroup): [MineGroup, MineGroup] {
    let subset: MineGroup, superset: MineGroup;
    if (isProperSubset(a.cells, b.cells)) {
      subset = a;
      superset = b;
    } else {
      subset = b;
      superset = a;
    }

    const diffCells = new Set<CellKey>();
    for (const cell of superset.cells) {
      if (!subset.cells.has(cell)) diffCells.add(cell);
    }
    const diffMines = superset.mines - subset.mines;

    return [
      new MineGroup(new Set(subset.cells), subset.mines),
      new MineGroup(diffCells, diffMines),
    ];
  }

  solveGroups(numRemainingMines: number): { safeCells: Set<CellKey>; mineCells: Set<CellKey>; maxMinesUsed: number } {
    // Collect unique subgroups
    const allSubgroups: MineGroup[] = [];
    const seen = new Set<MineGroup>();
    for (const cell of this.relevantCells) {
      const groups = this.subgroupsMap.get(cell);
      if (!groups) continue;
      for (const g of groups) {
        if (!seen.has(g)) {
          seen.add(g);
          allSubgroups.push(g);
        }
      }
    }

    if (allSubgroups.length === 0) {
      return { safeCells: new Set(), mineCells: new Set(), maxMinesUsed: 0 };
    }

    // Phase 1: trivial groups
    const safeCells = new Set<CellKey>();
    const mineCells = new Set<CellKey>();
    const backtrackGroups: MineGroup[] = [];

    for (const g of allSubgroups) {
      if (g.allSafe()) {
        for (const c of g.cells) safeCells.add(c);
      } else if (g.allMines()) {
        for (const c of g.cells) mineCells.add(c);
      } else {
        backtrackGroups.push(g);
      }
    }

    if (backtrackGroups.length === 0) {
      return { safeCells, mineCells, maxMinesUsed: mineCells.size };
    }

    // Phase 2: backtracking
    const allCells = new Set<CellKey>();
    for (const g of backtrackGroups) {
      for (const c of g.cells) allCells.add(c);
    }

    const preset = new Map<CellKey, boolean>();
    for (const cell of mineCells) {
      if (allCells.has(cell)) preset.set(cell, true);
    }
    for (const cell of safeCells) {
      if (allCells.has(cell)) preset.set(cell, false);
    }

    const cellMineCount = new Map<CellKey, number>();
    const cellSafeCount = new Map<CellKey, number>();
    let maxMinesUsed = 0;
    let totalValid = 0;

    function generatePermutations(group: MineGroup, assignment: Map<CellKey, boolean>): Map<CellKey, boolean>[] {
      const cells = Array.from(group.cells).sort();
      const minesNeeded = group.mines;

      let presetMines = 0;
      for (const c of cells) {
        if (assignment.get(c) === true) presetMines++;
      }

      const minesLeft = minesNeeded - presetMines;
      const unassigned: CellKey[] = [];
      for (const c of cells) {
        if (!assignment.has(c)) unassigned.push(c);
      }

      if (minesLeft < 0 || minesLeft > unassigned.length) return [];

      if (unassigned.length === 0) {
        return minesLeft === 0 ? [new Map()] : [];
      }

      const indices = Array.from({ length: unassigned.length }, (_, i) => i);
      const results: Map<CellKey, boolean>[] = [];
      for (const combo of combinations(indices, minesLeft)) {
        const mineSet = new Set(combo);
        const perm = new Map<CellKey, boolean>();
        for (let i = 0; i < unassigned.length; i++) {
          perm.set(unassigned[i], mineSet.has(i));
        }
        results.push(perm);
      }
      return results;
    }

    function backtrack(groupIdx: number, assignment: Map<CellKey, boolean>, minesSoFar: number): void {
      if (groupIdx === backtrackGroups.length) {
        totalValid++;
        maxMinesUsed = Math.max(maxMinesUsed, minesSoFar);
        for (const cell of allCells) {
          const isMine = assignment.get(cell) ?? preset.get(cell) ?? false;
          if (isMine) {
            cellMineCount.set(cell, (cellMineCount.get(cell) ?? 0) + 1);
          } else {
            cellSafeCount.set(cell, (cellSafeCount.get(cell) ?? 0) + 1);
          }
        }
        return;
      }

      const group = backtrackGroups[groupIdx];
      for (const perm of generatePermutations(group, assignment)) {
        let newMines = 0;
        for (const v of perm.values()) {
          if (v) newMines++;
        }
        if (minesSoFar + newMines > numRemainingMines) continue;
        const newAssignment = new Map(assignment);
        for (const [k, v] of perm) {
          newAssignment.set(k, v);
        }
        backtrack(groupIdx + 1, newAssignment, minesSoFar + newMines);
      }
    }

    backtrack(0, new Map(preset), mineCells.size);

    if (totalValid > 0) {
      for (const cell of allCells) {
        if (safeCells.has(cell) || mineCells.has(cell)) continue;
        if (cellMineCount.get(cell) === totalValid) {
          mineCells.add(cell);
        } else if (cellSafeCount.get(cell) === totalValid) {
          safeCells.add(cell);
        }
      }
    }

    return { safeCells, mineCells, maxMinesUsed };
  }

  reassessForSubsets(): void {
    const seen = new Set<MineGroup>();
    for (const cell of Array.from(this.relevantCells)) {
      const groups = this.subgroupsMap.get(cell);
      if (!groups) continue;
      for (const group of Array.from(groups)) {
        if (seen.has(group) || group.empty()) continue;
        seen.add(group);
        const existing = this._isSubsetOfExistingGroup(group);
        if (existing && existing !== group) {
          const [g1, g2] = this._splitGroup(group, existing);
          this.deleteGroup(existing);
          this.deleteGroup(group);
          this.addGroup(g1);
          this.addGroup(g2);
          return;
        }
      }
    }
  }

  markSafe(cell: CellKey): void {
    const groups = this.subgroupsMap.get(cell);
    if (groups) {
      for (const group of Array.from(groups)) {
        group.markSafe(cell);
        if (group.empty()) this.deleteGroup(group);
      }
    }
    this.subgroupsMap.delete(cell);
    this.relevantCells.delete(cell);
  }

  markMine(cell: CellKey): void {
    const groups = this.subgroupsMap.get(cell);
    if (groups) {
      for (const group of Array.from(groups)) {
        group.markMine(cell);
        if (group.empty()) this.deleteGroup(group);
      }
    }
    this.subgroupsMap.delete(cell);
    this.relevantCells.delete(cell);
  }

  splitIfDisjoint(): ConnectedMineGroup[] {
    if (this.relevantCells.size === 0) return [];

    const remaining = new Set(this.relevantCells);
    const components: ConnectedMineGroup[] = [];

    while (remaining.size > 0) {
      const start = remaining.values().next().value!;
      const visited = new Set<CellKey>();
      const queue: CellKey[] = [start];
      const componentSubgroups = new Set<MineGroup>();

      while (queue.length > 0) {
        const cell = queue.shift()!;
        if (visited.has(cell)) continue;
        visited.add(cell);
        const groups = this.subgroupsMap.get(cell);
        if (groups) {
          for (const subgroup of groups) {
            componentSubgroups.add(subgroup);
            for (const neighbor of subgroup.cells) {
              if (!visited.has(neighbor) && remaining.has(neighbor)) {
                queue.push(neighbor);
              }
            }
          }
        }
      }

      for (const v of visited) remaining.delete(v);

      if (components.length === 0 && remaining.size === 0) {
        return [this];
      }

      const component = new ConnectedMineGroup();
      component.relevantCells = visited;
      component.numGroups = componentSubgroups.size;
      for (const cell of visited) {
        const groups = this.subgroupsMap.get(cell);
        if (groups) component.subgroupsMap.set(cell, groups);
      }
      components.push(component);
    }

    return components;
  }

  isEmpty(): boolean {
    return this.numGroups === 0;
  }
}

function isProperSubset(a: Set<CellKey>, b: Set<CellKey>): boolean {
  if (a.size >= b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function mergeDisjointedConnectedGroups(groups: ConnectedMineGroup[]): ConnectedMineGroup {
  const merged = new ConnectedMineGroup();
  for (const group of groups) {
    for (const cell of group.relevantCells) merged.relevantCells.add(cell);
    merged.numGroups += group.numGroups;
    for (const [cell, subgroups] of group.subgroupsMap) {
      let set = merged.subgroupsMap.get(cell);
      if (!set) {
        set = new Set();
        merged.subgroupsMap.set(cell, set);
      }
      for (const sg of subgroups) set.add(sg);
    }
  }
  return merged;
}

interface SolverBoard {
  isMine: boolean;
  adjacentMines: number;
}

export function isSolvable(board: SolverBoard[][], startRow: number, startCol: number): boolean {
  const state: (string | number)[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "unknown")
  );
  const totalSafe = ROWS * COLS - MINE_COUNT;
  let revealedCount = 0;
  let remainingMines = MINE_COUNT;

  const connectedGroups = new Map<CellKey, ConnectedMineGroup>();
  let allGroups = new Set<ConnectedMineGroup>();
  const tilesWithoutInformation = new Set<CellKey>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      tilesWithoutInformation.add(cellKey(r, c));
    }
  }

  function revealSingle(r: number, c: number): void {
    if (state[r][c] !== "unknown") return;
    state[r][c] = board[r][c].adjacentMines;
    const key = cellKey(r, c);
    tilesWithoutInformation.delete(key);
    revealedCount++;
    const cg = connectedGroups.get(key);
    if (cg) cg.markSafe(key);
  }

  function reveal(r: number, c: number): CellKey[] {
    const queue: Cell[] = [[r, c]];
    const revealed: CellKey[] = [];
    while (queue.length > 0) {
      const [rr, cc] = queue.shift()!;
      if (state[rr][cc] !== "unknown") continue;
      revealSingle(rr, cc);
      revealed.push(cellKey(rr, cc));
      if (board[rr][cc].adjacentMines === 0) {
        for (const [nr, nc] of neighbors(rr, cc)) {
          if (state[nr][nc] === "unknown") queue.push([nr, nc]);
        }
      }
    }
    return revealed;
  }

  function markMine(r: number, c: number): void {
    const key = cellKey(r, c);
    tilesWithoutInformation.delete(key);
    state[r][c] = "mine";
    remainingMines--;
    const cg = connectedGroups.get(key);
    if (cg) cg.markMine(key);
  }

  // Initial reveal
  let revealed = reveal(startRow, startCol);

  // Main solving loop
  while (revealed.length > 0) {
    // Remove empty connected groups
    allGroups = new Set(Array.from(allGroups).filter(g => !g.isEmpty()));

    // Optimize subgroups
    for (const group of Array.from(allGroups)) {
      group.reassessForSubsets();
    }

    // Update connected groups with constraints from newly revealed cells
    for (const key of revealed) {
      const [r, c] = parseKey(key);
      if (state[r][c] === 0) continue;

      const unknownNeighbors = new Set<CellKey>();
      for (const [nr, nc] of neighbors(r, c)) {
        if (state[nr][nc] === "unknown") unknownNeighbors.add(cellKey(nr, nc));
      }
      if (unknownNeighbors.size === 0) continue;

      for (const nk of unknownNeighbors) {
        tilesWithoutInformation.delete(nk);
      }

      let mineCount = 0;
      for (const [nr, nc] of neighbors(r, c)) {
        if (state[nr][nc] === "mine") mineCount++;
      }
      const mineGroup = new MineGroup(unknownNeighbors, (state[r][c] as number) - mineCount);

      // Deduplicate relevant connected groups
      const relevantSet = new Set<ConnectedMineGroup>();
      for (const cell of unknownNeighbors) {
        const cg = connectedGroups.get(cell);
        if (cg) relevantSet.add(cg);
      }
      const relevantConnectedGroups = Array.from(relevantSet);

      if (relevantConnectedGroups.length === 0) {
        const newGroup = new ConnectedMineGroup();
        newGroup.addGroup(mineGroup);
        for (const cell of unknownNeighbors) {
          connectedGroups.set(cell, newGroup);
        }
        allGroups.add(newGroup);
      } else if (relevantConnectedGroups.length === 1) {
        relevantConnectedGroups[0].addGroup(mineGroup);
        for (const cell of unknownNeighbors) {
          connectedGroups.set(cell, relevantConnectedGroups[0]);
        }
      } else {
        const mergedGroup = mergeDisjointedConnectedGroups(relevantConnectedGroups);
        mergedGroup.addGroup(mineGroup);
        for (const cell of mergedGroup.relevantCells) {
          connectedGroups.set(cell, mergedGroup);
        }
        allGroups.add(mergedGroup);
        for (const group of relevantConnectedGroups) {
          allGroups.delete(group);
        }
      }
    }

    // Split any connected groups that have become disjoint
    const newAllGroups = new Set<ConnectedMineGroup>();
    for (const group of allGroups) {
      for (const component of group.splitIfDisjoint()) {
        newAllGroups.add(component);
        for (const cell of component.relevantCells) {
          connectedGroups.set(cell, component);
        }
      }
    }
    allGroups = newAllGroups;

    // Solve groups to find new safe/mine cells
    const toReveal = new Set<CellKey>();
    const toMarkMine = new Set<CellKey>();
    let maxMinesUsed = 0;
    for (const group of allGroups) {
      const { safeCells, mineCells, maxMinesUsed: groupMax } = group.solveGroups(remainingMines);
      for (const c of safeCells) toReveal.add(c);
      for (const c of mineCells) toMarkMine.add(c);
      maxMinesUsed += groupMax;
    }

    const minMinesRemaining = remainingMines - maxMinesUsed;
    if (minMinesRemaining === tilesWithoutInformation.size) {
      for (const cell of tilesWithoutInformation) toMarkMine.add(cell);
    }

    for (const key of toMarkMine) {
      const [r, c] = parseKey(key);
      markMine(r, c);
    }

    const allRevealed = new Set<CellKey>();
    for (const key of toReveal) {
      const [r, c] = parseKey(key);
      for (const rk of reveal(r, c)) {
        allRevealed.add(rk);
      }
    }

    revealed = Array.from(allRevealed);
  }

  return revealedCount === totalSafe;
}
