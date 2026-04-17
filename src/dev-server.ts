import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, resolve } from 'node:path';
import { log } from './log.js';
import { scanPortalResources } from './resources.js';
import type { PortalResource, PowpowConfig } from './types.js';

const MIME_TYPES: Record<string, string> = {
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.html': 'text/html',
	'.json': 'application/json',
	'.map': 'application/json',
};

function mimeFor(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	return MIME_TYPES[ext] ?? 'application/octet-stream';
}

interface DevServerOptions {
	portalDir: string;
	port?: number;
	host?: string;
	config: PowpowConfig;
	/** Pre-scanned portal resources. If omitted, the server will scan on startup. */
	resources?: Map<string, PortalResource>;
}

export function startDevServer({ portalDir, port = 3001, host = '127.0.0.1', config, resources: preScanned }: DevServerOptions): Server {
	const absPortalDir = resolve(portalDir);
	const resources = preScanned ?? scanPortalResources(absPortalDir);

	const entryPointsByTarget = new Map(config.entryPoints.map((ep) => [ep.target, ep]));

	const webFilesByUrl = new Map<string, PortalResource>();
	const webTemplatesById = new Map<string, PortalResource>();

	for (const resource of resources.values()) {
		if (!entryPointsByTarget.has(resource.guid)) continue;

		if (resource.type === 'web-file' && resource.runtimeUrl) {
			webFilesByUrl.set(resource.runtimeUrl, resource);
		} else if (resource.type === 'web-template') {
			webTemplatesById.set(resource.guid, resource);
		}
	}

	const allowedOrigin = config.extensionId ? `chrome-extension://${config.extensionId}` : null;

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', `http://${host}:${port}`);
		const pathname = url.pathname;

		const origin = req.headers.origin;
		const corsOrigin = allowedOrigin ?? '*';
		if (allowedOrigin && origin && origin !== allowedOrigin) {
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'origin not allowed', origin }));
			return;
		}

		res.setHeader('Access-Control-Allow-Origin', corsOrigin);
		res.setHeader('Vary', 'Origin');
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Path-traversal note: `webFilesByUrl` is an exact-match map built from pre-scanned
		// portal resources, so `../` in the request path simply misses the lookup. No filesystem
		// traversal is possible — we never concatenate the request path into a disk path.
		if (pathname.startsWith('/web-files/')) {
			const partialUrl = `/${pathname.slice('/web-files/'.length)}`;
			const resource = webFilesByUrl.get(partialUrl);
			if (resource && existsSync(resource.contentPath)) {
				res.writeHead(200, { 'Content-Type': mimeFor(resource.contentPath) });
				res.end(readFileSync(resource.contentPath));
				return;
			}
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'web file not found', partialUrl }));
			return;
		}

		if (pathname.startsWith('/web-templates/')) {
			const guid = pathname.slice('/web-templates/'.length);
			const resource = webTemplatesById.get(guid);
			if (resource && existsSync(resource.contentPath)) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(readFileSync(resource.contentPath, 'utf8'));
				return;
			}
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'web template not found', guid }));
			return;
		}

		if (pathname === '/manifest') {
			const webFiles = [...webFilesByUrl.values()].map((resource) => ({
				guid: resource.guid,
				name: resource.name,
				runtimeUrl: resource.runtimeUrl,
				servePath: `/web-files${resource.runtimeUrl}`,
				source: entryPointsByTarget.get(resource.guid)!.source,
			}));

			const webTemplates = [...webTemplatesById.values()].map((resource) => ({
				guid: resource.guid,
				name: resource.name,
				servePath: `/web-templates/${resource.guid}`,
				source: entryPointsByTarget.get(resource.guid)!.source,
			}));

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ webFiles, webTemplates }, null, '\t'));
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'not found', pathname }));
	});

	server.listen(port, host, () => {
		log.success(`Serving portal resources on http://${host}:${port}`, 'dev-server');
		console.log(`  Web files:     /web-files/{partialUrl}`);
		console.log(`  Web templates: /web-templates/{guid}`);
		console.log(`  Manifest:      /manifest`);
		console.log(`  Portal dir:    ${absPortalDir}`);
		console.log(`  Resources:     ${webFilesByUrl.size} web files, ${webTemplatesById.size} web templates`);
		console.log(`  CORS:          ${allowedOrigin ?? '* (allow-all — set "extensionId" in config to restrict)'}`);
	});

	return server;
}
