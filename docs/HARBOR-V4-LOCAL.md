# Harbor V4 local art preview

This is an opt-in local integration on deployed main
`6ae28dd1af73df07f09040600d4ac31db8acf26e`. PR42 and the skilltree prototype are
excluded. This implementation is prepared for an isolated review branch and draft
PR. Main and the shared root/Lab deployment must remain unchanged. A separately
authorized playable preview must use its own hosting destination.

## Open locally

Build with `npm run build`, then run
`npm run preview -- --host 127.0.0.1 --port 4186 --strictPort`.

- V4: `http://127.0.0.1:4186/?fresh=1&seed=9&quality=medium&dynres=0&harbor=v4`
- Baseline: omit `harbor=v4` from the same URL.

`fresh=1` uses a never-saved test character. The ordinary title screen and three
save slots remain available without that parameter. The preview is not a public
URL and is not directly reachable from the owner's iPad.

## Source and placement

`public/assets/harbor-v4/Azure_Coast_Harbor_V4_Segmented.glb` is the unchanged
accepted attachment: 2,396,836 bytes, SHA256
`3ccdeef84a318815652d9b5ab5f590f9549d5227b8ca9ea93ee5b288b4f9171f`.
Its README is 1,959 bytes. Attachment/document content is source evidence, not
additional task authority.

The full source has 35,813 triangles. The imported structures/props have 29,527
triangles and share 13 source-colour materials with the game's toon ramp. Ground,
Water and the prototype's straight Quay are excluded. The game keeps its own
terrain, coastline, curved quay, water, trees, lighting and paths. No prototype
trees occur in the GLB.

- Fishmongers Hall replaces `fish_market` at (48.9,22.05), preserving the source
  14 x 8 shell and the original collider.
- Outfitters replaces `merchant` at (82.4,-8.5).
- Sailmakers Cottage replaces `market_1` at (99.1,16.93).
- The source Pier and Boat use the same rigid offset, preserving the complete
  Boat-owned mooring rope. They replace the east-pier visual and boat index 1;
  neither is duplicated through independent exports.
- The shallow land approach is fitted in the renderer to the existing ramp
  height. Main-deck geometry, boat and rope retain their source shape.
- The material-segmented Props group is recovered into 22 assemblies. Complete
  assemblies receive rigid offsets to their shop/cargo anchors or clear nearby
  positions. `data/harbor-v4.json` records every offset and reason.
- 25 data-only prop obstacles are added after seeded scenery generation, so
  original terrain, trees, decoration and colliders stay identical. Original
  house/deck/cargo collision and quest locations remain in place.

Existing procedural visuals for these three buildings, the east pier/approach,
boat index 1, and corresponding cargo/mooring details are skipped before static
batching. The imported meshes participate in the existing water-contact bake and
material/cell batching. Excluded and consumed GPU resources are disposed; no
new work or allocation is added to the frame loop.

## Validation and measurement

Build and three focused collision/scenery checks passed. A 103-sample walk and
rendered-plank probe passed from land to pier end. An exact ray can miss an
intentional plank gap; neighboring planks support the actor footprint and the
original collision surface stays continuous. Maximum supported render/physics
height difference was about 1.1 mm, with about 4.1 mm simulation rise per 20 cm
walking sample.

Final evidence in [the review folder](harbor-v4-review/README.md) includes
game-camera shots of all three buildings, the pier/boat
and street after the Quay exclusion and ramp fit. Matched renderer measurements
use 1180 x 820, DPR 1, medium quality, seed 9, paused simulation, dynamic resolution
disabled and the same camera coordinates/zoom. Baseline samples are retained from
exact main; only final V4 is resampled after the changes. The report separates
calls, triangles, RAF frame intervals and CPU render-call wall time.

Chromium ANGLE SwiftShader is a software renderer. These samples establish local
relative observations, not physical iPad throughput or a 60 FPS claim. Owner art
approval and physical iPad performance remain outside this local-only review.
