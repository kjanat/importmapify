#!/usr/bin/env node
/**
 *
 * [![NPM](https://img.shields.io/npm/v/importmapify?logo=npm&labelColor=CB3837&color=black)][npm]
 * [![JSR](https://img.shields.io/jsr/v/@kjanat/importmapify?logoColor=083344&logo=jsr&logoSize=auto&label=&labelColor=f7df1e&color=black)][jsr]
 * [![CI](https://github.com/kjanat/importmapify/actions/workflows/publish.yml/badge.svg)][ci]
 * [![Socket](https://badge.socket.dev/npm/package/importmapify)][socket]
 *
 * [ci]: https://github.com/kjanat/importmapify/actions/workflows/publish.yml
 * [npm]: https://npm.im/importmapify
 * [jsr]: https://jsr.io/@kjanat/importmapify
 * [socket]: https://socket.dev/npm/package/importmapify
 *
 *
 * Expand package import patterns into explicit Deno import map entries.
 *
 * Use the library API to create, format, or write deterministic import maps that conform to the {@link https://html.spec.whatwg.org/multipage/webappapis.html#import-maps | Import Maps Standard}.
 *
 * This module also runs the `importmapify` CLI when executed directly.
 *
 * @example
 * ```ts
 * // Create an import map from the current package.
 * import { createImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const importMap = createImportMap({ root: Deno.cwd() });
 * console.log(importMap.imports);
 * ```
 *
 * @example
 * ```sh
 * // Access these docs programmatically
 * deno doc jsr:@kjanat/importmapify
 * ```
 *
 * @module importmapify
 */

import { cli as dreamcli } from 'dreamcli';
import { generateCommand } from '#src/cli';

const cli = dreamcli('importmapify')
	.manifest({ from: import.meta.url, files: ['package.json', 'deno.json'] })
	.links()
	.default(generateCommand)
	.completions({ as: 'flag' });

if (import.meta.main) {
	cli.run({
		help: {
			theme: (c) => ({
				headerName: (input) => c.bold(c.underline(input)),
				headerVersion: (input) => c.dim(c.underline(input)),
			}),
		},
	});
}

export { createImportMap, defineConfig, formatImportMap, packageEntries, writeImportMap } from '#src/map';
export type {
	Config,
	CreateImportMapOptions,
	HookContext,
	ImportMapDocument,
	ImportMapHooks,
	PathOrUrl,
	TargetFilter,
	WriteImportMapOptions,
} from '#src/types';
