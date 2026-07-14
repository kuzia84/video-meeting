# Monorepo Design — video-meetings

**Date:** 2026-07-14
**Stack:** Next.js 15 + NestJS 11 + Turborepo + npm workspaces

---

## Overview

A monorepo containing two applications (Next.js frontend, NestJS backend) and one shared library, managed by Turborepo for task orchestration and npm workspaces for dependency management.

---

## Directory Structure

```
video-meetings/
├── apps/
│   ├── web/                        # Next.js 15 (App Router)
│   │   ├── src/
│   │   │   ├── app/                # pages and layouts (App Router)
│   │   │   ├── components/         # React components
│   │   │   ├── lib/                # utilities, helpers
│   │   │   └── types/              # local types (if needed)
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── .eslintrc.js
│   │   └── package.json
│   │
│   └── api/                        # NestJS 11
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── app.controller.ts
│       │   ├── app.service.ts
│       │   └── main.ts
│       ├── test/
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── .eslintrc.js
│       └── package.json
│
├── packages/
│   └── shared/                     # shared types library
│       ├── src/
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── turbo.json
├── package.json                    # root, npm workspaces
├── .eslintrc.js                    # base rules for entire repo
├── .prettierrc
├── .gitignore
└── tsconfig.base.json
```

---

## Technology Versions

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| Next.js | 15 |
| NestJS | 11 |
| TypeScript | 5.x |
| Turborepo | 2.x |
| npm | bundled with Node 20 |

---

## Package Manager & Workspaces

**npm workspaces** declared in root `package.json`:

```json
{
  "name": "video-meetings",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

---

## Scripts

### Root `package.json`

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "test": "turbo run test",
    "clean": "turbo run clean"
  }
}
```

### Turborepo pipeline (`turbo.json`)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "lint:fix": {
      "cache": false
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## ESLint & Prettier

- Root `.eslintrc.js` — base TypeScript rules (shared across all packages)
- `apps/web/.eslintrc.js` — extends root, adds `eslint-plugin-next`, `eslint-plugin-react`
- `apps/api/.eslintrc.js` — extends root, adds `@nestjs/eslint-plugin`
- Single `.prettierrc` at root (no duplication)

---

## Shared Package

**Package name:** `@video-meetings/shared`
**Path:** `packages/shared`

Consumed by both apps via npm workspaces:

```json
{ "dependencies": { "@video-meetings/shared": "*" } }
```

Initial content (`packages/shared/src/index.ts`):

```typescript
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
```

---

## TypeScript Configuration

Root `tsconfig.base.json` extended by all packages:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@video-meetings/shared": ["../../packages/shared/src"]
    }
  }
}
```

---

## Out of Scope (for now)

- Database / ORM
- Authentication / JWT guards
- CI/CD pipeline
- Docker / deployment configuration
