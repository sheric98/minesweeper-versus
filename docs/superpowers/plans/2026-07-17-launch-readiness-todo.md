# Launch Readiness (TODO.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 9 open items in `TODO.md` — board-size presets, touch support, restart affordance, stats pitch page, landing-page framing, no-guess explainer, page title, leaderboard integrity mitigation, and a JWT_SECRET startup guard.

**Architecture:** Frontend work happens in `/home/sheric/minesweeper-web` (Next.js 16 App Router). The core refactor makes game logic and presentational components board-size-agnostic (dimensions derived from the `Board` value or a `BoardConfig` parameter) while keeping the exported `ROWS`/`COLS`/`MINE_COUNT` constants as the expert preset so multiplayer and the no-guess generator are untouched. Backend work (items 8–9) happens in the separate repo `/home/sheric/minesweeper-web-server` (Flask).

**Tech Stack:** Next.js 16, React 19 (strict TS), Tailwind CSS v4, vitest; Flask + psycopg (Postgres), pytest.

## Global Constraints

- Multiplayer stays exactly 30×16 / 99 mines. Do not change multiplayer gameplay.
- Board presets (exact): Beginner 9×9 / 10 mines, Intermediate 16×16 / 40 mines, Expert 30×16 / 99 mines (rows=16, cols=30).
- Page title copy (exact): `Minesweeper — Solo, No-Guess & Multiplayer Races`.
- No-guess explainer copy (exact): `Every board is solvable by pure logic — no 50/50 guesses. Difficulty sets how deep the deductions go; the board is always 30×16.`
- Tailwind v4: never build class names with template literals; use full literal class strings (scanner requirement).
- React 19: never write `ref.current = value` during render; sync refs in `useLayoutEffect`.
- Frontend tests: `npm test` (vitest). Lint: `npm run lint`. Build: `npm run build`.
- Backend tests must run in mock mode: `cd /home/sheric/minesweeper-web-server && DATABASE_URL="" ./venv/bin/python -m pytest tests/test_singleplayer.py -v` (the local `.env` points DATABASE_URL at a docker host, so it must be blanked).
- Backend and frontend are **separate git repos**; commit backend changes in `/home/sheric/minesweeper-web-server`.
- Deploy ordering note (record in commit messages, don't act on it): frontend must deploy **before or with** the backend for Task 12, otherwise legit wins get excluded from the leaderboard for lack of a start ping.

---

### Task 1: Board-size-aware game logic in `minesweeper.ts`

**Files:**
- Modify: `app/lib/minesweeper.ts`
- Test: `app/lib/__tests__/minesweeper.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface BoardConfig { rows: number; cols: number; mines: number }`, `type BoardSizePreset = "beginner" | "intermediate" | "expert"`, `const BOARD_PRESETS: Record<BoardSizePreset, BoardConfig>`, `createEmptyBoard(config?: BoardConfig)`, `generateBoard(firstRow, firstCol, config?: BoardConfig)`. `ROWS`/`COLS`/`MINE_COUNT` remain exported and equal the expert preset. `checkWin`/`revealAllMines`/`countFlags` derive dimensions from the board argument (no signature change).

- [ ] **Step 1: Write failing tests**

Append to `app/lib/__tests__/minesweeper.test.ts` (match the file's existing import/describe style):

```ts
import { BOARD_PRESETS, createEmptyBoard, generateBoard, checkWin, countFlags, toggleFlag } from "@/app/lib/minesweeper";

describe("board size presets", () => {
  it("defines the three classic presets", () => {
    expect(BOARD_PRESETS.beginner).toEqual({ rows: 9, cols: 9, mines: 10 });
    expect(BOARD_PRESETS.intermediate).toEqual({ rows: 16, cols: 16, mines: 40 });
    expect(BOARD_PRESETS.expert).toEqual({ rows: 16, cols: 30, mines: 99 });
  });

  it("createEmptyBoard respects the config", () => {
    const b = createEmptyBoard(BOARD_PRESETS.beginner);
    expect(b.length).toBe(9);
    expect(b[0].length).toBe(9);
  });

  it("createEmptyBoard defaults to expert", () => {
    const b = createEmptyBoard();
    expect(b.length).toBe(16);
    expect(b[0].length).toBe(30);
  });

  it("generateBoard places the configured mine count with a safe first click", () => {
    const b = generateBoard(4, 4, BOARD_PRESETS.beginner);
    expect(b.length).toBe(9);
    expect(b[0].length).toBe(9);
    let mines = 0;
    for (const row of b) for (const cell of row) if (cell.isMine) mines++;
    expect(mines).toBe(10);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        expect(b[4 + dr][4 + dc].isMine).toBe(false);
  });

  it("checkWin and countFlags work on non-expert dimensions", () => {
    let b = generateBoard(4, 4, BOARD_PRESETS.beginner);
    // reveal every non-mine cell directly
    b = b.map(row => row.map(c => (c.isMine ? c : { ...c, state: "revealed" as const })));
    expect(checkWin(b)).toBe(true);
    b = toggleFlag(b, 0, 0); // corner may be a mine or not; flag any unrevealed cell
    // countFlags must scan the full 9×9 board without touching expert bounds
    expect(countFlags(b)).toBeLessThanOrEqual(1);
  });
});
```

Note: in the last test, `toggleFlag(b, 0, 0)` only flags if `(0,0)` is unflagged/unrevealed; since all non-mines are revealed, it flags only if `(0,0)` is a mine — hence `toBeLessThanOrEqual(1)`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: new tests FAIL (`BOARD_PRESETS` not exported; `createEmptyBoard`/`generateBoard` reject arguments / use 16×30).

- [ ] **Step 3: Implement in `app/lib/minesweeper.ts`**

Replace the top constants with:

```ts
export interface BoardConfig {
  rows: number;
  cols: number;
  mines: number;
}

export type BoardSizePreset = "beginner" | "intermediate" | "expert";

export const BOARD_PRESETS: Record<BoardSizePreset, BoardConfig> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

// Expert-board constants; multiplayer and the no-guess generator are fixed to this size.
export const ROWS = BOARD_PRESETS.expert.rows;
export const COLS = BOARD_PRESETS.expert.cols;
export const MINE_COUNT = BOARD_PRESETS.expert.mines;
```

Change `createEmptyBoard` and `generateBoard` to take a config (defaulting to expert):

```ts
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
  ...
}
```

Inside `generateBoard`, replace every `ROWS`/`COLS`/`MINE_COUNT` reference with `rows`/`cols`/`mines`.

In `checkWin`, `revealAllMines`, and `countFlags`, replace the `ROWS`/`COLS` loop bounds with `board.length` / `board[0].length` (mirroring what `revealCell` and `chordReveal` already do). Example for `countFlags`:

```ts
export function countFlags(board: Board): number {
  let count = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c].state === "flagged") count++;
    }
  }
  return count;
}
```

- [ ] **Step 4: Run tests — all pass**

Run: `npm test`
Expected: PASS (including all pre-existing tests, which rely on the defaults).

- [ ] **Step 5: Commit**

```bash
git add app/lib/minesweeper.ts app/lib/__tests__/minesweeper.test.ts
git commit -m "feat: parameterize game logic by board size (classic presets)"
```

---

### Task 2: Dimension-agnostic presentational components

**Files:**
- Modify: `app/lib/useBoardInput.ts` (`computeSunkCells`)
- Modify: `app/components/Board.tsx`
- Modify: `app/components/Header.tsx`
- Modify: `app/components/MinesweeperGame.tsx` (container style only)
- Modify: `app/components/MultiplayerGame.tsx` (container style only, line ~407)

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: a `--board-width` CSS custom property defined next to `--cell-size` on both game containers; `Header` and (later) `SelectorTabs` size themselves with `width: "var(--board-width)"`. `Board` derives its column count from `board[0].length`.

- [ ] **Step 1: `useBoardInput.ts` — derive dims from board**

In `computeSunkCells`, replace `ROWS`/`COLS` with `board.length`/`board[0].length` and delete the `ROWS, COLS` import (keep `type Board`):

```ts
import { type Board } from "@/app/lib/minesweeper";
...
        if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length && board[nr][nc].state === "unrevealed") {
```

- [ ] **Step 2: `Board.tsx` — column count from data**

Remove the `COLS` import; change the grid style:

```tsx
import { Board, GamePhase } from "@/app/lib/minesweeper";
...
      style={{ display: "grid", gridTemplateColumns: `repeat(${board[0].length}, var(--cell-size))` }}
```

- [ ] **Step 3: `Header.tsx` — width from CSS var**

Remove the `COLS` import; change the container width:

```tsx
import { GamePhase } from "@/app/lib/minesweeper";
...
      style={{ width: "var(--board-width)" }}
```

- [ ] **Step 4: Define `--board-width` on both game containers**

`MinesweeperGame.tsx` root div style (temporary hardcoded 30; Task 4 makes it dynamic):

```tsx
      style={{
        "--cell-size": "clamp(0.625rem, calc((100vw - 2rem) / 30), 1.75rem)",
        "--board-width": "calc(30 * var(--cell-size) + 8px)",
      } as CSSProperties}
```

`MultiplayerGame.tsx` line ~407 (this one stays hardcoded to 30 forever):

```tsx
      style={{
        "--cell-size": "clamp(0.625rem, calc((100vw - 2rem) / 30), 1.75rem)",
        "--board-width": "calc(30 * var(--cell-size) + 8px)",
      } as CSSProperties}
```

Also update `DifficultySelector.tsx`'s width style to `style={{ width: "var(--board-width)" }}` and remove its `COLS` import (the component is replaced in Task 3, but this keeps the tree consistent if Task 3 is reviewed separately).

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. Then eyeball `/` and `/multiplayer` (mock mode) render identically to before: `npm run dev` + headless Chrome screenshot (see `memory/browser-verification-setup.md`):
`google-chrome --headless=new --disable-gpu --no-sandbox --window-size=1280,950 --virtual-time-budget=8000 --screenshot=/tmp/claude-1000/-home-sheric-minesweeper-web/0c48d6a3-b94c-4b3a-a337-a94f4514bb58/scratchpad/home.png http://localhost:3000`

- [ ] **Step 6: Commit**

```bash
git add app/lib/useBoardInput.ts app/components/Board.tsx app/components/Header.tsx app/components/MinesweeperGame.tsx app/components/MultiplayerGame.tsx app/components/DifficultySelector.tsx
git commit -m "refactor: derive board dimensions from data / --board-width var"
```

---

### Task 3: Generic `SelectorTabs`; move `NoGuessDifficulty` into lib

**Files:**
- Create: `app/components/SelectorTabs.tsx`
- Delete: `app/components/DifficultySelector.tsx`
- Modify: `app/lib/minesweeper.ts` (add the type), `app/lib/board-generator.ts`, `app/lib/board-generator.worker.ts`, `app/components/MinesweeperGame.tsx`

**Interfaces:**
- Produces: `NoGuessDifficulty` exported from `@/app/lib/minesweeper`; `SelectorTabs<T extends string>` component with props `{ options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }`, sized by `var(--board-width)`.

- [ ] **Step 1: Add to `app/lib/minesweeper.ts`**

```ts
export type NoGuessDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
```

- [ ] **Step 2: Create `app/components/SelectorTabs.tsx`**

```tsx
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

interface SelectorTabsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export default function SelectorTabs<T extends string>({ options, value, onChange }: SelectorTabsProps<T>) {
  return (
    <div className="flex" style={{ width: "var(--board-width)" }}>
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 px-2 py-1 text-xs font-bold cursor-pointer bg-[#c0c0c0] ${v === value ? SUNKEN_INNER : RAISED_INNER}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update imports and call sites**

- `app/lib/board-generator.ts` and `app/lib/board-generator.worker.ts`: `import type { NoGuessDifficulty } from "./minesweeper";` (generator) / `from "@/app/lib/minesweeper"` (worker) instead of the DifficultySelector import.
- `app/components/MinesweeperGame.tsx`: replace the `DifficultySelector` import with

```tsx
import SelectorTabs from "@/app/components/SelectorTabs";
import { ..., type NoGuessDifficulty } from "@/app/lib/minesweeper";
```

  add near the top of the file:

```tsx
const NO_GUESS_OPTIONS: { value: NoGuessDifficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];
```

  and replace the render:

```tsx
        {mode === "no-guess" && (
          <SelectorTabs options={NO_GUESS_OPTIONS} value={difficulty} onChange={handleDifficultyChange} />
        )}
```

- Delete `app/components/DifficultySelector.tsx`. Then `grep -rn "DifficultySelector" app` must return nothing.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run lint && npm run build` — all pass.

```bash
git add -A app
git commit -m "refactor: generic SelectorTabs; NoGuessDifficulty lives in lib"
```

---

### Task 4: Board-size presets on `/` (TODO #1)

**Files:**
- Modify: `app/components/MinesweeperGame.tsx`

**Interfaces:**
- Consumes: `BOARD_PRESETS`, `BoardSizePreset`, `createEmptyBoard(config)`, `generateBoard(r, c, config)` from Task 1; `SelectorTabs` from Task 3.
- Produces: size tabs on random mode; leaderboard/score submission gated to `mode === "no-guess" || sizePreset === "expert"`; coarse-pointer devices default to beginner.

- [ ] **Step 1: State and derived config**

In `MinesweeperGame.tsx`, import `BOARD_PRESETS, type BoardSizePreset` from `@/app/lib/minesweeper` (drop the `MINE_COUNT` import). Add:

```tsx
const SIZE_OPTIONS: { value: BoardSizePreset; label: string }[] = [
  { value: "beginner", label: "Beginner 9×9" },
  { value: "intermediate", label: "Intermediate 16×16" },
  { value: "expert", label: "Expert 30×16" },
];
```

Inside the component:

```tsx
  const [sizePreset, setSizePreset] = useState<BoardSizePreset>("expert");
  // Random mode plays any preset; no-guess boards are always expert-sized
  // (solver difficulty tabs vary logic depth, not size).
  const boardConfig = mode === "no-guess" ? BOARD_PRESETS.expert : BOARD_PRESETS[sizePreset];
```

Change the `showLeaderboard` line:

```tsx
  const showLeaderboard = mode === "no-guess" || sizePreset === "expert";
```

Change `flagsRemaining`:

```tsx
  const flagsRemaining = boardConfig.mines - countFlags(board);
```

- [ ] **Step 2: Thread the config through board creation**

- `handleReveal` random path: `workingBoard = generateBoard(row, col, boardConfig);` and add `boardConfig` to the `useCallback` deps.
- `handleReset`: `setBoard(createEmptyBoard(boardConfig));` with `[boardConfig]` deps.
- Add a size-change handler (mirrors `handleDifficultyChange`):

```tsx
  const handleSizeChange = useCallback((p: BoardSizePreset) => {
    setSizePreset(p);
    setBoard(createEmptyBoard(BOARD_PRESETS[p]));
    setPhase("idle");
    setElapsedSeconds(0);
    clientGameIdRef.current = null;
    submittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, []);
```

- [ ] **Step 3: Dynamic CSS vars and size tabs**

Root div style becomes:

```tsx
      style={{
        "--cell-size": `clamp(0.625rem, calc((100vw - 2rem) / ${boardConfig.cols}), 1.75rem)`,
        "--board-width": `calc(${boardConfig.cols} * var(--cell-size) + 8px)`,
      } as CSSProperties}
```

Above the `Header`, next to the existing no-guess tabs:

```tsx
        {mode === "random" && (
          <SelectorTabs options={SIZE_OPTIONS} value={sizePreset} onChange={handleSizeChange} />
        )}
```

- [ ] **Step 4: Beginner default on touch devices**

```tsx
  // Casual touch-device visitors get the small board by default (30 cols is untappable on phones).
  useEffect(() => {
    if (mode !== "random") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    Promise.resolve().then(() => handleSizeChange("beginner"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(Runs once on mount, before any interaction, so resetting to an empty beginner board is safe.)

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build` — pass.
Browser check (dev server + headless Chrome): `/` shows three size tabs; clicking Beginner renders a 9×9 board with flag counter `010`; leaderboard panel disappears on Beginner/Intermediate and returns on Expert; `/no-guess` still shows the four solver tabs and a 30×16 board.

- [ ] **Step 6: Commit**

```bash
git add app/components/MinesweeperGame.tsx
git commit -m "feat: classic board-size presets on singleplayer (TODO #1)"
```

---

### Task 5: Touch input support (TODO #2, input half)

**Files:**
- Modify: `app/lib/useBoardInput.ts`, `app/components/Cell.tsx`, `app/components/Board.tsx`, `app/components/MinesweeperGame.tsx`, `app/components/MultiplayerGame.tsx`

**Interfaces:**
- Produces: `cellHandlers.onCellTouchStart(e, row, col)`, `onCellTouchEnd(e, row, col)`, `onCellTouchMove(e)` on `BoardInputHandlers`; `Board`/`Cell` accept and wire `onCellTouchStart`, `onCellTouchEnd`, `onCellTouchMove` props. Semantics: tap = reveal (or chord on a revealed number), long-press ≥350 ms = flag (with `navigator.vibrate` haptic), finger movement >12 px cancels (scroll).

- [ ] **Step 1: Extend `useBoardInput.ts`**

Add refs after the existing ones:

```ts
  // Touch state: tap = reveal/chord, long-press = flag. Mouse handlers ignore
  // events for 700ms after a touch so the browser's emulated click/contextmenu
  // (fired after touchend / during long-press) can't double-act.
  const touchStartRef = useRef<{ row: number; col: number; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const lastTouchEndRef = useRef(0);
```

Add the handlers (before the `return`):

```ts
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleCellTouchStart = useCallback((e: React.TouchEvent, row: number, col: number) => {
    if (!enabledRef.current) return;
    const t = e.touches[0];
    touchStartRef.current = { row, col, x: t.clientX, y: t.clientY };
    longPressFiredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      const b = boardRef.current;
      if (!b || !enabledRef.current) return;
      const cell = b[row][col];
      if (cell.state === "unrevealed" || cell.state === "flagged" || cell.state === "question") {
        onFlagRef.current(row, col);
        navigator.vibrate?.(50);
      }
    }, 350);
  }, [clearLongPressTimer]);

  const handleCellTouchMove = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > 12 || Math.abs(t.clientY - start.y) > 12) {
      // Finger is scrolling, not tapping — cancel.
      touchStartRef.current = null;
      clearLongPressTimer();
    }
  }, [clearLongPressTimer]);

  const handleCellTouchEnd = useCallback((e: React.TouchEvent, row: number, col: number) => {
    lastTouchEndRef.current = Date.now();
    clearLongPressTimer();
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (e.cancelable) e.preventDefault(); // suppress emulated mouse events where possible
    if (!start || longPressFiredRef.current) return;
    if (start.row !== row || start.col !== col) return;
    if (!enabledRef.current) return;
    const b = boardRef.current;
    if (!b) return;
    const cell = b[row][col];
    if (cell.state === "revealed") {
      onChordRef.current(row, col);
    } else if (cell.state === "unrevealed") {
      onRevealRef.current(row, col);
    }
    // flagged/question: tap does nothing — unflag via long-press only.
  }, [clearLongPressTimer]);
```

Guard the mouse paths. At the top of `handleCellLeftClick`:

```ts
    if (Date.now() - lastTouchEndRef.current < 700) return;
```

At the top of `handleCellRightClick` (after `e.preventDefault()`):

```ts
    if (touchStartRef.current || Date.now() - lastTouchEndRef.current < 700) return;
```

Extend `BoardInputHandlers.cellHandlers` type and the returned object:

```ts
    onCellTouchStart: (e: React.TouchEvent, row: number, col: number) => void;
    onCellTouchEnd: (e: React.TouchEvent, row: number, col: number) => void;
    onCellTouchMove: (e: React.TouchEvent) => void;
...
      onCellTouchStart: handleCellTouchStart,
      onCellTouchEnd: handleCellTouchEnd,
      onCellTouchMove: handleCellTouchMove,
```

- [ ] **Step 2: Wire `Cell.tsx`**

Add props:

```tsx
  onTouchStart: (e: React.TouchEvent, row: number, col: number) => void;
  onTouchEnd: (e: React.TouchEvent, row: number, col: number) => void;
  onTouchMove: (e: React.TouchEvent) => void;
```

In the component body:

```tsx
  const touchProps = {
    onTouchStart: (e: React.TouchEvent) => onTouchStart(e, row, col),
    onTouchEnd: (e: React.TouchEvent) => onTouchEnd(e, row, col),
    onTouchMove,
  };
```

Spread `{...touchProps}` on the `unrevealed`, `flagged`, `question`, and `revealed` branch divs (not the mine/game-over states).

- [ ] **Step 3: Wire `Board.tsx`**

Add to `BoardProps` and pass through to `Cell`:

```tsx
  onCellTouchStart: (e: React.TouchEvent, row: number, col: number) => void;
  onCellTouchEnd: (e: React.TouchEvent, row: number, col: number) => void;
  onCellTouchMove: (e: React.TouchEvent) => void;
```

On the grid container div, add the class `touch-manipulation` (blocks double-tap zoom, keeps scrolling) and iOS callout suppression in the style object:

```tsx
      className="touch-manipulation border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${board[0].length}, var(--cell-size))`, WebkitTouchCallout: "none" } as React.CSSProperties}
```

Each `<Cell>` gets `onTouchStart={onCellTouchStart} onTouchEnd={onCellTouchEnd} onTouchMove={onCellTouchMove}`.

- [ ] **Step 4: Pass the three new props at both call sites**

In `MinesweeperGame.tsx` and `MultiplayerGame.tsx` (line ~439), add to `<BoardComponent>`:

```tsx
              onCellTouchStart={cellHandlers.onCellTouchStart}
              onCellTouchEnd={cellHandlers.onCellTouchEnd}
              onCellTouchMove={cellHandlers.onCellTouchMove}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build` — pass.
Touch check via CDP (`Input.dispatchTouchEvent` with headless Chrome, per `memory/browser-verification-setup.md`): a dispatched tap on an unrevealed cell reveals it; a touchStart held 400 ms then released flags the cell and does not also reveal it. Desktop mouse behavior unchanged (click reveals, right-click flags).

- [ ] **Step 6: Commit**

```bash
git add app/lib/useBoardInput.ts app/components/Cell.tsx app/components/Board.tsx app/components/MinesweeperGame.tsx app/components/MultiplayerGame.tsx
git commit -m "feat: touch input — tap reveals, long-press flags, tap number chords (TODO #2)"
```

---

### Task 6: NavBar mobile layout (TODO #2, navbar half)

**Files:**
- Modify: `app/components/NavBar.tsx`

- [ ] **Step 1: Let the nav wrap instead of overflowing**

```tsx
    <nav className="w-full bg-ms-silver border-b-2 border-ms-dark flex flex-wrap items-center gap-1 px-2 sm:px-3 py-1">
```

and each link:

```tsx
            className="px-2 sm:px-4 py-1 text-sm font-bold select-none bg-ms-silver hover:brightness-95"
```

- [ ] **Step 2: Verify**

`npm run lint && npm run build` pass. Screenshot at 390 px width (`--window-size=390,844`): no horizontal scrollbar; nav wraps to a second row; the game timer is fully visible on the beginner board.

- [ ] **Step 3: Commit**

```bash
git add app/components/NavBar.tsx
git commit -m "fix: navbar wraps at phone widths instead of overflowing (TODO #2)"
```

---

### Task 7: Restart affordance after losing (TODO #3)

**Files:**
- Modify: `app/components/MinesweeperGame.tsx`, `app/components/HowToPlayHint.tsx`

- [ ] **Step 1: Status copy + F2**

In `MinesweeperGame.tsx`, change the lost status line to:

```tsx
            {!isGenerating && phase === "lost" && (
              <span className="text-red-500">Game over — click 🙂 to try again</span>
            )}
```

Add the classic F2 shortcut (near the timer effect):

```tsx
  // Classic Windows Minesweeper shortcut: F2 starts a new game.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      handleReset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleReset]);
```

- [ ] **Step 2: Mention restart in HowToPlayHint**

In `HowToPlayHint.tsx`, append to the `hints` array (before the `.filter`):

```ts
  const hints = [
    "Left-click reveals",
    "Right-click flags",
    CHORD_HINTS[controls.chordTrigger],
    SPACEBAR_HINTS[controls.spacebarAction],
    "🙂 or F2 starts a new game",
  ].filter((h): h is string => h !== null);
```

- [ ] **Step 3: Verify + commit**

`npm run lint && npm run build` pass; in the browser, lose a game → status shows the new copy; pressing F2 resets to an idle board.

```bash
git add app/components/MinesweeperGame.tsx app/components/HowToPlayHint.tsx
git commit -m "feat: restart affordance — status copy, F2 shortcut, hint (TODO #3)"
```

---

### Task 8: Stats sign-in pitch for anonymous users (TODO #4)

**Files:**
- Modify: `app/stats/page.tsx`

**Interfaces:**
- Consumes: `SignInButton` (client component, no props), `RAISED_OUTER` from `@/app/lib/win95`.

- [ ] **Step 1: Replace the redirect with a pitch page**

In `app/stats/page.tsx`, delete the `redirect` import and the `if (authLevel !== "google") redirect("/")` block; add imports:

```tsx
import SignInButton from "@/app/components/SignInButton";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";
```

and before the signed-in return:

```tsx
  if (authLevel !== "google") {
    return (
      <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4">
        <div className={`${RAISED_OUTER} bg-[#c0c0c0] w-full max-w-md`}>
          <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
            Stats
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-3">
            <p className="text-sm font-bold">Sign in to track your stats</p>
            <div className={`${SUNKEN_INNER} bg-white w-full px-4 py-3`}>
              <ul className="text-xs leading-5 list-disc pl-4">
                <li>Lifetime wins and fastest times per mode</li>
                <li>Recent win rate over your last 100 games</li>
                <li>Spots on the global leaderboards</li>
                <li>Multiplayer ELO and head-to-head records</li>
              </ul>
            </div>
            <SignInButton />
          </div>
        </div>
      </main>
    );
  }
```

- [ ] **Step 2: Verify + commit**

`npm run lint && npm run build` pass. In a cookie-less browser session, `/stats` renders the pitch (no redirect); the nav link no longer dead-ends.

```bash
git add app/stats/page.tsx
git commit -m "feat: stats page pitches sign-in instead of bouncing anonymous users (TODO #4)"
```

---

### Task 9: Win95 window chrome on the game + multiplayer teaser + no-guess explainer (TODO #5, #6)

**Files:**
- Modify: `app/components/MinesweeperGame.tsx`, `app/page.tsx`, `app/no-guess/page.tsx`

**Interfaces:**
- Produces: `MinesweeperGame` props `windowTitle?: string` and `subtitle?: string`. When `windowTitle` is set, the game column is wrapped in a `RAISED_OUTER` window with a `#000080` title bar (same pattern as `ControlsSettingsForm.tsx:34`).

- [ ] **Step 1: Window chrome in `MinesweeperGame`**

Import `RAISED_OUTER` from `@/app/lib/win95`. Add `windowTitle` and `subtitle` to `MinesweeperGameProps` and destructure them. Restructure the left column so tabs/header/board/status sit inside the window while `HowToPlayHint` stays outside:

```tsx
      <div className="flex flex-col items-center gap-0">
        <div className={windowTitle ? `${RAISED_OUTER} bg-[#c0c0c0] p-1 flex flex-col` : "flex flex-col"}>
          {windowTitle && (
            <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none mb-1">
              {windowTitle}
            </div>
          )}
          {subtitle && (
            <div className="text-xs text-center px-2 pb-1 max-w-md">{subtitle}</div>
          )}
          {mode === "no-guess" && (
            <SelectorTabs options={NO_GUESS_OPTIONS} value={difficulty} onChange={handleDifficultyChange} />
          )}
          {mode === "random" && (
            <SelectorTabs options={SIZE_OPTIONS} value={sizePreset} onChange={handleSizeChange} />
          )}
          <Header ... />
          <BoardComponent ... />
          {/* status bar block stays here */}
        </div>
        <HowToPlayHint />
      </div>
```

(Keep all existing props/children of Header/Board/status untouched — only the wrapper moves.)

- [ ] **Step 2: `/` — title + teaser**

`app/page.tsx` return becomes:

```tsx
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#c0c0c0] py-6">
      <MinesweeperGame mode="random" authLevel={authLevel} username={username} windowTitle="Minesweeper" />
      <p className="text-sm select-none">
        Race a friend in real time →{" "}
        <Link href="/multiplayer" className="font-bold underline">
          Multiplayer
        </Link>
      </p>
    </main>
  );
```

with `import Link from "next/link";` added.

- [ ] **Step 3: `/no-guess` — title + explainer subtitle**

`app/no-guess/page.tsx`:

```tsx
      <MinesweeperGame
        mode="no-guess"
        authLevel={authLevel}
        username={username}
        windowTitle="Minesweeper — No Guess"
        subtitle="Every board is solvable by pure logic — no 50/50 guesses. Difficulty sets how deep the deductions go; the board is always 30×16."
      />
```

(also change that page's `<main>` to the same column layout as `/` minus the teaser: `flex flex-1 flex-col items-center justify-center bg-[#c0c0c0] py-6`).

- [ ] **Step 4: Verify + commit**

`npm run lint && npm run build` pass. Screenshots: `/` shows a titled Win95 window around the game and the multiplayer teaser line; `/no-guess` shows its title and the explainer; leaderboard column still sits beside the window on xl screens.

```bash
git add app/components/MinesweeperGame.tsx app/page.tsx app/no-guess/page.tsx
git commit -m "feat: Win95 window chrome, multiplayer teaser, no-guess explainer (TODO #5, #6)"
```

---

### Task 10: Page title (TODO #7)

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update metadata**

In the `metadata` object replace the three `title` fields with `"Minesweeper — Solo, No-Guess & Multiplayer Races"` (top-level, `openGraph.title`, `twitter.title`). Leave descriptions as-is.

- [ ] **Step 2: Verify + commit**

`npm run build` passes; `curl -s localhost:3000 | grep -o '<title>[^<]*'` shows the new title.

```bash
git add app/layout.tsx
git commit -m "feat: differentiated page title (TODO #7)"
```

---

### Task 11 (backend repo): JWT_SECRET startup guard (TODO #9)

**Files:**
- Modify: `/home/sheric/minesweeper-web-server/config.py`

- [ ] **Step 1: Fail fast in production**

Replace line 4 of `config.py`:

```py
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    if os.environ.get("DATABASE_URL"):
        # Production (any DB-backed deployment): a random per-process secret
        # would log every user out on each restart. Refuse to start.
        raise RuntimeError("JWT_SECRET must be set when DATABASE_URL is configured")
    # Mock/local mode: ephemeral secret is fine.
    JWT_SECRET = secrets.token_hex(32)
```

- [ ] **Step 2: Verify**

```bash
cd /home/sheric/minesweeper-web-server
DATABASE_URL="" ./venv/bin/python -c "import config; print('mock ok')"
DATABASE_URL="postgres://x" JWT_SECRET="" ./venv/bin/python -c "import config" ; echo "exit=$?"
DATABASE_URL="postgres://x" JWT_SECRET="s" ./venv/bin/python -c "import config; print('prod ok')"
```

Expected: `mock ok`; RuntimeError with nonzero exit; `prod ok`. Also run the existing suite: `DATABASE_URL="" ./venv/bin/python -m pytest tests/test_singleplayer.py tests/test_preferences.py -v` — passes.

- [ ] **Step 3: Commit (backend repo)**

```bash
cd /home/sheric/minesweeper-web-server
git add config.py
git commit -m "fix: refuse to start in production without JWT_SECRET (TODO #9)"
```

Note for the final report: this makes a missing prod secret loud at next deploy; actually confirming the EC2 `.env` has `JWT_SECRET` is an ops step the user must do.

---

### Task 12: Leaderboard integrity — server-observed game duration (TODO #8)

Mitigation, not a full fix: a win time only qualifies for the public leaderboard if at least that much wall-clock time elapsed (server-observed) since the game's start ping. This blocks instantly-forged fast times and bulk forging; a forger must now wait the claimed time in real time per score. Stats (wins/fastest) still record either way so a lost start ping never eats a legit game.

**Files:**
- Backend modify: `/home/sheric/minesweeper-web-server/db.py`, `/home/sheric/minesweeper-web-server/singleplayer.py`
- Backend test: `/home/sheric/minesweeper-web-server/tests/test_singleplayer.py`
- Frontend create: `app/api/singleplayer/games/start/route.ts`
- Frontend modify: `app/components/MinesweeperGame.tsx`

**Interfaces:**
- Produces (backend): `POST /singleplayer/games/start` `{client_game_id: <uuid>}` → `{"success": true}`, unauthenticated, rate-limited per `client_ip`; pure helper `win_time_is_plausible(time_seconds, started_at, now)` in `singleplayer.py`; table `singleplayer_game_starts(client_game_id UUID PK, started_at TIMESTAMPTZ DEFAULT now())`.
- Produces (frontend): BFF route `POST /api/singleplayer/games/start` (no session required, forwards `X-Client-IP`); `MinesweeperGame` pings it whenever a new `client_game_id` is minted.

- [ ] **Step 1 (backend): failing tests for the plausibility helper**

Append to `tests/test_singleplayer.py`:

```py
from datetime import datetime, timedelta, timezone

from singleplayer import win_time_is_plausible


def _t(seconds_ago):
    now = datetime(2026, 7, 17, 12, 0, 0, tzinfo=timezone.utc)
    return now - timedelta(seconds=seconds_ago), now


def test_plausible_when_elapsed_matches_claim():
    started_at, now = _t(60)
    assert win_time_is_plausible(60, started_at, now) is True


def test_plausible_within_tolerance():
    started_at, now = _t(57)  # claim 60s after 57s elapsed: within 5s tolerance
    assert win_time_is_plausible(60, started_at, now) is True


def test_implausible_when_claim_exceeds_elapsed():
    started_at, now = _t(10)
    assert win_time_is_plausible(60, started_at, now) is False


def test_implausible_without_start_record():
    _, now = _t(60)
    assert win_time_is_plausible(60, None, now) is False
```

Run: `cd /home/sheric/minesweeper-web-server && DATABASE_URL="" ./venv/bin/python -m pytest tests/test_singleplayer.py -v`
Expected: FAIL (ImportError: `win_time_is_plausible`).

- [ ] **Step 2 (backend): implement helper + start endpoint + leaderboard gate**

`db.py` — inside `init_db`'s schema block, after the `user_singleplayer_stats` table:

```sql
                CREATE TABLE IF NOT EXISTS singleplayer_game_starts (
                    client_game_id  UUID PRIMARY KEY,
                    started_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                );
```

`singleplayer.py` — imports gain `from rate_limit import limiter, user_or_ip, client_ip`. Add:

```py
# Claimed win times qualify for the leaderboard only when the server saw at
# least that much wall-clock time pass since the game's start ping. 5s of
# tolerance covers latency and timer rounding. This doesn't stop a patient
# forger (they can wait out the claimed time), but it kills instant/bulk forgery.
WIN_TIME_TOLERANCE_SECONDS = 5


def win_time_is_plausible(time_seconds, started_at, now):
    if started_at is None:
        return False
    elapsed = (now - started_at).total_seconds()
    return time_seconds <= elapsed + WIN_TIME_TOLERANCE_SECONDS


@singleplayer_bp.route("/singleplayer/games/start", methods=["POST"])
@limiter.limit("30 per minute; 500 per day", key_func=client_ip)
def post_game_start():
    """Record that a game began. Unauthenticated: anonymous players may sign
    in after winning (pending-score flow), so the start must predate auth."""
    if not DATABASE_URL:
        return jsonify({"success": True})

    body = request.get_json(silent=True)
    raw = body.get("client_game_id") if isinstance(body, dict) else None
    if not isinstance(raw, str):
        return jsonify({"error": "client_game_id must be a string"}), 400
    try:
        client_game_id = str(uuid.UUID(raw))
    except (ValueError, AttributeError):
        return jsonify({"error": "client_game_id must be a UUID"}), 400

    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Opportunistic cleanup: max game is 999s, keep 2h of slack.
            cur.execute(
                "DELETE FROM singleplayer_game_starts WHERE started_at < now() - interval '2 hours'"
            )
            cur.execute(
                """
                INSERT INTO singleplayer_game_starts (client_game_id)
                VALUES (%s) ON CONFLICT DO NOTHING
                """,
                (client_game_id,),
            )
        conn.commit()
        return jsonify({"success": True})
    finally:
        conn.close()
```

In `post_game`, inside the `if parsed["result"] == "win":` branch, before the Step-4 leaderboard SELECT, add:

```py
                # Leaderboard integrity: only plausible times qualify (stats above
                # are unaffected so a lost start-ping never drops a legit game).
                cur.execute(
                    "SELECT started_at, now() FROM singleplayer_game_starts WHERE client_game_id = %s",
                    (parsed["client_game_id"],),
                )
                start_row = cur.fetchone()
                plausible = start_row is not None and win_time_is_plausible(
                    parsed["time_seconds"], start_row[0], start_row[1]
                )
```

and change the qualification line to:

```py
                qualifies = plausible and (len(rows) < 10 or parsed["time_seconds"] < rows[-1][1])
```

(Keep the SELECT FOR UPDATE and everything else in place; when `plausible` is False, steps 1–3 still ran.)

- [ ] **Step 3 (backend): tests pass, commit**

Run: `DATABASE_URL="" ./venv/bin/python -m pytest tests/test_singleplayer.py -v` — all pass (old and new).

```bash
cd /home/sheric/minesweeper-web-server
git add db.py singleplayer.py tests/test_singleplayer.py
git commit -m "feat: leaderboard requires server-observed game duration (TODO #8)

Deploy note: ship the frontend start-ping first (or together) or legit
wins will be excluded from the leaderboard until it lands."
```

- [ ] **Step 4 (frontend): BFF start route**

Create `app/api/singleplayer/games/start/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

// Unauthenticated on purpose: anonymous players ping game-start too, so the
// post-win sign-in flow can still validate their pending score. The backend
// rate-limits per end-user IP via X-Client-IP (same pattern as register-session).
function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ success: true });
  }

  let backendRes: Response;
  try {
    const reqBody = await request.json();
    backendRes = await fetch(`${backendUrl}/singleplayer/games/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-IP": clientIp(request),
      },
      body: JSON.stringify(reqBody),
    });
  } catch (err) {
    console.error("[singleplayer/games/start] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
```

- [ ] **Step 5 (frontend): ping on game start**

In `MinesweeperGame.tsx`, add a module-level helper above the component:

```ts
// Fire-and-forget: registers the server-side start timestamp used to
// sanity-check win times before they reach the leaderboard.
function registerGameStart(clientGameId: string) {
  fetch("/api/singleplayer/games/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_game_id: clientGameId }),
  }).catch(() => {});
}
```

Call it right after **both** `clientGameIdRef.current = crypto.randomUUID();` assignments in `handleReveal` (the no-guess `applyBoard` closure and the random-mode path):

```ts
      clientGameIdRef.current = crypto.randomUUID();
      registerGameStart(clientGameIdRef.current);
```

- [ ] **Step 6: Verify + commit (frontend)**

`npm test && npm run lint && npm run build` pass. In dev (mock mode), starting a game fires `POST /api/singleplayer/games/start` returning `{"success":true}` (check the dev-server log / network tab via CDP).

```bash
git add app/api/singleplayer/games/start/route.ts app/components/MinesweeperGame.tsx
git commit -m "feat: game-start ping backing leaderboard time validation (TODO #8)"
```

---

### Task 13: Update TODO.md + final verification

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Full verification pass**

```bash
cd /home/sheric/minesweeper-web && npm test && npm run lint && npm run build
cd /home/sheric/minesweeper-web-server && DATABASE_URL="" ./venv/bin/python -m pytest tests/test_singleplayer.py tests/test_preferences.py -v
```

All pass. Browser smoke test of `/`, `/no-guess`, `/stats` (anonymous), `/multiplayer` (mock), plus a 390px-wide screenshot.

- [ ] **Step 2: Rewrite TODO.md's Open section**

Move items 1–7 into a `## Done 2026-07-17` section (one line each, naming the key files). For item 8 record: "mitigated — leaderboard now requires server-observed elapsed ≥ claimed time (start-ping + `win_time_is_plausible`); a patient forger can still wait out a claimed time; full fix would need server-side move replay." For item 9 record: "backend now refuses to start without JWT_SECRET when DATABASE_URL is set; **ops must still confirm the prod `.env` sets it before next deploy**."

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs: mark launch-readiness TODO items done"
```
