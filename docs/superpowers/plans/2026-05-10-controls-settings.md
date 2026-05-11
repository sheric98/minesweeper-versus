# Controls Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page that lets users customize chord trigger, spacebar action, and question-mark behavior, persisted via localStorage for guests and via a new backend endpoint for Google-signed-in users.

**Architecture:** A new `ControlsProvider` (React context) hydrates from localStorage on mount and from the backend on Google sign-in. Both `MinesweeperGame.tsx` and `MultiplayerGame.tsx` lose their duplicated mouse/keyboard plumbing (~120 lines each) in favor of a shared `useBoardInput` hook that owns input bookkeeping and branches on the user's controls. A new BFF route proxies preference reads/writes to the Flask backend.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, Vitest (already configured for `app/lib/solver/__tests__/`).

**Spec:** `docs/superpowers/specs/2026-05-10-controls-settings-design.md`

---

## File map

**New files (this repo):**
- `app/lib/controls.ts` — types, defaults, `parseControls`, storage key
- `app/lib/__tests__/controls.test.ts` — unit tests for `parseControls`
- `app/lib/__tests__/minesweeper.test.ts` — unit tests for question-mark behavior in `toggleFlag` and `chordReveal`
- `app/lib/useBoardInput.ts` — shared input hook
- `app/components/ControlsProvider.tsx` — context + `useControls` hook
- `app/components/ControlsSettingsForm.tsx` — settings form
- `app/settings/page.tsx` — server component host
- `app/api/preferences/controls/route.ts` — BFF GET/PUT

**Modified files (this repo):**
- `app/lib/minesweeper.ts` — add `"question"` to `CellState`, change `toggleFlag` signature, update `chordReveal`
- `app/components/Cell.tsx` — render branch for `"question"` state
- `app/components/MinesweeperGame.tsx` — adopt `useBoardInput`, drop ~120 lines of input plumbing
- `app/components/MultiplayerGame.tsx` — adopt `useBoardInput`, drop ~120 lines of input plumbing
- `app/layout.tsx` — wrap children in `<ControlsProvider authLevel={authLevel}>`
- `app/components/NavBar.tsx` — add `Settings` link

**Out of scope for this plan (separate Flask repo `~/minesweeper-web-server`):**
- New `user_preferences` table
- New routes `GET`/`PUT /api/preferences/controls`
- Documented in Task 10 as a checklist for the user; no edits to this repo's files.

---

## Task 1: Add controls.ts data model with parseControls

Pure module with no React or DOM dependencies. Establishes the schema before anything else needs it.

**Files:**
- Create: `app/lib/controls.ts`
- Create: `app/lib/__tests__/controls.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/__tests__/controls.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseControls,
  DEFAULT_CONTROLS,
  CONTROLS_STORAGE_KEY,
  type ControlsPrefs,
} from "../controls";

describe("parseControls", () => {
  it("returns defaults for undefined / null / non-object input", () => {
    expect(parseControls(undefined)).toEqual(DEFAULT_CONTROLS);
    expect(parseControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(parseControls("string")).toEqual(DEFAULT_CONTROLS);
    expect(parseControls(42)).toEqual(DEFAULT_CONTROLS);
  });

  it("returns defaults for empty object", () => {
    expect(parseControls({})).toEqual(DEFAULT_CONTROLS);
  });

  it("passes valid values through unchanged", () => {
    const valid: ControlsPrefs = {
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
    };
    expect(parseControls(valid)).toEqual(valid);
  });

  it("falls back to default for invalid enum values", () => {
    expect(
      parseControls({
        chordTrigger: "bogus",
        spacebarAction: 17,
        questionMarks: false,
      }),
    ).toEqual({
      chordTrigger: DEFAULT_CONTROLS.chordTrigger,
      spacebarAction: DEFAULT_CONTROLS.spacebarAction,
      questionMarks: false,
    });
  });

  it("falls back to default for non-boolean questionMarks", () => {
    expect(
      parseControls({
        chordTrigger: "double-click",
        spacebarAction: "off",
        questionMarks: "true",
      }),
    ).toEqual({
      chordTrigger: "double-click",
      spacebarAction: "off",
      questionMarks: DEFAULT_CONTROLS.questionMarks,
    });
  });

  it("fills in missing keys with defaults", () => {
    expect(parseControls({ chordTrigger: "none" })).toEqual({
      chordTrigger: "none",
      spacebarAction: DEFAULT_CONTROLS.spacebarAction,
      questionMarks: DEFAULT_CONTROLS.questionMarks,
    });
  });

  it("drops unknown keys", () => {
    const input: unknown = {
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
      extraGarbage: "ignored",
      anotherOne: 99,
    };
    const result = parseControls(input);
    expect(result).toEqual({
      chordTrigger: "middle-click",
      spacebarAction: "flag-only",
      questionMarks: true,
    });
    expect((result as Record<string, unknown>).extraGarbage).toBeUndefined();
  });

  it("accepts every documented enum value", () => {
    for (const t of ["both-buttons", "middle-click", "double-click", "none"] as const) {
      expect(parseControls({ chordTrigger: t }).chordTrigger).toBe(t);
    }
    for (const a of ["flag-or-chord", "flag-only", "off"] as const) {
      expect(parseControls({ spacebarAction: a }).spacebarAction).toBe(a);
    }
  });
});

describe("CONTROLS_STORAGE_KEY", () => {
  it("includes a version suffix so we can migrate later", () => {
    expect(CONTROLS_STORAGE_KEY).toMatch(/:v\d+$/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/lib/__tests__/controls.test.ts`
Expected: FAIL — module `../controls` does not exist.

- [ ] **Step 3: Implement controls.ts**

Create `app/lib/controls.ts`:

```ts
export type ChordTrigger = "both-buttons" | "middle-click" | "double-click" | "none";
export type SpacebarAction = "flag-or-chord" | "flag-only" | "off";

export interface ControlsPrefs {
  chordTrigger: ChordTrigger;
  spacebarAction: SpacebarAction;
  questionMarks: boolean;
}

export const DEFAULT_CONTROLS: ControlsPrefs = {
  chordTrigger: "both-buttons",
  spacebarAction: "flag-or-chord",
  questionMarks: false,
};

export const CONTROLS_STORAGE_KEY = "minesweeper:controls:v1";

const CHORD_TRIGGERS: readonly ChordTrigger[] = [
  "both-buttons",
  "middle-click",
  "double-click",
  "none",
];
const SPACEBAR_ACTIONS: readonly SpacebarAction[] = [
  "flag-or-chord",
  "flag-only",
  "off",
];

function isChordTrigger(v: unknown): v is ChordTrigger {
  return typeof v === "string" && (CHORD_TRIGGERS as readonly string[]).includes(v);
}

function isSpacebarAction(v: unknown): v is SpacebarAction {
  return typeof v === "string" && (SPACEBAR_ACTIONS as readonly string[]).includes(v);
}

export function parseControls(input: unknown): ControlsPrefs {
  if (!input || typeof input !== "object") return { ...DEFAULT_CONTROLS };
  const o = input as Record<string, unknown>;
  return {
    chordTrigger: isChordTrigger(o.chordTrigger) ? o.chordTrigger : DEFAULT_CONTROLS.chordTrigger,
    spacebarAction: isSpacebarAction(o.spacebarAction) ? o.spacebarAction : DEFAULT_CONTROLS.spacebarAction,
    questionMarks: typeof o.questionMarks === "boolean" ? o.questionMarks : DEFAULT_CONTROLS.questionMarks,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run app/lib/__tests__/controls.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: no errors.

```bash
git add app/lib/controls.ts app/lib/__tests__/controls.test.ts
git commit -m "Add ControlsPrefs schema and parseControls validator"
```

---

## Task 2: Add question-mark state to minesweeper.ts

Pure logic change. Existing callers continue to work because the new `toggleFlag` `opts` parameter is optional and defaults to `{ questionMarks: false }`.

**Files:**
- Modify: `app/lib/minesweeper.ts`
- Create: `app/lib/__tests__/minesweeper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/__tests__/minesweeper.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createEmptyBoard,
  toggleFlag,
  chordReveal,
  generateBoard,
  revealCell,
  type Board,
} from "../minesweeper";

function setStates(b: Board, entries: Array<[number, number, Board[number][number]["state"]]>): Board {
  const next: Board = b.map(row => row.map(c => ({ ...c })));
  for (const [r, c, state] of entries) next[r][c].state = state;
  return next;
}

describe("toggleFlag", () => {
  it("toggles unrevealed -> flagged -> unrevealed when questionMarks is off", () => {
    const empty = createEmptyBoard();
    const flagged = toggleFlag(empty, 0, 0);
    expect(flagged[0][0].state).toBe("flagged");
    const unflagged = toggleFlag(flagged, 0, 0);
    expect(unflagged[0][0].state).toBe("unrevealed");
  });

  it("treats existing question state as unrevealed when questionMarks is off", () => {
    const empty = createEmptyBoard();
    const withQuestion = setStates(empty, [[0, 0, "question"]]);
    const result = toggleFlag(withQuestion, 0, 0, { questionMarks: false });
    // Question state should leave-toward-flagged path (treat as unrevealed)
    expect(result[0][0].state).toBe("flagged");
  });

  it("cycles unrevealed -> flagged -> question -> unrevealed when questionMarks is on", () => {
    const empty = createEmptyBoard();
    const a = toggleFlag(empty, 1, 1, { questionMarks: true });
    expect(a[1][1].state).toBe("flagged");
    const b = toggleFlag(a, 1, 1, { questionMarks: true });
    expect(b[1][1].state).toBe("question");
    const c = toggleFlag(b, 1, 1, { questionMarks: true });
    expect(c[1][1].state).toBe("unrevealed");
  });

  it("does nothing on revealed cells", () => {
    const board = revealCell(generateBoard(0, 0), 0, 0);
    // Find any revealed cell
    let r = -1, c = -1;
    outer: for (let i = 0; i < board.length; i++) {
      for (let j = 0; j < board[i].length; j++) {
        if (board[i][j].state === "revealed") { r = i; c = j; break outer; }
      }
    }
    expect(r).toBeGreaterThanOrEqual(0);
    const after = toggleFlag(board, r, c, { questionMarks: true });
    expect(after[r][c].state).toBe("revealed");
    expect(after).toBe(board); // unchanged reference
  });
});

describe("chordReveal with question marks", () => {
  it("does not count question cells as flags", () => {
    // 3x3 synthetic board: mine at (0,0) marked as ?, revealed (1,1) numbered 1.
    // chordReveal on (1,1) should refuse: flagCount(0) !== adjacentMines(1).
    const synth: Board = [
      [{ isMine: true,  adjacentMines: 0, state: "question"  }, { isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 1, state: "revealed"   }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
    ];
    expect(chordReveal(synth, 1, 1)).toBeNull();
  });

  it("includes question cells in unrevealed neighbors when chord conditions are met", () => {
    // 3x3: (0,0) is a mine and FLAGGED (real flag). (0,1) is a question. (1,1) is revealed=1.
    // chord on (1,1): flagCount=1 == adjacentMines=1, unrevealedNeighbors must include the question cell.
    const synth: Board = [
      [{ isMine: true,  adjacentMines: 0, state: "flagged"   }, { isMine: false, adjacentMines: 1, state: "question" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 1, state: "unrevealed" }, { isMine: false, adjacentMines: 1, state: "revealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
      [{ isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }, { isMine: false, adjacentMines: 0, state: "unrevealed" }],
    ];
    const result = chordReveal(synth, 1, 1);
    expect(result).not.toBeNull();
    expect(result!.hit).toBe(false);
    // The question cell at (0,1) should now be revealed.
    expect(result!.board[0][1].state).toBe("revealed");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/lib/__tests__/minesweeper.test.ts`
Expected: FAIL — `"question"` is not a valid `CellState`; `toggleFlag` does not accept opts.

- [ ] **Step 3: Update minesweeper.ts**

Modify `app/lib/minesweeper.ts`:

Replace lines 5-11 (the `CellState` union) with:

```ts
export type CellState =
  | "unrevealed"
  | "flagged"
  | "question"
  | "revealed"
  | "mine"
  | "mine-clicked"
  | "mine-wrong";
```

Replace the `toggleFlag` function (lines 131-138) with:

```ts
export interface ToggleFlagOptions {
  questionMarks: boolean;
}

export function toggleFlag(
  board: Board,
  row: number,
  col: number,
  opts: ToggleFlagOptions = { questionMarks: false },
): Board {
  const cell = board[row][col];
  if (cell.state !== "unrevealed" && cell.state !== "flagged" && cell.state !== "question") {
    return board;
  }

  const next: Board = board.map(r => r.map(c => ({ ...c })));
  const current = next[row][col].state;

  if (opts.questionMarks) {
    next[row][col].state =
      current === "unrevealed" ? "flagged" :
      current === "flagged"    ? "question" :
                                 "unrevealed"; // question -> unrevealed
  } else {
    // No question state: treat existing question as unrevealed; toggle flag.
    next[row][col].state = current === "flagged" ? "unrevealed" : "flagged";
  }
  return next;
}
```

In `chordReveal` (around line 207), update the unrevealed-neighbor branch so that question cells are also revealed during a chord. Replace:

```ts
      if (neighbor.state === "flagged") flagCount++;
      else if (neighbor.state === "unrevealed") unrevealedNeighbors.push([nr, nc]);
```

with:

```ts
      if (neighbor.state === "flagged") flagCount++;
      else if (neighbor.state === "unrevealed" || neighbor.state === "question") {
        unrevealedNeighbors.push([nr, nc]);
      }
```

Also in `revealCell` (line 118), broaden the queueing condition so a flood-fill walks through question cells the same way it walks through unrevealed ones. Replace:

```ts
            next[nr][nc].state === "unrevealed"
```

with:

```ts
            (next[nr][nc].state === "unrevealed" || next[nr][nc].state === "question")
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run app/lib/__tests__/minesweeper.test.ts`
Expected: PASS — all tests green.

Also run the full test suite to confirm no solver tests broke:

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint`
Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add app/lib/minesweeper.ts app/lib/__tests__/minesweeper.test.ts
git commit -m "Add question-mark cell state and toggleFlag opts"
```

---

## Task 3: Render question-mark state in Cell.tsx

Visual change only. The `state === "question"` cell renders a `?` on a raised tile.

**Files:**
- Modify: `app/components/Cell.tsx`

- [ ] **Step 1: Add the question render branch**

In `app/components/Cell.tsx`, immediately after the `flagged` branch (after line 75) and before the `revealed` branch, insert:

```tsx
  if (state === "question") {
    return (
      <div
        className={`${base} ${RAISED} bg-[#c0c0c0] cursor-default text-blue-700`}
        style={sizeStyle}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
      >
        ?
      </div>
    );
  }
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`

Open `http://localhost:3000`. The site should look identical (no question cells exist yet because `toggleFlag` defaults to `{ questionMarks: false }` and no caller has opted in).

- [ ] **Step 3: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/components/Cell.tsx
git commit -m "Render question-mark cell state"
```

---

## Task 4: BFF route /api/preferences/controls (GET and PUT)

Proxies to the Flask backend; in mock mode (no `BACKEND_URL`), uses an in-memory map keyed by user_id from the JWT payload.

**Files:**
- Create: `app/api/preferences/controls/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/preferences/controls/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { parseControls } from "@/app/lib/controls";

interface JwtPayload {
  sub?: string;
  userId?: string;
  authLevel?: "anonymous" | "google";
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as JwtPayload;
  } catch {
    return null;
  }
}

// In-memory store for mock-mode dev (no BACKEND_URL). Resets on dev-server restart.
const mockStore = new Map<string, ReturnType<typeof parseControls>>();

function authOrUnauthorized(
  request: NextRequest,
): { token: string; payload: JwtPayload } | NextResponse {
  const token = request.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = decodeJwt(token);
  if (!payload || payload.authLevel !== "google") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { token, payload };
}

function userKey(payload: JwtPayload): string {
  return payload.userId ?? payload.sub ?? "";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authOrUnauthorized(request);
  if (auth instanceof NextResponse) return auth;
  const { token, payload } = auth;

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    const key = userKey(payload);
    const stored = mockStore.get(key);
    if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ controls: stored });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/api/preferences/controls`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[preferences/controls GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Propagate 200 and 404 verbatim; convert other errors to 503.
  if (backendRes.status === 200 || backendRes.status === 404) {
    const body = await backendRes.json().catch(() => ({}));
    return NextResponse.json(body, { status: backendRes.status });
  }
  console.error("[preferences/controls GET] Unexpected backend status:", backendRes.status);
  return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = authOrUnauthorized(request);
  if (auth instanceof NextResponse) return auth;
  const { token, payload } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = (body as { controls?: unknown })?.controls;
  if (incoming === undefined) {
    return NextResponse.json({ error: "Missing 'controls' field" }, { status: 400 });
  }
  const validated = parseControls(incoming);

  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    mockStore.set(userKey(payload), validated);
    return NextResponse.json({ controls: validated });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/api/preferences/controls`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ controls: validated }),
    });
  } catch (err) {
    console.error("[preferences/controls PUT] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const respBody = await backendRes.json().catch(() => ({}));
  return NextResponse.json(respBody, { status: backendRes.status });
}
```

- [ ] **Step 2: Manual smoke test (mock mode)**

Run: `npm run dev`

In another terminal, mint a Google-mock session cookie and exercise GET/PUT:

```bash
# 1. Trigger Google mock auth (sets session cookie with authLevel: "google").
curl -i -c /tmp/cookies.txt 'http://localhost:3000/api/auth/google/callback?mock=1'
# Expected: 307 redirect; cookies file now has a "session" cookie.

# 2. GET prefs — first call returns 404 (no row).
curl -i -b /tmp/cookies.txt http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 404, body {"error":"Not found"}

# 3. PUT prefs.
curl -i -b /tmp/cookies.txt -X PUT \
  -H "Content-Type: application/json" \
  -d '{"controls":{"chordTrigger":"middle-click","spacebarAction":"flag-only","questionMarks":true}}' \
  http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 200, body {"controls":{"chordTrigger":"middle-click","spacebarAction":"flag-only","questionMarks":true}}

# 4. GET again — now returns the stored value.
curl -i -b /tmp/cookies.txt http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 200, body {"controls":{"chordTrigger":"middle-click",...}}

# 5. Without a session cookie — 401.
curl -i http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 401

# 6. With invalid body — 400 then validated payload (unknown enum falls back).
curl -i -b /tmp/cookies.txt -X PUT \
  -H "Content-Type: application/json" \
  -d '{"controls":{"chordTrigger":"bogus","spacebarAction":"flag-only","questionMarks":"yes"}}' \
  http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 200, body shows chordTrigger:"both-buttons" (default), questionMarks:false (default)
```

- [ ] **Step 3: Manual smoke test — anonymous guest is rejected**

```bash
# Register an anonymous session (authLevel: "anonymous").
curl -i -c /tmp/anon.txt -X POST -H "Content-Type: application/json" \
  -d '{"username":"testguest"}' http://localhost:3000/api/register-session
# Expected: 200, cookie set.

curl -i -b /tmp/anon.txt http://localhost:3000/api/preferences/controls
# Expected: HTTP/1.1 401 — anonymous tokens are not allowed.
```

- [ ] **Step 4: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/api/preferences/controls/route.ts
git commit -m "Add /api/preferences/controls BFF route with mock fallback"
```

---

## Task 5: ControlsProvider + useControls hook

Hydrates from localStorage on mount; if `authLevel === "google"`, fetches from BFF and reconciles with first-sign-in merge logic.

**Files:**
- Create: `app/components/ControlsProvider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement ControlsProvider**

Create `app/components/ControlsProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CONTROLS_STORAGE_KEY,
  DEFAULT_CONTROLS,
  parseControls,
  type ControlsPrefs,
} from "@/app/lib/controls";

interface ControlsContextValue {
  controls: ControlsPrefs;
  updateControls: (partial: Partial<ControlsPrefs>) => void;
  resetControls: () => void;
}

const ControlsContext = createContext<ControlsContextValue | null>(null);

function readLocal(): ControlsPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CONTROLS };
  try {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTROLS };
    return parseControls(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTROLS };
  }
}

function writeLocal(prefs: ControlsPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore.
  }
}

interface ControlsProviderProps {
  authLevel?: "anonymous" | "google";
  children: ReactNode;
}

export function ControlsProvider({ authLevel, children }: ControlsProviderProps) {
  const [controls, setControls] = useState<ControlsPrefs>(() => DEFAULT_CONTROLS);
  // Tracks whether the user has issued any updateControls call since mount.
  // Used to suppress an in-flight initial GET response from clobbering a fresh edit.
  const hasUserEditedRef = useRef(false);

  // Hydrate from localStorage once on client mount.
  useEffect(() => {
    setControls(readLocal());
  }, []);

  // For google-authenticated users, sync with the server.
  useEffect(() => {
    if (authLevel !== "google") return;
    let cancelled = false;

    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/preferences/controls", { cache: "no-store" });
      } catch (err) {
        console.warn("[controls] GET failed:", err);
        return;
      }
      if (cancelled) return;

      if (res.status === 404) {
        // First-sign-in merge: push current local prefs to the server.
        const local = readLocal();
        try {
          await fetch("/api/preferences/controls", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ controls: local }),
          });
        } catch (err) {
          console.warn("[controls] first-sign-in PUT failed:", err);
        }
        return;
      }

      if (!res.ok) return;

      // Race guard: if the user has clicked something since mount, don't overwrite.
      if (hasUserEditedRef.current) return;

      const body = await res.json().catch(() => null);
      if (!body || cancelled) return;
      const remote = parseControls(body.controls);
      setControls(remote);
      writeLocal(remote);
    })();

    return () => { cancelled = true; };
  }, [authLevel]);

  const updateControls = useCallback((partial: Partial<ControlsPrefs>) => {
    hasUserEditedRef.current = true;
    setControls(prev => {
      const next = parseControls({ ...prev, ...partial });
      writeLocal(next);
      if (authLevel === "google") {
        fetch("/api/preferences/controls", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controls: next }),
        }).catch(err => console.warn("[controls] PUT failed:", err));
      }
      return next;
    });
  }, [authLevel]);

  const resetControls = useCallback(() => {
    updateControls(DEFAULT_CONTROLS);
  }, [updateControls]);

  return (
    <ControlsContext.Provider value={{ controls, updateControls, resetControls }}>
      {children}
    </ControlsContext.Provider>
  );
}

export function useControls(): ControlsContextValue {
  const ctx = useContext(ControlsContext);
  if (!ctx) throw new Error("useControls must be called inside <ControlsProvider>");
  return ctx;
}
```

- [ ] **Step 2: Wire into layout.tsx**

Modify `app/layout.tsx`. Add the import near the top with the other component imports:

```tsx
import { ControlsProvider } from "@/app/components/ControlsProvider";
```

Then change the JSX inside `RootLayout` so `NavBar` and `children` are wrapped in the provider:

Replace:

```tsx
      <body
        className="antialiased flex flex-col min-h-screen"
      >
        <NavBar username={username} authLevel={authLevel} />
        {children}
        <Analytics />
      </body>
```

with:

```tsx
      <body
        className="antialiased flex flex-col min-h-screen"
      >
        <ControlsProvider authLevel={authLevel}>
          <NavBar username={username} authLevel={authLevel} />
          {children}
        </ControlsProvider>
        <Analytics />
      </body>
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Open `http://localhost:3000`. The site should load and behave identically (provider is active but nothing reads from `useControls` yet).

In the browser DevTools console, exercise the storage:

```js
// Should be null at first load.
localStorage.getItem("minesweeper:controls:v1");

// Set a non-default value and reload.
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "middle-click",
  spacebarAction: "flag-only",
  questionMarks: true,
}));
location.reload();

// After reload, the value should still be there.
localStorage.getItem("minesweeper:controls:v1");
```

Then sign in via mock Google to verify the first-sign-in flow:

```bash
# In a terminal:
curl -i -c /tmp/cookies.txt 'http://localhost:3000/api/auth/google/callback?mock=1'
```

Open the browser, navigate to a page after the sign-in completes. Expect a network request to `GET /api/preferences/controls` to fire (visible in the Network tab). Since the mock store is empty for a fresh dev server, expect a 404 followed immediately by a `PUT` carrying the localStorage prefs. Do another GET via curl with the same cookie — should now return 200 with those prefs.

- [ ] **Step 4: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/components/ControlsProvider.tsx app/layout.tsx
git commit -m "Add ControlsProvider with localStorage + server sync"
```

---

## Task 6: useBoardInput hook

Extracts mouse and keyboard input bookkeeping from the two game components into a reusable hook with controls-aware branching.

**Files:**
- Create: `app/lib/useBoardInput.ts`

- [ ] **Step 1: Implement the hook**

Create `app/lib/useBoardInput.ts`:

```ts
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Board,
  ROWS,
  COLS,
} from "@/app/lib/minesweeper";
import type { ControlsPrefs } from "@/app/lib/controls";

function computeSunkCells(
  hovered: { row: number; col: number } | null,
  leftDown: boolean,
  rightDown: boolean,
  board: Board | null,
  enabled: boolean,
  showChordPreview: boolean,
): Set<string> {
  if (!hovered || !leftDown || !enabled || !board) return new Set();
  const { row, col } = hovered;
  if (rightDown && showChordPreview) {
    const sunk = new Set<string>();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].state === "unrevealed") {
          sunk.add(`${nr}-${nc}`);
        }
      }
    }
    return sunk;
  }
  return board[row][col].state === "unrevealed" ? new Set([`${row}-${col}`]) : new Set();
}

interface UseBoardInputArgs {
  controls: ControlsPrefs;
  board: Board | null;
  enabled: boolean;
  onReveal: (row: number, col: number) => void;
  onFlag: (row: number, col: number) => void;
  onChord: (row: number, col: number) => void;
}

export interface BoardInputHandlers {
  boardHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
    onDoubleClick: (e: React.MouseEvent) => void;
  };
  cellHandlers: {
    onCellLeftClick: (row: number, col: number) => void;
    onCellRightClick: (e: React.MouseEvent, row: number, col: number) => void;
    onCellMouseEnter: (row: number, col: number) => void;
  };
  sunkCells: Set<string>;
}

export function useBoardInput({
  controls,
  board,
  enabled,
  onReveal,
  onFlag,
  onChord,
}: UseBoardInputArgs): BoardInputHandlers {
  const [sunkCells, setSunkCells] = useState<Set<string>>(new Set());

  // Refs synced post-commit so callbacks never see stale state.
  const boardRef = useRef(board);
  const enabledRef = useRef(enabled);
  const controlsRef = useRef(controls);
  const onRevealRef = useRef(onReveal);
  const onFlagRef = useRef(onFlag);
  const onChordRef = useRef(onChord);
  useLayoutEffect(() => {
    boardRef.current = board;
    enabledRef.current = enabled;
    controlsRef.current = controls;
    onRevealRef.current = onReveal;
    onFlagRef.current = onFlag;
    onChordRef.current = onChord;
  });

  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);
  const mouseDownCellRef = useRef<{ row: number; col: number } | null>(null);
  const leftDownRef = useRef(false);
  const rightDownRef = useRef(false);
  const wasChordingRef = useRef(false);

  const recomputeSunk = useCallback(() => {
    const showPreview = controlsRef.current.chordTrigger === "both-buttons";
    setSunkCells(
      computeSunkCells(
        hoveredCellRef.current,
        leftDownRef.current,
        rightDownRef.current,
        boardRef.current,
        enabledRef.current,
        showPreview,
      ),
    );
  }, []);

  // Reset state if the user releases a button outside the board.
  useEffect(() => {
    const reset = () => {
      leftDownRef.current = false;
      rightDownRef.current = false;
      mouseDownCellRef.current = null;
      setSunkCells(new Set());
    };
    window.addEventListener("mouseup", reset);
    return () => window.removeEventListener("mouseup", reset);
  }, []);

  // Spacebar listener — branches on controls.spacebarAction.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const action = controlsRef.current.spacebarAction;
      if (action === "off") return; // page default (scroll, etc.) preserved
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered) return;
      if (!enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      const cell = b[hovered.row][hovered.col];

      if (cell.state === "unrevealed" || cell.state === "flagged" || cell.state === "question") {
        onFlagRef.current(hovered.row, hovered.col);
        return;
      }
      if (action === "flag-or-chord" && cell.state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCellLeftClick = useCallback((row: number, col: number) => {
    if (!enabledRef.current) return;
    const b = boardRef.current;
    if (!b) return;
    const cell = b[row][col];
    if (cell.state === "revealed" || cell.state === "flagged" || cell.state === "question") return;
    onRevealRef.current(row, col);
  }, []);

  const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (!enabledRef.current) return;
    if (e.buttons & 1) return; // left-button held — chording, not flagging
    if (wasChordingRef.current) return; // chord just ended — suppress spurious flag
    const b = boardRef.current;
    if (!b) return;
    const cell = b[row][col];
    if (cell.state !== "unrevealed" && cell.state !== "flagged" && cell.state !== "question") return;
    onFlagRef.current(row, col);
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    hoveredCellRef.current = { row, col };
    recomputeSunk();
  }, [recomputeSunk]);

  const handleBoardMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    setSunkCells(new Set());
  }, []);

  const handleBoardMouseDown = useCallback((e: React.MouseEvent) => {
    // Fresh press sequence: clear chord memory.
    if (!leftDownRef.current && !rightDownRef.current) wasChordingRef.current = false;

    const trigger = controlsRef.current.chordTrigger;

    // Middle-button chord (only when this is the active chord trigger).
    if (e.button === 1 && trigger === "middle-click") {
      e.preventDefault();
      const hovered = hoveredCellRef.current;
      if (!hovered || !enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      if (b[hovered.row][hovered.col].state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
      return;
    }

    if (e.button === 0) {
      leftDownRef.current = true;
      mouseDownCellRef.current = hoveredCellRef.current;
    }
    if (e.button === 2) rightDownRef.current = true;
    if (leftDownRef.current && rightDownRef.current && trigger === "both-buttons") {
      wasChordingRef.current = true;
    }
    recomputeSunk();
  }, [recomputeSunk]);

  const handleBoardMouseUp = useCallback((e: React.MouseEvent) => {
    const trigger = controlsRef.current.chordTrigger;
    const wasBothHeld = leftDownRef.current && rightDownRef.current;
    const downCell = mouseDownCellRef.current;
    if (e.button === 0) {
      leftDownRef.current = false;
      mouseDownCellRef.current = null;
    }
    if (e.button === 2) rightDownRef.current = false;
    recomputeSunk();

    // Drag-release: only when no chord was in progress.
    if (!wasChordingRef.current && !wasBothHeld && e.button === 0) {
      const hovered = hoveredCellRef.current;
      if (hovered && downCell && (hovered.row !== downCell.row || hovered.col !== downCell.col)) {
        handleCellLeftClick(hovered.row, hovered.col);
        return;
      }
    }

    // Both-buttons chord on release.
    if (wasBothHeld && trigger === "both-buttons") {
      const hovered = hoveredCellRef.current;
      if (!hovered || !enabledRef.current) return;
      const b = boardRef.current;
      if (!b) return;
      if (b[hovered.row][hovered.col].state === "revealed") {
        onChordRef.current(hovered.row, hovered.col);
      }
    }
  }, [handleCellLeftClick, recomputeSunk]);

  const handleBoardDoubleClick = useCallback((e: React.MouseEvent) => {
    if (controlsRef.current.chordTrigger !== "double-click") return;
    e.preventDefault();
    const hovered = hoveredCellRef.current;
    if (!hovered || !enabledRef.current) return;
    const b = boardRef.current;
    if (!b) return;
    if (b[hovered.row][hovered.col].state === "revealed") {
      onChordRef.current(hovered.row, hovered.col);
    }
  }, []);

  return {
    boardHandlers: {
      onMouseDown: handleBoardMouseDown,
      onMouseUp: handleBoardMouseUp,
      onMouseLeave: handleBoardMouseLeave,
      onDoubleClick: handleBoardDoubleClick,
    },
    cellHandlers: {
      onCellLeftClick: handleCellLeftClick,
      onCellRightClick: handleCellRightClick,
      onCellMouseEnter: handleCellMouseEnter,
    },
    sunkCells,
  };
}
```

- [ ] **Step 2: Wire onDoubleClick into Board.tsx**

Modify `app/components/Board.tsx`. Add `onBoardDoubleClick` to `BoardProps`:

Replace the interface with:

```tsx
interface BoardProps {
  board: Board;
  phase: GamePhase;
  sunkCells: Set<string>;
  onCellLeftClick: (row: number, col: number) => void;
  onCellRightClick: (e: React.MouseEvent, row: number, col: number) => void;
  onCellMouseEnter: (row: number, col: number) => void;
  onBoardMouseLeave: () => void;
  onBoardMouseDown: (e: React.MouseEvent) => void;
  onBoardMouseUp: (e: React.MouseEvent) => void;
  onBoardDoubleClick?: (e: React.MouseEvent) => void;
}
```

Update the destructuring in the function signature to add `onBoardDoubleClick`:

```tsx
export default function BoardComponent({
  board,
  sunkCells,
  onCellLeftClick,
  onCellRightClick,
  onCellMouseEnter,
  onBoardMouseLeave,
  onBoardMouseDown,
  onBoardMouseUp,
  onBoardDoubleClick,
}: BoardProps) {
```

Add `onDoubleClick={onBoardDoubleClick}` to the `<div>` in the return:

```tsx
    <div
      className="border-4 border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-[#d8d8d8] border-r-[#d8d8d8]"
      style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, var(--cell-size))` }}
      onMouseLeave={onBoardMouseLeave}
      onContextMenu={e => e.preventDefault()}
      onMouseDown={onBoardMouseDown}
      onMouseUp={onBoardMouseUp}
      onDoubleClick={onBoardDoubleClick}
    >
```

- [ ] **Step 3: Lint, typecheck, commit**

The hook isn't used by any component yet, so the build still works.

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/lib/useBoardInput.ts app/components/Board.tsx
git commit -m "Add useBoardInput hook with controls-aware input handling"
```

---

## Task 7: Refactor MinesweeperGame.tsx to use useBoardInput

The single-player component drops its mouse refs, window listeners, sunkCells computation, and chord handlers; everything lives in the hook now.

**Files:**
- Modify: `app/components/MinesweeperGame.tsx`

- [ ] **Step 1: Replace input handling with the hook**

Replace the full contents of `app/components/MinesweeperGame.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import {
  Board,
  GamePhase,
  MINE_COUNT,
  createEmptyBoard,
  generateBoard,
  revealCell,
  toggleFlag,
  checkWin,
  revealAllMines,
  countFlags,
  chordReveal,
} from "@/app/lib/minesweeper";
import { decodeBoard } from "@/app/lib/multiplayer-utils";
import { useBoardInput } from "@/app/lib/useBoardInput";
import { useControls } from "@/app/components/ControlsProvider";
import { SUNKEN_INNER } from "@/app/lib/win95";
import Header from "@/app/components/Header";
import BoardComponent from "@/app/components/Board";
import Leaderboard, { type LeaderboardEntry } from "@/app/components/Leaderboard";
import DifficultySelector, { type NoGuessDifficulty } from "@/app/components/DifficultySelector";
import PostWinSignInModal from "@/app/components/PostWinSignInModal";
import * as PendingScore from "@/app/lib/pending-score";

type GameMode = "random" | "no-guess";

interface MinesweeperGameProps {
  authLevel?: "anonymous" | "google";
  username?: string;
  mode?: GameMode;
}

export default function MinesweeperGame({ authLevel, username, mode = "random" }: MinesweeperGameProps) {
  const { controls } = useControls();

  const [board, setBoard] = useState<Board>(() => createEmptyBoard());
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [difficulty, setDifficulty] = useState<NoGuessDifficulty>("beginner");
  const [showSignInModal, setShowSignInModal] = useState(false);
  const pathname = usePathname();
  const scoreSubmittedRef = useRef(false);
  const signInModalDismissedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showLeaderboard = mode === "random" || mode === "no-guess";

  // Submit score on win
  useEffect(() => {
    if (phase === "won" && authLevel === "google" && showLeaderboard && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_seconds: elapsedSeconds, mode, ...(mode === "no-guess" && { difficulty }) }),
      })
        .then(() => setLeaderboardRefreshKey((k) => k + 1))
        .catch(() => {});
    }
  }, [phase, authLevel, elapsedSeconds, mode, showLeaderboard, difficulty]);

  // Open sign-in prompt when an anonymous user wins with a top-10 time.
  useEffect(() => {
    if (phase !== "won") return;
    if (authLevel === "google") return;
    if (!showLeaderboard) return;
    if (signInModalDismissedRef.current) return;
    const qualifies = scores.length < 10 || elapsedSeconds < scores[9].time_seconds;
    if (qualifies) setShowSignInModal(true);
  }, [phase, authLevel, showLeaderboard, scores, elapsedSeconds]);

  // On mount, finish the score-save started before the OAuth roundtrip.
  useEffect(() => {
    const pending = PendingScore.read();
    if (!pending) return;
    if (authLevel !== "google") {
      PendingScore.clear();
      return;
    }
    fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        time_seconds: pending.time_seconds,
        mode: pending.mode,
        ...(pending.difficulty && { difficulty: pending.difficulty }),
      }),
    })
      .then(() => {
        PendingScore.clear();
        setLeaderboardRefreshKey((k) => k + 1);
      })
      .catch(() => {
        PendingScore.clear();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Own the leaderboard fetch so we can run a top-10 qualification check on win.
  useEffect(() => {
    if (!showLeaderboard) return;
    let url = `/api/leaderboard?mode=${mode}`;
    if (mode === "no-guess") url += `&difficulty=${encodeURIComponent(difficulty)}`;
    let cancelled = false;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.scores) setScores(data.scores);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leaderboardRefreshKey, mode, difficulty, showLeaderboard]);

  // Timer
  useEffect(() => {
    if (phase === "playing") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(s => Math.min(s + 1, 999));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // -- Game-action callbacks (passed into useBoardInput) --

  const handleReveal = useCallback((row: number, col: number) => {
    if (isGenerating) return;
    if (phase === "won" || phase === "lost") return;

    let workingBoard = board;

    if (phase === "idle") {
      if (mode === "no-guess") {
        setIsGenerating(true);
        let resolved = false;
        const applyBoard = (nb: Board) => {
          if (resolved) return;
          resolved = true;
          const revealed = revealCell(nb, row, col);
          setBoard(revealed);
          setPhase("playing");
          setIsGenerating(false);
          if (checkWin(revealed)) setPhase("won");
        };

        const worker = new Worker(
          new URL("../lib/board-generator.worker.ts", import.meta.url),
        );
        worker.onmessage = (e) => { worker.terminate(); applyBoard(e.data.board); };
        worker.onerror = () => worker.terminate();
        worker.postMessage({ startRow: row, startCol: col, difficulty });

        setTimeout(() => {
          if (resolved) return;
          fetch(`/api/board?difficulty=${encodeURIComponent(difficulty)}&start_row=${row}&start_col=${col}`)
            .then(res => { if (!res.ok) throw new Error("Server error"); return res.json(); })
            .then(data => { worker.terminate(); applyBoard(decodeBoard(data.board)); })
            .catch(() => {});
        }, 500);
        return;
      }
      workingBoard = generateBoard(row, col);
      setPhase("playing");
    }

    if (workingBoard[row][col].isMine) {
      setBoard(revealAllMines(workingBoard, row, col));
      setPhase("lost");
      return;
    }

    const nextBoard = revealCell(workingBoard, row, col);
    setBoard(nextBoard);
    if (checkWin(nextBoard)) setPhase("won");
  }, [board, phase, isGenerating, mode, difficulty]);

  const handleFlag = useCallback((row: number, col: number) => {
    if (phase !== "playing") return;
    setBoard(prev => toggleFlag(prev, row, col, { questionMarks: controls.questionMarks }));
  }, [phase, controls.questionMarks]);

  const handleChord = useCallback((row: number, col: number) => {
    if (phase !== "playing") return;
    const result = chordReveal(board, row, col);
    if (!result) return;
    if (result.hit) {
      setBoard(result.board);
      setPhase("lost");
    } else {
      setBoard(result.board);
      if (checkWin(result.board)) setPhase("won");
    }
  }, [board, phase]);

  const enabled = !isGenerating && phase !== "won" && phase !== "lost";

  const { boardHandlers, cellHandlers, sunkCells } = useBoardInput({
    controls,
    board,
    enabled,
    onReveal: handleReveal,
    onFlag: handleFlag,
    onChord: handleChord,
  });

  const handleReset = useCallback(() => {
    setBoard(createEmptyBoard());
    setPhase("idle");
    setElapsedSeconds(0);
    scoreSubmittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, []);

  const handleDifficultyChange = useCallback((d: NoGuessDifficulty) => {
    setDifficulty(d);
    setBoard(createEmptyBoard());
    setPhase("idle");
    setElapsedSeconds(0);
    scoreSubmittedRef.current = false;
    signInModalDismissedRef.current = false;
    setShowSignInModal(false);
  }, []);

  const flagsRemaining = MINE_COUNT - countFlags(board);

  return (
    <div
      className="flex flex-col xl:flex-row items-center xl:items-start gap-4 select-none"
      style={{ "--cell-size": "clamp(0.625rem, calc((100vw - 2rem) / 30), 1.75rem)" } as CSSProperties}
    >
      <div className="flex flex-col items-center gap-0">
        {mode === "no-guess" && (
          <DifficultySelector
            difficulty={difficulty}
            onDifficultyChange={handleDifficultyChange}
          />
        )}
        <Header
          flagsRemaining={flagsRemaining}
          elapsedSeconds={elapsedSeconds}
          phase={phase}
          onReset={handleReset}
        />
        <BoardComponent
          board={board}
          phase={phase}
          sunkCells={sunkCells}
          onCellLeftClick={cellHandlers.onCellLeftClick}
          onCellRightClick={cellHandlers.onCellRightClick}
          onCellMouseEnter={cellHandlers.onCellMouseEnter}
          onBoardMouseLeave={boardHandlers.onMouseLeave}
          onBoardMouseDown={boardHandlers.onMouseDown}
          onBoardMouseUp={boardHandlers.onMouseUp}
          onBoardDoubleClick={boardHandlers.onDoubleClick}
        />
        {(isGenerating || phase === "won" || phase === "lost") && (
          <div className={`${SUNKEN_INNER} bg-black mt-2 px-4 py-1.5 font-mono font-bold text-center`}>
            {isGenerating && <span className="text-[#808080]">Generating board...</span>}
            {!isGenerating && phase === "won" && (
              <>
                <span className="text-green-500">You win!</span>
                {authLevel !== "google" && (
                  <span className="text-[#808080] text-xs ml-2">Sign in to save scores</span>
                )}
              </>
            )}
            {!isGenerating && phase === "lost" && <span className="text-red-500">Game over.</span>}
          </div>
        )}
      </div>
      {showLeaderboard && (
        <Leaderboard
          username={username}
          refreshKey={leaderboardRefreshKey}
          mode={mode}
          difficulty={mode === "no-guess" ? difficulty : undefined}
          scores={scores}
        />
      )}
      {showSignInModal && (
        <PostWinSignInModal
          onClose={() => {
            signInModalDismissedRef.current = true;
            setShowSignInModal(false);
          }}
          onSignIn={() => {
            PendingScore.write({
              time_seconds: elapsedSeconds,
              mode,
              ...(mode === "no-guess" && { difficulty }),
            });
            const next = pathname || "/";
            window.location.assign(`/api/auth/google/init?next=${encodeURIComponent(next)}`);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test — default behavior unchanged**

Run: `npm run dev`

With localStorage cleared (so defaults apply):

- Open `http://localhost:3000`. Play a game with default controls:
  - Left click reveals a cell.
  - Right click flags / unflags an unrevealed cell.
  - Hold left + right, release on a revealed numbered cell with the correct flag count → chord reveals neighbors.
  - Spacebar over an unrevealed cell flags it; spacebar over a revealed numbered cell chords.
  - Drag-release: left-press in cell A, drag to cell B, release on B → cell B is revealed.
- Right-click a flagged cell → it returns to unrevealed (no question state, since `questionMarks` is false).

- [ ] **Step 3: Manual smoke test — chord trigger variants**

In DevTools, set localStorage and reload to test each chord trigger:

```js
// Middle-click
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "middle-click",
  spacebarAction: "flag-or-chord",
  questionMarks: false,
}));
location.reload();
```

- Left + right held → no chord.
- Middle-click on a satisfied revealed numbered cell → chord works.

```js
// Double-click
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "double-click",
  spacebarAction: "flag-or-chord",
  questionMarks: false,
}));
location.reload();
```

- Double-click on a satisfied revealed numbered cell → chord works.
- Single left click on unrevealed cell still reveals it.

```js
// None
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "none",
  spacebarAction: "flag-or-chord",
  questionMarks: false,
}));
location.reload();
```

- No mouse chord works at all. Spacebar chord still works.

- [ ] **Step 4: Manual smoke test — spacebar variants**

```js
// Flag-only
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "both-buttons",
  spacebarAction: "flag-only",
  questionMarks: false,
}));
location.reload();
```

- Spacebar over an unrevealed cell flags it.
- Spacebar over a revealed numbered cell does nothing.

```js
// Off
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "both-buttons",
  spacebarAction: "off",
  questionMarks: false,
}));
location.reload();
```

- Spacebar does nothing (and does not preventDefault — page may scroll if scrollable).

- [ ] **Step 5: Manual smoke test — question marks**

```js
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "both-buttons",
  spacebarAction: "flag-or-chord",
  questionMarks: true,
}));
location.reload();
```

- Right-click an unrevealed cell → flagged.
- Right-click again → ? appears.
- Right-click again → unrevealed.
- Spacebar on a `?` cell → cycles to flagged (because spacebar calls `onFlag`, which calls `toggleFlag` with `questionMarks: true`).
- Question cells do NOT count toward chord satisfaction (place a real flag on the mine, leave question on a safe neighbor — chord works and reveals the question cell).

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/components/MinesweeperGame.tsx
git commit -m "Refactor MinesweeperGame to use useBoardInput hook"
```

---

## Task 8: Refactor MultiplayerGame.tsx to use useBoardInput

Same refactor as Task 7 applied to multiplayer. The cooldown, click log, WS sends, and death tracking remain in the callbacks; the hook only sees the `enabled` flag.

**Files:**
- Modify: `app/components/MultiplayerGame.tsx`

- [ ] **Step 1: Replace input handling with the hook**

Open `app/components/MultiplayerGame.tsx`. Make the following targeted edits.

Add imports near the top:

```tsx
import { useBoardInput } from "@/app/lib/useBoardInput";
import { useControls } from "@/app/components/ControlsProvider";
```

Remove the local `computeSunkCells` helper at the top of the file (lines 37-60 in the original) — the hook owns this now.

Inside the component, after the existing state declarations, get the controls:

```tsx
  const { controls } = useControls();
```

Remove the following refs and effects from the component (they all migrate into the hook):

- `sunkCells` state (`const [sunkCells, setSunkCells] = useState<Set<string>>(new Set());`)
- `hoveredCellRef`, `mouseDownCellRef`, `leftDownRef`, `rightDownRef`, `wasChordingRef`
- The `useEffect(... window.addEventListener("mouseup", reset) ...)` block
- The spacebar `useEffect(() => { const handleKeyDown = ... })` block
- All the existing handlers: `handleBoardMouseDown`, `handleBoardMouseUp`, `handleCellMouseEnter`, `handleBoardMouseLeave`

Replace `handleCellLeftClick`, `handleCellRightClick`, and the body of the deleted spacebar effect's chord branch with three new callbacks named `handleReveal`, `handleFlag`, and `handleChord`. The pattern:

```tsx
  const handleReveal = useCallback((row: number, col: number) => {
    const currentBoard = boardRef.current;
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

    const cell = currentBoard[row][col];
    if (cell.isMine) {
      const newDeathCount = deathCountRef.current + 1;
      setDeathCount(newDeathCount);
      setCooldownMs(cooldownDuration(newDeathCount - 1));
      setClickLog(prev => [...prev, { type: "reveal", row, col, ts: Date.now() }]);
      sendRef.current({ type: "hit_mine", row, col, deathCount: newDeathCount });
      return;
    }

    const nextBoard = revealCell(currentBoard, row, col);
    const newCells = diffRevealedCells(currentBoard, nextBoard);
    setBoard(nextBoard);
    setClickLog(prev => [...prev, { type: "reveal", row, col, ts: Date.now() }]);
    sendRef.current({ type: "reveal", row, col, resultCells: newCells });

    if (checkWin(nextBoard)) {
      const timeMs = elapsedSecondsRef.current * 1000;
      sendRef.current({
        type: "game_complete",
        timeMs,
        clickLog: [...clickLogRef.current, { type: "reveal", row, col, ts: Date.now() }],
      });
    }
  }, []);

  const handleFlag = useCallback((row: number, col: number) => {
    if (matchStateRef.current !== "playing") return;
    if (cooldownMsRef.current > 0) return;
    setBoard(prev => (prev ? toggleFlag(prev, row, col, { questionMarks: controls.questionMarks }) : prev));
    setClickLog(prev => [...prev, { type: "flag", row, col, ts: Date.now() }]);
  }, [controls.questionMarks]);

  const handleChord = useCallback((row: number, col: number) => {
    const currentBoard = boardRef.current;
    if (matchStateRef.current !== "playing" || !currentBoard) return;
    if (cooldownMsRef.current > 0) return;

    const result = chordReveal(currentBoard, row, col);
    if (!result) return;

    if (result.hit) {
      const newDeathCount = deathCountRef.current + 1;
      setDeathCount(newDeathCount);
      setCooldownMs(cooldownDuration(newDeathCount - 1));
      setClickLog(prev => [...prev, { type: "chord", row, col, ts: Date.now() }]);
      sendRef.current({ type: "hit_mine", row, col, deathCount: newDeathCount });
    } else {
      const newCells = diffRevealedCells(currentBoard, result.board);
      setBoard(result.board);
      setClickLog(prev => [...prev, { type: "chord", row, col, ts: Date.now() }]);
      sendRef.current({ type: "chord", row, col, resultCells: newCells });

      if (checkWin(result.board)) {
        const timeMs = elapsedSecondsRef.current * 1000;
        sendRef.current({
          type: "game_complete",
          timeMs,
          clickLog: [...clickLogRef.current, { type: "chord", row, col, ts: Date.now() }],
        });
      }
    }
  }, []);

  const enabled = matchState === "playing" && cooldownMs <= 0;

  const { boardHandlers, cellHandlers, sunkCells } = useBoardInput({
    controls,
    board,
    enabled,
    onReveal: handleReveal,
    onFlag: handleFlag,
    onChord: handleChord,
  });
```

Update the `<BoardComponent>` JSX in the return so it pulls handlers from the hook output (just like in Task 7 step 1's JSX block):

```tsx
            <BoardComponent
              board={board}
              phase={headerPhase}
              sunkCells={sunkCells}
              onCellLeftClick={cellHandlers.onCellLeftClick}
              onCellRightClick={cellHandlers.onCellRightClick}
              onCellMouseEnter={cellHandlers.onCellMouseEnter}
              onBoardMouseLeave={boardHandlers.onMouseLeave}
              onBoardMouseDown={boardHandlers.onMouseDown}
              onBoardMouseUp={boardHandlers.onMouseUp}
              onBoardDoubleClick={boardHandlers.onDoubleClick}
            />
```

Sync `boardRef`/`matchStateRef`/`cooldownMsRef`/`deathCountRef`/`elapsedSecondsRef`/`clickLogRef` are still needed (the callbacks above read them). Leave the existing `useLayoutEffect(() => { boardRef.current = board; ... })` block intact.

- [ ] **Step 2: Manual smoke test — multiplayer with default controls**

Run: `npm run dev`

Open two browsers (one regular, one incognito). Register usernames in both. Send an invite from one to the other and accept.

In the active match:
- Left/right clicks behave normally.
- Both-buttons chord on a revealed numbered cell with the right flag count.
- Spacebar over unrevealed flags; over revealed chords.
- Hit a mine → cooldown timer ticks down; clicks ignored during cooldown.

- [ ] **Step 3: Manual smoke test — multiplayer with non-default controls**

In one of the browsers, set:

```js
localStorage.setItem("minesweeper:controls:v1", JSON.stringify({
  chordTrigger: "middle-click",
  spacebarAction: "flag-only",
  questionMarks: true,
}));
location.reload();
```

Start a new match. Verify: middle-click chord works, both-buttons does not chord, spacebar over revealed cell does nothing (flag-only), right-click cycles unrevealed → flagged → ? → unrevealed.

- [ ] **Step 4: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

```bash
git add app/components/MultiplayerGame.tsx
git commit -m "Refactor MultiplayerGame to use useBoardInput hook"
```

---

## Task 9: /settings page + ControlsSettingsForm + NavBar link

Adds the user-facing settings page in the existing Win95 visual style.

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/components/ControlsSettingsForm.tsx`
- Modify: `app/components/NavBar.tsx`

- [ ] **Step 1: Add Settings link to NavBar**

Modify `app/components/NavBar.tsx`. In the `LINKS` array (line 8), add a fifth entry:

```tsx
const LINKS = [
  { href: "/", label: "Singleplayer" },
  { href: "/no-guess", label: "No Guess" },
  { href: "/multiplayer", label: "Multiplayer" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 2: Implement the settings form**

Create `app/components/ControlsSettingsForm.tsx`:

```tsx
"use client";

import { useControls } from "@/app/components/ControlsProvider";
import {
  type ChordTrigger,
  type SpacebarAction,
  DEFAULT_CONTROLS,
} from "@/app/lib/controls";
import { RAISED_INNER, SUNKEN_INNER, RAISED_OUTER } from "@/app/lib/win95";

const CHORD_OPTIONS: { value: ChordTrigger; label: string; description: string }[] = [
  { value: "both-buttons", label: "Both mouse buttons", description: "Hold left + right and release on a revealed numbered cell. (Default)" },
  { value: "middle-click", label: "Middle-click",      description: "Click the middle mouse button on a revealed numbered cell." },
  { value: "double-click", label: "Double-click",      description: "Double-click a revealed numbered cell." },
  { value: "none",         label: "Disabled",          description: "No mouse chord. Spacebar can still chord." },
];

const SPACEBAR_OPTIONS: { value: SpacebarAction; label: string; description: string }[] = [
  { value: "flag-or-chord", label: "Flag or chord", description: "Flag unrevealed cells; chord revealed numbered cells. (Default)" },
  { value: "flag-only",     label: "Flag only",     description: "Flag unrevealed cells; do nothing on revealed cells." },
  { value: "off",           label: "Disabled",      description: "Spacebar does nothing." },
];

interface Props {
  authLevel?: "anonymous" | "google";
}

export default function ControlsSettingsForm({ authLevel }: Props) {
  const { controls, updateControls, resetControls } = useControls();

  return (
    <div className={`bg-ms-silver ${RAISED_OUTER} p-6 max-w-xl mx-auto mt-6 font-mono text-sm`}>
      <h1 className="text-lg font-bold mb-4">Controls</h1>

      <Section title="Chord trigger" description="How to trigger a chord with the mouse on a revealed numbered cell.">
        {CHORD_OPTIONS.map(opt => (
          <RadioRow
            key={opt.value}
            name="chordTrigger"
            value={opt.value}
            label={opt.label}
            description={opt.description}
            checked={controls.chordTrigger === opt.value}
            onChange={() => updateControls({ chordTrigger: opt.value })}
          />
        ))}
      </Section>

      <Section title="Spacebar action" description="What spacebar does over the hovered cell.">
        {SPACEBAR_OPTIONS.map(opt => (
          <RadioRow
            key={opt.value}
            name="spacebarAction"
            value={opt.value}
            label={opt.label}
            description={opt.description}
            checked={controls.spacebarAction === opt.value}
            onChange={() => updateControls({ spacebarAction: opt.value })}
          />
        ))}
      </Section>

      <Section title="Question marks" description="When on, right-click cycles unrevealed → flagged → ? → unrevealed.">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={controls.questionMarks}
            onChange={e => updateControls({ questionMarks: e.target.checked })}
          />
          <span>Enable question-mark cycle</span>
        </label>
      </Section>

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={resetControls}
          className={`px-4 py-1 cursor-pointer bg-[#c0c0c0] ${RAISED_INNER} active:${SUNKEN_INNER}`}
        >
          Reset to defaults
        </button>
        <DefaultsHint controls={controls} />
      </div>

      <p className="mt-6 text-xs text-[#606060]">
        {authLevel === "google"
          ? "Synced to your account."
          : (
            <>
              Sign in with Google to sync settings across devices.
              {" "}
              <a href="/api/auth/google/init?next=/settings" className="underline">Sign in</a>
            </>
          )}
      </p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <fieldset className={`${SUNKEN_INNER} bg-ms-silver p-3 mt-4`}>
      <legend className="px-2 font-bold">{title}</legend>
      <p className="text-xs text-[#606060] mb-2">{description}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

function RadioRow({
  name, value, label, description, checked, onChange,
}: {
  name: string; value: string; label: string; description: string;
  checked: boolean; onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
      />
      <span>
        <span className="font-bold">{label}</span>
        <span className="block text-xs text-[#606060]">{description}</span>
      </span>
    </label>
  );
}

function DefaultsHint({ controls }: { controls: import("@/app/lib/controls").ControlsPrefs }) {
  const isDefault =
    controls.chordTrigger === DEFAULT_CONTROLS.chordTrigger &&
    controls.spacebarAction === DEFAULT_CONTROLS.spacebarAction &&
    controls.questionMarks === DEFAULT_CONTROLS.questionMarks;
  return (
    <span className="text-xs text-[#606060]">
      {isDefault ? "Using defaults." : "Custom settings."}
    </span>
  );
}
```

- [ ] **Step 3: Implement the settings page**

Create `app/settings/page.tsx`:

```tsx
import { cookies } from "next/headers";
import ControlsSettingsForm from "@/app/components/ControlsSettingsForm";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let authLevel: "anonymous" | "google" | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel === "google" ? "google" : "anonymous";
      }
    } catch { /* malformed token — render unauthenticated */ }
  }

  return (
    <main className="flex-1">
      <ControlsSettingsForm authLevel={authLevel} />
    </main>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

- Open `http://localhost:3000/settings`. Page renders the form. NavBar shows "Settings" highlighted.
- Click each radio in "Chord trigger" — selection updates immediately.
- Open DevTools → Application → Local Storage → check `minesweeper:controls:v1` updates after each click.
- Navigate to `/` and play. Verify the settings you picked are in effect.
- Navigate back to `/settings`. The form reflects the current settings (state is preserved via the provider).
- Click "Reset to defaults". Form returns to defaults; localStorage updates.
- Footer reads "Sign in with Google to sync settings across devices." with a working link.
- Sign in via mock Google (`http://localhost:3000/api/auth/google/init?next=/settings`). After redirect, the footer changes to "Synced to your account."
- Change a setting → DevTools Network panel shows a `PUT /api/preferences/controls`.
- In a separate browser/incognito, sign in with the same mock Google session (same cookie). Visit `/settings` — the previously-set values appear (server returned them on initial GET).

- [ ] **Step 5: Lint, typecheck, build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx app/components/ControlsSettingsForm.tsx app/components/NavBar.tsx
git commit -m "Add /settings page with controls form and NavBar link"
```

---

## Task 10: Backend changes (separate repo)

These edits go in `~/minesweeper-web-server`, not in this repo. Until they ship, the BFF returns 503 for the `GET` and the client falls back to localStorage gracefully. The plan author / user runs these in the backend repo.

**Files:** All paths below are inside `~/minesweeper-web-server/`. Adjust to match actual filenames if the structure differs.

- [ ] **Step 1: Add migration for `user_preferences`**

If the backend uses Postgres:

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  controls JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

If the backend uses SQLite, swap `JSONB` for `TEXT` and `NOW()` for `CURRENT_TIMESTAMP`; have the Python layer `json.dumps`/`json.loads` around the column.

- [ ] **Step 2: Add Python validator matching the frontend schema**

Add a module (e.g., `controls_schema.py`):

```python
CHORD_TRIGGERS = {"both-buttons", "middle-click", "double-click", "none"}
SPACEBAR_ACTIONS = {"flag-or-chord", "flag-only", "off"}

DEFAULT_CONTROLS = {
    "chordTrigger": "both-buttons",
    "spacebarAction": "flag-or-chord",
    "questionMarks": False,
}

def parse_controls(raw):
    if not isinstance(raw, dict):
        return dict(DEFAULT_CONTROLS)
    out = dict(DEFAULT_CONTROLS)
    if raw.get("chordTrigger") in CHORD_TRIGGERS:
        out["chordTrigger"] = raw["chordTrigger"]
    if raw.get("spacebarAction") in SPACEBAR_ACTIONS:
        out["spacebarAction"] = raw["spacebarAction"]
    if isinstance(raw.get("questionMarks"), bool):
        out["questionMarks"] = raw["questionMarks"]
    return out
```

- [ ] **Step 3: Add Flask routes**

In the Flask app (e.g., `app.py` or wherever routes live):

```python
from flask import Blueprint, request, jsonify
# Reuse the existing JWT-decoding helper that other endpoints use to get user_id
# (look for whatever returns user_id from the Authorization header in this codebase).

prefs_bp = Blueprint("preferences", __name__)

@prefs_bp.route("/api/preferences/controls", methods=["GET"])
def get_controls():
    user_id = require_google_user_from_auth_header()  # 401 if anonymous or missing
    row = db.session.execute(
        "SELECT controls FROM user_preferences WHERE user_id = :uid",
        {"uid": user_id},
    ).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"controls": parse_controls(row[0])})

@prefs_bp.route("/api/preferences/controls", methods=["PUT"])
def put_controls():
    user_id = require_google_user_from_auth_header()
    body = request.get_json(silent=True) or {}
    controls = parse_controls(body.get("controls"))
    db.session.execute(
        """
        INSERT INTO user_preferences (user_id, controls, updated_at)
        VALUES (:uid, :ctrls, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET controls = EXCLUDED.controls, updated_at = NOW()
        """,
        {"uid": user_id, "ctrls": json.dumps(controls)},
    )
    db.session.commit()
    return jsonify({"controls": controls})

# Register the blueprint where other blueprints are registered
# app.register_blueprint(prefs_bp)
```

`require_google_user_from_auth_header` should reject `authLevel != "google"` with 401. Reuse whichever helper the existing leaderboard / head-to-head endpoints use, modified to require Google specifically.

- [ ] **Step 4: Smoke test backend manually**

Bring up the backend locally and (using a real Google JWT or whatever mechanism the backend supports for testing):

```bash
# 401 without auth
curl -i http://localhost:5000/api/preferences/controls
# 404 first GET
curl -i -H "Authorization: Bearer <token>" http://localhost:5000/api/preferences/controls
# PUT
curl -i -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -X PUT -d '{"controls":{"chordTrigger":"middle-click","spacebarAction":"flag-only","questionMarks":true}}' \
  http://localhost:5000/api/preferences/controls
# 200 GET returns the stored value
curl -i -H "Authorization: Bearer <token>" http://localhost:5000/api/preferences/controls
```

- [ ] **Step 5: Smoke test full stack**

Back in this repo, run with the backend pointed in:

```bash
BACKEND_URL=http://localhost:5000 NEXT_PUBLIC_WS_URL=ws://localhost:5000 npm run dev
```

Sign in with Google, change a setting, reload, sign in from a different browser → the setting persists.

- [ ] **Step 6: Commit (in backend repo)**

```bash
cd ~/minesweeper-web-server
git add <changed files>
git commit -m "Add /api/preferences/controls endpoints and user_preferences table"
```

---

## Final verification

After all tasks ship:

- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` passes (controls + minesweeper tests added; existing solver tests still pass)
- [ ] `npm run build` passes
- [ ] Singleplayer game with each of the 4 chord triggers
- [ ] Singleplayer game with each of the 3 spacebar actions
- [ ] Singleplayer game with question marks on, including chord-with-question-cells edge case
- [ ] No-guess game (smoke test that the no-guess generation still works after the refactor)
- [ ] Multiplayer game (full match start to finish, both players)
- [ ] Cooldown still suppresses input correctly during multiplayer
- [ ] Settings persist across reload for guest user
- [ ] Settings persist across browsers for Google-signed-in user (assuming backend deployed)
- [ ] BFF returns 503 cleanly when backend is down — client stays on localStorage

---

## Notes on risk

- **Input refactor regression risk** is the highest single risk in this plan. Tasks 7 and 8 each include a manual smoke matrix; do not skip it.
- **First-sign-in race** is mitigated by `hasUserEditedRef` in `ControlsProvider` (Task 5).
- **Backend coordination** is mitigated by the BFF returning 503 on backend errors and the client retaining localStorage as the source of truth when the server is unreachable. Frontend can ship before the backend route exists.
