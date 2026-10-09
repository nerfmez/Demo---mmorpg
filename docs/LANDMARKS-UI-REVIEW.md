# Blender landmarks and compact UI review

Base: current main `152eb744d242a9260cff5e3479e5f08000a5de54`, including published PR #123. Landmark-history inspection found 18 non-builtin additions, all introduced in `188d715` (PR #120), and no later additions through this base. The four older builtin set pieces remain unchanged.

## Complete inventory

| Map | ID | Blender / GLB kind | Placement X,Z |
| --- | --- | --- | --- |
| azure-harbor-v1 | arrival_wreck | older builtin: wreck | -120, 76 |
| azure-harbor-v1 | azure_lighthouse | older builtin: lighthouse | 3.19999725, 120.15999908 |
| azure-harbor-v1 | gull_shrine | cliff_shrine | 191, -108 |
| azure-harbor-v1 | giant_conch | giant_conch | -22, 50 |
| azure-harbor-v1 | ranger_lookout | watchtower | -111, -75 |
| azure-harbor-v1 | rose_gazebo | garden_gazebo | -110, 10 |
| azure-harbor-v1 | hill_windmill | windmill | 123, -83 |
| azure-harbor-v1 | meadow_well | farm_well | 25, -84 |
| frontier-wilds-v1 | frontier_bell | bell_tower | 190, 14 |
| frontier-wilds-v1 | greyfang_den | older builtin: wolf_den | 99.2, -124.8 |
| frontier-wilds-v1 | warden_ring | older builtin: ruin_ring | -195.2, 9.6 |
| frontier-wilds-v1 | crag_beacon | crag_beacon | -144, -88 |
| frontier-wilds-v1 | elder_mosstree | elder_mosstree | 60, -94 |
| frontier-wilds-v1 | bramble_arch | bramble_arch | 97, 102 |
| frontier-wilds-v1 | glimmer_spire | glimmer_spire | -63, 41 |
| frontier-wilds-v1 | sunfall_arch | sea_arch | 0, 169 |
| frontier-wilds-v1 | meadow_sundial | sundial | 89, 3 |
| moonroot-grove-v1 | moonstone | moonstone | -104, 7 |
| moonroot-grove-v1 | moon_altar | moon_altar | 131, -12 |
| moonroot-grove-v1 | fiddlehead_rise | fiddlehead_ferns | 110, 24 |
| moonroot-grove-v1 | moon_mirror | moon_mirror | 9, -23 |
| moonroot-grove-v1 | root_arch | root_arch | -146, -4 |

Each non-builtin row has an editable `assets/blender/landmarks/<kind>.blend` and integrated `public/models/landmarks/<kind>.glb`. Blender 4.3.2 re-opened all 18 final sources; named objects, editable curves and modifiers remain. Rebuild/edit guidance is in the source directory README.

## Files and integration

- `scripts/build-landmarks.py`: reproducible Blender authoring and evaluated export copies.
- `scripts/capture-landmarks.mjs`: reproducible High in-game landmark/UI screenshots; holds completed frames only for review, waits for native resize before redraw.
- `public/models/landmarks/manifest.json`: exact 18 export counts; 45,294 triangles and 1,482,868 bytes total, with no image textures. These are asset counts, not device FPS measurements.
- `src/render/landmark-assets.js`, `region.js`, `environment.js`: real region GLB loading, native three-step toon materials/soft same-hue hulls, cooperative batching, cancellation and disposal. Removes the replaced procedural `landmarks.js`. Moving windmill sails preserve their named pivot and precompute their transform list to avoid per-frame callback allocations.
- `src/ui/compact.css`, `index.html`, `src/ui/loadout-workspace.js`: compact HUD/menu/dialogs, independent dark loadout windows, responsive pagination, contained scrolling, portrait pane switching, retained touch/focus and native item/skill/save handlers.
- Affected tests: core landmark/region lifetime fixtures, actual GLB ownership tests, loadout-live browser expectations, focused compact-panel and landmark-GPU probes.
- `docs/UI-WORKSPACES.md`, `docs/GODOT-PORT.md`: presentation and authored-model contracts.

Core rules, map data, placement/collision circles, save v13 shape and migrations are unchanged. PR #123 rendering presets, native AA/MSAA, grass culling, governor, pooling, particle uploads and ribbon work remain on the base without modification. No quality preset or effects layer was added.

## Visual review

Both user JPEGs were visually inspected from the actual inline pixels. The first supplied a loose dark inventory/modular comparison-panel direction; the second supplied edge HUD/minimap/quest/skill placement. Livestream decorations were excluded. The current game remains an anime/cel-shaded world with native three-step lighting and same-hue outlines.

The representative shrine and main menu were inspected in the real game before extending the approach. A conflicting single-page CSS rule initially compressed the menu body; it was fixed and re-captured before full scope work. All 18 final integrated landmarks were inspected in normal game-camera screenshots and diagnostic contact sheets. Reviews checked silhouettes, human-relative scale, terrain seating, material contrast, composition and opening/column readability. Flame taper, fern contrast, arch weathering/foliage and both sides of crescent/mirror marks were refined after inspection. Additional playable zoom/distance views from both sides expose tall silhouettes that a close default camera clips. Three windmill still samples, with real 500 ms waits between redraws, show the sails turning at their native wall-clock rate; this is sampled motion evidence, not continuous playback.

UI review uses the actual running High game at 1440×900, 1180×820, 844×390 and 390×844. Window bounds, text, icons, contrast, hierarchy, touch controls and internal scrolling were checked. A paused capture initially cleared its 3D canvas during portrait resize; the capture harness now waits for resize RAFs and redraws the native renderer before final evidence. A portrait passive-chart zoom toolbar was shifted outside its panel by a legacy transform; the compact override removes that transform and gives each zoom button a 44 px target. Portrait supports the same equipment/loadout and bag/library panes through explicit tabs.

Screenshots in `docs/review/landmarks-ui/` are actual game frames. Capture scripts hold an already drawn world frame behind UI while leaving native DOM/RAF interactions active; test characters do not grant production items. Landmark captures pause and remove test monsters for a clear view. The before image comes from the exact base build; after comes from this branch build. Capture camera and screenshot/asset digests are recorded in the evidence manifest.

## Technical validation

- `npm run build`: passes on final runtime sources (pre-existing chunk-size warning).
- `npm test`: 68 core files passed on the initial full run; the new region loader exposed one outdated lifetime-fixture dependency. That fixture was corrected. The subsequent focused run of landmark, region lifetime, save, world and actual GLB asset tests passes all five files. The other 68 files were not redundantly re-run.
- PR #123 preservation: six focused rendering/resolution, grass-culling, particle-upload, ribbon-motion and portrait-lifetime files pass. Direct diff confirms core/data/save and PR #123 runtime/preset files are unchanged.
- Actual High game `loadout-live.mjs`: 43 checks pass, including equip/upgrade/sale, compatible and rejected socketing, replacement/cancellation, movement rejection, Continue save restoration, responsive controls and temporary avatar buffers (264 geometries / 47 textures before and after six gear changes).
- `compact-panels.mjs`: 36 actual-game panel views pass bounds/navigation at four sizes.
- `landmark-resources.mjs`: focused imported shrine GPU buffers upload and release; two post-warmup samples stabilize at 88 geometries / 49 textures. Duplicate disposal is safe. Native initial async cleanup finishes during warmup; the final two samples agree. No unresolved growth symptom requires the broad combat leak session.
- Real Blender re-opens all 18 final `.blend` files with editable named parts; actual GLBs parse, use no textures, match manifest triangles, batch to fewer static draws, and dispose raw/merged resources once. Cancellation tests pass.
- Changed-file routing was computed with repository `classifyFiles`/`validationPlan`; it selects boot, smoke, world, combat, menu, save, overlays and HUD for CI. Broad CI-owned checks were not repeated locally; no CI/review polling, merge or deployment was performed.

Structured reports and exact test output are in `docs/review/landmarks-ui/`. `artifact-manifest.json` identifies source/GLB/runtime/screenshot bytes by SHA-256. `library-files.json` contains six confirmed Library uploads and their opaque file IDs; the [private evidence Page](https://chatgpt.com/space/page_558ff553da108191b4a28b72e5bac454) presents the selected images.

## Limits

Visual evidence uses Chromium touch emulation and ANGLE SwiftShader, not a physical iPad/Safari or a hardware FPS benchmark. Native WebKit and physical-device review remain before merge. Source/GLB byte counts and lower draw-call batching do not establish mobile frame rate. This task creates a draft PR only, with no merge or deployment.
