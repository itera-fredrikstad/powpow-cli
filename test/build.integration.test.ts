import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build } from '../src/build.js';
import type { PowpowConfig } from '../src/types.js';

let tmp: string;

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), 'powpow-build-')));
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): string {
	const abs = join(tmp, rel);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, content);
	return abs;
}

describe('build (integration)', () => {
	it('bundles a web-template entry and wraps output in <script type="module">', async () => {
		const templateContentPath = writeFile('portal/web-templates/my-template/my-template.webtemplate.source.html', '');
		writeFile(
			'portal/web-templates/my-template/my-template.webtemplate.yml',
			'adx_webtemplateid: 00000000-0000-0000-0000-0000000000aa\nadx_name: My Template\n',
		);

		writeFile('src/main.ts', `export const greeting = 'hello-from-test';\nconsole.log(greeting);\n`);

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [{ source: 'main.ts', target: '00000000-0000-0000-0000-0000000000aa' }],
		};

		await build(config, tmp);

		const output = readFileSync(templateContentPath, 'utf8');
		expect(output).toMatch(/<script type="module"[^>]*>/);
		expect(output.trim().endsWith('</script>')).toBe(true);
		expect(output).toContain('hello-from-test');
	});

	it('externalizes cross-entry web-file imports with a content-hash query string', async () => {
		const templateContentPath = writeFile('portal/web-templates/app/app.webtemplate.source.html', '');
		writeFile('portal/web-templates/app/app.webtemplate.yml', 'adx_webtemplateid: 00000000-0000-0000-0000-0000000000bb\nadx_name: App\n');

		const libContentPath = writeFile('portal/web-files/lib.js', '');
		writeFile(
			'portal/web-files/lib.js.webfile.yml',
			'adx_webfileid: 00000000-0000-0000-0000-0000000000cc\nadx_name: lib.js\nadx_partialurl: lib.js\nfilename: lib.js\n',
		);

		writeFile('src/main.ts', `import { helper } from './lib/index';\nconsole.log(helper());\n`);
		writeFile('src/lib/index.ts', `export function helper() { return 'lib-helper-value'; }\n`);

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [
				{ source: 'main.ts', target: '00000000-0000-0000-0000-0000000000bb' },
				{ source: 'lib/index.ts', target: '00000000-0000-0000-0000-0000000000cc' },
			],
		};

		await build(config, tmp);

		const templateOutput = readFileSync(templateContentPath, 'utf8');
		expect(templateOutput).toMatch(/["']\/lib\.js\?v=[0-9a-f]{8}["']/);
		expect(templateOutput).not.toContain('powpow-runtime:');

		const libOutput = readFileSync(libContentPath, 'utf8');
		expect(libOutput).toContain('lib-helper-value');
	});

	it('rejects when an entry target GUID has no matching portal resource', async () => {
		writeFile('src/main.ts', 'export const x = 1;\n');

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [{ source: 'main.ts', target: 'no-such-guid' }],
		};

		mkdirSync(join(tmp, 'portal'), { recursive: true });
		await expect(build(config, tmp)).rejects.toThrow(/no-such-guid/);
	});
});
