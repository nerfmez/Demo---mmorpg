# Hill Windmill review — 24 October 2026

**Decision: revised standalone owner-review draft.** This revision responds to the owner's marked screenshot `1000194981.jpg`: connected roads suitable for eventual game placement, a closer left ascent, less obstructing vegetation and better edge details. The mill geometry, approved coast and retained ruins are preserved. No owner approval or game integration is implied.

## Exact artifact and target

`hill-windmill/index.html`, SHA-256 `4826911c2eb7e27b2acfa8cfbf85cf851c8cfede1b19066860bbbf1a93db6312`. Source parent: `3c7e65f51fea8fbe9aa9c9787635a3c7ac0dfdb5`.
Reference: `concept.png` at concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, plus the owner's annotated runtime screenshot of version 7.

Criteria: visible, physically connected arrival/loop/shortcut roads; exits continuing out of frame; a winding left ascent with two separate flights and landings; clear junctions and usable road width; fewer trees/shrubs hiding the path; the existing mill, hero, 40-degree camera and game art style retained.

## Visual inspection and fixes

Inspected the reference, owner's actual WebGL screenshot of the previous version, and revised software geometry/material views at the 40-degree play camera, 1254 × 706, rotor time 0. The final delivered HTML was assembled from that exact geometry. These final views are software approximations, not new WebGL screenshots or normal-speed playback.

- Replaced roads that ended within the composition with six connected ribbons: south approach, right loop, left ascent, shortcut, east exit and northeast ascent. Four explicit world-space ports retain heights, widths and outward direction for later game placement.
- Roads share the exact arrival, lower fork, east bend, upper junction and forest-fork anchors. Blended junction aprons close competing route heights. Extended the actual southern terrain bounds so the new road remains walkable beyond the image.
- Reshaped the left route into a wider lower bend, two stone flights, earth landings and an upper S bend, following the marked direction and reference more closely. Removed the old long uniform staircase.
- Early revised views still had rock facets poking through road joins. Clamped crossing facets below the shared route floor and re-inspected; retained the side faces. Removed the forced hard dirt mask at the road edge for a softer continuous border.
- Reduced trees from 22 to 14; reduced bush attempts from 760 to 340, made shrubs smaller and separated the cliff-lip clusters. The final assembly has 213 shrubs after clearance. Removed the large central canopy that hid the route. Grass and flowers remain in open patches, with clearance at the road edges.
- Added low, broken stone shoulders to the two flights and small variations in slab tone/rotation. Fence openings remain clear at road crossings.

## Focused technical checks

- Terrain preparation, offline standalone assembly, generated JS syntax, Python syntax and diff checks passed. The offline file embeds pinned Three 0.170 modules and has no Sites runtime dependency.
- Actual Three geometry and the retained hero GLB loaded in the software harness; all geometry attributes were finite.
- The actual `walkTo` / `updateHero` implementation reached **350 sequential targets**, including approaches through shared junctions, every route in both directions, all four ports and the mill doorway. No failed targets; accepted distance below 0.12 world units.
- No height jumps greater than 0.18 world units occurred between successive 1/60-second walking updates in those traversals.
- Sampled all 443 road rows at center and ±65% of half-width: **1,329 unblocked points**. Downward ray tests on the actual cliff mesh found no rock face more than 0.25 units above the logical floor at these samples.
- Road segments are indexed into local cells for terrain and navigation queries, rather than scanning every road segment on each query. This is not a measured device FPS result.
- Changed-symbol review: `routes.js` feeds terrain, dirt, paving, foliage/fences, collision clearance and the exposed `window.__scene.hill` integration data. The generated `world.js` matches its preparation source. No main-game core, data, saves, renderer or previous scene sources changed.

## Limits and status

Final WebGL ground baking, shadows, native touch, device FPS and continuous playback remain unverified because the cloud WebGL environment previously failed. The software views omit actual baked ground detail/shadows and show the hero's unskinned bind pose. Rotor/hero animation was unchanged in this revision. Prior rotor bounds checks are historical evidence, not a new playback review.

This is a revised public draft for owner comparison. Main-game placement must connect neighboring terrain at the provided ports and pass the game's world/collision and device checks before merge. The accepted Singing Conch Coast retains **ผ่านเบื้องต้น**, 23 October 2026.
