#!/usr/bin/env bash
set -euo pipefail

root=$PWD
if [ ! -f dist/mod.d.mts ] || [ -n "$(find src package.json -newer dist/mod.d.mts -print -quit)" ]; then
	bun run build
fi

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
bun scripts/transform-docs.ts .denodocs "$tmp/nodes.json" "$(git rev-parse HEAD)" assets
bunx vite-svg-to-ico generate assets/favicon.svg --out-dir .denodocs
