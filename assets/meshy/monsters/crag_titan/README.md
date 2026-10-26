# Stone golem boss (to replace the Horned Warden)

`concept_sheet.png` is the owner's sheet: the golem rolled up as a horned boulder (left) and standing
with its stone shield (right). Each figure was cut out onto white with the ground dust and loose
rubble removed (`ball_reference.png`, `golem_reference.png`). Each was then made into 3D in two steps,
15 credits each:

1. Geometry: meshy-t2 image-to-3d (smart topology).
2. Texture: a Meshy 6 retexture from the same picture.

Task ids are in `tasks.json`.

- `golem_meshy.glb`: the standing golem with its shield.
- `ball_meshy.glb`: the rolled boulder. Meshy added a ground disc with rubble, which is to be cut off
  when it is prepared (keep the main piece).

In game (the Horned Warden keeps its name, drops and attacks, plus a new `roll`):
- `public/models/monsters/horned_warden.glb`: `scripts/prep-monster-glb.py golem_meshy.glb` (4,263 triangles).
- `public/models/monsters/horned_warden_ball.glb`: `scripts/close-boulder-base.py` (ground removed,
  base closed, rounded and painted stone), then `prep-monster-glb.py --tris 1600`.
- The golem is skinned to the warden rig in `data/models.json` (the shield on the right forearm).

## Second version (2026-10-26)

The owner redrew the sheet (`concept_sheet.png`): cleaner toon stone with orange lava cracks, the boulder
cracked with lava as well. `golem_meshy.glb` and `ball_meshy.glb` were remade from it the same way
(meshy-t2 + Meshy 6 retexture, 30 credits; task ids in `tasks.json`). Meshy gave the boulder two horns,
one either side. The first version is kept in `v1/`; the game still uses the first version's models
until the new ones are fitted.

## Second version (2026-10-26)

The owner redrew the sheet and supplied it already cut out (`concept_sheet.png`, transparent): cleaner toon
stone with orange lava cracks, the boulder cracked with lava as well. Each figure was put on white as it is
(only the loose rocks floating apart from it dropped) and remade the same way (meshy-t2 + Meshy 6
retexture, 30 credits; task ids in `tasks.json`). Meshy gave the boulder two horns, one either side.
The first version is kept in `v1/`; the game uses the first version's models until the new ones are fitted.
