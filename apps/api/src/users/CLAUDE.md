# Users module (`src/users/`)

App-local detail for the Users module (including the `avatar/` subfolder). Parent: `apps/api/CLAUDE.md`.

## Responsibility

Owns **all** access to the `user` table — the only place `prisma.user` is touched. Exposes writes/lookups as CQRS handlers so other modules (Auth) reach the table only over the bus. Owns the profile + avatar HTTP routes.

## CQRS handlers

- `CreateUserCommand(email, passwordHash)` → assigns `avatarColor` via `pickAvatarColorName()` (from `@video-meetings/shared`) so every user has a default-avatar colour from creation; `P2002` → `409 { message: 'Этот email уже зарегистрирован', field: 'email' }`.
- `UpdateUserNameCommand(userId, name)` → updates the `name` column only; `P2025` → 401 (account deleted since the token was issued).
- `UpdateUserPasswordCommand(userId, passwordHash)` → updates `passwordHash` only; takes a **ready hash** (Users is unaware of bcrypt — hashing lives in Auth); returns `void`.
- `GetUserByEmailQuery` / `GetUserByIdQuery` → `findUnique`, both return the full `User` **including `passwordHash`** as an internal cross-handler contract — never serialize to HTTP directly; narrow with `to-profile.ts` (`toProfile` drops `passwordHash`, yielding `UserProfile`).

`UsersModule` imports `CqrsModule` and `AuthModule` (for the exported `JwtAuthGuard`).

## Profile routes (`users.controller.ts`, class-level `@UseGuards(JwtAuthGuard)`)

- `GET /users/me` (200) — reads the caller's id from `@CurrentUser()`, returns `ApiResponse<UserProfile>` (`{ id, email, name, avatarUrl, avatarColor }`).
- `PATCH /users/me` (200) — sets the display name via `UpdateProfileDto` (`name` required, **trimmed before** the length check, `MinLength(1)`/`MaxLength(100)` — so whitespace-only or missing is 400), returns the updated `UserProfile`.
- A valid token whose account was since deleted → **401** (session invalid), not 404.

## Avatar (`src/users/avatar/`)

- **`POST /users/me/avatar`** (`avatar.controller.ts`, `FileInterceptor('avatar')`) — one image, three validation layers: (1) `avatarFileFilter` + `limits.fileSize`/`files:1` (5 MB, `.jpg/.jpeg/.png/.webp` extension + mimetype allowlist, `avatar-upload-validation.ts`); (2) `AvatarSizeLimitFilter` rewrites multer's bare 413 to name the 5 MB limit; (3) after the bytes are on disk, `readAvatarImageType` (`avatar-content-type.ts`) sniffs magic bytes (JPEG/PNG/RIFF-WEBP) and **400s a file whose content isn't a real image** (e.g. a PDF renamed `.png`) — on that rejection the just-written file is removed and the previous avatar is untouched. A missing file part → 400 (`Файл аватара обязателен.`).
- **`GET /users/me/avatar`** — streams the current user's bytes as a `StreamableFile`, **auth-only** (token in sessionStorage; the frontend fetches a blob with the auth header — a plain `<img src>` can't carry it). `Content-Type` is re-sniffed from the file's own magic bytes at serve time (no column stores it), plus `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-cache`. Two distinct 404s: `Avatar not set` (null `avatarUrl`) vs `Avatar content not found` (bytes gone/corrupt).
- **Storage**: `AvatarStorage` (`avatar-storage.service.ts`) writes to the **`avatars/` subdirectory** of `UPLOAD_DIR` under a UUID name — a subdirectory so the meeting-file orphan sweep never mistakes an avatar for a meeting-file orphan. `directoryFor(uploadDir)` is the single place that path is computed; the module's multer factory derives its write destination from it.
- **`UploadAvatarHandler`** updates `user.avatarUrl` to the new name **first, then removes the previous file** — a crash between them strands a reclaimable orphan, not a live link to a deleted file. A deleted account removes the new file and 401s. The read-then-update is **not** locked: two concurrent replaces can strand the loser's file — an accepted, bounded (≤5 MB) leak reclaimed by the sweep (see `../storage/CLAUDE.md`).

Constants: `MAX_AVATAR_BYTES` = 5 MB, `MULTER_AVATAR_SIZE_LIMIT` = `MAX_AVATAR_BYTES + 1` (busboy trips when the byte count **reaches** the limit — the `+1` lets a file of exactly 5 MB through while the 413 text promises 5 MB is fine).

Both controllers narrow via the shared `to-profile.ts`, so `passwordHash` never leaves.
