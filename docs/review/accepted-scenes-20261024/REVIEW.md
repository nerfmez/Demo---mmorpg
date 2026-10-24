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

