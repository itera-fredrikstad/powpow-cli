---
description: Smoke-test the locally-built CLI against the /private/tmp/powpow-scratch fixture.
allowed-tools: Bash(pnpm build), Bash(node *), Bash(ls *), Bash(test *)
---

End-to-end smoke test: rebuild this CLI and run it against the scratch fixture project.

Steps:

1. Verify the fixture exists:
   ```bash
   test -f /private/tmp/powpow-scratch/powpow.config.json
   ```
   If it does NOT exist, STOP and tell the user the fixture is missing. Do not auto-initialize it (`init` writes files outside this repo) — ask the user whether to run `node dist/cli.js init` from `/private/tmp/powpow-scratch` first.

2. Rebuild the CLI:
   ```bash
   pnpm build
   ```

3. Run a one-shot build against the fixture:
   ```bash
   cd /private/tmp/powpow-scratch && node $CLAUDE_PROJECT_DIR/dist/cli.js build
   ```

4. Report:
   - Build summary lines from the CLI output (entries built, duplicates, externals).
   - Any errors or warnings.
   - If anything looks off (no outputs, unexpected externals, duplicate-package warnings), surface it clearly — these are the signals we run this command to catch.
