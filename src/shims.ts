import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SHIMS_DIR = '.powpow/globals';

/**
 * Known UMD global shim definitions.
 *
 * Each shim re-exports the globalThis UMD variable as proper ESM so that
 * Rolldown can statically see named exports and avoid IMPORT_IS_UNDEFINED
 * warnings when third-party packages (e.g. react-router-dom) use named
 * imports from these libraries.
 */
interface ShimDef {
	/** The globalThis variable name, e.g. "React" */
	globalName: string;
	/** File content for the shim module */
	code: string;
}

const REACT_SHIM = `\
var __g = globalThis["React"];
export default __g;
export var {
	Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
	cloneElement, createContext, createElement, createFactory, createRef,
	forwardRef, isValidElement, lazy, memo,
	startTransition, version,
	useCallback, useContext, useDebugValue, useDeferredValue, useEffect,
	useId, useImperativeHandle, useInsertionEffect, useLayoutEffect,
	useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition,
} = __g;
`;

const REACT_JSX_RUNTIME_SHIM = `\
var __g = globalThis["React"];
export var jsx = __g.createElement;
export var jsxs = __g.createElement;
export var jsxDEV = __g.createElement;
export var Fragment = __g.Fragment;
`;

const REACT_DOM_SHIM = `\
var __g = globalThis["ReactDOM"];
export default __g;
export var {
	createPortal, findDOMNode, flushSync, hydrate, render,
	unmountComponentAtNode, version,
} = __g;
`;

const JQUERY_SHIM = `\
export default globalThis["$"];
`;

const BOOTSTRAP_SHIM = `\
var __g = globalThis["bootstrap"];
export default __g;
export var {
	Alert, Button, Carousel, Collapse, Dropdown, Modal,
	Offcanvas, Popover, ScrollSpy, Tab, Toast, Tooltip,
} = __g;
`;

const SHELL_SHIM = `\
var __g = globalThis["shell"];
export default __g;
export var { ajaxSafePost, getTokenDeferred, refreshToken } = __g;
`;

const MICROSOFT_SHIM = `\
var __g = globalThis["Microsoft"].Dynamic365.Portal;
export default __g;
export var {
	User, version, type, id, geo, tenant, correlationId,
	orgEnvironmentId, orgId, portalProductionOrTrialType,
	isTelemetryEnabled, InstrumentationSettings,
	timerProfileForBatching, activeLanguages, isClientApiEnabled,
	dynamics365PortalAnalytics,
} = __g;
`;

/** Maps config specifier → shim filename + definition. */
export const KNOWN_SHIMS: Record<string, { file: string; def: ShimDef }> = {
	react: { file: 'react.js', def: { globalName: 'React', code: REACT_SHIM } },
	'react-dom': { file: 'react-dom.js', def: { globalName: 'ReactDOM', code: REACT_DOM_SHIM } },
	jquery: { file: 'jquery.js', def: { globalName: '$', code: JQUERY_SHIM } },
	bootstrap: { file: 'bootstrap.js', def: { globalName: 'bootstrap', code: BOOTSTRAP_SHIM } },
	shell: { file: 'shell.js', def: { globalName: 'shell', code: SHELL_SHIM } },
	Microsoft: {
		file: 'Microsoft.js',
		def: { globalName: 'Microsoft.Dynamic365.Portal', code: MICROSOFT_SHIM },
	},
};

/**
 * Default browser globals map: every KNOWN_SHIMS specifier mapped to its
 * globalThis variable name. Phase 2 merges this into the effective globals
 * for browser entries; Phase 4 uses it during init scaffolding.
 */
export const DEFAULT_BROWSER_GLOBALS: Record<string, string> = Object.fromEntries(
	Object.entries(KNOWN_SHIMS).map(([specifier, shim]) => [specifier, shim.def.globalName]),
);

/**
 * Sub-path shims: specifiers that are sub-paths of a known global.
 * The `parent` key must exist in KNOWN_SHIMS.
 */
export const SUBPATH_SHIMS: Record<string, { parent: string; file: string; code: string }> = {
	'react/jsx-runtime': { parent: 'react', file: 'react-jsx-runtime.js', code: REACT_JSX_RUNTIME_SHIM },
	'react/jsx-dev-runtime': { parent: 'react', file: 'react-jsx-runtime.js', code: REACT_JSX_RUNTIME_SHIM },
};

/**
 * Write all known shim files into `<projectRoot>/.powpow/globals/`.
 * Only writes shims whose parent specifier appears in the given globals map.
 */
export function writeShims(projectRoot: string, globals: Record<string, string>): void {
	const dir = resolve(projectRoot, SHIMS_DIR);
	mkdirSync(dir, { recursive: true });

	for (const [specifier, shim] of Object.entries(KNOWN_SHIMS)) {
		if (specifier in globals) {
			writeFileSync(resolve(dir, shim.file), shim.def.code);
		}
	}

	for (const sub of Object.values(SUBPATH_SHIMS)) {
		if (sub.parent in globals) {
			writeFileSync(resolve(dir, sub.file), sub.code);
		}
	}
}

/**
 * Resolve a specifier to a shim file path, or `null` if it has no known shim.
 */
export function resolveShim(
	specifier: string,
	projectRoot: string,
	globalsMap: Record<string, string>,
): string | null {
	// Direct match (e.g. "react", "jquery")
	const known = KNOWN_SHIMS[specifier];
	if (known && specifier in globalsMap) {
		const path = resolve(projectRoot, SHIMS_DIR, known.file);
		if (existsSync(path)) return path;
	}

	// Sub-path match (e.g. "react/jsx-runtime")
	const sub = SUBPATH_SHIMS[specifier];
	if (sub && sub.parent in globalsMap) {
		const path = resolve(projectRoot, SHIMS_DIR, sub.file);
		if (existsSync(path)) return path;
	}

	return null;
}
