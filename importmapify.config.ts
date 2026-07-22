import lockfile from './bun.lock' with { type: 'jsonc' };

function lockSpec(name: string): string {
	const entry: Bun.BunLockFilePackageArray | undefined = lockfile.packages[name];
	if (entry === undefined) throw new Error(`bun.lock is missing package "${name}"`);
	return entry[0];
}

const config: import('importmapify').Config = {
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
};

export default config;
