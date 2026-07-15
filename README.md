# importmapify

[![NPM](https://img.shields.io/npm/v/importmapify?logo=npm&labelColor=CB3837&color=black)][npm]
[![CI](https://github.com/kjanat/importmapify/actions/workflows/publish.yml/badge.svg)][ci]
[![Socket](https://badge.socket.dev/npm/package/importmapify)][socket]

Expand `package.json` subpath-pattern imports into the explicit entries a
[Deno import map] needs.

Node resolves subpath patterns like `#lib/*` -> `./src/lib/*.ts` internally.
Deno's import maps only support exact keys and trailing-slash prefixes, so
tools that expect an import map (`deno doc`, `deno check`, the Deno LSP) need
one entry per matched source file instead. This package performs that
expansion and writes a deterministically sorted import map.

[Deno import map]: https://docs.deno.com/runtime/fundamentals/modules/#differentiating-between-imports-or-importmap-in-deno.json-and---import-map-option
[ci]: https://github.com/kjanat/importmapify/actions/workflows/publish.yml
[npm]: https://npm.im/importmapify
[socket]: https://socket.dev/npm/package/importmapify

## Install

```sh
npm install importmapify
```

## CLI

```sh
npx importmapify --root . --out deno.import_map.json
```

| Flag                 | Alias | Meaning                                                           | Default                |
| -------------------- | ----- | ----------------------------------------------------------------- | ---------------------- |
| `--root`             | `-r`  | Project root containing the manifest                              | current directory      |
| `--manifest`         | `-m`  | Manifest path, relative to root                                   | `package.json`         |
| `--out`              | `-o`  | Output path, relative to root                                     | `deno.import_map.json` |
| `--import key=value` | `-i`  | Extra import entry; repeatable                                    | none                   |
| `--condition name`   | `-c`  | Condition tried when a target is a conditional object; repeatable | `import`, `default`    |
| `--check`            |       | Exit 1 if the output file is stale, without writing it            | off                    |
| `--stdout`           |       | Print the map instead of writing it                               | off                    |

Run `npx importmapify --help` for the full reference, or `npx importmapify
completions` for shell completions.

## Library

```ts
import { writeImportMap } from 'importmapify';

const out = writeImportMap({
  root: import.meta.dirname,
  out: 'deno.import_map.json',
  additionalImports: {
    'bun:test': './node_modules/bun-types/test.d.ts',
  },
});
```

| Export            | Signature                                                | Purpose                                                        |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `createImportMap` | `(options: CreateImportMapOptions) => ImportMapDocument` | Build the import map in memory.                                |
| `formatImportMap` | `(map: ImportMapDocument) => string`                     | Serialize to the canonical sorted, tab-indented JSON text.     |
| `writeImportMap`  | `(options: WriteImportMapOptions) => string`             | Build, serialize, and write to disk; returns the written path. |

`CreateImportMapOptions`:

| Option              | Meaning                                                                                           | Default                 |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `root`              | Base directory for the manifest, source targets, and rebasing.                                    | required                |
| `manifest`          | Manifest path, relative to `root`.                                                                | `package.json`          |
| `conditions`        | Condition names tried, in order, against conditional targets (`{"import": ..., "default": ...}`). | `['import', 'default']` |
| `additionalImports` | Extra entries merged in after manifest expansion; these win on key collision.                     | none                    |
| `relativeTo`        | Directory the written targets are rebased against.                                                | `root`                  |

`WriteImportMapOptions` extends the above with `out`, the output path relative
to `root`. `writeImportMap` rebases automatically against `out`'s directory,
so a nested `out` (for example `.cache/maps/deno.import_map.json`) still
produces targets that resolve correctly from the map's own location.

## What it generates

Given this manifest:

```json
{
  "imports": {
    "#config": "./src/config.ts",
    "#lib/*": "./src/lib/*.ts"
  }
}
```

and these files:

```text
src/
├── config.ts
└── lib/
    ├── bytes.ts
    └── codecs/
        └── hex.ts
```

the generated map is:

```json
{
  "imports": {
    "#config": "./src/config.ts",
    "#lib/bytes": "./src/lib/bytes.ts",
    "#lib/bytes.ts": "./src/lib/bytes.ts",
    "#lib/codecs/hex": "./src/lib/codecs/hex.ts",
    "#lib/codecs/hex.ts": "./src/lib/codecs/hex.ts"
  }
}
```

A key with its own suffix, such as `#lib/*.js` targeting `./src/lib/*.ts`,
produces both the renamed specifier and the real filename: `#lib/bytes.js`
and `#lib/bytes.ts`, both pointing at `./src/lib/bytes.ts`.

## Scope and constraints

- Only the manifest's top-level `imports` field is read.
- Conditional targets resolve via `conditions`, tried in order, recursively.
  A target matching no condition is skipped.
- Pattern keys and targets must both contain `*`, or neither should; a
  mismatch throws.
- Expandable pattern targets must point to local files beneath `root`.
  Target directories are scanned recursively; a missing directory produces
  no entries.
- Relative targets (`./...`, `../...`) are rebased against `relativeTo`.
  Bare specifiers, `npm:`/`jsr:`/`node:` specifiers, and absolute URLs pass
  through unchanged.
- If exact and expanded entries produce the same key, the later manifest
  entry wins.
- Output entries are sorted by UTF-16 code unit for stable diffs.

## Use the generated map

```sh
deno doc --import-map=deno.import_map.json src/index.ts
deno check --import-map=deno.import_map.json src/
deno run --import-map=deno.import_map.json src/main.ts
```

or reference it once in `deno.json`:

```json
{
  "importMap": "./deno.import_map.json"
}
```

## License

MIT
