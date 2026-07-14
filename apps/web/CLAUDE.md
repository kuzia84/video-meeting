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

- App Router structure under `src/app/` (`layout.tsx`, `page.tsx`).
- Path aliases in `tsconfig.json`: `@/*` maps to `src/*`; `@video-meetings/shared` maps directly to `packages/shared/src` (not a compiled `dist/`), so shared type changes are picked up without a separate build step.
- `next.config.ts` sets `transpilePackages: ['@video-meetings/shared']` so Next.js compiles the workspace package's TypeScript source directly rather than expecting pre-built JS.
- Consumes shared response types from `@video-meetings/shared` (e.g. `ApiResponse<T>`).
- `tsconfig.json` extends the root `tsconfig.base.json`, overriding module resolution for Next.js (`ESNext`/`bundler`, `jsx: "preserve"`, `noEmit: true` — Next's own toolchain handles emission).
- `.eslintrc.js` sets `root: true` (does not inherit the repo-root ESLint config) and extends `next/core-web-vitals` and `next/typescript`.

## Keeping documentation current

When a change alters this app's architecture — new routing/layout structure, new shared-package usage, changed build config or path aliases — update this file (and the root `CLAUDE.md` if the change is monorepo-wide) in the same change.
