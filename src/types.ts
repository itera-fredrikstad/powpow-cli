export interface EntryPointOverrides {
	/** Per-entry UMD globals. Merged over the top-level `globals` (entry keys win). */
	globals?: Record<string, string>;
	/** Per-entry minify override. Default: minify in `build`, unminified in dev (watch) mode. */
	minify?: boolean;
}

export interface EntryPoint {
	source: string;
	target: string;
	options?: EntryPointOverrides;
}

export interface PowpowConfig {
	$schema?: string;
	version?: string;
	portalConfigPath: string;
	sourceDir?: string;
	entryPoints: EntryPoint[];
	globals?: Record<string, string>;
	/**
	 * Chrome extension ID of the PowPow Interceptor installation. If set, the dev server
	 * rejects requests whose `Origin` header does not match `chrome-extension://<id>`.
	 * When unset, all origins are allowed (current default for ease of setup).
	 */
	extensionId?: string;
}

export type ResourceType = 'web-template' | 'web-file';

export interface PortalResource {
	guid: string;
	type: ResourceType;
	name: string;
	contentPath: string;
	runtimeUrl?: string;
}
