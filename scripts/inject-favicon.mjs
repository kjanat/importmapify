#!/usr/bin/env bun
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [docsDir = '.denodocs', svgPath = 'assets/favicon.svg'] = process.argv.slice(2);

copyFileSync(svgPath, path.join(docsDir, 'favicon.svg'));

function inject(dir, depth) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			inject(target, depth + 1);
		} else if (entry.name.endsWith('.html')) {
			const html = readFileSync(target, 'utf8');
			if (html.includes('rel="icon"')) continue;
			const href = `${'../'.repeat(depth)}favicon.svg`;
			const linked = html.replace('<head>', `<head><link rel="icon" type="image/svg+xml" href="${href}">`);
			if (linked !== html) writeFileSync(target, linked);
		}
	}
}

inject(docsDir, 0);
