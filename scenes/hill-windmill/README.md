# Hill Windmill — preliminarily accepted standalone scene

Owner status: **ผ่านขั้นต้น — preliminary approval, 24 October 2026**, for public version 8. Retain this version as the baseline for subsequent work. Accepted source: `b182e6baf00659f3311fd3326ba85cad56e35652`.

The next owner-requested concept scene after the preliminarily accepted Singing Conch Coast. A timber-and-plaster windmill stands on a fenced terrace above broad looping paths, short stone flights and planted rock faces. It stays separate from the playable game and from the approved scenes.

Reference `concept.png`: the repository's `docs/reference/landscapes-40deg-20261022/azure-coast/hill-windmill.png` at concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, retained without recompression.

## Build and reuse without Sites

From the repository root, with Python and Pillow:

```sh
python3 scenes/hill-windmill/prepare.py
python3 scenes/hill-windmill/assemble.py
```

This writes `index.html` and `generated.mjs` (ignored generated outputs). The default HTML embeds the reference and approved hero GLB and uses the beach's pinned Three 0.170 CDN imports. Serve it from any static host or local HTTP server; there are no Sites SDK, account or backend dependencies.

For a single fully offline HTML, use a Three 0.170 package directory:

```sh
python3 scenes/hill-windmill/assemble.py --three /absolute/path/to/three-0.170-package
```

That embeds the five required ES modules too. `--modules-from /absolute/path/to/existing-offline.html` can alternatively reuse an existing embedded import map. Both options are independent of hosting. Keep the neighboring scene sources and `beach/hero.glb` available while building.

## Source layout

- `prepare.py` builds `world.js` from the retained ruins' ground/cliff helpers and this hill's terrace outlines. The physical world retains the enlarged 3.12 scale and 40-degree camera.
- `routes.js` authors the south approach, right loop, left forest ascent, central shortcut, east exit and northeast ascent. Each ribbon supplies its ground height, width, stair surface and collision/plant clearance.
- `paving.js` places short flights on selected rises; packed-earth landings remain connected by the same heightfield.
- `mill.js` builds original plaster/timber geometry, an arched entrance, windows, staggered roof shingles, the axle and four framed linen sails. The sails rotate slowly and respect reduced-motion settings.
- `scene.js` places fences with openings at route junctions, entrance props, rocks and the game's existing foliage. It assembles the scene and updates the rotor.
- `assemble.py` reuses the approved beach renderer, paint shader, input/wipe controls, foliage and hero, plus the retained coast's foliage instancing. It then combines the hill's modules into portable HTML.

## Connections for game placement

The roads continue beyond the review frame; the terrain bounds include their full width. `window.__scene.hill` exposes the world-space `ports`, shared `junctions` and sampled `routes`. These are built from the same data used by the dirt, floor heights, paving, foliage clearance and the walking checks.

| Port | Route | Intended connection |
| --- | --- | --- |
| `south` | `south` | Arrival from the lower world road |
| `northwest` | `left` | Two-flight forest ascent to the upper trail |
| `east` | `east` | Lower road continuing right |
| `northeast` | `east-north` | Upper forest road |

Each port includes real `x,y,z`, clear `width` and outward `dx,dz`. Coordinates use the game convention: X right, Y up and Z toward the camera. Translate the terrain, colliders, routes and ports together when placing the scene into the game; connect neighboring heightfields at the port heights. Do not infer a walkable road from the dirt texture alone. The preview's tap-to-walk and local segment lookup are separate from the main game's navigation; game integration and its tests are still a later step.

The left approach now has an S bend, two distinct stone flights and earth landings. Shared road anchors and blended junction aprons remove height mismatches at forks. Rock facets are lowered under the route floor at crossings, and props/plants stay outside its usable width. Trees are reduced to 14, with smaller, more separated shrubs instead of a continuous green border.

Tap the 3D ground to walk; use the wipe controls to compare with the concept. [Review record](REVIEW.md) identifies the artifact and verification limits. Preliminary owner approval is recorded; final runtime/device verification and game integration remain pending; the accepted coast, beach, forest and retained ruins are preserved.
