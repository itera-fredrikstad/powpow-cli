# Changelog

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
