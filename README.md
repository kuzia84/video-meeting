# MeetingBrain

> Превращаем записи встреч в протоколы, задачи и решения.

**MeetingBrain** — сервис, который берёт записи и файлы встречи, прогоняет их через транскрипцию и ИИ-анализ и отдаёт готовую выжимку: краткое содержание, список задач и принятые решения.

Репозиторий — **Turborepo-монорепозиторий** с бэкендом на NestJS, фронтендом на Next.js и общим пакетом типов.

> **Статус.** Реализованы фундамент и первый вертикальный срез: аутентификация (регистрация/вход по JWT), CRUD встреч и веб-интерфейс (страницы входа и защищённой главной со списком встреч). Транскрипция и ИИ-анализ — в планах.

---

## Возможности

- 🔐 **Аутентификация** — регистрация и вход по email/паролю, пароли хешируются `bcrypt`, сессия на JWT.
- 📅 **Встречи** — создание и просмотр встреч, привязанных к пользователю (данные изолированы по владельцу).
- 🖥️ **Веб-интерфейс** — страница входа, защищённая главная с приветствием, счётчиком встреч и тремя последними встречами (серверная пагинация).
- 🧱 **Общие типы** — единый пакет `@video-meetings/shared` с контрактами API для обоих приложений.

## Технологический стек

| Слой        | Технологии                                                            |
| ----------- | --------------------------------------------------------------------- |
| Монорепо    | Turborepo, npm workspaces                                             |
| Backend     | NestJS 11, CQRS, Prisma 6, PostgreSQL 18, JWT (`@nestjs/jwt`), bcrypt |
| Frontend    | Next.js 15 (App Router, React 19), HeroUI v3, Tailwind CSS v4         |
| Общий пакет | TypeScript (`@video-meetings/shared`)                                 |
| Инфра (dev) | Docker Compose (PostgreSQL)                                           |

## Структура репозитория

```
video-meetings/
├── apps/
│   ├── api/          # NestJS API (порт 3001)
│   └── web/          # Next.js фронтенд (порт 3000)
├── packages/
│   └── shared/       # @video-meetings/shared — общие TypeScript-типы
├── docs/             # проектные спецификации и архитектурные заметки
├── docker-compose.yml
└── turbo.json
```

Подробности по каждому приложению — в `apps/api/CLAUDE.md` и `apps/web/CLAUDE.md`; общая архитектура монорепозитория — в корневом `CLAUDE.md`.

## Требования

- **Node.js** ≥ 20 (проверено на 22)
- **npm** ≥ 11 (репозиторий использует npm workspaces)
- **Docker** — для локального PostgreSQL

## Быстрый старт

```bash
# 1. Установить зависимости (один общий node_modules на весь монорепо)
npm install

# 2. Подготовить переменные окружения
cp .env.example .env               # настройки Postgres для docker-compose
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Поднять базу данных
npm run db:up

# 4. Применить миграции и сгенерировать Prisma Client (из apps/api)
cd apps/api && npx prisma migrate deploy && cd ../..

# 5. Запустить оба приложения (web:3000, api:3001)
npm run dev
```

После запуска: фронтенд — http://localhost:3000, API — http://localhost:3001.

> В процессе разработки вместо `prisma migrate deploy` используйте `npx prisma migrate dev` (создаёт новые миграции по изменениям схемы). Prisma Client генерируется автоматически при миграции.

## Переменные окружения

**Корень (`.env`)** — читается `docker-compose.yml`:

| Переменная          | По умолчанию     | Назначение            |
| ------------------- | ---------------- | --------------------- |
| `POSTGRES_USER`     | `postgres`       | пользователь Postgres |
| `POSTGRES_PASSWORD` | `postgres`       | пароль Postgres       |
| `POSTGRES_DB`       | `video_meetings` | имя базы              |
| `POSTGRES_PORT`     | `5432`           | проброшенный порт     |

**`apps/api/.env`**:

| Переменная       | По умолчанию                                                   | Назначение                                   |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`   | `postgresql://postgres:postgres@localhost:5432/video_meetings` | строка подключения Prisma                    |
| `JWT_SECRET`     | `change-me-in-production`                                      | секрет для подписи JWT (**сменить в проде**) |
| `JWT_EXPIRES_IN` | `1h`                                                           | срок жизни токена                            |
| `CORS_ORIGINS`   | `http://localhost:3000`                                        | список разрешённых origin через запятую      |

**`apps/web/.env`**:

| Переменная            | По умолчанию            | Назначение      |
| --------------------- | ----------------------- | --------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | базовый URL API |

## Скрипты (из корня)

Все команды идут через Turborepo и распараллеливаются по workspace'ам:

| Команда           | Действие                                       |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | запустить web (3000) и api (3001) одновременно |
| `npm run build`   | собрать shared, затем api и web                |
| `npm run lint`    | линтинг всех workspace'ов                      |
| `npm run test`    | тесты (сейчас только `apps/api`)               |
| `npm run format`  | Prettier по всему репозиторию                  |
| `npm run db:up`   | поднять локальный Postgres в Docker            |
| `npm run db:down` | остановить Postgres                            |
| `npm run db:logs` | логи контейнера Postgres                       |

Область одной команды сужается флагом `-w`, например `npm run test -w @video-meetings/api`.

## API

Базовый URL: `http://localhost:3001` (без глобального префикса). Ответы обёрнуты в конверт `{ success, message, data }`; списки добавляют `total`, `page`, `limit`. Защищённые маршруты требуют заголовок `Authorization: Bearer <accessToken>`.

| Метод + путь          | Auth | Описание                                                         |
| --------------------- | :--: | ---------------------------------------------------------------- |
| `POST /auth/register` |  —   | регистрация: `{ email, password }` → `201 { accessToken, user }` |
| `POST /auth/login`    |  —   | вход: `{ email, password }` → `200 { accessToken, user }`        |
| `GET /meetings`       |  ✅  | список встреч пользователя, пагинация `?page=&limit=`            |
| `POST /meetings`      |  ✅  | создать встречу `{ title, description?, startTime, endTime }`    |
| `GET /meetings/:id`   |  ✅  | одна встреча (404, если чужая или не найдена)                    |

Неверные учётные данные при входе возвращают `401` (без раскрытия, что именно не так — email или пароль).

## Модель данных

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  meetings     Meeting[]
}

model Meeting {
  id          String   @id @default(uuid())
  title       String
  description String?
  startTime   DateTime
  endTime     DateTime
  createdAt   DateTime @default(now())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Связь 1-ко-многим с каскадным удалением: при удалении пользователя удаляются его встречи.

## Веб-интерфейс

- **`/login`** — форма email/пароль, ссылка на регистрацию; при успехе токен сохраняется в `sessionStorage`, пользователь переходит на `/`.
- **`/register`** — регистрация нового пользователя.
- **`/`** — защищённая главная (доступ только при наличии токена): приветствие с email, количество встреч, три последние встречи или пустое состояние, кнопки «Создать встречу» и «Выйти».

UI построен на HeroUI v3; конвенции и рабочий процесс визуальной проверки описаны в `docs/architecture/frontend-ui.md`.

## Разработка

- Общий пакет `packages/shared` подключается к приложениям напрямую из TypeScript-исходников (без сборки в `dist/`) — новые типы достаточно добавить в `packages/shared/src/index.ts`.
- Задачи `build`/`lint`/`test` зависят от `^build`, поэтому `packages/shared` собирается первым.
- Тесты API: `npm run test -w @video-meetings/api`, e2e — `npx jest --config ./test/jest-e2e.json` из `apps/api`.

Дополнительные проектные спецификации и планы — в каталоге `docs/superpowers/`.

## Лицензия

Проект приватный; лицензия не определена.
