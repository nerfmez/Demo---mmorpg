#!/bin/sh
# Fetch the Quaternius Universal Animation Library GLBs (CC0) into tests/browser/out/ual (git-ignored)
# for scripts/pose-retarget. quaternius.com / itch.io may be blocked; this reads a CC0 mirror on GitHub
# with a sparse, blob-less checkout (about 42 MB for the two GLBs).
set -e
out="$(cd "$(dirname "$0")/../.." && pwd)/tests/browser/out/ual"
tmp="${TMPDIR:-/tmp}/ual-mirror"
mkdir -p "$out"
[ -d "$tmp/.git" ] || git clone -q --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/tilakpatell/tilakverse-assets "$tmp"
cd "$tmp"
git sparse-checkout set --no-cone "quaternius/universal-animation-library/Unreal-Godot/UAL1.glb" "quaternius/universal-animation-library-2/Unreal-Godot/UAL2.glb" "quaternius/universal-animation-library*/License.txt"
git checkout -q HEAD
cp quaternius/universal-animation-library/Unreal-Godot/UAL1.glb quaternius/universal-animation-library-2/Unreal-Godot/UAL2.glb "$out/"
cp quaternius/universal-animation-library/License.txt "$out/License.txt"
echo "UAL1.glb and UAL2.glb in $out"
