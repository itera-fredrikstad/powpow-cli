import type { EntryOwner, OwnershipMaps } from '../ownership.js';
import type { PortalResource } from '../types.js';

export const UMD_VIRTUAL_PREFIX = 'virtual:umd-global:';
export const RUNTIME_URL_PREFIX = 'powpow-runtime:';

export interface CollectedOutput {
	resource: PortalResource;
	content: string;
}

export interface PowPowPluginOptions {
	entry: { source: string; target: string };
	root?: string;
	sourceDir: string;
	globals?: Record<string, string>;
	/** Shared map tracking which packages are inlined by which entries (for dedup warnings) */
	inlinedPackages: Map<string, Set<string>>;
	/** Pre-scanned resource map — always provided by build orchestrator */
	resourceMap: Map<string, PortalResource>;
	/** Pre-computed ownership maps — always provided by build orchestrator */
	ownershipMaps: OwnershipMaps;
	/** Shared collector: each entry pushes its built content here; build.ts finalizes & writes. */
	outputCollector: Map<string, CollectedOutput>;
}

/** Shared, per-entry-bundle context assembled in powpow() and consumed by each hook. */
export interface PluginContext {
	entry: { source: string; target: string };
	resourceMap: Map<string, PortalResource>;
	currentResource: PortalResource;
	currentAbsSubdir: string | null;
	dirOwners: OwnershipMaps['dirOwners'];
	rootFileOwners: OwnershipMaps['rootFileOwners'];
	packageEntries: OwnershipMaps['packageEntries'];
	globalsMap: Record<string, string>;
	inlinedPackages: Map<string, Set<string>>;
	outputCollector: Map<string, CollectedOutput>;
}

export type { EntryOwner };
