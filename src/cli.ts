import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import { createImportMap, formatImportMap, writeImportMap } from './map.ts';

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
	.flag('out', flag.string().default('import_map.json').describe('Output path, relative to root.').alias('o'))
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
	.flag('scope', flag.array(flag.string()).describe('Scoped import as prefix::key=value. Repeatable.').alias('s'))
	.flag(
		'condition',
		flag
			.array(flag.string())
			.describe('Condition to try when a target is a conditional object. Repeatable.')
			.alias('c'),
	)
	.flag('check', flag.boolean().describe('Exit 1 if the output file is stale instead of writing it.'))
	.flag('stdout', flag.boolean().describe('Print the import map to stdout instead of writing it.'))
	.example('importmapify --stdout', 'Print the generated import map')
	.example(
		`importmapify --package 'dreamcli=jsr:@kjanat/dreamcli@^3' --scope './tests/::dreamcli/testkit=jsr:@kjanat/dreamcli@^3/testkit'`,
		'Add global and test-scoped dependencies',
	)
	.example('importmapify --check', 'Fail when the generated file is stale')
	.action(({ flags, out }) => {
		const { log, error, setExitCode } = out;
		const {
			check,
			stdout,
			root,
			manifest,
			condition: cdts,
			out: of,
			import: imf,
			package: pkf,
			ext: exf,
			scope: scf,
		} = flags;

		if (check && stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}

		const outPath = join(root, of);
		const relativeTo = dirname(outPath);
		const packages = parseEntries(pkf ?? [], 'package', 'invalid-package-flag');
		const additionalImports = parseEntries(imf ?? [], 'import', 'invalid-import-flag');
		const scopes = buildScopes(scf ?? []);
		const options = {
			root,
			manifest,
			conditions: cdts,
			packages,
			additionalImports,
			scopes,
			relativeTo,
			extensions: exf,
		};

		if (stdout) {
			log(formatImportMap(createImportMap(options)));
			return;
		}

		if (check) {
			const expected = formatImportMap(createImportMap(options));
			const actual = existsSync(outPath) ? readFileSync(outPath, 'utf8') : undefined;
			if (actual !== expected) {
				error(`${outPath} is stale`);
				setExitCode(1);
				return;
			}
			log(`${outPath} is up to date`);
			return;
		}

		const written = writeImportMap({ ...options, out: of });
		log(`Wrote ${written}`);
	});
