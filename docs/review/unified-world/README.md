# Unified world delivery review

The initial review below is retained with its original artifact identity. See the [PR #131 follow-up](pr131-followup.md) for the subsequent city-navigation, quest-route and saved-startup fixes and their exact validation evidence.

The captured production build is `main-CR9Mp2xF.js` with `main-D4oOXd4z.css`, based on main `2c377ab86f4a22327d6ddc33902993eca5be4071`. SHA-256 identities for the build and exact screenshots are in [identity.json](identity.json); measured runtime state is in [report.json](report.json). Source implementation and tradeoffs: [unified resident world](../../perf/unified-resident-world.md).

## Measured scope

| Measurement | Result | Meaning |
|---|---:|---|
| Static regional geometry buffers before packing | 136,238,292 bytes | Sum of each region's unique attribute/index/morph storage |
| Same buffers after packing | 95,772,548 bytes | Same vertices, topology, UVs and scenery |
| Buffer reduction | 40,465,744 bytes / 29.7% | This does not measure total process RAM or total GPU allocation |
| Static drawables at the ground comparison view | 4,566 total / 169 attached | 96.3% leave scene traversal in this view; not a universal CPU/FPS percentage |
| Actual keyboard boundary crossings | 3 / 3 | Same world and actor population; zero additional scene-build queue steps |
| Native Chromium touch movement/release | Pass | Production input handlers, not a fabricated game input vector |
| Captured runtime errors | 0 | Console/page errors checked through crossings and town captures |
| Maximum packed component error | Normal 0.00001526; unit color/mask 0.00000763 | Normalized integer component error; not subjective image-quality scoring |
| Resolution governor floor | 95% per dimension | At most 9.75% fewer pixels within the selected preset |

All three scenes were imported-ready, spatially prepared and GPU-warmed before play. The software renderer took 54.39 s for this cold startup. This timing is only a local automation observation; it is not an iPad performance estimate. All-world residency increases the retained scene scope relative to the old one-region policy. No claim of lower total RAM, battery use, real-device FPS or a mathematically proven subjective 10% quality bound is made.

## Visual review of the exact artifacts

The root reviewer inspected 01–05 and both town captures; an independent reviewer inspected the final 03, 05, 07 and 08. The earlier ground view was compared against the baseline at the same camera coordinates. Terrain/grass placement, shore and shading showed no visible density or texture reduction. Character portrait/appearance and the test health guard differ, so the full HUD image is not a pixel-equivalence test.

| Artifact | Viewport | Review |
|---|---|---|
| [01-high-ground.png](01-high-ground.png), [baseline](baseline-high-ground.png) | 844 × 390 | Same camera; terrain/grass/shore comparison. First frame uses an unlimited-health test fixture. |
| [02-coastal-join.png](02-coastal-join.png) | 844 × 390 | Continuous terrain, populated trees and shadows after Azure→Frontier crossing |
| [03-forest-join.png](03-forest-join.png) | 844 × 390 | Hard rectangular road cutoff found and fixed; road now continues through the gate and softly returns to meadow |
| [04-grove-coast-join.png](04-grove-coast-join.png) | 844 × 390 | Continuous road/ground at Grove→Azure boundary |
| [05-ipad-high.png](05-ipad-high.png) | 1194 × 834 | No missing terrain/grass bands or visible culling edge; settled resize places joystick at bottom-left |
| [06-desktop-high.png](06-desktop-high.png) | 1440 × 900 | Additional captured desktop layout; artifact available, not counted as independently inspected |
| [07-frontier-town.png](07-frontier-town.png) | 1194 × 834 | Workbench, glow marker, trees and ground align; foliage obscures NPCs. Paused fixture leaves the HUD's previous region label. |
| [08-azure-town.png](08-azure-town.png) | 1194 × 834 | Visible smith's feet/shadow and interaction marker align; no displaced cloth visible |

No major visible blocker was found in the inspected final views. The road correction keeps every native meadow clump and flower position/count, verified against the native planting mask. Scarves are not clearly exposed in these town shots; translated-parent, rotated-parent, sleeping-reentry and scene-owned scarf contracts are covered by technical tests, not claimed as a complete visual scarf review. Screenshots do not establish continuous hardware frame pacing or whole-world coverage.

## Technical verification

- Production build passes; existing large-chunk warning remains.
- Focused unified world/navigation, startup, spatial visibility, buffer ownership/precision, camera sleeping, look-cache and scarf checks: 41/41 at the integration checkpoint. The later startup shader/state change passes its complete 7/7 checks; HUD origin-boss regression passes 5/5. Unchanged passing checks were reused.
- Initial full core run: 536/541 passed. Its five failures were obsolete startup harness expectations. The updated production readiness harness and its added grass/shader cases now pass; a second unrelated full run was not performed.
- Final terrain-domain file: 5/6 pass. The strict authored corner-height equality check still fails; the same native profile mismatch reproduces against baseline source. Stale two-map ownership fixtures were corrected to Grove ownership. Native playable heights were not changed and the tolerance was not relaxed.
- Additional coastal/ground verification passes 6/6; earlier region/shader/disposal integration passes 26/26.
- Browser `open-world.mjs` passes on Chromium 141 / ANGLE SwiftShader at High, including all three native-input joins, combat/readiness-gate bypass, persistent actors, touch and resize captures.
- Updated saved-slot Continue and imported-city browser cases pass syntax review; their full Chromium/WebKit runs are delegated to CI. Local WebKit and real iPad hardware were not available.
- `git diff --check` passes. Required CI/device review remains pending before merge; this evidence is for a draft review, not a release certification.

No Jev request was needed: affected sources, callers, tests and port contracts were resolved through direct repository reads at the recorded base and local diff.
