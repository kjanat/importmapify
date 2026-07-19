#!/usr/bin/env bash
set -euo pipefail

root=$PWD
[ -f dist/mod.d.mts ] || bun run build

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

{
	awk 'NR>1{print} /\*\//{if(NR>1) exit}' src/mod.ts
	cat dist/mod.d.mts
} >"$tmp/importmapify.d.ts"

(
	cd "$tmp"
	deno doc --html \
		--name="$(jq -r .name "$root/package.json")" \
		--category-docs="$root/category-docs.json" \
		--output="$root/.denodocs/" \
		./importmapify.d.ts
)

deno doc --json $(jq -r '.exports | .[]? // .' deno.json) >"$tmp/nodes.json" 2>/dev/null
bun scripts/link-source-buttons.mjs .denodocs "$tmp/nodes.json" "$(git rev-parse HEAD)"
bun scripts/inject-assets.mjs .denodocs assets
bun scripts/transform-nav.mjs .denodocs
bun scripts/escape-percent-links.mjs .denodocs
bun scripts/hash-assets.mjs .denodocs
bunx vite-svg-to-ico generate assets/favicon.svg --out-dir .denodocs
