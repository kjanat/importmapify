import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { createImportMap, defineConfig, formatImportMap } from '#src/map.ts';

const roots: string[] = [];
const PATTERN_MISMATCH = /both sides must contain/;

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(imports: Readonly<Record<string, unknown>>, files: readonly string[] = []): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-'));
	roots.push(root);
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ imports }));
	for (const file of files) {
		const target = path.join(root, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, '');
	}
	return root;
}

describe('createImportMap', () => {
	it('accepts a file:// URL root', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		expect(createImportMap({ root: Bun.pathToFileURL(root) })).toEqual(createImportMap({ root }));
	});

	it('expands matching files to their wildcard specifier', () => {
		const root = fixture({ '#lib/*': './src/lib/*.ts' }, [
			'src/lib/bytes.ts',
			'src/lib/codecs/hex.ts',
			'src/lib/ignored.js',
		]);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes': './src/lib/bytes.ts',
				'#lib/codecs/hex': './src/lib/codecs/hex.ts',
			},
		});
	});

	it('does not produce a double-suffixed key for a renamed key pattern', () => {
		const root = fixture({ '#lib/*.js': './src/lib/*.ts' }, ['src/lib/bytes.ts']);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes.js': './src/lib/bytes.ts',
			},
		});
	});

	it('expands a pattern with a static filename prefix', () => {
		const root = fixture({ '#lib/*': './src/prefix-*.ts' }, ['src/prefix-bytes.ts', 'src/ignored.ts']);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes': './src/prefix-bytes.ts',
			},
		});
	});

	it('maps a suffixless target to its full filename and excludes it only via extensions', () => {
		const files = ['src/writer.ts', 'src/parse/AGENTS.md'];
		const root = fixture({ '#internals/*': './src/*' }, files);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#internals/parse/AGENTS.md': './src/parse/AGENTS.md',
				'#internals/writer.ts': './src/writer.ts',
			},
		});
		expect(createImportMap({ root, extensions: ['ts'] })).toEqual({
			imports: { '#internals/writer.ts': './src/writer.ts' },
		});
	});

	it('restricts pattern matches to the given extensions with or without a leading dot', () => {
		const root = fixture({ '#lib/*': './src/lib/*' }, [
			'src/lib/bytes.ts',
			'src/lib/data.json',
			'src/lib/notes.md',
		]);
		expect(createImportMap({ root, extensions: ['.ts', 'json'] })).toEqual({
			imports: {
				'#lib/bytes.ts': './src/lib/bytes.ts',
				'#lib/data.json': './src/lib/data.json',
			},
		});
	});

	it('drops targets rejected by a filter RegExp', () => {
		const root = fixture({ '#dist/*': './dist/*.js' }, ['dist/auto.js', 'dist/internal-qo9O8jzH.js']);
		expect(createImportMap({ root, filter: [/^(?!.*internal)/] })).toEqual({
			imports: { '#dist/auto': './dist/auto.js' },
		});
	});

	it('keeps only targets a filter predicate accepts', () => {
		const root = fixture({ '#dist/*': './dist/*.js' }, ['dist/auto.js', 'dist/raw.js']);
		expect(createImportMap({ root, filter: [(target) => target.endsWith('auto.js')] })).toEqual({
			imports: { '#dist/auto': './dist/auto.js' },
		});
	});

	it('requires the extension whitelist and every filter to pass', () => {
		const root = fixture({ '#dist/*': './dist/*' }, ['dist/keep.js', 'dist/keep.ts', 'dist/skip.js']);
		expect(createImportMap({ root, extensions: ['js'], filter: [/keep/] })).toEqual({
			imports: { '#dist/keep.js': './dist/keep.js' },
		});
	});

	it('resolves a conditional target using the default condition order', () => {
		const root = fixture(
			{ '#config': { types: './config.d.ts', import: './config.ts', default: './config.js' } },
			['config.ts'],
		);
		expect(createImportMap({ root })).toEqual({ imports: { '#config': './config.ts' } });
	});

	it('resolves a conditional target using a custom condition order', () => {
		const root = fixture({ '#config': { deno: './config.deno.ts', default: './config.ts' } });
		expect(createImportMap({ root, conditions: ['deno', 'import', 'default'] })).toEqual({
			imports: { '#config': './config.deno.ts' },
		});
	});

	it('skips an entry whose conditional target matches no condition', () => {
		const root = fixture({ '#config': { require: './config.cjs' }, '#kept': './kept.ts' });
		expect(createImportMap({ root })).toEqual({ imports: { '#kept': './kept.ts' } });
	});

	it('throws when only one side of a mapping contains a star', () => {
		const root = fixture({ '#lib/*': './src/lib/index.ts' });
		expect(() => createImportMap({ root })).toThrow(PATTERN_MISMATCH);
	});

	it('resolves same-key collisions by pattern specificity, independent of declaration order', () => {
		const files = ['src/foo/bar.ts', 'lib/bar.ts'];
		const broadFirst = fixture({ '#*': './src/*.ts', '#foo/*': './lib/*.ts' }, files);
		const specificFirst = fixture({ '#foo/*': './lib/*.ts', '#*': './src/*.ts' }, files);
		expect(createImportMap({ root: broadFirst }).imports['#foo/bar']).toBe('./lib/bar.ts');
		expect(createImportMap({ root: specificFirst }).imports['#foo/bar']).toBe('./lib/bar.ts');
	});

	it('prefers an exact key over a pattern matching the same specifier, independent of order', () => {
		const files = ['lib/bar.ts', 'exact.ts'];
		const exactFirst = fixture({ '#foo/bar': './exact.ts', '#foo/*': './lib/*.ts' }, files);
		const patternFirst = fixture({ '#foo/*': './lib/*.ts', '#foo/bar': './exact.ts' }, files);
		expect(createImportMap({ root: exactFirst }).imports['#foo/bar']).toBe('./exact.ts');
		expect(createImportMap({ root: patternFirst }).imports['#foo/bar']).toBe('./exact.ts');
	});

	it('combines exact and pattern entries', () => {
		const root = fixture({ '#config': './src/config.ts', '#lib/*': './src/lib/*.ts' }, [
			'src/config.ts',
			'src/lib/value.ts',
		]);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#config': './src/config.ts',
				'#lib/value': './src/lib/value.ts',
			},
		});
	});

	it('expands packages into conformant pairs, overridden by additional imports', () => {
		const root = fixture({});
		expect(
			createImportMap({
				root,
				packages: { '@std/async': 'jsr:@std/async@^1.0.0', ansispeck: 'npm:ansispeck@0.2' },
				additionalImports: { ansispeck: 'npm:ansispeck@0.1' },
			}),
		).toEqual({
			imports: {
				'@std/async': 'jsr:@std/async@^1.0.0',
				'@std/async/': 'jsr:/@std/async@^1.0.0/',
				ansispeck: 'npm:ansispeck@0.1',
				'ansispeck/': 'npm:/ansispeck@0.2/',
			},
		});
	});

	it('merges additional imports after manifest mappings', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		expect(
			createImportMap({
				root,
				additionalImports: {
					'#config': './types/config.d.ts',
					'bun:test': './node_modules/bun-types/test.d.ts',
					virtual: 'https://example.com/virtual.ts',
				},
			}),
		).toEqual({
			imports: {
				'#config': './types/config.d.ts',
				'bun:test': './node_modules/bun-types/test.d.ts',
				virtual: 'https://example.com/virtual.ts',
			},
		});
	});

	it('adds deterministically sorted scoped imports', () => {
		const root = fixture({});
		expect(
			createImportMap({
				root,
				scopes: {
					'./tests/': {
						zeta: 'jsr:@scope/zeta',
						alpha: './tests/alpha.ts',
					},
					'./src/': { logger: './src/logger.ts' },
				},
			}),
		).toEqual({
			imports: {},
			scopes: {
				'./src/': { logger: './src/logger.ts' },
				'./tests/': {
					alpha: './tests/alpha.ts',
					zeta: 'jsr:@scope/zeta',
				},
			},
		});
	});

	it('rebases relative targets against relativeTo', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		expect(createImportMap({ root, relativeTo: path.join(root, '.cache/maps') })).toEqual({
			imports: { '#config': '../../src/config.ts' },
		});
	});

	it('writes an empty map when a pattern directory is missing', () => {
		const root = fixture({ '#missing/*': './missing/*.ts' });
		expect(createImportMap({ root })).toEqual({ imports: {} });
	});
});

describe('defineConfig', () => {
	it('returns its input unchanged for reuse across create and write', () => {
		const config = defineConfig({ root: '/repo', packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' } });
		expect(config).toEqual({ root: '/repo', packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' } });

		const root = fixture({});
		expect(createImportMap({ ...config, root })).toEqual(
			createImportMap({ root, packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' } }),
		);
	});
});

describe('formatImportMap', () => {
	it('writes stable code-unit-sorted tab-indented output regardless of manifest key order', () => {
		const firstMap = createImportMap({
			root: fixture({ '#z': './z.ts', '#ä': './umlaut.ts', '#a': './a.ts', '#A': './upper.ts' }),
		});
		const secondMap = createImportMap({
			root: fixture({ '#A': './upper.ts', '#a': './a.ts', '#ä': './umlaut.ts', '#z': './z.ts' }),
		});
		const expected = `\
{
	"imports": {
		"#A": "./upper.ts",
		"#a": "./a.ts",
		"#z": "./z.ts",
		"#ä": "./umlaut.ts"
	}
}
`;

		expect(formatImportMap(firstMap)).toBe(expected);
		expect(formatImportMap(secondMap)).toBe(expected);
	});

	it('serializes with a custom indent using JSON.stringify space semantics', () => {
		const map = { imports: { '#a': './a.ts' } };
		expect(formatImportMap(map, 2)).toBe('{\n  "imports": {\n    "#a": "./a.ts"\n  }\n}\n');
		expect(formatImportMap(map, '    ')).toBe('{\n    "imports": {\n        "#a": "./a.ts"\n    }\n}\n');
		expect(formatImportMap(map, 0)).toBe('{"imports":{"#a":"./a.ts"}}\n');
	});
});
