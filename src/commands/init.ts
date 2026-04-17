import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { saveConfig } from '../config.js';
import { log } from '../log.js';
import type { PowpowConfig } from '../types.js';

interface InitOptions {
	configPath?: string;
	force?: boolean;
}

export async function init({ configPath, force }: InitOptions): Promise<void> {
	const targetPath = configPath ? resolve(configPath) : resolve(process.cwd(), 'powpow.config.json');

	if (existsSync(targetPath) && !force) {
		log.errorRaw(`Config file already exists: ${targetPath}`);
		console.error('Use --force to overwrite.');
		process.exit(1);
	}

	const portalConfigPath = await input({
		message: 'Relative path to Power Pages portal config root:',
		validate(value) {
			if (!value.trim()) return 'Path is required';
			const abs = resolve(process.cwd(), value.trim());
			if (!existsSync(abs)) return `Directory not found: ${abs}`;
			return true;
		},
	});

	const sourceDir = await input({
		message: 'Relative path to TypeScript source directory:',
		default: 'src',
	});

	const absSourceDir = resolve(process.cwd(), sourceDir);
	if (!existsSync(absSourceDir)) {
		const create = await confirm({
			message: `Source directory "${sourceDir}" does not exist. Create it?`,
			default: true,
		});
		if (create) {
			mkdirSync(absSourceDir, { recursive: true });
			console.log(`Created ${absSourceDir}`);
		}
	}

	const config: PowpowConfig = {
		$schema: './node_modules/powpow/powpow.config.schema.json',
		version: '1.0',
		portalConfigPath: portalConfigPath.trim(),
		sourceDir: sourceDir.trim() || 'src',
		entryPoints: [],
	};

	saveConfig(targetPath, config);
	log.successRaw(`✓ Created ${targetPath}`);
}
