# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@video-meetings/api` — NestJS 11 backend, part of the `video-meetings` monorepo (see root `CLAUDE.md` for cross-workspace commands/architecture). Port 3001 (`process.env.PORT` overrides).

## Commands

Scripts are in this workspace's `package.json`; run from here or from the root with `-w @video-meetings/api`. Notes beyond the script names: `npm run test:e2e` needs Postgres (`npm run db:up`) and uses its **own** database (see `src/prisma/CLAUDE.md`); `npm run db:seed` writes the fixed dev account (`src/prisma/CLAUDE.md`); `npm run db:clean-e2e` reclaims test litter (`src/storage/CLAUDE.md`). Not scripts: `npx prisma migrate dev` (apply/create migrations against the running Postgres); a single test via `npx jest app.controller.spec.ts` or `npx jest -t 'name'`.

## Architecture

- **Bootstrap** (`src/main.ts`, `src/app.module.ts`): CORS allowlist from `CORS_ORIGINS` (comma-separated, default `http://localhost:3000`), `app.enableShutdownHooks()` (Prisma disconnect on SIGTERM/SIGINT), global `ValidationPipe({ whitelist: true, transform: true })`. `ConfigModule.forRoot({ isGlobal: true })` reads `apps/api/.env` (see `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` default `1h`, `CORS_ORIGINS`, `UPLOAD_DIR` default `./uploads`).
- **Shared package**: resolved from compiled `dist/` (jest is the exception — resolves source via `moduleNameMapper`). Full rationale in root `CLAUDE.md` "Shared package"; the API imports both types (`ApiResponse<T>`, `UserProfile`, …) and runtime values (`pickAvatarColorName`, …).
- **TS config**: `tsconfig.json` extends root base + NestJS options (`emitDecoratorMetadata`, `experimentalDecorators`, `nodenext`); `tsconfig.build.json` excludes `test/`/`*.spec.ts`. Jest config inline in `package.json` (unit); e2e uses `test/jest-e2e.json`.
- **CQRS**: feature modules use `@nestjs/cqrs`. **Read `docs/architecture/cqrs.md` before adding an operation** — Command-vs-Query rule, naming, error propagation, and the recipe for a new command/query.

### Modules

Each module keeps its own detail in a nested `CLAUDE.md` (loaded into context when you work in that directory) — per the "CLAUDE.md hierarchy" rule in root `CLAUDE.md`. This file lists only what each owns and where to read more.

- **Auth** — `src/auth/CLAUDE.md`. Register/login/change-password (CQRS); issues JWT; never touches the DB (dispatches to Users over the bus); provides/exports `JwtAuthGuard` + `JwtModule`, and the `@CurrentUser()` decorator / `AuthUser` type.
- **Users** (incl. avatar) — `src/users/CLAUDE.md`. The only place `prisma.user` is touched; CQRS user writes/lookups; profile routes `GET`/`PATCH /users/me`; avatar upload/serve (`POST`/`GET /users/me/avatar`, stored in the `avatars/` subdir).
- **Meetings** (incl. meeting files) — `src/meetings/CLAUDE.md`. Per-user meetings `POST`/`GET`/`GET/:id`/`PATCH/:id`/`DELETE/:id`; meeting-file upload/list/download/delete under `/meetings/:meetingId/files`. Feature is implemented end-to-end (API + web UI).
- **Error message language** (module-spanning): end-user-facing messages are **Russian** (product copy, rendered verbatim by the frontend — `Файл слишком большой…`, `Этот email уже зарегистрирован`); developer-only / handled-by-UI messages stay **English** (`Meeting not found`, `Invalid credentials`). No i18n layer. Requirements: `docs/meeting-file-upload.md`, plan `docs/meeting-file-upload-plan.md`.

### Storage & database

- **File storage** (`src/storage/`) — `src/storage/CLAUDE.md`. `StorageModule` (`@Global()`, exports `UPLOAD_DIR` + `MeetingFileStorage`); the size/existence checks in `open`; the e2e upload-dir isolation; the test-litter / orphan-byte sweep.
- **Prisma / database** (`src/prisma/`) — `src/prisma/CLAUDE.md`. `PrismaModule`/`PrismaService`; the `User`/`Meeting`/`MeetingFile` schema and cascade; the e2e database isolation; the seeded dev account; the `^6.19.2` version pin.

## Keeping documentation current

When a change alters this app's architecture — new module structure, new shared-package usage, changed build/test config, changed port/bootstrap — update this file (and root `CLAUDE.md` if monorepo-wide) in the same change. Keep app-local detail here and cross-workspace facts in root — see root `CLAUDE.md` → "CLAUDE.md hierarchy" for what belongs where.
