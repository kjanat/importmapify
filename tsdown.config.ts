import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { URL } from 'node:url';
import { sortPackageJson } from 'sort-package-json';
import { defineConfig } from 'tsdown';
import pkg from '#pkg' with { type: 'json' };
import { writeImportMap } from '#src/map';
import importMapOptions from './scripts/generate-importmap.ts';

const entry = './src/mod.ts';
const JSR_SCOPE = '@kjanat';

export default defineConfig({
	entry,
	format: 'esm',
	clean: true,
	platform: 'node',
	target: ['node22.22.2', 'deno2'],
	minify: 'dce-only',
	hash: false,
	attw: { profile: 'esm-only', enabled: 'ci-only' },
	report: 'ci-only',
	publint: 'ci-only',
	unused: 'ci-only',
	failOnWarn: 'ci-only',
	exports: {
		bin: true,
		async customExports(exports) {
			const jsToDts = {
				// biome-ignore lint/performance/useTopLevelRegex: explanation
				from: /\.(?<prefix>c|m)?js$/,
				to: '.d.$<prefix>ts',
			};
			await Promise.all(
				Object.entries(exports).map(async ([key, value]) => {
					if (typeof value !== 'string') return;
					const types = value.replace(jsToDts.from, jsToDts.to);
					if (types === value) return;
					const exists = await fs.access(types).then(
						() => true,
						() => false,
					);
					if (!exists) return;
					exports[key] = { types, default: value };
				}),
			);
			return exports;
		},
	},
	hooks: {
		'build:done': async ({ options }): Promise<void> => {
			if (options.watch) return;
			const packagePath = new URL('./package.json', import.meta.url);
			const contents = await fs.readFile(packagePath, { encoding: 'utf8' });
			const sorted = sortPackageJson(contents);
			if (sorted !== contents) await fs.writeFile(packagePath, sorted, { encoding: 'utf8' });
			execFileSync('npm', ['pkg', 'fix'], { stdio: 'ignore' });
			execFileSync('dprint', ['fmt', 'package.json'], { stdio: 'ignore' });

			const denoPath = new URL('./deno.json', import.meta.url);
			const denoJson = await fs
				.readFile(denoPath, { encoding: 'utf8' })
				.catch(() => execFileSync('git', ['show', 'HEAD:deno.json'], { encoding: 'utf8' }));
			const denoConfig: unknown = JSON.parse(denoJson);
			if (typeof denoConfig !== 'object' || denoConfig === null || Array.isArray(denoConfig)) {
				throw new TypeError('deno.json must contain an object');
			}
			const deno = {
				...denoConfig,
				name: pkg.name.startsWith('@') ? pkg.name : `${JSR_SCOPE}/${pkg.name}`,
				version: pkg.version,
				exports: entry,
				publish: {
					include: [
						'./src/**/*.ts',
						'./README.md',
						'./LICENSE',
						'./deno.json',
						'./import_map.json',
						'./package.json',
					],
				},
				compilerOptions: { lib: ['ESNext', 'DOM', 'deno.ns'] },
				homepage: pkg.homepage,
				repository: pkg.repository,
				license: pkg.license,
				importMap: importMapOptions.out,
			};
			await fs.writeFile(denoPath, `${JSON.stringify(deno, null, '\t')}\n`, {
				encoding: 'utf8',
			});
			execFileSync('dprint', ['fmt'], { stdio: 'ignore' });
			writeImportMap(importMapOptions);
		},
	},
});
