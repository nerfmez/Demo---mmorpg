# Camp trees and Medium rendering review

Based on main `7beaf36a9e238f15d226ce457ccef271f498c233` (PR #131). Final screenshots and probes use production `main-DCg5qziN.js`; baseline uses `main-DAsFQ0nf.js`. Build, changed-source and artifact SHA-256 identities are in [identity.json](identity.json). Review date: 2026-10-10.

## Problem and change

The Grove's exterior forest extended into the Frontier settlement at a corner outside both seam spans. Exterior trees are render-only backdrop, but all-world residency made them visible on neighbouring playable ground. The renderer now omits only exterior trees whose centres fall inside an adjacent playable rectangle: 54 from Grove and 56 from Azure. Native trees, colliders, roads, heights and planting data are unchanged.

Resident cells already kept distant branches out of traversal, but each retained long batch still used a loose enclosing sphere in camera/shadow passes. Each static drawable now reuses its conservative padded world-space box in both passes. Wind, water and outline bounds remain included; root transforms and quality/disposal restoration are covered. Authored per-object culling overrides are excluded from flattening.

Medium still uses its existing 1.5 maximum pixel ratio, 1024 shadow map and multisampled screen grade. No baked/static shadow cache is added in this change.

## Fixed-view submission counts

Frontier native position `[204, 0]`, seed 5, frozen time 12, viewport 1180 × 740, device scale 2, effective Medium DPR 1.5. Counts below are four measured draws divided by four after a warm-up. The GL probe counts submitted `TRIANGLES`, including instances; other primitive modes are not included. Raw diagnostic variants and software timing samples are in [before-report.json](before-report.json) and [after-report.json](after-report.json).

| Pass | Baseline triangles/frame | Final triangles/frame | Reduction | Baseline → final calls/frame |
|---|---:|---:|---:|---:|
| Directional shadow | 764,396 | 257,300 | 66.3% | 154 → 135 |
| Scene colour | 800,294 | 251,683 | 68.6% | 221 → 185 |

These are workload counts for this camp view, not FPS gains. Chromium 141 / ANGLE SwiftShader cannot establish real iPad FPS, battery use or frame pacing. The no-shadow/no-post variants are probe-only toggles; production quality settings are unchanged.

## Visual inspection

Acceptance criteria: the Frontier paving/path, well and player stay visible without neighbouring backdrop trunks; native foliage and soft toon shading remain; fountain spray and shore surfaces have no visible clipping; shadow culling retains objects whose shaded pixels are in view.

The reviewer inspected the exact images linked below. The baseline reproduced the reported canopy/trunks across paving and obscured well. The final camp clears that overlap while retaining the stalls, well, lanterns and ground. The forest joins retain native trees/grass and continuous roads. Fountain arcs, shoreline, actor shadows and prop outlines show no new visible clipping in these views.

| Capture | Inspected content |
|---|---|
| [Before](before.png) / [after](after.png) | Same Frontier camp camera; intentional removal of neighbouring exterior forest |
| [Workbench](workbench.png) | Frontier crafting NPC, marker, feet and nearby paving visible |
| [Grove camp](grove-camp.png) | Native settlement dressing, grass and lantern shadows |
| [Azure fountain](azure-fountain.png) | Water, spray arcs, outlines and NPC shadows |
| [Azure shore](azure-shore.png) | Shore/water, actor and wreck shadows |
| [Forest join](forest-join.png) / [Grove–coast join](grove-coast-join.png) | Roads, native foliage and shadows after input-driven crossings |

An additional same-scene comparison temporarily restores the old sphere test, draws and reads pixels, then restores the final box test and repeats. Zero differing colour channels at Frontier camp, Grove camp, Azure fountain and Azure shore; nonzero readbacks and GL error 0. This tests the culling optimisation in these sampled settled views, not pixel identity of the intentional tree removal or the whole world. Cosmetic character appearance can differ between the separate baseline/final sessions. Paused diagnostic fixtures can retain the previous HUD location/quest text. Visual inspection used stills; no normal-speed playback or hardware smoothness claim is made.

## Verification and limits

- Production build passes, with the existing bundle-size warning.
- Full core checkpoint: 576/576 pass. Final authored-culling guard: 24/24 focused spatial, rendering and region-lifetime checks pass.
- New real-world exterior-tree regression passes. The complete terrain-domain file has 6 passes and one existing closed-skirt height equality failure. The same ~0.228 mm mismatch reproduces with unmodified baseline source; native heights/tolerance are not changed here.
- Medium Chromium native-input walkthrough passes all three joins with zero extra scene-build steps, persistent world/actors and real touch movement/release; runtime errors 0. Exact report: [walk-report.json](walk-report.json).
- `git diff --check` and capture-script syntax check pass. Broad Chromium/WebKit smoke is owned by CI; real iPad sustained performance remains unmeasured. This is ready for draft/owner review within the sampled scope, not a merge or deployment claim.

To repeat the fixed-view probe, build the project and run `NODE_USE_ENV_PROXY=0 node scripts/capture-camp-medium.mjs` from the repository root. Optional `CHROMIUM_EXECUTABLE`, `PROBE_OUT` and `PROBE_DIST` select the browser, output directory and already-built baseline. Only the browser test fixture changes quality toggles, time and actor placement.

No Jev request was needed: direct reads traced `terrain-domain` → `region` → `environment`, and `resident-world` → `spatial-region` → Three's native camera/shadow culling, including data, restoration, tests and Godot contracts. No core/save/UI contracts changed. Source discovery has no unresolved dependency requiring ranking.
