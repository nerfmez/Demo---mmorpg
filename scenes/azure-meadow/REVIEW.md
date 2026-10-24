# Azure Meadow Well — overall revision, 24 October 2026

**Owner decision: ผ่านเบื้องต้น — preliminary approval, 24 October 2026, public version 10.** The owner accepted the overall revision and requested the next scene. Retain version 10 as the baseline for future work. This records owner approval separately from runtime verification, game integration and merge.

Accepted scene commit `50cee66641f98c5ab9b6fa1ba0ee322516fef828`; Site source `0bb4d2706982e81953530678982c47f3aeeee535`; [accepted version 10](https://frontier-ruins-review-oct23.ballboy-lnw.chatgpt.site/azure-meadow/?v=10). This acceptance note changes documentation only. The earlier rejection of version 9 is retained below as history. Windmill version 8 and Conch Coast version 6 remain accepted baselines.

## Exact artifacts and reference

Revised `azure-meadow/index.html`, SHA-256 `c7f813ba83f0f156667908e5eac113ca7bb598a5a8a99019daab46b10e1d3a34`. Source parent: `881547010b70b8f781a1477ece29bd61273a274d`.
Rejected version 9: HTML SHA-256 `7a7d7e2f396f92ea3afcf17dda32d2e3b7d3918a6121dcbebf4894b1aaf40354`, Site source `6d1c674412590036c320f2fef40928ac4f092c8e`.
Reference: `concept.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`.

## Diagnosis and intended corrections

The old version had the listed objects but its large cross-roads, deep circular well, formal retaining wall, sparse small crowns and uniform stair runs did not reproduce the reference's garden composition. Passing route checks did not establish visual quality.

The revised criteria are a broad arrival court splitting above the hero, a contained well/orchard focus, a shallower opening and aged windlass, low broken field boundaries, shorter stair flights, grouped orchard crowns and a smaller background gate with partially hidden village houses. Keep the game foliage identity, enlarged world and usable connections.

## Views actually inspected

Inspected the reference beside the rejected and revised software geometry/material views at the same 40-degree camera, 1254 × 706, time 0. Inspected the final revision after the last composition/detail change. These are software views of assembled Three geometry, not new WebGL screenshots or normal-speed playback.

- Removed the transverse road across the garden front. Raised the primary Y junction from the hero's position into the arrival court; the earlier low split left a large bare grass triangle. Retained a narrow orchard loop and five exits through seven connected routes.
- Reduced the well's depth in plan to 56% of its width, matching the flatter reference opening. Lowered the garden terrain from 2.028 to 0.78 world units. Adjusted body position/height, rim and water shape; thickened and detailed the timber uprights and windlass. The shaft now has an ellipse collider matching the visible form.
- Replaced the front ramp with a shallow west-side well approach. Replaced the continuous retaining wall with broken low field-stone runs, varying height and missing upper stones, planted at their feet.
- Split the uniform left paving into four shorter flights with dirt landings, wider worn slabs, small gaps and irregular shoulders. Added embedded stones along the roads to break the clean strips.
- Reorganized crowns into orchard/background/edge groups using the same game foliage models. Increased blossom visibility and planted flower/shrub groups near stones; the final scene has 22 trees and 349 shrubs after clearance. This follows this orchard reference rather than applying the windmill's sparse planting count to every scene.
- Enlarged the individual cabbages and reduced the left bed to three rows of five. Reduced/moved the background gate and house scale, with more canopy screening the village.

## Focused technical evidence

- Preparation, offline HTML assembly, generated JS/Python syntax and diff checks passed. The pinned Three 0.170 modules, reference and retained hero GLB remain embedded; no Sites runtime dependency.
- Actual Three construction and hero GLB loading completed in the software harness; geometry attributes were finite.
- The actual walker reached **490 sequential targets**, covering the central fork, all seven routes in both directions, five ports and the west well apron. No failed targets; accepted distance below 0.12 world units.
- No sampled height jump exceeded 0.18 world units between consecutive 1/60-second simulation updates.
- All 586 road rows were checked at center and ±65% of half-width: **1,758 unblocked points**. Downward rays found no cliff more than 0.25 units above the logical road floor at those samples.
- Changed paths were traced through terrain/dirt, steps/road stones, wall and fence clearance, ellipse/prop colliders, plant placement and the exposed `window.__scene.meadow` data. No main-game core/data/saves/renderer or accepted scene sources changed. No unrelated full suites or browser installations.

## Remaining limits and decision

**Version 10 retained as the preliminarily approved owner baseline.** The broad composition and forms were changed, with preliminary owner approval recorded above; this does not certify final device/runtime verification. New WebGL lighting, baked ground/shadows, texture filtering, native touch, device FPS and continuous motion remain unverified because the cloud WebGL environment previously failed. The fallback approximates materials, omits real baked shadows and shows the hero in bind pose. Game integration and its checks remain a separate task.
