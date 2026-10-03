# Approved V3 city integration

Base: `85fe85a70cdae43376aec811a2767f366e8587b6` (merged PR 47, after PR 46).
The imported city is the approved V3 frontages base with only
`AC_Home_Balcony_026` rotated east. No V4 layout or layout generator is used.

## Input identity

The actual approved browser-fallback attachment was extracted and hashed before
implementation. The exact overview and house close-up pixels were inspected.

| File | Bytes | SHA256 |
|---|---:|---|
| Approved_City_V3_Input_Files.zip | 8,262,320 | fece0b73f20be3da1daebf1795975d7816f12303a50c3e88a2e38fa1731dd1af |
| Azure_Coast_Selected_V3_One_House_GLB.zip | 1,197,265 | e6aef5246e3fbfdd884ca3566d12d31f4313c50bcfcf8ec41c28406ba783b753 |
| Azure_Coast_Selected_V3_One_House_Rotated.blend | 1,999,371 | 569b6f9070f9032d82248cac4e89abb2a13d9a250f8dbcac19d39aa9b5036633 |
| 01_Selected_Base_One_House_Rotated.png | 3,270,198 | 1b39d285fc697be49f5952737858d23c0499319653bceb63ad831c166037f5d9 |
| 02_Rotated_House_Closeup.png | 1,894,748 | d29c533267f8dfb8bdd0cc5609e537b24aac866e8682c3e1cb6fec5cfed96680 |

Producer README and `minimal_diff_validation.json` were inspected. The producer's
saved-file comparison reports one changed matrix among 960 objects and no V4
carryover. We verified the supplied file identity and the exported house matrix;
we did not independently compare an unavailable earlier Blender base.

## Placement and gameplay

All imported nodes retain their source transforms. One common translation
`[72.32, 0.76, 41.2]`, with no scaling or rotation, aligns the large fountain with
existing town anchor `[62,22]`. The city overlays the existing beach-map town.
Original native terrain grading, coastline data, western spawn, ponds, and leafy
town trees are preserved. The imported paved platform and quay tops provide
additional walk surfaces; the original coastline is still the native water/terrain
baseline beneath and outside this platform. Prototype sea and tree GLBs are
excluded. Existing wooden boat models are retained once each; five newly covered
berths are moved to open water beside source piers.

Procedural old-town buildings, counters, old quay/pier geometry and old lighthouse
are replaced, so they do not overlap the imported city. The minimap uses source
street loops, body footprints, source piers and the large fountain.

Plaster/brick body bounds, wall segments, towers, stalls, benches, fountain and
lighthouse plinth supply collision. Roof overhangs are not building colliders.
All 63 source building approaches are open. Crafting and trainer functionality
use the source forge/guild entrance anchors; the other facilities remain visual.
Two existing residents move less than one metre to avoid source scenery.
The fountain occupies the old centre; the safe town respawn is `[62,30]`.
Original onboarding, waypoints, quests, saves, combat and progression remain.
Valid saved positions remain valid; existing blocked-position fallback handles
obsolete positions without changing saved character progression.

Eleven source piers are retained. Three narrow native timber shore joins bridge
source gaps without moving imported nodes. Dock footprints cover adjacent boards
as one support envelope. The city permits steps up to 0.4 m between supported
source surfaces (quay coping and the 0.35 m lighthouse island step); outside-town
slope rules and water blocking remain unchanged.

## Asset preparation and ownership

Run `python scripts/prepare-city-v3.py <approved-package>/glb` with Python and NumPy.
The script requires all 13 original GLB chunks. It excludes Sea/Trees, removes
unused UV/tangent buffers, and asserts exact retained position/normal/colour/index
arrays and node transforms. It writes 11 runtime chunks, 5,454,368 bytes and
263,189 placed source triangles. Source chunk hashes and runtime hashes are in
`data/city-v3.json`; node transforms/bounds are in
`docs/city-v3-source-provenance.json`.

Navigation/minimap road metadata removes redundant samples with a maximum
0.5 mm tolerance; rendered geometry is not simplified. Source polygon holes use
even-odd filling. Runtime materials share native toon shading; native contour
hulls and feature edges are batched by material and 24 m cell. The static city
loads once, persists across character attachment, and does not regenerate.
The one-time water-contact bake runs after native hulls and imported waterline
geometry exist. Loading remains covered until assets and contacts are ready;
asset failure leaves a visible retry message.

Native terrain quads fully hidden under an opaque source slab are omitted from
render indices only. All native heights/attributes, navigation, collision and
coastline remain unchanged; native peaks and a conservative full-cell slab edge
band remain rendered. This avoids shading hidden terrain without changing the
approved city assets or appearance. Focused coverage tests verify concave edges,
native peaks and every omitted real-map quad.

## Validation

`tests/core/city.test.js` verifies asset hashes, the exact east-facing matrix,
collisions, actual traversal to every entry/pier/functional anchor/waypoint,
native placement, and preserved save/Job/EXP data. Its independent navigation
probe checks real actor movement at both fine and normal step sizes; it does not
create streets or change the approved layout. Historical procedural harbor art
checks continue against a preserved pre-city fixture rather than asserting that
replaced geometry still exists.

`tests/browser/city-review.mjs` exercises native touch, safe beach arrival,
actual onboarding, forge/guild interactions and all source piers in the real game,
then captures gameplay, ARPG and top-down source views and a static-resource probe.
Existing capture/layout/live-Dreamloop entrypoints select this city walkthrough.
Full smoke, reviewed journal persistence and fullscreen regressions remain
separate checks. There are no repository lint or type-check scripts.

Performance comparisons must identify exact commits, matching camera/quality/
viewport and renderer. Chromium SwiftShader timings are software-renderer samples,
not physical phone/iPad FPS. Real-device mobile performance remains unmeasured.
