import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanPortalResources } from '../src/resources.js';

let tmp: string;

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), 'powpow-portal-'));
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): string {
	const abs = join(tmp, rel);
	mkdirSync(resolve(abs, '..'), { recursive: true });
	writeFileSync(abs, content);
	return abs;
}

describe('scanPortalResources', () => {
	it('returns empty map when portal directory has no yml files', () => {
		expect(scanPortalResources(tmp).size).toBe(0);
	});

	it('discovers web-templates by their yml metadata', () => {
		const contentPath = writeFile('web-templates/my-template/my-template.webtemplate.source.html', '<html>');
		writeFile(
			'web-templates/my-template/my-template.webtemplate.yml',
			'adx_webtemplateid: 00000000-0000-0000-0000-00000000aaaa\nadx_name: My Template\n',
		);

		const resources = scanPortalResources(tmp);
		const resource = resources.get('00000000-0000-0000-0000-00000000aaaa');
		expect(resource).toBeDefined();
		expect(resource?.type).toBe('web-template');
		expect(resource?.name).toBe('My Template');
		expect(resource?.contentPath).toBe(contentPath);
	});

	it('discovers web-files with their runtime URL', () => {
		writeFile('web-files/hello.js', 'console.log("hi")');
		writeFile(
			'web-files/hello.js.webfile.yml',
			'adx_webfileid: 00000000-0000-0000-0000-00000000bbbb\nadx_name: hello.js\nadx_partialurl: hello.js\nfilename: hello.js\n',
		);

		const resources = scanPortalResources(tmp);
		const resource = resources.get('00000000-0000-0000-0000-00000000bbbb');
		expect(resource?.type).toBe('web-file');
		expect(resource?.runtimeUrl).toBe('/hello.js');
	});

	it('skips yml files with no GUID', () => {
		writeFile('web-templates/bad/bad.webtemplate.yml', 'adx_name: orphan\n');
		expect(scanPortalResources(tmp).size).toBe(0);
	});

	it('skips web-files with no filename', () => {
		writeFile('web-files/missing.webfile.yml', 'adx_webfileid: abc\nadx_name: missing\n');
		expect(scanPortalResources(tmp).size).toBe(0);
	});

	it('discovers server-logic resources by their yml metadata', () => {
		writeFile('server-logic/doStuff.js', '// server logic');
		writeFile(
			'server-logic/doStuff.serverlogic.yml',
			'adx_serverlogicid: 00000000-0000-0000-0000-00000000cccc\nadx_name: doStuff\n',
		);

		const resources = scanPortalResources(tmp);
		const resource = resources.get('00000000-0000-0000-0000-00000000cccc');
		expect(resource).toBeDefined();
		expect(resource?.type).toBe('server-logic');
		expect(resource?.name).toBe('doStuff');
		expect(resource?.contentPath).toBe(resolve(tmp, 'server-logic/doStuff.js'));
		expect(resource?.runtimeUrl).toBeUndefined();
	});

	it('honours configurable root directory names', () => {
		writeFile('custom-templates/x/x.webtemplate.source.html', '');
		writeFile(
			'custom-templates/x/x.webtemplate.yml',
			'adx_webtemplateid: 00000000-0000-0000-0000-00000000dddd\nadx_name: x\n',
		);
		const resources = scanPortalResources(tmp, { webTemplates: 'custom-templates' });
		expect(resources.get('00000000-0000-0000-0000-00000000dddd')?.type).toBe('web-template');
	});
});
