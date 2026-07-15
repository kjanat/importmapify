import path from 'node:path';

export interface Pattern {
	readonly keyPrefix: string;
	readonly keySuffix: string;
	readonly targetPrefix: string;
	readonly targetSuffix: string;
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
	return {
		keyPrefix: key.slice(0, keyStar),
		keySuffix: key.slice(keyStar + 1),
		targetPrefix: target.slice(0, targetStar),
		targetSuffix: target.slice(targetStar + 1),
	};
}

export function expandPattern(pattern: Pattern, files: readonly string[]): Record<string, string> {
	const imports: Record<string, string> = {};
	for (const file of files) {
		if (!file.endsWith(pattern.targetSuffix)) continue;
		const star = file.slice(0, file.length - pattern.targetSuffix.length);
		const resolved = `${pattern.targetPrefix}${file}`;
		imports[`${pattern.keyPrefix}${star}${pattern.keySuffix}`] = resolved;
		imports[`${pattern.keyPrefix}${file}`] = resolved;
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
