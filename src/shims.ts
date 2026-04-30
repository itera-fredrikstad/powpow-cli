import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Each shim re-exports the globalThis UMD variable as proper ESM so that
 * Rolldown can statically see named exports and avoid IMPORT_IS_UNDEFINED
 * warnings when third-party packages (e.g. react-router-dom) use named
 * imports from these libraries. The shim files are shipped inside the
 * powpow-cli package under `shims/` and resolved from there at build time.
 */

interface ShimDef {
	/** The globalThis variable name, e.g. "React" */
	globalName: string;
	/** Filename inside the package's `shims/` directory */
	file: string;
}

/** Maps config specifier → shim file + global name. */
export const KNOWN_SHIMS: Record<string, ShimDef> = {
	react: { globalName: 'React', file: 'react.js' },
	'react-dom': { globalName: 'ReactDOM', file: 'react-dom.js' },
	jquery: { globalName: '$', file: 'jquery.js' },
	bootstrap: { globalName: 'bootstrap', file: 'bootstrap.js' },
	shell: { globalName: 'shell', file: 'shell.js' },
	Microsoft: { globalName: 'Microsoft.Dynamic365.Portal', file: 'Microsoft.js' },
};

/**
 * Default browser globals: every KNOWN_SHIMS specifier mapped to its
 * globalThis variable name. Merged into every browser entry's effective
 * globals at build time so users do not need to declare them in config.
 */
export const DEFAULT_BROWSER_GLOBALS: Record<string, string> = Object.fromEntries(
	Object.entries(KNOWN_SHIMS).map(([specifier, shim]) => [specifier, shim.globalName]),
);

/** Sub-path shims: specifiers whose `parent` must exist in KNOWN_SHIMS. */
export const SUBPATH_SHIMS: Record<string, { parent: string; file: string }> = {
	'react/jsx-runtime': { parent: 'react', file: 'react-jsx-runtime.js' },
	'react/jsx-dev-runtime': { parent: 'react', file: 'react-jsx-runtime.js' },
};

/** Absolute path to the shims/ directory inside the powpow-cli package. */
const SHIMS_PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'shims');

/** Resolve a specifier to a shim file path inside the package, or null. */
export function resolveShim(specifier: string, globalsMap: Record<string, string>): string | null {
	const known = KNOWN_SHIMS[specifier];
	if (known && specifier in globalsMap) {
		const path = resolve(SHIMS_PKG_DIR, known.file);
		if (existsSync(path)) return path;
	}

	const sub = SUBPATH_SHIMS[specifier];
	if (sub && sub.parent in globalsMap) {
		const path = resolve(SHIMS_PKG_DIR, sub.file);
		if (existsSync(path)) return path;
	}

	return null;
}
