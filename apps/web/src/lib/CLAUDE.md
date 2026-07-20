# Data layer (`src/lib/`)

App-local detail for the API client, token storage, and the current-user source. Parent: `apps/web/CLAUDE.md`.

## Cross-cutting rule: auth-guarded resources travel as a header, never a URL

The token lives in `sessionStorage` (invisible to the server — that's why there's no `middleware.ts`), so JWT-guarded routes cannot be reached by `<img src>` / `<a href>`. Fetch with the `Authorization` header instead: JSON via the API client below; binary (avatar, file download) via `fetch → blob() → object URL`, revoked on unmount/next-tick.

## API client (`api/client.ts`)

The one shared `fetch` wrapper (no HTTP client library) — import it, don't inline `fetch`. Four transports:

- `fetchJson<T>(path, options)` — JSON endpoints; on success verifies the envelope actually has a `data` payload (throws rather than return `undefined`).
- `fetchPaginated<T>(path, options)` — returns the full `data`/`total`/`page`/`limit` envelope.
- `fetchVoid(path, options)` — 204s, no body read.
- `fetchBlob(path, options)` — byte endpoints; what `downloadMeetingFile` and `fetchAvatarBlob` build on.

It resolves the base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3001` in code), guards `res.json()` against a non-JSON body (throws a clear `Error`, not an uncaught `SyntaxError`), and on non-2xx throws **`ApiError`** (`status`, `messages: string[]` — normalizing the API's two error shapes, a `string[]` from `ValidationPipe` 400s and a plain `string` from hand-thrown exceptions — plus an optional `field` when present, e.g. the 409 duplicate-email sets `field: "email"`). **Branch on `err.field`, not `err.status` alone**, to target a specific form field. Also exports `apiUrl`, `apiErrorFrom`, `apiErrorFromText` (used by the XHR upload path below).

## Feature files (`api/*.ts`)

Each validates its own expected shape before returning:

- **`auth.ts`** — `registerUser` / `loginUser` (`assertAuthResult` checks `accessToken` + `user.id` + `user.email`).
- **`meetings.ts`** — `listMeetings(page)` (sends `Authorization: Bearer`, uses `fetchPaginated`, returns one page + `total`), `createMeeting`, `updateMeeting`, `deleteMeeting`, `getMeeting`; const `MEETINGS_PAGE_SIZE` (10); types `Meeting`/`NewMeeting`.
- **`profile.ts`** — `getProfile`, `updateProfileName`, `uploadAvatar` (multipart `POST /users/me/avatar` with an **auth header without `Content-Type`** so the browser sets the multipart boundary), `fetchAvatarBlob`, `changePassword` (`POST /auth/change-password`, 204); re-exports `UserProfile` from `@video-meetings/shared`.
- **`meeting-files.ts`** — `listMeetingFiles`, `deleteMeetingFile`, `downloadMeetingFile` (auth-header `fetch → blob → object URL → synthetic click → revoke next tick; `link.download` carries the filename`), and **`uploadMeetingFile`** — the one call built on **XMLHttpRequest** instead of the shared wrapper, because `fetch` has no upload-progress events (only download) and the streaming workaround needs HTTP/2 unsupported in Safari/Firefox. It still takes `apiUrl` + `apiErrorFromText` from `client.ts`, so a 401 here is the same `ApiError` as anywhere else. **Never set `Content-Type` on the FormData request** — only the browser knows the multipart boundary. On success the created row is appended from the response rather than re-fetching. (E2e throttles upload to 200 KB/s via CDP so the progress bar is testable.)

## Token storage (`auth/token.ts`)

The **only** place a token is persisted: `saveAccessToken` / `getAccessToken` / `removeAccessToken` (SSR-guarded). `saveAccessToken` throws a distinct `StorageError` (not caught by the same handler as a failed API call) so a form can tell "registration succeeded but couldn't persist the session" apart from "the request failed". `getUserEmailFromToken` decodes the JWT payload client-side to greet the user — display-only, not a security check (there is a `/users/me`, but the greeting avoids a fetch).

## Current-user source (`current-user/current-user-context.tsx`)

`CurrentUserProvider` / `useCurrentUser` — the **single source of the signed-in user**. Mounted at the app root (inside `Providers`), it stays mounted across client navigations and exposes `{ user, status, errorMessage, reload, setUser }` (`status`: `loading | ready | error | unauthenticated`). Both the header chip and the profile page read from it, so one `GET /users/me` serves both, and pushing a rename through `setUser` updates every consumer at once — no reload. It reconciles on every route change (`usePathname`): (re)fetches when the token **first appears** (login is a client `router.push`, so a fetch-once-at-mount provider would miss it) and resets to `unauthenticated` when the token is gone — keyed on a `handledTokenRef` that skips a re-fetch when auth state is unchanged and survives Strict Mode's remount (preventing a duplicate initial fetch). A stale in-flight fetch can't overwrite fresh state (a `requestIdRef` stamp). It does **not** redirect or clear the token on a `401` — it only reports `unauthenticated`; the consuming page decides. `useCurrentUser()` throws outside the provider.
