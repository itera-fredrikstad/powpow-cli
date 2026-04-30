import { resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { isBareSpecifier } from '../utils.js';
import type { PluginContext, PowPowPluginOptions } from './context.js';
import { createGenerateBundleHook, createRenderChunkHook } from './output.js';
import { createResolveIdHook } from './resolve.js';
import { createLoadHook } from './umd.js';

export type { PowPowPluginOptions } from './context.js';

export function powpow(options: PowPowPluginOptions): {
	input: Record<string, string>;
	plugin: Plugin;
} {
	const { currentEntry, entries, root: rootOpt, sourceDir, globals, inlinedPackages, resourceMap, outputCollector } = options;
	const resolutionLog = options.resolutionLog ?? {
		bundledModules: new Set<string>(),
		externalized: [],
		globalsUsed: new Set<string>(),
	};

	const root = rootOpt ? resolve(rootOpt) : process.cwd();
	const absSourceDir = resolve(root, sourceDir);
	const globalsMap = globals ?? {};

	const currentResource = currentEntry.resource;

	const input: Record<string, string> = {};
	if (isBareSpecifier(currentEntry.source)) {
		input[currentEntry.resource.guid] = currentEntry.source;
	} else {
		input[currentEntry.resource.guid] = resolve(absSourceDir, currentEntry.source);
	}

	const ctx: PluginContext = {
		currentEntry,
		entries,
		projectRoot: root,
		resourceMap,
		currentResource,
		globalsMap,
		inlinedPackages,
		outputCollector,
		resolutionLog,
	};

	const plugin: Plugin = {
		name: 'powpow',
		resolveId: createResolveIdHook(ctx),
		load: createLoadHook(ctx),
		renderChunk: createRenderChunkHook(),
		generateBundle: createGenerateBundleHook(ctx),
	};

	return { input, plugin };
}
