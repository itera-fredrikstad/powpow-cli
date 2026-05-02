---
description: Run lint + typecheck + tests in one pass (pre-commit / pre-PR check).
allowed-tools: Bash(pnpm verify)
---

Run `pnpm verify` and report the result. If anything fails, summarize which step (lint, typecheck, or tests) and the first few failing items — do not attempt fixes unless asked.
