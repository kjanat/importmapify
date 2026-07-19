#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const [docsDir = '.denodocs', nodesPath = 'nodes.json', ref = 'master', assetsDir = 'assets'] =
	process.argv.slice(2);

const HASH_LENGTH = 8;
const CSS_EXT = /\.css$/;
const ENCODED_BYTE = /%(?=[0-9A-Fa-f]{2})/g;
const LOCAL_ENCODED_TARGET = /(["'/])((?:[^"'<>\s]*%[0-9A-Fa-f]{2})+[^"'<>\s]*\.html)/g;
const MEMBER_PREFIX = /^(property|method|call_signature|constructor)_/;

const CLOSE_ON_MOBILE =
	'<script>if(matchMedia("(width < 1024px)").matches)for(const d of document.querySelectorAll("details.catNav"))d.open=false</script>';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const root = process.cwd();

copyFileSync(path.join(assetsDir, 'favicon.svg'), path.join(docsDir, 'favicon.svg'));
copyFileSync(path.join(assetsDir, 'docs-patch.css'), path.join(docsDir, 'docs-patch.css'));

const cssRenames = new Map();
for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
	if (entry.isFile() && entry.name.endsWith('.css')) {
		const source = path.join(docsDir, entry.name);
		const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, HASH_LENGTH);
		const hashed = entry.name.replace(CSS_EXT, `.${hash}.css`);
		renameSync(source, path.join(docsDir, hashed));
		cssRenames.set(entry.name, hashed);
	}
}

const symbols = new Map();
const doc = JSON.parse(readFileSync(nodesPath, 'utf8'));
for (const module of Object.values(doc.nodes)) {
	for (const symbol of module.symbols ?? []) {
		const declaration = symbol.declarations?.[0];
		if (declaration?.location !== undefined) {
			const members = new Map();
			const def = declaration.def ?? {};
			for (const member of [...(def.properties ?? []), ...(def.methods ?? []), ...(def.constructors ?? [])]) {
				if (member.location) members.set(normalize(member.name), member.location);
			}
			symbols.set(normalize(symbol.name), { location: declaration.location, members });
		}
	}
}

function normalize(name) {
	return decodeURIComponent(name).toLowerCase();
}

function permalink(location) {
	const file = path.relative(root, fileURLToPath(location.filename)).split(path.sep).join('/');
	return `${repo}/blob/${ref}/${file}#L${location.line + 1}`;
}

function resolveLocation(symbolId, memberId) {
	const symbolPath = normalize(symbolId.slice('symbol_'.length)).split('.');
	const symbol = symbols.get(symbolPath[0]);
	if (symbol === undefined) return;
	const fromPage = symbolPath.length > 1 ? symbol.members.get(symbolPath.slice(1).join('.')) : undefined;
	if (memberId === undefined) return fromPage ?? symbol.location;
	const memberName = normalize(memberId.replace(MEMBER_PREFIX, ''));
	return symbol.members.get(memberName) ?? fromPage ?? symbol.location;
}

function escapeEncodedTarget(href) {
	return href.startsWith('http') || !href.includes('.html') ? href : href.replace(ENCODED_BYTE, '%25');
}

function hashCssHref(href) {
	for (const [plain, hashed] of cssRenames) {
		if (href === plain) return hashed;
		if (href.endsWith(plain)) {
			const boundary = href[href.length - plain.length - 1];
			if (boundary === '/' || boundary === ';') return href.slice(0, href.length - plain.length) + hashed;
		}
	}
	return href;
}

function transformHtml(html, depth) {
	const prefix = '../'.repeat(depth);
	let lastSymbolId;
	let lastContextId;
	return new HTMLRewriter()
		.on('head', {
			element(el) {
				el.prepend(`<link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg">`, { html: true });
				el.onEndTag((end) => {
					end.before(`<link rel="stylesheet" href="${prefix}${cssRenames.get('docs-patch.css')}">`, {
						html: true,
					});
				});
			},
		})
		.on('link[href]', {
			element(el) {
				const href = el.getAttribute('href');
				if (href) el.setAttribute('href', hashCssHref(href));
			},
		})
		.on('a[href]', {
			element(el) {
				const href = el.getAttribute('href');
				if (href) el.setAttribute('href', escapeEncodedTarget(href));
			},
		})
		.on('[id]', {
			element(el) {
				const id = el.getAttribute('id') ?? '';
				if (id.startsWith('symbol_')) {
					lastSymbolId = id;
					lastContextId = id;
				} else if (MEMBER_PREFIX.test(id)) {
					lastContextId = id;
				}
			},
		})
		.on('a.sourceButton', {
			element(el) {
				const memberId = lastContextId === lastSymbolId ? undefined : lastContextId;
				const location = lastSymbolId === undefined ? undefined : resolveLocation(lastSymbolId, memberId);
				if (location === undefined) el.remove();
				else el.setAttribute('href', permalink(location));
			},
		})
		.on('#categoryPanel', {
			element(el) {
				el.prepend('<details open class="catNav"><summary>Categories</summary>', { html: true });
				el.append('</details>', { html: true });
			},
		})
		.on('body', {
			element(el) {
				el.onEndTag((end) => {
					end.before(CLOSE_ON_MOBILE, { html: true });
				});
			},
		})
		.transform(html);
}

function walk(dir, depth) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(target, depth + 1);
		} else if (entry.name.endsWith('.html')) {
			writeFileSync(target, transformHtml(readFileSync(target, 'utf8'), depth));
		}
	}
}

walk(docsDir, 0);

const searchIndexPath = path.join(docsDir, 'search_index.js');
const searchIndex = readFileSync(searchIndexPath, 'utf8');
const escaped = searchIndex.replace(LOCAL_ENCODED_TARGET, (whole, lead, target) =>
	target.startsWith('http') ? whole : `${lead}${target.replace(ENCODED_BYTE, '%25')}`,
);
if (escaped !== searchIndex) writeFileSync(searchIndexPath, escaped);
