#!/usr/bin/env bun
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [docsDir = '.denodocs', assetsDir = 'assets'] = process.argv.slice(2);

copyFileSync(path.join(assetsDir, 'favicon.svg'), path.join(docsDir, 'favicon.svg'));
copyFileSync(path.join(assetsDir, 'docs-patch.css'), path.join(docsDir, 'docs-patch.css'));

function inject(dir, depth) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			inject(target, depth + 1);
		} else if (entry.name.endsWith('.html')) {
			const html = readFileSync(target, 'utf8');
			if (!html.includes('rel="icon"')) {
				const prefix = '../'.repeat(depth);
				const linked = html
					.replace('<head>', `<head><link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg">`)
					.replace('</head>', `<link rel="stylesheet" href="${prefix}docs-patch.css"></head>`);
				if (linked !== html) writeFileSync(target, linked);
			}
		}
	}
}

inject(docsDir, 0);
