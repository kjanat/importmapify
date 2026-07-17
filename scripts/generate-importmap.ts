#!/usr/bin/env -S deno run -A --no-config

import pkg from '../package.json' with { type: 'json' };
import { writeImportMap } from '../src/map.ts';

const dreamcli = pkg['dependencies']['dreamcli'].replace(/^npm:/, 'jsr:');
const bunTypes = `npm:bun-types@${pkg['devDependencies']['@types/bun']}`;

const output = writeImportMap({
	root: new URL('..', import.meta.url).pathname,
	out: 'import_map.json',
	additionalImports: {
		'@types/bun': bunTypes,
		bun: bunTypes,
		'bun:test': `${bunTypes}/test.d.ts`,
	},
	packages: { dreamcli },
	scopes: {
		'./tests/': {
			'dreamcli/testkit': `${dreamcli}/testkit`,
		},
	},
});
console.log(`Wrote ${output}`);
