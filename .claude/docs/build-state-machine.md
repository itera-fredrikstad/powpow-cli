# Dev-mode incremental rebuild (`watchBuild` in `src/build.ts`)

This is the most fragile area in the codebase. Read this before changing `src/build.ts` or `src/plugin/`.

`watchBuild` keeps a `BuildState` in its closure across rebuilds:

- `outputCollector: Map<guid, CollectedOutput>` — chunk content per entry.
- `resolutionLogs: Map<guid, EntryResolutionLog>` — per-entry deps for the build summary.
- `inlinedPackages: Map<pkg, Set<guid>>` — dedup tracking.
- `entryFiles: Map<guid, Set<string>>` — files Rolldown actually loaded for that entry, captured from `bundle.watchFiles` after each successful build. **This is the dependency source of truth for incremental rebuilds.**
- `lastWritten: Map<contentPath, string>` — content we last wrote to each portal content path.

On a debounced fs change, `affectedEntries(changedPaths, entries, entryFiles)` picks the subset to rebuild:

- entry-source matches → that entry rebuilds (reason: `entry source`),
- changed file ∈ that entry's `entryFiles` → it rebuilds (reason: `loads <path>`),
- entry has no recorded `entryFiles` (previous build failed) → always rebuilds as a fallback.

`runBuild(state, entriesToBuild?)` clears just the targeted entries' slots in `outputCollector`/`resolutionLogs`, removes the target guid from each `inlinedPackages` set, then bundles. After all targets finish, `finalizeOutputs` runs over the **full** collector (so dependent web-templates get refreshed `?v=hash` markers when a referenced web-file's content actually changed) but skips disk writes whose content matches `lastWritten`.

## When changing this file

Partial-rebuild correctness depends on every mutation cleaning up the right state up-front. Before merging, walk this checklist:

1. Identify which `BuildState` field your change touches.
2. Confirm `runBuild` clears that field for *targeted* entries before bundling — never wipes the whole map.
3. Confirm `finalizeOutputs` still runs over the **full** collector so dependent entries see updated cache-busters.
4. Add or update a test in `test/build.integration.test.ts` that exercises the new behaviour through a watch-style sequence (initial build → mutate input → rebuild → assert outputs).
5. Run `/scratch-build` to smoke-test against a real fixture.
