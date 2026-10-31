# Frontier Settlement — standalone scene for owner review

**Owner status: v1 sent for review, 31 October 2026** (artifact https://claude.ai/artifact/TjCdgzuexR78BN3av7zm7n).

Concept: `frontier-settlement.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Seventh and last Greenhollow Frontier zone (นิคมชายแดน), in the concept's warm sunny tone.

A village round a square of trodden earth. Four timber-framed plaster cottages on stone plinths,
with steep roofs of staggered red tile courses, stone chimneys, plank doors on the gable ends and
green-shuttered windows; the big cottage has a porch. The market cottage has a stall with a cloth
awning and a red banner; the right-hand cottage another stall. The bell tower stands on a square
stone base: four braced timber posts, a bronze bell, a small tiled cap. The great tree stands on a
grass island in the square with a bench and barrels at its foot. A post-and-rail fence closes a
vegetable garden (cabbage rows and a stand of maize); dry-stone walls of rounded mossy stones line the
lanes; a stone stair climbs the bank at the top left. Old rooted trees, shrubs, yellow and white
flowers.

Routes: `south`, `west` (to the stair foot), `stair` (up the bank, north-west), `north` and `east`
(north-east). All are walkable (checked by sampling `blocked` and the ground height along each: no
blocked rows, no jumps; the stair climbs about 6 m). Cottages, the tower, stalls, barrels, benches,
the garden fence and the walls block the hero.

## Build

```sh
python3 scenes/frontier-settlement/prepare.py
python3 scenes/frontier-settlement/assemble.py
```

Built from the Crag Highlands pipeline (`../crag-highlands/`): `prepare.py` (the bank at the top
left, the front corner banks, the square), `fill.js`, `routes.js` (ports `south`, `northwest`,
`north`, `northeast`), `paving.js` (the stair), `village.js` (cottages, bell tower, stalls, garden,
benches; one set of painted materials for every building, as the approved windmill's; shared rooted
trees) and `scene.js` (layout, barrels, dry-stone walls, planting). `window.__scene.village` exposes
`ports`, `junctions`, `routes`, `bell`, `blocked` and `height`.

## When it goes into the map

As for the other Frontier scenes (owner, 31 October 2026), the scene's planting carries on round it
into the map (`plantSceneSurrounds`), not ending at its bounds.

iPad budget (31 October 2026): the ground bushes are thinned to three in five, chosen by position
(`keepBush` in `scene.js`, so nothing else in the scene moves); with all of them the town view drew
1.5 million triangles, over `data/rendering.json` `budgets.frameTriangles`.
