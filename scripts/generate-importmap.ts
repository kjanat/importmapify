#!/usr/bin/env bun
/**
 * biome-ignore-all lint/complexity/noRedundantDefaultExport: explanation
 * biome-ignore-all lint/performance/noBarrelFile: explanation
 */

import pkg from '#pkg' with { type: 'json' };
import { type CreateImportMapOptions, writeImportMap } from '#src/map.ts';

const options: CreateImportMapOptions = {
	root: new URL('..', import.meta.url).pathname,
	additionalImports: {
		'@types/bun': `npm:bun-types@${pkg['devDependencies']['@types/bun']}`,
		'bun:test': `${`npm:bun-types@${pkg['devDependencies']['@types/bun']}`}/test.d.ts`,
		bun: `npm:bun-types@${pkg['devDependencies']['@types/bun']}`,
	},
	packages: {
		'sort-package-json': `npm:sort-package-json@${pkg['devDependencies']['sort-package-json']}`,
		dreamcli: pkg['dependencies']['dreamcli'].replace(/^npm:/, 'jsr:'),
		tsdown: `npm:tsdown@${pkg['devDependencies']['tsdown']}`,
	},
	scopes: {
		'./tests/': {
			'dreamcli/testkit': `${pkg['dependencies']['dreamcli'].replace(/^npm:/, 'jsr:')}/testkit`,
		},
	},
};

if (import.meta.main) {
	const output = writeImportMap({ ...options, out: 'import_map.json' });
	console.log(`Wrote ${output}`);
}

export { createImportMap, writeImportMap } from '#src/map.ts';
export { options as importmapoptions };
export default options;
