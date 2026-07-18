import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import { which } from 'bun';
import { writeImportMap } from '#src/map';

const denoPath = which('deno');

describe.skipIf(denoPath === null)('generated import map under real Deno', () => {
	it('resolves an expanded pattern specifier via deno check and deno run', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-deno-'));
		try {
			fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
			fs.writeFileSync(
				path.join(root, 'src/lib/greet.ts'),
				"export function greet(name: string): string {\n\treturn 'hello ' + name;\n}\n",
			);
			fs.writeFileSync(
				path.join(root, 'src/main.ts'),
				"import { greet } from '#lib/greet';\nconsole.log(greet('deno'));\n",
			);
			fs.writeFileSync(
				path.join(root, 'package.json'),
				JSON.stringify({ imports: { '#lib/*': './src/lib/*.ts' } }),
			);

			const out = writeImportMap({ root, out: 'import_map.json' });

			if (denoPath === null) throw new Error('deno not found');
			execFileSync(denoPath, ['check', `--import-map=${out}`, 'src/main.ts'], { cwd: root });
			const stdout = execFileSync(denoPath, ['run', `--import-map=${out}`, 'src/main.ts'], {
				cwd: root,
				encoding: 'utf8',
			});
			expect(stdout).toBe('hello deno\n');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it('resolves a scoped override for modules under the scope prefix', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-deno-scope-'));
		try {
			fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
			fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
			fs.writeFileSync(path.join(root, 'shared/default.ts'), "export default 'default';\n");
			fs.writeFileSync(path.join(root, 'shared/scoped.ts'), "export default 'scoped';\n");
			fs.writeFileSync(path.join(root, 'tests/main.ts'), "import value from 'logger';\nconsole.log(value);\n");
			fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ imports: {} }));

			const out = writeImportMap({
				root,
				out: 'import_map.json',
				additionalImports: { logger: './shared/default.ts' },
				scopes: { './tests/': { logger: './shared/scoped.ts' } },
			});

			if (denoPath === null) throw new Error('deno not found');
			const stdout = execFileSync(denoPath, ['run', `--import-map=${out}`, 'tests/main.ts'], {
				cwd: root,
				encoding: 'utf8',
			});
			expect(stdout).toBe('scoped\n');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
