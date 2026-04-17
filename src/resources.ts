import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import type { PortalResource } from './types.js';

export function scanPortalResources(portalDir: string): Map<string, PortalResource> {
	const resources = new Map<string, PortalResource>();

	// --- Web Templates ---
	for (const ymlPath of globSync('web-templates/**/*.webtemplate.yml', { cwd: portalDir })) {
		const abs = resolve(portalDir, ymlPath);
		const doc = yaml.load(readFileSync(abs, 'utf8')) as Record<string, any> | undefined;
		if (!doc || typeof doc !== 'object') continue;
		const guid: string | undefined = doc.adx_webtemplateid;
		const name: string = doc.adx_name ?? '';
		if (!guid) continue;
		const contentPath = abs.replace(/\.webtemplate\.yml$/, '.webtemplate.source.html');
		resources.set(guid, { guid, type: 'web-template', name, contentPath });
	}

	// --- Web Files ---
	for (const ymlPath of globSync('web-files/**/*.webfile.yml', { cwd: portalDir })) {
		const abs = resolve(portalDir, ymlPath);
		const doc = yaml.load(readFileSync(abs, 'utf8')) as Record<string, any> | undefined;
		if (!doc || typeof doc !== 'object') continue;
		const guid: string | undefined = doc.adx_webfileid;
		const name: string = doc.adx_name ?? '';
		const filename: string | undefined = doc.filename ?? doc.adx_partialurl;
		const partialUrl: string | undefined = doc.adx_partialurl;
		if (!guid || !filename) continue;
		const contentPath = resolve(dirname(abs), filename);
		resources.set(guid, {
			guid,
			type: 'web-file',
			name,
			contentPath,
			runtimeUrl: `/${partialUrl ?? filename}`,
		});
	}

	return resources;
}
