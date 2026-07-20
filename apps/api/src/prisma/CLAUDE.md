# Prisma / database (`src/prisma/`)

App-local detail for Prisma, the schema, and the e2e database. Parent: `apps/api/CLAUDE.md`.

## `PrismaModule` / `PrismaService`

`PrismaModule` is `@Global()` and exports `PrismaService` (extends `PrismaClient`, `$connect` on module init / `$disconnect` on destroy) so any module can inject it without re-importing. The local Postgres (`docker-compose.yml` at repo root, `npm run db:up`) must be running for migrations, `dev`, and `test:e2e`.

## Schema (`prisma/schema.prisma`, PostgreSQL, all ids `@default(uuid())`)

- **`User`** — `id`, `email` unique, `passwordHash`, `name?`, `avatarUrl?`, `avatarColor` **(required)**, `createdAt`. `name`/`avatarUrl` are nullable and back the profile page. `avatarColor` is the name of a default-avatar colour solution from `AVATAR_COLOR_SOLUTIONS` (`@video-meetings/shared`), set once at registration by `CreateUserHandler` via `pickAvatarColorName()` and stable thereafter, so the default-avatar circle keeps its colour across reloads. The `add_user_avatar_color` migration backfilled every pre-existing row before enforcing NOT NULL, inlining the palette names so it stays a valid point-in-time snapshot.
- **`Meeting`** — `id`, `title`, `description?`, `startTime`, `endTime`, `createdAt`, `userId`.
- **`MeetingFile`** — `id`, `originalName`, `storedName` unique (the UUID on disk), `size`, `mimeType`, `createdAt`, `meetingId` indexed.
- Both relations are 1-to-many with `onDelete: Cascade` (`User.meetings ↔ Meeting.user`, `Meeting.files ↔ MeetingFile.meeting`). **The cascade removes only rows — the bytes on disk survive a deleted meeting** (disk cleanup belongs to the delete handlers, see `../meetings/CLAUDE.md` and `../storage/CLAUDE.md`).

Migrations live in `prisma/migrations/`, applied/created with `npx prisma migrate dev`.

## E2e has its own database

`test/setup-e2e.ts` rewrites `DATABASE_URL` to the dev one with `_e2e` appended (`video_meetings` → `video_meetings_e2e`) before `ConfigModule` reads `.env` (dotenv leaves an already-set var alone). `test/global-setup.ts` runs `prisma migrate deploy` once per run — which both creates the database if missing and applies every migration. This exists because the suites clear `user`/`meeting` **wholesale** in `beforeEach` and assert on global counts, so pointed at the dev database they would delete everything, including the seeded account. `assertE2eDatabase()` (`test/e2e-database.ts`) is called before the first delete in every wiping suite and **refuses to run unless the DB name ends in `_e2e`** — the isolation is worth exactly as much as that check.

## Fixed dev account (`prisma/seed.ts`, `npm run db:seed`)

`test@mail.com` / `Pasword1!` (bcrypt `BCRYPT_ROUNDS` = 10), `avatarColor: 'blue'` on create, plus three sample meetings. **Idempotent**: the user is an `upsert`; its three sample meetings are replaced by title (`deleteMany` + `createMany`), leaving anything else on the account alone — so re-running neither fails on the unique email nor destroys work. Survives `npm run test:e2e` (separate database). Nothing in the test suites depends on it — they mint their own throwaway users; it exists only for poking at the app by hand. The password guards only a local dev database and must never be reused anywhere real.

## Prisma pinned to `^6.19.2`

Both `prisma` and `@prisma/client` — deliberate, not stale. Prisma 7.x changes the `datasource`/`env()` schema syntax and requires a `prisma.config.ts` plus a driver adapter, incompatible with the current `schema.prisma`/migration setup. Don't let a routine `npm update` bump past 6.x; upgrading to 7 needs its own deliberate migration.
