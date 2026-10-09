# Editable zone landmarks

Each of the 18 `.blend` files is a self-contained Blender 4.3.2 scene with named
parts, editable curves and unapplied bevel modifiers. These are the sources used
for the game's GLBs, not renders or placeholders. Sources use Blender Z-up;
exports use game X-right/Y-up/Z-forward with metre units and their origin at ground.

Open a source in Blender to edit it. Export glTF Binary with Y-up, selected model
objects and applied modifiers. Preserve the windmill's `landmark-spinner` pivot.
For reproducible authoring/export from the checked-in script, run from repo root:

```sh
blender -b --python scripts/build-landmarks.py
# Or rebuild one model:
blender -b --python scripts/build-landmarks.py -- cliff_shrine
```

The script overwrites the requested authored sources and exports. Source scenes
retain separate editable components. Export copies evaluate curves/modifiers and
join by material and moving pivot; they contain no texture images. The runtime
converts export colours/emission to the game's toon materials and outlines.
`public/models/landmarks/manifest.json` records byte/triangle/material counts.
If manually exporting, refresh that entry's counts and run the asset checks.

Map data remains the placement/collision authority: `data/maps/*.json` and
`core/world.js`. Decorative roof/canopy overhangs do not add collision. Preserve
trunk/column/stone footprints, traversable openings and height support when editing.
The four older builtin landmarks continue to use their existing scenery builders.

Review inventory and actual-game evidence: [LANDMARKS-UI-REVIEW](../../../docs/LANDMARKS-UI-REVIEW.md).
