# Greyfang Den — standalone scene for owner review

**Owner status: ผ่าน — approved, 31 October 2026** ("โอเคอต่อ", artifact version 2, https://claude.ai/artifact/AnnrDso4qWxFxenA6KNvf4).

Owner, on version 1: "ถ้าทำเป็นถ้ำเลยไม่ต้องอิงตามเรฟมาก" (make it a real cave, the reference need not be
followed closely), choosing a real cave mouth that can be walked into. The painted dark mouth is now
a tunnel: the cave path runs level into the rock mass (the ground there is cut to the clearing's
level, `prepare.py`), under an arched roof of rock that darkens to black at its closed back
(`den.js` `caveTunnel`), its floor darkening inwards. Big mossy stones arch round the mouth, mossy
boulders and shrubs heap over the roof up to the mass's top, two pale eyes shine at the back and
bones lie on the floor. The hero can walk in about three quarters of its depth (checked by sampling
`blocked` and the ground height along the tunnel: level, open, closed at the back).

Concept: `greyfang-den.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Third Greenhollow Frontier zone (ถ้ำหมาป่าเกรย์แฟง, levels 12–14, the den of Greyfang the pack
leader), in the concept's warm sunny tone.

A wide clearing of trodden earth in front of a tall mass of mossy rock columns crowned with big
blocks. The wolf den's cave opens in its face: a tunnel that can be walked into, framed by an arch of
big stones. By the mouth lie a fallen log, a wolf skull and scattered bones. Tall weathered rock pillars
and boulders stand round the clearing; a stone stair climbs the left bank to a path north-west.
Paths leave west, north-east round the rock mass and south-east. Old trees with flaring roots,
thick shrubs and a few white flowers.

## Build

```sh
python3 scenes/greyfang-den/prepare.py
python3 scenes/greyfang-den/assemble.py
```

Built from the Sunny Meadow pipeline (`../sunny-meadow/`): `prepare.py` (the rock mass, the left
bank, the corner banks, the clearing), `fill.js`, `routes.js` (`south`, `cave`, `west`, `stair`,
`northwest`, `east`, `southeast`), `paving.js` (the stair), `den.js` (the cave tunnel, the eyes inside,
the fallen log, skull and bones; shared rooted trees) and `scene.js` (pillars, boulders, the rock crown,
trees, shrubs, grass and flowers). `window.__scene.den` exposes `ports`, `junctions`, `routes` and
`cave`.

## When it goes into the map

As for the other Frontier scenes (owner, 31 October 2026), the scene's planting carries on round it
into the map (`plantSceneSurrounds`), not ending at its bounds.
