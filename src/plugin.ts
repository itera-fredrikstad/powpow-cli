import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import type { PortalResource } from './types.js';
import type { Plugin } from 'rolldown';
import { scanPortalResources } from './resources.js';
import { isBareSpecifier } from './utils.js';
import { buildOwnershipMaps, findOwner } from './ownership.js';
import { log } from './log.js';

const UMD_VIRTUAL_PREFIX = 'virtual:umd-global:';
const RUNTIME_URL_PREFIX = 'powpow-runtime:';

interface PowPowPluginOptions {
	portalDir: string;
	entry: { source: string; target: string };
	root?: string;
	sourceDir: string;
	globals?: Record<string, string>;
	/** All entry points (for cross-entry resolution) */
	allEntries: { source: string; target: string }[];
	/** Shared map tracking which packages are inlined by which entries (for dedup warnings) */
	inlinedPackages: Map<string, Set<string>>;
	/** Pre-scanned resource map (avoids re-scanning per entry) */
	resourceMap?: Map<string, PortalResource>;
}

export function powpow({
	portalDir,
	entry,
	root: rootOpt,
	sourceDir,
	globals,
	allEntries,
	inlinedPackages,
	resourceMap: preScannedMap,
}: PowPowPluginOptions): {
	input: Record<string, string>;
	plugin: Plugin;
} {
	const root = rootOpt ? resolve(rootOpt) : process.cwd();
	const absPortalDir = resolve(root, portalDir);
	const absSourceDir = resolve(root, sourceDir);
	const resourceMap = preScannedMap ?? scanPortalResources(absPortalDir);
	const globalsMap = globals ?? {};

	const { dirOwners, rootFileOwners, packageEntries } = buildOwnershipMaps(allEntries, resourceMap, absSourceDir);

	// Determine current entry's subdir context
	const currentResource = resourceMap.get(entry.target);
	if (!currentResource) {
		log.warn(`Skipping entry "${entry.source}" → GUID "${entry.target}" not found in portal config`);
		return { input: { __empty__: 'virtual:powpow-empty' }, plugin: { name: 'powpow-noop' } };
	}

	let currentAbsSubdir: string | null = null;
	if (!isBareSpecifier(entry.source)) {
		const relSource = relative(absSourceDir, resolve(absSourceDir, entry.source));
		const dir = dirname(relSource);
		if (dir !== '.') {
			currentAbsSubdir = resolve(absSourceDir, dir);
		}
	}

	const input: Record<string, string> = {};
	if (isBareSpecifier(entry.source)) {
		input[entry.target] = entry.source;
	} else {
		input[entry.target] = resolve(absSourceDir, entry.source);
	}

	const plugin: Plugin = {
		name: 'powpow',

		resolveId(specifier, importer) {
			if (specifier === 'virtual:powpow-empty') return specifier;

			// --- UMD globals (highest priority) ---
			if (specifier.startsWith(UMD_VIRTUAL_PREFIX)) return specifier;
			if (specifier in globalsMap) {
				return { id: UMD_VIRTUAL_PREFIX + specifier };
			}

			// --- Bare specifier (npm package) imports ---
			if (importer && isBareSpecifier(specifier)) {
				const pkgResource = packageEntries.get(specifier);
				if (pkgResource) {
					if (pkgResource.type === 'web-file') {
						// Externalize: resolve to the web-file's runtime URL
						return { id: RUNTIME_URL_PREFIX + pkgResource.runtimeUrl!, external: true };
					}
					if (pkgResource.type === 'web-template') {
						log.warn(
							`Package "${specifier}" is owned by a web-template entry. ` +
							`Inlining into "${entry.source}" (web-templates cannot be imported as modules).`,
						);
					}
					// web-template owner: inline (web-templates cannot be imported as modules)
					return null;
				}

				// No entry owns this package — inline it and track for dedup warnings
				let entrySet = inlinedPackages.get(specifier);
				if (!entrySet) {
					entrySet = new Set();
					inlinedPackages.set(specifier, entrySet);
				}
				entrySet.add(entry.target);
				return null;
			}

			if (!importer) return null;

			// --- Relative / absolute source file imports ---
			if (specifier.startsWith('.') || specifier.startsWith('/')) {
				const importerDir = dirname(importer);
				const resolved = resolve(importerDir, specifier);

				// Try each extension and index-file variant to find a matching owner
				const suffixes = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
				for (const ext of suffixes) {
					const candidate = resolved + ext;

					// Same-subdir check: if current entry has a subdir and the target is under it, inline
					if (currentAbsSubdir && candidate.startsWith(currentAbsSubdir + '/')) {
						return null; // inline — same subdir
					}

					// Cross-subdir / root-level importer: check ownership
					const owner = findOwner(candidate, dirOwners, rootFileOwners);

					if (owner) {
						if (owner.resource.type === 'web-file') {
							// Externalize to the owner's web-file URL
							if (candidate !== owner.absSource) {
								log.warn(
									`"${entry.source}" imports "${specifier}" which is owned by ` +
									`entry "${owner.source}" but is not its entry point file. ` +
									`Consider importing from "${owner.source}" directly.`,
								);
							}
							return { id: RUNTIME_URL_PREFIX + owner.resource.runtimeUrl!, external: true };
						}
						if (owner.resource.type === 'web-template') {
							log.warn(
								`"${entry.source}" imports "${specifier}" which is owned by ` +
								`web-template entry "${owner.source}". Inlining — this will duplicate code ` +
								`across entry points.`,
							);
							return null;
						}
					}

					// No owner — inline silently
				}

				return null;
			}

			return null;
		},

		load(id) {
			if (id === 'virtual:powpow-empty') return '';

			// Generate UMD global shim code
			if (id.startsWith(UMD_VIRTUAL_PREFIX)) {
				const specifier = id.slice(UMD_VIRTUAL_PREFIX.length);
				const globalName = globalsMap[specifier];
				if (!globalName) return null;

				// JSX runtime special case: export named jsx, jsxs, Fragment
				if (specifier.endsWith('/jsx-runtime')) {
					return [
						`var __g = globalThis[${JSON.stringify(globalName)}];`,
						`export var jsx = __g.createElement;`,
						`export var jsxs = __g.createElement;`,
						`export var Fragment = __g.Fragment;`,
					].join('\n');
				}

				return `export default globalThis[${JSON.stringify(globalName)}];\n`;
			}

			return null;
		},

		renderChunk(code) {
			if (!code.includes(RUNTIME_URL_PREFIX)) return null;
			return code.replaceAll(RUNTIME_URL_PREFIX, '');
		},

		generateBundle(_, bundle) {
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'chunk' || !chunk.isEntry) continue;

				const guid = fileName;
				const entry = resourceMap.get(guid);
				if (!entry) continue;

				let output = chunk.code;

				switch (entry.type) {
					case 'web-template':
						output = `<script type="module" data-webtemplate-id="${entry.guid}">\n${output}\n</script>\n`;
						break;
					case 'web-file':
						// ES module as-is
						break;
				}

				mkdirSync(dirname(entry.contentPath), { recursive: true });
				writeFileSync(entry.contentPath, output);
				log.success(`${entry.type} "${entry.name}" → ${entry.contentPath}`);

				delete bundle[fileName];
			}
		},
	};

	return { input, plugin };
}
