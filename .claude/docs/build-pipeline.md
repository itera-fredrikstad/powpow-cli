# Build pipeline

What `powpow build` and `powpow dev` do for users:

1. **Config** (`src/config.ts`) — loads/validates `powpow.config.json`, which maps source files (or bare specifiers) to Power Pages resource GUIDs.
2. **Resource scanning** (`src/resources.ts`) — discovers web-templates, web-files, and server-logic in the portal directory by globbing YAML metadata files.
3. **Entry resolution** (`src/entries.ts`) — turns each `EntryPoint` into a `ResolvedEntry { source, absSource, resource, type }`.
4. **Bundling** (`src/build.ts` + `src/plugin/`) — Rolldown bundles each entry independently. Server-logic uses `platform: 'node'`; web-templates and web-files use `platform: 'browser'`. The plugin in `src/plugin/resolve.ts` decides for every import whether to inline, externalize as a runtime URL, or shim as a UMD global.
5. **Output collection** — `src/plugin/output.ts` strips chunks out of Rolldown's bundle map and pushes their content into a shared `outputCollector: Map<guid, CollectedOutput>`. We call `bundle.generate()` (not `write()`) so Rolldown does **not** create a `dist/` directory in the user's project.
6. **Finalize + write** — `finalizeOutputs(outputCollector, lastWritten)` computes `?v=<hash>` cache-busters for cross-entry runtime URLs and writes each output to its portal `contentPath`. Writes are skipped when the new content matches `lastWritten`.
7. **Dev server** (`src/dev-server.ts`) — HTTP server (default `127.0.0.1:3001`) serving `/manifest`, `/web-templates/:guid`, `/web-files/*`. CORS is `*` by default, or restricted to `chrome-extension://<extensionId>` when `extensionId` is set in config.

## Key design decisions

- **No intermediate `dist/` for user builds** — enforced by routing chunks through `outputCollector` in `src/plugin/output.ts` and calling `bundle.generate()` (not `write()`) in `src/build.ts:buildEntry`. Built code lands directly in the Power Pages portal directory.
- **Exact-source-match ownership** — `findEntryForFile` matches on `entry.absSource === path`. There is no directory-tree ownership.
- **Per-entry bundling** — each entry is bundled independently (`Promise.allSettled` over `buildEntry`), not as a single multi-entry Rolldown build. This is what enables incremental rebuilds.
