# Stats Page Redesign — Design

## Problem

The current `/stats` page has two issues:

1. **Visually misaligned with the rest of the site.** It does not set a background on its `<main>`, so the body's default `--background: #ffffff` shows through — every other themed page (`/multiplayer`, in-game pages) sits on a `#c0c0c0` (Win95 silver) backdrop with bevelled panels.
2. **Head-to-head records are the only content.** Users have no overview of their multiplayer activity — total matches, win rate, ELO, or rank. The page reads as a single utility lookup rather than a stats dashboard.

## Goals

- Page chrome matches the Win95 theme used elsewhere (silver background, bevelled panels with navy title bars).
- Surface multiplayer summary stats: matches played, win rate, ELO rating, global rank.
- Keep head-to-head records on the page, but as a secondary section under the summary.
- No backend changes — use existing endpoints only.

## Non-Goals

- Single-player stats. The backend does not persist single-player times, and we are not adding storage as part of this redesign.
- ELO history / charting / streaks / recent matches list — none of this data is currently exposed by the backend.
- Changing the auth gate. The page stays Google-authenticated only; non-Google users are redirected to `/`.
- A new `/elo/me` field for rank. If a user is outside the leaderboard's top-N, we render "Unranked" rather than adding a backend endpoint.

## Layout

Single centered column, always stacked (no responsive column reflow). The inner column is capped at `max-w-2xl` so panels feel comfortable on wide screens without restructuring.

```
[NavBar]
+------------------------------------------------+   bg-[#c0c0c0] on <main>
|                                                |
|   +------------------------------------------+ |   StatsSummary
|   | [#000080] Stats                          | |
|   +------------------------------------------+ |
|   |  Matches   Win %    ELO     Rank         | |
|   |    42      68%     1380     #12          | |
|   +------------------------------------------+ |
|                                                |
|   +------------------------------------------+ |   HeadToHeadTable
|   | [#000080] Head-to-Head                   | |
|   +------------------------------------------+ |
|   | Search: [_________________]              | |
|   | Opponent       W   L   Total             | |
|   | sweeper42      5   3    8                | |
|   | ...                                      | |
|   | < Prev   1/3   Next >                    | |
|   +------------------------------------------+ |
+------------------------------------------------+
```

Both panels use the same `max-w` so they align. The hero panel's interior is a sunken inner bevel split into 4 stat cells; each cell is a label (small, all-caps style) above a larger value.

## Components

### `app/stats/page.tsx` (rewritten)

Server component. Keeps the existing auth-gate logic verbatim:

- Reads the `session` cookie via `await cookies()`.
- Decodes JWT payload (base64url) for `authLevel`.
- Redirects to `/` if `authLevel !== "google"`.

Body changes:

- `<main>` gets `bg-[#c0c0c0]` plus `flex flex-col items-center py-6 px-4 gap-4` (mirroring the existing pattern but with the silver background).
- The single column inside is `flex flex-col gap-4 w-full max-w-2xl`.
- Inside that column: `<StatsSummary />` then `<HeadToHeadTable />`.

The inline title-bar window wrapper currently in `page.tsx` is removed — each child component now owns its own panel chrome.

### `app/components/StatsSummary.tsx` (new, `"use client"`)

Hero scoreboard. Standalone client component that owns its own data fetching.

**State:**

```ts
type State = {
  loading: boolean;
  error: boolean;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  rank: number | null;          // null = unranked or unknown
};
```

**Effect:**

On mount, `Promise.all` two fetches:

- `GET /api/elo/me` → `{ rating, wins, losses }`
- `GET /api/elo/leaderboard?limit=20` → `{ players: EloEntry[] }`

The component does not know its own username. Pass `username` in via props from the page (decoded server-side from the JWT in `app/stats/page.tsx`, the same way `app/multiplayer/page.tsx` already does for `<EloLeaderboard />`). Rank is computed as:

```ts
const idx = players.findIndex(p => p.username === username);
const rank = idx === -1 ? null : idx + 1;
```

`null` means "not in the top-20 leaderboard"; the cell renders `Unranked`.

If either fetch fails, set `error: true` and render `—` in all cells.

**Markup:**

Outer wrapper: `RAISED_OUTER` + `bg-[#c0c0c0]` (matches `app/stats/page.tsx`'s current outer style and `EloLeaderboard.tsx`).

Title bar: `bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none` containing the text `Stats`.

Body: `px-3 py-3` containing a `SUNKEN_INNER` panel `bg-white p-3` with a 4-column grid:

```
[Matches]  [Win %]  [ELO]  [Rank]
[  42  ]   [ 68% ]  [1380]  [#12]
```

Use `grid grid-cols-4 gap-3`. Each cell:

- Label: `font-mono text-[10px] uppercase text-[#808080] tracking-wider text-center`.
- Value: `font-mono text-xl font-bold text-center`.
- Loading: render `…` for the value.
- Error: render `—` for the value.

**Derived values:**

```ts
const total = wins + losses;
const matchesText = loading ? "…" : error ? "—" : String(total);
const winRateText =
  loading ? "…" :
  error ? "—" :
  total === 0 ? "—" :
  `${Math.round((wins / total) * 100)}%`;
const eloText = loading ? "…" : error ? "—" : String(rating);
const rankText =
  loading ? "…" :
  error ? "—" :
  rank == null ? "Unranked" :
  `#${rank}`;
```

### `app/components/HeadToHeadTable.tsx` (refactor)

Currently the component defines its own private `RAISED`/`SUNKEN` constants and renders a free-standing bevelled panel without a navy title bar. To match `<StatsSummary />`:

- Replace the local `RAISED`/`SUNKEN` constants with imports from `@/app/lib/win95`: `RAISED_OUTER` for the outer panel, `SUNKEN_INNER` for the inner sunken area, `RAISED_INNER` for the Prev/Next buttons.
- Wrap the panel in the same window chrome:
  - Outer: `RAISED_OUTER bg-[#c0c0c0] flex flex-col`.
  - Title bar: `bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none` with text `Head-to-Head`.
  - Body: `px-3 py-3` containing the existing `SUNKEN_INNER bg-white p-3` table region.
- Remove the inner `<h3>HEAD-TO-HEAD RECORDS</h3>` title — the navy title bar replaces it.
- Remove the `max-w-lg` and `w-full` constraints; the parent column controls width via `max-w-2xl`. The component becomes width-flexible (`w-full`).

Behavior (search debounce, pagination, fetch-on-change) is unchanged.

## Data flow summary

| Stat     | Endpoint                              | Field / derivation                                     |
|----------|---------------------------------------|--------------------------------------------------------|
| Matches  | `GET /api/elo/me`                      | `wins + losses`                                        |
| Win %    | `GET /api/elo/me`                      | `total === 0 ? "—" : Math.round(wins / total * 100)`   |
| ELO      | `GET /api/elo/me`                      | `rating`                                               |
| Rank     | `GET /api/elo/leaderboard?limit=20`    | `idx + 1` (where `idx = findIndex(...)`); `Unranked` if `idx === -1` |
| H2H rows | `GET /api/head-to-head?...`            | unchanged                                              |

All three endpoints already exist with mock-mode fallbacks — no backend or env-var changes.

## States

- **Loading.** `<StatsSummary />` shows `…` in each cell until both fetches resolve. `<HeadToHeadTable />` loads independently with its own existing loading row.
- **Zero matches.** Matches `0`, Win % `—`, ELO `1200` (backend default), Rank `Unranked`. No empty-state CTA.
- **`/api/elo/me` failure.** All four cells render `—`. The H2H panel below still works.
- **`/api/elo/leaderboard` failure but `/api/elo/me` succeeds.** Matches/Win %/ELO render normally; Rank shows `Unranked`.
- **Auth gate.** Unchanged. Non-Google users are redirected to `/`.

## Theme constants

All chrome uses existing constants from `app/lib/win95.ts`:

- `RAISED_OUTER` — both outer panels.
- `SUNKEN_INNER` — sunken inner regions inside each panel.
- `RAISED_INNER` — Prev/Next buttons in `<HeadToHeadTable />`.

The navy title bar pattern (`bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none`) matches the existing wrapper currently in `app/stats/page.tsx`.

## Files touched

- `app/stats/page.tsx` — rewrite body; keep auth gate; pass username prop into `<StatsSummary />`.
- `app/components/HeadToHeadTable.tsx` — wrap with shared window chrome; switch to shared bevel constants; remove now-redundant inner title; relax width.
- `app/components/StatsSummary.tsx` — new file.

No changes to `app/lib/win95.ts`, `globals.css`, the API routes, or the layout.

## Out of scope (deferred)

- Backend `/elo/me` returning rank directly (would let us show rank for users outside top-20 and avoid the second fetch).
- ELO history chart, current/best win streak, recent matches list — all require new backend endpoints.
- Single-player stats persistence and display.
- Tabbed details panel (Recent Games, ELO History) — unnecessary while head-to-head is the only details view.
