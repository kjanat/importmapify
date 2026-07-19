#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const docsDir = process.argv[2] ?? '.denodocs';
const HASH_LENGTH = 8;

const renames = new Map();
for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
	if (entry.isFile() && entry.name.endsWith('.css')) {
		const source = path.join(docsDir, entry.name);
		const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, HASH_LENGTH);
		const hashed = entry.name.replace(/\.css$/, `.${hash}.css`);
		renameSync(source, path.join(docsDir, hashed));
		renames.set(entry.name, hashed);
	}
}

function rewrite(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			rewrite(target);
		} else if (entry.name.endsWith('.html')) {
			let html = readFileSync(target, 'utf8');
			const original = html;
			for (const [plain, hashed] of renames) {
				html = html.replaceAll(plain, hashed);
			}
			if (html !== original) writeFileSync(target, html);
		}
	}
}

rewrite(docsDir);
