import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { writeImportMap } from '#src/map';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(imports: Readonly<Record<string, unknown>>, files: readonly string[] = []): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-write-'));
	roots.push(root);
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ imports }));
	for (const file of files) {
		const target = path.join(root, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, '');
	}
	return root;
}

function outsideRoot(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-out-'));
	roots.push(dir);
	return path.join(dir, 'map.json');
}

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

	it('defaults out to import_map.json when omitted', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const out = writeImportMap({ root });
		expect(out).toBe(path.join(root, 'import_map.json'));
		expect(fs.existsSync(out)).toBe(true);
	});

	it('writes to an absolute out path unchanged', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const absOut = outsideRoot();
		expect(writeImportMap({ root, out: absOut })).toBe(absOut);
		expect(fs.existsSync(absOut)).toBe(true);
	});

	it('resolves a file:// URL out to its filesystem path', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const absOut = outsideRoot();
		expect(writeImportMap({ root, out: Bun.pathToFileURL(absOut).href })).toBe(absOut);
		expect(fs.existsSync(absOut)).toBe(true);
	});

	it('accepts a URL object as out', () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const absOut = outsideRoot();
		expect(writeImportMap({ root, out: Bun.pathToFileURL(absOut) })).toBe(absOut);
		expect(fs.existsSync(absOut)).toBe(true);
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
