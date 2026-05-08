# Stats Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/stats` so it matches the Win95 theme (silver background, bevelled panels with navy title bars) and shows summary stats — matches, win rate, ELO, rank — alongside the existing head-to-head table.

**Architecture:** Add a new `<StatsSummary />` client component that fetches `/api/elo/me` and `/api/elo/leaderboard` in parallel and renders four stat cells in a Win95-styled hero panel. Refactor `<HeadToHeadTable />` to share the same window chrome (outer raised bevel, navy title bar, sunken inner panel). Rewrite `app/stats/page.tsx` to set the silver page background, decode the username from the JWT server-side, and stack the two panels in a centered `max-w-2xl` column.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4. No backend changes. No new npm dependencies. Project has no test framework — verification is via `npm run lint`, `npm run build`, and a manual visual check in the dev server.

**Spec:** `docs/superpowers/specs/2026-05-08-stats-page-redesign-design.md`

**File map:**
- Create: `app/components/StatsSummary.tsx` — hero scoreboard panel (4 stat cells).
- Modify: `app/stats/page.tsx` — silver bg, drop outer title-bar wrapper, decode `username` from JWT, render `<StatsSummary />` + `<HeadToHeadTable />` in a stacked column.
- Modify: `app/components/HeadToHeadTable.tsx` — replace local bevel constants with shared ones from `@/app/lib/win95`, add a navy "Head-to-Head" title bar, drop the inner `<h3>HEAD-TO-HEAD RECORDS</h3>`, remove the `max-w-lg` so the parent column controls width.

**Task ordering rationale:** Task 1 is purely additive (new file, not yet wired up). Task 2 wires the new component into the page; this is the moment the page visually changes. After Task 2 the H2H panel below temporarily looks slightly off-theme (own bevel, no title bar) — this is fixed in Task 3. Each task ends in a green build and a clean commit.

---

## Task 1: Create the `StatsSummary` component

**Files:**
- Create: `app/components/StatsSummary.tsx`

This task is purely additive. Nothing imports the new component yet, so the visible page is unchanged. Verification is just "the project still builds with the new file present."

- [ ] **Step 1: Create the file with full implementation**

Create `app/components/StatsSummary.tsx` with this exact contents:

```tsx
"use client";

import { useEffect, useState } from "react";
import { RAISED_OUTER, SUNKEN_INNER } from "@/app/lib/win95";

interface EloMe {
  rating: number;
  wins: number;
  losses: number;
}

interface LeaderboardEntry {
  username: string;
  rating: number;
  wins: number;
  losses: number;
}

interface LeaderboardResponse {
  players?: LeaderboardEntry[];
}

interface StatsSummaryProps {
  username?: string;
}

export default function StatsSummary({ username }: StatsSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<EloMe | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/elo/me").then((r) =>
        r.ok ? (r.json() as Promise<EloMe>) : Promise.reject(new Error("elo/me failed")),
      ),
      fetch("/api/elo/leaderboard?limit=20").then((r) =>
        r.ok ? (r.json() as Promise<LeaderboardResponse>) : Promise.reject(new Error("leaderboard failed")),
      ),
    ])
      .then(([meData, lbData]) => {
        if (cancelled) return;
        setMe(meData);
        if (username && Array.isArray(lbData.players)) {
          const idx = lbData.players.findIndex((p) => p.username === username);
          setRank(idx === -1 ? null : idx + 1);
        } else {
          setRank(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const total = me ? me.wins + me.losses : 0;
  const matchesText = loading ? "…" : error || !me ? "—" : String(total);
  const winRateText = loading
    ? "…"
    : error || !me
      ? "—"
      : total === 0
        ? "—"
        : `${Math.round((me.wins / total) * 100)}%`;
  const eloText = loading ? "…" : error || !me ? "—" : String(me.rating);
  const rankText = loading
    ? "…"
    : error
      ? "—"
      : rank == null
        ? "Unranked"
        : `#${rank}`;

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Stats
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          <div className="grid grid-cols-4 gap-3">
            <StatCell label="Matches" value={matchesText} />
            <StatCell label="Win %" value={winRateText} />
            <StatCell label="ELO" value={eloText} />
            <StatCell label="Rank" value={rankText} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[10px] uppercase text-[#808080] tracking-wider">
        {label}
      </span>
      <span className="font-mono text-xl font-bold">{value}</span>
    </div>
  );
}
```

Key points to keep consistent with later tasks:

- The component accepts `username?: string` — the page in Task 2 must pass it in.
- Outer chrome uses `RAISED_OUTER` + `bg-[#c0c0c0]` + `flex flex-col w-full`. Task 3 mirrors this exactly for the H2H panel.
- Title-bar string literal is `Stats` (not `STATS`, not `Player Stats`).
- The `cancelled` flag guards against state updates after unmount — required because React 19 strict-mode dev double-invokes effects.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors related to the new file. (Pre-existing warnings in unrelated files are fine.)

- [ ] **Step 3: Type-check via build**

Run: `npm run build`
Expected: build succeeds. Specifically, the build output should list `/stats` and any other static routes without TypeScript errors.

If the build complains that `RAISED_OUTER` or `SUNKEN_INNER` is not exported, double-check the imports against `app/lib/win95.ts` — both names are exported there.

- [ ] **Step 4: Commit**

```bash
git add app/components/StatsSummary.tsx
git commit -m "Add StatsSummary component for stats page hero"
```

---

## Task 2: Wire `StatsSummary` into the stats page and re-theme the page

**Files:**
- Modify: `app/stats/page.tsx`

After this task, `/stats` will render the new hero panel on a silver background with the existing H2H panel beneath it. The H2H panel will look slightly off-theme until Task 3.

- [ ] **Step 1: Replace the entire contents of `app/stats/page.tsx`**

Open `app/stats/page.tsx` and replace its contents with:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HeadToHeadTable from "@/app/components/HeadToHeadTable";
import StatsSummary from "@/app/components/StatsSummary";

export default async function StatsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let authLevel: string | undefined;
  let username: string | undefined;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        authLevel = payload.authLevel;
        if (typeof payload.sub === "string") username = payload.sub;
      }
    } catch { /* malformed token */ }
  }

  if (authLevel !== "google") {
    redirect("/");
  }

  return (
    <main className="bg-[#c0c0c0] flex flex-1 flex-col items-center py-6 px-4 gap-4">
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        <StatsSummary username={username} />
        <HeadToHeadTable />
      </div>
    </main>
  );
}
```

Notes:

- The existing auth-gate logic is preserved: read `session` cookie, decode JWT, redirect non-Google to `/`. Only added the extra `payload.sub` extraction.
- The previous `RAISED_OUTER`-wrapped outer "Stats" title-bar window is gone — each child component now owns its own chrome.
- `<main>` uses `flex flex-1` so the silver background fills the area below the NavBar even on tall viewports. The body in `app/layout.tsx` is already `flex flex-col min-h-screen`, so `flex-1` on `<main>` works.
- Inner column is `max-w-2xl` (per the spec) so both children share the same width.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Type-check via build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Visual smoke check in dev server**

Run: `npm run dev` (background or separate terminal)

In a browser, sign in with Google, then navigate to `http://localhost:3000/stats`. Verify:

- The page background is Win95 silver (`#c0c0c0`), not white.
- A panel with a navy title bar saying "Stats" sits at the top, containing four stat cells: Matches, Win %, ELO, Rank.
- In mock mode (no `BACKEND_URL` set), the values should be: Matches `10`, Win % `70%`, ELO `1200`, Rank either `#N` if your mock username is in the mock leaderboard or `Unranked` otherwise. (Mock `/api/elo/me` returns `{ rating: 1200, wins: 7, losses: 3 }`.)
- The head-to-head table appears below it. It is currently *not* wrapped in a navy title bar — that's fixed in Task 3.

If you cannot sign in with Google in your local environment, the gate will redirect you to `/`. In that case, temporarily comment out the `redirect("/")` line for the smoke check, then restore it before committing.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add app/stats/page.tsx
git commit -m "Re-theme stats page with silver bg and StatsSummary hero"
```

---

## Task 3: Refactor `HeadToHeadTable` to share window chrome

**Files:**
- Modify: `app/components/HeadToHeadTable.tsx`

After this task, the H2H panel matches the StatsSummary panel: same outer bevel, navy "Head-to-Head" title bar, sunken inner panel.

- [ ] **Step 1: Replace the entire contents of `app/components/HeadToHeadTable.tsx`**

Open `app/components/HeadToHeadTable.tsx` and replace its contents with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { RAISED_OUTER, RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

interface H2HRecord {
  opponent: string;
  wins: number;
  losses: number;
  total_games: number;
}

const PAGE_SIZE = 10;

export default function HeadToHeadTable() {
  const [records, setRecords] = useState<H2HRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);

    try {
      const res = await fetch(`/api/head-to-head?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to fetch records");
        setRecords([]);
        setTotalRecords(0);
        return;
      }
      const data = await res.json();
      setRecords(data.records || []);
      setTotalRecords(data.total_records || 0);
    } catch {
      setError("Failed to fetch records");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  return (
    <div className={`${RAISED_OUTER} bg-[#c0c0c0] flex flex-col w-full`}>
      <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none">
        Head-to-Head
      </div>
      <div className="px-3 py-3">
        <div className={`${SUNKEN_INNER} bg-white p-3`}>
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opponent..."
              className={`${SUNKEN_INNER} w-full px-2 py-1 font-mono text-xs bg-white outline-none`}
            />
          </div>

          {/* Table */}
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-[#a0a0a0]">
                <th className="text-left py-1">Opponent</th>
                <th className="text-right py-1">W</th>
                <th className="text-right py-1">L</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center text-[#808080] py-4">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={4} className="text-center text-red-600 py-4">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && records.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-[#808080] py-4">
                    {debouncedSearch ? "No matching opponents" : "No records yet"}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                records.map((r) => (
                  <tr key={r.opponent} className="border-b border-[#e0e0e0] hover:bg-[#e8e8e8]">
                    <td className="text-left py-1 truncate max-w-[10rem]">{r.opponent}</td>
                    <td className="text-right py-1">{r.wins}</td>
                    <td className="text-right py-1">{r.losses}</td>
                    <td className="text-right py-1">{r.total_games}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`${RAISED_INNER} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
              >
                Prev
              </button>
              <span className="font-mono text-xs text-[#808080]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`${RAISED_INNER} px-3 py-0.5 font-mono text-xs bg-[#c0c0c0] disabled:opacity-50 disabled:cursor-default hover:brightness-95 active:brightness-90`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

What changed from the original (for reviewer awareness — do not write a "what changed" comment in the file):

- Imports `RAISED_OUTER`, `RAISED_INNER`, `SUNKEN_INNER` from `@/app/lib/win95` instead of the file-local `RAISED`/`SUNKEN` constants. The local constants are removed.
- The local `RAISED` constant pointed at the `RAISED_INNER` shade; in the new outer wrapper we use `RAISED_OUTER` (white highlights) to match `<StatsSummary />`. Buttons keep the inner shade via `RAISED_INNER`. The search input stays sunken-inner.
- Outer wrapper is now a flex column with a navy title-bar div ("Head-to-Head") and a body div that contains the existing sunken inner panel.
- The `<h3>HEAD-TO-HEAD RECORDS</h3>` is removed — the navy title bar replaces it.
- The previous `w-full max-w-lg` is dropped; the new outer wrapper is `w-full` only, letting the parent column (`max-w-2xl` in `app/stats/page.tsx`) drive width.

Logic (search debounce, fetch effect, pagination math, table rendering, error/empty/loading rows) is byte-identical to before.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Type-check via build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Visual smoke check in dev server**

Run: `npm run dev`

Visit `http://localhost:3000/stats` (signed in as a Google user). Verify:

- Both panels share the same chrome: outer raised silver bevel, navy title bar with white text (`Stats` and `Head-to-Head`), sunken white inner area.
- Both panels are the same width and aligned in a centered column.
- The H2H search box, table, and pagination still work — type a query, watch the debounce kick in, click Prev/Next.
- No layout shift on a wide window. On a narrow viewport (resize to ~400px wide), the column reflows naturally and stays readable; nothing overflows horizontally.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add app/components/HeadToHeadTable.tsx
git commit -m "Wrap HeadToHeadTable in shared Win95 window chrome"
```

---

## Wrap-up

After Task 3 is committed, the redesign is complete:

- `/stats` renders on the silver Win95 background.
- A hero panel shows Matches / Win % / ELO / Rank for the current Google-authenticated user.
- The head-to-head table sits beneath, in a matching themed panel.
- No backend, env-var, layout, or `globals.css` changes were needed.

Run a final `npm run build` from the repo root to confirm the working tree builds cleanly, then push the branch.
