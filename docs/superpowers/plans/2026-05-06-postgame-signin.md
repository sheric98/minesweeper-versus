# Post-game sign-in flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt anonymous players to sign in with Google after qualifying single-player wins (top-10) and after every multiplayer game-over, persisting the single-player score across the OAuth roundtrip.

**Architecture:** A short-lived `oauth_next` HttpOnly cookie threads a return path through the existing OAuth flow. `localStorage` holds a typed `pendingScore` entry across the roundtrip. The single-player game owns leaderboard fetch state so it can run a top-10 qualification check; a new `PostWinSignInModal` opens for qualifying anonymous wins. The existing `GameOverModal` gains an `authLevel` prop and shows a "Sign in to track ELO" section for anonymous players in multiplayer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, existing Win95 styling helpers from `app/lib/win95.ts`.

**Spec:** `docs/superpowers/specs/2026-05-06-postgame-signin-design.md`

**Note on testing:** This repo has no test framework. Each task ends with a typecheck/lint pass and a manual smoke check rather than automated tests. Don't add a test framework as part of this plan.

---

## File Structure

**New files:**
- `app/lib/pending-score.ts` — typed shape and `read` / `write` / `clear` helpers over `localStorage`
- `app/components/PostWinSignInModal.tsx` — Win95-styled modal for qualifying single-player wins

**Modified files:**
- `app/api/auth/google/init/route.ts` — accept `?next=<path>`, validate, set `oauth_next` cookie
- `app/api/auth/google/callback/route.ts` — read + validate `oauth_next` cookie, redirect there on success, clear cookie on every response
- `app/components/Leaderboard.tsx` — accept optional `scores` controlled prop
- `app/components/MinesweeperGame.tsx` — own leaderboard fetch, run qualification check, render `PostWinSignInModal`, submit pending score on mount
- `app/components/GameOverModal.tsx` — accept `authLevel` prop, render anonymous-only "Sign in to track ELO" section
- `app/components/MultiplayerGame.tsx` — accept `authLevel` prop and thread to `GameOverModal`
- `app/multiplayer/game/page.tsx` — extract `authLevel` from session JWT and pass to `MultiplayerGame`

---

## Task 1: `pending-score` localStorage helper

**Files:**
- Create: `app/lib/pending-score.ts`

This module is the single point where `localStorage` is accessed for the post-OAuth score-save flow. All access is wrapped in `try/catch` so private-browsing or storage-disabled browsers don't crash the caller. Reading also enforces a 10-minute expiry and shape validation (a stale or malformed entry returns `null`).

- [ ] **Step 1: Create `app/lib/pending-score.ts`**

```ts
const KEY = "minesweeper.pendingScore";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingScoreInput = {
  time_seconds: number;
  mode: "random" | "no-guess";
  difficulty?: "beginner" | "intermediate" | "expert";
};

export type PendingScore = PendingScoreInput & { expiresAt: number };

function isValid(value: unknown): value is PendingScore {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.time_seconds !== "number") return false;
  if (v.mode !== "random" && v.mode !== "no-guess") return false;
  if (
    v.difficulty !== undefined &&
    v.difficulty !== "beginner" &&
    v.difficulty !== "intermediate" &&
    v.difficulty !== "expert"
  ) {
    return false;
  }
  if (typeof v.expiresAt !== "number") return false;
  return true;
}

export function read(): PendingScore | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function write(input: PendingScoreInput): void {
  try {
    const entry: PendingScore = { ...input, expiresAt: Date.now() + TTL_MS };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // localStorage unavailable (private mode / quota / disabled) — silent.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

Run: `npx tsc --noEmit`
Expected: no errors. (Or `npm run build` if you prefer; this project has no standalone typecheck script.)

- [ ] **Step 3: Commit**

```bash
git add app/lib/pending-score.ts
git commit -m "Add pending-score localStorage helper"
```

---

## Task 2: OAuth `init` — accept and validate `?next` query param

**Files:**
- Modify: `app/api/auth/google/init/route.ts`

The init route already redirects to Google's OAuth consent screen (or, in mock mode, straight to the callback). We add a `next` query param: if it's a same-origin path (`^\/(?![\/\\])`), we set an HttpOnly `oauth_next` cookie that the callback will consume. Invalid or missing values are silently dropped — the existing default-to-`/multiplayer` redirect on the callback side covers them.

- [ ] **Step 1: Replace the contents of `app/api/auth/google/init/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const NEXT_TTL_SECONDS = 600; // 10 minutes — matches pending-score expiry

// Accept only same-origin paths; reject `//evil.com`, `/\evil.com`, `https://...`.
function isSafeNext(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\/(?![/\\])/.test(value);
}

function setOauthNextCookie(response: NextResponse, next: string): void {
  response.cookies.set("oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NEXT_TTL_SECONDS,
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const nextParam = request.nextUrl.searchParams.get("next");
  const safeNext = isSafeNext(nextParam) ? nextParam : null;

  // Mock mode: no Google credentials configured — skip straight to callback.
  if (!clientId) {
    const url = new URL(redirectUri);
    url.searchParams.set("mock", "1");
    const response = NextResponse.redirect(url);
    if (safeNext) setOauthNextCookie(response, safeNext);
    return response;
  }

  // Generate CSRF state token
  const state = crypto.randomUUID();

  // Build Google OAuth authorization URL
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in short-lived cookie for CSRF validation on callback.
  // sameSite "lax" is required because Google's redirect is a cross-site navigation.
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  if (safeNext) setOauthNextCookie(response, safeNext);

  return response;
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual smoke**

Start the dev server (`npm run dev`) and run these curl checks against `http://localhost:3000`:

```bash
# Valid next: should set oauth_next cookie and redirect.
curl -sI 'http://localhost:3000/api/auth/google/init?next=/no-guess' | grep -E 'set-cookie|location'
# Expected: a set-cookie line containing oauth_next=/no-guess.

# Invalid next: //evil.com — should NOT set oauth_next.
curl -sI 'http://localhost:3000/api/auth/google/init?next=//evil.com' | grep -E 'set-cookie|location'
# Expected: no oauth_next set-cookie line (oauth_state may be present in non-mock mode).

# Invalid next: backslash form.
curl -sI 'http://localhost:3000/api/auth/google/init?next=/%5Cevil.com' | grep -E 'set-cookie|location'
# Expected: no oauth_next set-cookie line.

# No next: no oauth_next cookie.
curl -sI 'http://localhost:3000/api/auth/google/init' | grep -E 'set-cookie|location'
# Expected: no oauth_next set-cookie line.
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/google/init/route.ts
git commit -m "Accept ?next on OAuth init and stash in oauth_next cookie"
```

---

## Task 3: OAuth `callback` — consume `oauth_next` cookie

**Files:**
- Modify: `app/api/auth/google/callback/route.ts`

The callback currently always redirects to `/multiplayer`. We add a helper that reads `oauth_next` (re-validating against the same regex used in init), redirects there on every success path (mock-mode, real-mode, "needs username" pending flow), and falls back to `/multiplayer` when missing/invalid. The cookie is cleared on every response — success or failure. Error redirects continue to point at `/multiplayer?error=<code>` regardless of `next` (the user gets the existing error UX where the error banner already lives).

- [ ] **Step 1: Add the validator + helpers near the top of `app/api/auth/google/callback/route.ts`**

Add immediately after the existing constants block (after the `PENDING_OAUTH_TTL` line):

```ts
function isSafeNext(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^\/(?![/\\])/.test(value);
}

function consumeNext(request: NextRequest): string {
  const cookieValue = request.cookies.get("oauth_next")?.value;
  return isSafeNext(cookieValue) ? cookieValue : "/multiplayer";
}

function clearOauthNextCookie(response: NextResponse): void {
  response.cookies.delete("oauth_next");
}
```

- [ ] **Step 2: Update `redirectWithError` to also clear `oauth_next`**

Replace the existing `redirectWithError` function with:

```ts
function redirectWithError(appUrl: string, code: string): NextResponse {
  const url = new URL("/multiplayer", appUrl);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url.toString());
  clearOauthNextCookie(response);
  return response;
}
```

- [ ] **Step 3: Use `consumeNext` for every success-path redirect**

There are four success-path `NextResponse.redirect(new URL("/multiplayer", appUrl))` calls in this file. Change each to use the resolved next path and clear the cookie. Specifically:

**3a — Mock mode (around line 38):**

```ts
// --- Mock mode ---
if (!clientId || params.get("mock") === "1") {
  const token = mockToken("MockGoogleUser");
  const next = consumeNext(request);
  const response = NextResponse.redirect(new URL(next, appUrl));
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  clearOauthNextCookie(response);
  return response;
}
```

**3b — No-backend fallback (around line 131):**

```ts
// Fallback: no backend, mint a mock token with Google profile info
const token = mockToken(idClaims.name ?? "GoogleUser");
const next = consumeNext(request);
const response = NextResponse.redirect(new URL(next, appUrl));
response.cookies.set("session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: THIRTY_DAYS,
});
clearOauthNextCookie(response);
return response;
```

**3c — "Needs username" pending flow (around line 177):**

The pending-username flow always lands on `/multiplayer` because that's where the username chooser modal renders. We do **not** redirect to `next` here — instead, we keep the `oauth_next` cookie alive so the chooser's "Continue" submit (`/api/auth/google/complete`) can consume it later. To keep this task self-contained, leave the cookie in place here; Task 3d will be paired with a small change in `complete/route.ts` only if we discover the chooser path matters during smoke. For now, leave the existing redirect intact — but no longer call `clearOauthNextCookie` there:

```ts
// New Google user — set short-lived pending cookie, redirect to chooser.
if (backendData.needs_username && backendData.pending_token) {
  const response = NextResponse.redirect(new URL("/multiplayer", appUrl));
  response.cookies.set("pending_oauth", backendData.pending_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_OAUTH_TTL,
  });
  response.cookies.delete("oauth_state");
  // Note: oauth_next is intentionally preserved across the username-chooser step.
  return response;
}
```

**3d — Final success redirect (around line 195):**

```ts
// 7. Set session cookie and redirect to next path (defaulting to multiplayer)
const next = consumeNext(request);
const response = NextResponse.redirect(new URL(next, appUrl));
response.cookies.set("session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: THIRTY_DAYS,
});

// Clear the oauth_state and oauth_next cookies
response.cookies.delete("oauth_state");
clearOauthNextCookie(response);

return response;
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual smoke (mock mode)**

This project supports a mock OAuth flow when `GOOGLE_CLIENT_ID` is unset. With `npm run dev`:

1. In a browser, clear cookies for `localhost:3000`, then visit `http://localhost:3000/api/auth/google/init?next=/no-guess`. You should land on `/no-guess`, signed in as `MockGoogleUser` (header should reflect this — check by visiting `/multiplayer` in another tab).
2. Inspect cookies in DevTools: `oauth_next` should be deleted; `session` should be set.
3. Repeat with `?next=//evil.com`. You should land on `/multiplayer` (the fallback).
4. Repeat with no `next`. You should land on `/multiplayer`.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/google/callback/route.ts
git commit -m "Honor oauth_next cookie on OAuth callback redirect"
```

---

## Task 4: Lift leaderboard fetch into `MinesweeperGame`

**Files:**
- Modify: `app/components/Leaderboard.tsx`
- Modify: `app/components/MinesweeperGame.tsx`

To run the qualification check on win, `MinesweeperGame` needs the current top-10 in-hand. We move the fetch up into `MinesweeperGame` and pass scores down to `Leaderboard` as a prop. `Leaderboard` keeps its self-fetching fallback so any other caller (none today, but future-proofing) keeps working.

- [ ] **Step 1: Add controlled-mode `scores` prop to `Leaderboard.tsx`**

Replace the file with:

```tsx
"use client";

import { useState, useEffect } from "react";
import { RAISED_INNER, SUNKEN_INNER } from "@/app/lib/win95";

const RAISED = RAISED_INNER;
const SUNKEN_PANEL = SUNKEN_INNER;

type LeaderboardMode = "random" | "no-guess";

export interface LeaderboardEntry {
  username: string;
  time_seconds: number;
  created_at: string;
}

interface LeaderboardProps {
  username?: string;
  refreshKey: number;
  mode?: LeaderboardMode;
  difficulty?: string;
  // When provided, the parent owns fetch state and we render these scores
  // directly. When undefined, we self-fetch.
  scores?: LeaderboardEntry[];
}

export default function Leaderboard({ username, refreshKey, mode = "random", difficulty, scores: scoresProp }: LeaderboardProps) {
  const [internalScores, setInternalScores] = useState<LeaderboardEntry[]>([]);
  const isControlled = scoresProp !== undefined;

  useEffect(() => {
    if (isControlled) return;
    let url = `/api/leaderboard?mode=${mode}`;
    if (difficulty) url += `&difficulty=${encodeURIComponent(difficulty)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.scores) setInternalScores(data.scores);
      })
      .catch(() => {});
  }, [refreshKey, mode, difficulty, isControlled]);

  const scores = isControlled ? scoresProp : internalScores;

  return (
    <div className={`${RAISED} bg-[#c0c0c0] p-2 w-56 flex-shrink-0`}>
      <div className={`${SUNKEN_PANEL} bg-white p-2`}>
        <h3 className="font-mono font-bold text-sm text-center mb-2">LEADERBOARD</h3>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-[#a0a0a0]">
              <th className="text-left w-6">#</th>
              <th className="text-left">Name</th>
              <th className="text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {scores.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-[#808080] py-2">
                  No scores yet
                </td>
              </tr>
            )}
            {scores.map((entry, i) => {
              const isCurrentUser = username && entry.username === username;
              return (
                <tr
                  key={`${entry.username}-${entry.created_at}`}
                  className={isCurrentUser ? "bg-[#000080] text-white" : ""}
                >
                  <td className="text-left">{i + 1}</td>
                  <td className="text-left truncate max-w-[7rem]">{entry.username}</td>
                  <td className="text-right">{entry.time_seconds}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add fetch + state in `MinesweeperGame.tsx`**

In `app/components/MinesweeperGame.tsx`, update the `Leaderboard` import to also pull the entry type:

```tsx
import Leaderboard, { type LeaderboardEntry } from "@/app/components/Leaderboard";
```

Add a new state for scores, immediately after the existing `leaderboardRefreshKey` state declaration:

```tsx
const [scores, setScores] = useState<LeaderboardEntry[]>([]);
```

Add a fetch effect anywhere among the existing effects (e.g., after the score-submit effect):

```tsx
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
```

Update the rendered `<Leaderboard>` element near the bottom of the component to pass the scores:

```tsx
{showLeaderboard && (
  <Leaderboard
    username={username}
    refreshKey={leaderboardRefreshKey}
    mode={mode}
    difficulty={mode === "no-guess" ? difficulty : undefined}
    scores={scores}
  />
)}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`. Visit `/` and `/no-guess` (each difficulty). The leaderboard should render the same data as before. Sign in as a Google user (mock or real) and win — the leaderboard should still update via `leaderboardRefreshKey`.

- [ ] **Step 5: Commit**

```bash
git add app/components/Leaderboard.tsx app/components/MinesweeperGame.tsx
git commit -m "Lift leaderboard fetch into MinesweeperGame"
```

---

## Task 5: `PostWinSignInModal` component

**Files:**
- Create: `app/components/PostWinSignInModal.tsx`

Win95-styled modal mirroring the dismissible variant of `UsernameModal`. It's purely presentational: the parent passes `onClose` and `onSignIn` callbacks plus the message text. The modal handles ×/Esc/backdrop dismissal exactly like `UsernameModal`'s dismissible mode.

- [ ] **Step 1: Create `app/components/PostWinSignInModal.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { RAISED_OUTER } from "@/app/lib/win95";

const RAISED = RAISED_OUTER;

interface Props {
  onClose: () => void;
  onSignIn: () => void;
}

export default function PostWinSignInModal({ onClose, onSignIn }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#c0c0c0]/70"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`${RAISED} bg-ms-silver flex flex-col min-w-[280px] max-w-[360px] w-full`}>
        {/* Title bar */}
        <div className="bg-[#000080] text-white text-sm font-bold px-2 py-1 select-none flex items-center">
          <span className="flex-1">Save your time?</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`${RAISED} bg-ms-silver text-black text-xs font-bold leading-none w-5 h-5 flex items-center justify-center cursor-default active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-3">
          <p className="text-sm">
            You made the top 10! Sign in with Google to save your time to the leaderboard.
          </p>

          <button
            type="button"
            onClick={onSignIn}
            className={`${RAISED} bg-ms-silver px-4 py-1.5 text-sm font-bold text-center cursor-default hover:brightness-95 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors. (The component isn't rendered yet — Task 6 wires it up.)

- [ ] **Step 3: Commit**

```bash
git add app/components/PostWinSignInModal.tsx
git commit -m "Add PostWinSignInModal component"
```

---

## Task 6: Wire single-player flow in `MinesweeperGame`

**Files:**
- Modify: `app/components/MinesweeperGame.tsx`

Three behaviors land here:
1. **Qualification check + modal open**: when `phase` flips to `"won"` and the user is anonymous and the time qualifies for top-10 of the current `mode × difficulty`.
2. **Pending-score submit on mount**: read `pendingScore` and either submit it (Google) or clear it (still anonymous).
3. **Reset clears the modal**: tying modal-close into both `handleReset` and `handleDifficultyChange` so a stale modal can't outlive the score it's for.

- [ ] **Step 1: Add imports near the top of `app/components/MinesweeperGame.tsx`**

Add (or merge into the existing imports):

```tsx
import { usePathname } from "next/navigation";
import PostWinSignInModal from "@/app/components/PostWinSignInModal";
import * as PendingScore from "@/app/lib/pending-score";
```

- [ ] **Step 2: Add modal-open state**

Inside the component, alongside the other `useState` calls:

```tsx
const [showSignInModal, setShowSignInModal] = useState(false);
const pathname = usePathname();
```

- [ ] **Step 3: Add the qualification effect**

Add this effect immediately after the existing "Submit score on win" effect:

```tsx
// Open sign-in prompt when an anonymous user wins with a top-10 time.
useEffect(() => {
  if (phase !== "won") return;
  if (authLevel === "google") return;
  if (!showLeaderboard) return;
  // Treat empty/loading/failed as "qualifies" — over-prompt is the chosen default.
  const qualifies = scores.length < 10 || elapsedSeconds < scores[9].time_seconds;
  if (qualifies) setShowSignInModal(true);
}, [phase, authLevel, showLeaderboard, scores, elapsedSeconds]);
```

- [ ] **Step 4: Add the pending-score-submit-on-mount effect**

Add immediately after the qualification effect:

```tsx
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
  // Run once on mount; intentionally no deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 5: Reset closes the modal**

Update `handleReset`:

```tsx
const handleReset = useCallback(() => {
  setBoard(createEmptyBoard());
  setPhase("idle");
  setElapsedSeconds(0);
  scoreSubmittedRef.current = false;
  setShowSignInModal(false);
}, []);
```

Update `handleDifficultyChange`:

```tsx
const handleDifficultyChange = useCallback((d: NoGuessDifficulty) => {
  setDifficulty(d);
  setBoard(createEmptyBoard());
  setPhase("idle");
  setElapsedSeconds(0);
  scoreSubmittedRef.current = false;
  setShowSignInModal(false);
}, []);
```

- [ ] **Step 6: Render the modal**

At the very end of the JSX returned by `MinesweeperGame` — after the existing leaderboard block — add:

```tsx
{showSignInModal && (
  <PostWinSignInModal
    onClose={() => setShowSignInModal(false)}
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
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Manual smoke (mock mode — `GOOGLE_CLIENT_ID` unset, `BACKEND_URL` unset)**

Run `npm run dev`.

1. Visit `/` (clear cookies first to be anonymous). Win the game. The modal should open. Click "Sign in with Google" → mock OAuth → land back on `/`. Open DevTools Application tab; `localStorage.minesweeper.pendingScore` should be cleared, `session` cookie should be set with `authLevel: "google"`. The leaderboard should now contain `MockGoogleUser` with the time you posted.
2. Visit `/no-guess` (clear cookies). Win at intermediate; same flow — verify the score is filed under intermediate.
3. Win as the (now signed-in) Google user — no modal should appear (Google auto-submit handles it).
4. Open the modal, dismiss with × / Esc / backdrop. No localStorage write should occur (verify via DevTools).
5. Open the modal, click the smiley. Modal should close.
6. With Sign in clicked, in the brief moment before the redirect, verify `localStorage.minesweeper.pendingScore` is set; then let the redirect happen and verify it's cleared on return.

- [ ] **Step 9: Commit**

```bash
git add app/components/MinesweeperGame.tsx
git commit -m "Wire post-win sign-in modal and pending-score submit"
```

---

## Task 7: Multiplayer post-game sign-in section

**Files:**
- Modify: `app/components/GameOverModal.tsx`
- Modify: `app/components/MultiplayerGame.tsx`
- Modify: `app/multiplayer/game/page.tsx`

Three small touches to thread `authLevel` from the server-rendered page down into `GameOverModal`, plus a new section in the modal that shows a Google sign-in link for anonymous players. The link points at `/api/auth/google/init?next=/multiplayer` — there's nothing to persist across the roundtrip.

- [ ] **Step 1: Extract `authLevel` in `app/multiplayer/game/page.tsx`**

Replace the file with:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MultiplayerGame from "@/app/components/MultiplayerGame";

interface PageProps {
  searchParams: Promise<{ matchId?: string }>;
}

export default async function MultiplayerGamePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) redirect("/multiplayer");

  const params = await searchParams;
  const matchId = params.matchId;
  if (!matchId) redirect("/multiplayer");

  // Decode username + authLevel from JWT payload (same logic as app/page.tsx).
  let playerName = "Player";
  let authLevel: "anonymous" | "google" = "anonymous";
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (typeof payload.sub === "string") playerName = payload.sub;
      if (payload.authLevel === "google") authLevel = "google";
    }
  } catch { /* fallback to defaults */ }

  return (
    <main className="flex flex-1 items-center justify-center bg-[#c0c0c0]">
      <MultiplayerGame matchId={matchId} playerName={playerName} authLevel={authLevel} />
    </main>
  );
}
```

- [ ] **Step 2: Thread `authLevel` through `MultiplayerGame.tsx`**

In `app/components/MultiplayerGame.tsx`, update the props interface and component signature:

```tsx
interface MultiplayerGameProps {
  matchId: string;
  playerName: string;
  authLevel: "anonymous" | "google";
}

export default function MultiplayerGame({ matchId, playerName, authLevel }: MultiplayerGameProps) {
```

Update the single render site of `<GameOverModal>` (currently at the bottom of the JSX) to pass the prop:

```tsx
{gameResult && (
  <GameOverModal
    winner={gameResult.winner}
    playerName={playerName}
    yourTimeMs={gameResult.yourTimeMs}
    opponentTimeMs={gameResult.opponentTimeMs}
    opponentDisconnected={disconnected}
    loserPercent={
      (gameResult.winner === playerName || gameResult.winner === "You")
        ? Math.round((opponentRevealedCount / TOTAL_SAFE_CELLS) * 100)
        : Math.round((playerRevealedCount / TOTAL_SAFE_CELLS) * 100)
    }
    playerWins={playerWins}
    opponentWins={opponentWins}
    h2hRecord={h2hRecord}
    eloChange={eloChange}
    authLevel={authLevel}
    rematchState={rematchState}
    onRematchRequest={handleRematchRequest}
    onRematchDecline={handleRematchDecline}
  />
)}
```

- [ ] **Step 3: Add the sign-in section in `GameOverModal.tsx`**

In `app/components/GameOverModal.tsx`, extend `GameOverModalProps`:

```tsx
interface GameOverModalProps {
  winner: string;
  playerName: string;
  yourTimeMs: number;
  opponentTimeMs: number;
  opponentDisconnected?: boolean;
  loserPercent?: number;
  playerWins: number;
  opponentWins: number;
  h2hRecord: { wins: number; losses: number } | null;
  eloChange?: EloChange | null;
  authLevel: "anonymous" | "google";
  rematchState: RematchState;
  onRematchRequest: () => void;
  onRematchDecline: () => void;
}
```

Update the destructured props in the component signature:

```tsx
export default function GameOverModal({
  winner,
  playerName,
  yourTimeMs,
  opponentTimeMs,
  opponentDisconnected,
  loserPercent,
  playerWins,
  opponentWins,
  h2hRecord,
  eloChange,
  authLevel,
  rematchState,
  onRematchRequest,
  onRematchDecline,
}: GameOverModalProps) {
```

Add a new section in the modal body, immediately *after* the existing `eloChange` section and *before* the rematch UI (`{/* Rematch UI */}`):

```tsx
{/* Sign-in prompt for anonymous players (Elo not tracked) */}
{authLevel !== "google" && (
  <div className="text-center text-xs border-t border-[#a0a0a0] pt-2 flex flex-col gap-2">
    <span className="text-ms-dark">
      Sign in with Google to track your Elo on future matches.
    </span>
    <a
      href="/api/auth/google/init?next=/multiplayer"
      className={`${RAISED_OUTER} bg-ms-silver px-3 py-1 text-xs font-bold cursor-default hover:brightness-95 active:border-t-[#808080] active:border-l-[#808080] active:border-b-[#ffffff] active:border-r-[#ffffff]`}
    >
      Sign in with Google
    </a>
  </div>
)}
```

The existing `import { RAISED_OUTER } from "@/app/lib/win95"` line at the top of the file already imports the helper this section uses.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual smoke**

Run `npm run dev`. Two scenarios:

1. **Anonymous → multiplayer game over:** Clear cookies. Go to `/multiplayer`, register a guest username, and start a match (you can use the mock matchmaking — open two browser windows / private windows with two guest accounts). Finish the match. The `GameOverModal` should show the new "Sign in with Google to track your Elo on future matches." section above the rematch buttons. Click it → mock OAuth → land back on `/multiplayer`, signed in as `MockGoogleUser`. The match's ELO stays unchanged (expected per spec).
2. **Google → multiplayer game over:** Sign in via `/api/auth/google/init` first. Start and finish a match. The sign-in section should NOT render; the existing ELO-change section behaves as before.

- [ ] **Step 6: Commit**

```bash
git add app/components/GameOverModal.tsx app/components/MultiplayerGame.tsx app/multiplayer/game/page.tsx
git commit -m "Show post-game sign-in prompt in GameOverModal for anonymous players"
```

---

## Final Verification

- [ ] **Step 1: Build the production bundle**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 2: Walk the spec's full smoke checklist**

The spec at `docs/superpowers/specs/2026-05-06-postgame-signin-design.md` lists single-player happy paths, edge cases, multiplayer scenarios, and server-route checks. Walk each in `npm run dev`. None should regress.

- [ ] **Step 3: Confirm clean working tree**

Run: `git status`
Expected: nothing to commit, working tree clean.
