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

declare global {
	interface Window {
		Microsoft: {
			Dynamic365: {
				Portal: Portal;
			};
		};
	}
}
