#!/usr/bin/env node
/**
 * Expand package import patterns into explicit Deno import map entries.
 *
 * Use the library API to create, format, or write deterministic import maps.
 * This module also runs the `importmapify` CLI when executed directly.
 *
 * @example Create an import map from the current package.
 * ```ts
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

declare global {
	/** Runtime metadata for the current ECMAScript module. */
	interface ImportMeta {
		/** Whether this module is the process entrypoint. */
		main: boolean;
		/** Fully qualified URL of this module. */
		url: string;
	}
}

const cli = dreamcli('importmapify')
	.manifest({ from: import.meta.url, files: ['package.json', 'jsr.json'] })
	.links()
	.default(generateCommand)
	.completions({ as: 'flag' });

if (import.meta.main) cli.run();

export type { CreateImportMapOptions, ImportMapDocument, WriteImportMapOptions } from '#src/map';
export { createImportMap, formatImportMap, writeImportMap } from '#src/map';
