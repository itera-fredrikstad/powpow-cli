# Changelog

## 0.4.0

A round of dev-loop and consumer-project ergonomics fixes, plus the AI-tooling
scaffolding under `.claude/`. No breaking changes for end users; consuming
projects re-running `powpow init` will get the new project-references tsconfig
layout.

### Changed

- `powpow init` now writes a project-references `tsconfig.json` (a solution
  root with `references` to `tsconfig.web.json` and
  `tsconfig.server-logic.json`), each extending the shipped
  `powpow-cli/tsconfig.web.base.json` / `tsconfig.server-logic.base.json`.
  Previous versions inlined the compiler options in the consumer's tsconfig.
- `powpow init` sanitizes the package name produced by `<pm> init` (lowercase,
  npm-safe characters, ≤214 chars) so directories with uppercase letters or
  spaces don't yield invalid `package.json` names.
- `powpow add` now creates **empty** source files rather than scaffolding a
  default React/server-logic template. Lets you start from a blank slate.
- Web-template and web-file builds now route chunk content through the
  in-memory `outputCollector` and call `bundle.generate()` instead of
  `bundle.write()`, so Rolldown no longer leaves an empty `dist/` in the
  user's project directory.
- Incremental rebuilds now skip disk writes whose content is unchanged
  (`lastWritten` map per portal `contentPath`).
- `Microsoft` Power Pages global is exposed both as a `Window` member and as a
  `'Microsoft'` ambient module so consumers can `import` it as well as
  reference `window.Microsoft`.

### Fixed

- Watch mode no longer re-bundles entries whose loaded files
  (`bundle.watchFiles`) didn't change, eliminating spurious rebuild log noise.

### Tooling (repo-internal)

- `.claude/` scaffolding for AI-assisted development: shared `settings.json`
  with strict PostToolUse lint/typecheck hook, a Stop hook that prompts for
  post-change actions when uncommitted code changes haven't been processed,
  slash commands `/verify`, `/test-changed`, `/scratch-build`, `/post-change`,
  and split docs under `.claude/docs/` (build-pipeline, module-resolution,
  build-state-machine, troubleshooting, verification-checklist).
- New npm scripts: `pnpm typecheck` (`tsc --noEmit`) and `pnpm verify`
  (lint + typecheck + tests).
- New `.github/PULL_REQUEST_TEMPLATE.md`.

## 0.3.0

A major refactor adding **server-logic** as a first-class entry-point type,
simplifying the source layout, and bundling the Power Pages global typings
inside the package. Breaking changes — see the migration notes below.

### Server logic support

- New entry-point type `server-logic`, alongside `web-template` and `web-file`.
  Server-logic entries are bundled with `platform: 'node'`, no UMD globals,
  and **all imports inlined** (cross-entry imports throw at build time). Output
  is plain ESM written directly to the portal's `server-logic/<name>.js` (no
  `<script>` wrapper, no cache-bust rewriting).
- `scanPortalResources` discovers server-logic resources via
  `<root>/*.serverlogic.yml` (configurable; default root `server-logic`),
  reading `adx_serverlogicid` and `adx_name`.

### Strict, type-scoped source layout (replaces ownership model)

- The "deepest-directory-wins" ownership model is gone. Entry-point sources
  must now be **direct children** of one of three configurable roots under
  `sourceDir`:
  - `web-templates/` — for `web-template` targets
  - `web-files/` — for `web-file` targets
  - `server-logic/` — for `server-logic` targets
- The root determines the entry's type; a mismatch with the target GUID's
  resource type is a hard validation error.
- Anything outside these roots is library code only — never an entry point.
- `roots` is configurable in `powpow.config.json` if you need different folder
  names.
- `src/ownership.ts` deleted; replaced by `src/entries.ts` exposing
  `resolveEntries` and `findEntryForFile` (exact-source match only).

### Built-in globals — no config required

- React, ReactDOM, jQuery, Bootstrap, `shell`, and `Microsoft` (Dynamic365
  Portal) are now **always-on** UMD globals for browser entries. Drop them
  from your `powpow.config.json` `globals` map; they're applied automatically.
- `globals` in user config now adds to / overrides the defaults.
- Server-logic entries have **no** browser globals available, only the `Server`
  global from the Power Pages server-side runtime.

### Bundled typings

- `Portal.d.ts`, `Shell.d.ts`, and `ServerAPI.d.ts` now ship inside
  `powpow-cli` under `types/`. Plus aggregator entry points:
  - `powpow-cli/types/browser` — Portal, Shell, and ambient module stubs for
    `react`, `react-dom`, `jquery`, `bootstrap`, `shell`, `Microsoft`.
  - `powpow-cli/types/server` — ServerAPI only, no DOM.
- `tsconfig.base.json` now wires up `"types": ["powpow-cli/types/browser"]`
  by default. `powpow init` writes a separate scoped tsconfig in
  `src/server-logic/` that overrides to the server typings and drops DOM lib.
- Consumers no longer need to install `@types/react` etc. for editor support
  (they may still install them for fuller types — declarations merge).

### `powpow init` is now a full bootstrap

- Detects (or prompts for) `npm` vs `pnpm`.
- Creates `package.json` if missing (`<pm> init -y`).
- Installs `powpow-cli` and `typescript` as devDependencies if missing.
- Adds `powpow:dev` and `powpow:build` scripts to `package.json`.
- Scaffolds `src/{web-templates,web-files,server-logic}/` with `.gitkeep`s.
- Writes a root `tsconfig.json` and a server-logic-scoped tsconfig.
- Writes `.powpow/globals/*` shim files via `writeShims`.
- Writes a starter `powpow.config.json`.
- Idempotent — re-running on an existing project skips already-present files.

### `powpow add` is type-aware

- After picking a portal resource, the source filename prompt defaults the
  directory to the matching root and rejects anything else.
- Bare-specifier mode (e.g. `source: "lodash"`) is offered only for `web-file`
  resources.
- Per-type scaffold content (web-template: React render stub, web-file:
  `export {};`, server-logic: `Server.Logger.Log(...)` stub).

### Build-time dependency graph

- After every build, a console summary lists each entry's bundled-module and
  externals counts, warns about modules duplicated across browser entries
  (server-logic is excluded from duplication detection — it has no choice but
  to inline), and lists which UMD globals each entry references.
- No JSON file is written; this is console-only for now.

### Migration notes

- Move existing entry-point sources into `src/web-templates/<name>` or
  `src/web-files/<name>` according to their target type. Files at other paths
  will fail validation.
- The "one entry per directory" restriction is gone — multiple entries inside
  `src/web-files/` are now fine.
- You can drop React/ReactDOM/jQuery/Bootstrap/shell/Microsoft from your
  `globals` config; they're built in.
- Re-run `powpow init` to get the new tsconfig structure and `.powpow/globals`
  shim files for `shell` and `Microsoft`.

### Internal

- `src/plugin/*` now consumes a flat `ResolvedEntry[]` instead of the
  `OwnershipMaps` tree. Resolution decisions are tracked in
  `EntryResolutionLog` so the graph emitter can summarize them after build.

## 0.2.0

A broad correctness, DX, and product pass. No breaking changes to existing
`powpow.config.json` files — all additions are opt-in.

### Correctness

- Normalize every stored path to POSIX at map-build time so ownership resolution
  works correctly on Windows, where `path.resolve()` emits backslashes.
- `validateEntryPoints` now throws when any entry's `target` GUID has no matching
  portal resource; builds no longer silently skip unknown targets.
- Cross-entry re-export from a web-file's subtree is now a hard error (previously
  a warning that produced invalid runtime code). The error message points users
  to either import from the owner entry directly or re-export from its entry
  file.
- Parallel entry builds use `Promise.allSettled`; one bad entry no longer hides
  other successful results, and the command exits non-zero with per-entry
  failure details.
- Watch mode replaces the in-flight boolean with a pending flag: file changes
  during a build no longer vanish — a follow-up rebuild kicks automatically.
- `typeCheck` only resolves on `code === 0`; signal termination propagates as a
  failure instead of silent success.

### Security / Trust

- Dev server binds to `127.0.0.1` by default (was `::` wildcard, reachable by
  LAN). The CORS policy is gated on the configured `extensionId` instead of
  allowing `*`.
- Documented the dev server trust model in the README.

### Developer experience

- `--version` / `-v` flag reads the installed package version.
- `--verbose`, `--quiet`, `--silent` flags drive structured log levels (`log.ts`
  now gates output per level and adds `log.debug`).
- `--skip-typecheck` flag on `build`.
- Cleaner error display by default; full stack traces only with `--verbose`.
- Development builds ship inline source maps; production builds minify.
- Centralized `AbortController`-based signal handling at the CLI top level;
  `watchBuild`, `typeCheck`, and `startDevServer` accept `AbortSignal` and shut
  down cleanly.
- `dev-server` returns the `Server` instance and closes on abort, replacing the
  previous "never closes" behavior.

### New commands

- `powpow doctor` — reports entries with missing targets, missing source files,
  and orphan portal resources.
- `powpow remove` — unmaps a portal resource from the config and optionally
  deletes the source file.

### Config

- New optional `extensionId` field (used for CORS gating).
- New optional per-entry `options` field with `globals` and `minify` overrides,
  merged over project-level settings.
- Schema updated accordingly in `powpow.config.schema.json`.
- `loadConfig` wraps `JSON.parse` errors with the config path.
- `loadAndValidate()` helper consolidates repetitive setup across commands.

### Plugin

- `src/plugin.ts` split into `plugin/context.ts`, `plugin/resolve.ts`,
  `plugin/umd.ts`, and `plugin/output.ts`. Build output is collected before
  writing so cross-entry content hashing is possible.
- Content hashing: web-file outputs get a short sha256 appended to external
  references as `?v=<hash>` for cache-busting.

### Tests & CI

- Vitest suite covering `utils`, `ownership`, `config`, `resources`, the
  resolve-hook, and an end-to-end `build` integration test against a temp
  fixture project. 46 tests total.
- Biome configured for lint/format (`pnpm lint`, `pnpm format`).
- GitHub Actions CI workflow runs install, build, lint, and tests on PRs and
  pushes to `main`.

## 0.1.2

- Minor internal refactor to runtime URL handling.
- README updates.
