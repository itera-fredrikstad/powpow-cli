import { dirname, relative, resolve } from 'node:path';
import type { PortalResource } from './types.js';
import { isBareSpecifier, toPosix } from './utils.js';

export interface EntryOwner {
	source: string;
	absSource: string;
	resource: PortalResource;
}

export interface OwnershipMaps {
	dirOwners: Map<string, EntryOwner>;
	rootFileOwners: Map<string, EntryOwner>;
	packageEntries: Map<string, PortalResource>;
}

export function buildOwnershipMaps(
	allEntries: { source: string; target: string }[],
	resourceMap: Map<string, PortalResource>,
	absSourceDir: string,
): OwnershipMaps {
	const dirOwners = new Map<string, EntryOwner>();
	const rootFileOwners = new Map<string, EntryOwner>();
	const packageEntries = new Map<string, PortalResource>();

	for (const { source, target } of allEntries) {
		const resource = resourceMap.get(target);
		if (!resource) continue;

		if (isBareSpecifier(source)) {
			packageEntries.set(source, resource);
		} else {
			const absSource = toPosix(resolve(absSourceDir, source));
			const relSource = relative(absSourceDir, absSource);
			const dir = dirname(relSource);
			const owner: EntryOwner = { source, absSource, resource };

			if (dir === '.') {
				rootFileOwners.set(absSource, owner);
			} else {
				const absDir = toPosix(resolve(absSourceDir, dir));
				dirOwners.set(absDir, owner);
			}
		}
	}

	return { dirOwners, rootFileOwners, packageEntries };
}

/**
 * Find the entry point that "owns" a given absolute file path.
 * - Subdir entries own their entire subtree; deepest (most specific) directory wins.
 * - Root-level entries own only their exact source file.
 */
export function findOwner(
	targetAbsPath: string,
	dirOwners: Map<string, EntryOwner>,
	rootFileOwners: Map<string, EntryOwner>,
): EntryOwner | null {
	const normalized = toPosix(targetAbsPath);
	const rootOwner = rootFileOwners.get(normalized);
	if (rootOwner) return rootOwner;

	const targetDir = dirname(normalized);
	let bestMatch: EntryOwner | null = null;
	let bestLen = 0;

	for (const [absDir, owner] of dirOwners) {
		if (targetDir === absDir || targetDir.startsWith(`${absDir}/`)) {
			if (absDir.length > bestLen) {
				bestLen = absDir.length;
				bestMatch = owner;
			}
		}
	}

	return bestMatch;
}
