# CQRS в `apps/api`

Как паттерн CQRS применён в проекте, какие соглашения приняты и как добавлять новые операции.

Библиотека: [`@nestjs/cqrs`](https://docs.nestjs.com/recipes/cqrs) (`^11.0.3`).

## Идея и границы применения

CQRS разделяет **изменение состояния** (Command) и **чтение** (Query). Контроллер не содержит бизнес-логики — он лишь валидирует вход (DTO + `ValidationPipe`), диспатчит объект команды/запроса в шину и оборачивает результат в HTTP-ответ. Логика живёт в хендлерах.

Что это даёт здесь: тонкие контроллеры, одна операция — один класс с одной зависимостью-набором, легко добавлять сквозное поведение (логирование, метрики) на уровне шины.

**Что НЕ используется намеренно:**

- **Events / `EventBus` / Sagas** — отложены: пока нет ни одного потребителя события. Добавлять, когда появится реальный подписчик (например, отправка приветственного письма после регистрации), а не «на будущее».
- **Event sourcing, агрегаты, отдельная read-модель.** Command и Query ходят в **одну и ту же** БД через `PrismaService`. Разделены только пути кода, а не хранилища.

## Command или Query?

|            | Command                 | Query                 |
| ---------- | ----------------------- | --------------------- |
| Назначение | действие, use-case      | чтение данных         |
| Шина       | `CommandBus`            | `QueryBus`            |
| Декоратор  | `@CommandHandler(X)`    | `@QueryHandler(X)`    |
| Интерфейс  | `ICommandHandler<X, R>` | `IQueryHandler<X, R>` |

Правило: **меняет состояние или является императивным действием → Command; только читает → Query.**

Осознанное исключение — **`LoginCommand` это Command, хотя логин не меняет состояние.** Причины: логин — императивный use-case («войти»), симметричен регистрации, и естественно обрастает побочными эффектами (audit-лог, `lastLoginAt`, счётчик неудачных попыток) без смены типа. Это задокументированное решение, а не недосмотр.

## Соглашения по структуре

Внутри модуля (`src/<module>/`):

```
<module>.controller.ts          // диспатчит в CommandBus / QueryBus
<module>.module.ts              // imports: [CqrsModule], providers: [...handlers]
dto/                            // class-validator DTO для HTTP-входа
commands/
  <action>.command.ts           // класс-команда (данные, без логики)
  handlers/
    <action>.handler.ts         // @CommandHandler
queries/
  <action>.query.ts             // класс-запрос
  handlers/
    <action>.handler.ts         // @QueryHandler
```

Именование: `RegisterCommand` → `RegisterHandler`; `ListMeetingsQuery` → `ListMeetingsHandler`.

Команды/запросы — **чистые value-объекты**: только `public readonly` поля через конструктор, никакой логики и никаких декораторов.

```ts
// src/meetings/queries/get-meeting.query.ts
export class GetMeetingQuery {
  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}
```

**DTO ≠ Command.** DTO — это форма HTTP-запроса (с `class-validator`). Контроллер разбирает DTO и собирает команду, добавляя данные, которых в теле запроса нет, — прежде всего `userId` из JWT. Так хендлер не зависит от HTTP.

## Текущий инвентарь

| Операция               | Тип     | Класс                      | Хендлер                    | Маршрут                                        |
| ---------------------- | ------- | -------------------------- | -------------------------- | ---------------------------------------------- |
| Регистрация            | Command | `RegisterCommand`          | `RegisterHandler`          | `POST /auth/register` (201)                    |
| Логин                  | Command | `LoginCommand`             | `LoginHandler`             | `POST /auth/login` (200)                       |
| Создать пользователя   | Command | `CreateUserCommand`        | `CreateUserHandler`        | — (внутр., из `RegisterHandler`)               |
| Пользователь по email  | Query   | `GetUserByEmailQuery`      | `GetUserByEmailHandler`    | — (внутр., из `LoginHandler`)                  |
| Создать встречу        | Command | `CreateMeetingCommand`     | `CreateMeetingHandler`     | `POST /meetings` (201)                         |
| Список встреч          | Query   | `ListMeetingsQuery`        | `ListMeetingsHandler`      | `GET /meetings` (200)                          |
| Одна встреча           | Query   | `GetMeetingQuery`          | `GetMeetingHandler`        | `GET /meetings/:id` (200)                      |
| Загрузить файл встречи | Command | `UploadMeetingFileCommand` | `UploadMeetingFileHandler` | `POST /meetings/:meetingId/files` (201)        |
| Список файлов встречи  | Query   | `ListMeetingFilesQuery`    | `ListMeetingFilesHandler`  | `GET /meetings/:meetingId/files` (200)         |
| Один файл встречи      | Query   | `GetMeetingFileQuery`      | `GetMeetingFileHandler`    | `GET /meetings/:meetingId/files/:fileId` (200) |

## Как это связано

**1. Контроллер диспатчит** (`src/meetings/meetings.controller.ts`). Дженерики `execute<TCommand, TResult>` дают типизированный результат:

```ts
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMeetingDto,
  ): Promise<ApiResponse<Meeting>> {
    const data = await this.commandBus.execute<CreateMeetingCommand, Meeting>(
      new CreateMeetingCommand(user.userId, dto.title, dto.startTime, dto.endTime, dto.description),
    );
    return { success: true, message: 'Meeting created', data };
  }
}
```

**2. Хендлер содержит логику** и инжектит зависимости обычным DI. `PrismaService` доступен без импорта (`PrismaModule` — `@Global()`):

```ts
@QueryHandler(GetMeetingQuery)
export class GetMeetingHandler implements IQueryHandler<GetMeetingQuery, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingQuery): Promise<Meeting> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: query.id, userId: query.userId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }
}
```

**3. Модуль регистрирует хендлеры.** `CqrsModule` в `imports`, хендлеры — обычные `providers`; `@CommandHandler`/`@QueryHandler` находятся автоматически:

```ts
@Module({
  imports: [CqrsModule, AuthModule /* …MulterModule для загрузки файлов */],
  controllers: [MeetingsController, MeetingFilesController],
  providers: [
    CreateMeetingHandler,
    ListMeetingsHandler,
    GetMeetingHandler,
    UploadMeetingFileHandler,
    ListMeetingFilesHandler,
    GetMeetingFileHandler,
  ],
})
export class MeetingsModule {}
```

Забыть добавить хендлер в `providers` → на диспатче упадёт `No handler found for the command`.

## Межмодульное взаимодействие через шину

`CommandBus`/`QueryBus` — общие на всё приложение (`ExplorerService` из `@nestjs/cqrs` регистрирует хендлеры из провайдеров всех загруженных модулей на единых экземплярах шин). Поэтому один модуль может выполнить операцию другого, **не импортируя его и не инжектя его сервисы** — достаточно, что оба модуля подключены в `AppModule`.

Пример — регистрация/логин (`Auth`) обращаются к пользователям (`Users`):

```ts
// RegisterHandler (модуль Auth) создаёт пользователя командой модуля Users
const user = await this.commandBus.execute<CreateUserCommand, User>(
  new CreateUserCommand(email, passwordHash),
);
// LoginHandler (Auth) читает пользователя запросом модуля Users
const user = await this.queryBus.execute<GetUserByEmailQuery, User | null>(
  new GetUserByEmailQuery(email),
);
```

`Auth` зависит только от **классов** `CreateUserCommand`/`GetUserByEmailQuery` (value-объекты из `src/users/`), а не от хендлеров или сервисов `Users` — связи направлены на контракт, циклической зависимости между модулями нет. Так `Users` остаётся единственным владельцем таблицы `user`: обращения к `prisma.user` есть только в его хендлерах.

## Обработка ошибок

Исключения, брошенные в хендлере, `CommandBus.execute`/`QueryBus.execute` **пробрасывают наверх без изменений**, и их подхватывает стандартный слой исключений Nest. Поэтому в хендлерах бросаем обычные HTTP-исключения:

- `ConflictException` → 409 (дубль email при регистрации)
- `UnauthorizedException` → 401 (неверные креды)
- `NotFoundException` → 404 (чужая/несуществующая встреча)
- `BadRequestException` → 400 (`endTime` не позже `startTime`)

Валидация формы запроса (400) отрабатывает **до** шины — на глобальном `ValidationPipe` по DTO.

Ответы: успех оборачивается вручную в контроллере в `ApiResponse<T>` / `PaginatedResponse<T>` из `@video-meetings/shared`; ошибки идут в стандартном формате Nest (`{ statusCode, message, error }`). Глобального интерсептора-обёртки нет.

## Как добавить новую операцию

1. **Выбрать тип** — Command (меняет состояние / действие) или Query (чтение).
2. **DTO** в `dto/` — с `class-validator`, если есть тело/query-параметры.
3. **Класс** команды/запроса в `commands/` или `queries/` — только `readonly` поля.
4. **Хендлер** в `<...>/handlers/` — `@CommandHandler(X)` / `@QueryHandler(X)`, `implements ICommandHandler<X, R>` / `IQueryHandler<X, R>`, метод `execute`.
5. **Зарегистрировать хендлер** в `providers` модуля.
6. **Метод контроллера** — валидирует DTO, собирает объект команды/запроса (не забыть `userId` из `@CurrentUser()` для защищённых маршрутов), диспатчит, оборачивает в `ApiResponse`.
7. **Тест сначала**: сценарий добавляется в e2e (`test/*.e2e-spec.ts`) до реализации.

## Тестирование

Хендлеры **не покрываются unit-тестами с моками** — осознанно. Проверка идёт сквозным e2e через HTTP (`test/auth.e2e-spec.ts`, `test/meetings.e2e-spec.ts`): реальный `AppModule`, реальная шина, реальный Postgres. Так тестируется поведение контракта, а не внутренняя структура, и рефакторинг (например, переход auth с сервиса на CQRS) не ломает тесты.

Порядок работы — TDD: сначала падающие e2e, затем реализация под них.

## Ссылки

- Дизайн перевода auth на CQRS: `docs/superpowers/specs/2026-07-14-auth-cqrs-refactor-design.md`
- Обзор архитектуры приложения: `apps/api/CLAUDE.md`
