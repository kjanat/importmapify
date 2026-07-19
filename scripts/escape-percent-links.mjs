#!/usr/bin/env bun
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ENCODED = /%(?=[0-9A-Fa-f]{2})/g;
const LOCAL_TARGET = /(["'/])((?:[^"'<>\s]*%[0-9A-Fa-f]{2})+[^"'<>\s]*\.html)/g;

function escapeTargets(text) {
	return text.replace(LOCAL_TARGET, (whole, lead, target) =>
		target.startsWith('http') ? whole : `${lead}${target.replace(ENCODED, '%25')}`,
	);
}

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(target);
		} else if (entry.name.endsWith('.html') || entry.name === 'search_index.js') {
			const text = readFileSync(target, 'utf8');
			const escaped = escapeTargets(text);
			if (escaped !== text) writeFileSync(target, escaped);
		}
	}
}

walk(process.argv[2] ?? '.denodocs');
