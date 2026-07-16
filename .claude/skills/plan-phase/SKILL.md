---
name: plan-phase
description: Use when a PRD exists and the work needs to be broken into implementation phases before coding — "составь план по PRD", "разбей фичу на фазы", "план реализации для docs/x.md".
---

# Plan

## Overview

Turns a finished PRD into a phased implementation plan. Each phase is a self-contained slice of work with its own acceptance criterion, so it can be built and checked on its own.

Input: a path to a PRD in `docs/`, or a feature name that maps to one. Output: one markdown file.

## Before writing the file

1. Read the PRD file end to end. Not the title, not a grep — the whole document.
2. Check it against the four gates below. Ask clarifying questions if any fails — do not guess and do not fill the gap yourself:
   - every acceptance criterion in the PRD is concrete enough to know when it's met
   - the scope section says what is NOT in this iteration
   - the scenarios name who does what and what results
   - nothing in the PRD contradicts itself

If all four hold, write the plan without asking.

## File location and name

- Directory: `docs/`, next to the PRD.
- Name: the PRD's filename with a `-plan` suffix. `docs/file-upload.md` → `docs/file-upload-plan.md`.
- Body language: same as the PRD.

## Document contract

The file consists of exactly these sections, in this order:

```markdown
# План: <название фичи>

**PRD:** <ссылка на файл PRD>
**Дата:** <today, YYYY-MM-DD>

## Фаза 1. <Название>

**Цель:** <что даёт эта фаза — одно предложение>
**Затрагивает:** <backend / frontend / database / инфраструктура>

**Задачи:**

- <конкретная задача>

**Критерий готовности:** <одно проверяемое условие, при котором фаза закрыта>

## Фаза 2. <Название>

<same block, repeated per phase>

## Покрытие критериев PRD

| Критерий из PRD | Фаза |
| --------------- | ---- |
| <критерий>      | <№>  |
```

## Rules

- **Every acceptance criterion from the PRD appears in the coverage table**, mapped to the phase that satisfies it. An uncovered criterion means the plan is incomplete — add the phase.
- **Nothing enters the plan that isn't in the PRD.** No extra endpoints, no "заодно отрефакторим", no nice-to-haves. If the work looks genuinely needed but the PRD doesn't cover it, say so in the response and ask — don't add it silently.
- **Max five tasks per phase.** More than five means the phase is really two phases — split it.
- Phases are ordered so each one is verifiable when it lands. A phase whose criterion can only be checked after a later phase is mis-cut.
- Each phase's criterion is one observable check, not a list. "Загрузка файла проходит через API и файл лежит на диске" — yes. "Бэкенд готов" — no.
- Tasks say what to build, not how to write it. No code, no function signatures.

## Common mistakes

| Mistake                                                | Fix                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Phases split as «весь бэкенд» / «весь фронт»           | Cut vertically: each phase delivers a working slice         |
| PRD criterion silently dropped                         | The coverage table is the check — every criterion is listed |
| Tasks invented beyond the PRD ("добавим ещё удаление") | Ask instead. The PRD's scope is the boundary                |
| Phase with 9 tasks                                     | Split into two phases                                       |
| Criterion «фаза реализована»                           | Replace with one observable check                           |
| Skimmed the PRD, planned from the feature name         | Read the whole PRD first                                    |
