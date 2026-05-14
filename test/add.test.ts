import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from '../src/commands/add.js';

describe('sanitizeFilename', () => {
	it('preserves case', () => {
		expect(sanitizeFilename('MyWebTemplate')).toBe('MyWebTemplate');
	});

	it('replaces non-alphanumeric runs with a single hyphen', () => {
		expect(sanitizeFilename('My Web Template')).toBe('My-Web-Template');
		expect(sanitizeFilename('foo!!bar')).toBe('foo-bar');
	});

	it('trims leading and trailing hyphens', () => {
		expect(sanitizeFilename('  Hello, World!')).toBe('Hello-World');
	});

	it('keeps digits', () => {
		expect(sanitizeFilename('Widget2 v3')).toBe('Widget2-v3');
	});
});
