import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createImportMap, formatImportMap, writeImportMap } from '#src/map.ts';

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
	it('expands matching files with extensionless and extension keys', () => {
		const root = fixture({ '#lib/*': './src/lib/*.ts' }, [
			'src/lib/bytes.ts',
			'src/lib/codecs/hex.ts',
			'src/lib/ignored.js',
		]);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes': './src/lib/bytes.ts',
				'#lib/bytes.ts': './src/lib/bytes.ts',
				'#lib/codecs/hex': './src/lib/codecs/hex.ts',
				'#lib/codecs/hex.ts': './src/lib/codecs/hex.ts',
			},
		});
	});

	it('does not produce a double-suffixed key for a renamed key pattern', () => {
		const root = fixture({ '#lib/*.js': './src/lib/*.ts' }, ['src/lib/bytes.ts']);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes.js': './src/lib/bytes.ts',
				'#lib/bytes.ts': './src/lib/bytes.ts',
			},
		});
	});

	it('expands a pattern with a static filename prefix', () => {
		const root = fixture({ '#lib/*': './src/prefix-*.ts' }, ['src/prefix-bytes.ts', 'src/ignored.ts']);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#lib/bytes': './src/prefix-bytes.ts',
				'#lib/prefix-bytes.ts': './src/prefix-bytes.ts',
			},
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

	it('combines exact and pattern entries', () => {
		const root = fixture({ '#config': './src/config.ts', '#lib/*': './src/lib/*.ts' }, [
			'src/config.ts',
			'src/lib/value.ts',
		]);
		expect(createImportMap({ root })).toEqual({
			imports: {
				'#config': './src/config.ts',
				'#lib/value': './src/lib/value.ts',
				'#lib/value.ts': './src/lib/value.ts',
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
});

describe('writeImportMap', () => {
	it('rebases automatically when out is nested and returns the written path', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const out = writeImportMap({ root, out: '.cache/maps/import_map.json' });

		expect(out).toBe(path.join(root, '.cache/maps/import_map.json'));
		expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual({
			imports: { '#config': '../../src/config.ts' },
		});
	});

	it('creates missing output directories', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const out = writeImportMap({ root, out: 'import_map.json' });
		expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual({
			imports: { '#config': './src/config.ts' },
		});
	});

	it('rebases scope prefixes and targets for a nested output', () => {
		const root = fixture({});
		const out = writeImportMap({
			root,
			out: '.cache/maps/import_map.json',
			scopes: { './tests/': { logger: './tests/logger.ts' } },
		});
		expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual({
			imports: {},
			scopes: { '../../tests/': { logger: '../../tests/logger.ts' } },
		});
	});
});
