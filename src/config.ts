import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { PortalResource, PowpowConfig } from './types.js';
import { isBareSpecifier } from './utils.js';

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
	const dirToEntries = new Map<string, string[]>();
	const missingTargets: { source: string; target: string }[] = [];

	for (const entry of config.entryPoints) {
		if (!resourceMap.has(entry.target)) {
			missingTargets.push(entry);
		}

		// Skip bare specifiers (npm packages) – they don't occupy a directory
		if (isBareSpecifier(entry.source)) {
			continue;
		}
		const absSource = resolve(sourceDir, entry.source);
		const relSource = relative(sourceDir, absSource);
		const dir = dirname(relSource);
		const existing = dirToEntries.get(dir);
		if (existing) {
			existing.push(entry.source);
		} else {
			dirToEntries.set(dir, [entry.source]);
		}
	}

	if (missingTargets.length > 0) {
		const lines = missingTargets.map((e) => `  - "${e.source}" → ${e.target}`).join('\n');
		throw new Error(
			`Entry points reference GUIDs that do not match any portal resource:\n${lines}\n` +
				`Check that the target GUIDs exist in the portal directory's YAML metadata.`,
		);
	}

	for (const [dir, sources] of dirToEntries) {
		if (sources.length > 1) {
			const dirLabel = dir === '.' ? 'sourceDir root' : `"${dir}"`;
			throw new Error(
				`Multiple entry points share the same directory ${dirLabel}: ${sources.join(', ')}. ` +
					`Only one file-based entry point is allowed per directory.`,
			);
		}
	}
}
