#!/usr/bin/env bun
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const docsDir = process.argv[2] ?? '.denodocs';

const CLOSE_ON_MOBILE =
	'<script>if(matchMedia("(width < 1024px)").matches)for(const d of document.querySelectorAll("details.catNav"))d.open=false</script>';

function transform(html) {
	const rewriter = new HTMLRewriter()
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
		});
	return rewriter.transform(html);
}

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(target);
		} else if (entry.name.endsWith('.html')) {
			const html = readFileSync(target, 'utf8');
			if (!html.includes('catNav')) {
				const transformed = transform(html);
				if (transformed !== html) writeFileSync(target, transformed);
			}
		}
	}
}

walk(docsDir);
