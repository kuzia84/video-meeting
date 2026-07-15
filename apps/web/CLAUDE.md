# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@video-meetings/web` — a Next.js 15 (App Router, React 19) frontend, using Turbopack in dev. Part of the `video-meetings` Turborepo monorepo; see the root `CLAUDE.md` for cross-workspace commands and architecture. Runs on the Next.js default port 3000 (the API runs on 3001).

## Commands

Run from this directory, or from the repo root with `-w @video-meetings/web`:

```bash
npm run dev        # next dev --turbopack
npm run build        # next build
npm run start          # next start
npm run lint             # next lint
npm run lint:fix
npm run clean               # rm -rf .next
```

There is no test runner configured for this app yet.

## Architecture

- App Router structure under `src/app/` (`layout.tsx`, `page.tsx`, plus route folders like `src/app/register/`).
- Path aliases in `tsconfig.json`: `@/*` maps to `src/*`; `@video-meetings/shared` maps directly to `packages/shared/src` (not a compiled `dist/`), so shared type changes are picked up without a separate build step.
- `next.config.ts` sets `transpilePackages: ['@video-meetings/shared']` so Next.js compiles the workspace package's TypeScript source directly rather than expecting pre-built JS.
- Consumes shared response types from `@video-meetings/shared` (e.g. `ApiResponse<T>`).
- `tsconfig.json` extends the root `tsconfig.base.json`, overriding module resolution for Next.js (`ESNext`/`bundler`, `jsx: "preserve"`, `noEmit: true` — Next's own toolchain handles emission).
- `.eslintrc.js` sets `root: true` (does not inherit the repo-root ESLint config) and extends `next/core-web-vitals` and `next/typescript`.
- **UI: HeroUI v3 + Playwright MCP** — see **`docs/architecture/frontend-ui.md`** for the full guide: HeroUI v3 setup/conventions (compound components, `onPress`, semantic variants, `next-themes` for light/dark — no `HeroUIProvider` in v3), the `validationBehavior="aria"` gotcha for any `Form`, and the Playwright MCP workflow for verifying layout/UI changes against a real browser. Wired up: `postcss.config.mjs`, `src/app/globals.css` (`@import 'tailwindcss'` then `@import '@heroui/styles'`), `src/app/providers.tsx` (`next-themes` `ThemeProvider`, no `HeroUIProvider`), `src/app/layout.tsx` imports `globals.css` and wraps `children` in `<Providers>`.
- **API client**: `src/lib/api/` holds thin `fetch` wrappers per backend feature (e.g. `src/lib/api/auth.ts`) — plain `fetch`, no HTTP client library. Each throws a shared `ApiError` (`status` + `messages: string[]`, normalizing the API's two error shapes — a `string[]` from `ValidationPipe` 400s and a plain `string` from hand-thrown exceptions like 409) so callers can branch on `err.status`. Base URL is `NEXT_PUBLIC_API_URL` (see `.env.example`; defaults to `http://localhost:3001` in code if unset). `src/lib/auth/token.ts` holds the `accessToken` `localStorage` helpers (`saveAccessToken`/`getAccessToken`) — the only place a token is persisted; reuse it rather than touching `localStorage` directly.

## Keeping documentation current

When a change alters this app's architecture — new routing/layout structure, new shared-package usage, changed build config or path aliases — update this file (and the root `CLAUDE.md` if the change is monorepo-wide) in the same change.
