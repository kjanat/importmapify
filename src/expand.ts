import path from 'node:path';

/** Parsed wildcard components from a package import key and target. */
interface Pattern {
	/** Key text before its wildcard. */
	readonly keyPrefix: string;
	/** Key text after its wildcard. */
	readonly keySuffix: string;
	/** Nearest static target directory that can be scanned for matching files. */
	readonly targetDirectory: string;
	/** Target text before its first wildcard. */
	readonly targetPrefix: string;
	/** Target text after its first wildcard, including any repeated wildcards. */
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

/**
 * Parse matching wildcards from a package import key and target.
 *
 * @example
 * ```ts
 * parsePattern('#lib/*', './src/lib/*.ts');
 * ```
 *
 * @param key Package import specifier pattern.
 * @param target Filesystem target pattern.
 * @returns Parsed pattern components, or `undefined` when neither side contains a wildcard.
 * @throws When only one side contains a wildcard.
 */
function parsePattern(key: string, target: string): Pattern | undefined {
	const keyStar = key.indexOf('*');
	const targetStar = target.indexOf('*');
	if (keyStar === -1 && targetStar === -1) return;
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

/**
 * Expand a parsed pattern into exact import entries for matching files.
 *
 * @example
 * ```ts
 * const pattern = parsePattern('#lib/*', './src/lib/*.ts');
 * if (pattern) expandPattern(pattern, ['bytes.ts']);
 * ```
 *
 * @param pattern Parsed key and target wildcard components.
 * @param files File paths relative to the pattern's target directory.
 * @returns Exact import specifiers mapped to their source targets.
 */
function expandPattern(pattern: Pattern, files: readonly string[]): Record<string, string> {
	const imports: Record<string, string> = {};
	const matcher = targetMatcher(pattern);
	const targetBase = pattern.targetDirectory === '.' ? './' : `${pattern.targetDirectory}/`;
	for (const file of files) {
		const target = `${targetBase}${file}`;
		const match = matcher.exec(target);
		// biome-ignore lint/suspicious/noUnnecessaryConditions: incorrect. When `: RegExpExecArray | null` is specified explicitly, lint does not fire.
		const wildcard = match?.groups?.wildcard;
		if (wildcard !== undefined) {
			imports[`${pattern.keyPrefix}${wildcard}${pattern.keySuffix}`] = target;
			imports[`${pattern.keyPrefix}${file}`] = target;
		}
	}
	return imports;
}

/**
 * Determine whether a value is a non-array object record.
 *
 * @param value Value to inspect.
 * @returns Whether the value can be safely read as a string-keyed record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve a string target from nested conditional import objects.
 *
 * @param value Exact target or conditional target object.
 * @param conditions Condition names to try in priority order.
 * @returns The first matching string target, or `undefined` when none matches.
 */
function resolveCondition(value: unknown, conditions: readonly string[]): string | undefined {
	if (typeof value === 'string') return value;
	if (!isRecord(value)) return;
	for (const condition of conditions) {
		if (condition in value) {
			const resolved = resolveCondition(value[condition], conditions);
			if (resolved !== undefined) return resolved;
		}
	}
}

/**
 * Determine whether a target is relative and can be rebased.
 *
 * @param target Import target to inspect.
 * @returns Whether the target starts with `./` or `../`.
 */
function isRebasableTarget(target: string): boolean {
	return target.startsWith('./') || target.startsWith('../');
}

/**
 * Rebase a relative import target from the project root to another directory.
 *
 * Bare specifiers and URL-like targets are returned unchanged.
 *
 * @param root Directory against which the original target is resolved.
 * @param relativeTo Directory from which the returned target should resolve.
 * @param target Import target to rebase.
 * @returns A portable slash-separated target.
 */
function rebaseTarget(root: string, relativeTo: string, target: string): string {
	if (!isRebasableTarget(target)) return target;
	const absolute = path.resolve(root, target);
	const relative = path.relative(relativeTo, absolute).split(path.sep).join('/');
	return relative.startsWith('.') ? relative : `./${relative}`;
}

export type { Pattern };
export { expandPattern, isRebasableTarget, isRecord, parsePattern, rebaseTarget, resolveCondition };
