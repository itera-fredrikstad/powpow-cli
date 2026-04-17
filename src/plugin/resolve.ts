import { dirname, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { log } from '../log.js';
import { findOwner } from '../ownership.js';
import { isBareSpecifier, toPosix } from '../utils.js';
import { type PluginContext, RUNTIME_URL_PREFIX, UMD_VIRTUAL_PREFIX } from './context.js';

const SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

export function createResolveIdHook(ctx: PluginContext): Plugin['resolveId'] {
	const { entry, currentAbsSubdir, dirOwners, rootFileOwners, packageEntries, globalsMap, inlinedPackages } = ctx;

	return (specifier, importer) => {
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
			const resolved = toPosix(resolve(importerDir, specifier));

			// Same-subdir check: if current entry has a subdir and the target is under it, inline
			if (currentAbsSubdir && (resolved === currentAbsSubdir || resolved.startsWith(`${currentAbsSubdir}/`))) {
				return null;
			}

			// First pass: check for an exact match against another entry's source file across all suffixes.
			for (const ext of SUFFIXES) {
				const candidate = resolved + ext;
				const owner = findOwner(candidate, dirOwners, rootFileOwners);
				if (!owner || candidate !== owner.absSource) continue;

				if (owner.resource.type === 'web-file') {
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

			// Second pass: not an entry file itself, but may sit inside an entry's subtree.
			const anchorOwner = findOwner(resolved, dirOwners, rootFileOwners);
			if (anchorOwner) {
				if (anchorOwner.resource.type === 'web-file') {
					throw new Error(
						`"${entry.source}" imports "${specifier}" which resolves to a file inside ` +
							`web-file entry "${anchorOwner.source}"'s subtree, but is not its entry file. ` +
							`The generated bundle would reference a symbol the owner entry does not re-export. ` +
							`Either import from "${anchorOwner.source}" directly, or re-export from that entry.`,
					);
				}
				if (anchorOwner.resource.type === 'web-template') {
					log.warn(
						`"${entry.source}" imports "${specifier}" which is owned by ` +
							`web-template entry "${anchorOwner.source}". Inlining — this will duplicate code ` +
							`across entry points.`,
					);
					return null;
				}
			}

			return null;
		}

		return null;
	};
}
