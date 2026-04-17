import { loadAndValidate } from '../config.js';
import { startDevServer } from '../dev-server.js';
import { scanPortalResources } from '../resources.js';

interface ServeOptions {
	configPath?: string;
	signal?: AbortSignal;
}

export async function serve({ configPath, signal }: ServeOptions): Promise<void> {
	const { config, portalDir } = loadAndValidate(configPath);
	const resources = scanPortalResources(portalDir);

	const server = startDevServer({
		portalDir,
		port: parseInt(process.env.PORT ?? '3001', 10),
		config,
		resources,
	});

	await new Promise<void>((resolvePromise) => {
		const shutdown = () => {
			server.close(() => resolvePromise());
		};
		if (signal) {
			if (signal.aborted) shutdown();
			else signal.addEventListener('abort', shutdown, { once: true });
		}
	});
}
