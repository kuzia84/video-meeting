# Auth: Login & Registration — Design

## Goal

Add email/password registration and login to `apps/api`, each returning a JWT access token. Built test-first (TDD): the e2e test suite is written before the implementation and drives it.

## Scope

In scope: `POST /auth/register`, `POST /auth/login`, password hashing, JWT issuance, e2e test coverage.

Explicitly out of scope for this iteration: refresh tokens, email verification, password reset, rate limiting, logout/token revocation, RBAC/roles. These can follow as separate specs once the base flow exists.

## Data layer

**ORM: Prisma.** First ORM/driver choice in the repo — chosen for the fast setup and type-safe client for a simple `User` model, and because Prisma's migration workflow is easy to run against the already-running `docker-compose` Postgres.

`apps/api/prisma/schema.prisma`:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

`apps/api/src/prisma/prisma.module.ts` — `@Global()` module exporting `PrismaService`.
`apps/api/src/prisma/prisma.service.ts` — extends `PrismaClient`, implements `OnModuleInit` (`this.$connect()`).

## Auth module

`apps/api/src/auth/`:

- `auth.module.ts` — imports `PrismaModule`, `ConfigModule`, and `JwtModule.registerAsync` (secret/TTL from `ConfigService`); registers `AuthController` + `AuthService`.
- `auth.controller.ts` — `POST /auth/register`, `POST /auth/login`. Each handler calls the service and manually wraps the result in `ApiResponse<T>` (`{ data, message, success: true }`), matching the existing pattern in `AppService` for `/health`. This is a deliberate, scoped choice — no global response interceptor is introduced in this change.
- `auth.service.ts` — `register(dto)`: checks for existing email (`ConflictException` → 409 if found), hashes password with bcrypt, creates the `User` row, signs and returns a JWT. `login(dto)`: looks up user by email, compares password hash with bcrypt; on any mismatch (email not found OR wrong password) throws `UnauthorizedException` → 401, using the same message either way so the API doesn't reveal whether an email is registered.
- `dto/register-user.dto.ts`, `dto/login.dto.ts` — `class-validator` DTOs: `email` (`@IsEmail()`), `password` (`@IsString() @MinLength(8)`).

Error responses (400/401/409) use Nest's default exception format (`{ statusCode, message, error }`) — they are not wrapped in `ApiResponse<T>`, consistent with the "wrap manually in controller" choice above (only success responses are wrapped).

`apps/api/src/main.ts` gains `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))` — required for the DTOs to actually reject invalid input with 400; this pipe doesn't currently exist in the app.

### JWT payload & token shape

Signed payload: `{ sub: user.id, email: user.email }`. Response shape for both endpoints:

```ts
{
  accessToken: string;
  user: {
    id: string;
    email: string;
  }
}
```

### Config

New env vars, read via `@nestjs/config` from `apps/api/.env` (new file, gitignored like the existing root `.env`; `apps/api/.env.example` is committed):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_meetings
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1h
```

`DATABASE_URL` mirrors the `POSTGRES_*` defaults already in the root `docker-compose.yml` / `.env.example`.

## New dependencies (`apps/api`)

- `dependencies`: `@nestjs/config`, `@nestjs/jwt`, `@prisma/client`, `bcrypt`, `class-validator`, `class-transformer`
- `devDependencies`: `prisma`, `@types/bcrypt`

## Testing strategy (TDD, e2e-first)

`apps/api/test/auth.e2e-spec.ts`, following the existing `app.e2e-spec.ts` pattern (`Test.createTestingModule({ imports: [AppModule] })` + `supertest`), against the real Postgres started by the root `docker-compose.yml` (no separate test database/schema for this iteration — the DB must be running via `npm run db:up` before `npm run test:e2e`, and Prisma migrations applied via `npx prisma migrate dev`).

- `beforeAll`: build `AppModule`, resolve `PrismaService` from the test module.
- `beforeEach`: `prisma.user.deleteMany()` for a clean table.
- `afterAll`: `app.close()`.

Cases:

1. **Register (happy path)** — valid email+password → `201`; body has non-empty `accessToken` and `user.{id,email}`; the row in Postgres has a `passwordHash` that is not the plaintext password.
2. **Register — duplicate email** — registering the same email twice → second call is `409`.
3. **Register — invalid email** → `400`.
4. **Register — password under 8 chars** → `400`.
5. **Login (happy path)** — previously registered user logs in with correct credentials → `200`, `accessToken` + `user`.
6. **Login — wrong password** → `401`.
7. **Login — unknown email** → `401` (not `404`, to avoid leaking account existence).
8. **Token validity** — a token returned by login/register decodes via `JwtService.verify` and contains `sub` equal to the user's id.

These tests are written first and are expected to fail (no `/auth` routes exist yet) before the implementation is written to make them pass.

## Documentation updates

Once implemented: update `apps/api/CLAUDE.md` (new module, new env vars, Prisma workflow, `ValidationPipe` addition) and the root `CLAUDE.md` if the Postgres/docker-compose section needs updating to mention the `User` table now living there.
