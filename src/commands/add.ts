import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { loadAndValidate, resolveRoots, saveConfig } from '../config.js';
import { log } from '../log.js';
import { scanPortalResources } from '../resources.js';
import type { PortalResource, ResourceType } from '../types.js';

interface AddOptions {
	configPath?: string;
}

export async function add({ configPath }: AddOptions): Promise<void> {
	const { configPath: resolvedConfigPath, config, portalDir: absPortalDir, sourceDir: absSourceDir } = loadAndValidate(configPath);

	// Scan available portal resources
	const resources = scanPortalResources(absPortalDir, config.roots);
	if (resources.size === 0) {
		log.errorRaw(`No portal resources found in ${absPortalDir}`);
		process.exit(1);
	}

	// Filter out already-mapped GUIDs
	const mappedGuids = new Set(config.entryPoints.map((e) => e.target));
	const available: PortalResource[] = [];
	for (const resource of resources.values()) {
		if (!mappedGuids.has(resource.guid)) {
			available.push(resource);
		}
	}

	if (available.length === 0) {
		console.log('All portal resources are already mapped to entry points.');
		return;
	}

	// Group by type for display
	const webTemplates = available.filter((r) => r.type === 'web-template');
	const webFiles = available.filter((r) => r.type === 'web-file' && /\.(js|css)$/i.test(r.contentPath));
	const serverLogic = available.filter((r) => r.type === 'server-logic');

	type Choice = { name: string; value: PortalResource; description: string };
	const choices: Choice[] = [];

	for (const r of webTemplates.sort((a, b) => a.name.localeCompare(b.name))) {
		choices.push({ name: `[web-template] ${r.name}`, value: r, description: r.guid });
	}
	for (const r of webFiles.sort((a, b) => a.name.localeCompare(b.name))) {
		choices.push({ name: `[web-file] ${r.name}`, value: r, description: r.guid });
	}
	for (const r of serverLogic.sort((a, b) => a.name.localeCompare(b.name))) {
		choices.push({ name: `[server-logic] ${r.name}`, value: r, description: r.guid });
	}

	if (choices.length === 0) {
		console.log('No unmapped resources available.');
		return;
	}

	const selected = await select({
		message: 'Select a portal resource to add:',
		choices,
	});

	const resourceType: ResourceType = selected.type;
	const roots = resolveRoots(config);

	// Determine the root subdirectory for this resource type
	const rootSubdir =
		resourceType === 'web-template'
			? roots.webTemplates
			: resourceType === 'web-file'
				? roots.webFiles
				: roots.serverLogic;

	const absRootDir = resolve(absSourceDir, rootSubdir);

	// For web-file: allow bare specifier or file
	let sourceRelative: string;

	if (resourceType === 'web-file') {
		const sourceMode = await select({
			message: 'Source:',
			choices: [
				{ name: 'Create a new TypeScript file', value: 'create' as const },
				{ name: 'Use a bare npm specifier (e.g. "lodash")', value: 'bare' as const },
			],
		});

		if (sourceMode === 'bare') {
			sourceRelative = await input({
				message: 'Bare npm specifier:',
				validate(v) {
					if (!v.trim()) return 'Specifier is required';
					return true;
				},
			});
		} else {
			sourceRelative = await promptCreateFile(selected, resourceType, rootSubdir, absRootDir, absSourceDir);
		}
	} else {
		sourceRelative = await promptCreateFile(selected, resourceType, rootSubdir, absRootDir, absSourceDir);
	}

	// Add entry point to config
	config.entryPoints.push({
		source: sourceRelative,
		target: selected.guid,
	});

	saveConfig(resolvedConfigPath, config);
	log.successRaw(`✓ Added entry: "${sourceRelative}" → ${selected.type} "${selected.name}" (${selected.guid})`);
}

async function promptCreateFile(
	selected: PortalResource,
	resourceType: ResourceType,
	rootSubdir: string,
	absRootDir: string,
	absSourceDir: string,
): Promise<string> {
	const ext = resourceType === 'web-template' ? '.tsx' : '.ts';
	const defaultName = sanitizeFilename(selected.name) + ext;

	const filename = await input({
		message: `Filename (inside ${rootSubdir}/):`,
		default: defaultName,
		validate(value) {
			if (!value.trim()) return 'Filename is required';
			// Must be a direct child — no path separators (other than a leading ./ which we strip)
			const stripped = value.trim().replace(/^\.\//, '');
			if (stripped.includes('/') || stripped.includes('\\')) {
				return `File must be a direct child of ${rootSubdir}/ (no subdirectories)`;
			}
			return true;
		},
	});

	const cleanName = filename.trim().replace(/^\.\//, '');
	const absPath = resolve(absRootDir, cleanName);

	// Validate the resolved path is directly under the root (defensive)
	const rel = relative(absRootDir, absPath);
	if (rel.includes('..') || rel.includes('/')) {
		log.errorRaw(`File path must be a direct child of ${rootSubdir}/`);
		process.exit(1);
	}

	if (existsSync(absPath)) {
		const overwrite = await confirm({
			message: `${absPath} already exists. Overwrite?`,
			default: false,
		});
		if (overwrite) {
			writeFileSync(absPath, '');
			log.successRaw(`Overwrote ${absPath}`);
		} else {
			log.successRaw(`Keeping existing file at ${absPath}`);
		}
	} else {
		mkdirSync(dirname(absPath), { recursive: true });
		writeFileSync(absPath, '');
		log.successRaw(`Created ${absPath}`);
	}

	return `${rootSubdir}/${cleanName}`;
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
