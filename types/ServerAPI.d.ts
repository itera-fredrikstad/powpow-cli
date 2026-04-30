/** Dataverse and HttpClient connector response */
interface ConnectorResponse {
	StatusCode: number;
	Body: string;
	IsSuccessStatusCode: boolean;
	ReasonPhrase: string;
	ServerError: boolean;
	ServerErrorMessage: string | null;
	Headers: Record<string, string>;
}

/** Power Pages Server-side scripting global Server object. */
interface Server {
	/** Provides logging functionality for Power Pages server-side scripts. */
	Logger: {
		/** Logs a message. */
		Log(message: string): void;

		/** Logs a warning message. */
		Warn(message: string): void;

		/** Logs an error message. */
		Error(message: string): void;
	};

	/** Provides connector functionality for external services. */
	Connector: {
		/** HTTP client for making external API calls. */
		HttpClient: {
			/** Performs an HTTP GET request asynchronously. */
			GetAsync(url: string, headers?: Record<string, string>): Promise<ConnectorResponse>;

			/** Performs an HTTP POST request asynchronously. */
			PostAsync(
				url: string,
				jsonBody: string,
				headers?: Record<string, string>,
				contentType?: string,
			): Promise<ConnectorResponse>;

			/** Performs an HTTP PATCH request asynchronously. */
			PatchAsync(
				url: string,
				jsonBody: string,
				headers?: Record<string, string>,
				contentType?: string,
			): Promise<ConnectorResponse>;

			/** Performs an HTTP PUT request asynchronously. */
			PutAsync(
				url: string,
				jsonBody: string,
				headers?: Record<string, string>,
				contentType?: string,
			): Promise<ConnectorResponse>;

			/** Performs an HTTP DELETE request asynchronously. */
			DeleteAsync(url: string, headers?: Record<string, string>): Promise<ConnectorResponse>;
		};

		/** Dataverse client for interacting with Dataverse. Returns stringified ConnectorResponse. */
		Dataverse: {
			/** Creates a new record in Dataverse. */
			CreateRecord(entitySetName: string, payload: string): string;

			/** Retrieves a single record from Dataverse. */
			RetrieveRecord(entitySetName: string, id: string, options?: string, skipCache?: boolean): string;

			/** Retrieves multiple records from Dataverse. */
			RetrieveMultipleRecords(entitySetName: string, options?: string, skipCache?: boolean): string;

			/** Updates an existing record in Dataverse. */
			UpdateRecord(entitySetName: string, id: string, payload: string): string;

			/** Deletes a record from Dataverse. */
			DeleteRecord(entitySetName: string, id: string): string;

			/** Invokes a custom API endpoint. */
			InvokeCustomApi(httpMethod: string, url: string, payload: string): string;
		};
	};

	/** Provides request context information for the current server execution. */
	Context: {
		/** Unique activity identifier for the current execution */
		ActivityId: string;

		/** Request body content */
		Body: string;

		/** Invoked function name */
		FunctionName: string;

		/** HTTP request headers */
		Headers: Record<string, string>;

		/** HTTP method for the request */
		HttpMethod: string;

		/** Query string parameters */
		QueryParameters: Record<string, string>;

		/** The server logic name being executed */
		ServerLogicName: string;

		/** Request URL */
		Url: string;
	};

	/** Provides access to site settings. */
	SiteSetting: {
		/** Gets a site setting value by name. */
		Get(name: string): string;
	};

	/** Provides metadata of the current Power Pages website. */
	Website: Record<string, unknown>;

	/** Provides information about the current user (contact). Returns null if anonymous. */
	User:
		| (Record<string, unknown> & {
				/** User web roles */
				Roles: string[];
				/** Authentication token */
				Token: string;
		  })
		| null;

	/** Provides access to environment variables. */
	EnvironmentVariable: {
		/** Gets an environment variable value by schema name. */
		get(schemaName: string): string;
	};
}

declare global {
	interface Window {
		Server: Server;
	}
}
