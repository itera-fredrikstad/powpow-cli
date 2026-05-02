# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PowPow CLI is a pro-code development tool for Microsoft Power Pages. It bundles TypeScript/TSX source files into Power Pages portal resources (web-templates, web-files, and server-logic) using Rolldown, and serves them locally via a dev server that pairs with the PowPow Interceptor browser extension.

## Critical rules

- **Never produce a `dist/` for user projects.** Chunks must route through `outputCollector` in `src/plugin/output.ts`; we call `bundle.generate()`, never `write()`. Built code lands directly in the Power Pages portal directory.
- **Entry ownership is exact-source-match** (`findEntryForFile` in `src/entries.ts`), not directory-tree. Don't introduce path-prefix matching.
- **Server-logic entries inline everything.** Cross-entry imports *from* a server-logic entry throw; cross-entry imports *of* a server-logic entry throw.
- **Before editing `src/build.ts` or `src/plugin/**`, read [`.claude/docs/build-state-machine.md`](.claude/docs/build-state-machine.md).** The dev-mode incremental rebuild state machine is fragile — every mutation must clean up the right state up-front.
- **Run `/verify` before declaring work complete.** It runs lint + typecheck + tests in one pass.

## Commands

- `pnpm install --frozen-lockfile` — install deps
- `pnpm build` — compile this CLI (`tsc`)
- `pnpm dev` — `tsc --watch`
- `pnpm lint` / `pnpm lint:fix` — Biome
- `pnpm format` — Biome formatter
- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm verify` — lint + typecheck + tests (the `/verify` slash command runs this)

CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm build`, `pnpm test` on every PR. `publish.yml` publishes to npm on tagged versions.

## Slash commands

- `/verify` — full pre-commit check (lint + typecheck + test).
- `/test-changed` — run vitest only for files changed vs `main`.
- `/scratch-build` — rebuild the CLI and run it against `/private/tmp/powpow-scratch` as an end-to-end smoke test.
- `/post-change` — after code changes, present a multi-select menu: **(1) Update docs** (README + `.claude/`, NOT changelog/roadmap), **(2) Bump version** (with suggested patch/minor/major; updates CHANGELOG and ROADMAP), **(3) Commit to current branch**. The Stop hook auto-invokes this when uncommitted code changes haven't been processed yet.

## Source layout

- `src/cli.ts` — argv parser + command dispatch
- `src/commands/` — one file per subcommand: `init`, `add`, `remove`, `build`, `dev`, `serve`, `doctor`
- `src/build.ts` — orchestrates per-entry Rolldown builds; holds the dev-mode incremental rebuild state machine
- `src/config.ts` — loads/validates `powpow.config.json`
- `src/entries.ts` — `resolveEntries`, `findEntryForFile` (exact-source-match ownership lookup)
- `src/resources.ts` — discovers portal resources by globbing YAML metadata
- `src/dev-server.ts` — HTTP server with CORS + optional extension-origin gating
- `src/graph.ts` — build-summary printing (duplicates, externals, globals)
- `src/shims.ts` — built-in shim source files for React/jQuery/Bootstrap/etc., shipped inside the package
- `src/plugin/` — the Rolldown plugin, split into:
  - `index.ts` — composes the plugin
  - `resolve.ts` — module resolution (the three-tier logic)
  - `umd.ts` — synthesizes virtual UMD-global modules + `load` hook
  - `output.ts` — `generateBundle` + `renderChunk` hooks; routes chunk content into the shared `outputCollector`
  - `context.ts` — shared types: `EntryResolutionLog`, `CollectedOutput`, `PluginContext`
- `src/types.ts` — public types (`PowpowConfig`, `EntryPoint`, `PortalResource`, …)
- `src/log.ts`, `src/pm.ts`, `src/utils.ts` — small helpers

The public programmatic API is exported from `src/index.ts`.

## Docs index

Detailed documentation lives under `.claude/docs/`:

- [`build-pipeline.md`](.claude/docs/build-pipeline.md) — what `powpow build` does end-to-end, plus key design decisions.
- [`module-resolution.md`](.claude/docs/module-resolution.md) — the three-tier resolver and the cross-entry behaviour matrix.
- [`build-state-machine.md`](.claude/docs/build-state-machine.md) — `watchBuild`'s `BuildState`, partial-rebuild correctness, and the checklist for changing it.
- [`troubleshooting.md`](.claude/docs/troubleshooting.md) — symptoms and where to look first.
- [`verification-checklist.md`](.claude/docs/verification-checklist.md) — pre-commit / pre-PR checklist.

## Tech stack

- TypeScript 6, ES modules (`"type": "module"`)
- Node.js ≥22, pnpm 10
- Rolldown (Rust-based bundler) for user-project bundling
- Biome for lint + format
- Vitest for tests
- `tsc` only for compiling this CLI itself
- GitHub Actions for CI and npm publish
