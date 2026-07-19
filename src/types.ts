/**
 * A deterministic Deno import map generated from package import entries, following the
 * {@link https://html.spec.whatwg.org/multipage/webappapis.html#import-maps | Import Maps Standard}.
 *
 * @example
 * ```ts
 * import type { ImportMapDocument } from 'jsr:@kjanat/importmapify';
 *
 * const doc: ImportMapDocument = {
 *   imports: { '#lib/bytes': './src/lib/bytes.ts' },
 *   scopes: { './tests/': { '#lib/bytes': './tests/stub/bytes.ts' } },
 * };
 * ```
 * @category Generate
 */
interface ImportMapDocument {
	/**
	 * Exact specifier-to-target mappings, sorted by specifier, as in Deno's
	 * {@link https://docs.deno.com/runtime/reference/deno_json/#custom-path-mappings | custom path mappings}.
	 *
	 * @example
	 * ```ts
	 * const imports = { '#lib/bytes': './src/lib/bytes.ts' };
	 * ```
	 */
	readonly imports: Readonly<Record<string, string>>;
	/**
	 * Scope prefixes mapped to sorted, scope-specific import overrides, as in Deno's
	 * {@link https://docs.deno.com/runtime/reference/deno_json/#scoped-mappings | scoped mappings}.
	 *
	 * @example
	 * ```ts
	 * const scopes = { './tests/': { '#lib/bytes': './tests/stub/bytes.ts' } };
	 * ```
	 */
	readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * A filesystem location as a path string or `file://` URL, accepted wherever an option names a
 * directory or file.
 *
 * @example
 * ```ts
 * import type { PathOrUrl } from 'jsr:@kjanat/importmapify';
 *
 * const root: PathOrUrl = new URL('..', import.meta.url);
 * ```
 * @category Options
 */
type PathOrUrl = string | URL;

/**
 * A matcher for {@link CreateImportMapOptions.filter | filter}, tested against a candidate target
 * path such as `./dist/internal-qo9O8jzH.js`. A target is kept only when every matcher accepts it.
 *
 * @example
 * ```ts
 * import type { TargetFilter } from 'jsr:@kjanat/importmapify';
 *
 * // Drop hashed internal chunks like ./dist/internal-qo9O8jzH.js.
 * const filter: readonly TargetFilter[] = [/^(?!.*internal)/];
 * ```
 * @category Options
 */
type TargetFilter = RegExp | ((target: string) => boolean);

/**
 * Options for creating an import map without writing it to disk.
 *
 * @example
 * ```ts
 * import { createImportMap, type CreateImportMapOptions } from 'jsr:@kjanat/importmapify';
 *
 * const options: CreateImportMapOptions = {
 *   root: import.meta.dirname,
 *   conditions: ['deno', 'import', 'default'],
 *   extensions: ['ts', 'tsx'],
 * };
 *
 * createImportMap(options);
 * ```
 * @category Options
 */
interface CreateImportMapOptions {
	/**
	 * Project directory containing the package {@linkcode manifest}, as a path or `file://` URL.
	 *
	 * @example
	 * ```ts
	 * const root = import.meta.dirname;
	 * ```
	 */
	readonly root: PathOrUrl;
	/**
	 * Manifest path relative to {@link root}. Defaults to `package.json`.
	 *
	 * @example
	 * ```ts
	 * const manifest = 'deno.json';
	 * ```
	 * @defaultValue `'package.json'`
	 */
	readonly manifest?: string;
	/**
	 * Conditional import keys to try in order. Defaults to `import`, then `default`.
	 *
	 * @example
	 * ```ts
	 * const conditions = ['deno', 'import', 'default'];
	 * ```
	 * @defaultValue `['import', 'default']`
	 */
	readonly conditions?: readonly string[];
	/**
	 * Package specifiers mapped to targets, each expanded to a conformant bare and trailing-slash pair.
	 * Defaults to none.
	 *
	 * @example
	 * ```ts
	 * const packages = { dreamcli: 'jsr:@kjanat/dreamcli@^3' };
	 * ```
	 * @defaultValue `{}`
	 */
	readonly packages?: Readonly<Record<string, string>>;
	/**
	 * Explicit entries merged after manifest imports and packages, overriding duplicate keys. Defaults to none.
	 *
	 * @example
	 * ```ts
	 * const additionalImports = { '#config': './src/config.ts' };
	 * ```
	 * @defaultValue `{}`
	 */
	readonly additionalImports?: Readonly<Record<string, string>>;
	/**
	 * Scope-specific import overrides keyed by scope prefix, following Deno's
	 * {@link https://docs.deno.com/runtime/reference/deno_json/#scoped-mappings | scoped mappings}. Defaults to none.
	 *
	 * @example
	 * ```ts
	 * const scopes = { './tests/': { '#lib/bytes': './tests/stub/bytes.ts' } };
	 * ```
	 * @defaultValue `{}`
	 */
	readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/**
	 * Directory the generated import map will be read from, as a path or `file://` URL.
	 *
	 * Manifest targets are written relative to {@link root}, but Deno resolves an import map's relative targets
	 * from the location of the map file. Each relative target is rewritten to be relative to this directory
	 * instead, so it still points at the right file once the map moves. `writeImportMap` and the CLI set
	 * this automatically to the output file's directory; set it yourself only when placing an in-memory map
	 * somewhere other than {@link root}. Defaults to {@link root}.
	 *
	 * @example
	 * ```ts
	 * // Map root is /proj, target is ./src/bytes.ts, map will live in /proj/.cache.
	 * const relativeTo = '/proj/.cache';
	 * // The emitted target becomes ../src/bytes.ts, which resolves back to /proj/src/bytes.ts.
	 * ```
	 * @defaultValue {@link root}
	 */
	readonly relativeTo?: PathOrUrl;
	/**
	 * Extension whitelist limiting which pattern targets are kept, with or without leading dots.
	 * Combines with {@link filter}. Unset keeps every extension.
	 *
	 * @example
	 * ```ts
	 * const extensions = ['ts', 'tsx'];
	 * ```
	 * @defaultValue `[]`
	 */
	readonly extensions?: readonly string[];
	/**
	 * Matchers a candidate pattern target must pass, each tested against the target path. A target is kept
	 * only when every matcher accepts it. Combines with {@link extensions}. Unset keeps every target.
	 *
	 * @example
	 * ```ts
	 * // Keep .js targets that are not hashed internal chunks.
	 * const options = { extensions: ['js'], filter: [/^(?!.*internal)/] };
	 * ```
	 * @defaultValue `[]`
	 */
	readonly filter?: readonly TargetFilter[];
}

/**
 * Options for creating and writing an import map.
 *
 * @example
 * ```ts
 * import { writeImportMap, type WriteImportMapOptions } from 'jsr:@kjanat/importmapify';
 *
 * const options: WriteImportMapOptions = {
 *   root: import.meta.dirname,
 *   out: '.cache/maps/import_map.json',
 * };
 *
 * writeImportMap(options);
 * ```
 * @category Options
 */
interface WriteImportMapOptions extends CreateImportMapOptions {
	/**
	 * Output path, resolved against {@link CreateImportMapOptions.root | root}. Accepts a relative path, an
	 * absolute path, a `file://` URL string, or a {@link URL}. Defaults to `import_map.json`.
	 *
	 * Deno loads the written file through the `importMap` field in `deno.json` or the `--import-map` flag; see
	 * {@link https://docs.deno.com/runtime/fundamentals/modules/#differentiating-between-imports-or-importmap-in-deno.json-and---import-map-option | Deno: imports vs importMap}.
	 *
	 * @example
	 * ```ts
	 * const out = '.cache/maps/import_map.json';
	 * ```
	 * @defaultValue `'import_map.json'`
	 */
	readonly out?: PathOrUrl;
	/**
	 * Indentation for the serialized map, with the semantics of `JSON.stringify`'s
	 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#space | space parameter}:
	 * a number of spaces per level or a literal indent string. Defaults to a tab.
	 *
	 * @example
	 * ```ts
	 * const indent = 2;
	 * ```
	 * @defaultValue `'\t'`
	 */
	readonly indent?: string | number;
}

/**
 * Resolved paths shared by every generation hook.
 *
 * @example
 * ```ts
 * import type { HookContext } from 'jsr:@kjanat/importmapify';
 *
 * const logRoot = (ctx: HookContext) => console.log(`scanning ${ctx.root}, writing ${ctx.out}`);
 * ```
 * @category Configuration
 */
interface HookContext {
	/**
	 * Absolute project root that gets scanned.
	 *
	 * @example
	 * ```ts
	 * const root = '/home/me/project';
	 * ```
	 */
	readonly root: string;
	/**
	 * Absolute output path the map resolves against.
	 *
	 * @example
	 * ```ts
	 * const out = '/home/me/project/import_map.json';
	 * ```
	 */
	readonly out: string;
}

/**
 * Lifecycle hooks the CLI runs around import map generation, modeled on tsdown's hooks.
 *
 * Each hook may be async; the CLI awaits it. The synchronous library functions ignore hooks.
 *
 * @example
 * ```ts
 * // Build generated targets before the scan so they land in the map.
 * import { execSync } from 'node:child_process';
 * import { defineConfig } from 'jsr:@kjanat/importmapify';
 *
 * export default defineConfig({
 *   hooks: {
 *     'generate:before': () => execSync('deno task build', { stdio: 'inherit' }),
 *   },
 * });
 * ```
 * @category Configuration
 */
interface ImportMapHooks {
	/**
	 * Runs before the filesystem is scanned. Build pattern targets here so they exist when patterns expand.
	 *
	 * @example
	 * ```ts
	 * const onBefore = (ctx) => console.log('building targets under', ctx.root);
	 * ```
	 */
	readonly 'generate:before': (context: HookContext) => void | Promise<void>;
	/**
	 * Runs after the map is generated and emitted.
	 *
	 * @example
	 * ```ts
	 * const onDone = (ctx) => console.log('mapped', Object.keys(ctx.map.imports).length, 'imports');
	 * ```
	 */
	readonly 'generate:done': (context: HookContext & { readonly map: ImportMapDocument }) => void | Promise<void>;
}

/**
 * An importmapify config file: the shape a config file's default export and `defineConfig` take.
 * Every field is optional; the config loader and CLI supply {@linkcode CreateImportMapOptions.root | root}
 * and the remaining defaults.
 *
 * @example
 * ```ts
 * // importmapify.config.ts; root is omitted, so it defaults to this file's directory.
 * import { defineConfig } from 'jsr:@kjanat/importmapify';
 *
 * export default defineConfig({
 *   packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' },
 *   extensions: ['ts'],
 * });
 * ```
 * @category Configuration
 */
interface Config extends Partial<WriteImportMapOptions> {
	/**
	 * Lifecycle hooks the CLI runs around generation. Ignored by `writeImportMap` and `createImportMap`.
	 *
	 * @example
	 * ```ts
	 * const hooks = { 'generate:before': (ctx) => console.log(ctx.root) };
	 * ```
	 */
	readonly hooks?: Partial<ImportMapHooks>;
}

export type {
	Config,
	CreateImportMapOptions,
	HookContext,
	ImportMapDocument,
	ImportMapHooks,
	PathOrUrl,
	TargetFilter,
	WriteImportMapOptions,
};
