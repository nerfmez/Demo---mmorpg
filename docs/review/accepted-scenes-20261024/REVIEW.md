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

- Final focused checks: **35 passed, zero failures** (world, opening, maps, landmarks and integration/warp). Build succeeds. Focused world/opening tests and map/landmark checks run separately from visual inspection.
- Route diagnostic samples every new path/connector in both directions: **7,411 probes, zero solid/water/slope failures**. The focused test additionally executes the native movement function in both directions.
- Real `OpenWorldGame.teleportTo` checks the new stone with saved landing/town discovery, rejects a locked forest destination and preserves gold/progress. All opening weapon spots and waypoint arrivals are free.
- Encounter audit: every original spawn fits; no population-count reduction. Town service surface heights equal the retained city baseline.
- Cloud browser attempt: `/game/?fresh=1&seed=9&quality=high` reaches the app, but this browser reports `GL_VENDOR = Disabled` / `Error creating WebGL context`. No repeated retries or browser installation. **A running WebGL frame, continuous pillar animation, touch controls, iPad/WebKit FPS and final integrated aesthetics remain unverified.**
- Supported fallback: software projection/raster of the actual integrated Three geometry/material colours/textures, including the shared native terrain. It approximates toon bands, omits GPU effects/water/shadows and does not establish final visual quality. Captures are listed in the artifact receipt.

No merge. Owner preliminary approval of each standalone scene does not approve this integrated trial.

## Visual inspection record

Inspected all six geometry contact views at 1254×706, 40° play pitch, time 0. The first Meadow view exposed cottages cut by the replacement border; the native extraction now omits entire distant cottages that cannot fit, and the regenerated Meadow view was re-inspected. Accepted standalone cottage sources are unchanged. Fixed an upper coast apron grade and kept the physical stairs clear; 7,411 diagnostic samples then passed. Roads and landmarks are readable in the fallback views; actual water, shadow/shader output, native surrounding scenery and device interaction still require the linked game trial. Artifact hashes are in ARTIFACTS.json.
