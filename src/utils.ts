export function isBareSpecifier(specifier: string): boolean {
	if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
	if (/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/.test(specifier)) return false;
	return true;
}

/** Normalize a path to forward slashes so prefix-matching works identically on Windows. */
export function toPosix(p: string): string {
	return p.replaceAll('\\', '/');
}
