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
npm run test:e2e           # jest --config ./test/jest-e2e.json (*.e2e-spec.ts under test/)
npm run clean               # rm -rf dist
```

Run a single test:

```bash
npx jest app.controller.spec.ts
npx jest -t 'should return a healthy response'
```

## Architecture

- Standard NestJS module/controller/service structure: `src/app.module.ts` wires `AppController` + `AppService`; `src/main.ts` bootstraps the app with CORS enabled.
- Consumes shared response types from `@video-meetings/shared` (`ApiResponse<T>`, `PaginatedResponse<T>`) resolved via the `paths` alias in `tsconfig.json` — no compiled artifact required, imports go straight to `packages/shared/src`.
- `tsconfig.json` extends the root `tsconfig.base.json` and adds NestJS-specific compiler options (`emitDecoratorMetadata`, `experimentalDecorators`, CommonJS module resolution). `tsconfig.build.json` extends `tsconfig.json` and additionally excludes `test/` and `*.spec.ts` files from production builds.
- Jest config lives inline in `package.json` (`rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`) for unit tests; e2e tests use the separate `test/jest-e2e.json` config and live under `test/`.
- `.eslintrc.js` sets `root: true` (does not inherit the repo-root ESLint config) and layers `plugin:prettier/recommended` on top of the `@typescript-eslint/recommended` rules.

## Keeping documentation current

When a change alters this app's architecture — new module structure, new shared-package usage, changed build/test config, changed port or bootstrap behavior — update this file (and the root `CLAUDE.md` if the change is monorepo-wide) in the same change.
