import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'bun:test';
import { runCommand } from 'dreamcli/testkit';
import { generateCommand } from '#src/cli.ts';

const roots: string[] = [];

const TS_CAPABLE = 'Bun' in globalThis || 'Deno' in globalThis || Number(process.versions.node.split('.')[0]) > 22;

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(imports: Readonly<Record<string, unknown>>, files: readonly string[] = []): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-cli-config-'));
	roots.push(root);
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ imports }));
	for (const file of files) {
		const target = path.join(root, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, '');
	}
	return root;
}

function writeConfig(root: string, name: string, body: string): void {
	fs.writeFileSync(path.join(root, name), body);
}

describe('generateCommand config file', () => {
	const Mjs = "export default { packages: { ansispeck: 'npm:ansispeck@0.2' } };";

	it('auto-discovers a config file and merges it into the map', async () => {
		const root = fixture({ '#lib/*': './src/*.ts' }, ['src/a.ts']);
		writeConfig(root, 'importmapify.config.mjs', Mjs);
		const result = await runCommand(generateCommand, ['--root', root, '--stdout']);
		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: { '#lib/a': './src/a.ts', ansispeck: 'npm:ansispeck@0.2', 'ansispeck/': 'npm:/ansispeck@0.2/' },
		});
	});

	it('lets an explicit --package override the config', async () => {
		const root = fixture({});
		writeConfig(root, 'importmapify.config.mjs', Mjs);
		const result = await runCommand(generateCommand, [
			'--root',
			root,
			'--stdout',
			'--package',
			'ansispeck=npm:ansispeck@0.1',
		]);
		expect(JSON.parse(result.stdout.join('')).imports.ansispeck).toBe('npm:ansispeck@0.1');
	});

	it('skips discovery with --no-config', async () => {
		const root = fixture({ '#lib/*': './src/*.ts' }, ['src/a.ts']);
		writeConfig(root, 'importmapify.config.mjs', Mjs);
		const result = await runCommand(generateCommand, ['--root', root, '--stdout', '--no-config']);
		expect(JSON.parse(result.stdout.join(''))).toEqual({ imports: { '#lib/a': './src/a.ts' } });
	});

	it('loads an explicit --config path outside the discovery convention', async () => {
		const root = fixture({});
		writeConfig(root, 'custom.mjs', Mjs);
		const result = await runCommand(generateCommand, [
			'--root',
			root,
			'--stdout',
			'--config',
			path.join(root, 'custom.mjs'),
		]);
		expect(JSON.parse(result.stdout.join('')).imports.ansispeck).toBe('npm:ansispeck@0.2');
	});

	it('exits non-zero when --config names a missing file', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, ['--root', root, '--config', path.join(root, 'nope.mjs')]);
		expect(result.exitCode).not.toBe(0);
	});

	describe.skipIf(!TS_CAPABLE)('.ts config', () => {
		it('loads a .ts config end-to-end', async () => {
			const root = fixture({});
			writeConfig(
				root,
				'importmapify.config.ts',
				"export default { packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' } };",
			);
			const result = await runCommand(generateCommand, ['--root', root, '--stdout']);
			expect(JSON.parse(result.stdout.join('')).imports.dreamcli).toBe('jsr:@kjanat/dreamcli@^3');
		});
	});
});

describe('generateCommand hooks', () => {
	const BeforeHook = [
		"import fs from 'node:fs';",
		"import path from 'node:path';",
		'export default {',
		'  hooks: {',
		"    'generate:before': (ctx) => {",
		"      fs.mkdirSync(path.join(ctx.root, 'dist'), { recursive: true });",
		"      fs.writeFileSync(path.join(ctx.root, 'dist', 'a.js'), '');",
		'    },',
		'  },',
		'};',
	].join('\n');

	it('runs generate:before so its output is scanned', async () => {
		const root = fixture({ '#dist/*': './dist/*.js' });
		writeConfig(root, 'importmapify.config.mjs', BeforeHook);
		const result = await runCommand(generateCommand, ['--root', root, '--stdout']);
		expect(JSON.parse(result.stdout.join('')).imports['#dist/a']).toBe('./dist/a.js');
	});

	const DoneHook = [
		"import fs from 'node:fs';",
		"import path from 'node:path';",
		'export default {',
		'  hooks: {',
		"    'generate:done': (ctx) => {",
		"      fs.writeFileSync(path.join(ctx.root, 'done.json'), JSON.stringify(ctx.map));",
		'    },',
		'  },',
		'};',
	].join('\n');

	it('runs generate:done with the finished map', async () => {
		const root = fixture({ '#lib/*': './src/*.ts' }, ['src/a.ts']);
		writeConfig(root, 'importmapify.config.mjs', DoneHook);
		await runCommand(generateCommand, ['--root', root, '--stdout']);
		const seen = JSON.parse(fs.readFileSync(path.join(root, 'done.json'), 'utf8'));
		expect(seen.imports['#lib/a']).toBe('./src/a.ts');
	});
});
