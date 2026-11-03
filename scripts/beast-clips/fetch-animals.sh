#!/bin/sh
# Fetch Quaternius "Ultimate Animated Animals" (CC0) Wolf.gltf into tests/browser/out/animals (git-ignored) for
# scripts/beast-clips/extract.mjs. quaternius.com may be blocked; this reads a CC0 mirror on GitHub.
set -e
out="$(cd "$(dirname "$0")/../.." && pwd)/tests/browser/out/animals"
tmp="${TMPDIR:-/tmp}/uaa-mirror"
mkdir -p "$out"
[ -d "$tmp/.git" ] || git clone -q --filter=blob:none --no-checkout --depth 1 https://github.com/Tekh-ops/Ultimate-Animated-Animals-July-2021 "$tmp"
cd "$tmp"
git checkout -q HEAD -- glTF/Wolf.gltf License.txt
cp glTF/Wolf.gltf License.txt "$out/"
