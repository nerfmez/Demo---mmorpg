# Moonstone Camp — preliminarily accepted standalone scene

**Owner status: ผ่านเบื้องต้น — preliminary approval, 26 October 2026** ("โอเคต่อไป"), artifact version 3:
https://claude.ai/artifact/PqbowbCkpB7D95dBY2AfR6.

Concept: `moonstone-camp.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Second Moonroot Grove zone, in the region concept's teal tone (`assets/moonroot/moonroot_grove_concept.jpg`
sets the region's layout and tone; the 40° reference the details), as Mirror Pond.

An open clearing lies under a wooded rock terrace. At the terrace's foot stand two canvas tents
with a red banner, a ring-stone campfire between log benches, crates and firewood, and the
moonstone: a tall pale standing stone on a mossy rock pedestal, a crescent glowing blue in its
face (the region concept's camp stone). Paths leave south to the arrival, west along the front,
north up the left bank and north-east up a stone stair; old rooted trees and Moonroot's small
glowing plants ring the clearing.

## Build

```sh
python3 scenes/moonstone-camp/prepare.py
python3 scenes/moonstone-camp/assemble.py
```

Built from the Mirror Pond pipeline (`../mirror-pond/`) without its pond: `prepare.py` (terraces,
the clearing, Moonroot's colours), `fill.js`, `routes.js` (`south`, `west`, `left`, `right`; ports
`south`, `west`, `north`, `northeast`), `paving.js` (stone flights where a route climbs), `camp.js`
(tents, banner, campfire, benches, crates, firewood, moonstone, bark-style rooted trees, glowing
plants) and `scene.js`. `window.__scene.camp` exposes `ports`, `junctions`, `routes` and `moonstone`.

Owner, on version 1: the stone is to be a warp pillar; the camp does not yet have the reference's
mood; some trees can be big, as said before, and Moonroot has many big trees. The moonstone is
replaced by the arrival beach's warp pillar (`WP`: the heap of carved blocks that rebuilds itself
into a pillar when the hero walks up; 1.8 times its beach size, in a ring of mossy rubble; the game
can wire it as the region's `camp` waypoint the way it wires the beach's). The camp now sits in a
rocky alcove: big mossy blocks at varied heights break the terrace wall, bushes at their feet and
on top, packed earth under the tents, and more gear (barrels, a bedroll, a cooking pot, a second
woodpile). Six great old trees (about twice the others) stand round the clearing.

Owner, on version 2: the rock face is not yet natural. The terrace behind the camp is no longer
one ring wall: it is an uneven grassy bank whose top rises and falls, broken by three short rock
outcrops, with weathered rounded boulders (the shared field stone) heaped in loose clusters on
its slopes and at the outcrops' feet, bushes between them.
