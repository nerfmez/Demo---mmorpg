# Monster models (Meshy)

Concept images are Meshy image-to-image (nano-banana) from `docs/reference/target-gameplay-mock.png`
with a text description; models are Meshy 6 image-to-3d, textured, lighting removed, remeshed,
then the texture is shrunk to 512 px and saved to `public/models/monsters/<type>.glb`. They are
registered in `data/models.json` → `monsters` and skinned onto the procedural rigs by
`src/render/monsterSkin.js` (bone moves and weight segments per monster).

| Type | Concept task | 3D task | Tris |
|---|---|---|---|
| tusk_boar | 01a0e81d-10d2-7248-8f6e-db39c7ea6879 | 01a0e828-bb25-708e-b38a-0bdd0e8e5bfb | 4,156 |
| moss_beetle | 01a0e81d-1a33-7113-b4f8-d2436f79f16c | 01a0e828-c5ef-70de-ad96-fe5128871c94 | 3,118 |
