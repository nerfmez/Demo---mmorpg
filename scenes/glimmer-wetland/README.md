# Glimmer Wetland — standalone scene for owner review

**Owner status: ผ่าน — approved, 31 October 2026** ("ผ่าน ต่อไป", artifact version 3, https://claude.ai/artifact/LtzZcuBoJvjAwyF5D5YfZB).

Owner, on version 1: "กรวดใต้น้ำยังมองเห็นไม่ชัดเท่าในคอนเซป หินเป็นเหลี่ยมไม่ธรรมชาติ" (the pebbles under
the water do not show as clearly as the concept's; the stones are boxy and unnatural). Version 2: the
pools are shallower and their water clearer, over a pale teal-sand bed; the pebbles are bigger,
rounded and warm brown, in their own warm-lit material so the water's teal does not turn them
grey-blue. Every stone is now a rounded mossy field stone (`fieldStone`): round the pools, along the
paths, round the crystal; the raised banks lost their column rock faces and are ringed with rounded
stones instead.

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

iPad budget (31 October 2026): each willow strand keeps its index (`indexedPart` in `marsh.js`): the same
shape and colours with a quarter of the vertices, 5 MB less per willow; the four willows had pushed the
resident geometry of all maps over `data/rendering.json` `budgets.residentGeometryMB`.
