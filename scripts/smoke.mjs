#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pkg from '#pkg' with { type: 'json' };

const pkgUrl = new URL('../package.json', import.meta.url);
const { writeImportMap } = await import(new URL(pkg.exports['.'].default, pkgUrl).href);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'importmapify-smoke-'));
fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/lib/bytes.ts'), '');
fs.writeFileSync(
	path.join(root, 'package.json'),
	JSON.stringify({ imports: { '#lib/*': './src/lib/*.ts' } }),
);

const out = writeImportMap({ root, out: 'deno.import_map.json' });
const map = JSON.parse(fs.readFileSync(out, 'utf8'));
if (map.imports['#lib/bytes'] !== './src/lib/bytes.ts') {
	throw new Error(`smoke test failed: ${JSON.stringify(map)}`);
}
fs.rmSync(root, { recursive: true, force: true });

console.log(`smoke OK (${process.version})`);
