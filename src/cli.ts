import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import { createImportMap, formatImportMap, writeImportMap } from './map.ts';

function parseKeyValue(raw: string): readonly [string, string] {
	const eq = raw.indexOf('=');
	if (eq === -1) {
		throw new CLIError(`--import expects key=value, got "${raw}"`, {
			code: 'invalid-import-flag',
			exitCode: 2,
		});
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
	.flag('out', flag.string().default('deno.import_map.json').describe('Output path, relative to root.').alias('o'))
	.flag(
		'import',
		flag.array(flag.string()).describe('Additional import entry as key=value. Repeatable.').alias('i'),
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
		`importmapify --import 'dreamcli=jsr:@kjanat/dreamcli@^3' --scope './tests/::dreamcli/testkit=jsr:@kjanat/dreamcli@^3/testkit'`,
		'Add global and test-scoped dependencies',
	)
	.example('importmapify --check', 'Fail when the generated file is stale')
	.action(({ flags, out }) => {
		const { log, error, setExitCode } = out;
		const { check, stdout, root, manifest, condition: cdts, out: of, import: imf, scope: scf } = flags;

		if (check && stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}

		const outPath = join(root, of);
		const relativeTo = dirname(outPath);
		const additionalImports = Object.fromEntries((imf ?? []).map(parseKeyValue));
		const scopes: Record<string, Record<string, string>> = {};
		for (const raw of scf ?? []) {
			const [scope, key, value] = parseScope(raw);
			const mappings = scopes[scope];
			if (mappings === undefined) scopes[scope] = { [key]: value };
			else mappings[key] = value;
		}
		const options = { root, manifest, conditions: cdts, additionalImports, scopes, relativeTo };

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
