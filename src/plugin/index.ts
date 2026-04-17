import { dirname, relative, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { isBareSpecifier, toPosix } from '../utils.js';
import type { PluginContext, PowPowPluginOptions } from './context.js';
import { createGenerateBundleHook, createRenderChunkHook } from './output.js';
import { createResolveIdHook } from './resolve.js';
import { createLoadHook } from './umd.js';

export type { PowPowPluginOptions } from './context.js';

export function powpow(options: PowPowPluginOptions): {
	input: Record<string, string>;
	plugin: Plugin;
} {
	const { entry, root: rootOpt, sourceDir, globals, inlinedPackages, resourceMap, ownershipMaps, outputCollector } = options;

	const root = rootOpt ? resolve(rootOpt) : process.cwd();
	const absSourceDir = resolve(root, sourceDir);
	const globalsMap = globals ?? {};
	const { dirOwners, rootFileOwners, packageEntries } = ownershipMaps;

	// Entry-target existence is enforced by validateEntryPoints() before we get here.
	const currentResource = resourceMap.get(entry.target)!;

	let currentAbsSubdir: string | null = null;
	if (!isBareSpecifier(entry.source)) {
		const relSource = relative(absSourceDir, resolve(absSourceDir, entry.source));
		const dir = dirname(relSource);
		if (dir !== '.') {
			currentAbsSubdir = toPosix(resolve(absSourceDir, dir));
		}
	}

	const input: Record<string, string> = {};
	if (isBareSpecifier(entry.source)) {
		input[entry.target] = entry.source;
	} else {
		input[entry.target] = resolve(absSourceDir, entry.source);
	}

	const ctx: PluginContext = {
		entry,
		resourceMap,
		currentResource,
		currentAbsSubdir,
		dirOwners,
		rootFileOwners,
		packageEntries,
		globalsMap,
		inlinedPackages,
		outputCollector,
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
