import { describe, expect, it } from 'vitest';
import { isBareSpecifier, toPosix } from '../src/utils.js';

describe('isBareSpecifier', () => {
	it('accepts plain package names', () => {
		expect(isBareSpecifier('lodash')).toBe(true);
		expect(isBareSpecifier('@scope/pkg')).toBe(true);
		expect(isBareSpecifier('react-dom')).toBe(true);
	});

	it('accepts deep subpaths that do not look like files', () => {
		expect(isBareSpecifier('react/jsx-runtime')).toBe(true);
		expect(isBareSpecifier('lodash/fp')).toBe(true);
	});

	it('rejects relative and absolute paths', () => {
		expect(isBareSpecifier('./foo')).toBe(false);
		expect(isBareSpecifier('../foo')).toBe(false);
		expect(isBareSpecifier('/abs/path')).toBe(false);
	});

	it('rejects anything that ends in a recognised source-file extension', () => {
		for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs']) {
			expect(isBareSpecifier(`foo.${ext}`)).toBe(false);
			expect(isBareSpecifier(`./foo.${ext}`)).toBe(false);
		}
	});
});

describe('toPosix', () => {
	it('replaces backslashes with forward slashes', () => {
		expect(toPosix('C:\\Users\\foo\\bar')).toBe('C:/Users/foo/bar');
	});

	it('leaves forward-slash paths unchanged', () => {
		expect(toPosix('/home/foo/bar')).toBe('/home/foo/bar');
	});

	it('handles mixed separators', () => {
		expect(toPosix('C:\\Users/foo\\bar')).toBe('C:/Users/foo/bar');
	});
});
