import exec from 'node:child_process';
import fs from 'node:fs/promises';
import { sortPackageJson } from 'sort-package-json';
import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: { index: 'src/index.ts', importmapify: 'src/bin.ts' },
	dts: { entry: 'src/index.ts' },
	format: 'esm',
	clean: true,
	platform: 'node',
	target: 'node24',
	sourcemap: true,
	minify: 'dce-only',
	hash: false,
	shims: true,
	exports: {
		bin: './src/bin.ts',
		exclude: ['importmapify'],
		async customExports(exports) {
			for (const [key, value] of Object.entries(exports)) {
				if (typeof value !== 'string') continue;
				const types = value.replace(/\.([cm]?)js$/, '.d.$1ts');
				// biome-ignore format: keep the guard clause on one line
				if (types === value || !(await fs.access(types).then(() => true, () => false))) continue;
				exports[key] = { types, default: value };
			}
			return exports;
		},
	},
	attw: { profile: 'esm-only', enabled: 'ci-only' },
	report: 'ci-only',
	publint: 'ci-only',
	unused: 'ci-only',
	failOnWarn: 'ci-only',
	hooks: {
		'build:done': async () => {
			try {
				const filePath = new URL('./package.json', import.meta.url);
				const contents = await fs.readFile(filePath, { encoding: 'utf8' });
				await fs.writeFile(filePath, sortPackageJson(contents), { encoding: 'utf8' });
				exec.execFile('npm', ['pkg', 'fix']);
				exec.execFile('dprint', ['fmt', 'package.json']);
			} catch (err) {
				console.error('Failed to sort package.json:', err);
			}
		},
	},
});
