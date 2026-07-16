---
name: issues
description: Use when a phased implementation plan exists and the work needs to become a GitHub backlog — "создай issues по плану", "залей план в GitHub", "сделай milestones и задачи из docs/x-plan.md".
---

# Issues

## Overview

Turns a phased plan into a GitHub backlog: one milestone per phase, one issue per task, each issue attached to its phase's milestone.

Input: a path to a plan file (from arguments). Output: milestones and issues in the repo's GitHub remote.

## Before creating anything

Creating issues is outward-facing and tedious to undo — there is no bulk delete. Never create on the first pass.

1. Read the plan file end to end.
2. Verify the environment, and stop with the error if any step fails:
   - `gh auth status` — authenticated
   - `gh repo view --json nameWithOwner -q .nameWithOwner` — this is the target repo; use this value for `{owner}/{repo}`, never hardcode it
   - `gh repo view --json viewerPermission,hasIssuesEnabled` — the active account needs write access (`ADMIN`, `MAINTAIN` or `WRITE`) and issues must be enabled. `READ` means milestones will fail with 403 while issues still get created on a public repo — a backlog with no milestones and no links. If access is short, name the active account (`gh api user -q .login`) and stop: another account may be logged in (`gh auth status`) and `gh auth switch --user <owner>` fixes it.
3. List existing milestones: `gh api repos/{owner}/{repo}/milestones --paginate -q '.[].title'`
4. Show the user the full plan of what will be created — every milestone and every issue title, grouped by phase, marking which milestones already exist — and **wait for explicit confirmation**. Only then create.

If the plan file has no phases or no tasks, say so and stop. Do not invent them.

## Creating

**Milestone per phase.** Title is `<фича> — <phase heading without the ##>`, e.g. `Загрузка файлов — Фаза 1. Хранение файла и загрузка через API`. Take `<фича>` from the plan's H1 with the `План: ` prefix dropped (`# План: Загрузка файла встречи` → `Загрузка файлов`; shorten to a couple of words if the title is long). Description is the phase's Цель.

The prefix is not decoration. Phase numbering restarts at 1 in every plan, so a repo with two features gets two `Фаза 1`, two `Фаза 2`, and a milestone list where nothing says which feature a phase belongs to — GitHub shows no grouping. The prefix is the only thing that separates them.

```bash
gh api repos/{owner}/{repo}/milestones --field title="Загрузка файлов — Фаза 1. ..." --field description="<цель фазы>"
```

Reuse a milestone whose title already matches rather than creating a duplicate — GitHub allows same-title milestones, so a second run without this check silently doubles the backlog.

If existing milestones from an earlier run lack the prefix, rename them in the same pass (`gh api -X PATCH repos/{owner}/{repo}/milestones/{number} --field title="…"`) so the list stays consistent. Renaming keeps every issue attached — the link is by milestone number, not title.

**Issue per task.**

- **Title** — the task text from the plan, verbatim, with the `- ` list marker stripped. No numbering, no prefixes.
- **Body** — what the task is, in this shape: the phase it belongs to, the phase's Цель, the phase's Критерий готовности, and a link to the plan file. This is what a person needs to pick the issue up without reopening the plan.
  - The plan link must be an **absolute URL** (`https://github.com/{owner}/{repo}/blob/{branch}/{path}`). GitHub renders a relative markdown link in an issue body verbatim, so it resolves against the issue page and 404s. Take `{branch}` from `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, and make sure the plan file is committed and pushed — otherwise the link is dead for everyone but its author.
- **Milestone** — the phase's milestone.

```bash
gh issue create --title "<задача>" --body "<описание>" --milestone "Фаза 1. ..."
```

Create issues phase by phase, in plan order.

## After creating

Report what was created: milestone count, issue count, and the milestone URLs. If any call failed, say which task didn't make it — a partial backlog is worse than a reported failure, because nobody notices the gap.

## Rules

- Body language follows the plan's language.
- One issue per task. Never merge two tasks into one issue, never split one task into several.
- Nothing enters the backlog that isn't in the plan — no "заодно", no setup issues the plan didn't name.
- The plan is the source of truth. If a task is unclear, ask — don't rewrite it into something clearer-sounding.

## Common mistakes

| Mistake                                       | Fix                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| Created issues without showing the plan first | Show everything, wait for confirmation — there's no bulk undo   |
| Hardcoded `owner/repo`                        | Read it from `gh repo view`                                     |
| Checked `gh auth status` but not write access | Logged in ≠ allowed to write — check `viewerPermission` too     |
| Second run doubled every milestone            | Check existing titles first, reuse matches                      |
| Two features, two `Фаза 1` — which is which?  | Prefix every milestone with the feature name from the plan's H1 |
| Issue body just repeats the title             | Body carries phase, цель, критерий готовности, link to plan     |
| Task text rewritten "покрасивее"              | Title is the plan's text verbatim, minus the list marker        |
| Failed calls swallowed, "готово" reported     | Report exactly which tasks failed                               |
| Relative plan link in the issue body          | Issues aren't repo files — use the absolute blob URL            |
| Cyrillic titles arrived as `????`             | On Windows pipe `gh` through bash, not PowerShell 5.1           |
