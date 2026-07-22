import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { cwd } from 'node:process';
import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import { assign, configToOptions, discoverConfig, loadConfig, mergeScopes } from '#src/config';
import { DEFAULT_OUT, createImportMap, formatImportMap, resolveOut, toPath } from '#src/map';
import type { Config, HookContext, PathOrUrl, TargetFilter, WriteImportMapOptions } from '#src/types';

const SPACE_COUNT = /^\d+$/;

type Scope = readonly [prefix: string, key: string, value: string];

function asString(raw: unknown): string {
	if (typeof raw !== 'string') throw new Error(`expected a string, got ${typeof raw}`);
	return raw;
}

function parseScope(raw: unknown): Scope {
	const value = asString(raw);
	const separator = value.indexOf('::');
	const eq = value.indexOf('=', separator + 2);
	if (separator <= 0 || eq <= separator + 2 || eq === value.length - 1) {
		throw new Error(`"${value}" is not prefix::key=value`);
	}
	return [value.slice(0, separator), value.slice(separator + 2, eq), value.slice(eq + 1)];
}

function parseIndent(raw: unknown): string | number {
	const value = asString(raw);
	if (value === 'tab') return '\t';
	if (SPACE_COUNT.test(value)) return Number(value);
	throw new Error(`"${value}" is neither a number of spaces nor "tab"`);
}

function parseFilter(raw: unknown): TargetFilter {
	const value = asString(raw);
	try {
		return new RegExp(value);
	} catch (cause) {
		throw new Error(`"${value}" is not a valid regular expression`, { cause });
	}
}

function buildScopes(entries: readonly Scope[]): Record<string, Record<string, string>> {
	const scopes: Record<string, Record<string, string>> = {};
	for (const [scope, key, value] of entries) {
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
	readonly indent?: string | number | undefined;
	readonly condition?: readonly string[] | undefined;
	readonly import?: Readonly<Record<string, string>> | undefined;
	readonly package?: Readonly<Record<string, string>> | undefined;
	readonly ext?: readonly string[] | undefined;
	readonly filter?: readonly TargetFilter[] | undefined;
	readonly scope?: readonly Scope[] | undefined;
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

/** Resolved import map options with the config hooks the CLI runs around generation. */
type ResolvedGenerate = WriteImportMapOptions & { readonly hooks?: Config['hooks'] };

type MutableResolved = { -readonly [K in keyof ResolvedGenerate]?: ResolvedGenerate[K] } & Pick<
	ResolvedGenerate,
	'root' | 'manifest' | 'out' | 'packages' | 'additionalImports' | 'scopes'
>;

/** Resolve final import map options by layering explicit flags over a discovered config over defaults. */
async function resolveGenerateOptions(flags: GenerateFlags): Promise<ResolvedGenerate> {
	const base = await loadConfigOptions(flags.root, flags.config, flags['no-config'] ?? false);
	const conditions = preferArray(flags.condition, base.conditions);
	const extensions = preferArray(flags.ext, base.extensions);
	const filter = preferArray<TargetFilter>(flags.filter, base.filter);
	const options: MutableResolved = {
		root: preferExplicit(flags.root !== cwd(), flags.root, base.root),
		manifest: preferExplicit(flags.manifest !== 'package.json', flags.manifest, base.manifest),
		out: preferExplicit(flags.out !== DEFAULT_OUT, flags.out, base.out),
		packages: { ...base.packages, ...flags.package },
		additionalImports: { ...base.additionalImports, ...flags.import },
		scopes: mergeScopes(base.scopes, buildScopes(flags.scope ?? [])),
	};
	assign(options, 'relativeTo', base.relativeTo);
	assign(options, 'indent', flags.indent ?? base.indent);
	assign(options, 'conditions', conditions);
	assign(options, 'extensions', extensions);
	assign(options, 'filter', filter);
	assign(options, 'hooks', base.hooks);
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
	.flag(
		'manifest',
		flag
			.string({ nonEmpty: true })
			.default('package.json')
			.describe('Manifest path, relative to root.')
			.alias('m'),
	)
	.flag(
		'out',
		flag
			.string({ nonEmpty: true })
			.default(DEFAULT_OUT)
			.describe('Output path resolved against root; relative, absolute, or file:// URL.')
			.alias('o'),
	)
	.flag('indent', flag.custom(parseIndent).describe('Indentation as a number of spaces or the word "tab".'))
	.flag('import', flag.keyValue().describe('Additional import entry as key=value. Repeatable.').alias('i'))
	.flag(
		'package',
		flag
			.keyValue()
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
			.array(flag.custom(parseFilter))
			.describe('Regular expression a pattern target path must match. Repeatable.')
			.alias('f'),
	)
	.flag(
		'scope',
		flag.array(flag.custom(parseScope)).describe('Scoped import as prefix::key=value. Repeatable.').alias('s'),
	)
	.flag(
		'condition',
		flag
			.array(flag.string())
			.describe('Condition to try when a target is a conditional object. Repeatable.')
			.alias('c'),
	)
	.flag('config', flag.string({ nonEmpty: true }).describe('Config file path; skips discovery.').alias('C'))
	.flag('no-config', flag.boolean().describe('Skip config file discovery.'))
	.flag('check', flag.boolean().describe('Exit 1 if the output file is stale instead of writing it.'))
	.flag('stdout', flag.boolean().describe('Print the import map to stdout instead of writing it.'))
	.example(({ name }) => `${name} --stdout`, 'Print the generated import map')
	.example(
		({ name }) =>
			`${name} --package 'dreamcli=jsr:@kjanat/dreamcli@^3' --scope './tests/::dreamcli/testkit=jsr:@kjanat/dreamcli@^3/testkit'`,
		'Add global and test-scoped dependencies',
	)
	.example(
		({ name }) => `${name} --import '#pkg=./package.json' --import 'std/fs=jsr:@std/fs@^1'`,
		'Merge extra entries in after manifest expansion',
	)
	.example(({ name }) => `${name} --check`, 'Fail when the generated file is stale')
	.derive(({ flags }) => {
		if (flags.check && flags.stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}
	})
	.action(async ({ flags, out }) => {
		const { log, status, error, setExitCode } = out;
		const { check, stdout } = flags;

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
			if (actual === text) {
				status(`${outPath} is up to date`);
			} else {
				error(`${outPath} is stale`);
				setExitCode(1);
			}
		} else {
			mkdirSync(dirname(outPath), { recursive: true });
			writeFileSync(outPath, text);
			status(`Wrote ${outPath}`);
		}

		await options.hooks?.['generate:done']?.({ ...hookContext, map });
	});
