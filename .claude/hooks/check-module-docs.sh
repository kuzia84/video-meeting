#!/usr/bin/env bash
# Non-blocking Stop hook: warn when a backend module or a top-level frontend
# layer has no CLAUDE.md, per the "CLAUDE.md hierarchy" rule in root CLAUDE.md.
# Never blocks — always exits 0; surfaces a warning via JSON systemMessage.

set -uo pipefail

# Resolve repo root from this script's location (.claude/hooks/ -> repo root).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root" || exit 0

missing=()

# Backend: every apps/api/src/<module>/ directory should own a CLAUDE.md.
# Frontend: every top-level apps/web/src/<layer>/ directory should too.
for base in apps/api/src apps/web/src; do
  [ -d "$base" ] || continue
  for dir in "$base"/*/; do
    [ -d "$dir" ] || continue
    [ -f "${dir}CLAUDE.md" ] || missing+=("${dir}CLAUDE.md")
  done
done

# Silent when nothing is missing.
[ ${#missing[@]} -eq 0 ] && exit 0

# Build a plain message, then JSON-escape it (no external deps).
msg="CLAUDE.md hierarchy: these module/layer directories have no CLAUDE.md. Create one and add a one-line pointer in the parent (see root CLAUDE.md, section 'CLAUDE.md hierarchy'):"
for m in "${missing[@]}"; do
  msg="${msg}"$'\n'"  - ${m}"
done

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"   # backslash first
  s="${s//\"/\\\"}"   # double quotes
  s="${s//$'\n'/\\n}" # newlines
  printf '%s' "$s"
}

printf '{"systemMessage": "%s"}\n' "$(json_escape "$msg")"
exit 0
