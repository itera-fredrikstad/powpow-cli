---
description: Run vitest only for tests related to files changed vs main.
allowed-tools: Bash(git diff *), Bash(git status *), Bash(pnpm exec vitest *), Bash(pnpm test *)
---

Run vitest only for tests touching the files changed on this branch.

Steps:

1. Determine changed files:
   ```bash
   git diff --name-only --diff-filter=ACMR origin/main...HEAD ; git diff --name-only --diff-filter=ACMR
   ```
2. Build the test file list:
   - Any changed `test/**/*.test.ts` → include directly.
   - Any changed `src/<name>.ts` → include `test/<name>.test.ts` if it exists.
   - Any changed file under `src/plugin/**` → include `test/plugin-resolve.test.ts` and `test/build.integration.test.ts` if they exist.
   - Any changed file in `src/build.ts`, `src/entries.ts`, `src/resources.ts`, or `src/config.ts` → include `test/build.integration.test.ts` if it exists.
3. If the resulting list is empty, say so and stop — do NOT run the full suite (use `/verify` for that).
4. Otherwise run `pnpm exec vitest run <files…>` and report results.

Keep the report short: which tests were selected, pass/fail counts, and the first failure (if any).
