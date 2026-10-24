# Rose Garden Glade review — 24 October 2026

**Decision: ผ่านเบื้องต้น — preliminary owner approval, 24 October 2026, public version 11.** The owner accepted the rose scene and requested it be retained. Keep this version as the baseline for future work. This approval is separate from final runtime/device verification, game integration and merge.

Accepted scene source `82e84b3824153f09617055b8e3004478cd242b22`; Site source `6ffeb5ec61ac2bec0ce7cc56a5ece2e46051e463`; [accepted version 11](https://frontier-ruins-review-oct23.ballboy-lnw.chatgpt.site/rose-garden/?v=11). This acceptance update changes documentation only; the published HTML and scene implementation remain unchanged. Meadow, Windmill and Conch Coast remain preliminarily accepted.

## Artifact and target

`rose-garden/index.html`, SHA-256 `eca793b329f3da2064dea0e8c98fbf485214f2bb2c7f8aee02366781791dd8f1`. Source parent: `a70f1a44f4c52483b096b34184816d390da9a4dc` (Meadow approval note).
Reference: `concept.png`, Rose Garden Glade from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`.

Targets: a visible gazebo on the left terrace, staggered weathered timber roofing, readable benches/plank flooring, climbing pink/cream roses, a small stone/flower island in an open path court, usable stairs and five connections beyond the frame. Keep the existing game foliage/hero, enlarged world and 40-degree play camera.

## Visual inspection and fixes

Inspected the original reference and assembled geometry/material software views at 1254 × 706, time 0, using the 40-degree play camera. Also inspected an unobscured closer gazebo view (40-degree viewing pitch, 45-degree FOV) at the same resolution. Re-inspected both exact final views after the last change. These are software approximations, not WebGL screenshots or normal-speed playback.

- Initial roof tiles formed an obvious aligned checkerboard. Staggered the shingle courses, narrowed their tone range and varied rose clusters along the eaves. The roof keeps a closed underlying surface, timber trim and finial.
- Initial loop paths left a long lawn strip. Added an irregular open dirt court with a defined smaller island; placed its main boulders explicitly so clearance filtering could not silently remove the landmark. Kept road fragments and planting at the edges.
- The stair approach initially let its usable side width enter a bench/post. Shifted the lower landing and the turn into the front bay; retained the benches and open entrance. Final center and width samples were clear.
- The close view exposed terrain poking through the pavilion floor. Unified the authored gazebo footprint, walking plane and wood floor, then lowered the backing ground under that exact polygon. Final close view shows the full plank floor without the dirt patch.
- Retained the game canopy and shrub models, grouped roses along the gazebo/terraces/stone island, and used instanced cupped petals and vine leaves. Final assembly contains 21 trees, 374 shrubs, 789 roses and 1,170 vine leaves, plus game grass/wildflowers.

## Focused technical evidence

- Preparation, offline HTML assembly, generated JS/Python syntax and diff checks passed. The file embeds pinned Three 0.170 modules, the reference and retained hero GLB; no Sites runtime is required.
- Actual Three scene construction and embedded hero GLB loading completed in the software harness; geometry attributes were finite.
- The actual `walkTo`/`updateHero` implementation reached **623 sequential targets**: all eight routes in both directions, shared junction approaches, five ports, the gazebo entrance/center and a circuit of the open garden court. No failed targets; accepted distance below 0.12 world units.
- No sampled movement height jump exceeded 0.18 world units between successive 1/60-second simulation updates.
- All 640 route rows were checked at center and ±65% of half-width: **1,920 unblocked points**. Downward rays found no cliff more than 0.25 units above the logical road floor at those samples.
- Changed symbols were traced through terrain/dirt, floor height/backing mesh, paving, road stones, post/bench/rock colliders, plant clearance and `window.__scene.rose`. No main-game core/data/saves/renderer or accepted scene implementation changed. No unrelated full suites or new browser installations.

## Limits and next review

New WebGL lighting, ground baking/shadows, filtering, native touch, device FPS and continuous animation remain unverified after the prior cloud WebGL failure. The software fallback approximates materials, omits real baked shadows and shows the hero in bind pose. Existing foliage/hero motion was retained; no playback claim is made. Version 11 is retained as the preliminarily accepted owner baseline; game integration still requires its own world/collision/resource/device checks. Passing navigation checks is not visual approval.
