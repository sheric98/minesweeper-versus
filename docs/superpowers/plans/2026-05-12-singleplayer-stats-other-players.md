# Single-player Stats on Other Players' Stats Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface single-player stats on `/stats/[username]` (other players' pages) using the same table layout used on `/stats`, while reordering both stats pages so the single-player table sits above a renamed "Multiplayer" summary panel.

**Architecture:** Add a public `GET /singleplayer/stats/player?username=...` endpoint on the Flask backend that mirrors `/elo/player`, sharing query logic with `/singleplayer/stats/me` via an extracted helper. Add a matching Next.js BFF route. Extend the existing `<SingleplayerStatsTable>` component with an optional `username` prop that branches the fetch URL. Rename the existing `<StatsSummary>` panel title to "Multiplayer" and reorder both stats pages.

**Tech Stack:** Flask (`flask-sock`, Postgres via `psycopg2`), Next.js 16 App Router with React 19, TypeScript strict, Tailwind v4. Backend tests: pytest. Frontend tests: vitest (used only for pure-logic modules in this repo).

**Directories (the two repos live side-by-side):**

- Frontend (Next.js): `/home/sheric/minesweeper-web`
- Backend (Flask): `/home/sheric/minesweeper-web-server`

**Spec:** `docs/superpowers/specs/2026-05-12-singleplayer-stats-other-players-design.md`

**Existing test conventions (followed by this plan):**

- Backend: pytest tests only cover pure helpers/validators (see `tests/test_singleplayer.py` for the existing pattern — no Flask test client, no DB fixtures). Route-level tests are out of scope; we verify by running the server and curling the new endpoint.
- Frontend: vitest tests only cover pure-logic modules in `app/lib`. Components and Next.js API routes are not unit-tested. We verify via `npm run build` (which runs the TypeScript compiler) + `npm run lint` + manual smoke test in the browser.

---

## File Structure

**Files to create:**

- `/home/sheric/minesweeper-web/app/api/singleplayer/stats/player/route.ts` — new BFF route, ~30 lines, mirrors `/api/elo/player/route.ts`.
- `/home/sheric/minesweeper-web/app/api/singleplayer/_empty-categories.ts` — small shared helper extracted from the existing `/api/singleplayer/stats/me/route.ts` so both BFF routes share one definition of the "all categories, zeroed" response body.

**Files to modify:**

- `/home/sheric/minesweeper-web-server/singleplayer.py` — extract `_compute_stats_for_user(cur, user_id)`; add `GET /singleplayer/stats/player` route.
- `/home/sheric/minesweeper-web/app/api/singleplayer/stats/me/route.ts` — replace inline `emptyCategories()` with import from shared helper.
- `/home/sheric/minesweeper-web/app/components/SingleplayerStatsTable.tsx` — add optional `username` prop; branch fetch URL; add `username` to effect deps.
- `/home/sheric/minesweeper-web/app/components/StatsSummary.tsx` — replace `titleText` derivation with the literal string `"Multiplayer"`.
- `/home/sheric/minesweeper-web/app/stats/page.tsx` — move `<SingleplayerStatsTable />` above `<StatsSummary />`.
- `/home/sheric/minesweeper-web/app/stats/[username]/page.tsx` — add `<SingleplayerStatsTable username={routeUsername} />` above `<StatsSummary>`.

---

## Task 1: Backend — extract `_compute_stats_for_user` helper

**Files:**

- Modify: `/home/sheric/minesweeper-web-server/singleplayer.py`
- Test: `/home/sheric/minesweeper-web-server/tests/test_singleplayer.py` (run existing tests; no new tests)

This is a pure refactor. The new `/player` route in Task 2 will call this same helper.

- [ ] **Step 1: Read the current `/singleplayer/stats/me` route**

Open `/home/sheric/minesweeper-web-server/singleplayer.py`. The route function `get_my_stats` runs two SQL queries (lifetime LEFT JOIN against `all_categories`, then window aggregate from `recent_singleplayer_games`) and merges them into a list of category dicts. Lines roughly 197–275.

- [ ] **Step 2: Add the helper**

The helper references the module-level `ALL_CATEGORIES` constant, so place the helper *after* the `ALL_CATEGORIES = (...)` definition (currently around line 195) and *before* the `get_my_stats` route function. Insert:

```python
def _compute_stats_for_user(cur, user_id):
    """Return the list-of-categories dict for one user.

    Assumes `cur` is an open Postgres cursor inside an open connection.
    Caller is responsible for connection lifecycle.
    """
    cur.execute(
        """
        WITH all_categories(mode, difficulty) AS (
            VALUES ('random', 'standard'),
                   ('no-guess', 'beginner'),
                   ('no-guess', 'intermediate'),
                   ('no-guess', 'advanced'),
                   ('no-guess', 'expert')
        )
        SELECT c.mode, c.difficulty,
               COALESCE(s.total_wins, 0),
               s.fastest_win_seconds
        FROM all_categories c
        LEFT JOIN user_singleplayer_stats s
          ON s.user_id = %s AND s.mode = c.mode AND s.difficulty = c.difficulty
        """,
        (user_id,),
    )
    lifetime_rows = {(r[0], r[1]): (r[2], r[3]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT mode, difficulty,
               count(*) AS recent_count,
               count(*) FILTER (WHERE result = 'win') AS recent_wins,
               avg(time_seconds) FILTER (WHERE result = 'win') AS recent_avg
        FROM recent_singleplayer_games
        WHERE user_id = %s
        GROUP BY mode, difficulty
        """,
        (user_id,),
    )
    window_rows = {(r[0], r[1]): (r[2], r[3], r[4]) for r in cur.fetchall()}

    categories = []
    for (m, d) in ALL_CATEGORIES:
        total_wins, fastest = lifetime_rows.get((m, d), (0, None))
        recent_count, recent_wins, recent_avg = window_rows.get((m, d), (0, 0, None))
        categories.append({
            "mode": m,
            "difficulty": d,
            "total_wins": int(total_wins),
            "fastest_win_seconds": int(fastest) if fastest is not None else None,
            "recent_count": int(recent_count),
            "recent_wins": int(recent_wins),
            "recent_avg_win_seconds": round(float(recent_avg)) if recent_avg is not None else None,
        })
    return categories
```

Note: in the original file `ALL_CATEGORIES` already sits between `get_my_stats` and the (currently inlined) query block. After this refactor, the order in the file is: `post_game` → `ALL_CATEGORIES` → `_compute_stats_for_user` → `get_my_stats`.

- [ ] **Step 3: Rewrite `/singleplayer/stats/me` to use the helper**

Replace the body of `get_my_stats` after the auth check + `from db import get_conn` so it reads:

```python
@singleplayer_bp.route("/singleplayer/stats/me", methods=["GET"])
@require_auth
def get_my_stats():
    if not DATABASE_URL:
        # Mock mode — return empty stats for every category.
        categories = [
            {
                "mode": m,
                "difficulty": d,
                "total_wins": 0,
                "fastest_win_seconds": None,
                "recent_count": 0,
                "recent_wins": 0,
                "recent_avg_win_seconds": None,
            }
            for (m, d) in ALL_CATEGORIES
        ]
        return jsonify({"categories": categories})

    if g.auth_level != "google":
        return jsonify({"error": "Google authentication required"}), 403

    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            categories = _compute_stats_for_user(cur, g.user_id)
        return jsonify({"categories": categories})
    finally:
        conn.close()
```

- [ ] **Step 4: Run existing pytest suite to confirm import-time refactor didn't break anything**

```bash
cd /home/sheric/minesweeper-web-server
./venv/bin/python -m pytest tests/test_singleplayer.py -v
```

Expected: all existing tests pass (they cover `parse_game_submission`, which is in the same module and would fail to import if the refactor introduced a syntax error or naming bug).

- [ ] **Step 5: Commit**

```bash
cd /home/sheric/minesweeper-web-server
git add singleplayer.py
git commit -m "refactor: extract _compute_stats_for_user helper in singleplayer"
```

---

## Task 2: Backend — add `GET /singleplayer/stats/player`

**Files:**

- Modify: `/home/sheric/minesweeper-web-server/singleplayer.py`

- [ ] **Step 1: Add the new route at the bottom of `singleplayer.py`**

Append below `get_my_stats`:

```python
@singleplayer_bp.route("/singleplayer/stats/player", methods=["GET"])
def get_player_stats():
    if not DATABASE_URL:
        # Mock mode — return empty stats for every category, ignoring the username.
        # Matches /singleplayer/stats/me's mock behavior so the table renders in local dev.
        categories = [
            {
                "mode": m,
                "difficulty": d,
                "total_wins": 0,
                "fastest_win_seconds": None,
                "recent_count": 0,
                "recent_wins": 0,
                "recent_avg_win_seconds": None,
            }
            for (m, d) in ALL_CATEGORIES
        ]
        return jsonify({"categories": categories})

    username = request.args.get("username", "", type=str).strip()
    if not username:
        return jsonify({"error": "Missing username"}), 400

    from db import get_conn
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE username = %s",
                (username,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "User not found"}), 404
            user_id = row[0]
            categories = _compute_stats_for_user(cur, user_id)
        return jsonify({"categories": categories})
    finally:
        conn.close()
```

Notes:

- No `@require_auth` decorator — matches the public `/elo/player` endpoint.
- Mock mode returns 200 with zeros, not 503 like `/elo/player`. This is deliberate (see spec) so the new table renders in local dev.

- [ ] **Step 2: Start the backend in mock mode and curl the new endpoint**

In one terminal:

```bash
cd /home/sheric/minesweeper-web-server
./venv/bin/python app.py
```

In a second terminal:

```bash
curl -s 'http://localhost:5000/singleplayer/stats/player?username=anyone' | python3 -m json.tool
```

Expected: HTTP 200 JSON with `"categories"` array of length 5, every entry having `"total_wins": 0` and null fastest/avg.

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5000/singleplayer/stats/player'
```

Expected: `200` (mock mode) — when `DATABASE_URL` is unset, the mock branch fires before the username-missing check, mirroring how the mock branch in `/me` fires before the auth check. (Documented; not a bug.)

Stop the server (`Ctrl-C`).

- [ ] **Step 3: Commit**

```bash
cd /home/sheric/minesweeper-web-server
git add singleplayer.py
git commit -m "feat: add /singleplayer/stats/player endpoint"
```

---

## Task 3: Frontend — extract shared `emptyCategories` helper

**Files:**

- Create: `/home/sheric/minesweeper-web/app/api/singleplayer/_empty-categories.ts`
- Modify: `/home/sheric/minesweeper-web/app/api/singleplayer/stats/me/route.ts`

- [ ] **Step 1: Create the shared helper**

Write `/home/sheric/minesweeper-web/app/api/singleplayer/_empty-categories.ts`:

```ts
const ALL_CATEGORIES: Array<{ mode: string; difficulty: string }> = [
  { mode: "random", difficulty: "standard" },
  { mode: "no-guess", difficulty: "beginner" },
  { mode: "no-guess", difficulty: "intermediate" },
  { mode: "no-guess", difficulty: "advanced" },
  { mode: "no-guess", difficulty: "expert" },
];

export function emptyCategories() {
  return ALL_CATEGORIES.map((c) => ({
    mode: c.mode,
    difficulty: c.difficulty,
    total_wins: 0,
    fastest_win_seconds: null,
    recent_count: 0,
    recent_wins: 0,
    recent_avg_win_seconds: null,
  }));
}
```

The leading underscore in `_empty-categories.ts` keeps it out of Next.js's route discovery (segments starting with `_` are private folders/files in App Router).

- [ ] **Step 2: Update `/api/singleplayer/stats/me/route.ts` to use the shared helper**

Replace the file's body so the inline `ALL_CATEGORIES` + `emptyCategories()` are gone and the helper is imported. The final file:

```ts
import { NextRequest, NextResponse } from "next/server";
import { emptyCategories } from "@/app/api/singleplayer/_empty-categories";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ categories: emptyCategories() });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/singleplayer/stats/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[singleplayer/stats/me] Backend unreachable:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await backendRes.json().catch(() => ({ error: "Unknown backend error" }));
  return NextResponse.json(body, { status: backendRes.status });
}
```

- [ ] **Step 3: Type-check + lint**

```bash
cd /home/sheric/minesweeper-web
npm run lint
```

Expected: no errors.

```bash
cd /home/sheric/minesweeper-web
npm run build
```

Expected: build succeeds (this exercises the TypeScript compiler over the whole app).

- [ ] **Step 4: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/api/singleplayer/_empty-categories.ts app/api/singleplayer/stats/me/route.ts
git commit -m "refactor: extract emptyCategories helper for singleplayer BFF routes"
```

---

## Task 4: Frontend — add `/api/singleplayer/stats/player` BFF route

**Files:**

- Create: `/home/sheric/minesweeper-web/app/api/singleplayer/stats/player/route.ts`

- [ ] **Step 1: Create the route**

Write `/home/sheric/minesweeper-web/app/api/singleplayer/stats/player/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { emptyCategories } from "@/app/api/singleplayer/_empty-categories";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
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

Notes:

- No session cookie forwarding — the backend endpoint is public.
- Mock mode returns 200 with zeros (matches the backend's mock behavior).

- [ ] **Step 2: Type-check + lint**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Smoke-test the route in mock mode**

```bash
cd /home/sheric/minesweeper-web
npm run dev
```

In a second terminal:

```bash
curl -s 'http://localhost:3000/api/singleplayer/stats/player?username=anyone' | python3 -m json.tool
```

Expected: 200 JSON with `categories` array of length 5, all zero.

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/singleplayer/stats/player'
```

Expected: `400`.

Stop the dev server (`Ctrl-C`).

- [ ] **Step 4: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/api/singleplayer/stats/player/route.ts
git commit -m "feat: add /api/singleplayer/stats/player BFF route"
```

---

## Task 5: Frontend — extend `SingleplayerStatsTable` with optional `username` prop

**Files:**

- Modify: `/home/sheric/minesweeper-web/app/components/SingleplayerStatsTable.tsx`

- [ ] **Step 1: Add the `username` prop and branch the fetch URL**

In `app/components/SingleplayerStatsTable.tsx`:

1. Add a `Props` interface above the component:

   ```ts
   interface Props {
     username?: string;
   }
   ```

2. Change the component signature from `export default function SingleplayerStatsTable() {` to:

   ```ts
   export default function SingleplayerStatsTable({ username }: Props = {}) {
   ```

3. Inside the `useEffect`, replace the fetch URL with a branch:

   ```ts
   const url = username
     ? `/api/singleplayer/stats/player?username=${encodeURIComponent(username)}`
     : "/api/singleplayer/stats/me";
   fetch(url, { cache: "no-store" })
   ```

4. Update the effect's dependency array to include `username`:

   ```ts
   }, [reloadKey, username]);
   ```

No other changes — the title bar stays `Single-player`, the loading skeleton stays the same, the error/Retry treatment stays the same.

- [ ] **Step 2: Lint + build**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/components/SingleplayerStatsTable.tsx
git commit -m "feat: SingleplayerStatsTable accepts optional username prop"
```

---

## Task 6: Frontend — rename `StatsSummary` panel title to "Multiplayer"

**Files:**

- Modify: `/home/sheric/minesweeper-web/app/components/StatsSummary.tsx`

- [ ] **Step 1: Replace the `titleText` derivation with a literal**

In `app/components/StatsSummary.tsx`, find:

```ts
const titleText = isOwnStats || !username ? "Stats" : `${username} — Stats`;
```

Delete that line.

Then in the JSX, find the title-bar `<div>`:

```tsx
<div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
  {titleText}
</div>
```

Replace `{titleText}` with the literal string:

```tsx
<div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
  Multiplayer
</div>
```

Keep `username` and `isOwnStats` props as-is — they still drive ELO fetch URL selection and rank lookup.

- [ ] **Step 2: Lint + build**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/components/StatsSummary.tsx
git commit -m "feat: rename StatsSummary panel title to 'Multiplayer'"
```

---

## Task 7: Frontend — reorder `/stats` page

**Files:**

- Modify: `/home/sheric/minesweeper-web/app/stats/page.tsx`

- [ ] **Step 1: Reorder the children inside the column wrapper**

Find this block (the four children inside `<div className="flex flex-col gap-4 w-full max-w-2xl">`):

```tsx
<div className="flex flex-col gap-4 w-full max-w-2xl">
  <PlayerSearch />
  <StatsSummary username={username} />
  <SingleplayerStatsTable />
  <HeadToHeadTable />
</div>
```

Reorder to:

```tsx
<div className="flex flex-col gap-4 w-full max-w-2xl">
  <PlayerSearch />
  <SingleplayerStatsTable />
  <StatsSummary username={username} />
  <HeadToHeadTable />
</div>
```

(Only `<StatsSummary>` and `<SingleplayerStatsTable>` swap.)

- [ ] **Step 2: Lint + build**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/stats/page.tsx
git commit -m "feat: reorder /stats panels (single-player above multiplayer)"
```

---

## Task 8: Frontend — wire `<SingleplayerStatsTable>` into `/stats/[username]`

**Files:**

- Modify: `/home/sheric/minesweeper-web/app/stats/[username]/page.tsx`

- [ ] **Step 1: Import the component and render it**

Add the import alongside the existing imports at the top of `app/stats/[username]/page.tsx`:

```ts
import SingleplayerStatsTable from "@/app/components/SingleplayerStatsTable";
```

Then update the column wrapper to insert `<SingleplayerStatsTable username={routeUsername} />` above `<StatsSummary>`:

```tsx
<div className="flex flex-col gap-4 w-full max-w-2xl">
  <PlayerSearch />
  <SingleplayerStatsTable username={routeUsername} />
  <StatsSummary username={routeUsername} isOwnStats={false} />
  <TopOpponentsTable targetUsername={routeUsername} />
</div>
```

- [ ] **Step 2: Lint + build**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
cd /home/sheric/minesweeper-web
git add app/stats/[username]/page.tsx
git commit -m "feat: show single-player stats on /stats/[username] page"
```

---

## Task 9: Manual end-to-end verification

This task does not produce a commit — it's the gated check before declaring the work done.

- [ ] **Step 1: Start the dev server in mock mode**

```bash
cd /home/sheric/minesweeper-web
npm run dev
```

- [ ] **Step 2: Verify `/stats` (own stats page) in browser**

You need a Google-authenticated session for this page to render (it redirects to `/` otherwise). In mock dev mode without a session, the page redirects — that's expected. To exercise the UI you have two options:

**Option A (preferred — full stack):** Run the backend separately with a real Postgres + a Google auth flow. If you have this set up already, sign in and load `http://localhost:3000/stats`.

**Option B (mock mode with a faked session):** The `/api/register-session` BFF route accepts a username in mock mode and sets a session cookie. However, that path stamps `authLevel: "anonymous"`, not `"google"`, so the page will still redirect. Skip Option B unless you also want to patch the JWT generation to set `authLevel: "google"` locally — not part of this plan.

When loaded (Option A), confirm in the browser:

- The column ordering top to bottom is: PlayerSearch → Single-player panel → Multiplayer panel → Head-to-Head panel.
- The multiplayer summary panel's title bar reads `Multiplayer` (not `Stats`).
- The single-player table renders categories with your real win/fastest/recent data (or zeros if you have none).

- [ ] **Step 3: Verify `/stats/[username]` (other player's page) in browser**

Navigate to `http://localhost:3000/stats/<someotheruser>` where `<someotheruser>` is a real account with at least one logged single-player win.

Confirm:

- Column order top to bottom: PlayerSearch → Single-player panel → Multiplayer panel → Top Opponents panel.
- The single-player panel shows that user's stats (e.g. `total_wins > 0` for any category they've played, fastest time populated, etc.), not your own.
- The multiplayer panel's title is `Multiplayer`.
- Navigating from `/stats/<userA>` to `/stats/<userB>` (e.g. via the PlayerSearch input or by editing the URL) causes both panels to refetch and show userB's data — confirming the `username` prop change triggers the effect.

- [ ] **Step 4: Verify the 404 / unknown user case**

Navigate to `http://localhost:3000/stats/this-user-does-not-exist-xyz`.

Confirm:

- The single-player panel shows the existing "Couldn't load stats. [Retry]" treatment (the BFF surfaces a 404 from the backend; the component's `.catch` flips to `error: true`).
- The page does not crash.

- [ ] **Step 5: Stop the dev server**

`Ctrl-C` in the dev-server terminal.

- [ ] **Step 6: Final lint + build**

```bash
cd /home/sheric/minesweeper-web
npm run lint
npm run build
```

Expected: clean.

```bash
cd /home/sheric/minesweeper-web-server
./venv/bin/python -m pytest tests/ -v
```

Expected: all existing tests pass (sanity check; no new tests were added).

---

## Summary

After all tasks complete, the codebase has:

- A new public `GET /singleplayer/stats/player?username=...` endpoint on the Flask backend, sharing query logic with `/singleplayer/stats/me` via `_compute_stats_for_user`.
- A matching `/api/singleplayer/stats/player` BFF route on the Next.js side.
- `<SingleplayerStatsTable username?>` rendering either-or based on the prop.
- `<StatsSummary>` title bar reading `Multiplayer` instead of `Stats`/`<username> — Stats`.
- Both stats pages reordered: PlayerSearch → Single-player → Multiplayer → (Head-to-Head | Top Opponents).

The frontend ships in two commits per repo if you're tracking them — six commits in `minesweeper-web` + two in `minesweeper-web-server`.
