# Module resolution

All in `src/plugin/resolve.ts`. For every import, the plugin tries in order:

1. **UMD global** — if the specifier appears in the merged `globals` map, the import is replaced with a `globalThis[name]` reference via a virtual module (`UMD_VIRTUAL_PREFIX`). Highest priority; recorded in `resolutionLog.globalsUsed`.
2. **Cross-entry external** — if the specifier (bare or relative) resolves to **another entry's exact source file** (`findEntryForFile` at `src/entries.ts:32`), it is externalized as `RUNTIME_URL_PREFIX + runtimeUrl`. Behaviour by owner type:
   - web-file → externalize.
   - web-template → warn, then inline (web-templates can't be loaded as modules).
   - server-logic → throw (server-logic entries are not importable).
   - Importing **anything** cross-entry from a server-logic entry → throw (server-logic must inline everything).
3. **Inlined** — everything else (relative file imports that aren't another entry, npm packages with no UMD shim) is bundled in. Inlined npm packages are tracked in `inlinedPackages: Map<package, Set<entryGuid>>` so the build summary can warn about duplication.

## Cross-entry behaviour matrix

| Importer       | Imports another web-file | Imports another web-template | Imports another server-logic |
| -------------- | ------------------------ | ---------------------------- | ---------------------------- |
| web-file       | externalize              | warn + inline                | throw                        |
| web-template   | externalize              | warn + inline                | throw                        |
| server-logic   | throw                    | throw                        | throw                        |
