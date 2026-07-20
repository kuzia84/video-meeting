# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Turborepo monorepo with npm workspaces containing two apps and one shared package:

- `apps/web` — Next.js 15 (App Router, React 19) frontend, port 3000
- `apps/api` — NestJS 11 backend, port 3001
- `packages/shared` — `@video-meetings/shared`, types + runtime logic used by both apps

See `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` for per-app details.

## Commands

Scripts are defined in the root `package.json` (run via Turborepo — fans out to every workspace, caches; `build` compiles `shared` before dependent apps via `^build`). Scope to one workspace with `-w <workspace>` or `turbo run <task> --filter=<workspace>`. `npm run db:up`/`db:down`/`db:logs` drive the local Postgres (:5432). What the script names don't tell you:

- **`npm run test`** is unit only (api jest, shared jest/ts-jest) — no Postgres, cached/fast. **E2E is deliberately separate** (not in the turbo `test` task) because both suites need a running Postgres (`npm run db:up`):
  - `npm run test:e2e -w @video-meetings/api` — supertest, uses its **own** database (`video_meetings_e2e`), so it never touches the dev database or seed account.
  - `npm run test:e2e -w @video-meetings/web` — Playwright (needs `npx playwright install chromium` once), drives the **dev** server/database (add-only, but its seeded users accumulate — reclaimed by `npm run db:clean-e2e`).
- Run a single test (from `apps/api`): `npx jest app.controller.spec.ts` (add `--config ./test/jest-e2e.json` for e2e).

## Architecture

- **Workspaces**: npm workspaces (`apps/*`, `packages/*`), single root `node_modules`, `@video-meetings/shared` symlinked into each app.
- **Task graph** (`turbo.json`): `build`/`lint`/`test`/`dev` all `dependsOn: ["^build"]`, so `packages/shared` compiles before dependent apps run. `dev` is uncached and persistent.
- **Shared package** (`packages/shared`) **is compiled** (`build` = `tsc` → `dist/` JS + `.d.ts`; `main`/`types` point at `dist/`) because it carries **runtime** code the API imports, and the API runs as plain Node which cannot `require` raw `.ts`. Resolution differs per consumer, on purpose: **web** resolves it to TS **source** (tsconfig path alias + `transpilePackages`) so edits need no rebuild; **api** resolves compiled **`dist/`** at runtime, so shared must be built first (covered by turbo `^build` and by api's `predev`/`prebuild`/`prestart`; api's jest resolves source via `moduleNameMapper`). **Edit `packages/shared/src/…`** — the compile is automatic in every wired path. Beyond types it holds pure logic used by both apps (e.g. `avatar-palette.ts`, `avatar-initial.ts`) and has its own jest unit tests.
- **TypeScript**: `tsconfig.base.json` sets strict-mode defaults (`strict`, `ES2022`, declaration output); each workspace's `tsconfig.json` extends it and overrides `module`/`moduleResolution` for its runtime.
- **ESLint**: root `.eslintrc.js` has base `@typescript-eslint` rules; `apps/*/.eslintrc.js` set `root: true` and layer framework plugins (api: NestJS + Prettier; web: `next/core-web-vitals` + `next/typescript`).
- **Prettier**: single root `.prettierrc`, repo-wide.

### Data & storage

- **Postgres via Docker Compose** (`docker-compose.yml`, `npm run db:up`): one `postgres:18-alpine` service, port 5432. Config from `POSTGRES_USER`/`PASSWORD`/`DB`/`PORT` env vars; `POSTGRES_PASSWORD` has **no default** (compose fails fast if unset — no password in the tracked file). Data in named volume `postgres_data`. Note: PG 18+ needs the volume mounted at `/var/lib/postgresql` (not `/data`) or it crash-loops.
- **Prisma** (`^6.19.2`, pinned — see `apps/api/CLAUDE.md`): `User`, `Meeting`, `MeetingFile` tables (`apps/api/prisma/schema.prisma`, 1-to-many with `onDelete: Cascade`). Owners: **Users** module owns `User`, **Auth** does register/login (reaches Users over the CQRS bus), **meetings** owns `Meeting`/`MeetingFile`. Routes are documented in `apps/api/CLAUDE.md`.
- **Uploaded files are the only state not in Postgres**: bytes go to `UPLOAD_DIR` (default `apps/api/uploads`, git-ignored), metadata to `MeetingFile`. Uploads capped at 100 MB, mp3/wav/m4a/mp4 only. **A deployment must treat that directory as persistent storage** (mounted volume in Docker). Deletion removes rows **then** bytes (in that order) — the cascade covers only rows, nothing in Postgres knows about the directory.

## Working efficiently (minimize context)

Prefer extracting only what you need over pulling whole files or full command output into context.

| Default (wasteful)                            | Do this instead                             | Saving      |
| --------------------------------------------- | ------------------------------------------- | ----------- |
| Read an entire file (e.g. `users.service.ts`) | `grep`/Grep for the specific lines/symbol   | up to ~90%  |
| Read the whole `package.json`                 | Pull only the one script you need           | up to ~70%  |
| Read the whole `schema.prisma`                | Grep for just the model in question         | substantial |
| List all GitHub issues in full                | Fetch only number + title (`gh issue list`) | substantial |

Trim tool output at the source:

- **Tests**: `npm test -- --silent` when you only need pass/fail; run by pattern (`npx jest <file>` / `-t 'name'`), not the whole suite.
- **Git diff**: keep it compact (`git diff --stat` for the shape, `--unified=0` when you only need changed lines).
- **Git log**: `git log --oneline -10`, not the verbose log, unless details are needed.
- **TypeScript** (`tsc --noEmit`): read the tail of the output (the errors), not the full run.

## Secrets & environment variables

**This is the canonical secrets policy for the repo.** Never commit real secrets, keys, or credentials.

- Real config lives in git-ignored `.env` files (`apps/api/.env`, `apps/web/.env`, root `.env` for compose). The root `.gitignore` covers every `.env`/`.env.*` plus key/cert patterns — don't remove those rules or `git add -f` a real `.env`.
- Only `*.example` templates are tracked, with **placeholder** values. When you add/rename an env var, update the matching `.example` in the same change.
- `NEXT_PUBLIC_*` variables are inlined into the client bundle — never put a secret behind that prefix. Server-only secrets (`JWT_SECRET`, `DATABASE_URL`) stay in `apps/api/.env`.
- In production, inject secrets from the environment / a secret manager, not a checked-in file. If a secret is ever exposed, rotate **and** purge it from history.

## Design docs

`docs/superpowers/specs/2026-07-14-monorepo-design.md` and `docs/superpowers/plans/2026-07-14-monorepo-setup.md` capture the original scaffolding. **Historical / partly superseded**: they describe `shared` as source-consumed with no build — see the Shared package bullet above for the current (compiled) reality. Database/ORM, auth/JWT, and CI/CD were out of scope there; Postgres and the auth module (`docs/superpowers/specs/2026-07-14-auth-login-register-design.md`) were added since.

## Keeping documentation current

When a change alters architecture — new workspace/app, changed task graph, changed port/build/module-resolution conventions, or a decision that supersedes `docs/superpowers/` — update this file (and the affected `apps/*/CLAUDE.md`) in the same change.
