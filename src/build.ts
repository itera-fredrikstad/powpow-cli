import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch as fsWatch, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { InputOptions, OutputOptions } from 'rolldown';
import { rolldown } from 'rolldown';
import { resolvePortalDir, validateEntryPoints } from './config.js';
import { type ResolvedEntry, resolveEntries } from './entries.js';
import { log } from './log.js';
import type { CollectedOutput, EntryResolutionLog } from './plugin/context.js';
import { RUNTIME_URL_PREFIX } from './plugin/context.js';
import { buildGraph, printGraphSummary } from './graph.js';
import { powpow } from './plugin/index.js';
import { scanPortalResources } from './resources.js';
import { DEFAULT_BROWSER_GLOBALS } from './shims.js';
import type { PortalResource, PowpowConfig } from './types.js';
import { toPosix } from './utils.js';

interface BuildOptions {
	dev?: boolean;
}

function createEntryBuildConfig(
	config: PowpowConfig,
	projectRoot: string,
	currentEntry: ResolvedEntry,
	allEntries: ResolvedEntry[],
	inlinedPackages: Map<string, Set<string>>,
	resourceMap: Map<string, PortalResource>,
	outputCollector: Map<string, CollectedOutput>,
	resolutionLog: EntryResolutionLog,
	options: BuildOptions,
): { inputOptions: InputOptions; outputOptions: OutputOptions } {
	const sourceDir = config.sourceDir ?? 'src';
	const entryOptions = config.entryPoints.find(
		(e) => e.source === currentEntry.source && e.target === currentEntry.resource.guid,
	)?.options;
	const isServerLogic = currentEntry.type === 'server-logic';
	const mergedGlobals = isServerLogic
		? {}
		: { ...DEFAULT_BROWSER_GLOBALS, ...config.globals, ...entryOptions?.globals };
	const minify = entryOptions?.minify ?? config.minify ?? !options.dev;
	const sourceMap = entryOptions?.sourceMap ?? config.sourceMap ?? !!options.dev;

	const { input, plugin } = powpow({
		currentEntry,
		entries: allEntries,
		root: projectRoot,
		sourceDir,
		globals: mergedGlobals,
		inlinedPackages,
		resourceMap,
		outputCollector,
		resolutionLog,
	});

	const inputOptions: InputOptions = {
		input,
		platform: isServerLogic ? 'node' : 'browser',
		plugins: [plugin],
	};

	const outputOptions: OutputOptions = {
		entryFileNames: '[name]',
		format: 'es',
		dir: resolve(projectRoot, 'dist'),
		minify,
		sourcemap: sourceMap ? 'inline' : false,
	};

	return { inputOptions, outputOptions };
}

async function buildEntry(
	config: PowpowConfig,
	projectRoot: string,
	currentEntry: ResolvedEntry,
	allEntries: ResolvedEntry[],
	inlinedPackages: Map<string, Set<string>>,
	resourceMap: Map<string, PortalResource>,
	outputCollector: Map<string, CollectedOutput>,
	resolutionLog: EntryResolutionLog,
	options: BuildOptions,
): Promise<Set<string>> {
	const { inputOptions, outputOptions } = createEntryBuildConfig(
		config,
		projectRoot,
		currentEntry,
		allEntries,
		inlinedPackages,
		resourceMap,
		outputCollector,
		resolutionLog,
		options,
	);
	const bundle = await rolldown(inputOptions);
	// Use generate() instead of write() — generateBundle hook empties the chunk map and
	// routes content through outputCollector, so writing to disk would just create an empty dist/.
	await bundle.generate(outputOptions);
	const watchFiles = await bundle.watchFiles;
	await bundle.close();
	return new Set(watchFiles.map(toPosix));
}

function finalizeOutputs(
	outputCollector: Map<string, CollectedOutput>,
	lastWritten: Map<string, string>,
): void {
	const urlToHash = new Map<string, string>();
	for (const { resource, content } of outputCollector.values()) {
		if (resource.type === 'web-file' && resource.runtimeUrl) {
			const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
			urlToHash.set(resource.runtimeUrl, hash);
		}
	}

	const prefixPattern = new RegExp(`${RUNTIME_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^'")\\s]+)`, 'g');

	for (const { resource, content } of outputCollector.values()) {
		// Server-logic outputs never reference runtime URLs (cross-entry imports throw).
		const rewritten =
			resource.type === 'server-logic'
				? content
				: content.replace(prefixPattern, (_, url: string) => {
						const hash = urlToHash.get(url);
						return hash ? `${url}?v=${hash}` : url;
					});

		if (lastWritten.get(resource.contentPath) === rewritten) continue;

		mkdirSync(dirname(resource.contentPath), { recursive: true });
		writeFileSync(resource.contentPath, rewritten);
		lastWritten.set(resource.contentPath, rewritten);
		log.success(`${resource.type} "${resource.name}" → ${resource.contentPath}`);
	}
}

interface BuildState {
	resolvedEntries: ResolvedEntry[];
	resourceMap: Map<string, PortalResource>;
	inlinedPackages: Map<string, Set<string>>;
	outputCollector: Map<string, CollectedOutput>;
	resolutionLogs: Map<string, EntryResolutionLog>;
	/** Per-entry set of absolute file paths Rolldown loaded — populated by watchFiles after each successful build. */
	entryFiles: Map<string, Set<string>>;
	/** contentPath → last content we wrote there. Used to skip no-op disk writes between rebuilds. */
	lastWritten: Map<string, string>;
}

function freshState(resolvedEntries: ResolvedEntry[], resourceMap: Map<string, PortalResource>): BuildState {
	return {
		resolvedEntries,
		resourceMap,
		inlinedPackages: new Map(),
		outputCollector: new Map(),
		resolutionLogs: new Map(),
		entryFiles: new Map(),
		lastWritten: new Map(),
	};
}

/** Run a (possibly partial) build over the given state. If `entriesToBuild` is omitted, builds all entries. */
async function runBuild(
	config: PowpowConfig,
	projectRoot: string,
	state: BuildState,
	options: BuildOptions,
	entriesToBuild?: ResolvedEntry[],
): Promise<void> {
	const targets = entriesToBuild ?? state.resolvedEntries;

	// Reset per-entry state for the entries we're about to rebuild.
	for (const entry of targets) {
		const guid = entry.resource.guid;
		state.resolutionLogs.set(guid, {
			bundledModules: new Set(),
			externalized: [],
			globalsUsed: new Set(),
		});
		state.outputCollector.delete(guid);
		state.entryFiles.delete(guid);
		// Drop stale dedup entries pointing at this guid.
		for (const [pkg, owners] of state.inlinedPackages) {
			owners.delete(guid);
			if (owners.size === 0) state.inlinedPackages.delete(pkg);
		}
	}

	const results = await Promise.allSettled(
		targets.map((entry) => {
			const resolutionLog = state.resolutionLogs.get(entry.resource.guid)!;
			return buildEntry(
				config,
				projectRoot,
				entry,
				state.resolvedEntries,
				state.inlinedPackages,
				state.resourceMap,
				state.outputCollector,
				resolutionLog,
				options,
			);
		}),
	);

	const failures: { target: string; source: string; reason: unknown }[] = [];
	results.forEach((result, i) => {
		const entry = targets[i];
		if (result.status === 'fulfilled') {
			state.entryFiles.set(entry.resource.guid, result.value);
		} else {
			failures.push({ target: entry.resource.guid, source: entry.source, reason: result.reason });
		}
	});

	if (failures.length > 0) {
		for (const { source, target, reason } of failures) {
			log.error(`Failed to build entry "${source}" → ${target}`);
			console.error(reason);
		}
		throw new Error(`${failures.length} of ${targets.length} entry points failed to build`);
	}

	finalizeOutputs(state.outputCollector, state.lastWritten);
	printGraphSummary(buildGraph(state.resolvedEntries, state.resolutionLogs));
}

export async function build(
	config: PowpowConfig,
	projectRoot: string,
	preScannedResources?: Map<string, PortalResource>,
	options: BuildOptions = {},
): Promise<void> {
	const portalDir = resolvePortalDir(config, projectRoot);
	const resourceMap = preScannedResources ?? scanPortalResources(portalDir, config.roots);
	validateEntryPoints(config, projectRoot, resourceMap);

	const sourceDir = resolve(projectRoot, config.sourceDir ?? 'src');
	const resolvedEntries = resolveEntries(config, resourceMap, sourceDir);
	const state = freshState(resolvedEntries, resourceMap);
	await runBuild(config, projectRoot, state, options);
}

/**
 * Compute the set of entries affected by a set of changed source paths.
 * - An entry is affected if its source file is among the changes, or if Rolldown loaded
 *   the changed file when bundling it (per `entryFiles`).
 * - Entries with no recorded `entryFiles` (e.g. previous build failed) are always rebuilt
 *   on any change so they get another chance.
 */
function affectedEntries(
	changedPaths: Set<string>,
	entries: ResolvedEntry[],
	entryFiles: Map<string, Set<string>>,
): { entry: ResolvedEntry; reason: string }[] {
	const out: { entry: ResolvedEntry; reason: string }[] = [];
	for (const entry of entries) {
		const files = entryFiles.get(entry.resource.guid);
		if (!files) {
			out.push({ entry, reason: 'no prior build' });
			continue;
		}
		if (entry.absSource && changedPaths.has(entry.absSource)) {
			out.push({ entry, reason: 'entry source' });
			continue;
		}
		for (const path of changedPaths) {
			if (files.has(path)) {
				out.push({ entry, reason: `loads ${path}` });
				break;
			}
		}
	}
	return out;
}

export async function watchBuild(
	config: PowpowConfig,
	projectRoot: string,
	preScannedResources?: Map<string, PortalResource>,
	signal?: AbortSignal,
): Promise<void> {
	const portalDir = resolvePortalDir(config, projectRoot);
	const resourceMap = preScannedResources ?? scanPortalResources(portalDir, config.roots);
	validateEntryPoints(config, projectRoot, resourceMap);

	const sourceDir = resolve(projectRoot, config.sourceDir ?? 'src');
	const resolvedEntries = resolveEntries(config, resourceMap, sourceDir);
	const state = freshState(resolvedEntries, resourceMap);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let building = false;
	const pendingChanges = new Set<string>();
	// `null` = pending request to rebuild everything (initial build, or change with no filename info).
	let pendingFullRebuild = true;

	async function rebuild() {
		if (building) return;
		building = true;
		try {
			while (pendingFullRebuild || pendingChanges.size > 0) {
				const fullRebuild = pendingFullRebuild;
				const changes = new Set(pendingChanges);
				pendingFullRebuild = false;
				pendingChanges.clear();

				let targets: ResolvedEntry[] | undefined;
				if (!fullRebuild) {
					const affected = affectedEntries(changes, resolvedEntries, state.entryFiles);
					if (affected.length === 0) {
						log.info(
							`No entries depend on the changed file${changes.size === 1 ? '' : 's'} — skipping rebuild.`,
							'watch',
						);
						continue;
					}
					for (const { entry, reason } of affected) {
						log.info(`  → "${entry.source}" rebuilds (${reason})`, 'watch');
					}
					targets = affected.map((a) => a.entry);
				}

				const label = targets
					? `Rebuilding ${targets.length}/${resolvedEntries.length} entr${targets.length === 1 ? 'y' : 'ies'}…`
					: 'Building…';
				log.info(label, 'watch');
				const start = performance.now();
				try {
					await runBuild(config, projectRoot, state, { dev: true }, targets);
					log.info(`Built in ${Math.round(performance.now() - start)}ms`, 'watch');
				} catch (error) {
					log.error('Build error:', 'watch');
					console.error(error);
				}
			}
		} finally {
			building = false;
		}
	}

	function scheduleRebuild() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			void rebuild();
		}, 100);
	}

	// Initial full build
	await rebuild();

	const watcher = fsWatch(sourceDir, { recursive: true }, (_event, filename) => {
		if (filename) {
			pendingChanges.add(toPosix(resolve(sourceDir, filename.toString())));
		} else {
			pendingFullRebuild = true;
		}
		scheduleRebuild();
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
