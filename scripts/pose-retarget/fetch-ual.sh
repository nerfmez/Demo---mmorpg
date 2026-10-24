#!/bin/sh
# Fetch the Quaternius Universal Animation Library and KayKit Adventurers GLBs (both CC0) into tests/browser/out/ual (git-ignored)
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
# KayKit Adventurers (CC0): chibi characters with weapon props
kk="${TMPDIR:-/tmp}/kaykit-adventurers"
[ -d "$kk/.git" ] || git clone -q --filter=blob:none --no-checkout --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 "$kk"
cd "$kk"
git checkout -q HEAD -- LICENSE.txt addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb addons/kaykit_character_pack_adventures/Characters/gltf/Barbarian.glb addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb addons/kaykit_character_pack_adventures/Characters/gltf/Rogue.glb
for c in Knight Barbarian Mage Rogue; do cp "addons/kaykit_character_pack_adventures/Characters/gltf/$c.glb" "$out/"; done
cp LICENSE.txt "$out/KayKit-LICENSE.txt"
# KayKit Character Animations 1.1 (CC0, Kay Lousberg): the 133-clip animation library for the same rig
# (Rig_Medium_*.glb, no props: play them on an Adventurer with clip-keys.mjs --anim). itch.io is blocked
# here; this reads a copy of the pack's GLBs on GitHub.
ka="${TMPDIR:-/tmp}/kaykit-animations"
[ -d "$ka/.git" ] || git clone -q --filter=blob:none --no-checkout --depth 1 https://github.com/mulki-hub/eldenringkw "$ka"
cd "$ka"
for f in CombatMelee CombatRanged General MovementBasic MovementAdvanced Special; do git checkout -q HEAD -- "Rig_Medium_$f.glb" && cp "Rig_Medium_$f.glb" "$out/"; done
echo "UAL1.glb, UAL2.glb, the KayKit Knight, Barbarian, Mage and Rogue and the KayKit Rig_Medium animation library in $out"
