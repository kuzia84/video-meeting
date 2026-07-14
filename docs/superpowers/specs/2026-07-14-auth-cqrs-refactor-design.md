# Auth CQRS Refactor — Design

## Goal

Rewrite the existing register/login flow in `apps/api` to use the CQRS pattern via `@nestjs/cqrs`, with **no change to external behavior**. Every HTTP contract (routes, status codes, request/response shapes, error semantics) stays identical; the existing e2e suite is the safety net and must stay green throughout.

## Motivation & scope

This is a pure internal refactor — a structural change from a single `AuthService` to command handlers dispatched through a `CommandBus`. No new endpoints, no behavior changes, no schema changes.

In scope: introduce `@nestjs/cqrs`, split `register`/`login` into commands + handlers, extract token issuance into a `TokenService`, delete `AuthService`.

Out of scope: domain events (deferred — nothing consumes them yet, YAGNI), queries (login is modeled as a Command), refresh tokens, any of the previously-logged follow-ups (timing side-channel, email normalization, `@MaxLength(72)`, moving `AuthResult` to shared).

## Decisions

- **Library:** `@nestjs/cqrs` (official NestJS package: `CommandBus`, `@CommandHandler`, `ICommandHandler`).
- **Login is a Command** (not a Query). Register and login are both imperative use-cases, kept symmetric; login is naturally extensible with command-side effects later (audit log, last-login timestamp, failed-attempt counters).
- **No domain events.** `EventBus`/`UserRegisteredEvent` deferred until a consumer exists.
- **Shared token issuance → `TokenService`.** Both handlers need to sign a JWT and build the `AuthResult`; this is extracted from the old private `AuthService.buildAuthResult` into a single injectable provider rather than duplicated.
- **`AuthService` is deleted.** Its logic moves into the two handlers; there is no service layer between the handlers and Prisma.
- **Tests:** the existing `test/auth.e2e-spec.ts` (8 cases) is unchanged and is the refactor's regression gate. No new tests are added (behavior is already fully covered).

## File structure

Under `apps/api/src/auth/`:

```
auth.controller.ts            (modified) injects CommandBus; dispatches commands; wraps in ApiResponse
auth.module.ts                (modified) imports CqrsModule + JwtModule; providers = handlers + TokenService
token.service.ts              (new)      issue(id, email): AuthResult — signs { sub, email }
commands/
  register.command.ts         (new)      class RegisterCommand(email, password)
  login.command.ts            (new)      class LoginCommand(email, password)
  handlers/
    register.handler.ts       (new)      @CommandHandler(RegisterCommand)
    login.handler.ts          (new)      @CommandHandler(LoginCommand)
dto/
  register-user.dto.ts        (unchanged)
  login.dto.ts                (unchanged)
auth.types.ts                 (unchanged) AuthResult
auth.service.ts               (DELETED)
```

## Component contracts

### Commands (plain value objects)

```ts
// commands/register.command.ts
export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
// commands/login.command.ts
export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
```

### TokenService

```ts
// token.service.ts
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}
  issue(id: string, email: string): AuthResult {
    const accessToken = this.jwtService.sign({ sub: id, email });
    return { accessToken, user: { id, email } };
  }
}
```

### Handlers

- `RegisterHandler` — `@CommandHandler(RegisterCommand)`, `implements ICommandHandler<RegisterCommand, AuthResult>`. Injects `PrismaService` + `TokenService`. Logic identical to today's `AuthService.register`: `findUnique` pre-check → `ConflictException('Email already registered')`; `bcrypt.hash` (10 rounds); `create` wrapped in try/catch mapping Prisma `P2002` → `ConflictException`; return `tokenService.issue(user.id, user.email)`.
- `LoginHandler` — `@CommandHandler(LoginCommand)`, `implements ICommandHandler<LoginCommand, AuthResult>`. Injects `PrismaService` + `TokenService`. Logic identical to today's `AuthService.login`: `findUnique`; if missing → `UnauthorizedException('Invalid credentials')`; `bcrypt.compare`; if mismatch → same `UnauthorizedException` (identical message, no user enumeration); return `tokenService.issue(user.id, user.email)`.

### Controller

```ts
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

`register` keeps the default 201; `login` keeps `@HttpCode(200)`. The `ApiResponse` wrapping is unchanged.

### Module

```ts
@Module({
  imports: [
    CqrsModule,
    JwtModule.registerAsync({
      /* unchanged: secret/TTL from ConfigService, fail-fast on missing JWT_SECRET */
    }),
  ],
  controllers: [AuthController],
  providers: [RegisterHandler, LoginHandler, TokenService],
})
export class AuthModule {}
```

## Error handling / behavior preservation

`CommandBus.execute` awaits the handler and rethrows any exception it throws, so `ConflictException` (409), `UnauthorizedException` (401), and DTO `ValidationPipe` failures (400) reach Nest's exception layer exactly as they do today. The global `ValidationPipe` still validates DTOs before the controller dispatches. Net HTTP behavior is byte-for-byte identical.

## Dependencies

Add to `apps/api` dependencies: `@nestjs/cqrs` (v11, matching NestJS 11).

## Testing strategy

- `test/auth.e2e-spec.ts` is **not modified**. All 8 auth cases (+ the health case) must pass after the refactor — this is the regression gate.
- Verification per the plan: run the e2e suite (register 201/409/400/400, login 200/401/401, token `sub` payload) → 9/9 green; `npm run build` clean; `npm run lint` clean.

## Documentation updates

Update `apps/api/CLAUDE.md`: the Auth module now uses CQRS (`@nestjs/cqrs`) — controller dispatches `RegisterCommand`/`LoginCommand` via `CommandBus` to handlers under `src/auth/commands/handlers/`; token issuance lives in `TokenService`; there is no `AuthService`. Note login is modeled as a Command (not a Query) and that domain events are intentionally deferred.
