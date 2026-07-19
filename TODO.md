# TODO — Launch Readiness

Tracked work before a public launch. Ordered by priority.

## Open

1. **Verify `JWT_SECRET` is set in the prod `.env`** — ops step. The backend now
   refuses to start when `DATABASE_URL` is set but `JWT_SECRET` is not
   (`config.py`), so a misconfiguration fails loudly at next deploy instead of
   silently logging everyone out per restart. Confirm the EC2 `.env` before
   redeploying.
2. **Leaderboard integrity — residual risk** — mitigated 2026-07-18 (see Done):
   the leaderboard now requires server-observed elapsed time ≥ the claimed win
   time, which kills instant/bulk forgery and sub-realtime times. A patient
   forger can still wait out a claimed time; a full fix would need server-issued
   boards plus move-replay validation. Revisit only if forged scores appear.

Reviewed and fine as-is: multiplayer cold-start (bots inject into queue after 5s,
accept invites, 30% rematch), guest-username entry modal, post-win sign-in
conversion flow with pending-score save across the OAuth roundtrip, OG/favicon
metadata, Win95 visual consistency.

---

## Done 2026-07-18 (first-impressions review items)

1. **Classic board sizes on singleplayer** — Beginner 9×9/10, Intermediate
   16×16/40, Expert 30×16/99 presets on `/`. Game logic parameterized by
   `BoardConfig` (`app/lib/minesweeper.ts` `BOARD_PRESETS`); components derive
   dimensions from the board / `--board-width` CSS var. Multiplayer and no-guess
   stay 30×16. Leaderboard shows/submits only for the expert size in random mode.
2. **Mobile/touch support** — `useBoardInput.ts`: tap reveals, long-press (350ms)
   flags with haptic, tap on a revealed number chords; emulated-mouse-event
   guards. Navbar wraps at phone widths. Coarse-pointer devices default to the
   Beginner board (~28px cells at 390px).
3. **Restart affordance** — status bar now reads "Game over — click 🙂 to try
   again"; F2 starts a new game (classic shortcut); HowToPlayHint mentions both.
4. **Stats for anonymous users** — `/stats` renders a "Sign in to track your
   stats" Win95 pitch panel with a SignInButton instead of redirecting to `/`.
5. **Landing page framing** — board wrapped in a titled Win95 window
   ("Minesweeper"); one-line multiplayer teaser under it ("Race a friend in real
   time → Multiplayer").
6. **No-guess explainer** — window subtitle: "Every board is solvable by pure
   logic — no 50/50 guesses. Difficulty sets how deep the deductions go; the
   board is always 30×16."
7. **Page title** — "Minesweeper — Solo, No-Guess & Multiplayer Races" (top-level,
   og, twitter).
8. **Single-player leaderboard integrity (mitigation)** — backend
   `POST /singleplayer/games/start` records a server-side start timestamp per
   `client_game_id` (unauthenticated so the post-win sign-in flow still works;
   IP rate-limited); wins only qualify for `leaderboard_scores` when
   `win_time_is_plausible` (elapsed ≥ claimed − 5s tolerance). Stats/rolling
   window are unaffected by a missing start ping. *Deploy the frontend
   start-ping with or before the backend change.*
9. **JWT_SECRET guard** — `config.py` raises at startup when `DATABASE_URL` is
   set without `JWT_SECRET` (ops verification still open, see above).

## Done 2026-07-05

1. **Rate limiting (backend)** — `rate_limit.py` (flask-limiter, in-memory storage —
   exact with the single gunicorn worker). Unauthenticated auth endpoints keyed by
   end-user IP via `X-Client-IP` forwarded from the BFF auth routes; authenticated
   endpoints (`/singleplayer/games`, `/matchmaking/invite`, `/ws/ticket`) keyed by
   JWT username. Disable with `RATE_LIMIT_ENABLED=0`. *Deploy the frontend BFF change
   with (or before) the backend, or per-IP limits key on Vercel's shared egress IP.*
2. **Social/SEO metadata** — `metadataBase`/`openGraph`/`twitter` in `app/layout.tsx`
   (URL from `NEXT_PUBLIC_APP_URL`); dynamic `app/opengraph-image.tsx` +
   `twitter-image.tsx` (ImageResponse, Win95-styled) instead of static PNGs,
   matching the `app/icon.tsx` pattern.
3. **"How to play" hint** — `app/components/HowToPlayHint.tsx` under the board in
   `MinesweeperGame` (covers `/` and `/no-guess`); reflects configured controls,
   links to `/settings`, one-time dismissal persisted in localStorage.
4. **README cleanup** — rewrote `README.md`; removed default SVGs from `public/`;
   fixed stale "no test framework" note in frontend `CLAUDE.md`.
5. **Backend CLAUDE.md** — rewritten for Postgres, ELO, single-player stats, bots,
   `solver/`, queue matchmaking, preferences, head-to-head, and current env vars.
