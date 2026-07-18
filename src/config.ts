import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isRecord } from '#src/expand';
import type { Config, ImportMapHooks, PathOrUrl, TargetFilter, WriteImportMapOptions } from '#src/types';

type PartialOptions = { -readonly [K in keyof WriteImportMapOptions]?: WriteImportMapOptions[K] };
type MutableConfig = PartialOptions & { hooks?: Partial<ImportMapHooks> };

/** Set `key` on `target` unless the value is `undefined`, keeping the key/value pairing type-checked. */
function assign<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
	if (value !== undefined) target[key] = value;
}

const CONFIG_BASENAMES = ['importmapify.config', '.importmapify'] as const;
const CONFIG_EXTENSIONS = ['mjs', 'cjs', 'js', 'ts', 'mts', 'cts'] as const;

/**
 * Find the first config file directly under `root`.
 *
 * Bases are tried in order (`importmapify.config`, then `.importmapify`), each across
 * `.mjs`, `.cjs`, `.js`, then the TypeScript equivalents. The first existing file wins.
 *
 * @param root Directory to search.
 * @returns The config file path, or `undefined` when none exists.
 */
function discoverConfig(root: string): string | undefined {
	for (const base of CONFIG_BASENAMES) {
		for (const ext of CONFIG_EXTENSIONS) {
			const candidate = path.join(root, `${base}.${ext}`);
			if (fs.existsSync(candidate)) return candidate;
		}
	}
}

/**
 * Import a config file and return its default-exported object.
 *
 * Uses the runtime's native module loader, so a `.ts` config requires a runtime that
 * strips types (Bun, Deno, or Node >= 22.6).
 *
 * @param file Config file path.
 * @returns The default export, validated as a plain object.
 * @throws When the file cannot be imported or its default export is not a plain object.
 */
async function loadConfig(file: string): Promise<Readonly<Record<string, unknown>>> {
	let module: unknown;
	try {
		module = await import(pathToFileURL(file).href);
	} catch (cause) {
		throw new Error(
			`Cannot load config at ${file}; a .ts config needs a runtime that strips types (Bun, Deno, or Node >= 22.6)`,
			{ cause },
		);
	}
	const config = isRecord(module) ? module.default : undefined;
	if (!isRecord(config)) throw new Error(`Config at ${file} must have a default export object`);
	return config;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asPath(value: unknown): PathOrUrl | undefined {
	return typeof value === 'string' || value instanceof URL ? value : undefined;
}

function asIndent(value: unknown): string | number | undefined {
	return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] | undefined {
	return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function isTargetFilter(value: unknown): value is TargetFilter {
	return value instanceof RegExp || typeof value === 'function';
}

function asTargetFilters(value: unknown): readonly TargetFilter[] | undefined {
	return Array.isArray(value) && value.every(isTargetFilter) ? value : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return;
	const record: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item !== 'string') return;
		record[key] = item;
	}
	return record;
}

function asScopes(value: unknown): Record<string, Record<string, string>> | undefined {
	if (!isRecord(value)) return;
	const scopes: Record<string, Record<string, string>> = {};
	for (const [prefix, entries] of Object.entries(value)) {
		const record = asStringRecord(entries);
		if (record === undefined) return;
		scopes[prefix] = record;
	}
	return scopes;
}

function resolveRoot(root: PathOrUrl | undefined, configDir: string): PathOrUrl {
	if (root === undefined) return configDir;
	if (typeof root === 'string' && !path.isAbsolute(root) && !root.startsWith('file://')) {
		return path.resolve(configDir, root);
	}
	return root;
}

function isHook<T extends (context: never) => void | Promise<void>>(value: unknown): value is T {
	return typeof value === 'function';
}

function asHooks(value: unknown): Partial<ImportMapHooks> | undefined {
	if (!isRecord(value)) return;
	const hooks: { -readonly [K in keyof ImportMapHooks]?: ImportMapHooks[K] } = {};
	const before = value['generate:before'];
	if (isHook<ImportMapHooks['generate:before']>(before)) hooks['generate:before'] = before;
	const done = value['generate:done'];
	if (isHook<ImportMapHooks['generate:done']>(done)) hooks['generate:done'] = done;
	return hooks['generate:before'] === undefined && hooks['generate:done'] === undefined ? undefined : hooks;
}

/**
 * Parse a raw config object into typed import map options.
 *
 * Only known fields are read. An omitted `root` defaults to the config file's own directory; a relative
 * string `root` resolves against it, so a config can anchor itself with `root: '.'`.
 *
 * @param config Raw default-exported config object.
 * @param configDir Directory containing the config file.
 * @returns The subset of {@link WriteImportMapOptions} the config declares, plus any hooks.
 */
function configToOptions(config: Readonly<Record<string, unknown>>, configDir: string): Config {
	const result: MutableConfig = { root: resolveRoot(asPath(config.root), configDir) };
	assign(result, 'manifest', asString(config.manifest));
	assign(result, 'out', asPath(config.out));
	assign(result, 'indent', asIndent(config.indent));
	assign(result, 'relativeTo', asPath(config.relativeTo));
	assign(result, 'conditions', asStringArray(config.conditions));
	assign(result, 'extensions', asStringArray(config.extensions));
	assign(result, 'filter', asTargetFilters(config.filter));
	assign(result, 'packages', asStringRecord(config.packages));
	assign(result, 'additionalImports', asStringRecord(config.additionalImports));
	assign(result, 'scopes', asScopes(config.scopes));
	assign(result, 'hooks', asHooks(config.hooks));
	return result;
}

/**
 * Merge scope maps, with override entries winning per scope-prefix key.
 *
 * @param base Scopes from the config file.
 * @param overrides Scopes from CLI flags.
 * @returns Combined scopes.
 */
function mergeScopes(
	base: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
	overrides: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
	const result: Record<string, Record<string, string>> = {};
	for (const [prefix, entries] of Object.entries(base ?? {})) result[prefix] = { ...entries };
	for (const [prefix, entries] of Object.entries(overrides)) result[prefix] = { ...result[prefix], ...entries };
	return result;
}

export { assign, configToOptions, discoverConfig, loadConfig, mergeScopes };
