import fs from 'node:fs';
import path from 'node:path';
import { expandPattern, isRecord, parsePattern, rebaseTarget, resolveCondition } from './expand.ts';

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
	/** Explicit entries merged after manifest imports, overriding duplicate keys. */
	readonly additionalImports?: Readonly<Record<string, string>>;
	/** Scope-specific import overrides keyed by scope prefix. */
	readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/** Directory against which relative targets are rebased. Defaults to {@link root}. */
	readonly relativeTo?: string;
}

/** Options for creating and writing an import map. */
interface WriteImportMapOptions extends CreateImportMapOptions {
	/** Output path relative to {@link CreateImportMapOptions.root | root}. */
	readonly out: string;
}

const DEFAULT_CONDITIONS = ['import', 'default'] as const;

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

function expandManifestImport(
	root: string,
	key: string,
	rawValue: unknown,
	conditions: readonly string[],
): Readonly<Record<string, string>> {
	const value = typeof rawValue === 'string' ? rawValue : resolveCondition(rawValue, conditions);
	if (value === undefined) return {};
	const pattern = parsePattern(key, value);
	if (pattern === undefined) return { [key]: value };
	const dir = path.join(root, pattern.targetDirectory);
	return expandPattern(pattern, filesUnder(dir));
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
 * @example Generate entries for the current project.
 * ```ts
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
	const imports: Record<string, string> = {};

	for (const [key, rawValue] of Object.entries(manifestImports)) {
		const expanded = expandManifestImport(options.root, key, rawValue, conditions);
		for (const [specifier, target] of Object.entries(expanded)) {
			imports[specifier] = rebaseTarget(options.root, relativeTo, target);
		}
	}

	for (const [key, value] of Object.entries(options.additionalImports ?? {})) {
		imports[key] = rebaseTarget(options.root, relativeTo, value);
	}

	const scopes: Record<string, Readonly<Record<string, string>>> = {};
	for (const [scope, mappings] of Object.entries(options.scopes ?? {})) {
		const rebasedMappings: Record<string, string> = {};
		for (const [key, value] of Object.entries(mappings)) {
			rebasedMappings[key] = rebaseTarget(options.root, relativeTo, value);
		}
		scopes[rebaseScopePrefix(options.root, relativeTo, scope)] = sortEntries(rebasedMappings);
	}

	const sortedImports = sortEntries(imports);
	const sortedScopes = Object.fromEntries(Object.entries(scopes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
	return Object.keys(sortedScopes).length === 0
		? { imports: sortedImports }
		: { imports: sortedImports, scopes: sortedScopes };
}

/**
 * Serialize an import map as stable, tab-indented JSON with a trailing newline.
 *
 * @example Format an import map for stdout.
 * ```ts
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
 * @example Write the conventional Deno import map file.
 * ```ts
 * import { writeImportMap } from 'jsr:@kjanat/importmapify';
 *
 * const output = writeImportMap({
 *   root: Deno.cwd(),
 *   out: 'deno.import_map.json',
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

export type { CreateImportMapOptions, ImportMapDocument, WriteImportMapOptions };
export { createImportMap, formatImportMap, writeImportMap };
