import { resolve } from 'node:path';
import type { PortalResource, PowpowConfig, ResourceType } from './types.js';
import { isBareSpecifier, toPosix } from './utils.js';

export interface ResolvedEntry {
	source: string;
	absSource: string | null;
	resource: PortalResource;
	type: ResourceType;
}

export function resolveEntries(config: PowpowConfig, resourceMap: Map<string, PortalResource>, sourceDir: string): ResolvedEntry[] {
	const out: ResolvedEntry[] = [];
	for (const entry of config.entryPoints) {
		const resource = resourceMap.get(entry.target);
		if (!resource) continue;
		const bare = isBareSpecifier(entry.source);
		const absSource = bare ? null : toPosix(resolve(sourceDir, entry.source));
		out.push({ source: entry.source, absSource, resource, type: resource.type });
	}
	return out;
}

/**
 * Find an entry whose absSource exactly matches the given absolute path.
 * No directory walking — cross-entry resolution applies only when the file IS the entry's source.
 */
export function findEntryForFile(absPath: string, entries: ResolvedEntry[]): ResolvedEntry | null {
	const norm = toPosix(absPath);
	for (const entry of entries) {
		if (entry.absSource && entry.absSource === norm) return entry;
	}
	return null;
}
