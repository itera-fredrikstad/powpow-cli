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
- **Watch mode** — Rebuilds on file changes with minimal delay (browser refresh is still manual today; live-reload is on the [roadmap](./ROADMAP.md))
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
- Creates `package.json` if missing.
- Installs `powpow-cli` and `typescript` as devDependencies.
- Adds `powpow:dev` and `powpow:build` scripts to `package.json`.
- Scaffolds the strict source layout: `src/web-templates/`, `src/web-files/`, `src/server-logic/`.
- Writes a root `tsconfig.json` (browser-typed) and a separate `src/server-logic/tsconfig.json` (server-typed, no DOM).
- Writes the `.powpow/globals/*` shim files for the built-in UMD globals.
- Writes a starter `powpow.config.json`.

`init` is idempotent — re-running on an existing project skips files that already exist.

```json
{
  "$schema": "./node_modules/powpow-cli/powpow.config.schema.json",
  "portalConfigPath": "my-portal",
  "entryPoints": []
}
```

### 2. Add entry points

Map a source file to a Power Pages resource (web template, web file, or server logic):

```bash
npx powpow add
```

The interactive prompt lists available portal resources, lets you pick one, and either creates a new source file or links an existing one. The new file is placed in the root that matches the resource type — `src/web-templates/`, `src/web-files/`, or `src/server-logic/` — and stubbed with sensible starter content. The entry is appended to `powpow.config.json`.

### 3. Develop

Start the dev server and watch-mode bundler together:

```bash
npx powpow dev
```

This runs Rolldown in watch mode and starts an HTTP server on port **3001** (configurable via the `PORT` environment variable). Built assets are written directly into the portal directory and served by the dev server for use with PowPow Interceptor.

### 4. Build for deployment

Run a full type-check and production build:

```bash
npx powpow build
```

Built output is written to the portal resource content paths defined by your entry points, ready to be committed and deployed.

## Commands

| Command | Description |
| --- | --- |
| `powpow init` | Create a new `powpow.config.json` interactively. Use `--force` to overwrite an existing config. |
| `powpow add` | Scan the portal directory and add a resource → source file mapping. |
| `powpow dev` | Start the dev server and Rolldown in watch mode. |
| `powpow build` | Type-check with `tsc` and build all entry points with Rolldown. |
| `powpow serve` | Start the dev server only (no build/watch). |
| `powpow doctor` | Diagnose config, resource, and source-file issues. |
| `powpow remove` | Unmap a portal resource from an entry point, optionally deleting the source file. |

### Global Options

| Option | Description |
| --- | --- |
| `--config <path>` | Path to `powpow.config.json` (default: `./powpow.config.json`) |
| `--skip-typecheck` | Skip the `tsc` type check when running `build`. |
| `--verbose` | Show debug output and full error stack traces. |
| `--quiet` | Only show errors. |
| `--silent` | Suppress all output. |
| `-h`, `--help` | Show help message |
| `-v`, `--version` | Print installed version |

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

The bundler uses an ownership model to decide how imports are handled:

- **UMD globals** — Packages listed in `globals` are shimmed as `globalThis` references (highest priority).
- **Cross-entry externals** — If an import resolves to a file owned by another web-file entry point, it is externalized as a URL import using the resource's runtime path.
- **Inlined modules** — Same-directory imports and npm packages used by web-template entries are inlined into the bundle.

### Ownership Model

Each subdirectory-based entry point owns all files in its directory tree. When multiple entries could claim a file, the deepest (most specific) directory wins. Root-level entries own only their exact source file.

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

PowPow ships a `tsconfig.base.json` that consuming projects can extend for type-checking their browser-targeted source files:

```json
{
  "extends": "powpow-cli/tsconfig.base.json",
  "include": ["src"]
}
```

This base config targets ES2023 with DOM types, enables JSX (React JSX transform), strict mode, and bundler module resolution.

## Programmatic API

PowPow exports its core modules for programmatic use:

```typescript
import {
  build,
  watchBuild,
  typeCheck,
  startDevServer,
  powpow,
  scanPortalResources,
  findConfig,
  loadConfig,
  saveConfig,
} from 'powpow-cli';
```

## License

[ISC](LICENSE)
