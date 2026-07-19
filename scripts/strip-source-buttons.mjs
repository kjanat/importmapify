#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SOURCE_BUTTON = /<a\s+class="sourceButton"[\s\S]*?<\/a>/g;

function stripUnder(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			stripUnder(target);
		} else if (entry.name.endsWith('.html')) {
			const html = readFileSync(target, 'utf8');
			const stripped = html.replace(SOURCE_BUTTON, '');
			if (stripped !== html) writeFileSync(target, stripped);
		}
	}
}

stripUnder(process.argv[2] ?? '.denodocs');
