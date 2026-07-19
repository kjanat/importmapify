#!/usr/bin/env bun
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const [docsDir = '.denodocs', nodesPath = 'nodes.json', ref = 'master'] = process.argv.slice(2);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const root = process.cwd();

const BUTTON = /<a\s+class="sourceButton"[\s\S]*?<\/a>/g;
const CONTEXT_ID = /id="((?:symbol|property|method|call_signature|constructor)_[^"]+)"/g;
const MEMBER_PREFIX = /^(property|method|call_signature|constructor)_/;
const HREF = /href="[^"]*"/;

function normalize(name) {
	return decodeURIComponent(name).toLowerCase();
}

function permalink(location) {
	const file = path.relative(root, fileURLToPath(location.filename)).split(path.sep).join('/');
	return `${repo}/blob/${ref}/${file}#L${location.line + 1}`;
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

function resolve(symbolId, memberId) {
	const symbolPath = normalize(symbolId.slice('symbol_'.length)).split('.');
	const symbol = symbols.get(symbolPath[0]);
	if (symbol === undefined) return;
	const fromPage = symbolPath.length > 1 ? symbol.members.get(symbolPath.slice(1).join('.')) : undefined;
	if (memberId === undefined) return fromPage ?? symbol.location;
	const memberName = normalize(memberId.replace(MEMBER_PREFIX, ''));
	return symbol.members.get(memberName) ?? fromPage ?? symbol.location;
}

function relink(html) {
	const ids = [...html.matchAll(CONTEXT_ID)].map((m) => ({ at: m.index, id: m[1] }));
	return html.replace(BUTTON, (button, at) => {
		const before = ids.filter((entry) => entry.at < at);
		const symbolEntry = before.filter((entry) => entry.id.startsWith('symbol_')).at(-1);
		if (symbolEntry === undefined) return '';
		const last = before.at(-1);
		const memberId = last === symbolEntry || last.id.startsWith('symbol_') ? undefined : last.id;
		const location = resolve(symbolEntry.id, memberId);
		if (location === undefined) return '';
		return button.replace(HREF, `href="${permalink(location)}"`);
	});
}

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(target);
		} else if (entry.name.endsWith('.html')) {
			const html = readFileSync(target, 'utf8');
			const relinked = relink(html);
			if (relinked !== html) writeFileSync(target, relinked);
		}
	}
}

walk(docsDir);
