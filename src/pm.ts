import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { log } from './log.js';

export type PackageManager = 'npm' | 'pnpm';

/**
 * Detect the package manager in use by checking for lockfiles.
 * Returns `null` if both or neither are present.
 */
export function detectPackageManager(projectRoot: string): PackageManager | null {
	const hasPnpm = existsSync(resolve(projectRoot, 'pnpm-lock.yaml'));
	const hasNpm = existsSync(resolve(projectRoot, 'package-lock.json'));

	if (hasPnpm && !hasNpm) return 'pnpm';
	if (hasNpm && !hasPnpm) return 'npm';
	return null; // both or neither → prompt
}

/**
 * Run a package manager command, streaming output through a prefixed logger.
 * Rejects on non-zero exit code.
 */
export function runPm(pm: PackageManager, args: string[], cwd: string): Promise<void> {
	return new Promise((done, fail) => {
		const prefix = log.prefix(pm);

		const child = spawn(pm, args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, FORCE_COLOR: '1' },
			// On Windows, shell is required to resolve the pm binary
			shell: process.platform === 'win32',
		});

		child.stdout?.on('data', (data: Buffer) => {
			for (const line of data.toString().split('\n')) {
				if (line) process.stdout.write(`${prefix}${line}\n`);
			}
		});

		child.stderr?.on('data', (data: Buffer) => {
			for (const line of data.toString().split('\n')) {
				if (line) process.stderr.write(`${prefix}${line}\n`);
			}
		});

		child.on('exit', (code, sig) => {
			if (code === 0) done();
			else if (sig) fail(new Error(`${pm} was terminated by signal ${sig}`));
			else fail(new Error(`${pm} exited with code ${code}`));
		});
	});
}

/**
 * Returns the argv for installing a dev-dependency with the given pm.
 * Usage: `runPm(pm, [...addDevCmd(pm), 'typescript'], cwd)`
 */
export function addDevCmd(pm: PackageManager): string[] {
	return pm === 'pnpm' ? ['add', '-D'] : ['install', '--save-dev'];
}

/**
 * Returns the argv for initialising a new package.json with the given pm.
 */
export function initCmd(pm: PackageManager): string[] {
	return pm === 'pnpm' ? ['init'] : ['init', '-y'];
}
