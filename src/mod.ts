#!/usr/bin/env node
/**
 * Expand package import patterns into explicit Deno import map entries.
 *
 * Use the library API to create, format, or write deterministic import maps.
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
 * @module importmapify
 */

import { detectHyperlinkSupport } from 'ansispeck';
import { cli as dreamcli } from 'dreamcli';
import { generateCommand } from '#src/cli';

const cli = dreamcli('importmapify')
	.manifest({ from: import.meta.url, files: ['package.json', 'deno.json'] })
	.links()
	.default(generateCommand)
	.completions({ as: 'flag' });

// dreamcli's help hyperlink gate ignores NO_HYPERLINKS (kjanat/dreamcli#63); underline the
// header so name/version stay underlined once the link (and its underline) is gone.
if (import.meta.main) {
	cli.run({
		help: {
			hyperlinks: detectHyperlinkSupport(),
			theme: (c) => ({
				headerName: (input) => c.bold(c.underline(input)),
				headerVersion: (input) => c.dim(c.underline(input)),
			}),
		},
	});
}

export type { CreateImportMapOptions, ImportMapDocument, WriteImportMapOptions } from '#src/map';
export { createImportMap, defineConfig, formatImportMap, packageEntries, writeImportMap } from '#src/map';
