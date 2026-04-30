import type { ResolvedEntry } from '../entries.js';
import type { PortalResource } from '../types.js';

export const UMD_VIRTUAL_PREFIX = 'virtual:umd-global:';
export const RUNTIME_URL_PREFIX = 'powpow-runtime:';

export interface CollectedOutput {
	resource: PortalResource;
	content: string;
}

/** Per-entry log of resolution decisions — used to build the dependency graph summary. */
export interface EntryResolutionLog {
	/** Absolute file paths or bare specifiers actually inlined into this entry. */
	bundledModules: Set<string>;
	/** Externalized references with the reason and optional target. */
	externalized: Array<{
		specifier: string;
		via: 'cross-entry' | 'umd-global';
		target?: string;
		global?: string;
	}>;
	/** Global variable names (e.g. 'React', '$') referenced via UMD shims. */
	globalsUsed: Set<string>;
}

export interface PowPowPluginOptions {
	/** The entry currently being bundled. */
	currentEntry: ResolvedEntry;
	/** All resolved entries — needed so the plugin can detect cross-entry imports. */
	entries: ResolvedEntry[];
	root?: string;
	sourceDir: string;
	globals?: Record<string, string>;
	/** Shared map tracking which packages are inlined by which entries (for dedup warnings) */
	inlinedPackages: Map<string, Set<string>>;
	/** Pre-scanned resource map — always provided by build orchestrator */
	resourceMap: Map<string, PortalResource>;
	/** Shared collector: each entry pushes its built content here; build.ts finalizes & writes. */
	outputCollector: Map<string, CollectedOutput>;
	/** Per-entry resolution log for building the dependency graph summary. */
	resolutionLog?: EntryResolutionLog;
}

/** Shared, per-entry-bundle context assembled in powpow() and consumed by each hook. */
export interface PluginContext {
	currentEntry: ResolvedEntry;
	entries: ResolvedEntry[];
	projectRoot: string;
	resourceMap: Map<string, PortalResource>;
	currentResource: PortalResource;
	globalsMap: Record<string, string>;
	inlinedPackages: Map<string, Set<string>>;
	outputCollector: Map<string, CollectedOutput>;
	resolutionLog?: EntryResolutionLog;
}
