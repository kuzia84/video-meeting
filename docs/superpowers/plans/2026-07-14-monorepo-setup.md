# Monorepo Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Turborepo monorepo with Next.js 15 (apps/web), NestJS 11 (apps/api), and a shared types package (packages/shared).

**Architecture:** npm workspaces manage dependencies; Turborepo orchestrates dev/build/lint/test pipelines across all packages. The shared package (`@video-meetings/shared`) is consumed by both apps via workspace linking. Each app has its own TypeScript and ESLint config that overrides the root base.

**Tech Stack:** Node 20, npm workspaces, Turborepo 2, TypeScript 5, Next.js 15, NestJS 11, ESLint 9, Prettier 3

---

## File Map

**Create:**
- `package.json` — root, workspaces, root scripts, devDeps (turbo, prettier, eslint, ts-eslint)
- `turbo.json` — pipeline: build, dev, lint, lint:fix, test, clean
- `tsconfig.base.json` — strict base, no module resolution (each app overrides)
- `.eslintrc.js` — base TypeScript rules for root-level files
- `.prettierrc` — single Prettier config for whole repo
- `.gitignore`
- `packages/shared/package.json` — name: @video-meetings/shared
- `packages/shared/tsconfig.json` — extends base
- `packages/shared/src/index.ts` — ApiResponse, PaginatedResponse interfaces
- `apps/api/package.json` — NestJS 11 deps + scripts + jest config
- `apps/api/tsconfig.json` — NestJS CommonJS config, extends base
- `apps/api/tsconfig.build.json` — excludes test files from build
- `apps/api/.eslintrc.js` — NestJS eslint rules, root: true
- `apps/api/src/main.ts` — NestJS bootstrap
- `apps/api/src/app.module.ts`
- `apps/api/src/app.controller.ts`
- `apps/api/src/app.controller.spec.ts`
- `apps/api/src/app.service.ts`
- `apps/api/test/app.e2e-spec.ts`
- `apps/api/test/jest-e2e.json`
- `apps/web/package.json` — Next.js 15 deps + scripts
- `apps/web/tsconfig.json` — Next.js config, extends base
- `apps/web/next.config.ts`
- `apps/web/.eslintrc.js` — next/core-web-vitals + next/typescript
- `apps/web/public/.gitkeep`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`

---

## Task 1: Root configuration files

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.eslintrc.js`
- Create: `.prettierrc`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "video-meetings",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "test": "turbo run test",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "turbo": "^2.0.0",
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
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
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create root `.eslintrc.js`**

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

- [ ] **Step 5: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "endOfLine": "lf"
}
```

- [ ] **Step 6: Create `.gitignore`**

```
# Dependencies
node_modules

# Build outputs
dist
.next
.turbo

# Coverage
coverage

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode
.idea
*.swp
```

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "chore: initialize monorepo root configuration"
```

---

## Task 2: Shared package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@video-meetings/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

Note: `main` points to the TypeScript source directly. Both apps import via `tsconfig.json` paths so no compilation step is needed at dev time.

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "moduleResolution": "node",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/index.ts`**

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

- [ ] **Step 4: Commit**

```bash
git add packages/
git commit -m "feat: add shared types package"
```

---

## Task 3: NestJS application (apps/api)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/.eslintrc.js`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/app.controller.ts`
- Create: `apps/api/src/app.controller.spec.ts`
- Create: `apps/api/src/app.service.ts`
- Create: `apps/api/test/app.e2e-spec.ts`
- Create: `apps/api/test/jest-e2e.json`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@video-meetings/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@video-meetings/shared": "*",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.2",
    "@types/node": "^20.3.1",
    "@types/supertest": "^6.0.0",
    "@typescript-eslint/eslint-plugin": "*",
    "@typescript-eslint/parser": "*",
    "eslint": "*",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "jest": "^29.5.1",
    "prettier": "*",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.0",
    "ts-loader": "^9.4.3",
    "ts-node": "^10.9.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "*"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "paths": {
      "@video-meetings/shared": ["../../packages/shared/src"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 4: Create `apps/api/.eslintrc.js`**

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

- [ ] **Step 5: Create `apps/api/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
  console.log(`API running on: ${await app.getUrl()}`);
}

bootstrap();
```

- [ ] **Step 6: Create `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 7: Create `apps/api/src/app.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import type { ApiResponse } from '@video-meetings/shared';

@Injectable()
export class AppService {
  getHealth(): ApiResponse<{ status: string }> {
    return {
      success: true,
      message: 'OK',
      data: { status: 'healthy' },
    };
  }
}
```

- [ ] **Step 8: Create `apps/api/src/app.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { ApiResponse } from '@video-meetings/shared';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): ApiResponse<{ status: string }> {
    return this.appService.getHealth();
  }
}
```

- [ ] **Step 9: Create `apps/api/src/app.controller.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return a healthy response', () => {
      const result = appController.getHealth();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('healthy');
    });
  });
});
```

- [ ] **Step 10: Create `apps/api/test/app.e2e-spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('healthy');
      });
  });
});
```

- [ ] **Step 11: Create `apps/api/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/
git commit -m "feat: scaffold NestJS API application"
```

---

## Task 4: Next.js application (apps/web)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/.eslintrc.js`
- Create: `apps/web/public/.gitkeep`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@video-meetings/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "clean": "rm -rf .next"
  },
  "dependencies": {
    "@video-meetings/shared": "*",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "*",
    "eslint-config-next": "^15.0.0",
    "prettier": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "lib": ["dom", "dom.iterable", "ES2022"],
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@video-meetings/shared": ["../../packages/shared/src"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@video-meetings/shared'],
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/web/.eslintrc.js`**

```js
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

- [ ] **Step 5: Create `apps/web/public/.gitkeep`**

Empty file, just to keep the `public/` directory tracked by git:

```
(empty file)
```

- [ ] **Step 6: Create `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Video Meetings',
  description: 'Video meetings application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `apps/web/src/app/page.tsx`**

```tsx
import type { ApiResponse } from '@video-meetings/shared';

const placeholderResponse: ApiResponse<string> = {
  success: true,
  message: 'Welcome',
  data: 'Video Meetings',
};

export default function Home() {
  return (
    <main>
      <h1>{placeholderResponse.data}</h1>
      <p>Monorepo is up and running.</p>
    </main>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold Next.js web application"
```

---

## Task 5: Install dependencies and verify

- [ ] **Step 1: Install all dependencies from the repo root**

```bash
npm install
```

Expected: npm resolves workspaces, creates a single `node_modules` at root, symlinks `@video-meetings/shared` → `packages/shared`.

- [ ] **Step 2: Verify shared package is linked**

```bash
ls node_modules/@video-meetings/shared
```

Expected: symlink exists pointing to `packages/shared`.

- [ ] **Step 3: Run lint on all packages**

```bash
npm run lint
```

Expected: Turborepo runs `lint` in all three packages in parallel. No errors. If ESLint reports unused variable warnings in generated Next.js code, ignore them for now — they come from the framework's own types.

- [ ] **Step 4: Run NestJS unit tests**

```bash
npm run test
```

Expected: Turborepo runs `test` in `apps/api`. Output includes:
```
PASS src/app.controller.spec.ts
  AppController
    getHealth
      ✓ should return a healthy response
Tests: 1 passed
```

- [ ] **Step 5: Run build on all packages**

```bash
npm run build
```

Expected: Turborepo builds `packages/shared` first (no output, noEmit), then `apps/api` (`dist/` created) and `apps/web` (`.next/` created) in parallel.

- [ ] **Step 6: Verify NestJS starts**

In a separate terminal:
```bash
cd apps/api && node dist/main.js
```

Expected: `API running on: http://[::1]:3001`

Then test the health endpoint:
```bash
curl http://localhost:3001/health
```

Expected:
```json
{"success":true,"message":"OK","data":{"status":"healthy"}}
```

Stop the process with `Ctrl+C`.

- [ ] **Step 7: Final commit**

```bash
git add package-lock.json
git commit -m "chore: install dependencies and verify monorepo setup"
```

---

## Self-Review Notes

- All spec requirements covered: workspaces ✓, Turborepo ✓, Next.js 15 ✓, NestJS 11 ✓, shared package ✓, ESLint ✓, Prettier ✓, scripts (dev/build/lint/test/clean) ✓
- `@video-meetings/shared` used in both `apps/api/src/app.service.ts` and `apps/web/src/app/page.tsx` — types are consistent (`ApiResponse<T>`)
- `paths` alias in both `apps/api/tsconfig.json` and `apps/web/tsconfig.json` points to `../../packages/shared/src`
- NestJS app runs on port 3001 to avoid conflict with Next.js (port 3000)
- `emitDecoratorMetadata: true` and `experimentalDecorators: true` only in NestJS tsconfig, not in base
