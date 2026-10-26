# Large shields (Meshy)

The owner's large-shield sheet (front views; `assets-source/equipment/20261025/masters/large-shields-atlas.png`
on the equipment-art branch) made into 3D with Meshy, 15 credits each. Each shield is built in two steps:

1. Geometry: meshy-t2 image-to-3d (smart topology) from its 512 px front icon.
2. Texture: a Meshy 6 retexture from the same icon.

Task ids are in `tasks.json`.

- `crab_tower_shield_meshy.glb`, `beetle_tower_shield_meshy.glb`, `crag_tower_shield_meshy.glb`: about
  4,000 triangles, one 2048 texture each. Their backs are Meshy's guess: plain, no straps.

Not in game yet. The held shields are still the code-built ones (`src/render/equipment.js` `buildOffhand`).
They still need:
- shrinking to the iPad budget,
- baking to the forearm grip,
- a decision on which shield items use them.
