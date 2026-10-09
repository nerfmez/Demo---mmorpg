# Coastal seam repair review

Base: `cde062bb5251066703dcb007359dfe4e5f33a15f` (latest main, including merged PR #124).
Private evidence: https://chatgpt.com/space/page_647708a2c12481919a3b1ba04473eaa8

## Reference and acceptance

The owner's attached coastal screenshot was directly inspected. The affected location
was reconstructed from the spiral shells, fan shell and shrub at global
(-156.9, 77), zoom 1, FOV 36, camera offset (0, 19, 13.5). This reproduces the
visible Azure/Frontier sand edge and interrupted waterline on unchanged main.
The original save and GPU clock are unavailable; the fixture character/HUD differs.
Before/after camera and projection matrices are exactly equal, rather than inferred
from the screen position of the seam.

Criteria: continuous sand/wet tint and shoreline across the edge; coherent foam
phase without stretched streaks; retain High cel shading, shadows and post effects;
retain native rules/ownership/contacts and #124 async streaming; leave inland seams
and landmark/UI work alone.

## Implementation and impact review

The maps meet at global X=-160. Native shoreline Z is 84 versus 79.8 and beach
width is 11 versus 20. Heights already match at the reported coast. Render-only
coast distance and beach width now meet at their average at the shared edge and
recover native values through the existing 24-unit seam band, with a back-beach
and seam-end fade. Ground wet masks and sea swash share this sample.

The confirmed map-local water phase is moved to atlas coordinates. Contact UVs
use a separate map-local varying. Authored foam scale/width and sparkle density
are reconciled only in the coastal band. Fixed-scale foam samples are blended:
interpolating their world-space scale caused long stripes during visual iteration.

Reviewed callers: region assembly and its deferred city-water import pass the same
render domain; terrain fills the per-world surface cache before grass, meadow and
city-ground consume it. Existing domain height/ownership/groundHeight paths are
unchanged. Ground paint already uses atlas noise. No core/data/save/collider,
landmark or UI files change. Native Azure dry / Frontier water at (-160, 80)
remains deliberately unchanged. The practical limit is that the visual coast is
reconciled while gameplay classification still follows each map's authored coast.
No prop cover-up is added. PR #125 is separate and untouched.

Reviewed renderer blobs (Git SHA-1): ground.js
`7ba1c2e3d863b083df82377647eb1be968d50f17`, terrain-domain.js
`903dafd54ef77e6b9bfce8f46393211c4d0b4937`, region.js
`f659789759f18c43f5c3e314fbc3903a06491ab3`.
Final built main bundle: `main-CKnVDjX3.js`.

## Checks and visual findings

Passed:

- New `tests/render/coastal-seam.test.mjs`: 3/3, including interpolation of
  production terrain wet-mask and sea shore attributes on both sides of the edge,
  native values outside the band/inland, and preserved rule bytes/local contacts.
- Affected core suites: seam-continuity, world, maps, frame-build-queue,
  region-build-lifetime and region-shader-preparation: 49/49.
- Production build; existing bundle-size warning remains.
- Focused production browser case `tests/browser/coastal-seam.mjs`: High,
  DPR 1, post enabled, 2048 shadow maps, normal 6 ms build budget. Real main-loop
  walking west into Frontier and east into Azure; 43 movement samples without
  coordinate hops, character ID/gold/gear/skills preserved. Real neighbour
  eviction/disposal and async reload installed a new ready region. Zero sync and
  129 async GPU readbacks. No page/console/GL errors or context loss.
- Direct pixel review after the final shader edit of every PNG listed below.
  Shoreline pairs use time 10.5 and 9 at 2048x1280; retreat time 13;
  inland (-166, -92), time 12. Crossing/reload endpoints use 844x528.

The sand-tone discontinuity and truncated waterline are absent in the final
shoreline views. Foam fragments have a coherent transition and no long stretched
stripes. Shadows, shell/shrub anchors, cel shading and water translucency retain
the current High look. Crossing/reload endpoints show a complete beach.
The inland terrain sample has no introduced coastal blend: native sampling tests
pass, and road/paving patches at (620,730)-(1050,810) and
(50,750)-(300,1000) are pixel-identical. Actor/grass animation differs between
runs, so whole-image byte equality is not claimed.

Failed, preexisting:

- Existing `tests/render/terrain-domain.test.mjs`: 2/4 pass, 2/4 fail identically
  on unchanged cde062bb. Northern ownership expects Frontier where actual owner
  is Moonroot; inland cut-face Z=-120 compares 0.400000006 with 0.409999996.
  These were reproduced in an isolated baseline checkout and left outside scope.
- An initial browser eviction fixture was only 70 units inside the edge, inside
  STREAM_OUT=200. Corrected to 260 units inside; the final run passes. This was
  a test fixture failure, not a disposal implementation change.

Not run/limits: broad CI, AI review runs, WebKit/Safari, physical iPad and hardware
FPS. Chromium uses SwiftShader; no hardware performance claim. Normal game time
was exercised for walking, but visual review is sampled PNG inspection, not
continuous video playback. No merge or deployment performed. Status: draft for
owner review, with the above verification limits.

## Exact delivered artifacts

These are newly captured game outputs, not copies of the private input. All ten
were uploaded to the owner-only private Page, read back as actual image content,
and matched the local byte count and SHA-256. The Page's native Markdown image
references were read back; Page layout was not browser-rendered. A bulk artifact
upload endpoint rejected a text Page; the supported Page Files endpoint succeeded.

| Artifact | SHA-256 |
| --- | --- |
| final-before/reference.png | `a2f5a092c1a36fb35ab752deeea0dc8a0c4ae6e4e27fdf66632f9a876ea59da4` |
| review/reference.png | `16f0d5ee0517422d75a7d876052d89659aa099a31b9b553a05158e1d9de421c6` |
| final-before/shore-phase.png | `e4c38c5b3c5d123d2de252228923f6ca30eb88b0ce5714dfe35782b2f5e4ab78` |
| review/foam.png | `0045737f81f652aee9d1f577ed5fce7bba300c55cab114c011086b852b87b07f` |
| review/retreat.png | `7da58e392cdc8271ede6fda53255950d06a598c220b96c97ed6305879f0bdf77` |
| final-before/inland.png | `783cffee74353bf6a563158abd80800c13641270a37b4d4b1d10f19bcf5470c5` |
| review/inland.png | `c05cff26b4e50062894b16d924f04b522801a3789c967bef9bf7bce9d0e911dd` |
| review/walk-west.png | `a874c9acf0ec9898928e24cdbb9a11ebe4f18916db740c91a3c4a2e777a88dec` |
| review/walk-east.png | `3200d802bf56aeffae3f15bcae823af9c70df125048f103844259b82b3f88400` |
| review/reloaded.png | `26359a1333a62120341dcca46773f96ece06031aee3aff0001704d7bbd06d5fb` |

## Focused reproduction

`npm run build`, then start a local Vite production preview. Run:

```sh
COAST_URL=http://127.0.0.1:4177/ COAST_OUT=/tmp/coastal-review \
CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/coastal-seam.mjs
node --test --test-isolation=none tests/render/coastal-seam.test.mjs
```

Use `COAST_WALK=0` for baseline still captures. The browser test does not save the
fresh fixture. Its capture/queue-only stages pause gameplay; crossing stages use
the normal main frame loop. Eviction uses fixture placement after both walks.
