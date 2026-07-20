# File storage (`src/storage/`)

App-local detail for on-disk file storage. Parent: `apps/api/CLAUDE.md`. Uploaded files are the one piece of state that does **not** live in Postgres.

## `StorageModule` / `MeetingFileStorage`

- `StorageModule` is `@Global()` and exports the `UPLOAD_DIR` string token (the resolved absolute upload directory) plus `MeetingFileStorage` (`meeting-file-storage.service.ts`).
- `MeetingFileStorage` owns **every** path built under `UPLOAD_DIR`: `pathFor` is private on purpose — the only ways in are `open` / `remove` / `removeAll`; do not `join(uploadDir, …)` anywhere else.
- `open(storedName, expectedSize)` `stat`s the file first and **404s unless it exists, is a regular file, AND matches `expectedSize`** — all three checks are load-bearing. A row can outlive its bytes (wiped directory, DB dump restored beside a stale volume, interrupted copy): without the existence check `createReadStream` raises ENOENT _after_ 200 is on the wire; without the size check the `Content-Length` from the row promises bytes the stream can't deliver and the download **aborts** instead of failing cleanly. Stored files are immutable, so a size mismatch can only be corruption.
- `removeAll(storedNames)` is the delete handlers' single cleanup path — best-effort per file, never throws, returns how many it unlinked so a shortfall is logged rather than passing silently.
- `resolveUploadDir` reads the `UPLOAD_DIR` env var (relative paths resolve against `process.cwd()`, default `./uploads`) and `mkdirSync`s it at startup, because multer does not create its own destination. `apps/api/uploads` is git-ignored. **In Docker the directory must sit on a mounted volume** or uploads die with the container.

## Test isolation & litter cleanup

- **E2e isolates onto its own directory**: `test/setup-e2e.ts` sets `process.env.UPLOAD_DIR` to `test/.uploads-e2e` before the app loads (dotenv never overrides an already-set var, so this wins over `.env`). `meeting-files.e2e-spec.ts` asserts the resolved dir is the isolated one before wiping it between tests — do not "clean up" those redundant-looking asserts.
- **Test litter cleanup** (`scripts/clean-e2e.ts`, `npm run db:clean-e2e`), two kinds:
  1. **Browser-e2e accounts** — those tests drive the running dev server, so their users/meetings/uploads land in the **dev** database and directory. They register under an `e2e-` prefix; the script deletes those accounts and unlinks their files — meeting files (top-level in `UPLOAD_DIR`) **and** each account's avatar (in `avatars/`). Playwright runs it in `globalTeardown`.
  2. **Orphaned bytes** — a cascade removes meeting/file _rows_ but never the files (nothing in Postgres knows the directory exists), so any row deleted outside the API's delete handlers strands its bytes forever; the sweep is the only thing that reclaims them. It **skips anything younger than an hour** (multer writes a file before its row exists, so a fresh unreferenced file is likely an upload in flight). It sweeps **two spaces against two reference sets**: top-level files vs `MeetingFile.storedName`, and the `avatars/` subdirectory vs `User.avatarUrl`.
