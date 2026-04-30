import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResolvedEntry } from '../src/entries.js';
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
		runtimeUrl: partial.type === 'server-logic' ? undefined : `/js/${partial.guid}.js`,
		...partial,
	};
}

interface EntrySpec {
	source: string;
	resource: PortalResource;
}

function mkEntry(spec: EntrySpec): ResolvedEntry {
	const isBare = !spec.source.startsWith('.') && !spec.source.startsWith('/') && !/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/.test(spec.source);
	return {
		source: spec.source,
		absSource: isBare ? null : toPosix(resolve(SOURCE_DIR, spec.source)),
		resource: spec.resource,
		type: spec.resource.type,
	};
}

function mkCtx(overrides: {
	currentEntry: EntrySpec;
	entries: EntrySpec[];
	globalsMap?: Record<string, string>;
}): PluginContext {
	const allEntries = overrides.entries.map(mkEntry);
	const currentEntry = mkEntry(overrides.currentEntry);
	// Replace the matching entry in allEntries by identity if present
	const idx = allEntries.findIndex(
		(e) => e.source === currentEntry.source && e.resource.guid === currentEntry.resource.guid,
	);
	if (idx >= 0) allEntries[idx] = currentEntry;
	else allEntries.push(currentEntry);

	const resourceMap = new Map(allEntries.map((e) => [e.resource.guid, e.resource]));

	return {
		currentEntry,
		entries: allEntries,
		projectRoot: '/project',
		resourceMap,
		currentResource: currentEntry.resource,
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
	// @ts-expect-error — the real options arg is not needed for our pure-logic tests
	return hook(specifier, importer, {});
}

describe('createResolveIdHook — UMD globals', () => {
	it('resolves a globals-mapped specifier to its bundled shim file', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) },
			entries: [{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) }],
			globalsMap: { react: 'React' },
		});
		const hook = createResolveIdHook(ctx);
		const result = callHook(hook, 'react', '/project/src/web-templates/main.ts');
		expect(typeof result).toBe('string');
		expect(result as string).toMatch(/shims\/react\.js$/);
	});

	it('falls back to a virtual UMD id when no shim file exists for the specifier', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) },
			entries: [{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) }],
			globalsMap: { 'my-custom-lib': 'MyLib' },
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'my-custom-lib', '/project/src/web-templates/main.ts')).toEqual({ id: `${UMD_VIRTUAL_PREFIX}my-custom-lib` });
	});

	it('passes through previously-issued virtual UMD ids', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) },
			entries: [{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) }],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, `${UMD_VIRTUAL_PREFIX}react`)).toBe(`${UMD_VIRTUAL_PREFIX}react`);
	});
});

describe('createResolveIdHook — bare specifiers', () => {
	it('externalizes a bare specifier owned by a web-file entry', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-template', type: 'web-template' }) },
			entries: [
				{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-template', type: 'web-template' }) },
				{ source: 'lodash', resource: mkResource({ guid: 'g-lodash', type: 'web-file', runtimeUrl: '/js/lodash.js' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'lodash', '/project/src/web-templates/main.ts')).toEqual({
			id: `${RUNTIME_URL_PREFIX}/js/lodash.js`,
			external: true,
		});
	});

	it('inlines and tracks bare specifiers that no entry owns', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) },
			entries: [{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g', type: 'web-template' }) }],
		});
		const hook = createResolveIdHook(ctx);
		expect(callHook(hook, 'some-pkg', '/project/src/web-templates/main.ts')).toBeNull();
		expect(ctx.inlinedPackages.get('some-pkg')?.has('g')).toBe(true);
	});
});

describe('createResolveIdHook — relative source file imports', () => {
	it('externalizes imports of another web-file entry by exact source match', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
			entries: [
				{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
				{ source: 'web-files/lib.ts', resource: mkResource({ guid: 'g-lib', type: 'web-file', runtimeUrl: '/js/lib.js' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'web-templates/main.ts');
		expect(callHook(hook, '../web-files/lib', importer)).toEqual({
			id: `${RUNTIME_URL_PREFIX}/js/lib.js`,
			external: true,
		});
	});

	it('inlines a relative import that does not match any entry source', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
			entries: [
				{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
				{ source: 'web-files/lib.ts', resource: mkResource({ guid: 'g-lib', type: 'web-file', runtimeUrl: '/js/lib.js' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'web-templates/main.ts');
		// importing a sibling helper, not an entry — should inline
		expect(callHook(hook, '../lib/util', importer)).toBeNull();
	});

	it('inlines (with warn) imports that match a web-template entry source', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
			entries: [
				{ source: 'web-templates/main.ts', resource: mkResource({ guid: 'g-main', type: 'web-template' }) },
				{ source: 'web-templates/other.ts', resource: mkResource({ guid: 'g-other', type: 'web-template' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'web-templates/main.ts');
		expect(callHook(hook, './other', importer)).toBeNull();
	});
});

describe('createResolveIdHook — server-logic strict mode', () => {
	it('throws when a server-logic entry imports another entry by relative path', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) },
			entries: [
				{ source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) },
				{ source: 'web-files/lib.ts', resource: mkResource({ guid: 'g-lib', type: 'web-file', runtimeUrl: '/js/lib.js' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'server-logic/myLogic.ts');
		expect(() => callHook(hook, '../web-files/lib', importer)).toThrowError(/server-logic entries must inline all imports/);
	});

	it('throws when a server-logic entry imports a bare specifier owned by another entry', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) },
			entries: [
				{ source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) },
				{ source: 'lodash', resource: mkResource({ guid: 'g-lodash', type: 'web-file', runtimeUrl: '/js/lodash.js' }) },
			],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'server-logic/myLogic.ts');
		expect(() => callHook(hook, 'lodash', importer)).toThrowError(/server-logic entries must inline all imports/);
	});

	it('inlines library imports in server-logic entries', () => {
		const ctx = mkCtx({
			currentEntry: { source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) },
			entries: [{ source: 'server-logic/myLogic.ts', resource: mkResource({ guid: 'g-sl', type: 'server-logic' }) }],
		});
		const hook = createResolveIdHook(ctx);
		const importer = resolve(SOURCE_DIR, 'server-logic/myLogic.ts');
		expect(callHook(hook, '../lib/util', importer)).toBeNull();
	});
});
