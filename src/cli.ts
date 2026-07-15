import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import { createImportMap, formatImportMap, writeImportMap } from '#src/map';

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
	.flag(
		'condition',
		flag
			.array(flag.string())
			.describe('Condition to try when a target is a conditional object. Repeatable.')
			.alias('c'),
	)
	.flag('check', flag.boolean().describe('Exit 1 if the output file is stale instead of writing it.'))
	.flag('stdout', flag.boolean().describe('Print the import map to stdout instead of writing it.'))
	.action(({ flags, out }) => {
		const { log, error, setExitCode } = out;
		const { check, stdout, root, manifest, condition: cdts, out: of, import: imf } = flags;

		if (check && stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}

		const outPath = join(root, of);
		const relativeTo = dirname(outPath);
		const additionalImports = Object.fromEntries((imf ?? []).map(parseKeyValue));
		const options = { root, manifest, conditions: cdts, additionalImports, relativeTo };

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
