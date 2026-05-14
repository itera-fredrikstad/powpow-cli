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
	function mkResource(guid: string, type: PortalResource['type'] = 'web-file'): PortalResource {
		return {
			guid,
			type,
			name: guid,
			contentPath: `/fake/${guid}`,
			...(type === 'web-file' ? { runtimeUrl: `/js/${guid}.js` } : {}),
		};
	}
	function mkPortal(entries: Array<[string, PortalResource['type']?]>): Map<string, PortalResource> {
		return new Map(entries.map(([g, t]) => [g, mkResource(g, t)]));
	}

	it('passes when every entry target exists in the resource map', () => {
		mkdirSync(join(tmp, 'src'), { recursive: true });
		const config = { portalConfigPath: 'p', entryPoints: [{ source: 'a.ts', target: 'g1' }] };
		expect(() => validateEntryPoints(config, tmp, mkPortal([['g1', 'web-file']]))).not.toThrow();
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
		expect(() => validateEntryPoints(config, tmp, mkPortal([['g1', 'web-file']]))).toThrowError(/do not match.*missing/s);
	});

	it('accepts entries regardless of source-file location', () => {
		mkdirSync(join(tmp, 'src'), { recursive: true });
		const config = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'flat.tsx', target: 'g1' },
				{ source: 'features/nested/deep.ts', target: 'g2' },
				{ source: 'shared/run.ts', target: 'g3' },
			],
		};
		expect(() =>
			validateEntryPoints(
				config,
				tmp,
				mkPortal([
					['g1', 'web-template'],
					['g2', 'web-file'],
					['g3', 'server-logic'],
				]),
			),
		).not.toThrow();
	});

	it('allows bare specifiers only for web-file targets', () => {
		const config = {
			portalConfigPath: 'p',
			entryPoints: [
				{ source: 'lodash', target: 'g1' },
				{ source: 'react', target: 'g2' },
			],
		};
		expect(() =>
			validateEntryPoints(
				config,
				tmp,
				mkPortal([
					['g1', 'web-file'],
					['g2', 'web-file'],
				]),
			),
		).not.toThrow();
	});

	it('rejects bare specifier targeting a web-template', () => {
		const config = {
			portalConfigPath: 'p',
			entryPoints: [{ source: 'lodash', target: 'g1' }],
		};
		expect(() => validateEntryPoints(config, tmp, mkPortal([['g1', 'web-template']]))).toThrowError(/bare specifier/);
	});
});
