import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandPattern, isRecord, parsePattern, rebaseTarget, resolveCondition } from '#src/expand';
import type {
	Config,
	CreateImportMapOptions,
	ImportMapDocument,
	PathOrUrl,
	TargetFilter,
	WriteImportMapOptions,
} from '#src/types';

const DEFAULT_CONDITIONS = ['import', 'default'] as const;

/** Default output filename for a written import map. */
const DEFAULT_OUT = 'import_map.json';

const SCHEME_PREFIX = /^(jsr|npm):(?!\/)/;

/**
 * Normalize a location to a filesystem path.
 *
 * @param value Path string, `file://` URL string, or {@link URL}.
 * @returns The filesystem path.
 */
function toPath(value: PathOrUrl): string {
	if (typeof value === 'string') return value.startsWith('file://') ? fileURLToPath(value) : value;
	return fileURLToPath(value.href);
}

/**
 * Resolve an output location against a project root.
 *
 * @param root Project root directory.
 * @param out Output location, relative or absolute.
 * @returns The absolute output path.
 */
function resolveOut(root: PathOrUrl, out: PathOrUrl): string {
	return path.resolve(toPath(root), toPath(out));
}

function filesUnder(dir: string, prefix = ''): string[] {
	if (!fs.existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) files.push(...filesUnder(path.join(dir, entry.name), rel));
		else files.push(rel);
	}
	return files;
}

function readManifest(manifestPath: string): Readonly<Record<string, unknown>> {
	let raw: string;
	try {
		raw = fs.readFileSync(manifestPath, 'utf8');
	} catch (cause) {
		throw new Error(`Cannot read manifest at ${manifestPath}`, { cause });
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		throw new Error(`Cannot parse manifest at ${manifestPath} as JSON`, { cause });
	}
	if (!isRecord(parsed)) throw new Error(`Manifest at ${manifestPath} must be a JSON object`);
	return parsed;
}

function matcherKeeps(matcher: TargetFilter, target: string): boolean {
	return matcher instanceof RegExp ? matcher.test(target) : matcher(target);
}

/**
 * Build a predicate deciding whether a candidate target survives: its extension must be in the
 * whitelist (if any extensions are given), and every {@link TargetFilter} must also accept it.
 */
function targetFilter(
	extensions: readonly string[],
	filters: readonly TargetFilter[],
): (target: string) => boolean {
	const allowed = new Set(extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)));
	return (target) =>
		(allowed.size === 0 || allowed.has(path.extname(target))) &&
		filters.every((matcher) => matcherKeeps(matcher, target));
}

interface ExpansionOptions {
	readonly conditions: readonly string[];
	readonly extensions: readonly string[];
	readonly filter: readonly TargetFilter[];
}

function expandManifestImport(
	root: string,
	key: string,
	rawValue: unknown,
	{ conditions, extensions, filter }: ExpansionOptions,
): Readonly<Record<string, string>> {
	const value = typeof rawValue === 'string' ? rawValue : resolveCondition(rawValue, conditions);
	if (value === undefined) return {};
	const pattern = parsePattern(key, value);
	if (pattern === undefined) return { [key]: value };
	const dir = path.join(root, pattern.targetDirectory);
	const expanded = expandPattern(pattern, filesUnder(dir));
	if (extensions.length === 0 && filter.length === 0) return expanded;
	const keep = targetFilter(extensions, filter);
	const filtered: Record<string, string> = {};
	for (const [specifier, target] of Object.entries(expanded)) {
		if (keep(target)) filtered[specifier] = target;
	}
	return filtered;
}

function keyBaseLength(key: string): number {
	const star = key.indexOf('*');
	return star === -1 ? key.length : star + 1;
}

/**
 * Order two manifest import keys by Node's subpath specificity: an exact key beats a pattern, a longer
 * prefix before `*` beats a shorter one, and a longer key breaks a remaining tie. Negative means `a` wins.
 */
function keySpecificity(a: string, b: string): number {
	const aExact = !a.includes('*');
	const bExact = !b.includes('*');
	if (aExact !== bExact) return aExact ? -1 : 1;
	const baseDelta = keyBaseLength(b) - keyBaseLength(a);
	return baseDelta === 0 ? b.length - a.length : baseDelta;
}

function expandManifest(
	root: string,
	relativeTo: string,
	manifestImports: Readonly<Record<string, unknown>>,
	expansion: ExpansionOptions,
): Record<string, string> {
	const imports: Record<string, string> = {};
	const source: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(manifestImports)) {
		for (const [specifier, target] of Object.entries(expandManifestImport(root, key, rawValue, expansion))) {
			const incumbent = source[specifier];
			if (incumbent === undefined || keySpecificity(key, incumbent) < 0) {
				imports[specifier] = rebaseTarget(root, relativeTo, target);
				source[specifier] = key;
			}
		}
	}
	return imports;
}

function collectAdditional(options: CreateImportMapOptions): Record<string, string> {
	const entries: Record<string, string> = {};
	for (const [name, target] of Object.entries(options.packages ?? {})) {
		Object.assign(entries, packageEntries(name, target));
	}
	Object.assign(entries, options.additionalImports ?? {});
	return entries;
}

function buildScopes(
	root: string,
	relativeTo: string,
	rawScopes: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Readonly<Record<string, string>>> {
	const scopes: Record<string, Readonly<Record<string, string>>> = {};
	for (const [scope, mappings] of Object.entries(rawScopes)) {
		const rebasedMappings: Record<string, string> = {};
		for (const [key, value] of Object.entries(mappings)) {
			rebasedMappings[key] = rebaseTarget(root, relativeTo, value);
		}
		scopes[rebaseScopePrefix(root, relativeTo, scope)] = sortEntries(rebasedMappings);
	}
	return scopes;
}

function sortEntries<T>(entries: Readonly<Record<string, T>>): Record<string, T> {
	return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function rebaseScopePrefix(root: string, relativeTo: string, scope: string): string {
	const rebased = rebaseTarget(root, relativeTo, scope);
	return scope.endsWith('/') && !rebased.endsWith('/') ? `${rebased}/` : rebased;
}

/**
 * Expand a package's exact and patterned `imports` into a Deno import map.
 *
 * Pattern targets are matched against files below {@link CreateImportMapOptions.root | root}.
 * Conditional targets use the configured condition order, and additional imports are applied last.
 *
 * @example
 * ```ts
 * // Generate entries for the current project.
 * import { createImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const map = createImportMap({
 *   root: Deno.cwd(),
 *   conditions: ['deno', 'import', 'default'],
 * });
 *
 * console.log(map.imports['#lib/bytes']);
 * ```
 *
 * @param options Project, manifest, condition, and rebasing options.
 * @returns A sorted import map document.
 */
function createImportMap(options: CreateImportMapOptions): ImportMapDocument {
	const root = toPath(options.root);
	const manifestPath = path.join(root, options.manifest ?? 'package.json');
	const manifest = readManifest(manifestPath);
	const manifestImports = isRecord(manifest.imports) ? manifest.imports : {};
	const conditions =
		options.conditions !== undefined && options.conditions.length > 0 ? options.conditions : DEFAULT_CONDITIONS;
	const relativeTo = options.relativeTo === undefined ? root : toPath(options.relativeTo);
	const expansion: ExpansionOptions = {
		conditions,
		extensions: options.extensions ?? [],
		filter: options.filter ?? [],
	};
	const imports = expandManifest(root, relativeTo, manifestImports, expansion);

	for (const [key, value] of Object.entries(collectAdditional(options))) {
		imports[key] = rebaseTarget(root, relativeTo, value);
	}

	const scopes = buildScopes(root, relativeTo, options.scopes ?? {});

	const sortedImports = sortEntries(imports);
	const sortedScopes = sortEntries(scopes);
	return Object.keys(sortedScopes).length === 0
		? { imports: sortedImports }
		: { imports: sortedImports, scopes: sortedScopes };
}

/**
 * Serialize an import map as stable JSON with a trailing newline.
 *
 * @example
 * ```ts
 * // Format an import map for stdout, indented with two spaces.
 * import { formatImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const text = formatImportMap({ imports: { '#config': './src/config.ts' } }, 2);
 *
 * console.log(text);
 * ```
 *
 * @param map Import map to serialize.
 * @param indent Indentation with `JSON.stringify` space semantics; defaults to a tab.
 * @returns Formatted JSON ready to print or write.
 */
function formatImportMap(map: ImportMapDocument, indent: string | number = '\t'): string {
	return `${JSON.stringify(map, null, indent)}\n`;
}

/**
 * Create an import map and write it to disk, creating parent directories as needed.
 *
 * Relative targets are automatically rebased from the project root to the output directory.
 *
 * @example
 * ```ts
 * // Write the conventional Deno import map file.
 * import { writeImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const output = writeImportMap({ root: Deno.cwd() });
 *
 * console.log(`Wrote ${output}`);
 * ```
 *
 * @param options Creation options plus the optional output path.
 * @returns The absolute path of the written file.
 */
function writeImportMap(options: WriteImportMapOptions): string {
	const out = resolveOut(options.root, options.out ?? DEFAULT_OUT);
	const relativeTo = options.relativeTo ?? path.dirname(out);
	const map = createImportMap({ ...options, relativeTo });
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, formatImportMap(map, options.indent));
	return out;
}

function directoryTarget(target: string): string {
	const slashed = target.endsWith('/') ? target : `${target}/`;
	return slashed.replace(SCHEME_PREFIX, '$1:/');
}

/**
 * Build the two import map entries a package needs to resolve both itself and its subpaths.
 *
 * Deno's `importMap` resolution requires a trailing-slash entry for subpath imports, and a
 * `jsr:` or `npm:` trailing-slash target only resolves in the `jsr:/` or `npm:/` form.
 *
 * @example
 * ```ts
 * import { packageEntries } from 'jsr:@kjanat/importmapify';
 *
 * packageEntries('@std/async', 'jsr:@std/async@^1.0.0');
 * // { '@std/async': 'jsr:@std/async@^1.0.0', '@std/async/': 'jsr:/@std/async@^1.0.0/' }
 * ```
 *
 * @param name Bare package specifier.
 * @param target Exact target for {@link name}.
 * @returns The bare entry and its trailing-slash subpath entry.
 */
function packageEntries(name: string, target: string): Record<string, string> {
	return { [name]: target, [`${name}/`]: directoryTarget(target) };
}

/**
 * Type an import map configuration for export and reuse, then pass it to {@link createImportMap} or
 * {@link writeImportMap}. Returns its input unchanged; it exists only for inference and autocomplete.
 *
 * @example
 * ```ts
 * import { defineConfig, writeImportMap } from 'jsr:@kjanat/importmapify';
 *
 * export const config = defineConfig({
 *   root: import.meta.dirname,
 *   packages: { dreamcli: 'jsr:@kjanat/dreamcli@^3' },
 * });
 *
 * writeImportMap(config);
 * ```
 *
 * @example
 * ```ts
 * // Config file with a build hook: generate:before runs before the CLI scans.
 * import { execSync } from 'node:child_process';
 * import { defineConfig } from 'jsr:@kjanat/importmapify';
 *
 * export default defineConfig({
 *   hooks: {
 *     'generate:before': () => execSync('deno task build', { stdio: 'inherit' }),
 *   },
 * });
 * ```
 *
 * @param config Import map configuration; every field is optional.
 * @returns The same {@linkcode config} value with its exact type preserved, so a config that includes {@linkcode CreateImportMapOptions.root} stays
 * assignable to {@link writeImportMap} while one that omits it is still a valid config file.
 */
function defineConfig<T extends Config>(config: T): T {
	return config;
}

export {
	DEFAULT_OUT,
	createImportMap,
	defineConfig,
	formatImportMap,
	packageEntries,
	resolveOut,
	toPath,
	writeImportMap,
};
