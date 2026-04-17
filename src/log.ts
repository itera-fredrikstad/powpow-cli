const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_RANK: Record<LogLevel, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

let currentLevel: LogLevel = (process.env.POWPOW_LOG_LEVEL as LogLevel) ?? 'info';
if (!(currentLevel in LEVEL_RANK)) currentLevel = 'info';

export function setLogLevel(level: LogLevel): void {
	currentLevel = level;
}

export function getLogLevel(): LogLevel {
	return currentLevel;
}

function enabled(at: LogLevel): boolean {
	return LEVEL_RANK[currentLevel] >= LEVEL_RANK[at];
}

function fmt(color: string, tag: string, message: string): string {
	return `${color}[${tag}] ${message}${RESET}`;
}

export const log = {
	warn(message: string, tag = 'powpow'): void {
		if (enabled('warn')) console.warn(fmt(YELLOW, tag, `⚠ ${message}`));
	},
	success(message: string, tag = 'powpow'): void {
		if (enabled('info')) console.log(fmt(GREEN, tag, `✓ ${message}`));
	},
	info(message: string, tag = 'powpow'): void {
		if (enabled('info')) console.log(fmt(BLUE, tag, message));
	},
	debug(message: string, tag = 'powpow'): void {
		if (enabled('debug')) console.log(fmt(BLUE, tag, message));
	},
	error(message: string, tag = 'powpow'): void {
		if (enabled('error')) console.error(fmt(RED, tag, message));
	},
	errorRaw(message: string): void {
		if (enabled('error')) console.error(`${RED}${message}${RESET}`);
	},
	successRaw(message: string): void {
		if (enabled('info')) console.log(`${GREEN}${message}${RESET}`);
	},
	prefix(tag: string): string {
		return `${BLUE}[${tag}]${RESET} `;
	},
};
