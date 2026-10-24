# Azure Meadow Well — preliminarily accepted standalone scene

A new owner-requested scene study following the preliminarily accepted Hill Windmill. The reference is `azure-meadow-well.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, retained as `concept.png` without recompression.

**Owner status: ผ่านเบื้องต้น — preliminary approval, 24 October 2026, public version 10.** Retain the overall revision at source `50cee66641f98c5ab9b6fa1ba0ee322516fef828` as the baseline for future work. Version 9 was rejected and is superseded.

The scene contains a shallower oval bonded-stone well, windlass/rope/bucket, orchard blossoms and fruit, larger cabbage rows, broken low field walls, four short worn stair flights and a smaller village gate behind trees. It reuses the game's foliage, hero and toon paint pipeline. This preliminarily accepted scene stays separate from the main game; the accepted scenes remain unchanged.

## Build and use without Sites

From the repository root, with Python and Pillow:

```sh
python3 scenes/azure-meadow/prepare.py
python3 scenes/azure-meadow/assemble.py
```

This generates ignored `index.html` and `generated.mjs`. The default HTML embeds the reference/hero and uses pinned Three 0.170 CDN modules. Serve it with any static host or local HTTP server. There is no Sites SDK, account or server dependency.

For a single offline file, embed a local Three 0.170 package:

```sh
python3 scenes/azure-meadow/assemble.py --three /absolute/path/to/three-0.170-package
```

Alternatively use `--modules-from /absolute/path/to/existing-offline.html`. Keep the neighboring scene sources and `beach/hero.glb` available when building.

## Source and game connections

- `prepare.py` derives terrain, cliffs, road normals and the garden court from retained ruins helpers; `world.js` is the generated tracked terrain source.
- `routes.js` defines seven connected road ribbons and shared junctions, including the well approach, garden loop, four short stair flights and village road. The main Y junction is above the hero in the approach court, and the old cross-road in front of the well is removed. The same physical paths drive ground height, dirt, paving and clearance. Segments are indexed locally for queries.
- `paving.js` adds worn stair slabs and low shoulders on the selected left flights.
- `models.js` contains original well masonry, the axle/rope/buckets, barrels, retaining walls, fitted arch wedges and background village houses/tiles.
- `helpers.js` copies the accepted ground-placement and timber/fence utilities. `scene.js` adds orchard trees using the game's existing models, small blossom/fruit instances, cabbage beds, embedded road stones, irregular rock clusters and grouped shrubs/flowers.
- `assemble.py` combines the above with the retained beach renderer/input/hero and coast foliage batching.

`window.__scene.meadow` exposes `ports`, `junctions` and world-space sampled `routes`. Each port contains `x,y,z`, clear `width`, and outward `dx,dz` using the game convention (X right, Y up, Z toward the camera).

| Port | Route | Intended connection |
| --- | --- | --- |
| `south` | `south` | Lower approach road |
| `northwest` | `left` | Upper orchard stair road |
| `village` | `village` | Through the gate into the village |
| `west` | `west` | Lower west meadow road |
| `east` | `east` | East field road |

Translate the terrain, models, colliders, routes and ports together for game placement. Neighboring heightfields must meet the provided port heights. The standalone tap walker is separate from the main game's navigation; game integration and its required checks remain pending. The well has a matching ellipse collider and a clear west-side approach. Its dark water is a small static surface inside the shaft; there is no ocean simulation in this inland scene.

Tap the ground to walk and use the wipe controls to compare with the concept. [Review record](REVIEW.md) identifies the exact draft and verification limits. Version 10 has preliminary owner approval. Final runtime/device verification and main-game integration remain pending.
