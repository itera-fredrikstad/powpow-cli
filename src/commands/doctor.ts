import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAndValidate } from '../config.js';
import { log } from '../log.js';
import { scanPortalResources } from '../resources.js';
import { isBareSpecifier } from '../utils.js';

interface DoctorOptions {
	configPath?: string;
}

export async function doctor({ configPath }: DoctorOptions): Promise<void> {
	const { config, portalDir, sourceDir } = loadAndValidate(configPath);
	const resources = scanPortalResources(portalDir);

	const missingTargets: { source: string; target: string }[] = [];
	const missingSourceFiles: { source: string; absPath: string }[] = [];
	const mappedGuids = new Set<string>();

	for (const entry of config.entryPoints) {
		if (!resources.has(entry.target)) {
			missingTargets.push({ source: entry.source, target: entry.target });
		} else {
			mappedGuids.add(entry.target);
		}

		if (!isBareSpecifier(entry.source)) {
			const absPath = resolve(sourceDir, entry.source);
			if (!existsSync(absPath)) {
				missingSourceFiles.push({ source: entry.source, absPath });
			}
		}
	}

	const orphans: { guid: string; name: string; type: string }[] = [];
	for (const resource of resources.values()) {
		if (!mappedGuids.has(resource.guid)) {
			orphans.push({ guid: resource.guid, name: resource.name, type: resource.type });
		}
	}

	let issues = 0;

	console.log(`\nPowPow doctor`);
	console.log(`  Config:     ${configPath ?? '(auto-detected)'}`);
	console.log(`  Portal dir: ${portalDir}`);
	console.log(`  Source dir: ${sourceDir}`);
	console.log(`  Entries:    ${config.entryPoints.length}`);
	console.log(`  Resources:  ${resources.size}`);

	if (missingTargets.length > 0) {
		issues += missingTargets.length;
		log.error(`\n${missingTargets.length} entry point(s) reference a GUID not found in the portal:`);
		for (const { source, target } of missingTargets) {
			console.log(`    - "${source}" → ${target}`);
		}
	}

	if (missingSourceFiles.length > 0) {
		issues += missingSourceFiles.length;
		log.error(`\n${missingSourceFiles.length} entry point(s) reference a source file that does not exist:`);
		for (const { source, absPath } of missingSourceFiles) {
			console.log(`    - "${source}" (expected at ${absPath})`);
		}
	}

	if (orphans.length > 0) {
		log.warn(`\n${orphans.length} portal resource(s) are not mapped to any entry point (orphans):`);
		for (const { guid, name, type } of orphans) {
			console.log(`    - [${type}] "${name}" (${guid})`);
		}
	}

	if (issues === 0 && orphans.length === 0) {
		log.success('\nNo issues found.');
	} else if (issues === 0) {
		log.success(`\nNo errors. (${orphans.length} orphan resource(s) — see above.)`);
	} else {
		log.error(`\n${issues} error(s) found.`);
		process.exitCode = 1;
	}
}
