---
paths:
  - 'apps/api/src/**/*.ts'
---

# Backend coding rules (`apps/api`)

These rules take priority over patterns in existing code. If existing code violates them, follow the rules, not the old code.

## Before writing new code

- Read the applicable `CLAUDE.md` (this app's and the module's) first — its rules outrank whatever the surrounding code happens to do.
- Look at neighbouring files that are written correctly and mirror their structure and conventions.

## Every service/handler method (mandatory)

- **Every parameter has an explicit TypeScript type** — no implicit `any`.
- **The return type is stated explicitly** as `Promise<T>` for async methods (or the concrete type for sync ones).
- **No `console.log`** — use `Logger` from `@nestjs/common` (a per-class `private readonly logger = new Logger(ClassName.name)`).
- **Name variables by meaning**, not `x` / `data` / `result` / `tmp`.

## Dependencies (NestJS DI)

- **Reach another module's providers through that module** — import the module that exports the provider (or dispatch over the CQRS bus), not by importing another feature's service class directly. (E.g. Auth reaches Users via `CommandBus`/`QueryBus` and the exported `JwtAuthGuard`, never by importing a Users service.)
