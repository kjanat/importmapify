#!/usr/bin/env bun

/**
 * biome-ignore-all lint/complexity/noRedundantDefaultExport: explanation
 * biome-ignore-all lint/performance/noBarrelFile: explanation
 */

import type { WriteImportMapOptions } from '#src/map';
import { defineConfig, writeImportMap } from '#src/map';
import lockfile from '../bun.lock' with { type: 'jsonc' };

function lockSpec(name: string): string {
	const entry: Bun.BunLockFilePackageArray | undefined = lockfile.packages[name];
	if (entry === undefined) throw new Error(`bun.lock is missing package "${name}"`);
	return entry[0];
}

const options: WriteImportMapOptions = defineConfig({
	out: 'import_map.json',
	root: new URL('..', import.meta.url).pathname,
	additionalImports: {
		'@types/bun': `npm:${lockSpec('@types/bun')}`,
		'bun:test': `${`npm:${lockSpec('bun-types')}`}/test.d.ts`,
		bun: `npm:${lockSpec('bun-types')}`,
	},
	packages: {
		'sort-package-json': `npm:${lockSpec('sort-package-json')}`,
		ansispeck: `jsr:@kjanat/${lockSpec('ansispeck')}`,
		dreamcli: `jsr:${lockSpec('dreamcli')}`,
		tsdown: `npm:${lockSpec('tsdown')}`,
	},
	scopes: {
		'./tests/': {
			'dreamcli/testkit': `jsr:${lockSpec('dreamcli')}/testkit`,
		},
	},
});

if (import.meta.main && !Bun.env['NOPE']) {
	const output = writeImportMap(options);
	console.log(`Wrote ${output}`);
}

export default options;
