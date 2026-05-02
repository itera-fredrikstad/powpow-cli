import type { ResolvedEntry } from './entries.js';
import { log } from './log.js';
import type { EntryResolutionLog } from './plugin/context.js';
import type { ResourceType } from './types.js';

export interface DependencyGraph {
	entries: Array<{
		target: string;
		name: string;
		type: ResourceType;
		source: string;
		bundledModules: string[];
		externalized: Array<{
			specifier: string;
			via: 'cross-entry' | 'umd-global';
			target?: string;
			global?: string;
		}>;
	}>;
	duplicates: Array<{ module: string; entries: string[] }>;
	globalsUsed: Record<string, string[]>;
}

export function buildGraph(entries: ResolvedEntry[], logs: Map<string, EntryResolutionLog>): DependencyGraph {
	// Build per-entry graph entries
	const graphEntries: DependencyGraph['entries'] = entries.map((entry) => {
		const entryLog = logs.get(entry.resource.guid);
		return {
			target: entry.resource.guid,
			name: entry.resource.name,
			type: entry.type,
			source: entry.source,
			bundledModules: entryLog ? [...entryLog.bundledModules] : [],
			externalized: entryLog ? [...entryLog.externalized] : [],
		};
	});

	// Compute duplicates: modules bundled by >1 entry, excluding server-logic entries
	const moduleToEntries = new Map<string, string[]>();
	for (const entry of entries) {
		if (entry.type === 'server-logic') continue;
		const entryLog = logs.get(entry.resource.guid);
		if (!entryLog) continue;
		for (const mod of entryLog.bundledModules) {
			const list = moduleToEntries.get(mod);
			if (list) {
				list.push(entry.resource.guid);
			} else {
				moduleToEntries.set(mod, [entry.resource.guid]);
			}
		}
	}

	const duplicates: DependencyGraph['duplicates'] = [];
	for (const [module, entryGuids] of moduleToEntries) {
		if (entryGuids.length > 1) {
			duplicates.push({ module, entries: entryGuids });
		}
	}

	// Aggregate globals: globalName → list of entry names
	const globalsUsed: Record<string, string[]> = {};
	for (const entry of entries) {
		const entryLog = logs.get(entry.resource.guid);
		if (!entryLog) continue;
		for (const globalName of entryLog.globalsUsed) {
			if (!globalsUsed[globalName]) globalsUsed[globalName] = [];
			globalsUsed[globalName].push(entry.resource.name);
		}
	}

	return { entries: graphEntries, duplicates, globalsUsed };
}

export function printGraphSummary(graph: DependencyGraph): void {
	log.info('── Build summary ──', 'graph');
	for (const entry of graph.entries) {
		log.info(
			`${entry.type} "${entry.name}" [${entry.target}]: ${entry.bundledModules.length} modules, ${entry.externalized.length} externals`,
			'graph',
		);
	}

	if (graph.duplicates.length > 0) {
		for (const { module, entries } of graph.duplicates) {
			const names = entries
				.map((guid) => {
					const e = graph.entries.find((ge) => ge.target === guid);
					return e ? `"${e.name}"` : guid;
				})
				.join(', ');
			log.warn(`Module "${module}" is bundled by ${entries.length} entries: ${names}. Consider extracting to a web-file entry.`, 'graph');
		}
	}

	const globalNames = Object.keys(graph.globalsUsed);
	if (globalNames.length > 0) {
		for (const name of globalNames) {
			const entryNames = graph.globalsUsed[name].map((n) => `"${n}"`).join(', ');
			log.info(`Global "${name}" used by: ${entryNames}`, 'graph');
		}
	}
}
