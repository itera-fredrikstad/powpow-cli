interface Portal {
	User: {
		userName: string;
		firstName: string;
		lastName: string;
		email: string;
		contactId: string;
		userRoles: string[];
	};
	version: string;
	type: string;
	id: string;
	geo: string;
	tenant: string;
	correlationId: string;
	orgEnvironmentId: string;
	orgId: string;
	portalProductionOrTrialType: 'Production' | 'Trial';
	isTelemetryEnabled: string;
	InstrumentationSettings: {
		instrumentationKey: string;
		collectorEndpoint: string;
	};
	timerProfileForBatching: 'NEAR_REAL_TIME' | 'REAL_TIME' | 'NORMAL' | 'BEST_EFFORT';
	activeLanguages: string[];
	isClientApiEnabled: string;
	dynamics365PortalAnalytics: string;
}

interface Window {
	Microsoft: {
		Dynamic365: {
			Portal: Portal;
		};
	};
}

declare module 'Microsoft' {
	const Portal: Portal;
	export default Portal;
	export const User: Portal['User'];
	export const version: Portal['version'];
	export const type: Portal['type'];
	export const id: Portal['id'];
	export const geo: Portal['geo'];
	export const tenant: Portal['tenant'];
	export const correlationId: Portal['correlationId'];
	export const orgEnvironmentId: Portal['orgEnvironmentId'];
	export const orgId: Portal['orgId'];
	export const portalProductionOrTrialType: Portal['portalProductionOrTrialType'];
	export const isTelemetryEnabled: Portal['isTelemetryEnabled'];
	export const InstrumentationSettings: Portal['InstrumentationSettings'];
	export const timerProfileForBatching: Portal['timerProfileForBatching'];
	export const activeLanguages: Portal['activeLanguages'];
	export const isClientApiEnabled: Portal['isClientApiEnabled'];
	export const dynamics365PortalAnalytics: Portal['dynamics365PortalAnalytics'];
}
