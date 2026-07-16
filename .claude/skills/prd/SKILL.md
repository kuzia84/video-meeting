---
name: prd
description: Use when a new feature needs written requirements before implementation — the user names or describes a feature ("нужна загрузка файлов", "напиши PRD для X", "опиши требования к фиче") and there is no requirements doc yet.
---

# PRD

## Overview

Turns a vague feature ask ("хочу, чтобы файл загружался") into a structured requirements document in `docs/` that answers: what scenario, what's in and out of scope, what constraints, what counts as done.

Input: a feature name or description (the skill argument). Output: one markdown file.

## Before writing the file

Ask clarifying questions if any of these is unknown — do not guess:

- who the user of the feature is and what they do
- what result they expect
- what is explicitly NOT part of this iteration
- what a reviewer would check to accept the work

If the description already answers all four, write the file without asking.

## File location and name

- Directory: `docs/` at repo root. Create it if missing.
- Name: translate the feature name to English, kebab-case, `.md`. `Загрузка файлов` → `docs/file-upload.md`.
- Body language: same as the user's description (Russian by default). The filename is always English.

## Document contract

The file consists of exactly these sections, in this order:

```markdown
# <Название фичи>

**Дата:** <today, YYYY-MM-DD>
**Статус:** draft

## Цель

<1–2 предложения: что нужно пользователю и зачем. Ценность, не реализация.>

## Пользовательские сценарии

- **Пользователь:** <кто> — **Действие:** <что делает> — **Результат:** <что происходит>
  <one bullet per scenario, each with all three parts>

## Скоуп

**В скоупе:**

- <конкретный пункт этой итерации>

**Не в скоупе:**

- <что явно не делаем в этой итерации>

## Технические ограничения

- <известное ограничение, которое надо учитывать>

## Критерии готовности

- [ ] <проверяемое утверждение: можно подтвердить или опровергнуть>
```

## Rules

- Write concretely. No filler, no marketing phrasing, no restating the section title as its content.
- Describe **what** and **why**, never **how** to implement. No API shapes, table schemas, library choices, or file paths in the PRD.
- Every acceptance criterion must be checkable by a person in one step. "Файл до 100 МБ загружается и появляется в списке" — yes. "Система выдерживает нагрузку" — no.
- "Не в скоупе" is never empty. If nothing comes to mind, the feature isn't understood well enough — ask.
- Scenarios always carry all three parts (пользователь / действие / результат). A bare action is not a scenario.

## Common mistakes

| Mistake                                                               | Fix                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| Цель describes the implementation ("добавить эндпоинт `POST /files`") | Describe the user's need and the value                  |
| "Не в скоупе" omitted                                                 | Always list exclusions — this is what stops scope creep |
| Criterion like "работает быстро"                                      | Replace with an observable, one-step check              |
| Filename in Russian or transliterated (`zagruzka-failov.md`)          | Translate to English: `file-upload.md`                  |
| Guessing missing details to avoid asking                              | Ask first, write after                                  |
