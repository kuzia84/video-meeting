---
name: read
description: Use when you need content from a large file but only part of it — a single function, a Prisma model, one JSON field, or a range of lines. Reads efficiently without pulling the whole file into context.
---

# Read a file efficiently

Goal: never load a whole file when a slice will do (see root CLAUDE.md → "Working efficiently").

Prefer the harness's native tools over shell — they are faster and work in any shell:

1. **Locate first, don't read blind.** Use the **Grep** tool for the symbol:
   `pattern: "function|class|export"` (or the specific name), `output_mode: "content"`, `-n: true`.
2. **Read only the range** the Grep hit points at: **Read** tool with `offset` and `limit`.
3. **Prisma model** — Grep `pattern: "model <Name> \\{"` with `-A: 30` (or Read the range it returns).
4. **JSON field** — Grep the key, or via the Bash tool when you need parsing: `jq '.field' <file>`.

Fall back to the Bash tool (Git Bash) only for `jq` / text transforms the native tools can't do —
never `sed`/`head`/`grep` through PowerShell, where they don't exist.

Never read a file whole when one function or model is enough.
