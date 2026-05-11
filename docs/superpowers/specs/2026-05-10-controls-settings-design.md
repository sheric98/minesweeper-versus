# Controls settings page

**Status:** Draft — design complete, awaiting plan
**Date:** 2026-05-10
**Repo touched:** `minesweeper-web` (this repo) + `minesweeper-web-server` (Flask backend, separate repo)

## Problem

Players want to customize Minesweeper input controls (chord trigger, spacebar
behavior, question marks). Today the site hard-codes one scheme:

- Left click reveals; right click flags
- Left + right held + released chords a revealed numbered cell
- Spacebar flags unrevealed/flagged cells, chords revealed numbered cells
- No question-mark state

Different popular Minesweeper sites pick different defaults; users want to match
their muscle memory. We also want preferences to survive across sessions for
guests and across devices for signed-in users.

## Goals

- Add a `/settings` page in the NavBar with controls for the v1 setting set.
- Persist preferences in `localStorage` for everyone, and additionally on the
  server for Google-authenticated users so they sync across devices.
- Refactor input handling out of `MinesweeperGame.tsx` and `MultiplayerGame.tsx`
  into a shared hook so new control variants can be added in one place.
- Keep current defaults so users who never visit `/settings` see no behavior
  change.

## Non-goals

- Touch-screen / mobile-specific ergonomics (flag-mode toggle button,
  auto-detect by device). Out of scope for v1.
- User-defined keybindings beyond the spacebar. Out of scope for v1.
- Per-mode (single/no-guess/multiplayer) preference sets. Settings are global.
- Audio or theme preferences. Out of scope, but the persistence layer is built
  to extend without migration.

## v1 setting set

```ts
// app/lib/controls.ts
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

export function parseControls(input: unknown): ControlsPrefs;
```

Defaults match today's site behavior exactly. `parseControls` is the single
source of truth for "valid prefs object" — used by localStorage hydration, BFF
payload validation, and any future migrations. Unknown keys are dropped;
unknown enum values fall back to the default.

`localStorage` key: `"minesweeper:controls:v1"`. The `:v1` suffix lets future
schema changes choose between auto-migrate or wipe.

### Behavior of each option

**`chordTrigger`** — how the user fires a chord via mouse on a revealed numbered cell:
- `both-buttons` (default): press L+R together, release → chord. Matches current site.
- `middle-click`: press middle button on a revealed numbered cell → chord. Single-button alternative.
- `double-click`: double-click a revealed numbered cell → chord.
- `none`: mouse chord disabled. User can still chord via spacebar if `spacebarAction` is `flag-or-chord`.

**`spacebarAction`** — what spacebar does over a hovered cell:
- `flag-or-chord` (default): unrevealed/flagged → flag; revealed numbered → chord.
- `flag-only`: unrevealed/flagged → flag; revealed → no-op.
- `off`: spacebar is inert; key is not consumed (`preventDefault` is skipped).

**`questionMarks`** — when on, right-click on an unrevealed cell cycles
`unrevealed → flagged → question → unrevealed` instead of toggling flag.
A `"question"` cell renders a `?` and is treated as unrevealed by reveal/chord
logic (chord neighbor count still requires real flags, not question marks).
When the setting flips from on → off, any existing `"question"` cells become
`"unrevealed"` lazily — on next render they are treated as unrevealed (no
mutation needed; `Cell.tsx` falls through to the unrevealed branch when
`questionMarks === false`).

## Architecture

### Client state — `ControlsProvider`

`app/components/ControlsProvider.tsx` (new), mounted in `app/layout.tsx` so
every page can read prefs.

- Reads `localStorage` on mount, seeds state via `parseControls` or defaults.
- Receives `authLevel` as a prop from `RootLayout` (which already parses it from
  the session cookie).
- If `authLevel === "google"`, fires one `GET /api/preferences/controls` after
  mount. On success: server wins, overwrites both state and `localStorage`. On
  404: PUT current `localStorage` prefs to the server (this is the first-sign-in
  merge). On network failure: keep local state, log to console.
- Exposes `useControls()` returning `{ controls, updateControls(partial) }`.
- `updateControls` is optimistic: writes localStorage and state synchronously;
  if `authLevel === "google"`, fires `PUT /api/preferences/controls` in the
  background. PUT failures log and do not roll back — settings aren't
  safety-critical, and reverting state behind a user who just made a click
  produces worse UX than rare drift across devices.

Anonymous guest accounts (those who registered a multiplayer username but did
not sign in with Google) get `authLevel === "anonymous"`. They are treated like
fully logged-out visitors for prefs: localStorage only. The cross-account
persistence requirement applies to Google users.

### Input refactor — `useBoardInput`

Both `MinesweeperGame.tsx` and `MultiplayerGame.tsx` carry ~120 lines of
near-identical mouse and keyboard plumbing
(`leftDownRef`/`rightDownRef`/`wasChordingRef`/`hoveredCellRef`, the window
`mouseup` resetter, the `keydown` listener, `computeSunkCells`, the
drag-release branch). We extract this into one hook.

```ts
// app/lib/useBoardInput.ts
export function useBoardInput(args: {
  controls: ControlsPrefs;
  board: Board | null;
  enabled: boolean;
  onReveal: (row: number, col: number) => void;
  onFlag:   (row: number, col: number) => void;
  onChord:  (row: number, col: number) => void;
}): {
  boardHandlers: { onMouseDown; onMouseUp; onMouseLeave };
  cellHandlers:  { onCellLeftClick; onCellRightClick; onCellMouseEnter };
  sunkCells: Set<string>;
};
```

What the hook owns:
- All input refs and the window-level listeners (`mouseup` resetter,
  `keydown` for spacebar).
- `sunkCells` computation and exposure.
- Drag-release semantics (left-press in cell A, drag to B, release on B →
  `onReveal(B)`), preserved exactly from today's code.
- Branching on `controls.chordTrigger` for the four mouse-chord modes.
- Branching on `controls.spacebarAction` for the three keyboard modes.

What the hook does *not* own:
- Game-state semantics. Single-player decides "is this a mine? lose";
  multiplayer decides "is this a mine? cooldown + WS send". Those live in the
  callbacks passed in.
- The `questionMarks` cycling logic lives in `lib/minesweeper.ts`'s flag
  function. The hook receives the boolean via `controls` and forwards it.

After the refactor, `MinesweeperGame.tsx` and `MultiplayerGame.tsx` lose their
mouse refs, window-level effects, and the chord/flag handlers. Their
`onReveal`/`onFlag`/`onChord` callbacks contain only game logic.

### Minesweeper lib changes

`app/lib/minesweeper.ts`:
- Add `"question"` to the `Cell["state"]` union.
- `toggleFlag(board, r, c, opts: { questionMarks: boolean })` becomes a cycler:
  - `questionMarks: false` — `unrevealed ↔ flagged` (current behavior, ignores `question` as `unrevealed`).
  - `questionMarks: true` — `unrevealed → flagged → question → unrevealed`.
- `revealCell`, `chordReveal`, `countFlags`, `checkWin` treat `"question"` like
  `"unrevealed"`. A question-marked cell does *not* count as a flag for chord
  satisfaction.

`app/components/Cell.tsx`:
- New render branch for `state === "question"` rendering a `?` on a raised
  unrevealed tile.

### Persistence — BFF + Flask

**Next.js BFF** — new file `app/api/preferences/controls/route.ts`:

- `GET`:
  - Reads session cookie. If absent or `authLevel !== "google"`, returns 401.
  - In mock mode (no `BACKEND_URL`): reads from an in-memory map keyed by
    `user_id` (resets on dev-server restart — acceptable for dev).
  - Otherwise: proxies to `GET {BACKEND_URL}/api/preferences/controls` with
    `Authorization: Bearer <jwt>`. Returns the backend's 200 or 404 verbatim.
- `PUT`:
  - Reads session cookie. If absent or `authLevel !== "google"`, returns 401.
  - Reads body, validates with `parseControls`. On invalid shape returns 400.
  - In mock mode: writes to the in-memory map.
  - Otherwise: forwards validated JSON to `PUT {BACKEND_URL}/api/preferences/controls`.

**Flask backend** (separate repo `~/minesweeper-web-server`):

- New table (Postgres syntax shown; if the backend uses SQLite, swap `JSONB`
  for `TEXT` and have the Flask layer `json.dumps`/`json.loads` around it):

  ```sql
  CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY,            -- maps to JWT 'userId' / Google 'sub'
    controls JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```

- New routes:
  - `GET /api/preferences/controls` — bearer-auth required; returns
    `{controls: {...}}` or 404 if no row.
  - `PUT /api/preferences/controls` — bearer-auth required; upserts the
    `controls` JSON. Server re-validates against a Python schema before
    storing; unknown keys are dropped. Returns 200 with stored value.
- Both routes reject `authLevel === "anonymous"` JWTs.

JSON column gives forward-compat: adding a sound or theme setting later needs
no migration on the server side.

### Settings page — `/settings`

`app/settings/page.tsx` (new Server Component):
- Reads session cookie (same pattern as `app/layout.tsx`), passes `authLevel`
  and `username` to the client form.

`app/components/ControlsSettingsForm.tsx` (new client component):
- Win95-styled form matching `Header.tsx` / `DifficultySelector.tsx` /
  `Leaderboard.tsx` aesthetics.
- Three sections:
  - **Chord trigger** — radio group of 4 (both buttons / middle-click /
    double-click / none) with one-line descriptions.
  - **Spacebar action** — radio group of 3 (flag or chord / flag only / off).
  - **Question marks** — single checkbox.
- "Reset to defaults" button at the bottom.
- Save-on-change (no explicit Save button); every interaction calls
  `updateControls`.
- Auth-aware footer:
  - `authLevel === "google"`: "Synced to your account."
  - else: "Sign in with Google to sync settings across devices." with a link to
    the existing Google sign-in flow.

`app/components/NavBar.tsx`:
- Add `{ href: "/settings", label: "Settings" }` to `LINKS`. Existing
  active-state styling handles the rest.

## Data flow

```
guest visit                    google sign-in (returning)        google sign-in (first time)
-----------                    --------------------------        ---------------------------
localStorage → state           localStorage → state              localStorage → state
                                                                     (initial seed)
                               GET prefs → 200                   GET prefs → 404
                                  ↓                                  ↓
                               server wins; state +              PUT current local prefs
                               localStorage updated                  ↓
                                                                  state unchanged
                                                                  server now has prefs

interaction (anywhere)
----------------------
updateControls(partial)
  → state + localStorage (sync)
  → PUT /api/preferences/controls (background, only if google)
```

## Files touched

This repo (`minesweeper-web`):

- **New**
  - `app/lib/controls.ts` — types, defaults, `parseControls`.
  - `app/lib/useBoardInput.ts` — shared input hook.
  - `app/components/ControlsProvider.tsx` — context + `useControls`.
  - `app/components/ControlsSettingsForm.tsx` — settings form.
  - `app/settings/page.tsx` — server component host.
  - `app/api/preferences/controls/route.ts` — BFF GET/PUT.
- **Modified**
  - `app/layout.tsx` — wrap children in `<ControlsProvider>`, pass
    `authLevel` down.
  - `app/components/NavBar.tsx` — add `Settings` link.
  - `app/components/MinesweeperGame.tsx` — use `useBoardInput`; remove ~120
    lines of input plumbing.
  - `app/components/MultiplayerGame.tsx` — use `useBoardInput`; remove ~120
    lines of input plumbing.
  - `app/lib/minesweeper.ts` — `"question"` state; `toggleFlag` signature
    change; reveal/chord/checkWin/countFlags treat `question` as unrevealed.
  - `app/components/Cell.tsx` — render branch for `"question"`.

Separate repo (`minesweeper-web-server`):

- Migration: `user_preferences` table.
- New Flask routes: `GET`/`PUT /api/preferences/controls`.
- Python schema validation matching `ControlsPrefs`.

## Manual test plan

No test framework configured. Verification is manual; the implementation plan
will spell out the exact checklist. The required coverage:

- **Per game surface** (singleplayer, no-guess, multiplayer):
  - Default settings → behaves identical to pre-refactor.
  - Each `chordTrigger` value chords correctly and the other triggers do not.
  - Each `spacebarAction` value behaves correctly when spacebar pressed over
    unrevealed/flagged/revealed cells.
  - `questionMarks` on: R-click cycles through `unrevealed → flagged →
    question → unrevealed`; flagged-cell-only chord still works (questions do
    not satisfy chord neighbor counts).
  - Drag-release still reveals on the cell where left was released.
- **Persistence**:
  - Guest: change settings → reload → settings preserved.
  - Sign in as a brand-new Google user with non-default local prefs: server
    accepts the upload; reload from another browser preserves them.
  - Sign in as a returning Google user: server's saved prefs overwrite the
    local prefs.
  - Anonymous (multiplayer) guest: prefs stay local; no network calls to
    `/api/preferences/controls`.
- **Edge cases**:
  - Corrupted `localStorage` value → defaults applied silently.
  - Backend returns 5xx on PUT → console warning, local state unchanged.

## Risks

- **Input refactor regression risk.** Mouse handling has subtle invariants
  (drag-release, the "fresh press sequence" reset, right-click suppression
  after a chord). The hook must preserve them exactly. Mitigation: review the
  hook diff against both game files side by side; test the matrix above before
  merging.
- **Multiplayer state coupling.** The multiplayer file passes more state into
  its handlers (`cooldownMsRef`, `deathCountRef`, `clickLogRef`, `sendRef`).
  The hook's `enabled: boolean` covers cooldown gating, but the callbacks
  retain access to those refs. Mitigation: the hook is intentionally agnostic
  to those refs — they live in `onReveal`/`onFlag`/`onChord` closures.
- **First-sign-in merge race.** If a user changes a setting in the small
  window between mount and the `GET` response landing, the GET could overwrite
  their just-made change. Mitigation: `ControlsProvider` debounces — if a PUT
  has fired since mount, ignore the in-flight GET response. (Implementation
  detail for the plan, called out here so it isn't forgotten.)
- **Backend coordination.** The frontend may deploy before the backend route
  exists. Mitigation: the BFF distinguishes three cases on `GET`:
  - Backend 200 → propagate (server wins).
  - Backend 404 → propagate (client interprets as first-sign-in, PUTs local).
  - Backend unreachable / 5xx → return 503 to client; `ControlsProvider` logs
    and stays on localStorage. Once backend is live, sync resumes on next
    page load with no frontend change.
