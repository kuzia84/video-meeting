# Разделение auth на модули Auth и Users (через CQRS)

Дата: 2026-07-15.

## Контекст и цель

Сейчас всё, что связано с пользователями и аутентификацией, живёт в одном модуле `apps/api/src/auth/`. Его хендлеры (`RegisterHandler`, `LoginHandler`) сами ходят в `prisma.user` — то есть модуль auth одновременно отвечает и за аутентификацию (токены, проверки, хеширование), и за хранение/поиск пользователей.

Нужно разделить ответственность на два модуля:

- **Auth** — генерация и проверка токенов, регистрация и вход, хеширование и сверка пароля.
- **Users** — создание пользователя, поиск пользователя (в т.ч. по e-mail) и место для дальнейшего роста (профиль и пр.). Единственный владелец таблицы `user`.

Взаимодействие между модулями — строго через CQRS (команды/запросы и их хендлеры), без прямого инжекта сервисов одного модуля в другой.

HTTP-контракт (`POST /auth/register`, `POST /auth/login`) **не меняется** — это чистый внутренний рефакторинг.

## Границы модулей

### Users (новый модуль, `src/users/`)

Владеет доступом к `prisma.user`. Ни один другой модуль не обращается к таблице `user` напрямую.

- `CreateUserCommand(email, passwordHash)` → `CreateUserHandler`
  - `prisma.user.create({ data: { email, passwordHash } })`, возвращает `User`.
  - Ловит `Prisma.PrismaClientKnownRequestError` c кодом `P2002` (уникальность email) → `ConflictException({ statusCode: 409, error: 'Conflict', message: 'Этот email уже зарегистрирован', field: 'email' })`. Уникальный индекс — единственный источник истины о дубле (атомарно, без гонок), предварительного запроса нет.
  - Принимает **готовый `passwordHash`** — Users не знает про bcrypt.
- `GetUserByEmailQuery(email)` → `GetUserByEmailHandler`
  - `prisma.user.findUnique({ where: { email } })` → `User | null`.
  - Возвращает пользователя целиком, включая `passwordHash`. Это внутренний контракт между хендлерами (нужен Auth для сверки пароля при логине); наружу по HTTP он не отдаётся.
- Контроллера пока нет — HTTP-эндпоинтов у пользователей ещё не появилось (профиль — будущее, YAGNI).
- Классы `CreateUserCommand`/`GetUserByEmailQuery` живут в `src/users/` — Users ими владеет; Auth импортирует их как value-объекты.

Структура:

```
src/users/
  users.module.ts
  commands/
    create-user.command.ts
    handlers/create-user.handler.ts
  queries/
    get-user-by-email.query.ts
    handlers/get-user-by-email.handler.ts
```

### Auth (остаётся `src/auth/`)

Оставляет за собой контроллер, DTO, `TokenService`, `JwtAuthGuard`, `@CurrentUser`, тип `AuthUser`, команды `RegisterCommand`/`LoginCommand` и их хендлеры. Перестаёт инжектить `PrismaService`.

- `RegisterHandler`: `bcrypt.hash(password)` → `commandBus.execute(new CreateUserCommand(email, passwordHash))` → `tokenService.issue(user.id, user.email)`. Инжектит `CommandBus` и `TokenService`.
- `LoginHandler`: `queryBus.execute(new GetUserByEmailQuery(email))` → `bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)` → при неуспехе `UnauthorizedException('Invalid credentials')`, иначе `tokenService.issue(...)`. Защита от тайминг-энумерации (сравнение с dummy-хешом) остаётся в Auth. Инжектит `QueryBus` и `TokenService`.

## Потоки

**Регистрация:** `POST /auth/register` → `RegisterCommand` → `RegisterHandler` (Auth): хеширует пароль → `CreateUserCommand` → `CreateUserHandler` (Users): создаёт запись → `User` → `RegisterHandler` выпускает токен.

**Логин:** `POST /auth/login` → `LoginCommand` → `LoginHandler` (Auth): `GetUserByEmailQuery` → `GetUserByEmailHandler` (Users): `User | null` → `LoginHandler` сверяет пароль и выпускает токен.

## Проводка модулей

- `UsersModule`: `imports: [CqrsModule]`, `providers: [CreateUserHandler, GetUserByEmailHandler]`. Контроллеров и экспортов нет.
- `AppModule` добавляет `UsersModule` в `imports`.
- Шина CQRS (`CommandBus`/`QueryBus`) — общая на всё приложение: `ExplorerService` из `@nestjs/cqrs` регистрирует все хендлеры из провайдеров загруженных модулей на единых экземплярах шин. Поэтому Auth **не импортирует `UsersModule`** — достаточно, что оба модуля подключены в `AppModule`. Auth зависит только от классов команды/запроса (value-объекты), а не от хендлеров/сервисов Users → циклической зависимости нет.

## Что переезжает из Auth в Users

- `prisma.user.create` + обработка `P2002` (409, `field: 'email'`) → `CreateUserHandler`.
- `prisma.user.findUnique({ where: { email } })` → `GetUserByEmailHandler`.
- Auth-хендлеры перестают импортировать `PrismaService`.

## Обработка ошибок — контракт неизменен

- 409 «Этот email уже зарегистрирован» (`field: 'email'`) — теперь бросается в Users (`CreateUserHandler`), тот же формат.
- 401 «Invalid credentials» и защита от тайминга — остаются в Auth (`LoginHandler`).
- 400 валидации DTO — по-прежнему на глобальном `ValidationPipe` до шины.

## Тестирование

Поведение и HTTP-контракт не меняются, поэтому существующий `test/auth.e2e-spec.ts` — страховка рефакторинга: гоняем его зелёным до и после изменений. По принятому в репозитории соглашению хендлеры юнит-тестами с моками не покрываются — только сквозной e2e через реальный `AppModule`, шину и Postgres (см. `docs/architecture/cqrs.md`). Порядок: сначала убедиться, что e2e зелёный на текущем коде (база), затем рефакторинг с сохранением зелёного статуса.

## Обновление документации

- `docs/architecture/cqrs.md` — таблица «Текущий инвентарь» (добавить `CreateUserCommand`/`GetUserByEmailQuery`), список модулей.
- `apps/api/CLAUDE.md` — обзор модулей (появился Users, границы Auth/Users).
- корневой `CLAUDE.md` — упоминание модуля Users в разделе про архитектуру.

## Вне рамок (YAGNI)

- HTTP-эндпоинты пользователей (профиль, список) — появятся отдельно, когда понадобятся.
- События/`EventBus` (например, приветственное письмо после регистрации) — как и раньше, добавляются при появлении реального подписчика.
- Отдельный запрос без `passwordHash` — не нужен, пока единственный потребитель `GetUserByEmailQuery` — это Auth-логин.
