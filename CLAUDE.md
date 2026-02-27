# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test framework is configured yet.

## Stack

- **Next.js 16** with App Router (`/app` directory)
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** (PostCSS-based, configured in `postcss.config.mjs`)
- Path alias: `@/*` maps to the project root

## Architecture

This is a Next.js App Router project. All routes and layouts live under `/app`. Server Components are the default; add `"use client"` only when client-side interactivity is needed.

Key files:
- `app/layout.tsx` — root layout (fonts, global metadata)
- `app/page.tsx` — home page; renders `<MinesweeperGame />` (single-player)
- `app/globals.css` — global styles; defines CSS variables for light/dark themes via `@theme inline`
- `app/lib/minesweeper.ts` — pure game logic and types (no React)
- `app/components/MinesweeperGame.tsx` — `"use client"` component owning all single-player state
- `app/components/Board.tsx`, `Cell.tsx`, `Header.tsx` — presentational components
- `app/multiplayer/page.tsx` — multiplayer lobby (reads `session` cookie server-side)
- `app/multiplayer/game/page.tsx` — multiplayer game page
- `app/components/MatchmakingLobby.tsx`, `MultiplayerGame.tsx`, `GameOverModal.tsx` — multiplayer UI

### BFF API Routes (`app/api/`)

All multiplayer API routes act as a BFF (Backend-for-Frontend), proxying to the Flask backend:
- `register-session/route.ts` — username registration, sets HttpOnly `session` cookie
- `matchmaking/players/route.ts` — list online players
- `matchmaking/invite/route.ts` — send/check invites
- `matchmaking/respond/route.ts` — accept/decline invites
- `ws-ticket/route.ts` — get single-use WebSocket ticket

## Styling

Tailwind CSS v4 utility classes are used throughout. CSS custom properties defined in `globals.css` handle theming (light/dark via `prefers-color-scheme`). Dark mode is media-query-based, not class-based.

## Deployment & Environment

### Frontend — Vercel
- The Next.js app is deployed to Vercel.
- Required environment variables (set in Vercel dashboard):
  - `BACKEND_URL` (server-side) — URL of the Flask backend
  - `NEXT_PUBLIC_WS_URL` (client-side) — WebSocket URL for multiplayer

### Backend
- Separate Flask + `flask-sock` server (raw WebSocket, NOT socket.io)
- Deployed via Docker + Nginx reverse proxy + Let's Encrypt SSL
- Required environment variables: `JWT_SECRET`, `CORS_ORIGINS`

### Local Development
- **Mock mode** (default, no env vars needed): `npm run dev` — uses mock tokens and mock WebSocket, no backend required
- **Full stack**: create a `.env.local` with `BACKEND_URL=http://localhost:5000` and `NEXT_PUBLIC_WS_URL=ws://localhost:5000`, then run the Flask backend separately
- Cookies use `secure: true` only in production, so HTTP on localhost works
- Backend CORS defaults to `http://localhost:3000`
