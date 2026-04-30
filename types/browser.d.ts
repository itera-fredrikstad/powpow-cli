/// <reference path="./Portal.d.ts" />
/// <reference path="./Shell.d.ts" />

// Minimal ambient module stubs so that browser-targeted entries authored in a
// project that has NOT installed @types/react / @types/react-dom / @types/jquery
// / @types/bootstrap can still resolve `import` statements from their editor.
//
// All exports are typed as `any` so that when a user does install the proper
// `@types/*` package, TypeScript's declaration-merging will prefer the more
// specific types from those packages over these stubs.

declare module 'react' {
	const x: any;
	export = x;
}

declare module 'react/jsx-runtime' {
	const x: any;
	export = x;
}

declare module 'react/jsx-dev-runtime' {
	const x: any;
	export = x;
}

declare module 'react-dom' {
	const x: any;
	export = x;
}

declare module 'react-dom/client' {
	const x: any;
	export = x;
}

declare module 'jquery' {
	const x: any;
	export = x;
}

declare module 'bootstrap' {
	const x: any;
	export = x;
}

declare module 'shell' {
	const shell: any;
	export default shell;
	export const ajaxSafePost: any;
	export const getTokenDeferred: any;
	export const refreshToken: any;
}

declare module 'Microsoft' {
	const Portal: any;
	export default Portal;
	export const User: any;
	export const version: any;
	export const type: any;
	export const id: any;
	export const geo: any;
	export const tenant: any;
	export const correlationId: any;
	export const orgEnvironmentId: any;
	export const orgId: any;
	export const portalProductionOrTrialType: any;
	export const isTelemetryEnabled: any;
	export const InstrumentationSettings: any;
	export const timerProfileForBatching: any;
	export const activeLanguages: any;
	export const isClientApiEnabled: any;
	export const dynamics365PortalAnalytics: any;
}
