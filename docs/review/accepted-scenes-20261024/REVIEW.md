# Accepted scenes: native game integration trial, 24 October 2026

Owner request: replace finished scene areas in the real game, join the terrain and roads seamlessly, and use the new arrival-beach warp pillar. This is a **draft integration for owner/device review**, not final visual acceptance or merge approval.

Base game: `4468c81251cec9d4ba496e78bed67d048a44b91e`.
Accepted standalone source: `00bed638a57b6217f675e1a279fcc8fcf769dda7` (PR 137 retained unchanged).

## Observable criteria

- Arrival Beach, approved Forest Trail, Singing Conch Coast, Hill Windmill, Meadow Well and Rose Garden are actual native scenery, with one renderer, player, HUD and simulation.
- Paths cross replacement boundaries at the same physical height without a portal, page load or scene switch. Old native scatter and colliders are removed together.
- The new carved fallen-block pillar assembles, glows and floats under the existing saved `landing` waypoint ID; locked destinations still refuse travel. Opening weapon selection stays dry and reachable.
- Preserve city V3, all spawn counts and progression/save identities. Keep the source review scenes intact. Do not integrate the still-unaccepted ruins.

## Implementation

`prepare-accepted-scenes.py` extracts scenery-only factories from the approved builders. The game does not embed standalone pages or their hero/input/renderer. `inspect-accepted-scenes.mjs` exports plain sampled heights, path distances and solids to `data/accepted-scenes/` (indexed by `accepted-scenes.json`). No Three, DOM or random rules code enters core.

`connect-accepted-scenes.mjs` grades connector aprons into retained native roads, crops obsolete road sections, moves the three opening weapon markers to dry sand, and keeps population counts while adjusting the garden habitat and discovery rectangles to the replacement layout. Existing saves retain their waypoint IDs; no character schema/version change.

Native terrain, road paint, physics, spawning and layout export share the same data. Scenery triangles are clipped to their region-local footprint; border heights feather into native terrain. The pillar and windmill rotor are excluded from static batching and spatial detachment. All buffers are prepared in the existing opaque startup phase; walking does not build scenes.

## Checks and limits

- Final focused checks: **77 passed, zero failures**, followed by **27 passed, zero failures** after the final connector extension (world, opening, maps, landmarks and integration/warp). Build succeeds. Focused world/opening tests and map/landmark checks run separately from visual inspection.
- Route diagnostic samples every new path/connector in both directions: **8,264 probes of all new roads and the safe arrival route; zero solid/water/slope failures**. The focused test additionally executes the native movement function in both directions.
- Real `OpenWorldGame.teleportTo` checks the new stone with saved landing/town discovery, rejects a locked forest destination and preserves gold/progress. All opening weapon spots and waypoint arrivals are free.
- Encounter audit: every original spawn fits; no population-count reduction. Town service surface heights equal the retained city baseline.
- Cloud browser attempt: `/game/?fresh=1&seed=9&quality=high` reaches the app, but this browser reports `GL_VENDOR = Disabled` / `Error creating WebGL context`. No repeated retries or browser installation. **A running WebGL frame, continuous pillar animation, touch controls, iPad/WebKit FPS and final integrated aesthetics remain unverified.**
- Supported fallback: software projection/raster of the actual integrated Three geometry/material colours/textures, including the shared native terrain. It approximates toon bands, omits GPU effects/water/shadows and does not establish final visual quality. Captures are listed in the artifact receipt.

No merge. Owner preliminary approval of each standalone scene does not approve this integrated trial.

## Visual inspection record

Inspected all six geometry contact views at 1254×706, 40° play pitch, time 0. The first Meadow view exposed cottages cut by the replacement border; the native extraction now omits entire distant cottages that cannot fit, and the regenerated Meadow view was re-inspected. Accepted standalone cottage sources are unchanged. Fixed an upper coast apron grade and kept the physical stairs clear; the diagnostic samples then passed. Roads and landmarks are readable in the fallback views; actual water, shadow/shader output, native surrounding scenery and device interaction still require the linked game trial. Artifact hashes are in ARTIFACTS.json.

## CI follow-up and final layout corrections

The first integration commit exposed obsolete preservation assertions and three integration issues in CI: the old arrival diagonal crossed the new beach cliff, source trail width came from `w` rather than `y`, and the garden/coast footprints overlapped. The coast now sits 21 m farther south with no footprint overlap; its shoreline feathers into the retained opening beach, west-map seam and city contour. Core heights correct the source seabed against that shared shoreline. All source road widths are finite. Connectors reach beyond the cropped native-road ends.

`scripts/route-accepted-arrival.mjs` reuses the real game's bounded path search offline to author a bidirectionally walkable safe route from the unchanged spawn to town, with a larger authoring footprint to leave clearance around stalls. Its vegetation clearance stops outside the retained city. The original forest waypoint position is retained. Three coastal habitat extents and the meadow slime habitat follow the new dry land while all original monster counts, levels and drops stay unchanged. The lifetime harness now supplies the new scenery dependency, and the asynchronous route test waits for its bounded scheduled result instead of assuming a fixed 50 ms CPU window.

Final inspected artifact: `layout-final.svg` / `layout-final.png`, a plot of actual final road coordinates, shore and non-overlapping footprints. **This is a layout inspection, not a WebGL game screenshot.** Earlier six-view software captures and their hashes in `ARTIFACTS.json` identify the first integration prototype; they precede these final position/road fixes and are not final graphics evidence. The linked live game remains an owner/device trial.

## Owner feedback: one stone style, field, stairs (24 October 2026)

The owner asked for every scene to share one look, especially the stone walls, and for three faults seen in game screenshots to be fixed.

- **One stone family.** The arrival beach and forest stones are the reference: neutral greys (`#cbc6c2`…), moss on top faces, lavender shadow and cool half-tone (`shade [.34,.33,.42]`, `mid [.63,.61,.66]`, `band [-.34,.24]`) and the `#4c4852` ink shell. The ruins-derived scenes (Singing Conch Coast, Hill Windmill, Azure Meadow, Rose Garden) used a cream palette with a flat, bright light and drew no stone outlines. `scenes/ruins/scene.js` now carries the reference palette and light (each scene's `world.js` is regenerated from it), cliff faces are 8% darker, ruin-block tops take stronger moss, paving and shoulders are grey, and large rocks and walls draw the same outline shell.
- **Meadow vegetable bed.** A 16×12 sheet sank under the curved bank, leaving a cut triangle. It is now 48×36, follows the ground (sampled once per grid point, so the Meadow factory builds in about 1.45 s against 1.13 s before; sampling per triangle corner had taken 5.3 s and made a single startup step take about 5 s), and has painted tilled ridges.
- **Stairs (Meadow, Windmill, Rose Garden).** Short pale flights with earth gaps became one continuous stair on every authored flight and every section steeper than 0.2: a level course of grey stones every 0.42 K, square to the smoothed route direction, with risers and broken shoulders. The approved flights are replayed first for their seeded draws and discarded, and the new stairs use their own seed, so every later rock, tree and collider is unchanged.
- **Rose Garden middle stones.** These are the concept's path island, not leftovers. They now share the outlined, mossy stone style. The authored island is too small to plant shrubs without crowding the path loop, so enlarging it is left to a layout change.

Checks: `inspect-accepted-scenes.mjs` re-export matches the committed heights, trails, roads and collider positions (only the 13th digit of angles and float formatting differ), so data is unchanged. `npm test` passes 603/603. `check-accepted-routes.mjs` reports 0 failures. `tests/render/landmark-assets.test.mjs` fails one assertion (1 ≠ 6) identically before this change. Build succeeds.

Visual record: production build, Chromium with ANGLE/SwiftShader WebGL (now available in this environment), 1180×820 touch viewport, high quality, monsters hidden, time paused. Inspected the meadow bed (close and wide), meadow stairs, meadow well, windmill hill, conch coast, rose gazebo and rose island, plus the unchanged arrival beach and forest for comparison. Faults found while reviewing: fill flights fanned on the windmill curves, so stairs were rebuilt as spaced courses; island shrubs were culled or hidden, so they were withdrawn. Owner follow-up ("I can't see what changed on the cliffs"): colour alone was too subtle, so the cliff faces of these four scenes now carry the beach ledge itself: `ledgeStones` in `scenes/ruins/scene.js` stacks faceted grey blocks in courses along every cliff run (mossy top course, ink outline), clear of stairs, with the old fractured face darkened behind them as the shadow between blocks. The blocks use their own seed; the collider/height re-export is unchanged. Remaining limits: iPad/WebKit FPS and touch play are unverified.

## Owner round: redo the four unapproved scenes, lighter (24 October 2026)

The owner keeps the arrival beach and the forest with the sakura island as approved and allowed the other four (Singing Conch Coast, Hill Windmill, Azure Meadow, Rose Garden) to be redone against their concepts and made lighter.

- **Cliffs:** the forest's approved column cliff now builds every cliff in these four scenes (`columnCliffs` in `scenes/ruins/scene.js`). Columns are split into three stacked courses with shadowed seams, so they read as the concepts' stacked blocks. They have mossy caps, a dark backing, and bushes on the lip and at the foot. It replaces the fractured face and the earlier stacked-stone ledge, which was the heaviest part of these scenes. The old outline is still walked for its seeded draws, so every collider and plant placed after it is unchanged.
- **Stone material:** the same plain beach/forest stone material is used everywhere, with no lichen variant, so there is one shader program less.
- **Stairs:** only the authored flights remain, as in the concepts, instead of paving every steep section.
- **Foliage:** tree crowns are about 20% fuller on the same trunks and colliders, which brings the scenes closer to the concepts' canopy.
- **Lighter:** the loose-grass scatter loops run about 55% of their former iterations. The giant conch is tessellated 96×56 instead of 176×96, which looks the same at the play camera. Factory output before clipping: Conch 410k→254k vertices, Windmill 194k→78k, Meadow 212k→186k, Rose 155k→133k. Build time per scene is down 15-40%.

Checks: re-exported heights, trails, roads and colliders are identical for all six scenes. `npm test` passes 605/605 and `check-accepted-routes` reports 0 failures. CI on 4a32b24 (before this round) already showed Chromium startup at 34-37 s (main: 48-51 s). WebKit passed the desktop and iPad startups but the third (VRM) load took 76 s, mostly region warm-up (8.9 s GPU upload in Azure) and scheduling; this round's geometry cuts target that.

## Owner round: Conch Coast details (24 October 2026)

The owner marked the upright block stones on the beach and in the shallows as unnatural, and asked for a new conch closer to the concept.

- **Rocks:** the upright pillars and the cube-shaped stones (with plants on top) in the middle of the beach are gone, together with their colliders. The waterline outcrops are low, rounded mounds of a few leaning boulders with light moss and rubble at their feet. Their positions and sea-foam rings are unchanged.
- **Conch:** a new coiled shell (`scenes/shell-beach/conch.js`). Six whorls grow on a logarithmic spiral with knobbed shoulders, a short canal, a horn-like mouth with a wavy flared lip and a pink interior that darkens inside. It lies on its side as in the concept: spire to the left, the lip rising over the mouth, which opens to the right towards the camera. It is three indexed meshes (about 9k vertices) instead of the earlier 176×96 loft. The footprint colliders are unchanged.
- **Shells:** five more scallops on the sand.

Checks: `data/accepted-scenes/shell-beach.json` was re-exported (24 colliders; heights, trails and roads unchanged; other scenes byte-identical). `npm test` passes 605/605 and `check-accepted-routes` reports 0 failures. Inspected the standalone page against the concept and the game at 1180×820 (wide view and next to the shell).

## Owner round: the owner's Meshy conch (24 October 2026)

The owner made the conch in Meshy (`Meshy_AI_Mossy_Conch_Shell_1024193542_texture.glb`, 15,786 triangles, four 2048 maps, 10 MB) and asked for its triangles to be reduced.

- **Model:** `scenes/shell-beach/reduce-conch.py` (Blender's Python module) welds the split vertices, collapse-decimates to 40% and keeps only the base colour at 1024 JPEG: 6,313 triangles, 431 KB in `public/models/accepted-scenes/singing-conch.glb`. The script reproduces the shipped file byte for byte. 25% (3,945 triangles) was also tried; next to the shell its long faces showed as facets. The procedural conch it replaces was about 20k triangles.
- **Loading:** the standalone page embeds the model like the hero and parses it before building. The game fetches it once (`render/accepted-assets.js`), starting before the terrain build, and hands the CPU copy to the Conch Coast factory, which builds it with the scene's own paint shader. Each build takes a texture clone, released with the region's other accepted-scene textures. The model keeps its own smooth normals (recomputed normals faceted it). If the fetch fails the scene is built without it and the game stays playable.
- **Placement:** traced over the concept outline (spire left, mouth opening to the right and towards the camera), rolled a little so the opening tilts up, and bedded about 1 m in the sand so the body and the lip both rest on it. A warm tint keeps the near-white map from burning out in the game's sun.
- **Colliders:** the six circles now follow the placed model's footprint at hero height (measured from its vertices), not the old traced line. The raised spire stays open.

Checks: `data/accepted-scenes/shell-beach.json` was re-exported (only the six conch colliders changed; other scenes unchanged). `npm test` passes 605/605 and `check-accepted-routes` reports 0 failures. Inspected the standalone page against the concept and the game at 1180×820 (wide view and next to the shell). Local Chromium/SwiftShader startup stayed at 42–43 s. Not run: the long leak session (the texture uses the existing accepted-scene disposal path) and a WebKit pass.

## Owner round: Azure Meadow stones, vegetable beds and overall pass (24 October 2026)

The owner circled the upright bar-like stones and the vegetable bed, and asked for the whole scene to be improved. The bed was then reported as covered, at the wrong angle and floating.

- **Ground:** the town's earth clearing (`outsideClearingWeight`) painted a broad brown patch over the meadow and windmill grass in game, so the scenes looked nothing like their concepts. Inside an accepted scene that paint, and road paint borrowed from the neighbouring map, now fade with the scene's weight: only the scene's own paths and its connector roads are painted. The world map follows the same rule. A render test (`tests/render/terrain-domain.test.mjs`) checks that scene grass inside the clearing is not painted as earth.
- **Stones:** a shared `fieldStone` (in `scenes/ruins/scene.js`) welds the stone hull and smooth-shades it, with moss on its upward faces and the usual outline, so stones read as weathered rock rather than cut crystals. The meadow's field walls are rows of these rounded stones, in one or two courses. Its low terrace edges (marked `stones`) are dry-stone faces instead of rock columns. Its boulders are never taller than 0.62 of their width, and each has a smaller stone and plants at its foot. The stone mesh keeps its authored normals in game.
- **Vegetable beds:** both beds are level rectangles on flat ground, away from the paths (2.8 m or more) and from the terrace edges. Under them the ground varies by only 0.15 m. Each is a raised bed of dark tilled soil whose rim drops below the grass. Ridges run along it with a row of cabbages on each (one instanced mesh), tomato canes stand on the left bed, and a rail fence runs along the front and the end towards the road. The old right bed lay across the trail and over a terrace cliff, which made it look like a floating wall. Two trees and the bushes that hid the left bed were moved back. The beds' random draws are isolated.
- **Orchard:** every orchard tree now carries blossoms, as in the concept.

Checks: only `data/accepted-scenes/azure-meadow.json` changed (colliders 151 to 155; heights, trails and roads unchanged; other scenes identical). `npm test` passes 606/606 and `check-accepted-routes` reports 0 failures. In the render tests, the new test passes. `closed skirt edges and finite grid end meet at the same rendered height` fails identically on the unmodified PR head (af0a356), so it is not from this change. Inspected the standalone page against the concept and the game at 1180×820 around the well, both beds, the north edge, the wide view and the windmill. Local Chromium/SwiftShader startup was 40 to 42 s.

## Owner round: Rose Garden (the gazebo scene) (24 October 2026)

The owner asked to continue with the gazebo scene, using the same approach as the meadow.

- **Stones:** the boulders round the paths and the middle island are rounded `fieldStone`s, never taller than 0.62 of their width (0.7 on the island). Each has a smaller stone at its foot, so the upright cube stones on the middle terrace are gone. The four low terraces are dry-stone faces made of larger, blockier field stones (`blocks`), like the concept's mossy garden walls. The gazebo terrace and the two high terraces keep their rock columns.
- **Stairs:** each stair course is now a level step whose top meets the ground at its uphill edge, so every course shows a riser. Two wide stones per course instead of narrow tiles. Before, the gazebo and east flights read as loose tiles laid on a ramp.
- **Roses:** ten more flowering rose shrubs along the terrace walls and round the gazebo path, as in the concept.

Checks: the scene data is unchanged (colliders, heights, trails and roads identical for all six scenes). `npm test` passes 606/606 and `check-accepted-routes` reports 0 failures. Inspected the standalone page against the concept and the game at 1180×820 (wide view, the gazebo, the middle terrace and the east stairs). Local startup was 45 s.

## Owner round: Hill Windmill (24 October 2026)

The owner asked to continue with the windmill scene.

- **Terrace walls:** all six terraces are now dry-stone block walls (`stones`, `blocks`) instead of rock columns, as in the concept's mossy dressed-stone walls round the hill. The two high terraces stack three courses and the low ones one or two. Block walls (here and in the rose garden) also carry plants spilling over their crown.
- **Boulders:** the scattered boulders are rounded `fieldStone`s, never taller than 0.62 of their width, each with a smaller stone at its foot.
- **Stairs:** the same level-step courses as the rose garden, so each step shows its riser.

Checks: the scene data is unchanged for all six scenes. `npm test` passes 606/606 and `check-accepted-routes` reports 0 failures. Inspected the standalone page against the concept and the game at 1180×820 (wide view, the mill, the south, west and east approaches, and the rose garden's walls after the shared change). Local startup, timed on its own, was 41.9 and 42.0 s. A 56.8 s reading came from a run with a second capture in parallel.


## Owner round: blend the surroundings into the scenes (25 October 2026)

The owner asked to put all the finished scenes into the game and adjust the nearby surroundings to fit them.

Observable criteria: no wall, trench or floating mesh where a scene meets native ground; the town's bare-earth clearing and soil patches do not stop on a straight line at a scene's bounds; the scenes' woodland carries on past their edges; roads, connectors and waypoints keep their earth and stay walkable; no seeded native prop moves.

- **Ground:** an outer apron (`acceptedScenes.apron`) raises or lowers native ground on the listed scene sides to meet each scene's edge, over 6–22 m depending on the rise, kept dry and off pond banks. Connectors are lifted with it. Scene meshes follow every height edit (`core/accepted-shift.js`); stone walls and steps move per part, rigidly, so they do not shear.
- **Paint:** in a wobbly ring round each scene the earth clearing and soil patches give way to grass tinted toward the scenes' greens; visible roads, connector extensions and waypoints keep their earth.
- **Planting:** about 16 trees and 90 shrubs per scene, in clumps, with their own seed after every native pass. None stand on roads, connectors, waypoints, beaches, water or paving.
- **Sea:** the sky-reflection patches no longer repeat on a 22 m square grid. Scene grass and flowers no longer float on the game's sea in the Conch Coast cove.
- **Tried and reverted:** turning the Conch Coast headland's east cove into land. It left a straight cliff and stair-stepped sand on the plateau, which looked worse than the existing cove.

Checks: `npm test` 608/608. Render tests 45 passed and 2 failed; the same 2 tests (landmark import release, closed skirt edges) also fail on the base commit `a9e074a`. `check-accepted-routes` reports 0 failures. A native layout hash of all circles, boxes and decor (ring plants excluded) equals the base commit's. Startup (SwiftShader, timed one run at a time, alternating): this branch 67.5 and 72.4 s, base 69.0 and 70.4 s.

Visual inspection: the game camera at zoom 2, 1180×820, HUD hidden. All 24 scene edges (north, south, east and west of each scene) were compared before and after. Faults found and fixed during the round:
- ring trees on the beach sand: kept off beaches;
- evenly sprinkled shrubs: grouped into clumps;
- the headland cliff: reverted;
- grass on the cove water: culled.

Remaining limits:
- The steep grey slope bands at the windmill's east side (a native plateau edge and a connector cut) are unchanged.
- The Conch Coast cove is still drawn over sloping scene ground, inside the game's coastline.
- iPad/WebKit frame rate is not measured here.

## Owner round: scene colours and trees to match the map (25 October 2026)

The owner asked for the scenes' colours to match the map: their trees were a different colour and bigger than the map's.

Observable criteria: scene trees, shrubs and grass have the same colour, material and size range as the map's; scene ground grass has the map's zone colour; the forest's cherry stays the landmark.

- **Foliage:** in the game the scenes' trees, shrubs and grass are the map's own:
  - geometry, palette and lit material are the game's (previously each scene had its own brighter palette, an unlit cel material and a colour grade);
  - crowns use the game's proportions and tint;
  - trunks have the game's ink outline;
  - grass takes the ground colour through the map's grass bake.
- **Size:** scene trees now span world scale 0.63–1.15 with a median of 0.93; the map's trees span 0.68–1.14 with a median of 0.90. Before this round the scene trees reached 1.80, with crowns up to 3× the map's.
- **Ground:** the grass inside the scenes, and in the ring round them, keeps the map's zone colours; the scenes' yellow-green tint is removed.
- **Unchanged:**
  - the forest's island cherry (its authored size and blossom);
  - scene stones, walls, wood, flowers and water;
  - scene data and colliders.

Checks:
- `npm test` 608/608.
- Render tests 47 passed and 2 failed: the same 2 that also fail on the base commit. The new `tests/render/accepted-foliage.test.mjs` passes.
- The scene data re-export is unchanged.
- Per-stage construction CPU times match the base build. Startup (alternating, one at a time): this branch 74.5 and 70.6 s, base 67.0 and 72.1 s.

Visual inspection: the game camera, 1180×820, HUD hidden. Compared before and after:
- at zoom 1.4: the rose west, meadow west, forest east and windmill west borders;
- at zoom 2: the centre of every scene, plus forest north and beach north.

Faults found and fixed during the round:
- The first build left scene trees at 0.78 because the cap was applied in scene units; it is now a world scale.
- The cherry had shrunk; it keeps its landmark size.

Remaining limits:
- With map-sized trees the scenes are more open than the approved compositions, which counted on larger canopies.
- iPad/WebKit frame rate is not measured here.

### Follow-up: trees that should be big stay big

The owner added that trees should generally be the map's size, but trees that should be big must be big (for example the cherry).

- **Ordinary trees:** sizes are now fitted per scene (`treeScale`), not by one factor and a cap. Each scene's typical tree comes near the map's and the scene keeps its own variation.
  - Beach, Conch Coast and Windmill were already about the map's size and barely change.
  - Rose Garden and Meadow come down to the map's size.
  - The forest giants come down to slightly above the map's (median 1.03).
- **Big trees** (`bigTrees`, with an explicit world size):
  - the forest's island cherry at its authored 2.16;
  - the shade tree beside the meadow well at 1.5;
  - the tree framing the rose gazebo at 1.5;
  - the tree beside the windmill at 1.45.
  The map's largest ordinary tree is 1.14. The three focal trees follow each concept's focal tree.
- **Correction:** the forest trunks are wide and short (a height factor). Their size is the trunk width, which the earlier measurement had missed.

The render test now checks that ordinary trees stay within the map's range and that each big tree has its size. Inspected at zoom 2: every scene's centre, forest north, rose west, and close views of the gazebo, mill and well trees.

## Load time (25 October 2026)

The owner asked for the pre-existing over-60-second load to be fixed. CI's WebKit readiness waits (60–90 s) were timing out: smoke at about 70 s, workspaces and opening just past their waits. equipment-inactive is a separate red-border assertion that the owner excluded.

A startup profile (Chromium, software GL) showed the main thread busy throughout. Most time went to blocking shader first use (13.7 s) on 207 programs, then the map image, terrain, ground paint and scene builds.

Changes:
- **Shader variants:** the high quality preset draws the world into the screen grade's render target, and Three builds those programs separately from canvas ones. The region compile stage, `view.warmup()`, the monster-model swap and the movement-VFX compile compiled canvas variants that were never used. The world upload then compiled the real ones, blocking. They now compile for `view.drawTarget()` (`view.compileForDraw`), which brings startup to about 115 programs.
- **Road distance:** `cityRoadDistance`, `roadDist` and `outsideRoadDistance` take an optional reach, and the visible-road list is cached. The map image and meadow plants pass their thresholds. Seeded core calls are unchanged (the native layout hash is identical). The map image dropped from about 4.3 s to about 3 s.
- **Scene factories:** they reuse the game's shared leaf texture instead of drawing their own.
- **Tried and reverted:** drawing the portrait after loading. With software GL it then appeared about 20 s into play.

Measured locally (Chromium, SwiftShader; three alternating runs each, one at a time): the previous head took 64.9, 62.1 and 65.2 s; this change took 59.3, 57.7 and 59.9 s. That is about 5 s, or 8%, faster. WebKit is measured by CI.

Tests:
- core 609/609, with new tests for compiling against the post target and for road-distance reach;
- routes 0 failures;
- render tests show the same 2 failures as the base commit.

## Load time, second round (25 October 2026)

CI on the first round still timed out. The Chromium smoke waits up to 60 s for the world and then 10 frames (game time 0.5). The world was ready at about 56 s, but those frames took about 15 s more. WebKit's vrm phase and workspaces stalled the same way. The CI smoke runs at quality=low, where the world is drawn straight to the canvas.

Found with a CPU profile, a GPU-process trace and a DOM-mutation probe (Chromium, SwiftShader, 1600 × 900, quality=low, as the smoke):
- **Upload variant at low quality:** the resident upload drew into a private 8 × 8 render target. Three keys canvas output (sRGB, tone mapping) on null and XR targets only, so each upload linked a second, linear-output program that gameplay never uses, and blocked on it. This was about 9 s of blocking first use at startup, now about 5 s. The private target is now flagged as canvas output when there is no screen grade, so the upload links the gameplay program. At high quality nothing changes.
- **HUD writes every frame:** HP/MP text, the level badge, the empty skill slots' classes, the summon commands and the ammo button were rewritten every frame even when unchanged. Each write restyled and repainted the whole HUD layer, which costs hundreds of milliseconds per frame with software GL. They are now written only on change; the probe sees no DOM mutations per frame when nothing changes.
- **Loading bar:** it kept animating inside the faded card, repainting it every frame. It now stops, and the card is hidden after its fade.
- **Scene plants per chunk:** each scene's instanced plants (all but grass) are split into 16 m pieces, as the map's own plants are, so the camera and the sun's shadow box draw only the pieces they reach. At high quality this cut triangles per frame from about 2.76 M to 1.53 M, with no visible change.
- **Landmark test:** `tests/render/landmark-assets.test.mjs` still expected every authored landmark to import. Landmarks drawn by an accepted scene are skipped by design, so the test now expects that.

Measured locally (Chromium, SwiftShader, quality=low, 1600 × 900, the smoke's readiness condition; runs alternated, one at a time):

| Build | Ready (s) |
|---|---|
| previous head (4d4079c) | 70.6, 71.1 |
| this change | 58.4, 58.2 |
| main (14ebb0a) | 60.5, 53.5 |

That is about 12 s faster than the previous head, on a par with main. Most of the gain is after the loading card: about 22 s down to about 12 s. WebKit is measured by CI. Local times vary by several seconds between batches, so only alternated runs are compared.

Checked: screenshots after load (desktop and iPad viewports) show HP/MP text, the level badge, skill slots and the hidden loading card as before.

Tests:
- core 611/611, with a new test that the low-quality upload links the canvas program;
- render 48/49; the one failure (closed skirt edges, `terrain-domain`) also fails on main.

## Hill Windmill on its hill (25 October 2026)

Owner direction: scenes are not pinned flat; a scene that should be high is raised and the ground round it adapts; read the scene and the terrain, and where a form (cliff, terrace, upland) meets the edge, carry it on so nothing looks cut and pasted; never change the scene's content to do it.

- **Lift:** the whole scene is 2.5 m higher (`acceptedScenes.lift`), its meshes, plants, sails and connector ends with it.
- **Edges:** the factory's own ground past the bounds is exported (`outer`, 30 m ring) and continued outward, softened and faded into the map. The scene's upland and banks run on west, east and south as its design draws them.
- **Seam:** the north edge is 4 m from Moonroot Grove. Matching seam `rises` on both maps carry the upland across as a ridge instead of flattening it into the border.
- **Terrace faces:** the dry-stone block walls from the 24 October fidelity pass read as a fortress wall, not the concept's rock ledges. The windmill's terraces, stairs and boulders are back to the earlier rock-cliff version (pre `a9e074a`); scene layout, colliders and routes unchanged.
- **Capture fix:** free-camera review shots had shown floating stairs and holes because cells were culled for the play camera; captures now attach every resident cell.

Checked: views from all four sides, the owner's circled angle, oblique overviews and the Moonroot side; native layout hashes of both maps unchanged. Tests: core 613/613 (new: lifted surface, continued edges with no sheer step outside, matching seam rises and meeting heights, connector ends); render 48/49 (terrain-domain skirt failure also on main).

Remaining: the scene's low gullies still paint grey on their steep sides; some stair courses fan on curves (scene geometry).

### Follow-up: no deep ravines, grass banks, the ring-trail path

Owner review at the play camera: the stairs floated, and the ravines looked forced ("as if they were there only because they had to be"); the owner asked to remove the deep ravines entirely.

- **Ravines filled:** the narrow channels between terraces (up to about 4.4 m deep, floor 0.4 m) are filled. In the generator (`scenes/hill-windmill/fill.js`, injected by `prepare.py`), the terrace ground is closed over 3.4 K, so any dip narrower than about 7 K rises toward its lower bank, stopping 0.9 K (about 1.5 m) below it, then is softened. Each terrace still ends in its rock face over a shallow grass floor. A first try filled to the bank and turned the cliffs into free-standing walls, so it was dropped. Routes ride the filled ground, so stairs no longer span gullies. Scene content and colliders are unchanged; only ground heights follow the fill.
- **Grass banks:** in the game the windmill's slopes are painted grass, not grey strata (`acceptedScenes.grassBanks`; the `aBank` attribute in `render/ground.js` makes the ground shader treat them as level). The scene's own rock faces are unchanged.
- **Ring-trail path:** Moonroot's ring trail met the seam north-east of the mill and stopped. A connector (`accepted/join-ring-trail`, `final`: its heights come from the finished ground, so the apron does not lift it again) and its painted road join it to the windmill's east paths.

Visual inspection: the game camera, 1180×820, at the same 20 positions as the owner's sheet (W1–W4, E1–E4, S1–S5, N1–N3, C1–C4) plus the low south view.

### Follow-up: floating stones and stairs

The owner saw stones and stairs still floating.

- **Cause in the game:** since the lift, stones and steps were raised twice. `seatRigidParts` replaced the geometry without its `rigidParts` flag, so the per-vertex pass ran again and added the lift (2.5 m) a second time; elsewhere it re-applied feather and connector edits. The render now remembers the flag before seating. `tests/render/accepted-seating.test.mjs` checks that each scene's stones stand on the ground (with the old code the windmill's were 2.35 m up).
- **Cause in the scene:** a level step was set at the ground height of its centre, so on a steep slope or a hump its low end hung free. Each step and shoulder now rests on the lowest ground under its footprint (`footing` in `paving.js`), so it sinks into the slope instead.
- **Remaining gully:** a narrow channel east of the mill (around 140, −90) lay between the east-north route's causeway and the terraces. The fill now counts route causeways as banks and bridges a channel across its width in four directions, so open-ended gullies fill too.

Measured per stone after the fix: one windmill part (a 0.27 m pebble) sits 0.25 m above the ground; no other is above 0.15 m. Colliders: four small scattered parts moved with the filled ground (105 → 104).

## Starting beach: open to the first monsters, a cliff on the left (25 October 2026)

Owner direction: the starting beach at its normal level and blended with the shore; no "face" rising from the sand; then, after a first try put a rock cliff between the beach and the Conch Coast: "the early monsters are to the right", so the cliff goes to the left and the right is flattened and joined to the level-1 shore.

- **The face on the sand:** the Conch Coast's west headland (6.3 m) ran past its box and was cut there; the feather made it a smooth 6 m sand wall beside the beach, with the shore foam drawn up it. Even at the old head the headland could not be climbed from the beach.
- **Right side flattened:** the headland (terrace 0) is now beach-level ground in the game. Its terrace stays in the scene's list as `ghost`, so every seeded pass walks it as before and nothing else moves; `build()` clears what was placed on it (4 colliders, its rock faces, plants, palms) and only then gives the ground its flattened shape. The arrival road, which ran along the headland's north feather, climbs onto the remaining rise on a ramp (`accepted/arrival-ramp`, a final connector). From the spawn every level 1–2 spawn point on this shore and the Conch Coast cove is reachable on foot.
- **Left side:** `acceptedScenes.edgeCliffs` `arrival-west`: a 5.5 m rock cliff at the beach's west end, into the sea, in the Conch Coast cliff's column style; the plateau ramps down to the Frontier Wilds seam behind it and to the upland at its north end. The shore crossing into Frontier Wilds along the beach is now closed; the land route north of the cliff stays open.
- **Sand and foam:** sand no longer paints raised ground (`art.ground.beachTop`), the swash film stays under ground more than 1.5 m above the water (`sea.surf.filmTop`), and the Conch Coast's steep banks are grass (`grassBanks`).

Checks: core accepted-scenes, world and data tests pass (new: the left cliff, the seam height, cleared colliders, walking east from the spawn); render tests 49/50 (the skirt failure also on main). Inspected wide and low views of both ends, the flattened shore, the road ramp and the play camera at the spawn and both ends.

### Follow-up: the Conch Coast moves west; a solid headland on the left (25 October 2026)

Owner review: the left cliff had become "a thin rock wall", and the right side of the beach was odd. Direction: move the Conch Coast to the left, away from the starting beach; make the left cliff the solid column cliff the owner liked on the Conch Coast, or long enough to join it; keep the right side a flat beach to the level-1 monsters.

- **Conch Coast moved, unchanged:** the scene now lies on the Greenhollow Frontier coast, 30 m west of the seam (world x −274…−190; Frontier local centre 152, 176). Its sampled heights, trails and colliders are byte-identical to the approved scene; the earlier ghost flattening of its west headland is withdrawn. Layout scenes carry `region`, and `acceptedScenes(data)` returns the scenes of that map, so the Frontier map has its own `acceptedScenes` block (roads, the upper-apron repair connector, foliage, an apron on the back and west sides smoothed over 16 m, grass banks) and its shore follows the scene's shore. The Singing Conch landmark moved with it and still names Azure Coast's coast zone (`serves`).
- **Azure shore restored:** east of the starting beach the shoreline returns from the beach's own shore to the original native line over 34 m; the scene's roads, connectors, landmark and the arrival ramp are gone from Azure. The right side is open beach and grass to the level-1 coast (a walk from the spawn is tested).
- **West headland:** `edgeCliffs` `west-headland` replaces `arrival-west`: a 6.5 m plateau (the Conch Coast's east headland height) from that headland (an `open` edge, full height to its side) over the seam to a column face over the beach (x −151) and a sea cliff, with a grass ramp up its north side. Both maps list the same outline in world metres, each draws the faces inside its bounds, and the ground meets at the seam. A ramp edge may set its own width (a narrow bank where it meets the conch headland). Sand is not painted inside the plateau; the map image fades sand on raised ground as the game does.
- **Native layout:** the shore and terrain changes move part of the seeded native scatter (Azure: 38 of 178 props in the old conch area; Frontier: the props east of local x 98 re-roll). The city-boundary comparison now allows the few props a blocked candidate re-rolls.

Checks: core 616/616 and render 50/51 (the skirt failure also on main). Inspected at 1180×820: the play camera at the spawn, the face, the right side (two points), the plateau top, the ramp, the junction, the Conch Coast; wide views from the sea, above and behind. Fixed during review: a short north face that rendered twisted (now a bank), a steep grey ridge behind the Conch Coast (apron smoothing), sand stripes between the sea-cliff columns.

### Follow-up: the Conch Coast's path and back cliffs (26 October 2026)

Owner review of the moved Conch Coast: "the path and the cliffs are not seamless yet", circling the stair gully behind the west headland and the right end of the back wall. The same two places were already in the Azure placement (compared at the same camera); the owner's circles are the direction to change them.

- **Ramps** (`scenes/shell-beach/fill.js`, injected by `prepare.py`): the stair gully rises from the beach to the headland top as one slope (no 1 m hole beside the path), and the slot behind the cove right of the conch rises from the sand to 5.5 m under the wall top and joins the west headland's plateau. Ground already higher is kept; routes ride the ramp. Nothing else in the scene moves.
- **Stairs on the ground:** stones beside the upper-apron repair connector were seated by the edit model, which does not see the repair cut, and floated about 1 m. Rigid parts within its reach now rest on the lowest actual ground under them; stones the old rule dropped as squashed are kept.
- **Sand:** the Frontier beach band is 20 m wide, Azure's 11 m; inside the scene the band is 11 m again (`acceptedScenes.beach`), so the gully and banks are grass, as approved.
- **Outer ground:** the back and west sides continue the scene's own ground (`continue`, as Hill Windmill) with narrow gullies closed (`outerFill`), instead of a smooth apron mound behind the wall.

Checks: core 616/616, render 50/51 (skirt, also on main). Inspected the owner's view, the gully, the wall end, the stairs and the cove at the play camera; remaining floating cells are the scene's sea rocks, bottoms at the water line.
