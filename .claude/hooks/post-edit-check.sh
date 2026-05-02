#!/usr/bin/env bash
# PostToolUse hook: lint + typecheck after edits to src/ or test/ TypeScript files.
# Exit 2 surfaces stderr to Claude as a blocking signal; exit 0 is silent.
set -u

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

[ -z "$file" ] && exit 0

case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

case "$file" in
  */src/*|*/test/*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

if ! out=$(pnpm --silent exec biome check --no-errors-on-unmatched "$file" 2>&1); then
  printf 'biome check failed for %s:\n%s\n' "$file" "$out" >&2
  exit 2
fi

if ! out=$(pnpm --silent typecheck 2>&1); then
  printf 'tsc --noEmit failed:\n%s\n' "$out" >&2
  exit 2
fi

exit 0
