# Azure Meadow Well — standalone review draft

A new owner-requested scene study following the preliminarily accepted Hill Windmill. The reference is `azure-meadow-well.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`, retained as `concept.png` without recompression.

The scene contains an open bonded-stone well, windlass/rope/bucket, orchard blossoms and fruit, cabbage beds, low garden walls, two stair flights and a small village gate with houses beyond it. It reuses the game's foliage, hero and toon paint pipeline. This is a new review draft, separate from the main game; the accepted scenes remain unchanged.

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
- `routes.js` defines eight connected road ribbons and shared junctions, including the well approach, garden loop, two stair flights and village road. The same physical paths drive ground height, dirt, paving and clearance. Segments are indexed locally for queries.
- `paving.js` adds worn stair slabs and low shoulders on the selected left flights.
- `models.js` contains original well masonry, the axle/rope/buckets, barrels, retaining walls, fitted arch wedges and background village houses/tiles.
- `helpers.js` copies the accepted ground-placement and timber/fence utilities. `scene.js` adds orchard trees using the game's existing models, small blossom/fruit instances, cabbage beds, rocks and sparse shrubs/flowers.
- `assemble.py` combines the above with the retained beach renderer/input/hero and coast foliage batching.

`window.__scene.meadow` exposes `ports`, `junctions` and world-space sampled `routes`. Each port contains `x,y,z`, clear `width`, and outward `dx,dz` using the game convention (X right, Y up, Z toward the camera).

| Port | Route | Intended connection |
| --- | --- | --- |
| `south` | `south` | Lower approach road |
| `northwest` | `left` | Upper orchard stair road |
| `village` | `village` | Through the gate into the village |
| `west` | `west` | Lower west meadow road |
| `east` | `east` | East field road |

Translate the terrain, models, colliders, routes and ports together for game placement. Neighboring heightfields must meet the provided port heights. The standalone tap walker is separate from the main game's navigation; game integration and its required checks remain pending. The well's dark water is a small static surface inside the blocked shaft, not the ocean simulation.

Tap the ground to walk and use the wipe controls to compare with the concept. [Review record](REVIEW.md) identifies the exact draft and verification limits. No preliminary owner approval has been recorded for this scene yet.
