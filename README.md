# importmapify

[![NPM](https://img.shields.io/npm/v/importmapify?logo=npm&labelColor=CB3837&color=black)][npm]
[![JSR](https://img.shields.io/jsr/v/@kjanat/importmapify?logoColor=083344&logo=jsr&logoSize=auto&label=&labelColor=f7df1e&color=black)][jsr]
[![CI](https://github.com/kjanat/importmapify/actions/workflows/publish.yml/badge.svg)][ci]
[![Socket](https://badge.socket.dev/npm/package/importmapify)][socket]

Expand `package.json` subpath-pattern imports into the explicit entries a [Deno import map] needs.

Node resolves subpath patterns like `#lib/*` -> `./src/lib/*.ts` internally. Deno's import maps only support exact keys
and trailing-slash prefixes, so tools that expect an import map (`deno doc`, `deno check`, the Deno LSP) need one entry
per matched source file instead. This package performs that expansion and writes a deterministically sorted import map.

[Deno import map]: https://docs.deno.com/runtime/fundamentals/modules/#differentiating-between-imports-or-importmap-in-deno.json-and---import-map-option
[ci]: https://github.com/kjanat/importmapify/actions/workflows/publish.yml
[npm]: https://npm.im/importmapify
[jsr]: https://jsr.io/@kjanat/importmapify
[socket]: https://socket.dev/npm/package/importmapify

## Install

```sh
npm install importmapify
```

## CLI

```sh
npx importmapify --root . --out import_map.json
```

| Flag                        | Alias | Meaning                                                                   | Default             |
| --------------------------- | ----- | ------------------------------------------------------------------------- | ------------------- |
| `--root`                    | `-r`  | Project root containing the manifest                                      | current directory   |
| `--manifest`                | `-m`  | Manifest path, relative to root                                           | `package.json`      |
| `--out`                     | `-o`  | Output path, relative to root                                             | `import_map.json`   |
| `--import key=value`        | `-i`  | Extra import entry; repeatable                                            | none                |
| `--package name=target`     | `-p`  | Package expanded to a conformant bare and trailing-slash pair; repeatable | none                |
| `--scope prefix::key=value` | `-s`  | Scoped import override; repeatable                                        | none                |
| `--condition name`          | `-c`  | Condition tried when a target is a conditional object; repeatable         | `import`, `default` |
| `--ext name`                | `-e`  | Restrict pattern matches to these file extensions; repeatable             | all files           |
| `--check`                   |       | Exit 1 if the output file is stale, without writing it                    | off                 |
| `--stdout`                  |       | Print the map instead of writing it                                       | off                 |

Add global and test-scoped dependencies from the CLI:

```sh
npx importmapify \
  --package 'dreamcli=jsr:@kjanat/dreamcli@^3' \
  --scope './tests/::dreamcli/testkit=jsr:@kjanat/dreamcli@^3/testkit'
```

Run `npx importmapify --help` for the full reference, or `npx importmapify --completions bash` for shell completions.

## Library

```ts
import { writeImportMap } from 'importmapify';

const out = writeImportMap({
  root: import.meta.dirname,
  out: 'import_map.json',
  additionalImports: {
    'bun:test': './node_modules/bun-types/test.d.ts',
  },
  scopes: {
    './tests/': {
      'dreamcli/testkit': 'jsr:@kjanat/dreamcli@^3/testkit',
    },
  },
});
```

| Export            | Signature                                                  | Purpose                                                                               |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `createImportMap` | `(options: CreateImportMapOptions) => ImportMapDocument`   | Build the import map in memory.                                                       |
| `formatImportMap` | `(map: ImportMapDocument) => string`                       | Serialize to the canonical sorted, tab-indented JSON text.                            |
| `writeImportMap`  | `(options: WriteImportMapOptions) => string`               | Build, serialize, and write to disk; returns the written path.                        |
| `packageEntries`  | `(name: string, target: string) => Record<string, string>` | Build the bare and trailing-slash entry pair a package needs to resolve its subpaths. |

`CreateImportMapOptions`:

| Option              | Meaning                                                                                           | Default                 |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `root`              | Base directory for the manifest, source targets, and rebasing.                                    | required                |
| `manifest`          | Manifest path, relative to `root`.                                                                | `package.json`          |
| `conditions`        | Condition names tried, in order, against conditional targets (`{"import": ..., "default": ...}`). | `['import', 'default']` |
| `packages`          | Package specifiers mapped to targets, each expanded to a conformant bare and trailing-slash pair. | none                    |
| `additionalImports` | Extra entries merged in after manifest expansion and packages; these win on key collision.        | none                    |
| `scopes`            | Scope prefixes mapped to scope-specific import overrides.                                         | none                    |
| `relativeTo`        | Directory the written targets are rebased against.                                                | `root`                  |
| `extensions`        | File extensions, with or without a leading dot, that pattern targets may match.                   | all files               |

`WriteImportMapOptions` extends the above with `out`, the output path relative to `root`. `writeImportMap` rebases
automatically against `out`'s directory, so a nested `out` (for example `.cache/maps/import_map.json`) still produces
targets that resolve correctly from the map's own location.

### Project-local generator

A checked-in wrapper keeps project-specific dependency and scope mappings in code:

```ts
#!/usr/bin/env -S deno run -A --no-config

import { writeImportMap } from 'importmapify';

const output = writeImportMap({
  root: new URL('..', import.meta.url).pathname,
  out: 'import_map.json',
  packages: {
    dreamcli: 'jsr:@kjanat/dreamcli@^3',
  },
  scopes: {
    './tests/': {
      'dreamcli/testkit': 'jsr:@kjanat/dreamcli@^3/testkit',
    },
  },
});

console.log(`Wrote ${output}`);
```

Execute the wrapper directly so its `--no-config` shebang can bootstrap a missing map:

```sh
scripts/generate-importmap.ts
```

The equivalent explicit command is:

```sh
deno run -A --no-config scripts/generate-importmap.ts
```

Do not omit `--no-config`. If `deno.json` references a map that does not exist yet, `deno run` otherwise fails while
loading configuration, before the generator starts.

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

A key with its own suffix, such as `#lib/*.js` targeting `./src/lib/*.ts`, produces both the renamed specifier and the
real filename: `#lib/bytes.js` and `#lib/bytes.ts`, both pointing at `./src/lib/bytes.ts`.

## Scope and constraints

- Only the manifest's top-level `imports` field is read.
- Conditional targets resolve via `conditions`, tried in order, recursively. A target matching no condition is skipped.
- Pattern keys and targets must both contain `*`, or neither should; a mismatch throws.
- Expandable pattern targets must point to local files beneath `root`. Target directories are scanned recursively; a
  missing directory produces no entries.
- Relative targets (`./...`, `../...`) are rebased against `relativeTo`. Bare specifiers, `npm:`/`jsr:`/`node:`
  specifiers, and absolute URLs pass through unchanged.
- If exact and expanded entries produce the same key, the later manifest entry wins.
- Relative scope prefixes and targets are rebased against `relativeTo`; trailing scope slashes are preserved.
- Import entries, scope prefixes, and scoped entries are sorted by UTF-16 code unit for stable diffs.

## Use the generated map

The output is a standard external import map. Deno CLI commands, `deno.json`, editor language servers, and APIs that
embed Deno tooling can all consume it.

### Deno CLI

Pass the map to any command that accepts `--import-map`:

```sh
deno doc --import-map=import_map.json src/index.ts
deno doc --import-map=import_map.json --json src/index.ts
deno doc --import-map=import_map.json --html --output=docs/api src/index.ts
deno check --import-map=import_map.json src/
deno run --import-map=import_map.json src/main.ts
deno test --import-map=import_map.json
deno bench --import-map=import_map.json
deno compile --import-map=import_map.json src/main.ts
```

### `deno.json`

Reference the map once instead of repeating `--import-map`:

```json
{
  "importMap": "./import_map.json",
  "tasks": {
    "importmapify": {
      "command": "npx importmapify",
      "files": ["package.json", "src/**"],
      "output": ["import_map.json"]
    },
    "check": {
      "command": "deno check src tests",
      "dependencies": ["importmapify"]
    }
  }
}
```

Deno applies the map to CLI commands and its language server whenever that configuration is active. `importMap` is an
alternative to defining `imports` and `scopes` directly in `deno.json`.

When `importMap` points to a generated file, keep that file available after checkout. Deno validates the path before it
runs commands, including `deno task`, so a task in the same `deno.json` cannot bootstrap a missing map. Bootstrap with
an executable `--no-config` wrapper, then use cached Deno tasks for subsequent regeneration.

### Editor LSP

The Deno language server uses the selected import map for diagnostics, completions, hover information, and
go-to-definition. Enable it in Zed with `.zed/settings.json`:

```json
{
  "languages": {
    "TypeScript": {
      "language_servers": ["deno", "!typescript-language-server", "!vtsls"]
    }
  },
  "lsp": {
    "deno": {
      "settings": {
        "deno": {
          "enable": true,
          "config": "./deno.json",
          "importMap": "./import_map.json"
        }
      }
    }
  }
}
```

In mixed-runtime repositories, restrict Deno to the relevant paths:

```json
{
  "lsp": {
    "deno": {
      "settings": {
        "deno": {
          "enable": true,
          "enablePaths": ["./src", "./scripts", "./tests"],
          "config": "./deno.json",
          "importMap": "./import_map.json"
        }
      }
    }
  }
}
```

Other LSP clients expose the same Deno initialization settings. When the client discovers `deno.json` itself, its
`importMap` field is usually sufficient without a duplicate editor setting.

### Keep Bun or npm in charge

Reading `package.json` does not make Deno modify it. In a mixed-runtime project, explicitly keep `node_modules` under
Bun or npm control:

```json
{
  "nodeModulesDir": "manual",
  "importMap": "./import_map.json"
}
```

For full isolation, set `preferPackageJson` to `false` or run with `DENO_NO_PACKAGE_JSON=1`. The generated map must then
contain every bare dependency and package alias required by the checked files; unresolved entries cannot fall back to
`package.json`.

### Spawn Deno from Node or Bun

Use the absolute path returned by `writeImportMap` to avoid working-directory ambiguity:

```ts
import { execFileSync } from 'node:child_process';
import { writeImportMap } from 'importmapify';

const root = '/path/to/source-tree';
const importMap = writeImportMap({ root, out: 'import_map.json' });

const documentation = execFileSync(
  'deno',
  ['doc', '--import-map', importMap, '--json', 'src/index.ts'],
  { cwd: root, encoding: 'utf8' },
);
```

### `@deno/doc`

The documentation API accepts an import-map file URL:

```ts
import { doc } from 'jsr:@deno/doc';

const entries = [new URL('./src/index.ts', import.meta.url).href];
const importMap = new URL('./import_map.json', import.meta.url).href;
const nodes = await doc(entries, {
  importMap,
  printImportMapDiagnostics: false,
});
```

## Keep it current

Pattern entries reflect the files present when generation runs. Regenerate after:

- adding, moving, or deleting matching source files;
- changing `package.json#imports`;
- changing extra imports or scopes in a wrapper script;
- updating dependency versions embedded in generated mappings.

Useful generation points include install or prepare hooks, documentation/type-check/test tasks, editor tasks, and CI
before Deno tooling. Commit the generated map whenever `deno.json#importMap` references it or editor support must work
immediately after checkout. Ignore it only when bootstrap runs outside that Deno configuration, such as an executable
`--no-config` wrapper or a Bun/Node lifecycle hook.

## License

MIT
