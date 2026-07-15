import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { sortPackageJson } from 'sort-package-json';
import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

const JS_EXTENSION_PATTERN = /\.([cm]?)js$/;
const JSR_SCHEMA = 'https://jsr.io/schema/config-file.v1.json';
const JSR_SCOPE = '@kjanat';

export default defineConfig({
	entry: 'src/mod.ts',
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
			await Promise.all(
				Object.entries(exports).map(async ([key, value]) => {
					if (typeof value !== 'string') return;
					const types = value.replace(JS_EXTENSION_PATTERN, '.d.$1ts');
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
		'build:done': async ({ options }) => {
			if (options.watch) return;
			const packagePath = new URL('./package.json', import.meta.url);
			const contents = await fs.readFile(packagePath, { encoding: 'utf8' });
			const sorted = sortPackageJson(contents);
			if (sorted !== contents) await fs.writeFile(packagePath, sorted, { encoding: 'utf8' });
			execFileSync('npm', ['pkg', 'fix'], { stdio: 'inherit' });
			execFileSync('dprint', ['fmt', 'package.json'], { stdio: 'inherit' });

			const jsr = {
				$schema: JSR_SCHEMA,
				name: pkg.name.startsWith('@') ? pkg.name : `${JSR_SCOPE}/${pkg.name}`,
				version: pkg.version,
				exports: './src/mod.ts',
				publish: { include: ['/src/**/*.ts', '/README.md', '/LICENSE', '/jsr.json', '/package.json'] },
				homepage: pkg.homepage,
				repository: pkg.repository,
				license: pkg.license,
			};
			await fs.writeFile(new URL('./jsr.json', import.meta.url), `${JSON.stringify(jsr, null, '\t')}\n`, {
				encoding: 'utf8',
			});
		},
	},
});
