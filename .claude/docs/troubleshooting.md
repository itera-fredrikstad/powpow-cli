# Troubleshooting

Symptoms an AI agent (or human) is likely to hit, and where to look first.

## Watch mode misses a file change

A file was edited but `watchBuild` didn't rebuild the affected entry.

- The dependency source of truth is `entryFiles`, captured from `bundle.watchFiles` after each successful build (`src/build.ts`).
- If the previous build of that entry **failed**, `entryFiles` for it is empty and `affectedEntries` falls back to "always rebuild" — but only on the *next* fs change. Re-save the file.
- If the file is loaded via a virtual module (UMD shim), it won't appear in `entryFiles`. That is expected; UMD imports don't trigger rebuilds.

## A web-template's `?v=<hash>` cache-buster doesn't update

`finalizeOutputs` only refreshes hashes for entries it sees in the **full** `outputCollector`. If `runBuild` accidentally wipes an entry's slot without rebuilding it, downstream cache-busters will go stale.

- Verify `runBuild` only clears slots for *targeted* entries.
- Verify `finalizeOutputs` runs after every `runBuild`, not gated on "any disk write happened".

## `tsc` errors only show up after editing files in `types/`

`types/*.d.ts` ships with the package and is consumed by user projects' tsconfigs. The local `pnpm typecheck` will catch most issues, but a real consumer project may pick up additional errors.

- Run `/scratch-build` to exercise the shipped types via the fixture.
- Run `pnpm build` locally to revalidate the `dist/` output that consumers will see.

## `/scratch-build` produces no output files

The CLI calls `bundle.generate()` and routes chunks through `outputCollector` (`src/plugin/output.ts`). If chunks aren't reaching `outputCollector`:

- Confirm the plugin's `generateBundle` hook is still installed and pushes into the shared collector.
- Confirm `finalizeOutputs` is being called and that `lastWritten` doesn't already match (in which case "no write" is correct, not a bug).

## `inlinedPackages` reports a duplicate that shouldn't exist

`runBuild` removes the rebuilt guid from each `inlinedPackages` set before re-bundling. If a stale guid lingers, the dedup warning will be wrong.

- Check the cleanup loop in `runBuild` covers every guid in `entriesToBuild`.

## Lint/typecheck hook is blocking on something unrelated

The PostToolUse hook (`.claude/hooks/post-edit-check.sh`) runs `pnpm biome check <file>` and `pnpm typecheck`. If a pre-existing error in another file blocks your edit, fix that error first or run `/verify` to see the full picture.
