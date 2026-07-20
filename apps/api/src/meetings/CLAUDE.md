# Meetings module (`src/meetings/`)

App-local detail for the Meetings module, including meeting files. Parent: `apps/api/CLAUDE.md`.

## Responsibility

CQRS module for per-user meetings and their uploaded files. `MeetingsController` is `@UseGuards(JwtAuthGuard)` and reads the owner via `@CurrentUser()` on every route; `MeetingFilesController` is `@UseGuards(JwtAuthGuard, MeetingOwnerGuard)`.

## Meeting routes (`meetings.controller.ts`)

- `POST /meetings` (201) — `CreateMeetingCommand`; validates `endTime > startTime` → 400. Title trimmed, `MinLength(1)`/`MaxLength(200)`; description max 2000.
- `GET /meetings` (200) — `ListMeetingsQuery`, paginated `?page&limit` (defaults 1/20, `limit` capped at `@Max(100)`, integer-coerced), ordered **`startTime asc, id asc`**, returns `PaginatedResponse<Meeting>`. The `id` tie-breaker is **load-bearing** for OFFSET paging — meetings sharing a `startTime` have no defined order without it, so paging would duplicate/drop rows; an e2e test pins it (`meetings.e2e-spec.ts`).
- `GET /meetings/:id` (200) — `GetMeetingQuery`.
- `PATCH /meetings/:id` (200) — real partial update: an omitted field is left alone (`undefined` skipped), while `description: null` **clears** it (`@IsOptional()` waves `null` through). The `endTime > startTime` cross-field check lives in `UpdateMeetingHandler`, which reads the stored row first, because moving only one side must still land after the value already in the DB — no DTO rule can see that.
- `DELETE /meetings/:id` (204) — reads the meeting's file `storedName`s **before** the delete (the cascade takes the rows and would leave the bytes unreachable), deletes the row, then removes the bytes.

All reads use `findFirst({ where: { …, userId } })` → an unowned/missing meeting reads as `404` (no existence leak); write handlers map Prisma `P2025` → their own 404 (a double DELETE must not 500).

## Meeting file routes (`meeting-files.controller.ts`)

- `POST /meetings/:meetingId/files` — one multipart `file` part, writes bytes to disk (multer `diskStorage`, `randomUUID()` filenames) + metadata to `MeetingFile`. `UploadMeetingFileHandler` `unlink`s the file if the Prisma write fails (multer writes before the handler runs). A missing file part → 400.
- `GET /meetings/:meetingId/files` — lists that meeting's metadata (`createdAt asc, id asc`, empty array when none).
- `GET /meetings/:meetingId/files/:fileId` — streams the bytes as a `StreamableFile` with `Content-Disposition: attachment; filename*=UTF-8''…` (RFC 5987, so Cyrillic names survive) + `Content-Type`/`Content-Length` and `X-Content-Type-Options: nosniff`.
- `DELETE /meetings/:meetingId/files/:fileId` (204) — the only file route taking `@CurrentUser()`; re-filters on the owner in addition to the guard, removes **row then bytes**.

Upload/list/download take **no** `@CurrentUser()` — ownership is enforced by `MeetingOwnerGuard` + the path `meetingId`.

## Load-bearing details (read `docs/meeting-file-upload-research.md` before extending)

- **Ownership is checked in `MeetingOwnerGuard` (a guard, not the handler)** — guards run before interceptors, so a non-owner can't stream 100 MB to disk before their 404 (`404 Meeting not found` for both unowned and missing).
- **100 MB cap = `limits.fileSize` = `MAX_UPLOAD_BYTES + 1`** (`MAX_UPLOAD_BYTES` = 104857600) — a `limits.fileSize`, **not** a `ParseFilePipe` (which would run only after all bytes are on disk). The `+1` is load-bearing (busboy trips when the count **reaches** the limit) — do not "simplify" it; an e2e test pins the boundary.
- **Type check is a `fileFilter` keyed on extension** (`.mp3/.wav/.m4a/.mp4`, `meeting-file-validation.ts`); the mimetype allowlist is hygiene, not security (both extension and mimetype are client-written; nothing inspects the bytes — antivirus is out of scope, uploads are never executed, only the owner reads them).
- **`GetMeetingFileHandler` filters on both `id` and `meetingId`** — the guard only proves the caller owns the meeting in the path, so without the second filter a file of another meeting could be fetched by id.
- **`UploadSizeLimitFilter`** (`filters/`) rewrites multer's bare 413 (`File too large`) to name the limit, bound with `@UseFilters` to the **upload route only**.
- `decodeOriginalName` (`decode-original-name.ts`, unit-tested) repairs Cyrillic names **conditionally** — an unconditional latin1→UTF-8 round-trip would corrupt names from clients that send RFC 5987 `filename*`.
- `limits.files: 1`; multer cleans up on client disconnect itself (multer 2.2.0 — re-verify on upgrade).
- `MeetingFileResponse` (`meeting-file.response.ts`) drops `storedName`, which stays server-side.

Disk bytes are owned entirely by `MeetingFileStorage` — see `../storage/CLAUDE.md`. The feature is implemented end-to-end (API + the web meeting-files UI in `apps/web/src/app/meetings/[id]/meeting-files.tsx`).
