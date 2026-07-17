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

import { cli as dreamcli } from 'dreamcli';
import { generateCommand } from '#src/cli';

const cli = dreamcli('importmapify')
	.manifest({ from: import.meta.url, files: ['package.json', 'deno.json'] })
	.links()
	.default(generateCommand)
	.completions({ as: 'flag' });

if (import.meta.main) cli.run();

export type { CreateImportMapOptions, ImportMapDocument, WriteImportMapOptions } from '#src/map';
export { createImportMap, defineConfig, formatImportMap, packageEntries, writeImportMap } from '#src/map';
