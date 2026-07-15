import { describe, expect, it } from 'bun:test';
import { expandPattern, isRebasableTarget, parsePattern, rebaseTarget, resolveCondition } from '#src/expand';

const PATTERN_MISMATCH = /both sides must contain/;

describe('parsePattern', () => {
	it('returns undefined for two exact strings', () => {
		expect(parsePattern('#config', './src/config.ts')).toBeUndefined();
	});

	it('parses matching star positions', () => {
		expect(parsePattern('#lib/*', './src/lib/*.ts')).toEqual({
			keyPrefix: '#lib/',
			keySuffix: '',
			targetDirectory: './src/lib',
			targetPrefix: './src/lib/',
			targetSuffix: '.ts',
		});
	});

	it('throws when only the key has a star', () => {
		expect(() => parsePattern('#lib/*', './src/lib/index.ts')).toThrow(PATTERN_MISMATCH);
	});

	it('throws when only the target has a star', () => {
		expect(() => parsePattern('#lib', './src/lib/*.ts')).toThrow(PATTERN_MISMATCH);
	});
});

describe('expandPattern', () => {
	it('emits extensionless and full-filename keys for a suffixless key pattern', () => {
		const pattern = parsePattern('#lib/*', './src/lib/*.ts');
		if (pattern === undefined) throw new Error('expected a pattern');
		expect(expandPattern(pattern, ['bytes.ts', 'codecs/hex.ts', 'ignored.js'])).toEqual({
			'#lib/bytes': './src/lib/bytes.ts',
			'#lib/bytes.ts': './src/lib/bytes.ts',
			'#lib/codecs/hex': './src/lib/codecs/hex.ts',
			'#lib/codecs/hex.ts': './src/lib/codecs/hex.ts',
		});
	});

	it('does not append the key suffix twice for a renamed key pattern', () => {
		const pattern = parsePattern('#lib/*.js', './src/lib/*.ts');
		if (pattern === undefined) throw new Error('expected a pattern');
		expect(expandPattern(pattern, ['bytes.ts'])).toEqual({
			'#lib/bytes.js': './src/lib/bytes.ts',
			'#lib/bytes.ts': './src/lib/bytes.ts',
		});
	});

	it('returns no entries when no file matches the target suffix', () => {
		const pattern = parsePattern('#lib/*', './src/lib/*.ts');
		if (pattern === undefined) throw new Error('expected a pattern');
		expect(expandPattern(pattern, ['ignored.js'])).toEqual({});
	});

	it('matches static text around a target wildcard', () => {
		const pattern = parsePattern('#lib/*', './src/prefix-*.ts');
		if (pattern === undefined) throw new Error('expected a pattern');
		expect(expandPattern(pattern, ['prefix-bytes.ts', 'ignored.ts'])).toEqual({
			'#lib/bytes': './src/prefix-bytes.ts',
			'#lib/prefix-bytes.ts': './src/prefix-bytes.ts',
		});
	});

	it('replaces repeated target wildcards with the same capture', () => {
		const pattern = parsePattern('#copy/*', './src/*/copy-*.ts');
		if (pattern === undefined) throw new Error('expected a pattern');
		expect(expandPattern(pattern, ['a/copy-a.ts', 'a/copy-b.ts', 'b/copy-b.ts'])).toEqual({
			'#copy/a': './src/a/copy-a.ts',
			'#copy/a/copy-a.ts': './src/a/copy-a.ts',
			'#copy/b': './src/b/copy-b.ts',
			'#copy/b/copy-b.ts': './src/b/copy-b.ts',
		});
	});
});

describe('resolveCondition', () => {
	it('returns a string value unchanged', () => {
		expect(resolveCondition('./src/config.ts', ['import', 'default'])).toBe('./src/config.ts');
	});

	it('picks the first matching condition in order', () => {
		expect(resolveCondition({ default: './default.ts', import: './import.ts' }, ['import', 'default'])).toBe(
			'./import.ts',
		);
	});

	it('recurses into a nested condition object', () => {
		expect(
			resolveCondition({ import: { types: './x.d.ts', default: './import.ts' } }, ['import', 'default']),
		).toBe('./import.ts');
	});

	it('returns undefined when no condition matches', () => {
		expect(resolveCondition({ require: './require.ts' }, ['import', 'default'])).toBeUndefined();
	});

	it('returns undefined for non-string, non-object values', () => {
		expect(resolveCondition(42, ['import', 'default'])).toBeUndefined();
		expect(resolveCondition(null, ['import', 'default'])).toBeUndefined();
		expect(resolveCondition(['a'], ['import', 'default'])).toBeUndefined();
	});
});

describe('isRebasableTarget', () => {
	it('accepts relative targets', () => {
		expect(isRebasableTarget('./src/config.ts')).toBe(true);
		expect(isRebasableTarget('../shared/config.ts')).toBe(true);
	});

	it('rejects bare specifiers and protocol URLs', () => {
		expect(isRebasableTarget('bun:test')).toBe(false);
		expect(isRebasableTarget('jsr:@deno/doc@0.199.0')).toBe(false);
		expect(isRebasableTarget('https://example.com/virtual.ts')).toBe(false);
	});
});

describe('rebaseTarget', () => {
	it('is a no-op when relativeTo equals root', () => {
		expect(rebaseTarget('/repo', '/repo', './src/lib/bytes.ts')).toBe('./src/lib/bytes.ts');
	});

	it('rebases against a nested output directory', () => {
		expect(rebaseTarget('/repo', '/repo/.cache/maps', './src/lib/bytes.ts')).toBe('../../src/lib/bytes.ts');
	});

	it('passes through non-rebasable targets unchanged', () => {
		expect(rebaseTarget('/repo', '/repo/.cache/maps', 'jsr:@deno/doc@0.199.0')).toBe('jsr:@deno/doc@0.199.0');
	});
});
