import path from 'node:path';

export interface Pattern {
	readonly keyPrefix: string;
	readonly keySuffix: string;
	readonly targetDirectory: string;
	readonly targetPrefix: string;
	readonly targetSuffix: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetMatcher(pattern: Pattern): RegExp {
	const suffixParts = pattern.targetSuffix.split('*');
	const firstSuffix = suffixParts[0] ?? '';
	const repeatedSuffixes = suffixParts
		.slice(1)
		.map((suffix) => `\\k<wildcard>${escapeRegExp(suffix)}`)
		.join('');
	return new RegExp(
		`^${escapeRegExp(pattern.targetPrefix)}(?<wildcard>.*)${escapeRegExp(firstSuffix)}${repeatedSuffixes}$`,
	);
}

export function parsePattern(key: string, target: string): Pattern | undefined {
	const keyStar = key.indexOf('*');
	const targetStar = target.indexOf('*');
	if (keyStar === -1 && targetStar === -1) return undefined;
	if (keyStar === -1 || targetStar === -1) {
		throw new Error(
			`Import pattern mismatch: "${key}" -> "${target}"; both sides must contain "*", or neither should.`,
		);
	}
	const targetPrefix = target.slice(0, targetStar);
	const targetDirectory = targetPrefix.endsWith('/')
		? targetPrefix.slice(0, -1)
		: path.posix.dirname(targetPrefix);
	return {
		keyPrefix: key.slice(0, keyStar),
		keySuffix: key.slice(keyStar + 1),
		targetDirectory: targetDirectory === '' ? '.' : targetDirectory,
		targetPrefix,
		targetSuffix: target.slice(targetStar + 1),
	};
}

export function expandPattern(pattern: Pattern, files: readonly string[]): Record<string, string> {
	const imports: Record<string, string> = {};
	const matcher = targetMatcher(pattern);
	const targetBase = pattern.targetDirectory === '.' ? './' : `${pattern.targetDirectory}/`;
	for (const file of files) {
		const target = `${targetBase}${file}`;
		const wildcard = matcher.exec(target)?.groups?.wildcard;
		if (wildcard === undefined) continue;
		imports[`${pattern.keyPrefix}${wildcard}${pattern.keySuffix}`] = target;
		imports[`${pattern.keyPrefix}${file}`] = target;
	}
	return imports;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolveCondition(
	value: unknown,
	conditions: readonly string[],
): string | undefined {
	if (typeof value === 'string') return value;
	if (!isRecord(value)) return undefined;
	for (const condition of conditions) {
		if (!(condition in value)) continue;
		const resolved = resolveCondition(value[condition], conditions);
		if (resolved !== undefined) return resolved;
	}
	return undefined;
}

export function isRebasableTarget(target: string): boolean {
	return target.startsWith('./') || target.startsWith('../');
}

export function rebaseTarget(root: string, relativeTo: string, target: string): string {
	if (!isRebasableTarget(target)) return target;
	const absolute = path.resolve(root, target);
	const relative = path.relative(relativeTo, absolute).split(path.sep).join('/');
	return relative.startsWith('.') ? relative : `./${relative}`;
}
