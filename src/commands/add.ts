import { existsSync, globSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { loadAndValidate, saveConfig } from '../config.js';
import { log } from '../log.js';
import { scanPortalResources } from '../resources.js';
import type { PortalResource } from '../types.js';

interface AddOptions {
	configPath?: string;
}

export async function add({ configPath }: AddOptions): Promise<void> {
	const { configPath: resolvedConfigPath, config, portalDir: absPortalDir, sourceDir: absSourceDir } = loadAndValidate(configPath);

	// Scan available portal resources
	const resources = scanPortalResources(absPortalDir);
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

	type Choice = { name: string; value: PortalResource; description: string };
	const choices: Choice[] = [];

	if (webTemplates.length > 0) {
		for (const r of webTemplates.sort((a, b) => a.name.localeCompare(b.name))) {
			choices.push({
				name: `[web-template] ${r.name}`,
				value: r,
				description: r.guid,
			});
		}
	}

	if (webFiles.length > 0) {
		for (const r of webFiles.sort((a, b) => a.name.localeCompare(b.name))) {
			choices.push({
				name: `[web-file] ${r.name}`,
				value: r,
				description: r.guid,
			});
		}
	}

	const selected = await select({
		message: 'Select a portal resource to add:',
		choices,
	});

	// Ask for source file
	const sourceAction = await select({
		message: 'Source file:',
		choices: [
			{ name: 'Create a new TypeScript file', value: 'create' as const },
			{ name: 'Select an existing file', value: 'existing' as const },
		],
	});

	let sourceRelative: string;

	if (sourceAction === 'create') {
		const defaultName = sanitizeFilename(selected.name) + '.ts';
		const filename = await input({
			message: `File path (relative to ${config.sourceDir ?? 'src'}/):`,
			default: defaultName,
		});

		const absPath = resolve(absSourceDir, filename);

		if (existsSync(absPath)) {
			const overwrite = await confirm({
				message: `${absPath} already exists. Overwrite?`,
				default: false,
			});
			if (overwrite) {
				writeFileSync(absPath, `// Entry point for "${selected.name}"\nexport {};\n`);
				log.successRaw(`Overwrote ${absPath}`);
			} else {
				log.successRaw(`Keeping existing file at ${absPath}`);
			}
		} else {
			mkdirSync(dirname(absPath), { recursive: true });
			writeFileSync(absPath, `// Entry point for "${selected.name}"\nexport {};\n`);
			log.successRaw(`Created ${absPath}`);
		}

		sourceRelative = filename;
	} else {
		// List existing files in source dir
		const files = globSync('**/*.{ts,tsx,js,jsx}', { cwd: absSourceDir });

		if (files.length === 0) {
			log.errorRaw(`No source files found in ${absSourceDir}`);
			process.exit(1);
		}

		sourceRelative = await select({
			message: 'Select a source file:',
			choices: files.sort().map((f) => ({ name: f, value: f })),
		});
	}

	// Add entry point to config
	config.entryPoints.push({
		source: sourceRelative,
		target: selected.guid,
	});

	saveConfig(resolvedConfigPath, config);

	log.successRaw(`✓ Added entry: "${sourceRelative}" → ${selected.type} "${selected.name}" (${selected.guid})`);
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
