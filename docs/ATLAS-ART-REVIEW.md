# Atlas portrait and location art review

Source: main `852c22f1e6e209ad35c09d90308cd6e48e3c0c7a`, rechecked before delivery.
Reviewed 2026-10-05. Exact source/output SHA-256 hashes are recorded in
[`atlas-monsters/manifest.json`](../assets/atlas-monsters/manifest.json) and
[`atlas-regions/manifest.json`](../assets/atlas-regions/manifest.json).

## Observable criteria

- Monster faces/leading parts read in the existing 50×50px Atlas list slot.
- All 18 current spawn/boss IDs match their actual concepts; the v3 reed viper
  retains its leaf hood. No generic replacement species or tiny full-body figures.
- All 17 location cards have a biome/landmark image keyed by map and zone, with
  repeated zone names on the two maps remaining distinct.
- PNG edges have real alpha and clean margins; no adjacent-sheet fragments,
  cut horns, antennae, feathers or detached sentinel stones.
- Existing list/card dimensions, Thai names, drops, selection/travel actions,
  world map, boss pins and other art consumers retain their contracts.

## Actual pixel review

Inspected all Meshy concepts in three contact sheets before generation, the
existing Atlas SVG framing in its real UI, the approved item cel painting and
the harbor/beach reference pixels. Current map data and authored zone artwork
supplied location identities. Inspected all final 35 individual assets on
labelled contact sheets at 170px and actual 50px/60px review sizes:

- [18 final monster faces](../assets/atlas-monsters/portraits-review.png)
- [17 final locations](../assets/atlas-regions/regions-review.png)

Fixed unintended cyan crystal shards behind `gale_hawk` by regenerating its
six-icon sheet edit; final pixels contain brown feathers with no crystals.
Alpha-component extraction prevents clipping across nominal cell boundaries.
Detached sentinel stones are assigned to the sentinel, and location extraction
removes a neighbouring cave fragment previously included at the wetland edge.
All final runtime images are 256×256 RGBA; monster margins are at least 8px and
location margins at least 6px. Soft edge alpha is preserved. Runtime image totals
are about 1.6MiB for monsters and 2.0MiB for locations; source sheets stay outside
the public runtime directory.

## Integrated review and validation

Ran the real game in Chromium/SwiftShader. Selected every existing region via
the actual card control, compared every displayed monster ID and Thai name
against zone spawns/boss positions, decoded all images and checked unchanged
material drops and authored boss-pin SVGs. Four settled viewport sizes passed:
1440×960 desktop, 1180×820 iPad, 844×390 mobile landscape, 390×844 portrait.
All monster slots remain 50×50px. No page errors, failed image responses or
settled page overflow. The initial iPad check ran before canvas resize settled;
the capture now waits for the live canvas before measuring.

Inspected all final runtime captures, including:

- [Desktop, cards and monster faces](reference/atlas-art/desktop-review.png)
- [iPad, cards and monster faces](reference/atlas-art/ipad-review.png)
- [Mobile portrait cards](reference/atlas-art/mobile-portrait-places.png)
- [Mobile portrait faces](reference/atlas-art/mobile-portrait-monsters.png)
- [Mobile landscape faces](reference/atlas-art/mobile-landscape-monsters.png)
- [Browser report](reference/atlas-art/browser-report.json)

`npm run build` passed, with the existing large-chunk advisory.
`node --test tests/core/atlas-art.test.js tests/core/raster-icons.test.js tests/core/presentation.test.js`
passed all 11 tests. The existing 130 item/material/skill/ammunition asset hashes
remain unchanged. `tests/browser/atlas-art.mjs` passed 17 regions, 18 monsters and
all four viewports. Hosting-prefix and authored-fallback contracts passed.

Direct source review covered `atlas.js`, `art.js`, `raster-icons.js`, both maps,
the monster catalog/concepts, existing art tests, boss pins, quest/inventory art
callers and the actual card/list CSS. No unresolved data/save/Godot rule impact;
no core/data/CSS/rendering changes. Jev was not used: known source contracts were
resolved directly.

## Remaining limits and delivery state

Ready as a reviewable draft within the inspected scope. Location vignettes are
illustrated field-guide views, not measured map layouts. WebKit is unavailable
in this environment; these are Chromium viewport checks, not physical iPad or
Safari performance measurements. Owner/parent visual acceptance, required
premerge checks and any WebKit verification remain separate gates. No merge or
deployment is performed by this task.
