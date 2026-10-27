# Large shields (Meshy)

The owner's greatshield sheet (one large shield held in both hands; a new gear kind) (front views; `assets-source/equipment/20261025/masters/large-shields-atlas.png`
on the equipment-art branch) made into 3D with Meshy, 15 credits each. Each shield is built in two steps:

1. Geometry: meshy-t2 image-to-3d (smart topology) from its 512 px front icon.
2. Texture: a Meshy 6 retexture from the same icon.

Task ids are in `tasks.json`.

- `crab_greatshield_meshy.glb`, `beetle_greatshield_meshy.glb`, `crag_greatshield_meshy.glb`: about
  4,000 triangles, one 2048 texture each. Their backs are Meshy's guess: plain, no straps.

In the game since 2026-10-27 as the three greatshields (`data/items.json`, weapon type `greatshield`):
`public/models/weapons/<id>.glb` is each one with its texture at 768 px (`scripts/shrink-glb-texture.py 768 76`)
and decimated to 3,900 triangles (`scripts/decimate-glb.py`). The grip bars on the back are built in code
(`src/render/equipment.js` `greatshieldGrips`); `data/models.json` fits each model onto them.
