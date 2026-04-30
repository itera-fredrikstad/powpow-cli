import type { Plugin } from 'rolldown';
import type { PluginContext } from './context.js';

export function createRenderChunkHook(): Plugin['renderChunk'] {
	// Runtime-URL prefix stripping is deferred to the build.ts post-pass so that hashes
	// of sibling entries can be appended as `?v=<hash>` cache-busters.
	return () => null;
}

export function createGenerateBundleHook(ctx: PluginContext): Plugin['generateBundle'] {
	const { resourceMap, outputCollector } = ctx;

	return (_options, bundle) => {
		for (const [fileName, chunk] of Object.entries(bundle)) {
			if (chunk.type !== 'chunk' || !chunk.isEntry) continue;

			const guid = fileName;
			const resource = resourceMap.get(guid);
			if (!resource) continue;

			let output = chunk.code;

			switch (resource.type) {
				case 'web-template':
					output = `<script type="module" data-webtemplate-id="${resource.guid}">\n${output}\n</script>\n`;
					break;
				case 'web-file':
				case 'server-logic':
					// Plain ESM output, no wrapping.
					break;
			}

			outputCollector.set(guid, { resource, content: output });

			delete bundle[fileName];
		}
	};
}
