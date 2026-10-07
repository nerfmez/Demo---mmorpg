# Rendering incident investigation — 7 October 2026

This draft addresses two reproduced renderer defects. It does **not** establish
that either defect caused the owner's black wolves or blank minimap. Those two
reported symptoms remain unresolved, as do the previously recorded decorative
terrain skirt/coastal ownership issues.

Baseline: `380e3b077d422e968e0d8558e0cbdf255f9a8211`.
Patch: `8e1956e331ebe176168a93b5dedfdc63a337a2d3` (code and regression checks).

## Reproduced: black grass roots in WebKit

The actual medium-quality scene on Linux Playwright WebKit 26 baked all 54,859
grass-root colors to RGB zero. Its lawn-tip colors retained data. Chromium
141 baked both layers with color. Neither engine reported a WebGL error or
context loss during this sample.

An isolated point draw using the production brush texture and ground shader
distinguished the sampling paths. Repeating the draw did not change the result:

| Point shader / pixel RGBA | Chromium | WebKit |
| --- | --- | --- |
| Implicit brush sampling | 64, 64, 0, 255 | 0, 0, 0, 255 |
| Explicit brush level 0 | 64, 64, 0, 255 | 64, 64, 0, 255 |
| Ground color, implicit brush | 29, 34, 10, 255 | 0, 0, 0, 255 |
| Ground color, explicit brush level 0 | 29, 34, 10, 255 | 29, 34, 10, 255 |

The point bake has no continuous surface footprint for implicit mipmapped,
anisotropic brush sampling. The patch selects the full-resolution brush level
only for this bake. Runtime terrain/deck shaders retain implicit footprint
sampling; texture resolution, anisotropy, grass density, shadows, post-processing,
fog and scenery are unchanged. The full WebKit scene subsequently baked zero
black roots among the same 54,859 clumps.

This is a reproduced scenery defect, not proof of the cause of every scenery
fault in the supplied photos or of physical Safari/Metal behavior.

## Reproduced: unique toon materials survive region eviction

`disposeObject()` previously treated all non-rig toon materials as borrowed,
although `environment.js` creates unique toon fills. Disposing those fills also
owns disposal of their wind-shadow depth materials. `importJob.own()` made the
same type-based assumption. The mismatch predates PR86.

The patch marks the global `toon()` cache with `userData.shared`, then releases
unshared materials irrespective of shader type. Unique import materials are
included in transfer/cleanup; shared monster geometry/maps, toon ramp and cached
toon/outline materials stay borrowed. The core regression fails on the baseline
and passes on the patch, including deduplication and import transfer.

In the baseline Azure eviction, zero of 31 unmarked toon materials received a
dispose event. That total includes 12 cached materials which were missing their
shared flag. Two of three wind-depth materials were disposed. On the patch, all
19 actual owned toon materials and all three wind-depth materials were disposed.
The same end-position renderer had 92 programs versus 98 in the baseline.

The ownership defect is confirmed. A causal link from it to black monsters,
minimap canvas loss or GPU memory exhaustion has **not** been established.

## Validation and review limits

The focused route starts at medium quality with shadows/post-processing enabled,
streams the neighbouring map, crosses the authored gate, returns, evicts the old
region, advances gameplay and inspects grass colors and the minimap together.
`tests/browser/render-material-lifetime.mjs` repeats this twice, checks disposal
events, render-target restoration, GL/context state and geometry stabilization.
`tests/core/render-material-lifetime.test.js` tests actual ownership helpers.

The affected map/world/continuity/lifetime/geometry/grass-culling tests passed
(46 checks before the shader change; the final focused subset has 20 checks).
The production build passed. The existing pooling probe ran two rounds; its
different coast/headland views use different visible resources, so those two
samples alone are not a geometry plateau or hardware FPS measurement.

Screenshots and JSON/log evidence are saved outside the repository under
`/workspace/render-bug-evidence/`. Inspect final Chromium and WebKit captures
from the exact built patch separately from baseline captures. The images show
grass/root color, wolf materials, surrounding terrain and geographic minimap
coverage. They do not show a reproduced black-wolf/blank-minimap event. Review
uses sampled stills, not continuous normal-speed playback.

The three supplied Library JPEG transfers each failed once with the complete
error `library file transfer failed: download failed with HTTP status 403`.
No alternate download route or authorization bypass was attempted. Source-photo
observations came from the parent image reviewer, not local pixel inspection.

Linux WebKit and Chromium use software rendering here. No physical iPad, Safari
Metal backend, iPad memory limit or iPad frame rate was tested. The earlier
`shaderSource`/invalid `WebGLShader` iPad exception did not recur in these probes
and is not assigned to this defect. The minimap uses a separate Canvas2D image,
not the Three.js grass/post render targets; no canvas-size-limit cause is claimed.

Direct source inspection covered main/HUD/map-image flow, region construction
and placement, clipping, imported ownership, pooling/disposal, monster skin and
material creation, grass bake/culling, shared ground paint/brush, shadow materials
and post-processing. Jev was not invoked: these source contracts were resolved
with direct reads/searches. No game rules, save shape, UI, CI or deployment files
changed. No merge or deployment is authorized by this draft.

Decision: interim fix for the reproduced WebKit grass bake and material cleanup;
the original report remains open for physical-device evidence and location-matched
scenery reproduction.
