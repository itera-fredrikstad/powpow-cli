import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { input, select } from '@inquirer/prompts';
import { log } from '../log.js';
import { addDevCmd, detectPackageManager, initCmd, runPm } from '../pm.js';
import type { PackageManager } from '../pm.js';

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
	const dirs = [
		`${sourceDir}/web-templates`,
		`${sourceDir}/web-files`,
		`${sourceDir}/server-logic`,
	];
	for (const dir of dirs) {
		const absDir = resolve(projectRoot, dir);
		if (!existsSync(absDir)) {
			mkdirSync(absDir, { recursive: true });
			writeFileSync(resolve(absDir, '.gitkeep'), '');
			log.success(`Created ${dir}/`);
		}
	}

	// ── Step 7: Write root tsconfig.json (browser entries) ───────────────────
	const rootTsconfig = resolve(projectRoot, 'tsconfig.json');
	if (!existsSync(rootTsconfig)) {
		const content = {
			compilerOptions: {
				target: 'ES2023',
				lib: ['ES2023', 'DOM', 'DOM.Iterable'],
				module: 'ESNext',
				moduleResolution: 'bundler',
				jsx: 'react-jsx',
				types: ['powpow-cli/types/browser'],
				allowImportingTsExtensions: true,
				verbatimModuleSyntax: true,
				moduleDetection: 'force',
				useDefineForClassFields: true,
				noEmit: true,
				skipLibCheck: true,
				strict: true,
				noUnusedLocals: true,
				noUnusedParameters: true,
				erasableSyntaxOnly: true,
				noFallthroughCasesInSwitch: true,
				noUncheckedSideEffectImports: true,
			},
			include: [`${sourceDir}/**/*`],
			exclude: [`${sourceDir}/server-logic/**/*`],
		};
		writeFileSync(rootTsconfig, JSON.stringify(content, null, '\t') + '\n');
		log.success('Created tsconfig.json');
	}

	// ── Step 8: Write server-logic tsconfig at project root ──────────────────
	const serverTsconfig = resolve(projectRoot, 'tsconfig.server-logic.json');
	if (!existsSync(serverTsconfig)) {
		const content = {
			compilerOptions: {
				target: 'ES2023',
				lib: ['ES2023'],
				module: 'ESNext',
				moduleResolution: 'bundler',
				types: ['powpow-cli/types/server'],
				allowImportingTsExtensions: true,
				verbatimModuleSyntax: true,
				moduleDetection: 'force',
				useDefineForClassFields: true,
				noEmit: true,
				skipLibCheck: true,
				strict: true,
				noUnusedLocals: true,
				noUnusedParameters: true,
				erasableSyntaxOnly: true,
				noFallthroughCasesInSwitch: true,
				noUncheckedSideEffectImports: true,
			},
			include: [`${sourceDir}/server-logic/**/*`],
			exclude: [`${sourceDir}/web-templates/**/*`, `${sourceDir}/web-files/**/*`],
		};
		writeFileSync(serverTsconfig, JSON.stringify(content, null, '\t') + '\n');
		log.success('Created tsconfig.server-logic.json');
	}

	// ── Step 9: Write powpow.config.json if missing ─────────────────────────
	if (!existsSync(targetConfigPath)) {
		const config = {
			$schema: './node_modules/powpow-cli/powpow.config.schema.json',
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

function readPkgJson(path: string): Record<string, unknown> & { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}
