# Rose Garden Glade — standalone owner-review draft

The next owner-requested concept after preliminary approval of Azure Meadow version 10. This scene uses `rose-garden-glade.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, retained without recompression as `concept.png`.

An open timber gazebo stands on the left terrace, with plank flooring, side benches, roof shingles and climbing roses. The garden has connected paths, two stair approaches, a planted stone island and wooded edges. Trees, shrubs, grass, wildflowers, hero and toon paint reuse the game's assets/pipeline. New roses have cupped petal geometry; stems and leaves remain separate visible forms. This is a new unapproved draft, separate from the main game.

## Build and reuse without Sites

From the repository root, with Python and Pillow:

```sh
python3 scenes/rose-garden/prepare.py
python3 scenes/rose-garden/assemble.py
```

This writes ignored `index.html` and `generated.mjs`. The default HTML embeds the reference/hero and uses pinned Three 0.170 CDN imports. Serve it on any static host or local HTTP server. There is no Sites SDK, account or server dependency.

For a single offline HTML:

```sh
python3 scenes/rose-garden/assemble.py --three /absolute/path/to/three-0.170-package
```

`--modules-from /absolute/path/to/existing-offline.html` can alternatively reuse an embedded import map. Keep the neighboring scene sources and `beach/hero.glb` available while building.

## Source and game connections

- `prepare.py` derives `world.js` from retained terrain/cliff helpers, with this garden's terraces, court/island dirt mask and exact pavilion floor footprint.
- `routes.js` defines eight connected ribbons, shared junctions, a local segment index, five ports and `PAVILION`/`PAVILION_FLOOR` in real coordinates. The same roads drive terrain height, dirt, steps and clearance.
- `paving.js` creates the two worn stair approaches, with dirt landings and low broken shoulders.
- `models.js` builds the gazebo, plank floor, benches, staggered roof courses, finial, climbing stems and cupped rose geometry. Roses and vine leaves are instanced.
- `helpers.js` reuses the accepted ground placement and timber helpers. `scene.js` arranges the stone island, road fragments, garden roses and game-native foliage.
- `assemble.py` combines the scene with the approved renderer, touch/wipe controls, hero and foliage batching.

`window.__scene.rose` exposes `ports`, `junctions`, sampled `routes` and `pavilion`. Coordinates use X right, Y up, Z toward the camera.

| Port | Route | Connection |
| --- | --- | --- |
| `south` | `south` | Foreground approach |
| `northwest` | `left` | Left/back forest path |
| `northeast` | `right` | Right/back stair path |
| `west` | `west` | West garden connection |
| `east` | `east` | East garden connection |

Each port has `x,y,z`, usable `width` and outward `dx,dz`. Translate terrain, models, colliders, paths and ports together for game placement, matching neighboring ground to the port heights. The pavilion floor geometry and walking height share the same footprint; the terrain beneath is lowered so it cannot cover the boards. The standalone tap walker is separate from the main game's navigation. Game placement, resource ownership and device checks remain later integration work.

Tap the ground to walk; use the wipe controls to compare with the concept. [Review record](REVIEW.md) identifies the exact artifact and verification limits. The rose scene has no owner approval yet; accepted Meadow, Windmill and Coast baselines are preserved.
