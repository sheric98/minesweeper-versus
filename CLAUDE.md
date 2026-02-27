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
- `app/page.tsx` — home page (currently the default Next.js template)
- `app/globals.css` — global styles; defines CSS variables for light/dark themes via `@theme inline`

The minesweeper game logic has not yet been implemented — `app/page.tsx` still shows the Create Next App welcome screen.

## Styling

Tailwind CSS v4 utility classes are used throughout. CSS custom properties defined in `globals.css` handle theming (light/dark via `prefers-color-scheme`). Dark mode is media-query-based, not class-based.
