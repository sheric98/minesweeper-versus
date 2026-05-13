# Single-player Stats on Other Players' Stats Pages — Design

## Problem

Single-player stats currently surface only on `/stats` (the viewer's own page). When viewing `/stats/[username]` for another player, only multiplayer ELO summary and top opponents are shown — no single-player wins, fastest times, or recent-form metrics. The data exists in the database for every Google-authed user; it just isn't exposed for read by other viewers.

In addition, the panel ordering on both pages doesn't lead with the most personal/quick-glance content. The ELO summary panel is also titled simply "Stats", which is ambiguous now that there is both a single-player and a multiplayer stats panel.

## Goals

- Surface another player's single-player stats on `/stats/[username]` using the same table layout used on `/stats`.
- Reorder both stats pages so the order is: search → single-player → multiplayer → head-to-head/top-opponents.
- Rename the multiplayer summary panel's title bar to make it clear those stats are multiplayer-only.

## Non-Goals

- Hiding any columns when viewing other players. The "recent form" rolling-window columns (win rate over last N, avg win time over last N) show for everyone — same as own-stats.
- Adding rank or percentile per single-player category.
- Backend tests for the new endpoint — none of the existing single-player endpoints have unit tests in this repo's pattern; can be added later.
- Auth changes. The page-level Google gate already redirects non-Google viewers to `/`.

## Final Layout (both pages)

```
[NavBar]
+--------------------------------------------------+   bg-[#c0c0c0] on <main>
|                                                  |
|   +--------------------------------------------+ |   PlayerSearch
|   | Find player: [_______________]             | |
|   +--------------------------------------------+ |
|                                                  |
|   +--------------------------------------------+ |   SingleplayerStatsTable
|   | [#000080] Single-player                    | |
|   +--------------------------------------------+ |
|   | Category   Wins  Fastest  Win%   Avg time  | |
|   | Standard    42    0:31    62%    0:48      | |
|   | NG Beginner ...                            | |
|   +--------------------------------------------+ |
|                                                  |
|   +--------------------------------------------+ |   StatsSummary (renamed)
|   | [#000080] Multiplayer                      | |
|   +--------------------------------------------+ |
|   | Matches   Win %    ELO    Rank             | |
|   |   42      68%     1380    #12              | |
|   +--------------------------------------------+ |
|                                                  |
|   +--------------------------------------------+ |   HeadToHeadTable (/stats)
|   | [#000080] Head-to-Head                     | |     OR
|   +--------------------------------------------+ |   TopOpponentsTable (/stats/[user])
|   | ...                                        | |
|   +--------------------------------------------+ |
+--------------------------------------------------+
```

## Backend changes (`minesweeper-web-server`)

### New endpoint: `GET /singleplayer/stats/player`

Add to `singleplayer.py`. Public (no `@require_auth`), matching the sibling `/elo/player` endpoint's auth posture.

Query string: `username` (required, string). On missing/empty username, return `400 {"error": "Missing username"}`. On user not found, return `404 {"error": "User not found"}`.

Response shape: identical to `/singleplayer/stats/me`:

```json
{
  "categories": [
    {
      "mode": "random",
      "difficulty": "standard",
      "total_wins": 0,
      "fastest_win_seconds": null,
      "recent_count": 0,
      "recent_wins": 0,
      "recent_avg_win_seconds": null
    },
    ...
  ]
}
```

Every category in `ALL_CATEGORIES` is always present in the response (zeroed if the user has never played it), via the same LEFT JOIN pattern used in `/me`.

Mock mode (no `DATABASE_URL`): return the same all-zero category list `/me` returns in mock mode (200, every category present with zeros). No `users` table to consult; the username is effectively ignored. This diverges from `/elo/player`'s 503-in-mock-mode behavior in favor of parity with the sibling `/singleplayer/stats/me`, so the table renders in local dev without `BACKEND_URL`.

### Refactor: extract `_compute_stats_for_user(cur, user_id)`

The existing `/singleplayer/stats/me` runs two queries (lifetime LEFT JOIN against the fixed category list, then rolling-window aggregate) and assembles a `categories` list. Extract this into a private module-level helper:

```python
def _compute_stats_for_user(cur, user_id):
    """Return the list-of-categories dict for one user. Assumes a Postgres cursor."""
    # ... runs both queries, returns the same list /me builds today
```

Both `/me` and `/player` call this helper. The helper does not open or close the connection; the route does.

The `/player` route additionally translates `username -> user_id` first (one extra `SELECT id FROM users WHERE username = %s`), returning 404 if no row.

## Frontend BFF changes (`minesweeper-web`)

### New route: `app/api/singleplayer/stats/player/route.ts`

Mirrors `app/api/elo/player/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    // Mock mode: same empty-categories shape /me's mock returns.
    return NextResponse.json({ categories: emptyCategories() });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backendUrl}/singleplayer/stats/player?username=${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
  } catch (err) {
    console.error("[singleplayer/stats/player] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
```

`emptyCategories()` is the same helper used by `/api/singleplayer/stats/me/route.ts`. If keeping it copy-pasted feels excessive, extract to `app/api/singleplayer/_empty-categories.ts` and import from both routes. (Either choice is fine; the duplication is small.)

The route does not forward the session cookie: the backend endpoint is public.

## Component changes (`minesweeper-web`)

### `app/components/SingleplayerStatsTable.tsx` — extend with optional `username` prop

```ts
interface Props {
  username?: string;
}

export default function SingleplayerStatsTable({ username }: Props = {}) {
  // ...
}
```

Effect changes:

- Fetch URL is derived: `username` omitted → `/api/singleplayer/stats/me`; `username` present → `/api/singleplayer/stats/player?username=${encodeURIComponent(username)}`.
- Add `username` to the effect's dependency array so navigating between player pages refetches. `reloadKey` stays in the dep array too.
- All other behavior (loading skeleton, error retry, category ordering with zero-fill) is unchanged.

Title bar stays `Single-player` in both cases. The page URL and the `<StatsSummary>` "Multiplayer" panel beneath it (which uses the username prop to fetch the right ELO) carry whose stats this is.

### `app/components/StatsSummary.tsx` — rename title bar

The component currently computes:

```ts
const titleText = isOwnStats || !username ? "Stats" : `${username} — Stats`;
```

Replace with the literal string `"Multiplayer"` for both cases. The `username` and `isOwnStats` props remain (they still drive ELO fetch URL selection and rank lookup) — only the title rendering changes.

## Page wiring

### `app/stats/page.tsx`

Reorder children inside the column wrapper:

```tsx
<div className="flex flex-col gap-4 w-full max-w-2xl">
  <PlayerSearch />
  <SingleplayerStatsTable />
  <StatsSummary username={username} />
  <HeadToHeadTable />
</div>
```

(`<SingleplayerStatsTable />` moves above `<StatsSummary />`. No other changes.)

### `app/stats/[username]/page.tsx`

Add `<SingleplayerStatsTable username={routeUsername} />`, in the same position as on `/stats`:

```tsx
<div className="flex flex-col gap-4 w-full max-w-2xl">
  <PlayerSearch />
  <SingleplayerStatsTable username={routeUsername} />
  <StatsSummary username={routeUsername} isOwnStats={false} />
  <TopOpponentsTable targetUsername={routeUsername} />
</div>
```

## Data flow summary

| View                    | Multiplayer summary       | Single-player table                                       | Bottom panel                  |
|-------------------------|---------------------------|-----------------------------------------------------------|-------------------------------|
| `/stats` (self)         | `GET /api/elo/me`         | `GET /api/singleplayer/stats/me`                          | `<HeadToHeadTable />`         |
| `/stats/[user]` (other) | `GET /api/elo/player`     | `GET /api/singleplayer/stats/player?username=<user>`      | `<TopOpponentsTable />`       |

Rank in the multiplayer summary uses `GET /api/elo/leaderboard?limit=20` on both views (existing behavior, unchanged).

## States

- **Loading.** Each panel shows its own existing loading treatment; the single-player table renders dashes/ellipses in every row until the fetch resolves.
- **User exists but has no single-player games.** Backend's LEFT JOIN guarantees one row per category; the table renders zeros and `—` placeholders. Same UX as own-stats with no games.
- **User not found (404 from backend).** BFF passes the 404 through. Component sets `error: true` and renders the existing "Couldn't load stats. [Retry]" treatment. (This is a corner case — the stats route exists only for valid usernames in practice — but it's worth not throwing.)
- **`BACKEND_URL` unset (mock mode).** Both `/me` and `/player` BFF routes return the same empty-categories shape; the table renders zeros.
- **Auth gate.** Page-level redirect already sends non-Google viewers to `/`. No per-endpoint auth needed.

## Files touched

- `minesweeper-web-server/singleplayer.py` — add `/singleplayer/stats/player` route; extract `_compute_stats_for_user` helper used by both `/me` and `/player`.
- `minesweeper-web/app/api/singleplayer/stats/player/route.ts` — new BFF route.
- `minesweeper-web/app/components/SingleplayerStatsTable.tsx` — add optional `username` prop; branch fetch URL; add `username` to effect deps.
- `minesweeper-web/app/components/StatsSummary.tsx` — title bar always renders `Multiplayer`; drop `titleText` derivation.
- `minesweeper-web/app/stats/page.tsx` — reorder panels so `<SingleplayerStatsTable />` sits above `<StatsSummary />`.
- `minesweeper-web/app/stats/[username]/page.tsx` — same reorder; add `<SingleplayerStatsTable username={routeUsername} />`.

No changes to `app/lib/win95.ts`, `globals.css`, the database schema, or auth.

## Out of scope (deferred)

- Per-category rank/percentile for single-player.
- Visibility controls (hiding recent form from non-self viewers).
- Backend tests for the new endpoint.
- Refactor of `emptyCategories()` into a shared helper if duplication across the two BFF routes is acceptable.
