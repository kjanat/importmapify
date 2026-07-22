# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-07-22

### Added

- A `--import` example in `--help` and the README.
- `--out`, `--manifest`, and `--config` reject an empty value. `--out ''` used to reach the writer and fail with
  `Unexpected error: EISDIR`.

### Changed

- `--import` and `--package` are dreamcli `keyValue` flags, `--scope` and `--filter` parse into typed values at the flag
  boundary, and `--indent` resolves to `string | number` there. Invalid values are rejected during parsing rather than
  during option resolution.
- `--check` and `--stdout` are checked for conflict in a `derive()` step instead of at the top of the action.
- Help examples resolve the invoked program name at render time, so they stay correct under `npx`, a symlink, or a
  rename.
- `ansispeck` moved to `devDependencies`. Nothing under `src/` imports it since dreamcli took over example highlighting
  and the hyperlink gate.

### Removed

- The example-highlighting workaround for [dreamcli#65][dreamcli#65] and the `--json` escape-code guard it needed.
  dreamcli 3 highlights examples itself and gates the color on `NO_COLOR` and TTY, which the local version did not.
- The `hyperlinks` override for [dreamcli#63][dreamcli#63]. The header gate honors `NO_HYPERLINKS` and `--no-hyperlinks`
  upstream.

### Fixed

- `--quiet` / `-q` now suppresses the `Wrote <path>` and `is up to date` confirmations. dreamcli strips both tokens from
  argv at the root before dispatch, so the command-level `quiet` flag was never set, and the confirmations went through
  `warn()`, which ignores verbosity. They use `status()` now and the duplicate flag declaration is gone.

[dreamcli#63]: https://github.com/kjanat/dreamcli/issues/63
[dreamcli#65]: https://github.com/kjanat/dreamcli/issues/65

## [1.6.1] - 2026-07-21

### Added

- A 404 page on the documentation site.

### Changed

- The documentation site works on narrow screens. The mobile header is a single bar, the nav collapses into a
  disclosure, breadcrumbs stay on one line with a trailing ellipsis, and code blocks no longer overflow the page.
- Doc post-processing runs as one HTMLRewriter pass in `scripts/transform-docs.ts`, replacing
  `scripts/link-source-buttons.mjs` and `scripts/inject-favicon.mjs`. `deno task doc:html` now calls
  `scripts/build-docs.sh` instead of an inline shell one-liner.
- Stylesheet filenames on the docs site are content-hashed.
- Bumped `dreamcli` to 3.0.1, `ansispeck` to 0.4.1, and `tsdown` to 0.22.12.

### Fixed

- Percent-encoded links in the generated docs.
- `{@link}` tags on cross-file symbol references in `src/types.ts`, which rendered as plain text.

## [1.6.0] - 2026-07-19

### Added

- Documentation site at [importmapify.kjanat.dev](https://importmapify.kjanat.dev), generated with `deno doc` and
  published via GitHub Pages. Symbols are grouped into Generate, Options, and Configuration categories with intro prose,
  every source button links to a commit-pinned GitHub permalink for the exact symbol or member, and pages carry an SVG
  favicon (with an `.ico` fallback in the site root).
- `@category` and `@module` JSDoc on the public API, rendered by the site and by `deno doc`.
- deno tasks for the docs pipeline: `doc:html`, `doc:json`, `doc:lint`, `format:docs`, and `ci:docs`.

### Changed

- `homepage` in `package.json` and `deno.json` now points at the documentation site.
- Internal: option records in the config loader and CLI are derived from `WriteImportMapOptions` via mapped types
  instead of hand-written copies.
- The tsdown `build:done` hook falls back to the committed `deno.json` when the file is missing.

## [1.5.0] - 2026-07-18

### Added

- `filter` option (`--filter` / `-f` on the CLI) taking `RegExp` or predicate matchers tested against each candidate
  pattern target path. A target is kept only when every matcher accepts it; combines with `extensions`. Drops hashed
  build chunks a `dist/*` pattern would otherwise enumerate.
- `indent` option (`--indent` on the CLI, `JSON.stringify` space semantics) controlling output indentation; the default
  stays a tab.
- `TargetFilter` and `PathOrUrl` exported types.
- `@example` and `@defaultValue` JSDoc on every public type and member, with links to the Import Maps Standard and
  Deno's import-map documentation.
- This changelog.

### Changed

- Public types moved to `src/types.ts`; the package entry re-exports them unchanged.
- `--json` detection ignores arguments after a `--` separator.
- Clarified the `relativeTo` documentation.

## [1.4.0] - 2026-07-18

### Added

- Config hooks, modeled on tsdown's hooks. A config file can declare lifecycle functions the CLI runs around generation:
  `generate:before(ctx)` runs before the filesystem is scanned, so a build step there populates pattern targets;
  `generate:done(ctx)` runs after the map is emitted, receiving the finished document. Each hook may be async and
  receives `{ root, out }`. The synchronous library functions ignore hooks.

### Changed

- `Config` is now `Partial<WriteImportMapOptions>` with an optional `hooks` field, so a config file can omit `root`. An
  omitted `root` defaults to the config file's own directory; the CLI supplies the remaining defaults.

## [1.3.1] - 2026-07-18

### Added

- `Config` type alias for `WriteImportMapOptions`, so a config export can be typed as `import('importmapify').Config`.

### Fixed

- `--json` help no longer leaks ANSI escapes into the emitted schema. Example commands are styled for human help but
  left raw when `--json` is present.

## [1.3.0] - 2026-07-18

### Added

- `--quiet` / `-q` flag.
- Colorized help examples (binary bold, flags cyan) via ansispeck, now a direct dependency.
- `NO_HYPERLINKS` honored in `--help`, with the header name and version kept underlined once the clickable link is gone.

### Changed

- The `Wrote <path>` and `up to date` confirmations write to stderr, keeping stdout clean for piping.

## [1.2.0] - 2026-07-18

### Added

- CLI config file support. Auto-discovers `importmapify.config.*` / `.importmapify.*` in the project root and merges its
  default export beneath explicit flags. Adds `--config <path>` and `--no-config`. Configs load via native `import()`,
  so a TypeScript config needs a type-stripping runtime (Bun, Deno, or Node >= 22.6).

### Fixed

- A JSR type-check failure now blocks the npm publish.

## [1.1.1] - 2026-07-18

### Changed

- Diagnostic logs go to stderr instead of `console`.

## [1.1.0] - 2026-07-17

### Added

- `packages` option and `packageEntries()`, emitting the bare and trailing-slash pair Deno needs in the required `jsr:/`
  / `npm:/` form.
- `extensions` filter, `defineConfig()` helper, and an optional `out` (defaults to `import_map.json`) accepting a
  relative path, absolute path, or `file://` URL. `root` and `relativeTo` accept `file://` too.

### Changed

- Node-accurate expansion: drops invalid full-filename keys and resolves same-key collisions by subpath specificity
  (exact beats a pattern, longer prefix wins), independent of declaration order.

## [1.0.1] - 2026-07-15

### Changed

- Registry metadata in `package.json` and `deno.json`. No functional changes.

## [1.0.0] - 2026-07-15

### Added

- First stable release, published to both npm (`importmapify`) and JSR (`@kjanat/importmapify`).
- Scoped imports and native Deno config support.
- Documented Deno import-map workflows.

## [0.1.0] - 2026-07-15

### Added

- Initial release. Expands `package.json` subpath-pattern imports (e.g. `#lib/*` to `./src/lib/*.ts`) into the explicit,
  deterministically-sorted entries a Deno import map needs, so `deno doc`, `deno check`, and the Deno LSP can resolve
  Node-style subpath imports. Ships as both a library and a CLI.

[1.7.0]: https://github.com/kjanat/importmapify/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/kjanat/importmapify/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/kjanat/importmapify/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/kjanat/importmapify/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/kjanat/importmapify/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/kjanat/importmapify/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/kjanat/importmapify/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/kjanat/importmapify/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/kjanat/importmapify/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/kjanat/importmapify/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/kjanat/importmapify/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/kjanat/importmapify/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/kjanat/importmapify/commits/v0.1.0

<!-- markdownlint-disable-file MD024 -->
