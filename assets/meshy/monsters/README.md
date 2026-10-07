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
| greyfang (boss) | 01a0e875-1ed7-7166-be3e-dd55e10b8555 | 01a0e877-9a24-76d6-abcb-a9aa8179dd1d | 5,019 |
| horned_warden (boss) | 01a0e875-3599-7153-93c9-3052342d9f13 | 01a0e877-a4b3-74ff-94f8-46ce01f997b9 | 5,215 |
| salt_slime (level 1 redesign A) | 01a0f578-4d4a-777f-9e8a-9fb905e719f1 | 01a0f57a-c37d-7182-97bf-8f6083cee753 | 3,112 |
| shore_gull | 01a0f575-db66-77b5-af52-2d8585fbe117 | 01a0f585-fb16-7249-8e2e-c5b30bfa5550 | 4,165 |
| hermit_crab | 01a0f575-e191-731d-8404-c6516f09e101 | 01a0f585-ffb4-7347-8aef-434b23bb0f2a | 4,688 |
| thicket_mantis | 01a10a8d-6ae7-70dc-a47e-695d45be0ff9 | 01a10a8e-dc7f-77b7-84a8-982738c1ea21 | 3,541 |
| reed_viper (v3, reed hood; `reed_viper_concept_v3.png`, caption erased) | 01a10aa5-8e04-7274-afb8-6a883cfaf5ec | 01a10aab-c6b0-7569-be84-513b22b86158 | 3,978 |
| ironhorn_ram | 01a10a8d-7fc8-7020-974b-07954c5c8130 | 01a10a8e-e309-76f3-8dd1-196eaf354665 | 4,141 |
| duskmane_stalker | 01a10a8d-878e-71ab-9880-d70c9c012b38 | 01a10a8e-e610-76e6-894a-a1e7f92ce0ff | 4,168 |
| rune_sentinel | 01a10a8d-8f1c-7318-862b-326fc767a087 | 01a10a8e-e950-7215-98da-7f21034ef70f | 3,073 |

The salt slime concept was redrawn for a level-1 monster (the first design looked too fierce); the 3D model
is Meshy 6 image-to-3d with `should_remesh` and `target_polycount` 3000, then
`python3 scripts/shrink-glb-texture.py raw.glb public/models/monsters/salt_slime.glb 512` shrinks the texture.

## Replacements, 2026-10-07 (owner-supplied models)

Six monsters were redesigned (concept sheets `*_concept_v2.jpg`, viper `_v4`; the two wolf sheets are phone
screenshots, so the viewer buttons show on them). The owner supplied the Meshy GLBs; they replace the models above
for the same monster ids. Source file names and how each was prepared (`scripts/prep-monster-glb.py`: bake the
rest pose, drop the skin, keep the main piece, straighten, normalise to 1.9 m, decimate with meshoptimizer, base
colour map at 512 px):

| Type (new look) | Source GLB | Prepared with | Tris |
|---|---|---|---|
| salt_slime (Tidal Slime) | `Meshy_AI_Tidal_Slime_1007121839_texture.glb` | `--tris 4900` | 4,899 |
| tusk_boar (Boarbull) | `Meshy_AI_Character_output.glb` (rigged) | `--tris 4900` | 4,899 |
| thornback_wolf (Maskfang Wolf) | `Meshy_AI_Character_output_2.glb` (rigged) | `--yaw 18.5 --tris 4500` | 4,499 |
| greyfang (Greyfang Alpha, boss) | `Meshy_AI_Character_output_3.glb` (rigged) | `--keep 1 --yaw 19 --tris 5900` | 5,899 |
| reed_viper (Reedblade Viper, coiled) | `Meshy_AI_Reedblade_Viper_1007122637_texture.glb` | `--keep 1 --yaw 15 --tris 4900` | 4,899 |
| marsh_wisp (Lostlight Wisp) | `Meshy_AI_Lostlight_Wisp_1007124252_texture.glb` | `--tris 4900` | 4,900 |

The viper sheet carried a second small snake and the drop pictures in the same file; `--keep 1` keeps the large
coiled snake only. The three quadrupeds came with a Meshy auto-rig: its joint positions placed the rig bones and
skin lines in `data/models.json` (the wolves stood turned about 19 degrees, hence `--yaw`). The wolf and Greyfang are
decimated a little harder so that Greyfang plus the two wolves it summons stay inside the encounter budget
(`tests/core/presentation.test.js`). The viper's bone chain follows the traced centreline of the coil, and its
`wave` value (data/models.json) damps the slither of the long-body animator for the coiled model.
