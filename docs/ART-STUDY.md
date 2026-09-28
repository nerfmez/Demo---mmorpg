# Frontier town and meadow art study

**Current status:** owner rejected the round, individually-leafed preview. New local
revision uses connected jagged foliage patches, based on the owner's IMG_0639.webp
example. It is still awaiting image review; do not merge/deploy.

## Trunk and colour revision

The owner requested new trunk geometry and colour. The opt-in sample now uses an
art-directed tapered spine, three buttress roots, and branches connecting to the
existing foliage groups. `data/art.json → anime.trunk` owns the spine/root paths,
crease placement, radial count and outline width. Separate warm red-brown trunk
light/mid/shadow/line colours leave house timber and foliage colours untouched.
Broad vertex-painted facets replace the old bark-noise shader. A few tapered crease
strokes and a thin same-hue silhouette outline define the wood without dense stripes.
The old trunk and duplicate upper branch geometry are excluded within the preview.
Birch trunk proportions follow the existing narrower/taller crown transform.

`DREAMLOOP_TRUNK_REVIEW=1` captures a closer oblique WebGL-canvas view of the same
in-game specimen after the standard shots. It is labelled a diagnostic close-up,
not a change to the gameplay camera. Owner image review remains pending.
Build and Chromium Dreamloop trunk-v2 pass; gameplay and trunk close-up were
visually inspected. Overview counters: 583,800 triangles / 309 calls, including shadows.

## Volume correction after owner feedback

The owner requested that the known flatness be fixed, rather than merely noted.
Jagged patches now have a tessellated shallow arch and curved vertex normals.
They intersect the authored branch volumes with multiple inclinations and azimuths,
without a camera-facing bias. A tested spherical-shell arrangement was rejected
internally because it read as separate balls. The final placement fills each branch
volume instead; broad lighting connects the overlapping patches.

`DREAMLOOP_ART_ORBIT=1` adds a 90-degree diagnostic camera capture after the detail
shot. This changes the test camera only, never the gameplay camera. The world palette,
lighting, cottage, characters and scene positions remain as in the previous candidate.
Build and Dreamloop volume-v3 pass with no browser/shader errors; overview, grove,
close-up and side screenshots were visually inspected. Overview: 579,288 triangles
and 311 calls, including shadow work. This is not physical iPad performance evidence.

## Jagged-patch revision

The previous method repeated recognisable oval/pointed leaves over rounded cores.
The owner wants abstract, irregular torn contours that suggest foliage as a mass.
`data/art.json → anime.patchProfiles` now supplies four connected notched silhouettes;
they do not contain individually drawn leaves. Unequal bowed patches overlap through
six authored tree branch groups and four separate low shrub groups. Spherical filler
geometry was removed entirely. Branches connect the tree groups; tree and shrub
placement/size ranges differ. Shared alpha atlases retain white transparent texels to
avoid black mip fringes. Large-scale vertex lighting connects the colour masses.

World palette, cottage, sample layout, camera and characters are unchanged from the
previous preview. Remaining visual decision: density and size of the connected jagged
masses at the actual gameplay distance. No claim of matching the reference exactly.
Use the same Dreamloop command below, with `DREAMLOOP_PASS=jagged-review`.
Build and Chromium Dreamloop passed for jagged-v3 with no shader/browser errors.
The overview reports 467,736 triangles / 311 calls (including shadow rendering).
The test results in the older verification section below predate this foliage-only revision.

## Current opt-in sample

- Run `npm run dev`, then use `?fresh=1&seed=9&art=anime`. The renderer-only
  cottage specimen is centred at (-189,23); bounds/configuration are `data/art.json → anime`.
- `art=baseline` places the **same** sample props and footpath but uses the preceding
  local art and lighting. This is a controlled comparison, not the current public site.
- `anime-study.js` gives trees layered branch masses and shrubs a separate low,
  asymmetrical arrangement. Connected jagged alpha patches form the whole silhouette, with intentional gaps. Lighting is baked into vertex colour to keep tiny
  planes from breaking the large light/shadow shapes. Leaves still cast real shadows.
- White RGB is preserved in transparent atlas texels (DataTexture) to prevent
  dark mip-filtered fringes. Wind and tree occlusion dither remain GPU patches.
- Ground/grass share their colour function; preview ground, path, foliage, rock,
  plaster, roof and wood use the new palette. Cottage trim is merged by material.
- The light changes are enabled only in the `art=anime` session. Ground/prop changes
  are limited to the study. Normal gameplay camera and hero/monster assets are unchanged.
- Extra specimen tree/shrubs/rocks/path are render-only. They do not enter collision,
  navigation or saved data; this is an art review layout, not a release-ready placement.

### Evidence and limits

Dreamloop captures `study-overview`, `study-grove` and `shrub-detail` using identical
seed, coordinates, camera settings and fixed render time for both profiles. Detail
uses a closer camera (.68); overview uses the unchanged gameplay camera (1.0).

```sh
npm run build
DREAMLOOP_ART=anime DREAMLOOP_ART_REVIEW=1 DREAMLOOP_PASS=anime-review \
DREAMLOOP_STUDY_ONLY=1 DREAMLOOP_STUDY_DETAIL=1 DREAMLOOP_TERRAIN_ONLY=1 \
node tests/browser/dreamloop.mjs
```

Repeat with `DREAMLOOP_ART=baseline` and another `DREAMLOOP_PASS`; use `BROWSER=webkit`
for the WebKit check. Images/reports are in `tests/browser/out/dreamloop-<pass>/`.

Earlier visual review removed dark leaf speckling and a rock/fence intersection.
The subsequent rounded-leaf candidate was rejected; the cottage silhouette/roof remain simple. This is a first coherent palette/shape candidate, not a
claim that it reaches Ni no Kuni's finished asset quality. Character, monster and UI
art have not been redesigned. Physical iPad frame rate has not been measured.
Technical success and owner art acceptance remain separate gates.

Verification of this candidate:
- `npm test`: 59/59 pass; `npm run build`: pass.
- `npm run test:browser`: ALL OK, desktop and iPad-sized Chromium touch emulation;
  creation/save/continue, combat/drop/quest, panels, travel and terrain checks pass.
- Chromium Dreamloop: before/after overview, grove and detail captured; no browser/shader errors.
- Overview render counters: previous art 670,826 triangles / 287 calls; new art
  559,732 triangles / 319 calls. Shadow work is included; these are not device FPS.
- WebKit capture blocked: the browser downloaded successfully from its fallback CDN,
  but this host lacks GTK4/GStreamer and related system libraries. No Safari/iPad
  compatibility claim can be made from Chromium touch emulation alone.


## Earlier experiments (rejected)

The owner requested a small playable study before extending the art direction to all biomes.
The sample bounds and geometric budgets are in `data/art.json`. Start in town and follow the
east gate into the western meadow. The camera and existing hero/monster assets are unchanged.

## Leaf-spray revision — rejected

The initial closed, lobed crown was rejected: it read as a solid rock. The replacement
constructs layered branch sprays from individually oriented, pointed leaves. Each leaf
has a small curved alpha silhouette and subtle central fold; the texture contains one
leaf only. Real 3D placement supplies depth, gaps, a broken silhouette and leaf shadows.
There is no solid blob hidden underneath. Shrubs use fewer, proportionately larger leaves
so they remain readable at the gameplay camera distance.

The leaves retain the existing chunk instancing, wind and hero-occlusion dither. Top
faces have corrected winding; inverted leaf faces must not darken the whole crown. The
camera, world daylight and character assets stay unchanged. The implementation is original.
The earlier exploration of continuous foliage and softened normals was inspired by
[Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station), but this candidate
uses a leaf-spray construction to address the owner's shape feedback.

Plaster, timber, roof and rock surface treatments remain limited to the sample. Full-screen
post processing and full-map expansion are outside this review.

## Ground and grass use one colour system

Following the owner's Slime project's shared Ground + Grass approach:

1. `ground.js` caches blurred zone palettes and surface weights per world.
2. `grass.js` samples those attributes at each planting point using the terrain's actual
   triangle diagonal, including the interpolated terrain normal and height.
3. Each instance carries its own light/dark palette, road/mud/stone/dirt weights and coast
   values. Attributes are owned by each chunk, never overwritten on a shared geometry.
4. Both shaders call **the same** `groundColor` function from `ground-color.js`, with the
   same world-space noise, water darkening and cloud shadow. Grass tips brighten gradually.
5. Both faces of each grass blade use the terrain normal to avoid dark reversed faces.

The shared grass material is enabled only inside the study bounds; other areas keep the
existing grass tint as a control. The ground colour refactor itself preserves its output.
Surface sampling happens only during environment construction; wind stays on the GPU.
The beach exclusion, shells, swash and wadeable central stream are preserved.

## Review

Use Dreamloop's town, gate, meadow and grove views, plus the full biome/surf/stream pass.
Run the repository's smoke, art capture and long-session resource checks. Triangle counts
include the renderer's shadow work and are relative budgets; software rendering is not
an iPad FPS benchmark. Full-map expansion and heavier outlines/lighting remain a later
decision after the owner reviews this study.


## Visual gate

A passing automated run means only that rendering and interactions work. Before sending
screenshots, inspect silhouette (leaves rather than rock), leaf scale, light direction,
readable crown layers, grass roots and unchanged camera/palette. Record remaining art
limitations separately. The owner must see this candidate before any merge/deployment.


### Direction and shrub follow-up

Owner liked the leaf rendering but found random, flat leaves looked piled up. Tree leaf
axes now follow each parent branch with a small alternating fan, and edge sprays slope
out/down. Shrubs now have their own low mound geometry and round-leaf texture, rather
than scaled tree crowns. Middle leaves rise; rim leaves tilt down toward the soil.
This remains a local image-review candidate, not approved for publishing.
