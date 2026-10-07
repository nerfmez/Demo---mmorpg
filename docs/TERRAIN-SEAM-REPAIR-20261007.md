# Finite terrain seam repair — 7 October 2026

Baseline: `380e3b077d422e968e0d8558e0cbdf255f9a8211`.
Branch: `fix/live-seam-ownership-20261007`. This repair is separate from draft PR98.

## Actual reproduction and cause

At global player/camera position `(-162,-200)` in Frontier, Chromium and Linux
WebKit render a straight terrain edge, cyan sky and trees over the missing ground.
At `(-162,-140)` the same route shows a high rectangular gray-green shelf with a
cyan gap beside it. Both regions and city imports are ready in these captures.
This reproduces the exposed-plane/gap pattern described by the parent's actual
JPEG inspection; the owner's exact screenshot coordinates are not established.

The rendered ownership cut previously used an infinite half-plane at global
X=-160. Azure's heightfield begins at global Z=-160. Frontier reaches farther
north and its decorative margin extends east to X=-120. The cut removed that
margin even where Azure has no replacement triangles. Actual terrain raycasts
find no surface at `(-150,-200)` on the baseline.

Where both grids do exist outside the northern walkable span, their independently
generated decorative skirts also disagree. At `(-160,-160)`, Azure's edge is
18.7088566 m and Frontier's is 1.1088482 m: a 17.6000084 m discontinuity. The shared
open-span profile does not join these closed-end decorative heights.

## Change and preservation constraints

`terrain-domain.js` limits terrain replacement to the neighbour's actual finite
heightfield footprint. Frontier retains its original margin where Azure has no
grid. Where both grids exist, the terrain still has one owner. Water aprons keep
their existing full-edge triangle clipping.

The owning map's decorative skirt contracts toward the adjacent playable map's
height samples. At its finite grid cap it matches the entire retained margin;
near the playable corner the correction contracts continuously to the shared
edge. These are private render samples, not edits to rule-world heightfields.
Playable vertices, including boundary vertices, retain their original heights.
Terrain normals are derived from the corrected render samples.

All scenery instances remain. Border trees that belong to one map's cosmetic
layout but stand over the other's terrain use the actual rendered owner's height.
The seed, tree positions in XZ, species, scales, palettes and material/texture
ownership are unchanged. No fog, shader discard, added covering slab, changed
quality preset or removed feature conceals the hole.

The two current maps have aligned one-metre grids. The tested finite partition
uses those production grid boundaries; this is not a general irregular-world or
arbitrary-grid tessellator. Gameplay, collision, gates, water rules, save schema,
UI and CI are unchanged.

## Executed validation

- Production build passed.
- 45 focused checks passed: actual terrain-builder coverage, shared edge/grid-cap
  height, preserved playable samples/rule bytes, borrowed tree roots, existing
  seam/game routes, world/maps, stream geometry and region lifetime/readiness.
- The four final terrain-domain tests also passed independently. Against the
  actual baseline terrain builder, the coverage and rendered-edge tests fail.
  The Node-only test loader adds JSON import attributes for a pre-existing
  renderer dependency; no production import/CI/package workaround was added.
- Actual game captures at five positions passed in Chromium and Linux WebKit.
  All 60 terrain ray locations have coverage after the repair; eleven sampled
  holes existed before. No page/GL/context error or leftover render target was
  recorded. The gate and coast were included as unchanged control views.

Evidence is saved under `/workspace/render-bug-evidence/`: `seam-before-close/`,
`seam-after-close/`, `seam-before-webkit/`, `seam-after-webkit/`,
`seam-focused-tests.log`, `seam-domain-final.log`, `seam-baseline-regression.log`
and `seam-build-after.log`.

## Visual review record and remaining issues

The actual 1180x820 medium-quality stills were inspected separately from tests:

| View | Before PNG SHA-256 | After PNG SHA-256 |
| --- | --- | --- |
| Chromium northern hole | `558f1e51a0acf87177d61422e0493e1639686b37043937f7517a9ba3af574371` | `e06cb3a7296fc3f799c64dacaba537fb726ef9c9462c9bb78f70d4ff6d77bcd6` |
| Chromium skirt face | `7f4d45f3042fa39150482602333b5cb63254db26cfab4f2bab5afed003c2a51b` | `4624a7d658dc3834486668e2874eda82746dcb02c6c6f8fdf005699987558234` |
| WebKit skirt face | `dee2852d38b31f955afaf0e1a6dce1de97477b75befe37b0712e0202a8c34247` | `72fe89b43e0472cee4d1d8ec702c7b486a70e8a7e50fe9ff822ee2a7cca8638b` |

Criteria: actual ground must cover the cyan void; adjoining skirts must meet;
trees must retain their density and stand on rendered terrain; the accepted
forest/dither effects, player, terrain materials and HUD must remain. The observed
hole and high rectangular cut are gone. Ground coverage and edge-height checks
support that conclusion independently of canopy occlusion. Review used sampled
stills, not normal-speed video or physical iPad/Safari Metal hardware.

The original black-wolf/blank-minimap event remains unconfirmed. A separate
elapsed-time current-main scenario runs the natural frame loop, public seam API,
normal HUD/portrait refresh and region/cache eviction. Its failures and both
elapsed/simulation clocks are retained, not treated as ordinary iPad gameplay.
PR98's WebKit black grass-root bake and toon cleanup fixes remain separate;
black grass roots are still visible in this main-based WebKit seam branch.

The separate coastal rule mismatch at global `(-160,80)` also remains:
Azure classifies it as dry while Frontier classifies it as water, despite equal
edge height. This render-only change deliberately does not retune that gameplay
contract. No common cause is assigned to that mismatch, the black wolves, the
minimap or the earlier invalid-WebGLShader exception.

Source JPEG transfers were denied in this executor; their pixel observations
came from the parent reviewer. Denied transfer routes were not retried or changed.
Decision: verified local scenery repair for draft review; the incident remains
open for the original time-dependent symptoms and physical-device evidence.
