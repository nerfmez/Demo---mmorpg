# Azure Meadow Well review — 24 October 2026

**Decision: new standalone owner-review draft.** Chosen after the owner requested another scene. The accepted Hill Windmill version 8 and Singing Conch Coast version 6 remain preserved; this scene has not received owner approval or been integrated into the game.

## Artifact and criteria

`azure-meadow/index.html`, SHA-256 `7a7d7e2f396f92ea3afcf17dda32d2e3b7d3918a6121dcbebf4894b1aaf40354`. Source parent: `955b1881b61c394a70369469b958d910d9931e11`.
Reference: `concept.png`, Azure Meadow Well from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`.

Targets: a readable open stone well with a windlass, rope and bucket; an orchard and vegetable beds; separate left stair flights; a road through the village gate; continuous usable roads and explicit connections beyond the frame; existing game foliage/hero/style and enlarged physical scale; clear paths without excessive planting.

## Actual visual review and corrections

Inspected the reference and assembled geometry/material software views at the 40-degree camera, 1254 × 706, scene time 0. Inspected the exact final assembled artifact after the last material revision. These are software approximations, not WebGL screenshots or normal-speed playback.

- The first well was too far forward and its wall was too tall. Repositioned its center and reduced its body height toward the reference. Kept an actual hollow opening, bonded masonry courses and a distinct rim, with the windlass axle, rope coils, hanging bucket and side barrels visible.
- Initial beds were buried by the shaped grass terrain. Tessellated the soil over actual ground heights and cleared grass/shrubs from those polygons. Cabbages remain individually modeled in rows, bounded by timber fences.
- The initial inner roads competed with the main approach. Narrowed the orchard loop/front garden path and retained the wider primary roads and junctions. Moved the front path away from the retaining wall so the stone border stays visible.
- The well approach initially entered its shaft collider. Moved/narrowed the endpoint to the front apron. The village gate initially clipped the road's usable side width; widened its opening and rechecked approaches in both directions.
- Added a capped stone arch, distant tiled roofs/windows/doors/chimneys, orchard blossoms and fruit, short stone shoulders and fewer separated shrubs. Corrected outward winding on house gables and tile bands. The final composition retains 17 game-native trees and 205 shrubs after clearance.
- Adjusted local road normals to avoid a stone-coloured crease where a narrow earthen access ramp shares coarse terrain triangles with its bank. Added a continuous earthen surface on that access using the same route heights, so the narrow ramp is not represented by the coarser surrounding terrain alone. Re-inspected the final view.

## Focused technical evidence

- Terrain preparation, offline HTML assembly and generated JS/Python syntax passed. The offline file embeds pinned Three 0.170 modules, reference image and retained hero GLB; no Sites runtime is required.
- Actual Three scene construction and embedded hero GLB loading completed in the software harness; all geometry attributes were finite.
- The actual `walkTo` / `updateHero` implementation reached **554 sequential targets**, including approaches through shared junctions, all eight routes in both directions, all five ports and the well apron. No failures; accepted final distance below 0.12 world units.
- No sampled walking height jump exceeded 0.18 world units between consecutive 1/60-second simulation updates.
- All 669 road rows were sampled at center and ±65% of half-width: **2,007 unblocked points**. Downward ray tests found no cliff more than 0.25 units above the logical floor at these points.
- Road data consumers were traced through terrain/dirt, paving, fence/plant clearance, colliders and the exposed `window.__scene.meadow` connection data. Main-game core/data/saves/renderer and accepted scene sources were not changed. No unrelated broad game suites or browser installations.

## Limits

The cloud WebGL environment previously failed, so final review used the supported software fallback. It approximates toon shading/materials, omits actual ground baking/shadows and shows the hero's unskinned bind pose. Final WebGL lighting/filtering, continuous motion, native touch and device FPS remain unverified. Vegetation and hero motion were retained; no new animation playback claim is made. Main-game placement and its world/collision/device checks remain separate work before integration or merge.
