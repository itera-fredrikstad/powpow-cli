import { describe, expect, it } from 'vitest';
import type { ResolvedEntry } from '../src/entries.js';
import { buildGraph } from '../src/graph.js';
import type { EntryResolutionLog } from '../src/plugin/context.js';
import type { PortalResource } from '../src/types.js';

function mkResource(guid: string, type: PortalResource['type']): PortalResource {
	return {
		guid,
		name: `name-${guid}`,
		contentPath: `/portal/${guid}.js`,
		runtimeUrl: type === 'server-logic' ? undefined : `/js/${guid}.js`,
		type,
	};
}

function mkEntry(guid: string, type: PortalResource['type']): ResolvedEntry {
	return {
		source: `src/${type}/${guid}.ts`,
		absSource: `/project/src/${type}/${guid}.ts`,
		resource: mkResource(guid, type),
		type,
	};
}

function mkLog(bundledModules: string[], globalsUsed: string[] = []): EntryResolutionLog {
	return {
		bundledModules: new Set(bundledModules),
		externalized: [],
		globalsUsed: new Set(globalsUsed),
	};
}

describe('buildGraph', () => {
	it('detects duplicates when two entries share a module', () => {
		const entry1 = mkEntry('guid-1', 'web-template');
		const entry2 = mkEntry('guid-2', 'web-file');
		const logs = new Map<string, EntryResolutionLog>([
			['guid-1', mkLog(['lodash', '/project/src/lib/utils.ts'])],
			['guid-2', mkLog(['lodash', '/project/src/lib/format.ts'])],
		]);

		const graph = buildGraph([entry1, entry2], logs);

		expect(graph.duplicates).toHaveLength(1);
		expect(graph.duplicates[0].module).toBe('lodash');
		expect(graph.duplicates[0].entries).toContain('guid-1');
		expect(graph.duplicates[0].entries).toContain('guid-2');
	});

	it('does NOT flag a duplicate when only one non-server-logic entry bundles a module', () => {
		const entry1 = mkEntry('guid-1', 'web-template');
		const entry2 = mkEntry('guid-2', 'web-file');
		const logs = new Map<string, EntryResolutionLog>([
			['guid-1', mkLog(['lodash'])],
			['guid-2', mkLog(['/project/src/lib/other.ts'])],
		]);

		const graph = buildGraph([entry1, entry2], logs);

		expect(graph.duplicates).toHaveLength(0);
	});

	it('excludes server-logic entries from duplicate detection', () => {
		const webEntry = mkEntry('guid-web', 'web-file');
		const serverEntry = mkEntry('guid-server', 'server-logic');
		const logs = new Map<string, EntryResolutionLog>([
			['guid-web', mkLog(['lodash'])],
			['guid-server', mkLog(['lodash'])],
		]);

		const graph = buildGraph([webEntry, serverEntry], logs);

		// lodash is bundled by both, but server-logic is excluded from duplicate checks
		expect(graph.duplicates).toHaveLength(0);
	});

	it('aggregates globalsUsed across entries correctly', () => {
		const entry1 = mkEntry('guid-1', 'web-template');
		const entry2 = mkEntry('guid-2', 'web-template');
		const logs = new Map<string, EntryResolutionLog>([
			['guid-1', mkLog([], ['React', '$'])],
			['guid-2', mkLog([], ['React'])],
		]);

		const graph = buildGraph([entry1, entry2], logs);

		expect(graph.globalsUsed['React']).toHaveLength(2);
		expect(graph.globalsUsed['React']).toContain('name-guid-1');
		expect(graph.globalsUsed['React']).toContain('name-guid-2');
		expect(graph.globalsUsed['$']).toHaveLength(1);
		expect(graph.globalsUsed['$']).toContain('name-guid-1');
	});

	it('builds graph entries with correct shape', () => {
		const entry = mkEntry('guid-1', 'web-template');
		const logs = new Map<string, EntryResolutionLog>([['guid-1', mkLog(['lodash'], ['React'])]]);

		const graph = buildGraph([entry], logs);

		expect(graph.entries).toHaveLength(1);
		const ge = graph.entries[0];
		expect(ge.target).toBe('guid-1');
		expect(ge.name).toBe('name-guid-1');
		expect(ge.type).toBe('web-template');
		expect(ge.bundledModules).toContain('lodash');
	});

	it('returns empty graph for no entries', () => {
		const graph = buildGraph([], new Map());
		expect(graph.entries).toHaveLength(0);
		expect(graph.duplicates).toHaveLength(0);
		expect(graph.globalsUsed).toEqual({});
	});
});
