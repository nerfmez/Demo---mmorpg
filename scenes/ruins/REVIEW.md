# Ruins rebuild — 23 October 2026

Reference: `../concepts/ruins-approach-40deg.jpg`. Approved beach and forest
standalone scenes are the style and interaction baseline. This is a replacement
of the standalone ruins scene, not an edit to the game's world.

Observable acceptance criteria, defined before rebuilding:

- The foreground trail curves right, climbs a shallow paved approach and opens
  into the ring court. The route is continuous and wide enough for touch walking.
- The left ridge has overlapping fractured stone strata, irregular shoulders,
  grass growing on top and greenery in joints; no smooth vertical tube wall.
- The central rear arch has a clean open passage, fitted wedge stones and
  bonded masonry. Broken walls and pillars have distinct, worn silhouettes.
- The circular court and its low standing stone remain visible. Trees frame the
  perimeter without hiding the arch, court or approach.
- Use the approved scene's game foliage, hero and three-tone materials. Keep
  generous walking space and the 40-degree camera, rather than copying the
  painted image's inconsistent perspective literally.
- Inspect the actual rebuilt page at desktop and iPad sizes, plus movement,
  the comparison slider and the scene at different animation times. Preserve
  the approved beach/forest sources byte for byte.

Final artifact identity, review findings and validation are recorded below
after the final capture.

## Delivered result

[Owner-private interactive preview](https://frontier-ruins-review-oct23.ballboy-lnw.chatgpt.site).
The page includes its Three 0.170 modules, approved scene hero and reference;
it needs no CDN. The comparison slider and tap-to-walk remain available.

Source base: `a3f60a223bb2e4c1c45bb2618855b23ecef447c4` (PR #137).
The exact runtime HTML SHA-256 is
`532a41fcb5cb0629dc39567cf10f5d670fec96869074a3b618866e79a24ad7b2`.
[identity.json](review/identity.json) identifies sources, captures and reports.

The old rotated rectangular arch stones are replaced by thirteen fitted,
bevelled wedge stones. Bonded wall courses, chipped block edges and hairline
fractures share a grey-green stone palette. The ridge has recessed shelves,
offset fractures and vegetation in its joints. Low irregular slabs follow a
continuous ramp and landing; the court is a level standing surface. Existing
game foliage, hero, 40° camera and generous K=2.4 space are retained.

## Inspection and corrections

Inspected the exact final runtime at time 12 s in Chromium/SwiftShader:

- [Desktop scene](review/scene.png), 1672×941 stage in a 1720×1060 viewport:
  open arch and ring remain readable; the foreground trail leads around the
  ridge to the ramp; trees frame the architecture without covering the passage.
- [iPad landscape](review/ipad.png), 1180×820 viewport, and
  [portrait](review/ipad-portrait.png), 820×1180 viewport: the complete composition
  retains the reference aspect ratio. The comparison controls also worked in
  the actual page; the 50/50 wipe was inspected separately.
- [Reference above / rebuilt scene below](latest-vs-concept.png) is the updated
  comparison, replacing the superseded capture.

Faults found and fixed: the first merged arch geometry had a mismatched UV
attribute; the mesh batches now agree. Prototypes exposed striped stone
self-shadowing and overly repetitive paving. Surface-slope shadow depth offset,
lighter outlines and irregular, mostly flush slabs reduce those defects.
The walk-through then exposed an abrupt heightfield lip after the final slab
and a drop at the landing's side. The landing now continues into the level
court and its shoulders blend on both sides. All nine native touch destinations
now reach within 0.10 m of their requested ground point, including the court and
arch opening; no destination ends blocked. See [walk.json](review/walk.json).

The final static criteria above pass within these inspected views. This is ready
for the owner's visual verdict; it is not recorded as owner-approved.

## Validation and limits

- Assembly, embedded-module build, generated JavaScript syntax, Python syntax
  and `git diff --check` pass.
- The exact final HTML renders without recorded runtime, asset or shader errors;
  [report.json](review/report.json) records viewports and render state.
- Native touchscreen taps select real ground destinations. The production
  walker was advanced at 60 fixed steps/second for the nine-leg route to avoid
  treating software-GPU wall time as a device frame rate.
- Approved `beach/`, `forest/`, `concepts/`, and game `src/` and `data/` are
  byte-identical to the source base. No core/gameplay tests were needed for this
  isolated scene change. No Jev request: direct reads resolved the scene builder,
  shared materials, terrain, movement, reference and capture contracts.
- Review used frozen-time stills and sampled production movement, rather than a
  claim of continuous normal-speed playback. Earlier prototypes ran the normal
  render loop. WebKit is not installed in this executor; no browser installation
  was attempted. Physical iPad rendering, smoothness and FPS remain unmeasured.
- The painting has finer weathering and denser foliage detail; the rebuilt scene
  deliberately keeps the approved game's faceted stone and painted foliage.
  Some shallow stone faces still show fine shadow-map stepping at full zoom.
  The scene is standalone; no merge into or deployment of the game is claimed.

Reproduce the final still review using
`THREE170_DIR=/path/to/three-0.170-package SCENE_STILL=1 node scenes/ruins/review.mjs`.
Add `SCENE_WALK=1` for the focused
native-touch route; `SCENE_NAV_ONLY=1` skips screenshots. The standard preview
retains its normal animation loop; only the review fixture freezes time.


## Retained owner revision — 23 October 2026

The owner requested keeping the current ruins scene and proceeding to Shell Beach.
The retained Site source is `d8455b0cb8a22054cb690f9675366ea8392ea020`. The preview is public at https://frontier-ruins-review-oct23.ballboy-lnw.chatgpt.site .

This revision shares cliff section edges, lowers the rightward ridge to the owner's drawn silhouette, buries coarse terrain backing that poked through stone, removes plants on the marked face, and adds a chipped/faceted marker with branching fractures. `scene.js` now includes those delivered changes. The approved beach and forest sources remain untouched.

Focused checks: JS syntax; finite cliff and marker geometry; all 22 ramp rows outside the buried backing; marker cosmetic RNG sequence preserved. Exact mesh before/after views were inspected with the scene camera through software rasterization. Cloud browser WebGL was disabled, so these later edits do not inherit the older full runtime screenshot claim above. No physical-device or final live lighting check was performed.
