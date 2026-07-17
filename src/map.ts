import fs from 'node:fs';
import path from 'node:path';
import { expandPattern, isRecord, parsePattern, rebaseTarget, resolveCondition } from '#src/expand.ts';

/** A deterministic Deno import map generated from package import entries. */
interface ImportMapDocument {
	/** Exact specifier-to-target mappings, sorted by specifier. */
	readonly imports: Readonly<Record<string, string>>;
	/** Scope prefixes mapped to sorted, scope-specific import overrides. */
	readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Options for creating an import map without writing it to disk. */
interface CreateImportMapOptions {
	/** Project directory containing the package manifest. */
	readonly root: string;
	/** Manifest path relative to {@link root}. Defaults to `package.json`. */
	readonly manifest?: string;
	/** Conditional import keys to try in order. Defaults to `import`, then `default`. */
	readonly conditions?: readonly string[];
	/** Package specifiers mapped to targets, each expanded to a conformant bare and trailing-slash pair. */
	readonly packages?: Readonly<Record<string, string>>;
	/** Explicit entries merged after manifest imports and packages, overriding duplicate keys. */
	readonly additionalImports?: Readonly<Record<string, string>>;
	/** Scope-specific import overrides keyed by scope prefix. */
	readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/** Directory against which relative targets are rebased. Defaults to {@link root}. */
	readonly relativeTo?: string;
	/** File extensions, with or without a leading dot, that pattern targets may match. Unset matches every file. */
	readonly extensions?: readonly string[];
}

/** Options for creating and writing an import map. */
interface WriteImportMapOptions extends CreateImportMapOptions {
	/** Output path relative to {@link CreateImportMapOptions.root | root}. */
	readonly out: string;
}

const DEFAULT_CONDITIONS = ['import', 'default'] as const;
const SCHEME_PREFIX = /^(jsr|npm):(?!\/)/;

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

function extensionFilter(extensions: readonly string[]): (file: string) => boolean {
	const allowed = new Set(extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)));
	return (file) => allowed.has(path.extname(file));
}

interface ExpansionOptions {
	readonly conditions: readonly string[];
	readonly extensions: readonly string[];
}

function expandManifestImport(
	root: string,
	key: string,
	rawValue: unknown,
	{ conditions, extensions }: ExpansionOptions,
): Readonly<Record<string, string>> {
	const value = typeof rawValue === 'string' ? rawValue : resolveCondition(rawValue, conditions);
	if (value === undefined) return {};
	const pattern = parsePattern(key, value);
	if (pattern === undefined) return { [key]: value };
	const dir = path.join(root, pattern.targetDirectory);
	const files = filesUnder(dir);
	return expandPattern(pattern, extensions.length > 0 ? files.filter(extensionFilter(extensions)) : files);
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

function sortEntries(entries: Readonly<Record<string, string>>): Record<string, string> {
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
	const manifestPath = path.join(options.root, options.manifest ?? 'package.json');
	const manifest = readManifest(manifestPath);
	const manifestImports = isRecord(manifest.imports) ? manifest.imports : {};
	const conditions =
		options.conditions !== undefined && options.conditions.length > 0 ? options.conditions : DEFAULT_CONDITIONS;
	const relativeTo = options.relativeTo ?? options.root;
	const expansion: ExpansionOptions = { conditions, extensions: options.extensions ?? [] };
	const imports = expandManifest(options.root, relativeTo, manifestImports, expansion);

	for (const [key, value] of Object.entries(collectAdditional(options))) {
		imports[key] = rebaseTarget(options.root, relativeTo, value);
	}

	const scopes = buildScopes(options.root, relativeTo, options.scopes ?? {});

	const sortedImports = sortEntries(imports);
	const sortedScopes = Object.fromEntries(Object.entries(scopes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
	return Object.keys(sortedScopes).length === 0
		? { imports: sortedImports }
		: { imports: sortedImports, scopes: sortedScopes };
}

/**
 * Serialize an import map as stable, tab-indented JSON with a trailing newline.
 *
 * @example
 * ```ts
 * // Format an import map for stdout.
 * import { formatImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const text = formatImportMap({
 *   imports: { '#config': './src/config.ts' },
 * });
 *
 * console.log(text);
 * ```
 *
 * @param map Import map to serialize.
 * @returns Formatted JSON ready to print or write.
 */
function formatImportMap(map: ImportMapDocument): string {
	return `${JSON.stringify(map, null, '\t')}\n`;
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
 * const output = writeImportMap({
 *   root: Deno.cwd(),
 *   out: 'import_map.json',
 * });
 *
 * console.log(`Wrote ${output}`);
 * ```
 *
 * @param options Creation options plus the output path.
 * @returns The absolute path of the written file.
 */
function writeImportMap(options: WriteImportMapOptions): string {
	const out = path.join(options.root, options.out);
	const relativeTo = options.relativeTo ?? path.dirname(out);
	const map = createImportMap({ ...options, relativeTo });
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, formatImportMap(map));
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

export type { CreateImportMapOptions, ImportMapDocument, WriteImportMapOptions };
export { createImportMap, formatImportMap, packageEntries, writeImportMap };
