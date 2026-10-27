# Fern Rise — preliminarily accepted standalone scene

**Owner status: ผ่านเบื้องต้น — preliminary approval, 26 October 2026** ("โอเคต่อไป"), artifact version 1:
https://claude.ai/artifact/KbQwZdwcNs42peJmAdscX8.

Concept: `fern-rise.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Fourth Moonroot Grove zone, in the region concept's teal tone with its great old trees.

A mossy rock rise stands in the middle of a clearing; on its top giant fiddlehead ferns (tall
green stems rolling into flat spirals, small curled leaflets along the coil) rise out of a thicket
of broad fern fronds and bushes. From the plaza a path winds up the left between the rise and the
left bank; on the right a stone stair climbs to a path that curves back over the high ground, and
a lower branch leaves east. Big mossy blocks line the faces; great rooted trees stand round.

## Build

```sh
python3 scenes/fern-rise/prepare.py
python3 scenes/fern-rise/assemble.py
```

Built from the Old Root Stone Ring pipeline (`../stone-ring/`): `prepare.py` (the rise, banks,
plaza, Moonroot's colours), `fill.js`, `routes.js` (`south`, `left`, `right`, `east`; ports `south`,
`northwest`, `northeast`, `east`), `paving.js`, `fern.js` (fiddleheads, fern clumps, bark-style
rooted trees, glowing plants) and `scene.js`. `window.__scene.fern` exposes `ports`, `junctions`
and `routes`.
