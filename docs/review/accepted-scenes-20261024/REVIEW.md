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
