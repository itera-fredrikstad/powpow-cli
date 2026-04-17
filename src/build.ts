import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch as fsWatch, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { InputOptions, OutputOptions } from 'rolldown';
import { rolldown } from 'rolldown';
import { resolvePortalDir, validateEntryPoints } from './config.js';
import { log } from './log.js';
import { buildOwnershipMaps, type OwnershipMaps } from './ownership.js';
import type { CollectedOutput } from './plugin/context.js';
import { RUNTIME_URL_PREFIX } from './plugin/context.js';
import { powpow } from './plugin/index.js';
import { scanPortalResources } from './resources.js';
import type { PortalResource, PowpowConfig } from './types.js';

interface BuildOptions {
	dev?: boolean;
}

function createEntryBuildConfig(
	config: PowpowConfig,
	projectRoot: string,
	entry: PowpowConfig['entryPoints'][number],
	inlinedPackages: Map<string, Set<string>>,
	resourceMap: Map<string, PortalResource>,
	ownershipMaps: OwnershipMaps,
	outputCollector: Map<string, CollectedOutput>,
	options: BuildOptions,
): { inputOptions: InputOptions; outputOptions: OutputOptions } {
	const sourceDir = config.sourceDir ?? 'src';
	const mergedGlobals = { ...config.globals, ...entry.options?.globals };
	const minify = entry.options?.minify ?? !options.dev;

	const { input, plugin } = powpow({
		entry,
		root: projectRoot,
		sourceDir,
		globals: mergedGlobals,
		inlinedPackages,
		resourceMap,
		ownershipMaps,
		outputCollector,
	});

	const inputOptions: InputOptions = {
		input,
		platform: 'browser',
		plugins: [plugin],
	};

	const outputOptions: OutputOptions = {
		entryFileNames: '[name]',
		format: 'es',
		dir: resolve(projectRoot, 'dist'),
		minify,
		sourcemap: options.dev ? 'inline' : false,
	};

	return { inputOptions, outputOptions };
}

async function buildEntry(
	config: PowpowConfig,
	projectRoot: string,
	entry: { source: string; target: string },
	inlinedPackages: Map<string, Set<string>>,
	resourceMap: Map<string, PortalResource>,
	ownershipMaps: OwnershipMaps,
	outputCollector: Map<string, CollectedOutput>,
	options: BuildOptions,
): Promise<void> {
	const { inputOptions, outputOptions } = createEntryBuildConfig(
		config,
		projectRoot,
		entry,
		inlinedPackages,
		resourceMap,
		ownershipMaps,
		outputCollector,
		options,
	);
	const bundle = await rolldown(inputOptions);
	// generateBundle pushes final content into outputCollector and removes chunks from the bundle;
	// we still call write() so rolldown runs its full pipeline and flushes any other assets.
	await bundle.write(outputOptions);
	await bundle.close();
}

function finalizeOutputs(outputCollector: Map<string, CollectedOutput>): void {
	const urlToHash = new Map<string, string>();
	for (const { resource, content } of outputCollector.values()) {
		if (resource.type === 'web-file' && resource.runtimeUrl) {
			const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
			urlToHash.set(resource.runtimeUrl, hash);
		}
	}

	const prefixPattern = new RegExp(`${RUNTIME_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'")\\s]+)`, 'g');

	for (const { resource, content } of outputCollector.values()) {
		const rewritten = content.replace(prefixPattern, (_, url: string) => {
			const hash = urlToHash.get(url);
			return hash ? `${url}?v=${hash}` : url;
		});

		mkdirSync(dirname(resource.contentPath), { recursive: true });
		writeFileSync(resource.contentPath, rewritten);
		log.success(`${resource.type} "${resource.name}" → ${resource.contentPath}`);
	}
}

export async function build(
	config: PowpowConfig,
	projectRoot: string,
	preScannedResources?: Map<string, PortalResource>,
	options: BuildOptions = {},
): Promise<void> {
	const portalDir = resolvePortalDir(config, projectRoot);
	const resourceMap = preScannedResources ?? scanPortalResources(portalDir);
	validateEntryPoints(config, projectRoot, resourceMap);

	const sourceDir = resolve(projectRoot, config.sourceDir ?? 'src');
	const ownershipMaps = buildOwnershipMaps(config.entryPoints, resourceMap, sourceDir);
	const inlinedPackages = new Map<string, Set<string>>();
	const outputCollector = new Map<string, CollectedOutput>();

	const results = await Promise.allSettled(
		config.entryPoints.map((entry) =>
			buildEntry(config, projectRoot, entry, inlinedPackages, resourceMap, ownershipMaps, outputCollector, options),
		),
	);

	const failures: { target: string; source: string; reason: unknown }[] = [];
	results.forEach((result, i) => {
		if (result.status === 'rejected') {
			const entry = config.entryPoints[i];
			failures.push({ target: entry.target, source: entry.source, reason: result.reason });
		}
	});

	if (failures.length > 0) {
		for (const { source, target, reason } of failures) {
			log.error(`Failed to build entry "${source}" → ${target}`);
			console.error(reason);
		}
		throw new Error(`${failures.length} of ${config.entryPoints.length} entry points failed to build`);
	}

	finalizeOutputs(outputCollector);

	for (const [pkg, entries] of inlinedPackages) {
		if (entries.size > 1) {
			log.warn(
				`Package "${pkg}" is inlined by ${entries.size} entry points. ` +
					`Consider creating a web-file entry point with source "${pkg}" to avoid code duplication.`,
			);
		}
	}
}

export async function watchBuild(
	config: PowpowConfig,
	projectRoot: string,
	preScannedResources?: Map<string, PortalResource>,
	signal?: AbortSignal,
): Promise<void> {
	const sourceDir = resolve(projectRoot, config.sourceDir ?? 'src');

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let building = false;
	let pending = false;

	async function rebuild() {
		if (building) {
			pending = true;
			return;
		}
		building = true;
		try {
			do {
				pending = false;
				log.info('Building\u2026', 'watch');
				const start = performance.now();
				try {
					await build(config, projectRoot, preScannedResources, { dev: true });
					log.info(`Built in ${Math.round(performance.now() - start)}ms`, 'watch');
				} catch (error) {
					log.error('Build error:', 'watch');
					console.error(error);
				}
			} while (pending);
		} finally {
			building = false;
		}
	}

	// Initial build
	await rebuild();

	const watcher = fsWatch(sourceDir, { recursive: true }, (_event, _filename) => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(rebuild, 100);
	});

	return new Promise<void>((resolvePromise) => {
		const shutdown = () => {
			watcher.close();
			if (debounceTimer) clearTimeout(debounceTimer);
			resolvePromise();
		};
		if (signal) {
			if (signal.aborted) shutdown();
			else signal.addEventListener('abort', shutdown, { once: true });
		}
	});
}

export function typeCheck(projectRoot: string, signal?: AbortSignal): Promise<void> {
	return new Promise((done, fail) => {
		const tscPath = resolve(projectRoot, 'node_modules', '.bin', 'tsc');
		const prefix = log.prefix('tsc');

		const child = spawn(tscPath, [], {
			cwd: projectRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, FORCE_COLOR: '1' },
		});

		const onAbort = () => child.kill('SIGTERM');
		if (signal) {
			if (signal.aborted) onAbort();
			else signal.addEventListener('abort', onAbort, { once: true });
		}

		child.stdout?.on('data', (data: Buffer) => {
			for (const line of data.toString().split('\n')) {
				if (line) process.stdout.write(`${prefix + line}\n`);
			}
		});

		child.stderr?.on('data', (data: Buffer) => {
			for (const line of data.toString().split('\n')) {
				if (line) process.stderr.write(`${prefix + line}\n`);
			}
		});

		child.on('exit', (code, sig) => {
			signal?.removeEventListener('abort', onAbort);
			if (code === 0) done();
			else if (sig) fail(new Error(`tsc was terminated by signal ${sig}`));
			else fail(new Error(`tsc exited with code ${code}`));
		});
	});
}
