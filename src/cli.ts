import type { AnyCommandBuilder } from 'dreamcli';
import { CLIError, command, flag } from 'dreamcli';
import fs from 'node:fs';
import path from 'node:path';
import { createImportMap, formatImportMap, writeImportMap } from './import-map.ts';

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

export const generateCommand: AnyCommandBuilder = command('generate')
	.description('Expand package.json subpath-pattern imports into a Deno import map.')
	.flag(
		'root',
		flag
			.path({ mustExist: true, type: 'directory' })
			.default(process.cwd())
			.describe('Project root containing the manifest.')
			.alias('r'),
	)
	.flag(
		'manifest',
		flag.string().default('package.json').describe('Manifest path, relative to root.').alias('m'),
	)
	.flag(
		'out',
		flag
			.string()
			.default('deno.import_map.json')
			.describe('Output path, relative to root.')
			.alias('o'),
	)
	.flag(
		'import',
		flag
			.array(flag.string())
			.describe('Additional import entry as key=value. Repeatable.')
			.alias('i'),
	)
	.flag(
		'condition',
		flag
			.array(flag.string())
			.describe('Condition to try when a target is a conditional object. Repeatable.')
			.alias('c'),
	)
	.flag(
		'check',
		flag.boolean().describe('Exit 1 if the output file is stale instead of writing it.'),
	)
	.flag('stdout', flag.boolean().describe('Print the import map to stdout instead of writing it.'))
	.action(({ flags, out }) => {
		if (flags.check && flags.stdout) {
			throw new CLIError('--check and --stdout are mutually exclusive', {
				code: 'conflicting-flags',
				exitCode: 2,
			});
		}

		const root = flags.root;
		const outPath = path.join(root, flags.out);
		const relativeTo = path.dirname(outPath);
		const additionalImports = Object.fromEntries((flags.import ?? []).map(parseKeyValue));
		const options = {
			root,
			manifest: flags.manifest,
			conditions: flags.condition,
			additionalImports,
			relativeTo,
		};

		if (flags.stdout) {
			out.log(formatImportMap(createImportMap(options)));
			return;
		}

		if (flags.check) {
			const expected = formatImportMap(createImportMap(options));
			const actual = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : undefined;
			if (actual !== expected) {
				out.error(`${outPath} is stale`);
				out.setExitCode(1);
				return;
			}
			out.log(`${outPath} is up to date`);
			return;
		}

		const written = writeImportMap({ ...options, out: flags.out });
		out.log(`Wrote ${written}`);
	});
