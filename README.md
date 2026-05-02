[![CI](https://github.com/itera-fredrikstad/powpow-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/itera-fredrikstad/powpow-cli/actions/workflows/ci.yml)
[![Publish to npm](https://github.com/itera-fredrikstad/powpow-cli/actions/workflows/publish.yml/badge.svg)](https://github.com/itera-fredrikstad/powpow-cli/actions/workflows/publish.yml)

# PowPow CLI

PowPow is a Power Pages pro-code development tool that streamlines the development process by offering code transpilation and a local development server. It aims to reduce development iteration time and enable the use of TypeScript for authoring website code assets.

> **Note:** This tool is in early development and is not tested for production use. Use at own risk.

## Features

- **TypeScript & JSX support** — Write Power Pages code in TypeScript/TSX and have it transpiled and bundled automatically
- **Three resource types** — Bundle web-templates, web-files, **and server-logic** (Power Pages server-side scripts) from a single project
- **Rolldown bundler** — Fast, tree-shaken, minified ES module builds powered by [Rolldown](https://rolldown.rs)
- **Local dev server** — Serves built assets over HTTP with CORS support for rapid iteration
- **Incremental watch mode** — On file changes, only the entries that actually depend on the changed file are rebuilt, and outputs whose content didn't change aren't rewritten to disk (browser refresh is still manual today; live-reload is on the [roadmap](./ROADMAP.md))
- **Zero-config globals** — React, ReactDOM, jQuery, Bootstrap, `shell`, and `Microsoft.Dynamic365.Portal` are wired up automatically; just `import { useState } from 'react'`
- **Bundled typings** — Power Pages global typings (`Server`, `Microsoft`, `shell`, plus React/jQuery/etc. ambient stubs) ship in the package; no `@types/*` install needed
- **Build-time dependency graph** — Console summary flags duplicated modules across entries and shows which globals each entry uses
- **Interactive CLI** — `powpow init` bootstraps a project end-to-end (npm/pnpm install, tsconfigs, scaffolding); `powpow add` wires up entry points
- **Companion browser extension** — Use with [PowPow Interceptor](https://github.com/itera-fredrikstad/powpow-interceptor) to live-swap portal assets during development

## Prerequisites

- [Node.js](https://nodejs.org/) **v22** or later
- A Power Pages portal downloaded locally via [`pac powerpages download`](https://learn.microsoft.com/en-us/power-pages/configure/cli-tutorial)

## Quick Start

### 1. Bootstrap a project

In the root of your project (an empty directory is fine), run:

```bash
npx powpow-cli init
```

This single command:

- Asks whether you want **npm** or **pnpm** (auto-detected from existing lockfiles).
- Creates `package.json` if missing, sanitizing the package name derived from the directory.
- Installs `powpow-cli` and `typescript` as devDependencies.
- Adds `powpow:dev` and `powpow:build` scripts to `package.json`.
- Scaffolds the strict source layout: `src/web-templates/`, `src/web-files/`, `src/server-logic/`.
- Writes three tsconfigs:
  - root `tsconfig.json` with TypeScript project `references` to the two below
  - `tsconfig.web.json` extending `powpow-cli/presets/tsconfig.web.base.json` (browser-typed, JSX, DOM lib)
  - `tsconfig.server-logic.json` extending `powpow-cli/presets/tsconfig.server-logic.base.json` (server-typed, no DOM, no JSX)
- Writes a starter `powpow.config.json`.

`init` is idempotent — re-running on an existing project skips files that already exist.

```json
{
  "$schema": "./node_modules/powpow-cli/presets/powpow.config.schema.json",
  "portalConfigPath": "my-portal",
  "entryPoints": []
}
```

### 2. Add entry points

Map a source file to a Power Pages resource (web template, web file, or server logic):

```bash
npx powpow add
```

The interactive prompt lists available portal resources, lets you pick one, and either creates a new source file or links an existing one. The new file is placed in the root that matches the resource type — `src/web-templates/`, `src/web-files/`, or `src/server-logic/` — and is created empty so you can start from a blank slate. The entry is appended to `powpow.config.json`.

### 3. Develop

Start the dev server and watch-mode bundler together:

```bash
npx powpow dev
```

This runs Rolldown in watch mode and starts an HTTP server on port **3001** (configurable via the `PORT` environment variable). Watch mode is incremental — only entries that actually depend on the changed file get rebuilt, and outputs whose final content didn't change aren't rewritten to disk. Built assets are written directly into the portal directory and served by the dev server for use with PowPow Interceptor.

### 4. Build for deployment

Run a full type-check and production build:

```bash
npx powpow build
```

Built output is written to the portal resource content paths defined by your entry points, ready to be committed and deployed.

## Commands

| Command | Description |
| --- | --- |
| `powpow init` | Bootstrap a project: create `powpow.config.json`, scaffold tsconfigs, install deps. Use `--force` to overwrite an existing config. |
| `powpow add` | Scan the portal directory and add a resource → source file mapping. |
| `powpow dev` | Start the dev server and Rolldown in watch mode (incremental rebuilds). |
| `powpow build` | Type-check with `tsc` and build all entry points with Rolldown. |
| `powpow serve` | Start the dev server only (no build/watch). |
| `powpow doctor` | Diagnose config, resource, and source-file issues. |
| `powpow remove` | Unmap a portal resource from an entry point, optionally deleting the source file. |

### Global Options

| Option | Description |
| --- | --- |
| `--config <path>` | Path to `powpow.config.json` (default: `./powpow.config.json`) |
| `--verbose` | Show debug output and full error stack traces. |
| `--quiet` | Only show errors. |
| `--silent` | Suppress all output. |
| `-h`, `--help` | Show help message |
| `-v`, `--version` | Print installed version |

### Command-specific options

| Option | Applies to | Description |
| --- | --- | --- |
| `--force` | `init` | Overwrite an existing `powpow.config.json`. |
| `--skip-typecheck` | `build` | Skip the `tsc` type check before bundling. |

## Configuration

`powpow.config.json` is the single configuration file for a project.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `portalConfigPath` | `string` | Yes | Relative path to the Power Pages portal config root directory. |
| `sourceDir` | `string` | No | Relative path to the TypeScript source directory. Defaults to `src`. |
| `entryPoints` | `EntryPoint[]` | Yes | Array of source-to-resource mappings. Each entry may also carry an `options` object for per-entry overrides (see below). |
| `globals` | `Record<string, string>` | No | Map of package specifiers to `globalThis` variable names (UMD globals). |
| `extensionId` | `string` | No | Chrome extension ID of the PowPow Interceptor. When set, the dev server only accepts requests from `chrome-extension://<id>`. See **Dev Server trust model** below. |
| `version` | `string` | No | Config schema version. |

### Entry Points

Each entry point maps a source file (or bare package specifier) to a Power Pages resource GUID:

```json
{
  "entryPoints": [
    {
      "source": "my-feature/index.tsx",
      "target": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    },
    {
      "source": "lodash",
      "target": "f0e1d2c3-b4a5-6789-0fed-cba987654321"
    }
  ]
}
```

- **File sources** are resolved relative to `sourceDir`.
- **Bare specifiers** (e.g. `lodash`) bundle an installed npm package into the target web file.

An entry may also specify `options` to override project-level settings for that single entry:

```json
{
  "source": "admin/index.tsx",
  "target": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "options": {
    "globals": { "jquery": "jQuery" },
    "minify": false
  }
}
```

`options.globals` is merged over the top-level `globals` (entry keys win). `options.minify` overrides the default for that entry.

### Globals

Use `globals` to reference libraries that are already loaded on the page as UMD globals instead of bundling them:

```json
{
  "globals": {
    "react": "React",
    "react-dom": "ReactDOM",
    "bootstrap": "bootstrap"
  }
}
```

Imports of these packages are replaced with references to `globalThis[variableName]` at build time.

## How It Works

### Build Pipeline

1. **Entry point resolution** — Each entry point is resolved to its source file and target Power Pages resource (web template or web file).
2. **Rolldown bundling** — Source files are bundled as ES modules with tree-shaking and minification.
3. **Output generation** — Web template output is wrapped in a `<script type="module">` tag. Web file output is written as a plain ES module.
4. **Direct write** — Built files are written directly to the portal resource content paths on disk.

### Module Resolution

For every import, the bundler tries three strategies in order:

1. **UMD global** — packages listed in `globals` (or the per-entry `options.globals`) are replaced with `globalThis[name]` references at build time.
2. **Cross-entry external** — if the import resolves to **another entry's exact source file**, it is externalized as a runtime URL with a `?v=<hash>` cache-buster. Behaviour by owner type:
   - imported from a web-file owner → externalized.
   - imported from a web-template owner → warning, then inlined (web-templates can't be loaded as modules).
   - imported from a server-logic owner → error (server-logic entries are not importable).
   - any cross-entry import made from a server-logic entry → error (server-logic must inline everything).
3. **Inlined** — everything else (relative file imports that aren't another entry, npm packages without a UMD shim) is bundled in. Modules inlined by more than one entry are flagged as duplicates in the build summary.

### Ownership Model

Ownership is based on **exact source-file match**: an entry owns the file at its `source` path and nothing else. There is no directory-tree ownership — adjacent files in the same folder are independent unless they are themselves entries.

### Dev Server

The dev server exposes three routes:

| Route | Description |
| --- | --- |
| `GET /manifest` | JSON manifest of all mapped resources with their serve paths |
| `GET /web-templates/:guid` | Serves a web template's built HTML content |
| `GET /web-files/*` | Serves a web file by its partial URL path |

The server is designed to work with the [PowPow Interceptor](https://github.com/itera-fredrikstad/powpow-interceptor) browser extension, which intercepts Power Pages asset requests and redirects them to the local dev server.

### Dev Server trust model

- **Bind address.** The dev server binds to `127.0.0.1` only; it is not reachable from other machines on your network.
- **CORS.** By default (no `extensionId` in config), the dev server responds with `Access-Control-Allow-Origin: *`. Any page open in your browser can read the `/manifest` endpoint and discover the GUID-to-source mapping of your project. This is convenient for first-run setup but not suitable for environments where the project layout is sensitive.
- **Restricting CORS.** Set `extensionId` in `powpow.config.json` to the Chrome extension ID of your PowPow Interceptor installation. The dev server will then reject any request whose `Origin` header does not match `chrome-extension://<id>`, and the `Access-Control-Allow-Origin` header will echo only that origin.
- **Output cache busting.** Cross-entry imports of web-file resources get a `?v=<hash>` query parameter appended at build time, so browsers and Power Pages caches pick up new builds automatically. Web-template output is an inline `<script type="module">` and is not cached separately.

## TypeScript Configuration

`powpow init` writes three tsconfigs that wire the browser and server-logic worlds together via TypeScript project references:

- **`tsconfig.json`** — solution root. Empty `files`, with `references` to both child configs. Running `tsc -b` from the project root type-checks everything.
- **`tsconfig.web.json`** — browser entries (`src/web-templates/`, `src/web-files/`). Extends `powpow-cli/presets/tsconfig.web.base.json` (ES2023 target, DOM lib, React JSX transform, and the Power Pages browser globals from `powpow-cli/types/browser`).
- **`tsconfig.server-logic.json`** — server-logic entries (`src/server-logic/`). Extends `powpow-cli/presets/tsconfig.server-logic.base.json` (ES2023, no DOM, no JSX, and the `Server` global from `powpow-cli/types/server`).

Both base configs are shipped inside the `powpow-cli` package, so upgrading the CLI updates the compiler options. Each child config `include`s its own root only, so a single editor instance type-checks each directory with the right ambient types in scope.

## Programmatic API

PowPow exports its core modules for programmatic use:

```typescript
import {
  // Build
  build,
  watchBuild,
  typeCheck,
  // Config
  findConfig,
  loadConfig,
  loadAndValidate,
  saveConfig,
  validateEntryPoints,
  resolvePortalDir,
  resolveProjectRoot,
  resolveSourceDir,
  // Dev server
  startDevServer,
  // Bundler plugin
  powpow,
  // Resources
  scanPortalResources,
  // Logging
  log,
  setLogLevel,
  getLogLevel,
} from 'powpow-cli';

import type {
  PowpowConfig,
  EntryPoint,
  EntryPointOverrides,
  PortalResource,
  ResourceType,
  LogLevel,
} from 'powpow-cli';
```

## Contributing

Bug reports and feature requests are welcome on the [GitHub issue tracker](https://github.com/itera-fredrikstad/powpow-cli/issues). Pull requests welcome too.

### Local development

```bash
git clone https://github.com/itera-fredrikstad/powpow-cli.git
cd powpow-cli
pnpm install --frozen-lockfile
pnpm build
```

Requires Node.js ≥22 and pnpm 10.

### Before opening a PR

CI runs the equivalent of these three commands on every PR — please run them locally first so the feedback loop stays fast:

```bash
pnpm lint
pnpm test
pnpm build
```

### Code style

[Biome](https://biomejs.dev/) handles formatting and linting:

- `pnpm format` — auto-format
- `pnpm lint:fix` — auto-fix lint issues
- `pnpm lint` — check only (what CI runs)

### Pull request guidelines

- Keep PRs small and focused on a single concern.
- Describe the user-facing change in the PR body.
- For changes to `dev`, watch mode, or the bundler plugin, include a short manual repro plan (which entry types, what change you made, what you expected to rebuild).
- Don't bump the package version in your PR — releases are cut by maintainers via the `publish.yml` workflow on tagged commits.

## License

[ISC](LICENSE)
