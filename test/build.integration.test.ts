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

		writeFile('src/web-templates/main.ts', `export const greeting = 'hello-from-test';\nconsole.log(greeting);\n`);

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [{ source: 'web-templates/main.ts', target: '00000000-0000-0000-0000-0000000000aa' }],
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

		writeFile('src/web-templates/main.ts', `import { helper } from '../web-files/lib';\nconsole.log(helper());\n`);
		writeFile('src/web-files/lib.ts', `export function helper() { return 'lib-helper-value'; }\n`);

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [
				{ source: 'web-templates/main.ts', target: '00000000-0000-0000-0000-0000000000bb' },
				{ source: 'web-files/lib.ts', target: '00000000-0000-0000-0000-0000000000cc' },
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
		writeFile('src/web-templates/main.ts', 'export const x = 1;\n');

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			entryPoints: [{ source: 'web-templates/main.ts', target: 'no-such-guid' }],
		};

		mkdirSync(join(tmp, 'portal'), { recursive: true });
		await expect(build(config, tmp)).rejects.toThrow(/no-such-guid/);
	});

	it('bundles a server-logic entry as plain ESM with all imports inlined and no UMD globals', async () => {
		writeFile('portal/server-logic/myLogic.serverlogic.yml', 'adx_serverlogicid: 00000000-0000-0000-0000-0000000000dd\nadx_name: myLogic\n');

		writeFile('src/server-logic/myLogic.ts', `import { foo } from '../lib/util';\ndeclare const Server: any;\nServer.Logger.Log(foo());\n`);
		writeFile('src/lib/util.ts', `export function foo() { return 'sl-foo-value'; }\n`);

		const config: PowpowConfig = {
			portalConfigPath: 'portal',
			// Configure react global to verify server-logic ignores it.
			globals: { react: 'React' },
			entryPoints: [{ source: 'server-logic/myLogic.ts', target: '00000000-0000-0000-0000-0000000000dd' }],
		};

		await build(config, tmp);

		const outputPath = join(tmp, 'portal/server-logic/myLogic.js');
		const output = readFileSync(outputPath, 'utf8');

		// No <script> wrapper
		expect(output).not.toMatch(/<script/);
		// foo() got inlined — its return value is in the bundle
		expect(output).toContain('sl-foo-value');
		// No remaining ESM `import` statement for ../lib/util
		expect(output).not.toMatch(/import[^;]*['"]\.\.\/lib\/util['"]/);
		// No globalThis["React"] / React UMD references
		expect(output).not.toMatch(/globalThis\[["']React["']\]/);
	});
});
