import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeImportMap } from '../dist/index.js';

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
