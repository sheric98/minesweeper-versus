# Minesweeper

Classic Minesweeper (30×16, 99 mines) with a Win95 look, plus real-time
multiplayer races, ELO ratings, leaderboards, and a no-guess mode with
guaranteed-solvable boards.

**Features**

- **Single-player** — classic random boards and a no-guess mode
  (beginner → expert) where every board is solvable without guessing
- **Multiplayer** — invite players directly or queue for a quick match;
  both race the same board over WebSocket, with ELO ratings, head-to-head
  records, and bot opponents
- **Leaderboards & stats** — best times, ELO leaderboard, per-player stats
- **Configurable controls** — chording (both-buttons / middle-click /
  double-click), spacebar actions, question marks

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- API routes act as a BFF that proxies to a separate
  [Flask backend](https://github.com/sheric98/minesweeper-versus-server)
  (Flask + `flask-sock` raw WebSocket + Postgres) — the session JWT lives
  in an HttpOnly cookie and is never exposed to client JS

## Local Development

```bash
npm install
npm run dev        # http://localhost:3000
```

With no environment variables set, the app runs in **mock mode**: auth mints
mock tokens and multiplayer uses a mock WebSocket, so no backend is needed.

To run against a local backend instead:

```bash
npm run dev:full   # sets BACKEND_URL + NEXT_PUBLIC_WS_URL for you
```

and start the Flask backend separately (see its repo/`CLAUDE.md`).

Other scripts:

```bash
npm run build      # production build (also type-checks)
npm run lint       # ESLint
npm test           # vitest unit tests (game logic, controls)
```

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `BACKEND_URL` | server | Flask backend URL; unset = mock auth/API |
| `NEXT_PUBLIC_WS_URL` | client | WebSocket URL; unset = mock WebSocket |
| `NEXT_PUBLIC_APP_URL` | both | Public app URL (OAuth redirects, social metadata) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server | Google sign-in (optional in dev) |

## Deployment

- **Frontend:** Vercel — set the environment variables above in the
  dashboard.
- **Backend:** separate Flask server (Docker Compose with Postgres, behind
  nginx + Let's Encrypt on EC2). Needs `JWT_SECRET`, `CORS_ORIGINS`,
  `DATABASE_URL`.

## Project Layout

```
app/
  page.tsx               # single-player (random boards)
  no-guess/              # single-player no-guess mode
  multiplayer/           # lobby + live match pages
  stats/                 # player stats pages
  settings/              # controls settings
  lib/                   # pure game logic, solver, hooks (no React UI)
  components/            # UI components
  api/                   # BFF routes proxying to the Flask backend
```
