#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLogLevel } from './log.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse --config option
let configPath: string | undefined;
const configIdx = args.indexOf('--config');
if (configIdx !== -1 && args[configIdx + 1]) {
	configPath = args[configIdx + 1];
}

const verbose = args.includes('--verbose');
const silent = args.includes('--silent');
const quiet = args.includes('--quiet');
if (silent) setLogLevel('silent');
else if (quiet) setLogLevel('error');
else if (verbose) setLogLevel('debug');

const usage = `
Usage: powpow <command> [options]

Commands:
  init     Initialize a new powpow.config.json
  add      Add a portal resource as an entry point
  dev      Start dev server + rolldown watch mode
  build    Type-check and build with rolldown
  serve    Start the dev server only
  doctor   Diagnose config/resource/source issues
  remove   Unmap a portal resource from an entry point

Options:
  --config <path>  Path to powpow.config.json (default: ./powpow.config.json)
  --force          Overwrite existing config (init only)
  --skip-typecheck Skip tsc type check (build only)
  --verbose        Show debug output and full error stacks
  --quiet          Only show errors
  --silent         Suppress all output
  -h, --help       Show this help message
  -v, --version    Show version
`;

function readVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	// dist/cli.js → ../package.json
	const pkgPath = resolve(here, '..', 'package.json');
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
	return pkg.version;
}

async function main(): Promise<void> {
	if (!command || command === '--help' || command === '-h') {
		console.log(usage.trim());
		return;
	}

	if (command === '--version' || command === '-v') {
		console.log(readVersion());
		return;
	}

	const controller = new AbortController();
	const signal = controller.signal;
	let shuttingDown = false;
	const onSignal = () => {
		if (shuttingDown) process.exit(1);
		shuttingDown = true;
		controller.abort();
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);

	switch (command) {
		case 'init': {
			const { init } = await import('./commands/init.js');
			await init({ configPath, force: args.includes('--force') });
			break;
		}

		case 'add': {
			const { add } = await import('./commands/add.js');
			await add({ configPath });
			break;
		}

		case 'dev': {
			const { dev } = await import('./commands/dev.js');
			await dev({ configPath, signal });
			break;
		}

		case 'build': {
			const { build } = await import('./commands/build.js');
			await build({ configPath, signal, skipTypecheck: args.includes('--skip-typecheck') });
			break;
		}

		case 'serve': {
			const { serve } = await import('./commands/serve.js');
			await serve({ configPath, signal });
			break;
		}

		case 'doctor': {
			const { doctor } = await import('./commands/doctor.js');
			await doctor({ configPath });
			break;
		}

		case 'remove': {
			const { remove } = await import('./commands/remove.js');
			await remove({ configPath });
			break;
		}

		default:
			console.error(`Unknown command: ${command}`);
			console.log(usage.trim());
			process.exit(1);
	}
}

main().catch((err) => {
	if (verbose) {
		console.error(err);
	} else if (err instanceof Error) {
		console.error(`\x1b[31m${err.message}\x1b[0m`);
		console.error('\x1b[90m(run with --verbose for full stack trace)\x1b[0m');
	} else {
		console.error(err);
	}
	process.exit(1);
});
