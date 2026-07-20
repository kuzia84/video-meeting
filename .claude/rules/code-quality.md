---
paths:
  - 'apps/**/*.ts'
  - 'apps/**/*.tsx'
---

# Code quality rules (`apps/api` + `apps/web`)

These rules take priority over patterns in existing code. The size limits are targets for the code you write or touch — not a mandate to refactor untouched files.

## Naming

- **Files: `feature.type.ts` in kebab-case** — e.g. `create-meeting.handler.ts`, `token.service.ts`, `meeting-files.controller.ts`. (This is a CQRS codebase: features split into `*.command.ts` / `*.query.ts` / `*.handler.ts` / `*.controller.ts` / `*.service.ts`, not one fat `*.service.ts` per feature.)
- **Methods name an action** — `createMeetingWithFiles`, not `handle` / `process` / `doIt`.
- **Variables by meaning** — `meetingId`, not `id` / `x` / `data` / `result`.
- **Prefer an enum / union type over bare magic strings** (illustrative — `MeetingStatus.PENDING` over `'pnd'`; no such enum exists yet).
- **Named constants over magic numbers** — as the code already does (`MAX_UPLOAD_BYTES`, `MAX_AVATAR_BYTES`, `BCRYPT_ROUNDS`).

## Size (targets for the code you touch)

- **File > 300 lines** → decompose before adding more to it.
- **Method > 40 lines** → extract a private method.
- **Nesting > 3 levels** → refactor (early returns / guard clauses).

## Dependencies

- **Shared types come only from `@video-meetings/shared`** (never a relative path into another workspace).
- **Avoid circular dependencies.** No tool enforces this — watch for it, especially a NestJS `forwardRef` smell that signals a cycle to untangle rather than paper over.

## Refactoring

- **Before adding code to an already-large file, decompose it first** — don't grow a file that's already over the size target.
- **Keep tests green at every refactoring step** — refactor in small, verified increments, not one big rewrite.
