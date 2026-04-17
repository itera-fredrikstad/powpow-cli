import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { loadAndValidate, saveConfig } from '../config.js';
import { log } from '../log.js';
import { isBareSpecifier } from '../utils.js';

interface RemoveOptions {
	configPath?: string;
}

export async function remove({ configPath }: RemoveOptions): Promise<void> {
	const { configPath: resolvedConfigPath, config, sourceDir } = loadAndValidate(configPath);

	if (config.entryPoints.length === 0) {
		console.log('No entry points to remove.');
		return;
	}

	const choice = await select({
		message: 'Select an entry point to remove:',
		choices: config.entryPoints.map((entry) => ({
			name: `${entry.source} → ${entry.target}`,
			value: entry,
			description: entry.target,
		})),
	});

	const confirmRemove = await confirm({
		message: `Remove entry "${choice.source}" → ${choice.target}?`,
		default: false,
	});

	if (!confirmRemove) {
		console.log('Cancelled.');
		return;
	}

	config.entryPoints = config.entryPoints.filter((e) => !(e.source === choice.source && e.target === choice.target));
	saveConfig(resolvedConfigPath, config);
	log.success(`Removed entry "${choice.source}" → ${choice.target}`);

	if (!isBareSpecifier(choice.source)) {
		const absSource = resolve(sourceDir, choice.source);
		if (existsSync(absSource)) {
			const alsoDelete = await confirm({
				message: `Also delete the source file at ${absSource}?`,
				default: false,
			});
			if (alsoDelete) {
				unlinkSync(absSource);
				log.success(`Deleted ${absSource}`);
			}
		}
	}
}
