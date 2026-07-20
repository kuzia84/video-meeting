# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@video-meetings/web` — Next.js 15 (App Router, React 19) frontend, Turbopack in dev. Part of the `video-meetings` monorepo (see root `CLAUDE.md` for cross-workspace commands/architecture). Port 3000 (API on 3001).

## Commands

Scripts are in this workspace's `package.json`; run from here or from the root with `-w @video-meetings/web`. `npm run dev` uses Turbopack. The only one with non-obvious behavior is `npm run test:e2e` (Playwright browser e2e) — see `e2e/CLAUDE.md` for the load-bearing config (`/health` readiness, `workers: 1`, UTC zone), the dev-database cleanup, and how tests seed through the API.

## Architecture

App Router under `src/app/` (`layout.tsx`, `page.tsx`, route folders). Path aliases in `tsconfig.json`: `@/*` → `src/*`; `@video-meetings/shared` → `packages/shared/src` (source, not `dist/`, via `transpilePackages` in `next.config.ts`), so shared type/runtime changes need no build step (unlike the API — see root `CLAUDE.md`). `tsconfig.json` extends the root base with Next overrides (`ESNext`/`bundler`, `jsx: preserve`, `noEmit`). `.eslintrc.js` sets `root: true`, extends `next/core-web-vitals` + `next/typescript`.

Each area keeps its own detail in a nested `CLAUDE.md` (loaded into context when you work in that directory) — per the "CLAUDE.md hierarchy" rule in root `CLAUDE.md`. This file lists only where to read more; two always-on invariants stay here because they apply everywhere:

- **Auth-guarded resources travel as a header, never a URL.** The token lives in `sessionStorage` (invisible to the server — that's why there's no `middleware.ts`), so JWT-guarded routes can't be reached by `<img src>` / `<a href>`; fetch with the `Authorization` header (JSON via the API client; binary via `fetch → blob → object URL`). Mechanics in `src/lib/CLAUDE.md`.
- **Route protection is client-side.** Each protected page checks `getAccessToken()` in a mount effect and `router.replace('/login')` when absent (and on a `401`, after clearing the dead token). New protected pages follow this same in-effect guard.

### Where things live

- **`src/lib/CLAUDE.md`** — the data layer: the shared API client (`fetchJson`/`fetchPaginated`/`fetchVoid`/`fetchBlob`, `ApiError`), the feature files (`auth.ts`/`meetings.ts`/`profile.ts`/`meeting-files.ts`, incl. the XHR upload), token storage (`auth/token.ts`), and the `useCurrentUser` source.
- **`src/components/CLAUDE.md`** — the shared components: `AppHeader`, `PageShell`, `UserAvatar`, `DefaultAvatar`, `MeetingForm` (owns meeting-field validation, used by create + edit), `ConfirmDeleteDialog`, `Logo`.
- **`src/app/CLAUDE.md`** — the pages: `/register`, `/login`, `/` (home), `/profile` (+ name/avatar/password sub-forms), `/meetings/new`, `/meetings/[id]` (view + inline edit + delete + files block).

### UI

**HeroUI v3 + Playwright MCP — read `docs/architecture/frontend-ui.md`** for the full guide: HeroUI v3 setup/conventions (compound components, `onPress`, semantic variants, `next-themes` for light/dark — **no `HeroUIProvider` in v3**), the `validationBehavior="aria"` gotcha for any `Form`, and the Playwright MCP workflow. Wiring: `postcss.config.mjs`, `globals.css` (`@import 'tailwindcss'` then `@import '@heroui/styles'`), `src/app/providers.tsx` (`next-themes` `ThemeProvider`, no `HeroUIProvider`), `layout.tsx` imports `globals.css` + wraps in `<Providers>`.

## UI change verification (mandatory)

Any change affecting rendered UI must be visually verified via Playwright MCP before it's done — the full rule (auto-loaded when you touch `.tsx`/`.css` files) lives in `.claude/rules/ui-verification.md`.

## Keeping documentation current

When a change alters this app's architecture — new routing/layout, new shared-package usage, changed build config or path aliases — update this file (and root `CLAUDE.md` if monorepo-wide) in the same change. Keep app-local detail here and cross-workspace facts in root — see root `CLAUDE.md` → "CLAUDE.md hierarchy" for what belongs where.
