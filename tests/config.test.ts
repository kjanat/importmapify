import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { configToOptions, discoverConfig, loadConfig, mergeScopes } from '#src/config.ts';

const dirs: string[] = [];
const NON_OBJECT_DEFAULT = /must have a default export object/;
const LOAD_FAILURE = /Cannot load config/;

afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(files: Readonly<Record<string, string>> = {}): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-config-'));
	dirs.push(dir);
	for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
	return dir;
}

function canImportTypeScript(): boolean {
	if ('Bun' in globalThis || 'Deno' in globalThis) return true;
	const [major, minor] = process.versions.node.split('.').map(Number);
	return (major ?? 0) > 22 || (major === 22 && (minor ?? 0) >= 6);
}

describe('discoverConfig', () => {
	it('returns undefined when no config file exists', () => {
		expect(discoverConfig(tmp())).toBeUndefined();
	});

	it('prefers importmapify.config over .importmapify, and .mjs over later extensions', () => {
		const dir = tmp({
			'.importmapify.js': '',
			'importmapify.config.ts': '',
			'importmapify.config.mjs': '',
		});
		expect(discoverConfig(dir)).toBe(path.join(dir, 'importmapify.config.mjs'));
	});

	it('still discovers a TypeScript config when it is the only one', () => {
		const dir = tmp({ 'importmapify.config.ts': '' });
		expect(discoverConfig(dir)).toBe(path.join(dir, 'importmapify.config.ts'));
	});

	it('falls back to the dotfile when no importmapify.config.* exists', () => {
		const dir = tmp({ '.importmapify.cjs': '' });
		expect(discoverConfig(dir)).toBe(path.join(dir, '.importmapify.cjs'));
	});
});

describe('loadConfig', () => {
	it('returns the default export object of a .mjs config', async () => {
		const dir = tmp({ 'c.mjs': "export default { packages: { ansispeck: 'npm:ansispeck@0.2' } };" });
		expect(await loadConfig(path.join(dir, 'c.mjs'))).toEqual({ packages: { ansispeck: 'npm:ansispeck@0.2' } });
	});

	it('throws when the default export is not a plain object', () => {
		const dir = tmp({ 'c.mjs': 'export default 42;' });
		return expect(loadConfig(path.join(dir, 'c.mjs'))).rejects.toThrow(NON_OBJECT_DEFAULT);
	});

	it('throws with a runtime hint when the file cannot be imported', () => {
		const dir = tmp();
		return expect(loadConfig(path.join(dir, 'missing.mjs'))).rejects.toThrow(LOAD_FAILURE);
	});
});

describe.skipIf(!canImportTypeScript())('loadConfig (TypeScript)', () => {
	it('loads a .ts config default export', async () => {
		const dir = tmp({ 'c.ts': "const config = { extensions: ['ts'] }; export default config;" });
		expect(await loadConfig(path.join(dir, 'c.ts'))).toEqual({ extensions: ['ts'] });
	});
});

describe('configToOptions', () => {
	it('reads known fields and drops wrongly-typed ones', () => {
		expect(
			configToOptions(
				{
					manifest: 'deno.json',
					conditions: ['deno', 'default'],
					extensions: ['ts'],
					packages: { ansispeck: 'npm:ansispeck@0.2' },
					scopes: { './tests/': { helper: './helper.ts' } },
					out: 42,
					additionalImports: { bad: 1 },
				},
				'/repo',
			),
		).toEqual({
			manifest: 'deno.json',
			conditions: ['deno', 'default'],
			extensions: ['ts'],
			packages: { ansispeck: 'npm:ansispeck@0.2' },
			scopes: { './tests/': { helper: './helper.ts' } },
		});
	});

	it('resolves a relative string root against the config directory', () => {
		expect(configToOptions({ root: './packages/app' }, '/repo').root).toBe(path.resolve('/repo', 'packages/app'));
	});

	it('leaves an absolute or URL root unchanged', () => {
		const url = new URL('file:///abs/root/');
		expect(configToOptions({ root: '/abs/root' }, '/repo').root).toBe('/abs/root');
		expect(configToOptions({ root: url }, '/repo').root).toBe(url);
	});
});

describe('mergeScopes', () => {
	it('merges override entries over base per scope prefix', () => {
		expect(
			mergeScopes(
				{ './tests/': { a: './a.ts', b: './b.ts' }, './src/': { x: './x.ts' } },
				{ './tests/': { b: './b2.ts', c: './c.ts' } },
			),
		).toEqual({
			'./tests/': { a: './a.ts', b: './b2.ts', c: './c.ts' },
			'./src/': { x: './x.ts' },
		});
	});
});
