---
paths:
  - 'apps/web/src/**/*.ts'
  - 'apps/web/src/**/*.tsx'
---

# Frontend coding rules (`apps/web`)

These rules take priority over patterns in existing code. If existing code violates them, follow the rules, not the old code.

## Before writing new code

- Read the applicable `CLAUDE.md` (this app's, and the layer's — `src/app`, `src/components`, `src/lib`) first — its rules outrank whatever the surrounding code happens to do.
- Look at neighbouring files that are written correctly and mirror them. Reuse what already exists instead of hand-rolling it: the shared components (`AppHeader`, `PageShell`, `UserAvatar`, `MeetingForm`, `ConfirmDeleteDialog`), the `useCurrentUser` source, and the API client (`fetchJson`/`fetchPaginated`/`fetchVoid`/`fetchBlob`) — never inline a new `fetch`.

## Every component, hook, and function (mandatory)

- **Props are typed explicitly** via an `interface`/`type` — no implicit `any`; type event handlers and every function parameter.
- **Non-component functions state their return type explicitly** (helpers, hooks, API calls — e.g. `Promise<UserProfile>`). A component may let its JSX return type be inferred.
- **No stray `console.log`** — surface problems through UI/error state (the `ApiError` from the client, a page's error branch), not the console. `console.warn`/`console.error` only for genuine non-fatal diagnostics.
- **Name variables and handlers by meaning** (`meetings`, `handleSubmit`, `isSubmitting`) — not `x` / `data` / `result` / `tmp`; event handlers as `handleX`.
- **`'use client'` only where it's needed** (interactivity, hooks, browser APIs) — keep server components server by default.
