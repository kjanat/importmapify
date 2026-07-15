import fs from 'node:fs';
import path from 'node:path';
import { expandPattern, isRecord, parsePattern, rebaseTarget, resolveCondition } from './expand.ts';

export interface ImportMapDocument {
	readonly imports: Readonly<Record<string, string>>;
}

export interface CreateImportMapOptions {
	readonly root: string;
	readonly manifest?: string;
	readonly conditions?: readonly string[];
	readonly additionalImports?: Readonly<Record<string, string>>;
	readonly relativeTo?: string;
}

export interface WriteImportMapOptions extends CreateImportMapOptions {
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

export function createImportMap(options: CreateImportMapOptions): ImportMapDocument {
	const manifestPath = path.join(options.root, options.manifest ?? 'package.json');
	const manifest = readManifest(manifestPath);
	const manifestImports = isRecord(manifest.imports) ? manifest.imports : {};
	const conditions = options.conditions?.length ? options.conditions : DEFAULT_CONDITIONS;
	const relativeTo = options.relativeTo ?? options.root;
	const imports: Record<string, string> = {};

	const setImport = (key: string, target: string): void => {
		imports[key] = rebaseTarget(options.root, relativeTo, target);
	};

	for (const [key, rawValue] of Object.entries(manifestImports)) {
		const value = typeof rawValue === 'string' ? rawValue : resolveCondition(rawValue, conditions);
		if (value === undefined) continue;

		const pattern = parsePattern(key, value);
		if (pattern === undefined) {
			setImport(key, value);
			continue;
		}

		const dir = path.join(options.root, pattern.targetDirectory);
		for (const [specifier, target] of Object.entries(expandPattern(pattern, filesUnder(dir)))) {
			setImport(specifier, target);
		}
	}

	for (const [key, value] of Object.entries(options.additionalImports ?? {})) setImport(key, value);

	const sorted = Object.fromEntries(
		Object.entries(imports).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
	return { imports: sorted };
}

export function formatImportMap(map: ImportMapDocument): string {
	return `${JSON.stringify(map, null, '\t')}\n`;
}

export function writeImportMap(options: WriteImportMapOptions): string {
	const out = path.join(options.root, options.out);
	const relativeTo = options.relativeTo ?? path.dirname(out);
	const map = createImportMap({ ...options, relativeTo });
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, formatImportMap(map));
	return out;
}
