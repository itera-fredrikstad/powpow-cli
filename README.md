[![Publish to npm](https://github.com/meidellkraft/powpow-cli/actions/workflows/publish.yml/badge.svg)](https://github.com/meidellkraft/powpow-cli/actions/workflows/publish.yml)

# PowPow CLI

PowPow is a Power Pages pro-code development tool that streamlines the development process by offering code transpilation and a local development server. It aims to reduce development iteration time and enable the use of TypeScript for authoring website code assets.

> **Note:** This tool is in early development and is not tested for production use. Use at own risk.

## Features

- **TypeScript & JSX support** — Write Power Pages code in TypeScript/TSX and have it transpiled and bundled automatically
- **Rolldown bundler** — Fast, tree-shaken, minified ES module builds powered by [Rolldown](https://rolldown.rs)
- **Local dev server** — Serves built assets over HTTP with CORS support for rapid iteration
- **Watch mode** — Rebuilds on file changes with minimal delay
- **Interactive CLI** — Guided setup and resource mapping with `init` and `add` commands
- **UMD globals** — Reference libraries like React or Bootstrap from `globalThis` instead of bundling them
- **Smart module resolution** — Automatic inlining, externalizing, or shimming of imports based on entry point ownership
- **Companion browser extension** — Use with [PowPow Interceptor](https://github.com/meidellkraft/powpow-interceptor) to live-swap portal assets during development

## Prerequisites

- [Node.js](https://nodejs.org/) **v22** or later
- A Power Pages portal downloaded locally via [`pac powerpages download`](https://learn.microsoft.com/en-us/power-pages/configure/cli-tutorial)

## Installation

```bash
npm install powpow-cli
```

Or with pnpm:

```bash
pnpm add powpow-cli
```

TypeScript is an optional peer dependency. Install it if your source files use `.ts` / `.tsx`:

```bash
pnpm add -D typescript
```

## Quick Start

### 1. Initialize configuration

Run `powpow init` in the root of your project. The wizard will ask for the path to your downloaded Power Pages portal directory and a source directory for your TypeScript files.

```bash
npx powpow init
```

This creates a `powpow.config.json` file:

```json
{
  "$schema": "./node_modules/powpow-cli/powpow.config.schema.json",
  "version": "1.0",
  "portalConfigPath": "my-portal",
  "sourceDir": "src",
  "entryPoints": []
}
```

### 2. Add entry points

Map a source file to a Power Pages resource (web template or web file):

```bash
npx powpow add
```

The interactive prompt will list available portal resources, let you pick one, and either create a new source file or link an existing one. The resulting entry point is saved to `powpow.config.json`.

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

### Global Options

| Option | Description |
| --- | --- |
| `--config <path>` | Path to `powpow.config.json` (default: `./powpow.config.json`) |
| `-h`, `--help` | Show help message |

## Configuration

`powpow.config.json` is the single configuration file for a project.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `portalConfigPath` | `string` | Yes | Relative path to the Power Pages portal config root directory. |
| `sourceDir` | `string` | No | Relative path to the TypeScript source directory. Defaults to `src`. |
| `entryPoints` | `EntryPoint[]` | Yes | Array of source-to-resource mappings. |
| `globals` | `Record<string, string>` | No | Map of package specifiers to `globalThis` variable names (UMD globals). |
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

### Globals

Use `globals` to reference libraries that are already loaded on the page as UMD globals instead of bundling them:

```json
{
  "globals": {
    "react": "React",
    "react-dom": "ReactDOM",
    "jquery": "jQuery"
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

The server is designed to work with the [PowPow Interceptor](https://github.com/meidellkraft/powpow-interceptor) browser extension, which intercepts Power Pages asset requests and redirects them to the local dev server.

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
