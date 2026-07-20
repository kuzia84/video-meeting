# Browser e2e (`e2e/`)

App-local detail for the Playwright browser tests. Parent: `apps/web/CLAUDE.md`. Run with `npm run test:e2e` (needs `npm run db:up` first). This is committed unattended tests — **not** the Playwright **MCP** server from `docs/architecture/frontend-ui.md` (which drives a browser by hand to eyeball layout). Both exist on purpose.

## Real stack, dev database

The tests run the real stack: frontend → real API → real Postgres. `playwright.config.ts` starts both dev servers itself and reuses a running `npm run dev` (`reuseExistingServer: !CI`). Load-bearing config:

- The API readiness URL is **`/health`, not `/`** — the API has no root route and 404s there, which reads as "not up", so `reuseExistingServer` would miss a running API and try to start a second one → EADDRINUSE.
- `workers: 1` — the suite shares one database.
- `use.timezoneId = 'UTC'` — the app formats dates in the browser's zone, so without a pinned zone a developer in UTC+3 and a CI box in UTC disagree about what an instant reads as, and whoever wrote the test wins by accident.

Not wired into turbo's `test` task (web has no `test` script) — `npm run test` at the root stays fast and dependency-free.

## Writes to the dev database — cleans up after itself

These tests drive the dev server, which reads its own `.env`, so they can't be given their own database the way the API's e2e are. Instead they clean up: `global-teardown.ts` runs `npm run db:clean-e2e -w @video-meetings/api`, which deletes every `e2e-`-prefixed account and unlinks its uploads. It **never fails the run** (housekeeping must not turn a green suite red). **Keep the `e2e-` prefix in `registerUser`** — it's what the cleanup matches on.

## Seeding (`support.ts`)

Tests **seed through the API, not the UI** (`registerUser`, `createMeeting`/`createMeetings`, `uploadFile`, `signIn`) — the creation form is exercised by its own spec, and driving it elsewhere would test that form instead of the screen under test. `signIn` writes the token into `sessionStorage` via `addInitScript`, mirroring what the app reads. Every run registers a **unique** email (pid + timestamp + counter), because the suite shares the dev database with everything else. Exported helpers: `registerUser`, `createMeeting`, `createMeetings`, `uploadFile`, `signIn`, `API_URL`, and types `TestUser`/`SeededMeeting`/`UploadedFile`.

Spec files cover home list, meeting page, meeting files, file upload, create (with and without files), edit, delete, and profile.
