import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOwnershipMaps } from '../src/ownership.js';
import type { PluginContext } from '../src/plugin/context.js';
import { RUNTIME_URL_PREFIX, UMD_VIRTUAL_PREFIX } from '../src/plugin/context.js';
import { createResolveIdHook } from '../src/plugin/resolve.js';
import type { PortalResource } from '../src/types.js';
import { toPosix } from '../src/utils.js';

const SOURCE_DIR = resolve('/project/src');

function mkResource(partial: Partial<PortalResource> & { guid: string; type: PortalResource['type'] }): PortalResource {
	return {
		name: partial.guid,
		contentPath: `/fake/${partial.guid}.js`,
		runtimeUrl: `/js/${partial.guid}.js`,
		...partial,
	};
}

function mkCtx(overrides: {
	entry: { source: string; target: string };
	currentAbsSubdir?: string | null;
	entries: { source: string; target: string }[];
	resources: PortalResource[];
	globalsMap?: Record<string, string>;
}): PluginContext {
	const resourceMap = new Map(overrides.resources.map((r) => [r.guid, r]));
	const maps = buildOwnershipMaps(overrides.entries, resourceMap, SOURCE_DIR);
	const currentResource = resourceMap.get(overrides.entry.target);
	if (!currentResource) throw new Error('test setup: current entry has no resource');
	return {
		entry: overrides.entry,
		resourceMap,
		currentResource,
		currentAbsSubdir: overrides.currentAbsSubdir ?? null,
		dirOwners: maps.dirOwners,
		rootFileOwners: maps.rootFileOwners,
		packageEntries: maps.packageEntries,
		globalsMap: overrides.globalsMap ?? {},
		inlinedPackages: new Map(),
		outputCollector: new Map(),
	};
}

function callHook(
	hook: ReturnType<typeof createResolveIdHook>,
	specifier: string,
	importer?: string,
): ReturnType<Extract<typeof hook, (...a: unknown[]) => unknown>> {
	if (typeof hook !== 'function') throw new Error('hook is not a function');
	// rolldown-style signature: resolveId(specifier, importer, options)
	// @ts-expect-error — the real options arg is not needed for our pure-logic tests
	return hook(specifier, importer, {});
}

describe('createResolveIdHook — UMD globals', () => {
	it('routes a globals-mapped specifier to a virtual UMD id', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g' },
			entries: [{ source: 'main.ts', target: 'g' }],
			resources: [mkResource({ guid: 'g', type: 'web-template' })],
			globalsMap: { react: 'React' },
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'react', 'main.ts')).toEqual({ id: `${UMD_VIRTUAL_PREFIX}react` });
	});

	it('passes through previously-issued virtual UMD ids', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g' },
			entries: [{ source: 'main.ts', target: 'g' }],
			resources: [mkResource({ guid: 'g', type: 'web-template' })],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, `${UMD_VIRTUAL_PREFIX}react`)).toBe(`${UMD_VIRTUAL_PREFIX}react`);
	});
});

describe('createResolveIdHook — bare specifiers', () => {
	it('externalizes a bare specifier owned by a web-file entry', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g-template' },
			entries: [
				{ source: 'main.ts', target: 'g-template' },
				{ source: 'lodash', target: 'g-lodash' },
			],
			resources: [
				mkResource({ guid: 'g-template', type: 'web-template' }),
				mkResource({ guid: 'g-lodash', type: 'web-file', runtimeUrl: '/js/lodash.js' }),
			],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'lodash', 'main.ts')).toEqual({
			id: `${RUNTIME_URL_PREFIX}/js/lodash.js`,
			external: true,
		});
	});

	it('inlines and tracks bare specifiers that no entry owns', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g' },
			entries: [{ source: 'main.ts', target: 'g' }],
			resources: [mkResource({ guid: 'g', type: 'web-template' })],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'some-pkg', 'main.ts')).toBeNull();
		expect(ctx.inlinedPackages.get('some-pkg')?.has('g')).toBe(true);
	});
});

describe('createResolveIdHook — relative source file imports', () => {
	it('inlines relative imports that stay inside the current entry subdir', () => {
		const currentAbsSubdir = toPosix(resolve(SOURCE_DIR, 'feature'));
		const ctx = mkCtx({
			entry: { source: 'feature/index.ts', target: 'g-feature' },
			currentAbsSubdir,
			entries: [{ source: 'feature/index.ts', target: 'g-feature' }],
			resources: [mkResource({ guid: 'g-feature', type: 'web-file' })],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'feature/index.ts');
		expect(callHook(hook, './helper', importer)).toBeNull();
	});

	it('externalizes imports of another web-file entry', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g-main' },
			entries: [
				{ source: 'main.ts', target: 'g-main' },
				{ source: 'lib/index.ts', target: 'g-lib' },
			],
			resources: [
				mkResource({ guid: 'g-main', type: 'web-template' }),
				mkResource({ guid: 'g-lib', type: 'web-file', runtimeUrl: '/js/lib.js' }),
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'main.ts');
		expect(callHook(hook, './lib/index', importer)).toEqual({
			id: `${RUNTIME_URL_PREFIX}/js/lib.js`,
			external: true,
		});
	});

	it('throws when importing into a web-file subtree but not at its entry file', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g-main' },
			entries: [
				{ source: 'main.ts', target: 'g-main' },
				{ source: 'lib/index.ts', target: 'g-lib' },
			],
			resources: [
				mkResource({ guid: 'g-main', type: 'web-template' }),
				mkResource({ guid: 'g-lib', type: 'web-file', runtimeUrl: '/js/lib.js' }),
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'main.ts');
		expect(() => callHook(hook, './lib/helper', importer)).toThrowError(/not its entry file/);
	});

	it('inlines (with warn) imports into a web-template entry subtree', () => {
		const ctx = mkCtx({
			entry: { source: 'main.ts', target: 'g-main' },
			entries: [
				{ source: 'main.ts', target: 'g-main' },
				{ source: 'template/index.ts', target: 'g-template' },
			],
			resources: [mkResource({ guid: 'g-main', type: 'web-template' }), mkResource({ guid: 'g-template', type: 'web-template' })],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'main.ts');
		expect(callHook(hook, './template/index', importer)).toBeNull();
	});
});
