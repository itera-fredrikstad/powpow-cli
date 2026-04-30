interface Shell {
	/**
	 * Performs an AJAX request that includes the anti-forgery token.
	 * Fetches the token first (via getTokenDeferred) and then either:
	 *   - submits `form` via jquery.form's `ajaxSubmit` (when `form` is provided), or
	 *   - sends `settings` via `$.ajax`, attaching the token as form data
	 *     (multipart/form-data) or as an `__RequestVerificationToken` header.
	 *
	 * @param settings - jQuery AJAX settings for the request.
	 * @param form - Optional jQuery form element submitted via the jquery.form plugin.
	 * @returns A jQuery promise resolving with the AJAX response, or rejecting on failure.
	 */
	ajaxSafePost: (settings: JQuery.AjaxSettings, form?: JQuery) => JQuery.Promise<any>;

	/**
	 * Resolves with the current anti-forgery token.
	 * If `#antiforgerytoken input[name="__RequestVerificationToken"]` already has
	 * a value, resolves immediately with it. Otherwise fetches the token markup
	 * from `#antiforgerytoken[data-url]` (with up to 3 retries), injects it into
	 * the DOM, and resolves with the new value. Concurrent callers are coalesced
	 * into a single network request.
	 *
	 * @returns A jQuery promise resolving with the token string, or rejecting (no value) on failure.
	 */
	getTokenDeferred: () => JQuery.Promise<string>;

	/**
	 * Fetches fresh anti-forgery token markup from `#antiforgerytoken[data-url]`
	 * (with up to 3 retries) and replaces every existing
	 * `input[name="__RequestVerificationToken"]` on the page with it.
	 * Failures are logged via `ClientLogWrapper` but not surfaced to callers.
	 */
	refreshToken: () => void;
}

declare global {
	interface Window {
		shell: Shell;
	}
}
