#!/usr/bin/env bash
# Stop hook: when uncommitted code changes exist and haven't been processed yet,
# block the stop and instruct Claude to run /post-change. Sentinel ensures we
# only prompt once per change set; the user (via /post-change) updates it after.
set -u

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

# Are there uncommitted changes at all? (--quiet returns 1 if there's a diff)
git diff --quiet HEAD 2>/dev/null && exit 0

# Do any of those changes touch source code or config we care about?
code_touched=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    src/*|types/*.d.ts|package.json|tsconfig*.json|biome.json)
      code_touched=1; break ;;
  esac
done < <(git diff --name-only HEAD 2>/dev/null)
[ "$code_touched" = 0 ] && exit 0

# Compute current change-set fingerprint and compare to sentinel.
# Pipe git directly into shasum so we don't lose trailing newlines via $() stripping.
sentinel_path=".claude/.cache/post-change-sentinel"
current=$(git diff HEAD 2>/dev/null | shasum -a 256 | awk '{print $1}')
prev=""
[ -f "$sentinel_path" ] && prev=$(cat "$sentinel_path" 2>/dev/null)

if [ "$current" = "$prev" ]; then
  exit 0
fi

# Block the stop and instruct Claude to run /post-change.
reason="Uncommitted code changes detected. Run /post-change to present the user with the standard menu (update docs / bump version / commit) before stopping. /post-change will update the sentinel so this prompt does not repeat for the same change set."

printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$reason" | jq -Rs .)"
exit 0
