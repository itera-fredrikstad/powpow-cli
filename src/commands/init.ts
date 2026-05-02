import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { log } from '../log.js';
import type { PackageManager } from '../pm.js';
import { addDevCmd, detectPackageManager, initCmd, runPm } from '../pm.js';

interface InitOptions {
	configPath?: string;
	/** Accepted for CLI compatibility; currently unused (init is idempotent). */
	force?: boolean;
}

export async function init({ configPath }: InitOptions): Promise<void> {
	const projectRoot = process.cwd();

	// ── Step 1: Detect / prompt for package manager ───────────────────────────
	const detected = detectPackageManager(projectRoot);
	let pm: PackageManager;

	if (detected !== null) {
		pm = detected;
		log.info(`Detected package manager: ${pm}`);
	} else {
		pm = await select<PackageManager>({
			message: 'Which package manager do you use?',
			choices: [
				{ name: 'pnpm', value: 'pnpm' },
				{ name: 'npm', value: 'npm' },
			],
			default: 'pnpm',
		});
	}

	// ── Step 2: Prompt for portal config path ─────────────────────────────────
	const targetConfigPath = configPath ?? resolve(projectRoot, 'powpow.config.json');
	let existingPortalPath: string | undefined;
	if (existsSync(targetConfigPath)) {
		try {
			const existing = JSON.parse(readFileSync(targetConfigPath, 'utf8'));
			existingPortalPath = existing.portalConfigPath as string | undefined;
		} catch {
			// ignore parse errors; we'll overwrite below if it doesn't exist yet
		}
	}

	const portalConfigPath = await input({
		message: 'Relative path to Power Pages portal config root:',
		default: existingPortalPath,
		validate(value) {
			if (!value.trim()) return 'Path is required';
			return true;
		},
	});

	const sourceDir = 'src';

	// ── Step 3: Run `<pm> init -y` if package.json is missing ─────────────────
	const pkgJsonPath = resolve(projectRoot, 'package.json');
	if (!existsSync(pkgJsonPath)) {
		log.info('No package.json found. Initialising…');
		try {
			await runPm(pm, initCmd(pm), projectRoot);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`Failed to run "${pm} init": ${msg}`);
			process.exit(1);
		}

		// `<pm> init` defaults the name to the directory basename, which may contain
		// characters npm rejects (uppercase, spaces, etc.). Sanitize it.
		const initialPkg = readPkgJson(pkgJsonPath);
		const sanitized = sanitizePackageName(initialPkg.name);
		if (sanitized !== initialPkg.name) {
			initialPkg.name = sanitized;
			writeFileSync(pkgJsonPath, `${JSON.stringify(initialPkg, null, 2)}\n`);
			log.info(`Renamed package to "${sanitized}" (sanitized from directory name)`);
		}
	}

	// ── Step 4: Install missing dev deps ──────────────────────────────────────
	const pkgJson = readPkgJson(pkgJsonPath);
	const installedDeps = {
		...pkgJson.dependencies,
		...pkgJson.devDependencies,
	};
	const missing = ['powpow-cli', 'typescript'].filter((dep) => !(dep in installedDeps));

	if (missing.length > 0) {
		log.info(`Installing dev dependencies: ${missing.join(', ')}`);
		try {
			await runPm(pm, [...addDevCmd(pm), ...missing], projectRoot);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.error(`Failed to install dev dependencies: ${msg}`);
			process.exit(1);
		}
	} else {
		log.info('powpow-cli and typescript are already installed.');
	}

	// ── Step 5: Add scripts to package.json if missing ────────────────────────
	const scripts: Record<string, string> = {
		'powpow:dev': 'powpow dev',
		'powpow:build': 'powpow build',
	};
	const currentPkg = readPkgJson(pkgJsonPath);
	currentPkg.scripts = currentPkg.scripts ?? {};
	let scriptsAdded = 0;
	for (const [name, cmd] of Object.entries(scripts)) {
		if (!(name in currentPkg.scripts)) {
			currentPkg.scripts[name] = cmd;
			scriptsAdded++;
		}
	}
	if (scriptsAdded > 0) {
		writeFileSync(pkgJsonPath, JSON.stringify(currentPkg, null, '\t') + '\n');
		log.success(`Added ${scriptsAdded} script(s) to package.json`);
	}

	// ── Step 6: Scaffold source directories ───────────────────────────────────
	const dirs = [`${sourceDir}/web-templates`, `${sourceDir}/web-files`, `${sourceDir}/server-logic`];
	for (const dir of dirs) {
		const absDir = resolve(projectRoot, dir);
		if (!existsSync(absDir)) {
			mkdirSync(absDir, { recursive: true });
			writeFileSync(resolve(absDir, '.gitkeep'), '');
			log.success(`Created ${dir}/`);
		}
	}

	// ── Step 7: Write root tsconfig.json (project references solution root) ──
	const rootTsconfig = resolve(projectRoot, 'tsconfig.json');
	if (!existsSync(rootTsconfig)) {
		const content = {
			files: [],
			references: [{ path: './tsconfig.web.json' }, { path: './tsconfig.server-logic.json' }],
		};
		writeFileSync(rootTsconfig, JSON.stringify(content, null, '\t') + '\n');
		log.success('Created tsconfig.json');
	}

	// ── Step 8: Write web tsconfig (extends powpow-cli base) ─────────────────
	const webTsconfig = resolve(projectRoot, 'tsconfig.web.json');
	if (!existsSync(webTsconfig)) {
		const content = {
			extends: 'powpow-cli/presets/tsconfig.web.base.json',
			include: [`${sourceDir}/web-templates/**/*`, `${sourceDir}/web-files/**/*`],
		};
		writeFileSync(webTsconfig, JSON.stringify(content, null, '\t') + '\n');
		log.success('Created tsconfig.web.json');
	}

	// ── Step 9: Write server-logic tsconfig (extends powpow-cli base) ────────
	const serverTsconfig = resolve(projectRoot, 'tsconfig.server-logic.json');
	if (!existsSync(serverTsconfig)) {
		const content = {
			extends: 'powpow-cli/presets/tsconfig.server-logic.base.json',
			include: [`${sourceDir}/server-logic/**/*`],
		};
		writeFileSync(serverTsconfig, JSON.stringify(content, null, '\t') + '\n');
		log.success('Created tsconfig.server-logic.json');
	}

	// ── Step 10: Write powpow.config.json if missing ────────────────────────
	if (!existsSync(targetConfigPath)) {
		const config = {
			$schema: './node_modules/powpow-cli/presets/powpow.config.schema.json',
			portalConfigPath: portalConfigPath.trim(),
			sourceDir,
			entryPoints: [],
		};
		writeFileSync(targetConfigPath, JSON.stringify(config, null, '\t') + '\n');
		log.success('Created powpow.config.json');
	}

	// ── Success ───────────────────────────────────────────────────────────────
	console.log('');
	log.successRaw('✓ powpow project initialised!');
	log.info('Next step: run "powpow add" to wire up your first entry point.');
}

function readPkgJson(path: string): Record<string, unknown> & {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
} {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}

/**
 * Sanitize a string into a valid npm package name per npm's package-name rules:
 * lowercase, no spaces, only [a-z0-9-_.], no leading dot/underscore, ≤214 chars.
 * Falls back to "powpow-project" if the input has no usable characters.
 */
function sanitizePackageName(raw: unknown): string {
	const input = typeof raw === 'string' ? raw : '';
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[._-]+/, '')
		.replace(/[._-]+$/, '')
		.slice(0, 214);
	return cleaned || 'powpow-project';
}
