import type { Plugin } from 'rolldown';
import { type PluginContext, UMD_VIRTUAL_PREFIX } from './context.js';

export function createLoadHook(ctx: PluginContext): Plugin['load'] {
	const { globalsMap } = ctx;

	return (id) => {
		if (id.startsWith(UMD_VIRTUAL_PREFIX)) {
			const specifier = id.slice(UMD_VIRTUAL_PREFIX.length);
			const globalName = globalsMap[specifier];
			if (!globalName) return null;

			// JSX runtime special case: export named jsx, jsxs, Fragment
			if (specifier.endsWith('/jsx-runtime')) {
				return [
					`var __g = globalThis[${JSON.stringify(globalName)}];`,
					`export var jsx = __g.createElement;`,
					`export var jsxs = __g.createElement;`,
					`export var Fragment = __g.Fragment;`,
				].join('\n');
			}

			return `export default globalThis[${JSON.stringify(globalName)}];\n`;
		}

		return null;
	};
}
