import { watchBuild } from '../build.js';
import { loadAndValidate } from '../config.js';
import { startDevServer } from '../dev-server.js';
import { scanPortalResources } from '../resources.js';

interface DevOptions {
	configPath?: string;
	signal?: AbortSignal;
}

export async function dev({ configPath, signal }: DevOptions): Promise<void> {
	const { config, projectRoot, portalDir } = loadAndValidate(configPath);
	const resources = scanPortalResources(portalDir);

	const server = startDevServer({
		portalDir,
		port: parseInt(process.env.PORT ?? '3001', 10),
		config,
		resources,
	});

	const onAbort = () => server.close();
	signal?.addEventListener('abort', onAbort, { once: true });

	await watchBuild(config, projectRoot, resources, signal);
}
