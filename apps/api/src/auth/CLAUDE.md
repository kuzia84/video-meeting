# Auth module (`src/auth/`)

App-local detail for the Auth module. Parent: `apps/api/CLAUDE.md` (see it for CQRS conventions, bootstrap, shared-package resolution).

## Responsibility

Register / login / change-password, built on CQRS (`@nestjs/cqrs`). `AuthController` dispatches `RegisterCommand` / `LoginCommand` / `ChangePasswordCommand` into Auth's own `@CommandHandler`s.

## Routes

- `POST /auth/register` (201) — validates `RegisterUserDto`, returns `ApiResponse<{ accessToken, user: { id, email } }>`.
- `POST /auth/login` (200, `@HttpCode(200)`) — validates `LoginDto`, same response shape.
- `POST /auth/change-password` (204, `@UseGuards(JwtAuthGuard)`) — validates `ChangePasswordDto`, changes the signed-in user's own password; no token reissued (hence 204).

Register/login DTOs normalize email (trim + lowercase via `@Transform`).

## Key facts

- **Never touches the DB directly.** Dispatches to Users over the CQRS bus: register → `CreateUserCommand`; login → `GetUserByEmailQuery`; change-password → `GetUserByIdQuery` + `UpdateUserPasswordCommand`. `RegisterHandler` injects `CommandBus`, `LoginHandler` injects `QueryBus`, `ChangePasswordHandler` injects both — none inject `PrismaService`.
- **Password hashing + the login timing-attack dummy hash are the only crypto here.** `bcrypt` at `BCRYPT_ROUNDS` = 10 (`bcrypt.constants.ts`) for register/change-password; the login dummy hash uses a literal `10`. JWT issued by `TokenService` (`token.service.ts`), payload `{ sub, email }`.
- **Password rules are shared.** The `IsPassword()` decorator (`dto/password-rules.ts` = `IsString` + `MinLength(8)` + `MaxLength(72)`) is used by both `RegisterUserDto.password` and `ChangePasswordDto.newPassword`, so registration and change-password can't drift. `currentPassword` is a plain non-empty string.
- **Exports for other modules.** `AuthModule` provides **and exports** `JwtAuthGuard` (`guards/`) and also exports `JwtModule` (what lets consumers verify tokens). The `@CurrentUser()` param decorator (`decorators/`) and the `AuthUser` type (`auth.types.ts`) are plain exported symbols — imported directly, not via DI.

## Error semantics

- Login: 401 `Invalid credentials` — **same message** for unknown email and wrong password (no enumeration).
- Register: 409 duplicate email — raised by Users' `CreateUserHandler` (message `Этот email уже зарегистрирован`, `field: 'email'`), propagated over the bus, not thrown here.
- Change-password: wrong current password → `400 { message: 'Неверный текущий пароль', field: 'currentPassword' }` (the `field` lets the form pin it); deleted account → 401. No dummy hash here — the caller is already authenticated and can only target their own account.

## References

`docs/architecture/cqrs.md`; specs `docs/superpowers/specs/2026-07-14-auth-cqrs-refactor-design.md`, `2026-07-15-auth-users-split-design.md`.
