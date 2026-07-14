# Auth: Login & Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /auth/register` and `POST /auth/login` to `apps/api`, each returning a JWT access token plus minimal user data, built test-first.

**Architecture:** A new `AuthModule` (controller + service) owns the two endpoints. A global `PrismaModule` provides DB access to a `User` table in the existing docker-compose Postgres. Passwords are bcrypt-hashed; JWTs are signed by `@nestjs/jwt` with secret/TTL from env. Success responses are manually wrapped in `ApiResponse<T>` in the controller (matching the existing `/health` pattern); error responses use Nest's default exception format.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, bcrypt, `@nestjs/jwt`, `@nestjs/config`, `class-validator`, Jest + supertest (e2e).

## Global Constraints

- NestJS 11; API runs on port 3001 (unchanged).
- Success responses use `ApiResponse<T>` from `@video-meetings/shared` (`{ success, message, data }`).
- Error responses (400/401/409) use Nest's default exception shape (`{ statusCode, message, error }`) — NOT wrapped in `ApiResponse`.
- Password minimum length: 8 characters (`@MinLength(8)`).
- Password hashing: bcrypt.
- Both login failures (unknown email, wrong password) return `401` with the **same** message `Invalid credentials` — never reveal whether an email exists.
- `POST /auth/register` returns `201`; `POST /auth/login` returns `200`.
- JWT signed payload: `{ sub: user.id, email: user.email }`; TTL default `1h`.
- Response `data` shape for both endpoints: `{ accessToken: string; user: { id: string; email: string } }`.
- The docker-compose Postgres must be running (`npm run db:up` from repo root) for migrations and e2e tests.

---

### Task 1: Foundation — dependencies, Prisma, config, validation pipe

**Files:**

- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env` (gitignored — the root `.gitignore` `.env` rule matches it), `apps/api/.env.example` (committed)
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts:1-11`
- Modify: `apps/api/package.json` (dependencies — done by `npm install`)

**Interfaces:**

- Produces: `PrismaService` (extends `PrismaClient`, so `prisma.user.findUnique/create/deleteMany` are available); `PrismaModule` (`@Global`, exports `PrismaService`). Env vars `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` available via `process.env` / `ConfigService`.

- [ ] **Step 1: Install runtime dependencies**

Run from repo root:

```bash
npm install @nestjs/config @nestjs/jwt @prisma/client bcrypt class-validator class-transformer -w @video-meetings/api
```

- [ ] **Step 2: Install dev dependencies**

Run from repo root:

```bash
npm install -D prisma @types/bcrypt -w @video-meetings/api
```

Note: `bcrypt` is a native module. If it fails to build on this Windows machine, install `bcryptjs` instead (`npm install bcryptjs -w @video-meetings/api` + `npm install -D @types/bcryptjs -w @video-meetings/api`) and change the import in later tasks from `import * as bcrypt from 'bcrypt'` to `import * as bcrypt from 'bcryptjs'`. The API (`bcrypt.hash`, `bcrypt.compare`) is identical.

- [ ] **Step 3: Create the Prisma schema**

Create `apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 4: Create env files**

Create `apps/api/.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_meetings
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1h
```

Create `apps/api/.env.example` (identical content — it is the committed template):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_meetings
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1h
```

- [ ] **Step 5: Ensure the database is running**

Run from repo root:

```bash
npm run db:up
```

Expected: `Container video-meetings-postgres  Started` (or already running).

- [ ] **Step 6: Create and apply the initial migration**

Run from `apps/api`:

```bash
npx prisma migrate dev --name init
```

Expected: creates `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, applies it, and prints `Your database is now in sync with your schema.` plus `Generated Prisma Client`.

- [ ] **Step 7: Create the Prisma service**

Create `apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 8: Create the Prisma module**

Create `apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 9: Wire ConfigModule + PrismaModule into AppModule**

Replace `apps/api/src/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 10: Add the global ValidationPipe to main.ts**

Replace `apps/api/src/main.ts` with:

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
  console.log(`API running on: ${await app.getUrl()}`);
}

bootstrap();
```

- [ ] **Step 11: Verify it builds and boots**

Run from `apps/api`:

```bash
npm run build
```

Expected: exits 0, no TypeScript errors (confirms `@prisma/client` generated and all imports resolve).

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts apps/api/src/main.ts apps/api/.env.example apps/api/package.json package-lock.json
git commit -m "feat(api): add prisma, config, and validation pipe foundation"
```

Note: `apps/api/.env` is intentionally NOT staged (gitignored). Confirm `git status` does not list it before committing.

---

### Task 2: Write the failing e2e test suite (RED)

**Files:**

- Create: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**

- Consumes: `AppModule`, `PrismaService` (from Task 1). Hits HTTP routes `/auth/register` and `/auth/login` that do not exist yet.
- Produces: the full behavioral spec that Tasks 3–4 must satisfy.

- [ ] **Step 1: Write the e2e test**

Create `apps/api/test/auth.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const validCredentials = {
    email: 'user@example.com',
    password: 'password123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns a JWT + user data', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validCredentials)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.accessToken.length).toBeGreaterThan(0);
      expect(res.body.data.user.email).toBe(validCredentials.email);
      expect(typeof res.body.data.user.id).toBe('string');

      const stored = await prisma.user.findUnique({
        where: { email: validCredentials.email },
      });
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).not.toBe(validCredentials.password);
    });

    it('rejects a duplicate email with 409', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(validCredentials).expect(201);
      await request(app.getHttpServer()).post('/auth/register').send(validCredentials).expect(409);
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('rejects a password shorter than 8 chars with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'short' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register').send(validCredentials).expect(201);
    });

    it('returns a JWT + user data for correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(validCredentials)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.user.email).toBe(validCredentials.email);
    });

    it('rejects a wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: validCredentials.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('rejects an unknown email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
    });
  });

  it('issues a token whose payload sub matches the user id', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(validCredentials)
      .expect(201);

    const payload = decodeJwtPayload(res.body.data.accessToken);
    expect(payload.sub).toBe(res.body.data.user.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Ensure the DB is running (`npm run db:up` from repo root), then run from `apps/api`:

```bash
npx jest --config ./test/jest-e2e.json auth.e2e-spec
```

Expected: FAIL — the register/login requests return `404` (routes don't exist), so every `.expect(201)` / `.expect(200)` assertion fails. This is the intended RED state. (The suite must _run_ — if it errors on a missing `PrismaService` import or a DB connection failure instead of asserting, fix that before proceeding; those are environment problems, not the expected red.)

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/api/test/auth.e2e-spec.ts
git commit -m "test(api): add failing e2e tests for auth register/login"
```

---

### Task 3: Implement registration (GREEN for register cases)

**Files:**

- Create: `apps/api/src/auth/auth.types.ts`
- Create: `apps/api/src/auth/dto/register-user.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `PrismaService` (Task 1), `ConfigService`/`JwtModule` env vars (Task 1).
- Produces: `AuthResult` interface (`{ accessToken: string; user: { id: string; email: string } }`); `AuthService.register(dto: RegisterUserDto): Promise<AuthResult>`; `AuthService.buildAuthResult(id, email)` (private helper reused by login in Task 4); `AuthModule`; `AuthController` with `register` handler. Task 4 will add `login` to `AuthService` and `AuthController`.

- [ ] **Step 1: Create the AuthResult type**

Create `apps/api/src/auth/auth.types.ts`:

```ts
export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}
```

- [ ] **Step 2: Create the register DTO**

Create `apps/api/src/auth/dto/register-user.dto.ts`:

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 3: Create the AuthService with register**

Create `apps/api/src/auth/auth.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResult } from './auth.types';
import { RegisterUserDto } from './dto/register-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterUserDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });

    return this.buildAuthResult(user.id, user.email);
  }

  private buildAuthResult(id: string, email: string): AuthResult {
    const accessToken = this.jwtService.sign({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
```

- [ ] **Step 4: Create the AuthController with register**

Create `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthService } from './auth.service';
import { AuthResult } from './auth.types';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.authService.register(dto);
    return { success: true, message: 'Registered', data: result };
  }
}
```

- [ ] **Step 5: Create the AuthModule**

Create `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '1h'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 6: Wire AuthModule into AppModule**

Replace `apps/api/src/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 7: Run the register tests to verify they pass**

Ensure the DB is running, then from `apps/api`:

```bash
npx jest --config ./test/jest-e2e.json auth.e2e-spec -t "POST /auth/register"
```

Expected: PASS — all four register cases (happy path, duplicate 409, invalid email 400, short password 400) pass. The login cases and the token-payload case are not run by this `-t` filter and remain unimplemented until Task 4.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts
git commit -m "feat(api): implement auth registration endpoint"
```

---

### Task 4: Implement login (GREEN for full suite)

**Files:**

- Create: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`

**Interfaces:**

- Consumes: `AuthService.buildAuthResult` (Task 3), `PrismaService`, `JwtService`.
- Produces: `AuthService.login(dto: LoginDto): Promise<AuthResult>`; `AuthController.login` handler (`@HttpCode(200)`).

- [ ] **Step 1: Create the login DTO**

Create `apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

- [ ] **Step 2: Add login to the AuthService**

Replace `apps/api/src/auth/auth.service.ts` with:

```ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResult } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterUserDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });

    return this.buildAuthResult(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResult(user.id, user.email);
  }

  private buildAuthResult(id: string, email: string): AuthResult {
    const accessToken = this.jwtService.sign({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
```

- [ ] **Step 3: Add the login handler to the AuthController**

Replace `apps/api/src/auth/auth.controller.ts` with:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthService } from './auth.service';
import { AuthResult } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.authService.register(dto);
    return { success: true, message: 'Registered', data: result };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.authService.login(dto);
    return { success: true, message: 'Logged in', data: result };
  }
}
```

- [ ] **Step 4: Run the full e2e suite to verify all pass**

Ensure the DB is running, then from `apps/api`:

```bash
npx jest --config ./test/jest-e2e.json auth.e2e-spec
```

Expected: PASS — all 8 tests green (4 register, 3 login, 1 token-payload).

- [ ] **Step 5: Run the whole e2e config to confirm no regressions**

From `apps/api`:

```bash
npm run test:e2e
```

Expected: PASS — both `app.e2e-spec.ts` (health) and `auth.e2e-spec.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): implement auth login endpoint"
```

---

### Task 5: Update documentation

**Files:**

- Modify: `apps/api/CLAUDE.md`
- Modify: `CLAUDE.md` (repo root)

**Interfaces:**

- Consumes: nothing. Documents the architecture added in Tasks 1–4.

- [ ] **Step 1: Update apps/api/CLAUDE.md**

In `apps/api/CLAUDE.md`, under the `## Architecture` section, add bullets describing:

- The `AuthModule` (`src/auth/`) with `POST /auth/register` (201) and `POST /auth/login` (200), returning `ApiResponse<{ accessToken, user }>`; errors use Nest's default exception shape.
- The global `PrismaModule`/`PrismaService` (`src/prisma/`) and the `User` model in `prisma/schema.prisma`; migrations via `npx prisma migrate dev`, and the DB must be running (`npm run db:up`) for e2e tests.
- The global `ValidationPipe` (`whitelist`, `transform`) added in `main.ts`, and `ConfigModule.forRoot({ isGlobal: true })` reading `apps/api/.env` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`; see `.env.example`).

Add to the `## Commands` section:

```bash
npm run test:e2e         # requires `npm run db:up` (Postgres) running
npx prisma migrate dev   # apply/create migrations against the running Postgres
```

- [ ] **Step 2: Update root CLAUDE.md**

In the root `CLAUDE.md`, in the "Local Postgres via Docker Compose" architecture bullet, replace the "No app is wired up to this database yet" sentence with a note that `apps/api` now connects via Prisma (a `User` table exists; migrations live in `apps/api/prisma/migrations`), and that auth (`POST /auth/register`, `POST /auth/login`) is the first consumer. Update the "Design docs" section to reference `docs/superpowers/specs/2026-07-14-auth-login-register-design.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/CLAUDE.md CLAUDE.md
git commit -m "docs: document auth module and prisma setup"
```

---

## Self-Review

**Spec coverage:**

- Prisma + `User` model → Task 1 (steps 3, 6). ✓
- bcrypt hashing → Task 3 (register), Task 4 (login compare). ✓
- `@nestjs/jwt`, secret/TTL from env, payload `{ sub, email }` → Task 3 (`buildAuthResult`), Task 1 (env), Task 3 (JwtModule). ✓
- `POST /auth/register` 201 / duplicate 409 / invalid email 400 / short password 400 → Task 2 cases + Task 3. ✓
- `POST /auth/login` 200 / wrong password 401 / unknown email 401 (same message) → Task 2 cases + Task 4. ✓
- Success wrapped in `ApiResponse<T>`, errors default shape → Task 3/4 controllers. ✓
- Response shape `{ accessToken, user: { id, email } }` → `AuthResult` (Task 3). ✓
- `ValidationPipe` in `main.ts` + mirrored in e2e setup → Task 1 step 10, Task 2 beforeAll. ✓
- e2e-first / RED before GREEN → Task 2 runs before Tasks 3–4. ✓
- Token-validity (decode `sub`) → Task 2 final case. ✓
- Env in `apps/api/.env` via `@nestjs/config`, `.env.example` committed → Task 1 steps 4, 9. ✓
- Docs updates → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full file/content; commands have expected output. ✓

**Type consistency:** `AuthResult` shape identical across `auth.types.ts`, service, controller. `buildAuthResult(id, email)` defined in Task 3, reused in Task 4. `RegisterUserDto`/`LoginDto` names consistent between DTO files, service, controller. `PrismaService` methods (`findUnique`, `create`, `deleteMany`) are standard Prisma Client on the `User` delegate. ✓
