import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEntryPoints } from '../src/config.js';
import { findEntryForFile, resolveEntries } from '../src/entries.js';
import type { PortalResource, PowpowConfig } from '../src/types.js';
import { toPosix } from '../src/utils.js';

let tmp: string;

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), 'powpow-entries-'));
	mkdirSync(join(tmp, 'src'), { recursive: true });
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function mkResource(guid: string, type: PortalResource['type']): PortalResource {
	return {
		guid,
		type,
		name: guid,
		contentPath: `/fake/${guid}`,
		...(type === 'web-file' ? { runtimeUrl: `/js/${guid}.js` } : {}),
	};
}

describe('resolveEntries', () => {
	it('infers type from the matched portal resource', () => {
		const config: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'web-templates/page.tsx', target: 'gT' },
				{ source: 'web-files/util.ts', target: 'gF' },
				{ source: 'server-logic/run.ts', target: 'gS' },
			],
		};
		const resourceMap = new Map<string, PortalResource>([
			['gT', mkResource('gT', 'web-template')],
			['gF', mkResource('gF', 'web-file')],
			['gS', mkResource('gS', 'server-logic')],
		]);
		const sourceDir = resolve(tmp, 'src');
		const entries = resolveEntries(config, resourceMap, sourceDir);
		expect(entries.map((e) => e.type)).toEqual(['web-template', 'web-file', 'server-logic']);
		expect(entries[0].absSource).toBe(toPosix(resolve(sourceDir, 'web-templates/page.tsx')));
	});

	it('returns null absSource for bare specifiers', () => {
		const config: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'lodash', target: 'gF' }],
		};
		const resourceMap = new Map<string, PortalResource>([['gF', mkResource('gF', 'web-file')]]);
		const entries = resolveEntries(config, resourceMap, resolve(tmp, 'src'));
		expect(entries[0].absSource).toBeNull();
		expect(entries[0].source).toBe('lodash');
	});
});

describe('findEntryForFile', () => {
	it('returns the matching entry only on exact source match', () => {
		const config: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'web-files/a.ts', target: 'gF' }],
		};
		const resourceMap = new Map<string, PortalResource>([['gF', mkResource('gF', 'web-file')]]);
		const sourceDir = resolve(tmp, 'src');
		const entries = resolveEntries(config, resourceMap, sourceDir);

		expect(findEntryForFile(resolve(sourceDir, 'web-files/a.ts'), entries)?.source).toBe('web-files/a.ts');
		expect(findEntryForFile(resolve(sourceDir, 'web-files/other.ts'), entries)).toBeNull();
		// directory walking must NOT match
		expect(findEntryForFile(resolve(sourceDir, 'web-files/sub/inner.ts'), entries)).toBeNull();
	});

	it('ignores bare-specifier entries when matching files', () => {
		const config: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'lodash', target: 'gF' }],
		};
		const resourceMap = new Map<string, PortalResource>([['gF', mkResource('gF', 'web-file')]]);
		const entries = resolveEntries(config, resourceMap, resolve(tmp, 'src'));
		expect(findEntryForFile(resolve(tmp, 'src/lodash'), entries)).toBeNull();
	});
});

describe('validateEntryPoints (integration with type inference)', () => {
	it('detects mismatch: file in web-files/ targeting a web-template GUID', () => {
		const config: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'web-files/a.ts', target: 'gT' }],
		};
		const resourceMap = new Map<string, PortalResource>([['gT', mkResource('gT', 'web-template')]]);
		expect(() => validateEntryPoints(config, tmp, resourceMap)).toThrowError(/web-files.*web-template/);
	});

	it('accepts bare specifier only for web-file targets', () => {
		const okConfig: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'lodash', target: 'gF' }],
		};
		const okMap = new Map<string, PortalResource>([['gF', mkResource('gF', 'web-file')]]);
		expect(() => validateEntryPoints(okConfig, tmp, okMap)).not.toThrow();

		const badConfig: PowpowConfig = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'lodash', target: 'gS' }],
		};
		const badMap = new Map<string, PortalResource>([['gS', mkResource('gS', 'server-logic')]]);
		expect(() => validateEntryPoints(badConfig, tmp, badMap)).toThrowError(/bare specifier/);
	});
});
