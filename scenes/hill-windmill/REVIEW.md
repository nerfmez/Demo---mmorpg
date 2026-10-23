# Hill Windmill review — 24 October 2026

**Decision: new standalone owner-review draft.** Created after the owner asked to choose another concept and continue. The prior Singing Conch Coast remains preliminarily accepted; this new scene has no owner approval yet and has not been merged or integrated into the game.

## Artifact and target

`hill-windmill/index.html`, SHA-256 `5f17c494b44fd41eb4966a239ab453adaa88057bd711f67e9efcecfd54ebe4cf`.
Reference: `concept.png`, Hill Windmill from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`.

Observable targets: a complete visible timber/plaster windmill and four linen sails; a rounded shingle cap; a readable door and fenced terrace; winding paths with short flights around planted stone ledges; clear walking routes; existing game foliage/materials/hero and the enlarged physical scale.

## Visual inspection and corrections

Inspected software views of the actual assembled Three geometry at the 40-degree play camera, 1254 × 706, plus a second sampled rotor phase at 20 seconds. The reference was inspected alongside the scene. These are sampled geometry/material views, not WebGL screenshots or normal-speed playback.

- First sails extended past the top of the frame. Reduced rotor size and fitted its height; checked projected geometry at 16 phases across a full turn. The minimum top margin remained above the frame edge; the initial reference-like X pose has about 4% top margin.
- Adjusted the final tower proportions toward the reference: taller plaster/timber body and a shorter roof cap. Re-inspected the final geometry/material view.
- Added a solid roof core below the staggered shingles to close bright gaps. Corrected roof winding and added a connected axle behind the hub. The tower has timber bands/braces, windows, a dressed arch and entrance props.
- Initial paving covered too much of the loop. Reduced it to selected rises and short flights, leaving connected earth landings.
- Adapted cliff peaks to the road-cut heightfield instead of suppressing broad cliff runs. This closes exposed slopes while keeping the visible route clear.
- Cleared plants in front of the entrance and adjusted foliage to reuse the approved game models. Opened the fence where the shortcut joins the right route.
- The final approach originally let its inner edge enter the mill's physical footprint. Moved/narrowed its endpoint onto the front apron; walking to the doorway remains a separate clear continuation.

## Focused technical checks

- Terrain preparation and standalone assembly passed. Generated JS syntax and Python syntax passed; diff checks passed. The offline build was assembled from a local pinned Three 0.170 package, with no Sites runtime dependency.
- Actual Three construction and embedded hero GLB loading completed in the geometry harness. All geometry attributes were finite.
- The actual `walkTo` / `updateHero` code reached all 75 targets across the right loop, left ascent, shortcut, east branch and doorway. No failed targets; the inspection accepted distances below 0.12 world units.
- All 205 ribbon rows were sampled at the center and ±60% of their half-width: 615 unblocked points.
- Rotor code advances at 0.055 radians/second (about 114 seconds per revolution); reduced motion keeps it still. Geometry was inspected at two sampled times; continuous playback was not verified.
- No changes to core/data/saves/game renderer or the previously accepted scene sources. No unrelated broad game suites or browser installations.

## Remaining limits

Cloud WebGL had failed in this session's browser environment; the supported fallback was software inspection. The fallback approximates toon shading, ground color and alpha cards, omits the real ground bake/shadows and shows the hero's unskinned bind pose. It does not establish final WebGL lighting, texture filtering, continuous animation, native touch behavior or physical iPad FPS. Runtime/device review and owner comparison of cliff/path composition remain pending before visual approval or game integration.
