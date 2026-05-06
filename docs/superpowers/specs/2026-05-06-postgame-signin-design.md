# Post-game sign-in flow

## Goal

Prompt anonymous players to sign in with Google at the moment a sign-in pays
off:

- **Single-player** — after a win whose time would land in the top 10 of the
  current `mode × difficulty` leaderboard. Saves that score to the leaderboard.
- **Multiplayer** — after every match. Sets up the player's account so future
  matches are ELO-rated.

The single-player flow must survive the Google OAuth roundtrip (Google's
redirect lands the user away from the game page, on a fresh client tree).

## Non-goals

- Guest-username sign-in for leaderboard saves. Single-player save is
  Google-only for this iteration.
- Retroactive ELO crediting for the just-finished multiplayer match. ELO is
  computed server-side at `game_over` time; signing in afterwards only sets
  up *future* matches to count.
- A new test framework. The repo has none today; verification is manual smoke.

## Architecture

Three pieces:

1. **Game-end UI** (client)
   - New `PostWinSignInModal` for single-player qualifying wins.
   - New "Sign in to track ELO" section in the existing `GameOverModal` for
     anonymous multiplayer players.

2. **OAuth `next` redirect** (server)
   - `/api/auth/google/init` accepts `?next=<path>` and writes a short-lived
     `oauth_next` cookie.
   - `/api/auth/google/callback` reads + validates that cookie and redirects
     there on success, defaulting to `/multiplayer`.

3. **Score persistence across the roundtrip** (client)
   - `app/lib/pending-score.ts` — typed `read` / `write` / `clear` helpers
     over `localStorage`, with a 10-minute expiry.
   - `MinesweeperGame` writes before initiating OAuth and submits on mount
     when the user comes back signed in.

No Flask backend changes. The existing leaderboard `POST` and the existing
absence of ELO-on-anonymous already do the right thing under the
"going forward" multiplayer framing.

## Components

### New

**`app/components/PostWinSignInModal.tsx`** — `"use client"` modal in the
existing Win95 style (matching `GameOverModal` and `UsernameModal`). Body:
short message ("You made the top 10! Sign in with Google to save your time.")
plus a single primary "Sign in with Google" action and standard dismiss
affordances (× / Esc / backdrop click). The action is a plain `<a>` to
`/api/auth/google/init?next=<currentPath>`. The click handler writes the
pending score to localStorage *before* navigating.

**`app/lib/pending-score.ts`** — typed shape and helpers:

```ts
type PendingScore = {
  time_seconds: number;
  mode: "random" | "no-guess";
  difficulty?: "beginner" | "intermediate" | "expert";
  expiresAt: number; // Date.now() + 10*60*1000
};

read(): PendingScore | null  // returns null if missing, malformed, or expired
write(s: Omit<PendingScore, "expiresAt">): void
clear(): void
```

All three wrap `localStorage` access in `try/catch` so private-mode browsers
don't crash the caller.

### Modified

**`app/api/auth/google/init/route.ts`** — accept `next` from query params,
validate (see "Open-redirect protection" below), set the `oauth_next` cookie
when valid. The mock-mode branch (no `GOOGLE_CLIENT_ID`) sets the same cookie
so dev/local behavior matches.

**`app/api/auth/google/callback/route.ts`** — read `oauth_next` cookie,
re-validate (defense in depth), redirect to it on success (default
`/multiplayer`), clear the cookie on every response. Error redirects unchanged
— still `/multiplayer?error=<code>` regardless of `next`.

**`app/components/MinesweeperGame.tsx`** — lift leaderboard data into this
component (it currently lives in `Leaderboard.tsx`) so the parent can do the
qualification check. On `phase === "won"` for non-Google users, compare
`elapsedSeconds` against the 10th-place time (or `scores.length < 10`); open
`PostWinSignInModal` if qualifying. On mount, call `pending-score.read()` and
submit if the user is now Google-authed.

**`app/components/Leaderboard.tsx`** — accept an optional `scores` prop
(controlled mode) so `MinesweeperGame` can pass the data it already fetched.
Keeps self-fetching as a default fallback so any other caller continues to
work.

**`app/components/GameOverModal.tsx`** — accept a new `authLevel` prop. When
`authLevel !== "google"`, render a "Sign in with Google to track your ELO"
section (a plain `<a>` to `/api/auth/google/init?next=/multiplayer`). The
existing ELO-change section continues to show for Google-authed players.

**`app/components/MultiplayerGame.tsx`** — accept a new `authLevel` prop and
thread it into `GameOverModal`.

**`app/multiplayer/game/page.tsx`** — extract `authLevel` from the session
JWT exactly like `app/page.tsx` and `app/no-guess/page.tsx` do, pass to
`MultiplayerGame`.

## Data flow

### Single-player qualifying-win flow

1. `phase` flips to `"won"`, `elapsedSeconds` is final.
2. The existing Google-user path POSTs the score directly (unchanged).
3. For non-Google users, `MinesweeperGame` checks
   `scores.length < 10 || elapsedSeconds < scores[9].time_seconds`. If true,
   it opens `PostWinSignInModal`. (`scores` is the leaderboard array as
   returned by `/api/leaderboard`, sorted ascending by time — smallest at
   index 0, same order the `Leaderboard` component already renders.)
4. User clicks "Sign in with Google":
   - `pending-score.write({ time_seconds, mode, difficulty? })`
   - Browser navigates to `/api/auth/google/init?next=<currentPath>`
     (`/` or `/no-guess`).
5. OAuth roundtrip → callback consumes `oauth_next`, sets `session` cookie,
   redirects back to the originating page.
6. `MinesweeperGame` mounts:
   - `pending-score.read()` returns the entry (if not expired).
   - If `authLevel === "google"` → `POST /api/leaderboard`,
     `pending-score.clear()`, bump `leaderboardRefreshKey` to refetch.
   - If still anonymous (auth canceled or errored) → `pending-score.clear()`
     silently.

### Multiplayer game-over flow

1. WebSocket `game_over` arrives; `MultiplayerGame` opens `GameOverModal`.
2. The modal's existing layout renders normally; if `authLevel !== "google"`,
   the new sign-in section renders alongside the rematch buttons.
3. User clicks the sign-in action → navigates to
   `/api/auth/google/init?next=/multiplayer`. (No localStorage write — there's
   nothing to persist; this match's ELO is already settled server-side.)
4. OAuth roundtrip → user lands on the `/multiplayer` lobby, signed in. Future
   matches are ELO-rated.

### Open-redirect protection

`next` is allowed only if it matches `^\/(?![\/\\])`. That is: starts with a
single `/` and the second character is neither `/` nor `\` (both can be
treated as protocol-relative or scheme-confused by some browsers). Both `init`
and `callback` apply the same check; on invalid input, both fall back to
`/multiplayer`. The cookie is HttpOnly so JS can't tamper, but the callback
re-validates as defense in depth.

## Error handling

- **OAuth failure / user cancels / CSRF mismatch** — callback already
  redirects to `/multiplayer?error=<code>`; that path is preserved (errors
  ignore `next`). The `oauth_next` cookie is cleared on every callback
  response. The pending-score entry will be cleared on the originating page's
  next mount when the user is still anonymous, or by the 10-minute expiry.
- **localStorage unavailable** (private mode, disabled storage) — `write()`
  swallows the throw; the modal still navigates to OAuth. Worst case: user
  signs in and has to play one more game to save a score. No user-visible
  error.
- **Score POST fails after sign-in** — silently swallowed, matching the
  existing Google-auto-submit handler. The user is signed in regardless;
  their next qualifying win will save normally.
- **Leaderboard GET fails** (qualification check) — treat as "qualifies" and
  open the modal. Over-prompting is preferable to missing a top-10 time.
- **Stale modal after reset** — closing the modal is wired into the same
  reset handler that clears the board (`handleReset`, `handleDifficultyChange`).
- **Race between mount-pending-submit and leaderboard fetch** — independent
  network calls; submit doesn't wait on fetch. After the POST resolves,
  `leaderboardRefreshKey` is bumped to refetch.

## Testing

No test framework configured. Verification is manual; the smoke checklist:

**Single-player happy paths**
- Anonymous user wins on `/` with a top-10 time → modal → Sign in → OAuth
  succeeds → lands on `/` → score appears in the leaderboard.
- Same on `/no-guess` for each of `beginner`, `intermediate`, `expert`.
- Already-Google user wins → no modal (existing auto-submit path still works).
- Anonymous user wins with a non-qualifying time → no modal.

**Single-player edge cases**
- Modal opens, user dismisses (×, Esc, backdrop) → modal closes, no
  localStorage write, leaderboard unchanged.
- Modal opens, user clicks the reset smiley → modal closes.
- User clicks Sign in, then cancels Google consent → lands on
  `/multiplayer?error=...`; the next visit to `/` or `/no-guess` clears
  pending-score.
- User starts OAuth, lets it expire >10 min → on return, pending-score is
  past `expiresAt` and is cleared without submitting.
- Browser with localStorage disabled → modal still works; score not saved.
- Leaderboard backend down → modal still opens (over-prompt default).

**Multiplayer**
- Anonymous user finishes a match → `GameOverModal` shows the sign-in
  section → Sign in → OAuth → lands on `/multiplayer`, signed in.
- Google-authed user finishes a match → existing ELO-change section shows;
  no sign-in section.
- One Google + one anonymous — both modals render correctly for each side.

**Server route**
- `init?next=/no-guess` → cookie set, redirect issued.
- `init?next=//evil.com` → rejected, defaults to `/multiplayer` redirect.
- `init?next=/\evil.com` → rejected, defaults to `/multiplayer` redirect.
- `init?next=https://evil.com` → rejected.
- `callback` with valid `oauth_next` cookie → redirect to that path, cookie
  cleared.
- `callback` with malformed cookie → redirect to `/multiplayer`, cookie
  cleared.
- Mock-mode (`GOOGLE_CLIENT_ID` unset) preserves the same `next` behavior.
