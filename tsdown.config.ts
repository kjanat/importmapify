import { chmod, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: { index: 'src/index.ts' },
		format: 'esm',
		dts: true,
		clean: true,
		platform: 'node',
		target: 'node20',
		tsconfig: './tsconfig.src.json',
		sourcemap: true,
		unbundle: true,
		hash: false,
		outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
		attw: { profile: 'esm-only', enabled: 'ci-only' },
		report: 'ci-only',
		publint: 'ci-only',
		unused: 'ci-only',
		failOnWarn: 'ci-only',
	},
	{
		entry: { cli: 'src/bin.ts' },
		format: 'esm',
		dts: false,
		clean: false,
		platform: 'node',
		target: 'node20',
		tsconfig: './tsconfig.src.json',
		sourcemap: false,
		deps: { alwaysBundle: [/.*/] },
		shims: true,
		outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
		hooks: {
			'build:done': async () => {
				const binPath = 'dist/cli.js';
				const contents = await readFile(binPath, 'utf8');
				if (!contents.startsWith('#!')) {
					await writeFile(binPath, `#!/usr/bin/env node\n${contents}`);
				}
				await chmod(binPath, 0o755);
			},
		},
	},
]);
