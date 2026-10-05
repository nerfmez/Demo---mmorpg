# Approved Atlas journal illustrations

18 monster heads/leading parts and 17 map-qualified region vignettes. Generated
in six-subject sheets with the built-in image_gen tool, following the owner-approved
fresh journal drawing direction: irregular umber marks, broad watercolor washes,
muted pigments and simplified landmarks. Existing game concepts establish species;
reed_viper uses concept_v3. The normal thornback_wolf has warm brown fur, cream
muzzle and green thorns, distinct from Greyfang and the blue SpiritWolf skill.
Its current GLB texture pixels were inspected before the correction. Landing has
the actual cyan crystal above rough rock, without an invented rune on the stone.

The accepted representative source is retained as approved-study.png; its grey
wolf cell is unused. mixed-3.png retains the first continuation; its wolf/landing
cells are unused. Only those two corrected cells are extracted from
identity-corrections.png, preserving the other four continuation paintings.
unused_cells in the manifest makes this explicit. Earlier cel source sheets and
cel-manifest.json remain in ../atlas-monsters and ../atlas-regions. No previous
source was deleted or overwritten. Source sheets are review/editing assets;
runtime displays individual transparent PNGs, never a sheet.

Run python3 scripts/split-atlas-journal.py from the repository root (Pillow,
numpy, scipy). manifest.json records source SHA, source hashes, 1-based row/column,
kind/map/id, output hashes and exact alpha bounds. Extraction assigns connected
alpha components to the grid by centroid; detached features go to the nearest
primary component, preserving antennae, tusks, horns, leaves, floating stones and
soft edges. Sources contain six separated primary components even when some
cells are unused. Transparent RGB is cleared without eroding painted contours.
Exports are 256px RGBA, maximum painted extent232px monsters/244px regions.
Category manifests are generated from the same records. Legacy category script
entry points now rebuild the shared journal batches rather than the rejected art.

Pixel review on 2026-10-05: all source sheets, every individual crop in labelled
150px/50px cream and dark contact sheets, then exact runtime desktop1440x960,
iPad viewport1180x820, mobile844x390 and390x844 screenshots. Reviewed file identities
are monster-review.png, region-review.png and docs/reference/atlas-art/*.png;
manifest hashes identify the exact PNG versions. No crop clipping, neighboring
fragments, alpha backgrounds or ID mismatch observed. Some thin antenna/ink
marks soften at50px; faces and landmarks remain identifiable. No physical
iPad/Safari performance claim; checks use Chromium/SwiftShader.

Real-game browser test clicks all17region controls, checks18monster IDs against
actual spawns/bosses and Thai names, decodes every region/monster image, verifies
SVG boss markers/material drops and all four viewports. PASS: zero page/image
errors and settled page overflow; portrait footprint remains50px. Build passed;
17 scoped tests passed including Atlas, unchanged130supplied icons, presentation
and current wearable-level rules. The initial hash check ran before publishing
new manifests; it passed after those were generated. Final splitter rerun also
passed the focused3Atlas tests. No gameplay data, drop/item/skill art, CSS sizing,
selected-region SVG cover, map geometry or marker changes.

Latest main cd3754e20411463eabc3a4ff96e1db4733dea603 is integrated into the PR72
branch, preserving PR70 wearable-level changes and the independently merged PR71
shop/potion changes. This agent did not merge PR71.
Delivery: full set integrated locally and draft PR updated; CI/merge/deploy gates
belong to the parent. No merge to main or deployment performed. Private preview
URLs are intentionally absent from repository and PR text.

Release gate on 2026-10-05: prior head251e645 passed9/10checks. UI WebKit
review exceeded its22-minute job limit on both original and one targeted rerun.
Annotations explicitly identify timeout; final save assertions reported ok:true
but the check remains cancelled, not successful. No merge/deploy performed.
Latest main reconciliation requires fresh exact-head gates before release.
