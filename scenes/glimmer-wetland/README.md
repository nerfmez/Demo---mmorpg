# Glimmer Wetland — standalone scene for owner review

**Owner status: v1 sent for review, 31 October 2026** (artifact https://claude.ai/artifact/LtzZcuBoJvjAwyF5D5YfZB).

Concept: `glimmer-wetland.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Fifth Greenhollow Frontier zone (บึงประกายแสง), in the concept's warm sunny tone.

An earth path comes in from the south and forks between four clear turquoise pools: one way runs
up-left between the big pool and the middle one, on west and north past the willows; the other runs
up-right between the middle pool and the right one, on east and north-east round the crystal's rock.
The pools are edged with mossy stone blocks, with lily pads (a few in white flower), clumps of
white-plumed reeds and pebbles seen through the water. Four great weeping willows with flaring roots
lean over them; a glowing cyan crystal stands on a block of stone at the back, and glints twinkle
over the water. Yellow and white flowers in the grass, shrubs and mossy blocks along the banks.

All five routes (`south`, `northwest`, `north`, `east`, `northeast`) are walkable (checked by
sampling `blocked` and the ground height along each: no blocked rows, no jumps); the hero is
stopped at the water's edge.

## Build

```sh
python3 scenes/glimmer-wetland/prepare.py
python3 scenes/glimmer-wetland/assemble.py
```

Built from the Mirror Pond pipeline (`../mirror-pond/`), its one pond made several: `pools.js`
(each pool's waterline a smooth radius round its own centre; `pondIn` is metres inside the nearest
pool, used by the ground, the water shader and planting), `prepare.py` (the willow rock, the
crystal's rock, the willow banks, the front-left rise, the clearing; the pools cut after the fill),
`fill.js`, `routes.js` (ports `south`, `west`, `north`, `east`, `northeast`), `paving.js` (no stair:
the wetland is level), `marsh.js` (willows, rooted trees, shore blocks, pebbles, lily pads, reeds,
the crystal, the glints) and `scene.js`. The water keeps the beach's bright turquoise (Greenhollow,
not Moonroot's deep teal), with a gentler wash and a fainter light web. `window.__scene.wetland`
exposes `ports`, `junctions`, `routes`, `crystal`, `blocked`, `height` and `pondIn`.

## When it goes into the map

As for the other Frontier scenes (owner, 31 October 2026), the scene's planting carries on round it
into the map (`plantSceneSurrounds`), not ending at its bounds.
