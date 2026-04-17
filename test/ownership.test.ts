import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOwnershipMaps, findOwner } from '../src/ownership.js';
import type { PortalResource } from '../src/types.js';
import { toPosix } from '../src/utils.js';

function mkResource(partial: Partial<PortalResource> & { guid: string }): PortalResource {
	return {
		type: 'web-file',
		name: partial.guid,
		contentPath: `/fake/${partial.guid}.js`,
		runtimeUrl: `/js/${partial.guid}.js`,
		...partial,
	};
}

const SOURCE_DIR = resolve('/project/src');

describe('buildOwnershipMaps', () => {
	it('registers root-level entries under rootFileOwners', () => {
		const resourceMap = new Map([['guid-a', mkResource({ guid: 'guid-a' })]]);
		const entries = [{ source: 'main.ts', target: 'guid-a' }];

		const { rootFileOwners, dirOwners, packageEntries } = buildOwnershipMaps(entries, resourceMap, SOURCE_DIR);

		expect(dirOwners.size).toBe(0);
		expect(packageEntries.size).toBe(0);
		expect(rootFileOwners.size).toBe(1);
		expect(rootFileOwners.get(toPosix(resolve(SOURCE_DIR, 'main.ts')))).toBeDefined();
	});

	it('registers subdir entries under dirOwners with posix-normalized keys', () => {
		const resourceMap = new Map([['guid-a', mkResource({ guid: 'guid-a' })]]);
		const entries = [{ source: 'feature/index.ts', target: 'guid-a' }];

		const { rootFileOwners, dirOwners } = buildOwnershipMaps(entries, resourceMap, SOURCE_DIR);

		expect(rootFileOwners.size).toBe(0);
		expect(dirOwners.size).toBe(1);
		const key = [...dirOwners.keys()][0];
		expect(key).not.toContain('\\');
	});

	it('registers bare-specifier entries under packageEntries', () => {
		const resourceMap = new Map([['guid-a', mkResource({ guid: 'guid-a' })]]);
		const entries = [{ source: 'lodash', target: 'guid-a' }];

		const { rootFileOwners, dirOwners, packageEntries } = buildOwnershipMaps(entries, resourceMap, SOURCE_DIR);

		expect(rootFileOwners.size).toBe(0);
		expect(dirOwners.size).toBe(0);
		expect(packageEntries.get('lodash')?.guid).toBe('guid-a');
	});

	it('skips entries whose target GUID is absent from the resource map', () => {
		const resourceMap = new Map<string, PortalResource>();
		const entries = [{ source: 'main.ts', target: 'missing' }];

		const { rootFileOwners, dirOwners, packageEntries } = buildOwnershipMaps(entries, resourceMap, SOURCE_DIR);

		expect(rootFileOwners.size).toBe(0);
		expect(dirOwners.size).toBe(0);
		expect(packageEntries.size).toBe(0);
	});
});

describe('findOwner', () => {
	const resourceMap = new Map([
		['root', mkResource({ guid: 'root' })],
		['feat', mkResource({ guid: 'feat' })],
		['feat-sub', mkResource({ guid: 'feat-sub' })],
	]);
	const entries = [
		{ source: 'main.ts', target: 'root' },
		{ source: 'feature/index.ts', target: 'feat' },
		{ source: 'feature/sub/index.ts', target: 'feat-sub' },
	];
	const maps = buildOwnershipMaps(entries, resourceMap, SOURCE_DIR);

	it('returns the root-file owner for an exact root-file match', () => {
		const abs = resolve(SOURCE_DIR, 'main.ts');
		expect(findOwner(abs, maps.dirOwners, maps.rootFileOwners)?.source).toBe('main.ts');
	});

	it('returns null for a root-level file not explicitly registered', () => {
		const abs = resolve(SOURCE_DIR, 'other.ts');
		expect(findOwner(abs, maps.dirOwners, maps.rootFileOwners)).toBeNull();
	});

	it('picks the deepest dir owner (more specific wins)', () => {
		const abs = resolve(SOURCE_DIR, 'feature/sub/helper.ts');
		expect(findOwner(abs, maps.dirOwners, maps.rootFileOwners)?.source).toBe('feature/sub/index.ts');
	});

	it('falls back to the parent dir owner when no deeper match exists', () => {
		const abs = resolve(SOURCE_DIR, 'feature/utils.ts');
		expect(findOwner(abs, maps.dirOwners, maps.rootFileOwners)?.source).toBe('feature/index.ts');
	});

	it('handles mixed separators by normalizing to posix', () => {
		const abs = resolve(SOURCE_DIR, 'feature/utils.ts').replaceAll('/', '\\');
		expect(findOwner(abs, maps.dirOwners, maps.rootFileOwners)?.source).toBe('feature/index.ts');
	});
});
