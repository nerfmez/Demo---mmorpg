# Renderer pass: coherent light, runtime quality and wind shadows

## Scope
Presentation only, based on main `58bc3db4f929eb699b2e5d40fac43638b0151ccb`.
Do not replace the HUD, skill art, gem art, model assets, geometry, gameplay rules,
saves, map layout or camera. No post-processing, bloom, HDRI, AO or WebGPU migration.

## One lighting source
`data/rendering.json` now owns lighting and quality. `lighting.active=daylight` is
used by the default anime appearance. `?art=baseline` explicitly selects `legacy`
from the SAME file; it is an art comparison, not a second implicit source.
Removed the obsolete `data/art.json.anime.light` and `world.json.presentation`.
All other world/art values are unchanged.
Daylight retains the prior sky, ground and sun colours. Ambient is 1.50 (was 1.65),
sun 1.65 (was 1.45), shadow intensity .62 (was .56). These are initial art-review
settings, not a claim that brighter/darker is always better.

## Consistent runtime quality
High uses up to DPR 2 / 2048px shadows, Medium DPR 1.5 / 1024px, Low DPR 1 / no shadows.
Changing tier disposes the previous shadow render target and marks the new one dirty.
Materials, including material arrays, are updated once when shadows toggle.
Native antialiasing is intentionally a fixed context-wide request across ALL tiers.
It is not a fake runtime switch: the actual value comes from getContextAttributes().
Low therefore still requests native AA; its budget reductions are resolution and
shadows. No canvas/context recreation, lost input handlers or AA post pass.
On unsupported devices the browser may report antialias=false consistently.

## Actors and painted foliage
Imported hero and monster body meshes receive scene shadows. Outline hulls do not.
Painted foliage and trunks retain their exact texture/vertex paint, geometry and
palette. A Lambert shader shell supplies Three's shadow machinery; its final light
is replaced with painted colour times bounded scene tint and a restrained shadow
mask. This avoids shading every leaf card as a separate lit board.
Shadow influence is .28, not a full second bake of illumination. Low quality does
not sample shadow maps. This adds shadow sampling to painted foliage in higher
presets; it is not free and must be measured on the owner's iPad.

## Matching wind in the shadow pass
The existing wind equation is reused by customDepthMaterial. Depth uses identical
amplitude, base height, instance transform, alpha map/test and shared uTime.
Camera-space see-through dither is excluded: hiding a tree for visibility must not
move a hole through its physical shadow. Depth materials are shared per fill
material and disposed when that fill material is disposed. No extra scene draw pass
beyond the already existing sun shadow pass. Non-shadow-casting grass is unchanged.

## Checks
- `npm test` includes lighting authority, runtime target disposal/reallocation,
  alpha/deformation parity, painted/wind patch composition and actor/art guards.
- `node tests/browser/render-light.mjs`: high-quality real renders at identical
  seed/time/positions, shader errors, actual model receiving flags, shared wind
  shadow setup, repeated High/Medium/Low target sizes and GPU texture plateau.
- `.github/workflows/render-light.yml`: compares the pinned unmodified baseline
  with current code in Chromium and WebKit, plus smoke/UX checks. It runs in the
  same pinned Playwright container as CI (browsers preinstalled, no per-run apt
  download) and serves the baseline build with `scripts/static-serve.mjs`. It is
  selected only when a light/scene file changes (`LIGHT_FILES` in
  `scripts/ci-scope.mjs`); monster rigs, animation and strike effects live in
  their own modules (`monsters*.js`, `monster-*.js`) and do not select it.
- Screenshots and draw counts are review evidence, not device FPS. Software GL
  timings must never be advertised as iPad performance or a 60-FPS guarantee.
