# Moonstone Camp — standalone scene in owner review

**Owner status: in review, 26 October 2026**, artifact version 1:
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
