import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findConfig, loadConfig, validateEntryPoints } from '../src/config.js';
import type { PortalResource } from '../src/types.js';

let tmp: string;

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), 'powpow-config-'));
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(content: string): string {
	const path = join(tmp, 'powpow.config.json');
	writeFileSync(path, content);
	return path;
}

describe('findConfig', () => {
	it('returns the absolute path when explicit path exists', () => {
		const path = writeConfig('{}');
		expect(findConfig(path)).toBe(resolve(path));
	});

	it('throws when explicit path does not exist', () => {
		expect(() => findConfig(join(tmp, 'missing.json'))).toThrowError(/not found/);
	});
});

describe('loadConfig', () => {
	it('parses valid config', () => {
		const path = writeConfig(JSON.stringify({ portalConfigPath: 'portal', entryPoints: [] }));
		const cfg = loadConfig(path);
		expect(cfg.portalConfigPath).toBe('portal');
		expect(cfg.entryPoints).toEqual([]);
	});

	it('wraps JSON parse errors with the config path', () => {
		const path = writeConfig('{ not valid json');
		expect(() => loadConfig(path)).toThrowError(new RegExp(`Failed to parse ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
	});

	it('rejects missing portalConfigPath', () => {
		const path = writeConfig(JSON.stringify({ entryPoints: [] }));
		expect(() => loadConfig(path)).toThrowError(/portalConfigPath/);
	});

	it('rejects non-array entryPoints', () => {
		const path = writeConfig(JSON.stringify({ portalConfigPath: 'portal', entryPoints: 'nope' }));
		expect(() => loadConfig(path)).toThrowError(/entryPoints/);
	});

	it('rejects malformed entry-point items', () => {
		const path = writeConfig(JSON.stringify({ portalConfigPath: 'portal', entryPoints: [{ source: 'a.ts' }] }));
		expect(() => loadConfig(path)).toThrowError(/source.*target/);
	});

	it('accepts per-entry options with valid shape', () => {
		const path = writeConfig(
			JSON.stringify({
				portalConfigPath: 'portal',
				entryPoints: [{ source: 'a.ts', target: 'guid', options: { globals: { foo: 'Foo' }, minify: false } }],
			}),
		);
		expect(() => loadConfig(path)).not.toThrow();
	});

	it('rejects entry.options.minify when not boolean', () => {
		const path = writeConfig(
			JSON.stringify({
				portalConfigPath: 'portal',
				entryPoints: [{ source: 'a.ts', target: 'guid', options: { minify: 'true' } }],
			}),
		);
		expect(() => loadConfig(path)).toThrowError(/minify.*boolean/);
	});

	it('rejects non-string extensionId', () => {
		const path = writeConfig(JSON.stringify({ portalConfigPath: 'portal', entryPoints: [], extensionId: 42 }));
		expect(() => loadConfig(path)).toThrowError(/extensionId/);
	});
});

describe('validateEntryPoints', () => {
	function mkPortal(guids: string[]): Map<string, PortalResource> {
		return new Map(
			guids.map((g) => [
				g,
				{
					guid: g,
					type: 'web-file',
					name: g,
					contentPath: `/fake/${g}.js`,
					runtimeUrl: `/js/${g}.js`,
				} satisfies PortalResource,
			]),
		);
	}

	it('passes when every entry target exists in the resource map', () => {
		mkdirSync(join(tmp, 'src'), { recursive: true });
		const config = { portalConfigPath: 'p', entryPoints: [{ source: 'a.ts', target: 'g1' }] };
		expect(() => validateEntryPoints(config, tmp, mkPortal(['g1']))).not.toThrow();
	});

	it('throws listing all missing targets', () => {
		mkdirSync(join(tmp, 'src'), { recursive: true });
		const config = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'a.ts', target: 'g1' },
				{ source: 'b.ts', target: 'missing' },
			],
		};
		expect(() => validateEntryPoints(config, tmp, mkPortal(['g1']))).toThrowError(/do not match.*missing/s);
	});

	it('throws when two entries share a directory', () => {
		mkdirSync(join(tmp, 'src'), { recursive: true });
		const config = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'dir/a.ts', target: 'g1' },
				{ source: 'dir/b.ts', target: 'g2' },
			],
		};
		expect(() => validateEntryPoints(config, tmp, mkPortal(['g1', 'g2']))).toThrowError(/share the same directory/);
	});

	it('allows bare specifiers to coexist freely', () => {
		const config = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'lodash', target: 'g1' },
				{ source: 'react', target: 'g2' },
			],
		};
		expect(() => validateEntryPoints(config, tmp, mkPortal(['g1', 'g2']))).not.toThrow();
	});
});
