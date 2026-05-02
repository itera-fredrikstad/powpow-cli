# Verification checklist

Before declaring a change complete (and before opening a PR):

- [ ] `/verify` passes (lint + typecheck + tests).
- [ ] If you touched `src/build.ts` or `src/plugin/**`: `/scratch-build` succeeds and the build summary looks sane (no unexpected duplicates or externals).
- [ ] If you touched `types/*.d.ts`: `pnpm build` succeeded and `/scratch-build` still typechecks against the shipped types.
- [ ] If you changed architecture or added a new `BuildState` field: updated `.claude/docs/build-state-machine.md` and/or `.claude/docs/build-pipeline.md`.
- [ ] If you added a new doc file: linked it from the **Docs index** in `CLAUDE.md`.
- [ ] No new files written into the user's project root by a build (we never produce a `dist/` for users — only into the portal directory).
