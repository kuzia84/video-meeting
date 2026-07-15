# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@video-meetings/api` — a NestJS 11 backend. Part of the `video-meetings` Turborepo monorepo; see the root `CLAUDE.md` for cross-workspace commands and architecture. Runs on port 3001 (`process.env.PORT` overrides).

## Commands

Run from this directory, or from the repo root with `-w @video-meetings/api`:

```bash
npm run dev            # nest start --watch
npm run build           # nest build -> dist/
npm run start            # node dist/main
npm run lint             # eslint "{src,test}/**/*.ts"
npm run lint:fix
npm run test              # jest (unit tests, *.spec.ts under src/)
npm run test:e2e           # jest --config ./test/jest-e2e.json (*.e2e-spec.ts under test/) — requires Postgres running (`npm run db:up` from repo root)
npm run clean               # rm -rf dist
npx prisma migrate dev      # apply/create migrations against the running Postgres
```

Run a single test:

```bash
npx jest app.controller.spec.ts
npx jest -t 'should return a healthy response'
```

## Architecture

- Standard NestJS module/controller/service structure: `src/app.module.ts` wires `AppController` + `AppService`; `src/main.ts` bootstraps the app with CORS enabled.
- Consumes shared response types from `@video-meetings/shared` (`ApiResponse<T>`, `PaginatedResponse<T>`) resolved via the `paths` alias in `tsconfig.json` — no compiled artifact required, imports go straight to `packages/shared/src`.
- `tsconfig.json` extends the root `tsconfig.base.json` and adds NestJS-specific compiler options (`emitDecoratorMetadata`, `experimentalDecorators`, `module`/`moduleResolution: nodenext`). `tsconfig.build.json` extends `tsconfig.json` and additionally excludes `test/` and `*.spec.ts` files from production builds.
- Jest config lives inline in `package.json` (`rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`) for unit tests; e2e tests use the separate `test/jest-e2e.json` config and live under `test/`.
- `.eslintrc.js` sets `root: true` (does not inherit the repo-root ESLint config) and layers `plugin:prettier/recommended` on top of the `@typescript-eslint/recommended` rules.
- **CQRS**: `apps/api` uses CQRS (`@nestjs/cqrs`) for its feature modules — see **`docs/architecture/cqrs.md`** for the full guide: Command-vs-Query rule, folder/naming conventions, error propagation through the buses, and the step-by-step recipe for adding a new command or query. Read it before adding an operation.
- **Auth (`src/auth/`)**: Uses CQRS via `@nestjs/cqrs`. `AuthController` dispatches `RegisterCommand` and `LoginCommand` through `CommandBus`; the logic lives in `@CommandHandler`s under `src/auth/commands/handlers/` (`RegisterHandler`, `LoginHandler`). JWT issuance is centralized in `TokenService` (`src/auth/token.service.ts`), injected by both handlers. `AuthModule` imports `CqrsModule` and registers the two handlers and `TokenService` as providers, alongside `JwtModule.registerAsync` configured from `ConfigService` (secret/TTL). Login is modeled as a Command (not a Query); domain events (`EventBus`) are intentionally deferred with no consumer yet. `POST /auth/register` (201) and `POST /auth/login` (200, `@HttpCode(200)`) both validate `RegisterUserDto`/`LoginDto` (`class-validator`) and return `ApiResponse<{ accessToken, user: { id, email } }>` from `@video-meetings/shared`, wrapped manually in the controller (`{ success, message, data }`). Passwords are hashed with the native `bcrypt` package (10 rounds); JWT payload is `{ sub, email }`. Errors use Nest's default exception shape: 400 (validation), 401 with the same `'Invalid credentials'` message for both unknown email and wrong password, 409 for a duplicate email on register. HTTP behavior is unchanged from the pre-CQRS version—the existing e2e suite covers it. See `docs/superpowers/specs/2026-07-14-auth-cqrs-refactor-design.md`. `AuthModule` also provides and **exports** a reusable `JwtAuthGuard` (`src/auth/guards/`, verifies the `Authorization: Bearer` token with `JWT_SECRET` and attaches `{ userId, email }` to the request) plus a `@CurrentUser()` param decorator (`src/auth/decorators/`) and the `AuthUser` type — the JWT is now verified on incoming requests, not only issued. **Auth no longer touches the database directly**: `RegisterHandler` hashes the password then dispatches `CreateUserCommand`, and `LoginHandler` dispatches `GetUserByEmailQuery` — both handled by the Users module over the shared CQRS bus (`RegisterHandler` injects `CommandBus`, `LoginHandler` injects `QueryBus`; neither injects `PrismaService`). Password hashing/verification and the timing-attack dummy-hash stay in Auth; see the cross-module dispatch section in `docs/architecture/cqrs.md` and `docs/superpowers/specs/2026-07-15-auth-users-split-design.md`.
- **Users (`src/users/`)**: owns all access to the `user` table; the only place `prisma.user` is touched. Exposes its operations solely as CQRS handlers (no controller yet — user-facing HTTP like profile comes later): `CreateUserCommand(email, passwordHash)` → `CreateUserHandler` (`prisma.user.create`; a `P2002` unique-email violation becomes the `409 { message: 'Этот email уже зарегистрирован', field: 'email' }` conflict, moved here from auth since this is where the write happens) and `GetUserByEmailQuery(email)` → `GetUserByEmailHandler` (`prisma.user.findUnique`, returns the full `User` including `passwordHash` as an internal cross-handler contract — never serialized to HTTP). `UsersModule` imports `CqrsModule` and registers the two handlers as providers; it has no controller and no exports, and other modules reach it only through the bus (Auth depends on the command/query classes as value objects, not on `UsersModule`). `CreateUserCommand` takes a ready `passwordHash` — Users is unaware of bcrypt.
- **Meetings (`src/meetings/`)**: CQRS module for per-user meetings, the first protected routes. `MeetingsController` is guarded by `@UseGuards(JwtAuthGuard)` (imports `AuthModule` for the exported guard + `JwtModule`) and reads the owner via `@CurrentUser()`. `POST /meetings` (201) dispatches `CreateMeetingCommand` (`@CommandHandler`); `GET /meetings` (200) dispatches `ListMeetingsQuery` (`@QueryHandler`, paginated `?page&limit`, defaults 1/20, `startTime asc`) and returns `PaginatedResponse<Meeting>`; `GET /meetings/:id` (200) dispatches `GetMeetingQuery`. All queries filter by the token's `userId`; an unowned/missing meeting → `404` (no existence leak). Create validates `endTime > startTime` → `400`. Handlers inject `PrismaService` and return the Prisma `Meeting` type.
- **Prisma / database (`src/prisma/`)**: `PrismaModule` is `@Global()` and exports `PrismaService` (extends `PrismaClient`, connects/disconnects on module init/destroy) so any module can inject it without re-importing. `prisma/schema.prisma` has `User` (`id`, `email` unique, `passwordHash`, `createdAt`) and `Meeting` (`id`, `title`, `description?`, `startTime`, `endTime`, `createdAt`, `userId`), related 1-to-many `User.meetings` ↔ `Meeting.user` with `onDelete: Cascade` (the schema's first relation). Migrations are in `prisma/migrations/` and applied/created with `npx prisma migrate dev`. The local Postgres (`docker-compose.yml` at repo root, `npm run db:up`) must be running for migrations, `dev`, and `test:e2e`.
- **Config (`main.ts`, `app.module.ts`)**: `ConfigModule.forRoot({ isGlobal: true })` reads `apps/api/.env` (see `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` default `1h`). `main.ts` also installs a global `ValidationPipe({ whitelist: true, transform: true })`.
- **Prisma pinned to `^6.19.2`** (both `prisma` and `@prisma/client`) — deliberate, not stale: Prisma 7.x changes the `datasource`/`env()` schema syntax and requires a `prisma.config.ts` plus a driver adapter, which is incompatible with the current `schema.prisma`/migration setup. Do not let a routine `npm update` bump past 6.x; upgrading to 7 needs its own deliberate migration.

## Keeping documentation current

When a change alters this app's architecture — new module structure, new shared-package usage, changed build/test config, changed port or bootstrap behavior — update this file (and the root `CLAUDE.md` if the change is monorepo-wide) in the same change.
