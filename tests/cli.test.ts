import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from 'dreamcli/testkit';
import { generateCommand } from '#src/cli.ts';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(imports: Readonly<Record<string, unknown>>, files: readonly string[] = []): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-cli-'));
	roots.push(root);
	fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ imports }));
	for (const file of files) {
		const target = path.join(root, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, '');
	}
	return root;
}

describe('generateCommand', () => {
	it('shows generation, scope, and freshness examples in help', async () => {
		const result = await runCommand(generateCommand, ['--help']);
		const help = result.stdout.join('\n');
		expect(help).toContain('Examples:');
		expect(help).toContain('importmapify --stdout');
		expect(help).toContain("--scope './tests/::dreamcli/testkit=");
		expect(help).toContain('importmapify --check');
	});

	it('writes the import map and reports the written path', async () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const result = await runCommand(generateCommand, ['--root', root]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.some((line) => line.includes('Wrote'))).toBe(true);
		expect(JSON.parse(fs.readFileSync(path.join(root, 'import_map.json'), 'utf8'))).toEqual({
			imports: { '#config': './src/config.ts' },
		});
	});

	it('prints the map to stdout instead of writing it', async () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const result = await runCommand(generateCommand, ['--root', root, '--stdout']);

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: { '#config': './src/config.ts' },
		});
		expect(fs.existsSync(path.join(root, 'import_map.json'))).toBe(false);
	});

	it('accepts repeated --import key=value flags', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, [
			'--root',
			root,
			'--stdout',
			'--import',
			'bun:test=./node_modules/bun-types/test.d.ts',
			'--import',
			'virtual=https://example.com/virtual.ts',
		]);

		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: {
				'bun:test': './node_modules/bun-types/test.d.ts',
				virtual: 'https://example.com/virtual.ts',
			},
		});
	});

	it('expands --package name=target into a conformant bare and trailing-slash pair', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, [
			'--root',
			root,
			'--stdout',
			'--package',
			'dreamcli=jsr:@kjanat/dreamcli@^3',
		]);

		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: {
				dreamcli: 'jsr:@kjanat/dreamcli@^3',
				'dreamcli/': 'jsr:/@kjanat/dreamcli@^3/',
			},
		});
	});

	it('restricts pattern matches to --ext extensions', async () => {
		const root = fixture({ '#internals/*': './src/*' }, ['src/writer.ts', 'src/notes.md']);
		const result = await runCommand(generateCommand, ['--root', root, '--stdout', '--ext', 'ts']);

		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: { '#internals/writer.ts': './src/writer.ts' },
		});
	});

	it('accepts repeated --scope prefix::key=value flags', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, [
			'--root',
			root,
			'--stdout',
			'--scope',
			'./tests/::dreamcli/testkit=jsr:@kjanat/dreamcli/old-testkit',
			'--scope',
			'./tests/::virtual=https://example.com/mod.ts?value=a=b',
			'--scope',
			'./tests/::dreamcli/testkit=jsr:@kjanat/dreamcli/testkit',
		]);

		expect(JSON.parse(result.stdout.join(''))).toEqual({
			imports: {},
			scopes: {
				'./tests/': {
					'dreamcli/testkit': 'jsr:@kjanat/dreamcli/testkit',
					virtual: 'https://example.com/mod.ts?value=a=b',
				},
			},
		});
	});

	it('rejects an --import value with no "="', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, ['--root', root, '--stdout', '--import', 'nokeyvalue']);
		expect(result.exitCode).not.toBe(0);
	});

	it('rejects a --scope value with no prefix separator', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, ['--root', root, '--scope', 'tests=logger=value']);
		expect(result.exitCode).not.toBe(0);
	});

	it('rejects --check combined with --stdout', async () => {
		const root = fixture({});
		const result = await runCommand(generateCommand, ['--root', root, '--check', '--stdout']);
		expect(result.exitCode).not.toBe(0);
	});

	it('exits non-zero with --check when the output file is stale', async () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		const result = await runCommand(generateCommand, ['--root', root, '--check']);
		expect(result.exitCode).toBe(1);
	});

	it('exits zero with --check when the output file is current', async () => {
		const root = fixture({ '#config': './src/config.ts' }, ['src/config.ts']);
		await runCommand(generateCommand, ['--root', root]);
		const result = await runCommand(generateCommand, ['--root', root, '--check']);
		expect(result.exitCode).toBe(0);
	});

	it('rejects a root that does not exist', async () => {
		const result = await runCommand(generateCommand, ['--root', '/nonexistent/path/xyz']);
		expect(result.exitCode).not.toBe(0);
	});
});
