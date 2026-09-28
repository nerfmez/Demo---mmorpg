# Frontier town and meadow art study

The owner requested a small playable study before extending the art direction to all biomes.
The sample bounds and geometric budgets are in `data/art.json`. Start in town and follow the
east gate into the western meadow. The camera and existing hero/monster assets are unchanged.

## Continuous foliage and materials

`render/art-study.js` builds a seeded, closed canopy with rounded lobes, welded seams,
softened ellipsoid normals and cool base / warm top vertex colours. Each tree uses one
volume; shrubs use a smaller mesh. These remain chunked instances, sharing materials,
wind and the existing hero-occlusion dither. Old leaf cards remain outside the sample.

`surfaceart.js` adds broad leaf marks, quiet plaster, directional timber grain, staggered
roof courses and broad moss on rock planes. No full-screen post-processing pass, bloom,
texture atlas download or extra renderer has been introduced. Existing daylight is retained.

The foliage/normal and material approach is inspired by the MIT-licensed
[Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station), particularly
[`foliage.js`](https://github.com/Kenton-GMI/sakuragaoka-station/blob/main/src/world/lib/foliage.js)
and [`materials.js`](https://github.com/Kenton-GMI/sakuragaoka-station/blob/main/src/core/materials.js).
This study is an original implementation for the high camera and mobile rendering budget;
it does not copy source code or assets from that repository.

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

The shared grass material applies across the map to avoid abrupt colour-system boundaries.
Surface sampling happens only during environment construction; wind stays on the GPU.
The beach exclusion, shells, swash and wadeable central stream are preserved.

## Review

Use Dreamloop's town, gate, meadow and grove views, plus the full biome/surf/stream pass.
Run the repository's smoke, art capture and long-session resource checks. Triangle counts
include the renderer's shadow work and are relative budgets; software rendering is not
an iPad FPS benchmark. Full-map expansion and heavier outlines/lighting remain a later
decision after the owner reviews this study.
