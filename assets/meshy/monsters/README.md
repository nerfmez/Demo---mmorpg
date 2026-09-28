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
| reef_crab | 01a0e840-ca8b-7090-8b09-975fbc90b38d | 01a0e84a-4f8b-70e6-8abf-112928ab7014 | 3,662 |
| marsh_wisp | 01a0e840-d1b4-766c-b615-916f557a846e | 01a0e84a-5e4a-7491-9e72-2e0ac6d5f08e | 2,088 |
| thornback_wolf | 01a0e840-db2f-75a5-b3ee-961bd5d948ab | 01a0e84a-68c3-73ab-b36f-c3f9d53ba7bd | 4,180 |
| sporecap | 01a0e840-e2cb-740b-be9c-5f6ac69eaeb6 | 01a0e84a-7321-71a7-bdba-ab6f64053d86 | 2,570 |
| crag_golem | 01a0e840-ea98-7098-93e0-cd60b1781b43 | 01a0e84a-7dc7-757d-9de3-64b5d0d041c4 | 4,658 |
| gale_hawk | 01a0e840-f20c-722f-9a39-b96efffbffd0 | 01a0e84a-8996-72f7-a8a3-0cd22b7628f7 | 3,631 |
