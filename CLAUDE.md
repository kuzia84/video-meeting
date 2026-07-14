# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Turborepo monorepo with npm workspaces containing two applications and one shared package:

- `apps/web` — Next.js 15 (App Router, React 19) frontend
- `apps/api` — NestJS 11 backend, listens on port 3001 (Next.js dev server uses the default 3000)
- `packages/shared` — `@video-meetings/shared`, shared TypeScript types consumed by both apps

See `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` for per-app details.

## Commands

All commands run from the repo root via Turborepo, which fans out to every workspace in parallel and caches results:

```bash
npm run dev          # turbo run dev — starts web (3000) and api (3001) concurrently
npm run build         # turbo run build — builds shared, then api and web in parallel (^build dependency)
npm run lint          # turbo run lint
npm run lint:fix      # turbo run lint:fix
npm run test          # turbo run test — currently only apps/api has tests
npm run clean         # turbo run clean
npm run format        # prettier --write across the whole repo
npm run format:check
```

To scope a command to a single workspace, use npm's `-w` flag or `turbo run <task> --filter=<workspace>`, e.g.:

```bash
npm run test -w @video-meetings/api
npm run dev -w @video-meetings/web
```

Running a single test file (from `apps/api`, or via `-w @video-meetings/api`):

```bash
npx jest app.controller.spec.ts
npx jest --config ./test/jest-e2e.json   # e2e tests
```

## Architecture

- **Package manager / workspaces**: npm workspaces (`apps/*`, `packages/*`) — a single `node_modules` at the root, with `@video-meetings/shared` symlinked into each app.
- **Task orchestration**: `turbo.json` defines the task graph. `build`, `lint`, and `test` all `dependsOn: ["^build"]`, meaning `packages/shared` is built before dependent apps run those tasks. `dev` is uncached and persistent.
- **Shared types package**: `packages/shared` has no build step consumed at dev time — both apps resolve it directly to TypeScript source via `tsconfig.json` path aliases (`"@video-meetings/shared": ["../../packages/shared/src"]`), not through a compiled `dist/`. Its own `build` script is just `tsc --noEmit` (a type-check, not a compile). When adding shared types, edit `packages/shared/src/index.ts` directly — no separate build/publish step is needed for the other workspaces to pick up the change.
- **TypeScript config layering**: `tsconfig.base.json` at the root sets strict-mode defaults (`strict`, `ES2022` target, declaration output). Each workspace's `tsconfig.json` extends it and overrides `module`/`moduleResolution` for its runtime (NestJS uses CommonJS/node resolution; Next.js uses ESNext/bundler resolution).
- **ESLint config layering**: the root `.eslintrc.js` defines base `@typescript-eslint` rules. `apps/api/.eslintrc.js` and `apps/web/.eslintrc.js` each set `root: true` and extend/override with framework-specific plugins (NestJS + Prettier integration in `api`; `next/core-web-vitals` + `next/typescript` in `web`) rather than inheriting the root config directly.
- **Single Prettier config**: `.prettierrc` at the root applies repo-wide; there is no per-app Prettier config.

## Design docs

`docs/superpowers/specs/2026-07-14-monorepo-design.md` and `docs/superpowers/plans/2026-07-14-monorepo-setup.md` capture the original scaffolding design and rationale (e.g., why the API runs on port 3001, why `shared` has no compiled output). Explicitly out of scope per the design doc: database/ORM, authentication/JWT guards, CI/CD, and Docker/deployment config.

## Keeping documentation current

When a change alters the project's architecture — new workspace/app, new shared package, changed task graph in `turbo.json`, changed port/build/module-resolution conventions, or a decision that supersedes something in `docs/superpowers/` — update this file (and the affected `apps/*/CLAUDE.md`) in the same change. Do not let `CLAUDE.md` drift from what the code actually does.
