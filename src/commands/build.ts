import { build as runBuild, typeCheck } from '../build.js';
import { loadAndValidate } from '../config.js';
import { log } from '../log.js';

interface BuildOptions {
	configPath?: string;
	signal?: AbortSignal;
	skipTypecheck?: boolean;
}

export async function build({ configPath, signal, skipTypecheck }: BuildOptions): Promise<void> {
	const { config, projectRoot } = loadAndValidate(configPath);

	const typecheckPromise = skipTypecheck ? Promise.resolve() : typeCheck(projectRoot, signal);
	const buildPromise = runBuild(config, projectRoot);

	const results = await Promise.allSettled([typecheckPromise, buildPromise]);
	const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

	if (failures.length > 0) {
		for (const failure of failures) {
			log.error(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
		}
		throw new Error(`Build failed: ${failures.length} step(s) reported errors`);
	}
}
