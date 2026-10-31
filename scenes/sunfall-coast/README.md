# Sunfall Coast — standalone scene for owner review

**Owner status: ผ่าน — approved, 31 October 2026** ("ผ่านต่อไป", artifact version 1, https://claude.ai/artifact/GNYWs8fPYi2NPptMekgV58).

Concept: `sunfall-coast.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Fourth Greenhollow Frontier zone (ชายฝั่งตะวันรอน), in the concept's warm sunny tone.

A wide clearing of orange earth beside a sand beach. A pale sea cliff stands over the beach and
steps down to the clearing in bushy ledges; from it a great natural rock arch springs over the sea
and stands its far leg in the water. Sea stacks with mossy, bushy tops stand off the sand, and small
rocks line the waterline. Rock tiers climb the left; a stone stair goes up them to the top path.
Palms on the cliff top, on the arch's far shoulder, leaning off the middle tier and low at the front
left; broadleaf trees, shrubs, grass and yellow and white flowers.

Paths: `south` (in), `stair` (clearing up to the top tier, paved where it climbs), `north` (the top
path, leaves north-west), `west` (along the foot of the tiers) and `shore` (south-east along the
sand). All are walkable (checked by sampling `blocked` and the ground height along each route: no
blocked rows, no jumps; the stair climbs about 12 m). The hero is stopped at the waterline.

## Build

```sh
python3 scenes/sunfall-coast/prepare.py
python3 scenes/sunfall-coast/assemble.py
```

Built from the Gull Headland sea pipeline (`../gull-headland/`): `prepare.py` (the land with its
soft beach edge, the sea cliff standing in the water, the bushy ledge, the middle and top tiers,
the front-left terrace, the clearing; sand painted on the low ground by the sea), `coast.js` (the
waterline: under the arch the water meets the cliff's foot, below it the water runs up the sand; each
traced point carries its own offset), `fill.js`, `routes.js`, `paving.js` (the stair, only where it
climbs), `arch.js` (the rock arch swept as one body of rock, the sea stacks) and `scene.js` (rocks,
cliff ivy, palms, trees, shrubs, grass and flowers). `window.__scene.coast` exposes `ports`,
`junctions`, `routes`, `arch`, `blocked`, `height` and `seaDist`.

## When it goes into the map

As for the other Frontier scenes (owner, 31 October 2026), the scene's planting carries on round it
into the map (`plantSceneSurrounds`), not ending at its bounds.
