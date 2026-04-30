import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { PortalResource, PowpowConfig, ResourceType } from './types.js';
import { isBareSpecifier, toPosix } from './utils.js';

export const DEFAULT_ROOTS = {
	webTemplates: 'web-templates',
	webFiles: 'web-files',
	serverLogic: 'server-logic',
} as const;

export function resolveRoots(config: PowpowConfig): { webTemplates: string; webFiles: string; serverLogic: string } {
	return {
		webTemplates: config.roots?.webTemplates ?? DEFAULT_ROOTS.webTemplates,
		webFiles: config.roots?.webFiles ?? DEFAULT_ROOTS.webFiles,
		serverLogic: config.roots?.serverLogic ?? DEFAULT_ROOTS.serverLogic,
	};
}

const CONFIG_FILENAME = 'powpow.config.json';

export function findConfig(configPath?: string): string {
	if (configPath) {
		const abs = resolve(configPath);
		if (!existsSync(abs)) {
			throw new Error(`Config file not found: ${abs}`);
		}
		return abs;
	}

	const candidate = resolve(process.cwd(), CONFIG_FILENAME);
	if (!existsSync(candidate)) {
		throw new Error(`No ${CONFIG_FILENAME} found in ${process.cwd()}. Run "powpow init" to create one, or use --config to specify a path.`);
	}
	return candidate;
}

export function loadConfig(configPath: string): PowpowConfig {
	const raw = readFileSync(configPath, 'utf8');

	let config: PowpowConfig;
	try {
		config = JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}

	if (!config.portalConfigPath || typeof config.portalConfigPath !== 'string') {
		throw new Error(`Invalid config: "portalConfigPath" is required (in ${configPath})`);
	}
	if (!Array.isArray(config.entryPoints)) {
		throw new Error(`Invalid config: "entryPoints" must be an array (in ${configPath})`);
	}
	for (const [i, entry] of config.entryPoints.entries()) {
		if (!entry || typeof entry !== 'object') {
			throw new Error(`Invalid config: "entryPoints[${i}]" must be an object (in ${configPath})`);
		}
		if (typeof entry.source !== 'string' || typeof entry.target !== 'string') {
			throw new Error(`Invalid config: "entryPoints[${i}]" must have string "source" and "target" (in ${configPath})`);
		}
		if (entry.options !== undefined) {
			if (typeof entry.options !== 'object' || entry.options === null || Array.isArray(entry.options)) {
				throw new Error(`Invalid config: "entryPoints[${i}].options" must be an object (in ${configPath})`);
			}
			if (entry.options.globals !== undefined) {
				if (typeof entry.options.globals !== 'object' || entry.options.globals === null || Array.isArray(entry.options.globals)) {
					throw new Error(`Invalid config: "entryPoints[${i}].options.globals" must be an object (in ${configPath})`);
				}
				for (const [key, value] of Object.entries(entry.options.globals)) {
					if (typeof value !== 'string') {
						throw new Error(`Invalid config: "entryPoints[${i}].options.globals.${key}" must be a string (in ${configPath})`);
					}
				}
			}
			if (entry.options.minify !== undefined && typeof entry.options.minify !== 'boolean') {
				throw new Error(`Invalid config: "entryPoints[${i}].options.minify" must be a boolean (in ${configPath})`);
			}
			if (entry.options.sourceMap !== undefined && typeof entry.options.sourceMap !== 'boolean') {
				throw new Error(`Invalid config: "entryPoints[${i}].options.sourceMap" must be a boolean (in ${configPath})`);
			}
		}
	}
	if (config.globals !== undefined) {
		if (typeof config.globals !== 'object' || config.globals === null || Array.isArray(config.globals)) {
			throw new Error(`Invalid config: "globals" must be an object mapping package names to global variable names (in ${configPath})`);
		}
		for (const [key, value] of Object.entries(config.globals)) {
			if (typeof value !== 'string') {
				throw new Error(`Invalid config: "globals.${key}" must be a string (in ${configPath})`);
			}
		}
	}
	if (config.extensionId !== undefined && typeof config.extensionId !== 'string') {
		throw new Error(`Invalid config: "extensionId" must be a string (in ${configPath})`);
	}
	if (config.minify !== undefined && typeof config.minify !== 'boolean') {
		throw new Error(`Invalid config: "minify" must be a boolean (in ${configPath})`);
	}
	if (config.sourceMap !== undefined && typeof config.sourceMap !== 'boolean') {
		throw new Error(`Invalid config: "sourceMap" must be a boolean (in ${configPath})`);
	}

	return config;
}

export function saveConfig(configPath: string, config: PowpowConfig): void {
	writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
}

export function resolveProjectRoot(configPath: string): string {
	return dirname(configPath);
}

export function resolveSourceDir(config: PowpowConfig, projectRoot: string): string {
	return resolve(projectRoot, config.sourceDir ?? 'src');
}

export function resolvePortalDir(config: PowpowConfig, projectRoot: string): string {
	return resolve(projectRoot, config.portalConfigPath);
}

export interface LoadedConfig {
	configPath: string;
	config: PowpowConfig;
	projectRoot: string;
	portalDir: string;
	sourceDir: string;
}

export function loadAndValidate(configPath?: string): LoadedConfig {
	const resolvedConfigPath = findConfig(configPath);
	const config = loadConfig(resolvedConfigPath);
	const projectRoot = resolveProjectRoot(resolvedConfigPath);
	return {
		configPath: resolvedConfigPath,
		config,
		projectRoot,
		portalDir: resolvePortalDir(config, projectRoot),
		sourceDir: resolveSourceDir(config, projectRoot),
	};
}

export function validateEntryPoints(config: PowpowConfig, projectRoot: string, resourceMap: Map<string, PortalResource>): void {
	const sourceDir = resolveSourceDir(config, projectRoot);
	const roots = resolveRoots(config);
	const rootToType: Array<{ root: string; type: ResourceType }> = [
		{ root: roots.webTemplates, type: 'web-template' },
		{ root: roots.webFiles, type: 'web-file' },
		{ root: roots.serverLogic, type: 'server-logic' },
	];
	const missingTargets: { source: string; target: string }[] = [];
	const layoutErrors: string[] = [];

	for (const entry of config.entryPoints) {
		const resource = resourceMap.get(entry.target);
		if (!resource) {
			missingTargets.push(entry);
			continue;
		}

		if (isBareSpecifier(entry.source)) {
			if (resource.type !== 'web-file') {
				layoutErrors.push(
					`Entry "${entry.source}" → ${entry.target}: bare specifier sources are only allowed for web-file targets, but target type is ${resource.type}.`,
				);
			}
			continue;
		}

		const absSource = toPosix(resolve(sourceDir, entry.source));
		const relSource = toPosix(relative(sourceDir, absSource));
		const segments = relSource.split('/');
		if (segments.length !== 2 || segments[0] === '..' || relSource.startsWith('..')) {
			layoutErrors.push(
				`Entry "${entry.source}" → ${entry.target}: source must be a direct child of one of the configured roots (${rootToType.map((r) => `"${r.root}"`).join(', ')}).`,
			);
			continue;
		}
		const [topDir] = segments;
		const matchedRoot = rootToType.find((r) => r.root === topDir);
		if (!matchedRoot) {
			layoutErrors.push(
				`Entry "${entry.source}" → ${entry.target}: top-level directory "${topDir}" is not one of the configured roots (${rootToType.map((r) => `"${r.root}"`).join(', ')}).`,
			);
			continue;
		}
		if (matchedRoot.type !== resource.type) {
			layoutErrors.push(
				`Entry "${entry.source}" → ${entry.target}: file lives under "${matchedRoot.root}/" (${matchedRoot.type}) but target GUID resolves to a ${resource.type} resource.`,
			);
		}
	}

	if (missingTargets.length > 0) {
		const lines = missingTargets.map((e) => `  - "${e.source}" → ${e.target}`).join('\n');
		throw new Error(
			`Entry points reference GUIDs that do not match any portal resource:\n${lines}\n` +
				`Check that the target GUIDs exist in the portal directory's YAML metadata.`,
		);
	}

	if (layoutErrors.length > 0) {
		throw new Error(`Invalid entry-point layout:\n${layoutErrors.map((m) => `  - ${m}`).join('\n')}`);
	}
}
