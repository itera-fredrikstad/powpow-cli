import { dirname, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { findEntryForFile, type ResolvedEntry } from '../entries.js';
import { log } from '../log.js';
import { resolveShim } from '../shims.js';
import { isBareSpecifier, toPosix } from '../utils.js';
import { type PluginContext, RUNTIME_URL_PREFIX, UMD_VIRTUAL_PREFIX } from './context.js';

const SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

export function createResolveIdHook(ctx: PluginContext): Plugin['resolveId'] {
	const { currentEntry, entries, globalsMap, inlinedPackages, resolutionLog } = ctx;
	const isServerLogic = currentEntry.type === 'server-logic';

	function findBareEntry(specifier: string): ResolvedEntry | null {
		for (const e of entries) {
			if (e.absSource === null && e.source === specifier) return e;
		}
		return null;
	}

	return (specifier, importer) => {
		// --- UMD globals (highest priority) ---
		if (specifier.startsWith(UMD_VIRTUAL_PREFIX)) return specifier;

		// Prefer shim files for known globals
		const shimPath = resolveShim(specifier, globalsMap);
		if (shimPath) return shimPath;

		if (specifier in globalsMap) {
			const globalName = globalsMap[specifier];
			resolutionLog?.externalized.push({ specifier, via: 'umd-global', global: globalName });
			resolutionLog?.globalsUsed.add(globalName);
			return { id: UMD_VIRTUAL_PREFIX + specifier };
		}

		// --- Bare specifier (npm package) imports ---
		if (importer && isBareSpecifier(specifier)) {
			const bareEntry = findBareEntry(specifier);
			if (bareEntry) {
				if (bareEntry.resource.type === 'web-file') {
					if (isServerLogic) {
						throw new Error(
							`server-logic entries must inline all imports; "${specifier}" resolved to another entry "${bareEntry.source}".`,
						);
					}
					resolutionLog?.externalized.push({ specifier, via: 'cross-entry', target: bareEntry.resource.guid });
					return { id: RUNTIME_URL_PREFIX + bareEntry.resource.runtimeUrl!, external: true };
				}
				if (bareEntry.resource.type === 'web-template') {
					log.warn(
						`Package "${specifier}" is owned by a web-template entry. ` +
							`Inlining into "${currentEntry.source}" (web-templates cannot be imported as modules).`,
					);
					return null;
				}
				if (bareEntry.resource.type === 'server-logic') {
					throw new Error(
						`Cannot import server-logic entry "${bareEntry.source}" from "${currentEntry.source}".`,
					);
				}
			}

			// No entry owns this package — inline it and track for dedup warnings
			let entrySet = inlinedPackages.get(specifier);
			if (!entrySet) {
				entrySet = new Set();
				inlinedPackages.set(specifier, entrySet);
			}
			entrySet.add(currentEntry.resource.guid);
			resolutionLog?.bundledModules.add(specifier);
			return null;
		}

		if (!importer) return null;

		// --- Relative / absolute source file imports ---
		if (specifier.startsWith('.') || specifier.startsWith('/')) {
			const importerDir = dirname(importer);
			const resolved = toPosix(resolve(importerDir, specifier));

			// Check if this resolved path matches another entry's source file (across suffixes).
			for (const ext of SUFFIXES) {
				const candidate = resolved + ext;
				const owner = findEntryForFile(candidate, entries);
				if (!owner) continue;
				// Self-import: just inline (rolldown handles it)
				if (owner.resource.guid === currentEntry.resource.guid) return null;

				if (owner.type === 'web-file') {
					if (isServerLogic) {
						throw new Error(
							`server-logic entries must inline all imports; "${specifier}" resolved to another entry "${owner.source}".`,
						);
					}
					resolutionLog?.externalized.push({ specifier, via: 'cross-entry', target: owner.resource.guid });
					return { id: RUNTIME_URL_PREFIX + owner.resource.runtimeUrl!, external: true };
				}
				if (owner.type === 'web-template') {
					if (isServerLogic) {
						throw new Error(
							`server-logic entries must inline all imports; "${specifier}" resolved to another entry "${owner.source}".`,
						);
					}
					log.warn(
						`"${currentEntry.source}" imports "${specifier}" which is owned by ` +
							`web-template entry "${owner.source}". Inlining — this will duplicate code ` +
							`across entry points.`,
					);
					return null;
				}
				if (owner.type === 'server-logic') {
					throw new Error(
						`"${currentEntry.source}" imports "${specifier}" which is owned by server-logic entry "${owner.source}". ` +
							`Server-logic entries cannot be imported by other entries.`,
					);
				}
			}

			// Not an entry source file — inline as library code.
			resolutionLog?.bundledModules.add(resolved);
			return null;
		}

		return null;
	};
}
