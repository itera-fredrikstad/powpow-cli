# PowPow CLI — Roadmap

Deferred items from the 2026-04-17 full code review. Items are grouped by theme. Each entry links back to its review-section identifier (`§N.M`) for traceability.

## Developer Experience

- **Hot reload via SSE / WebSocket** (§4.2, §6.1). The watch loop already rebuilds on change; what's missing is a signal to the browser so the PowPow Interceptor extension can live-swap portal assets without a manual refresh. Cheapest path: a `/events` SSE endpoint that emits `rebuild` after each successful build.
- **Port validation with clear error** (§1.10). `parseInt(process.env.PORT ?? '3001', 10)` silently yields `NaN` on typos and lets the server listen on a random port.
- **Resource-type filter in `powpow add`**. Before listing portal targets, prompt for *web-templates*, *web-files*, or *server-logic* so the picker isn't a flat list of every resource in the portal. Big portals make the current picker hard to navigate.

## Correctness / Robustness

- **Schema-validated YAML parsing** (§1.12). `resources.ts` currently casts parsed YAML to `Record<string, any>` and silently skips resources with falsy ids. A zod schema (or similar) would catch malformed portal metadata early and surface it.
- **Cross-platform file watcher** (§3.7). `fs.watch({ recursive: true })` is unreliable on Linux and flaky with editor atomic-save patterns. Migrate to `chokidar` when cross-platform reliability becomes a support issue.

## Config / CLI

- **Proper CLI argument parser** (§3.5). Manual parsing in `cli.ts` is fine today. Migrate to `citty`/`commander` once subcommands or ≥3 flags per command appear.
- **Schema-driven config validation** (§6.8). `powpow.config.schema.json` exists but `loadConfig` hand-rolls validation. Run the config through an Ajv-compiled validator so every error is uniform and auto-documented.

## Performance

- **Persistent Rolldown controller across rebuilds** (§5.1). Each rebuild currently spins N Rolldown instances from scratch. Defer until measured slowness is reported.
- **Async portal scan** (§5.2). `scanPortalResources` reads every YAML serially. Fine at current project sizes; revisit if portals grow large.

## Product

- **First-class static-asset support** (§6.2). Currently only JS/TS entry points are handled. Real portal projects include CSS, images, fonts. Design: `web-file` entries pointing at plain files get copy-through with correct content-type; CSS imports from TS bundle into a sibling web-file.
- **CSS / SCSS support**. Treat `.css` / `.scss` files as first-class entry points (or as imports from TS that bundle into a sibling web-file). SCSS needs a preprocessor pass before Rolldown sees it; CSS can flow through Rolldown directly. Overlaps with §6.2 — likely lands together.
- **`powpow publish` — deploy pipeline** (§6.6). A wrapper around the Power Platform CLI (`pac`) that pushes built output back to the portal, closing the edit-deploy loop.

---

## Completed (moved out of roadmap)

> Items land here as they ship. Reference in CHANGELOG entries.

_(none yet — see CHANGELOG.md)_
