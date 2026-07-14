# Auth CQRS Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/api` register/login from a single `AuthService` to CQRS command handlers dispatched via `@nestjs/cqrs`'s `CommandBus`, with zero change to HTTP behavior.

**Architecture:** The controller dispatches `RegisterCommand`/`LoginCommand` through `CommandBus`. Two `@CommandHandler` classes hold the logic (previously in `AuthService`). Shared JWT issuance moves into a `TokenService`. `AuthService` is deleted. The existing e2e suite is the regression gate.

**Tech Stack:** NestJS 11, `@nestjs/cqrs` v11, Prisma, bcrypt, `@nestjs/jwt`.

## Global Constraints

- Behavior must NOT change. Every HTTP contract is identical: `POST /auth/register` → 201, `POST /auth/login` → 200 (`@HttpCode(200)`); success wrapped in `ApiResponse<T>` from `@video-meetings/shared` (`{ success, message, data }`); errors use Nest default exception shape.
- `POST /auth/register`: duplicate email → 409 (`ConflictException`), invalid email / password < 8 → 400. `POST /auth/login`: wrong password → 401, unknown email → 401, both with the SAME message `Invalid credentials` (no user enumeration).
- JWT payload `{ sub: user.id, email: user.email }`; response `data` shape `{ accessToken, user: { id, email } }` (the `AuthResult` type).
- bcrypt hashing, 10 rounds. Prisma `P2002` on `create` must map to 409.
- `test/auth.e2e-spec.ts` is NOT modified — it is the regression safety net. No new tests, no domain events, no queries.
- The docker-compose Postgres must be running (`npm run db:up` from repo root) for e2e.
- Login is modeled as a Command (not a Query).

---

### Task 1: Refactor auth to CQRS command handlers

**Files:**

- Modify: `apps/api/package.json` (add `@nestjs/cqrs` — via `npm install`)
- Create: `apps/api/src/auth/commands/register.command.ts`
- Create: `apps/api/src/auth/commands/login.command.ts`
- Create: `apps/api/src/auth/token.service.ts`
- Create: `apps/api/src/auth/commands/handlers/register.handler.ts`
- Create: `apps/api/src/auth/commands/handlers/login.handler.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Delete: `apps/api/src/auth/auth.service.ts`
- Regression gate (do NOT modify): `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**

- Consumes: `PrismaService` (`apps/api/src/prisma/prisma.service.ts`), `JwtService` (from `JwtModule`), `AuthResult` (`apps/api/src/auth/auth.types.ts`), `RegisterUserDto`/`LoginDto` (unchanged), `ApiResponse<T>` from `@video-meetings/shared`.
- Produces: `RegisterCommand(email, password)`, `LoginCommand(email, password)`; `TokenService.issue(id, email): AuthResult`; `RegisterHandler`/`LoginHandler` (`ICommandHandler<Command, AuthResult>`); `AuthController` dispatching via `CommandBus`.

This is a behavior-preserving refactor. The e2e suite already exists and passes; it stays green throughout. There is no new "failing test" step — the existing suite is the gate (run it before and after).

- [ ] **Step 1: Confirm the baseline is green**

Ensure DB is up (`npm run db:up` from repo root), then from `apps/api`:

```bash
npx jest --config ./test/jest-e2e.json
```

Expected: PASS — `Tests: 9 passed, 9 total` (8 auth + 1 health). This is the baseline the refactor must preserve.

- [ ] **Step 2: Install @nestjs/cqrs**

From repo root:

```bash
npm install @nestjs/cqrs -w @video-meetings/api
```

Expected: adds `@nestjs/cqrs` to `apps/api/package.json` dependencies.

- [ ] **Step 3: Create the RegisterCommand**

Create `apps/api/src/auth/commands/register.command.ts`:

```ts
export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
```

- [ ] **Step 4: Create the LoginCommand**

Create `apps/api/src/auth/commands/login.command.ts`:

```ts
export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
```

- [ ] **Step 5: Create the TokenService**

Create `apps/api/src/auth/token.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthResult } from './auth.types';

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(id: string, email: string): AuthResult {
    const accessToken = this.jwtService.sign({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
```

- [ ] **Step 6: Create the RegisterHandler**

Create `apps/api/src/auth/commands/handlers/register.handler.ts` (note the relative import depth: handlers live three levels below `src/`):

```ts
import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../auth.types';
import { TokenService } from '../../token.service';
import { RegisterCommand } from '../register.command';

const BCRYPT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, AuthResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: command.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(command.password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { email: command.email, passwordHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    return this.tokenService.issue(user.id, user.email);
  }
}
```

- [ ] **Step 7: Create the LoginHandler**

Create `apps/api/src/auth/commands/handlers/login.handler.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../auth.types';
import { TokenService } from '../../token.service';
import { LoginCommand } from '../login.command';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(command.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.tokenService.issue(user.id, user.email);
  }
}
```

- [ ] **Step 8: Rewrite the AuthController to dispatch commands**

Replace `apps/api/src/auth/auth.controller.ts` with:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { ApiResponse } from '@video-meetings/shared';
import { AuthResult } from './auth.types';
import { LoginCommand } from './commands/login.command';
import { RegisterCommand } from './commands/register.command';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  async register(@Body() dto: RegisterUserDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.commandBus.execute<RegisterCommand, AuthResult>(
      new RegisterCommand(dto.email, dto.password),
    );
    return { success: true, message: 'Registered', data: result };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<ApiResponse<AuthResult>> {
    const result = await this.commandBus.execute<LoginCommand, AuthResult>(
      new LoginCommand(dto.email, dto.password),
    );
    return { success: true, message: 'Logged in', data: result };
  }
}
```

- [ ] **Step 9: Rewrite the AuthModule (CqrsModule + handlers + TokenService, drop AuthService)**

Replace `apps/api/src/auth/auth.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { LoginHandler } from './commands/handlers/login.handler';
import { RegisterHandler } from './commands/handlers/register.handler';
import { TokenService } from './token.service';

@Module({
  imports: [
    CqrsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRES_IN', '1h') as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [RegisterHandler, LoginHandler, TokenService],
})
export class AuthModule {}
```

- [ ] **Step 10: Delete the old AuthService**

```bash
git rm apps/api/src/auth/auth.service.ts
```

Confirm nothing else imports it:

```bash
grep -rn "auth.service" apps/api/src || echo "no references — good"
```

Expected: `no references — good`.

- [ ] **Step 11: Run the e2e suite — must still be green**

From `apps/api` (DB up):

```bash
npx jest --config ./test/jest-e2e.json
```

Expected: PASS — `Tests: 9 passed, 9 total` (identical to the Step 1 baseline). If any auth case fails, the refactor changed behavior — fix the handler/controller, do NOT touch the test.

If `execute` throws an error like "No handler found for the command" — the handlers are not registered: confirm `RegisterHandler`/`LoginHandler` are in the `AuthModule` `providers` array and `CqrsModule` is in `imports`.

- [ ] **Step 12: Build and lint clean**

From `apps/api`:

```bash
npm run build
npm run lint
```

Expected: both exit 0, no errors.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/auth apps/api/package.json package-lock.json
git commit -m "refactor(api): rewrite auth register/login with CQRS"
```

(The `git rm` from Step 10 is already staged; `git add apps/api/src/auth` covers the new files.)

---

### Task 2: Update documentation

**Files:**

- Modify: `apps/api/CLAUDE.md`

**Interfaces:**

- Consumes: nothing. Documents the CQRS structure from Task 1.

- [ ] **Step 1: Update apps/api/CLAUDE.md**

In `apps/api/CLAUDE.md`, update the Auth description (Architecture section) to state:

- The Auth module uses CQRS via `@nestjs/cqrs`. `AuthController` dispatches `RegisterCommand` / `LoginCommand` through `CommandBus`; the logic lives in `@CommandHandler`s under `src/auth/commands/handlers/` (`RegisterHandler`, `LoginHandler`). There is no `AuthService`.
- JWT issuance is centralized in `TokenService` (`src/auth/token.service.ts`), injected by both handlers.
- `AuthModule` imports `CqrsModule` and registers the two handlers + `TokenService` as providers.
- Login is modeled as a Command (not a Query); domain events (`EventBus`) are intentionally deferred (no consumer yet).
- HTTP behavior is unchanged from the pre-CQRS version (same routes, status codes, `ApiResponse` shape, and error semantics) — the existing e2e suite covers it.

Keep it to concise architecture bullets matching the file's existing style. Reference the design doc `docs/superpowers/specs/2026-07-14-auth-cqrs-refactor-design.md`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/CLAUDE.md
git commit -m "docs: document auth CQRS structure"
```

---

## Self-Review

**Spec coverage:**

- `@nestjs/cqrs` dependency → Task 1 Step 2. ✓
- Commands (Register/Login) → Task 1 Steps 3–4. ✓
- TokenService (extracted `buildAuthResult`) → Task 1 Step 5. ✓
- Handlers with identical register/login logic (P2002→409, same 401 message) → Task 1 Steps 6–7. ✓
- Controller dispatches via CommandBus, keeps 201/200 + ApiResponse → Task 1 Step 8. ✓
- Module: CqrsModule + handlers + TokenService, JwtModule unchanged → Task 1 Step 9. ✓
- AuthService deleted → Task 1 Step 10. ✓
- Behavior preserved / e2e green → Task 1 Steps 1, 11. ✓
- Build + lint clean → Task 1 Step 12. ✓
- Docs → Task 2. ✓
- No new tests / events / queries → honored (no such steps). ✓

**Placeholder scan:** No TBD/TODO; every code step has full file content; commands have expected output. ✓

**Type consistency:** `AuthResult` is the single response type across `TokenService.issue`, both handlers (`ICommandHandler<Command, AuthResult>`), and the controller. `RegisterCommand`/`LoginCommand` constructor shape `(email, password)` is consistent between the command files, the handlers' `command.email`/`command.password` access, and the controller's `new XCommand(dto.email, dto.password)`. Relative import depths verified: handlers at `src/auth/commands/handlers/` reach `src/prisma/` via `../../../`, `src/auth/*` via `../../`, and `src/auth/commands/*` via `../`. ✓
