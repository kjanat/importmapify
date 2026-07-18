import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argv, cwd } from 'node:process';
import { bold, cyan } from 'ansispeck';
import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import { configToOptions, discoverConfig, loadConfig, mergeScopes } from '#src/config';
import { DEFAULT_OUT, createImportMap, formatImportMap, resolveOut, toPath } from '#src/map';
import type { Config, HookContext, PathOrUrl, TargetFilter, WriteImportMapOptions } from '#src/types';

const EXAMPLE_TOKEN = /(?:'[^']*'|"[^"]*"|\S)+/g;
const SPACE_COUNT = /^\d+$/;
const FLAG_ARGS = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv;
const JSON_MODE = FLAG_ARGS.includes('--json');

// dreamcli renders example commands unstyled (kjanat/dreamcli#65); styling is baked in here, so skip
// it under --json to keep the serialized schema free of escape codes.
function highlightExample(example: string): string {
	if (JSON_MODE) return example;
	const tokens = example.match(EXAMPLE_TOKEN);
	if (tokens === null) return example;
	return tokens
		.map((token, index) => (index === 0 ? bold(token) : token.startsWith('-') ? cyan(token) : token))
		.join(' ');
}

function parseKeyValue(raw: string, flagName: string, code: string): readonly [string, string] {
	const eq = raw.indexOf('=');
	if (eq === -1) {
		throw new CLIError(`--${flagName} expects key=value, got "${raw}"`, { code, exitCode: 2 });
	}
	return [raw.slice(0, eq), raw.slice(eq + 1)];
}

function parseScope(raw: string): readonly [string, string, string] {
	const separator = raw.indexOf('::');
	const eq = raw.indexOf('=', separator + 2);
	if (separator <= 0 || eq <= separator + 2 || eq === raw.length - 1) {
		throw new CLIError(`--scope expects prefix::key=value, got "${raw}"`, {
			code: 'invalid-scope-flag',
			exitCode: 2,
		});
	}
	return [raw.slice(0, separator), raw.slice(separator + 2, eq), raw.slice(eq + 1)];
}

function parseEntries(raws: readonly string[], flagName: string, code: string): Record<string, string> {
	const entries: Record<string, string> = {};
	for (const raw of raws) {
		const [key, value] = parseKeyValue(raw, flagName, code);
		entries[key] = value;
	}
	return entries;
}

function buildScopes(raws: readonly string[]): Record<string, Record<string, string>> {
	const scopes: Record<string, Record<string, string>> = {};
	for (const raw of raws) {
		const [scope, key, value] = parseScope(raw);
		const mappings = scopes[scope];
		if (mappings === undefined) scopes[scope] = { [key]: value };
		else mappings[key] = value;
	}
	return scopes;
}

interface GenerateFlags {
	readonly root: string;
	readonly manifest: string;
	readonly out: string;
	readonly indent?: string | undefined;
	readonly condition?: readonly string[] | undefined;
	readonly import?: readonly string[] | undefined;
	readonly package?: readonly string[] | undefined;
	readonly ext?: readonly string[] | undefined;
	readonly filter?: readonly string[] | undefined;
	readonly scope?: readonly string[] | undefined;
	readonly config?: string | undefined;
	readonly 'no-config'?: boolean | undefined;
}

async function loadConfigOptions(
	searchRoot: string,
	configFlag: string | undefined,
	noConfig: boolean,
): Promise<Config> {
	if (noConfig) return {};
	const file = configFlag ?? discoverConfig(searchRoot);
	if (file === undefined) return {};
	if (!existsSync(file)) {
		throw new CLIError(`Config file not found: ${file}`, { code: 'config-not-found', exitCode: 2 });
	}
	try {
		return configToOptions(await loadConfig(file), dirname(file));
	} catch (cause) {
		throw new CLIError(cause instanceof Error ? cause.message : `Cannot load config at ${file}`, {
			code: 'config-load-failed',
			exitCode: 2,
			cause,
		});
	}
}

/** Explicitly-passed flag value wins; otherwise the config value, otherwise the flag default. */
function preferExplicit<T extends PathOrUrl>(
	explicit: boolean,
	flagValue: string,
	configValue: T | undefined,
): string | T {
	return explicit ? flagValue : (configValue ?? flagValue);
}

/** A non-empty flag array wins over the config value. */
function preferArray<T>(
	flagValue: readonly T[] | undefined,
	configValue: readonly T[] | undefined,
): readonly T[] | undefined {
	return flagValue !== undefined && flagValue.length > 0 ? flagValue : configValue;
}

function parseIndent(raw: string): string | number {
	if (raw === 'tab') return '\t';
	if (SPACE_COUNT.test(raw)) return Number(raw);
	throw new CLIError(`--indent expects a number of spaces or "tab", got "${raw}"`, {
		code: 'invalid-indent-flag',
		exitCode: 2,
	});
}

function compileFilters(raws: readonly string[]): readonly RegExp[] {
	return raws.map((raw) => {
		try {
			return new RegExp(raw);
		} catch (cause) {
			throw new CLIError(`--filter expects a valid regular expression, got "${raw}"`, {
				code: 'invalid-filter-flag',
				exitCode: 2,
				cause,
			});
		}
	});
}

/** Resolved import map options with the config hooks the CLI runs around generation. */
type ResolvedGenerate = WriteImportMapOptions & { readonly hooks?: Config['hooks'] };

/** Resolve final import map options by layering explicit flags over a discovered config over defaults. */
async function resolveGenerateOptions(flags: GenerateFlags): Promise<ResolvedGenerate> {
	const base = await loadConfigOptions(flags.root, flags.config, flags['no-config'] ?? false);
	const conditions = preferArray(flags.condition, base.conditions);
	const extensions = preferArray(flags.ext, base.extensions);
	const filter = preferArray<TargetFilter>(
		flags.filter === undefined ? undefined : compileFilters(flags.filter),
		base.filter,
	);
	const indent = flags.indent === undefined ? base.indent : parseIndent(flags.indent);
	const options: {
		root: PathOrUrl;
		manifest: string;
		out: PathOrUrl;
		indent?: string | number;
		relativeTo?: PathOrUrl;
		conditions?: readonly string[];
		extensions?: readonly string[];
		filter?: readonly TargetFilter[];
		packages: Record<string, string>;
		additionalImports: Record<string, string>;
		scopes: Record<string, Record<string, string>>;
		hooks?: Config['hooks'];
	} = {
		root: preferExplicit(flags.root !== cwd(), flags.root, base.root),
		manifest: preferExplicit(flags.manifest !== 'package.json', flags.manifest, base.manifest),
		out: preferExplicit(flags.out !== DEFAULT_OUT, flags.out, base.out),
		packages: { ...base.packages, ...parseEntries(flags.package ?? [], 'package', 'invalid-package-flag') },
		additionalImports: {
			...base.additionalImports,
			...parseEntries(flags.import ?? [], 'import', 'invalid-import-flag'),
		},
		scopes: mergeScopes(base.scopes, buildScopes(flags.scope ?? [])),
	};
	if (base.relativeTo !== undefined) options.relativeTo = base.relativeTo;
	if (indent !== undefined) options.indent = indent;
	if (conditions !== undefined) options.conditions = conditions;
	if (extensions !== undefined) options.extensions = extensions;
	if (filter !== undefined) options.filter = filter;
	if (base.hooks !== undefined) options.hooks = base.hooks;
	return options;
}

/** DreamCLI command that writes, checks, or prints an expanded Deno import map. */
export const generateCommand: AnyCommandBuilder = command('generate')
	.description('Expand package.json subpath-pattern imports into a Deno import map.')
	.flag(
		'root',
		flag
			.path({ mustExist: true, type: 'directory' })
			.default(cwd())
			.describe('Project root containing the manifest.')
			.alias('r'),
	)
	.flag('manifest', flag.string().default('package.json').describe('Manifest path, relative to root.').alias('m'))
	.flag(
		'out',
		flag
			.string()
			.default(DEFAULT_OUT)
			.describe('Output path resolved against root; relative, absolute, or file:// URL.')
			.alias('o'),
	)
	.flag('indent', flag.string().describe('Indentation as a number of spaces or the word "tab".'))
	.flag(
		'import',
		flag.array(flag.string()).describe('Additional import entry as key=value. Repeatable.').alias('i'),
	)
	.flag(
		'package',
		flag
			.array(flag.string())
			.describe('Package as name=target, expanded to a conformant bare and trailing-slash pair. Repeatable.')
			.alias('p'),
	)
	.flag(
		'ext',
		flag
			.array(flag.string())
			.describe('Restrict pattern matches to these file extensions. Repeatable.')
			.alias('e'),
	)
	.flag(
		'filter',
		flag
			.array(flag.string())
			.describe('Regular expression a pattern target path must match. Repeatable.')
			.alias('f'),
	)
	.flag('scope', flag.array(flag.string()).describe('Scoped import as prefix::key=value. Repeatable.').alias('s'))
	.flag(
		'condition',
		flag
			.array(flag.string())
			.describe('Condition to try when a target is a conditional object. Repeatable.')
			.alias('c'),
	)
	.flag('config', flag.string().describe('Config file path; skips discovery.').alias('C'))
	.flag('no-config', flag.boolean().describe('Skip config file discovery.'))
	.flag('check', flag.boolean().describe('Exit 1 if the output file is stale instead of writing it.'))
	.flag('stdout', flag.boolean().describe('Print the import map to stdout instead of writing it.'))
	.flag('quiet', flag.boolean().describe('Suppress the confirmation message on stderr.').alias('q'))
	.example(highlightExample('importmapify --stdout'), 'Print the generated import map')
	.example(
		highlightExample(
			`importmapify --package 'dreamcli=jsr:@kjanat/dreamcli@^3' --scope './tests/::dreamcli/testkit=jsr:@kjanat/dreamcli@^3/testkit'`,
		),
		'Add global and test-scoped dependencies',
	)
	.example(highlightExample('importmapify --check'), 'Fail when the generated file is stale')
	.action(async ({ flags, out }) => {
		const { log, warn, error, setExitCode } = out;
		const { check, stdout, quiet } = flags;

		if (check && stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}

		const options = await resolveGenerateOptions(flags);
		const outPath = resolveOut(options.root, options.out ?? DEFAULT_OUT);
		const createOptions = { ...options, relativeTo: options.relativeTo ?? dirname(outPath) };
		const hookContext: HookContext = { root: resolve(toPath(options.root)), out: outPath };

		await options.hooks?.['generate:before']?.(hookContext);

		const map = createImportMap(createOptions);
		const text = formatImportMap(map, options.indent);

		if (stdout) {
			log(text);
		} else if (check) {
			const actual = existsSync(outPath) ? readFileSync(outPath, 'utf8') : undefined;
			if (actual !== text) {
				error(`${outPath} is stale`);
				setExitCode(1);
			} else if (!quiet) {
				warn(`${outPath} is up to date`);
			}
		} else {
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, text);
			if (!quiet) warn(`Wrote ${outPath}`);
		}

		await options.hooks?.['generate:done']?.({ ...hookContext, map });
	});
