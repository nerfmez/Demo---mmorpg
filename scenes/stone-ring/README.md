# Old Root Stone Ring — standalone scene in owner review

**Owner status: in review, 26 October 2026**, artifact version 1:
https://claude.ai/artifact/E1j8hiqDU25sz3r6mabsTE.

Concept: `old-root-stone-ring.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Third Moonroot Grove zone, in the region concept's teal tone, with its great old trees (the region
concept's ring stands round a giant tree; the owner: Moonroot has many big trees).

On a mound above an open plaza, tall weathered standing stones ring a paved circle round a low
moon altar (a broken drum of dressed stone, a crescent carved in its face). Big mossy blocks line
the mound's face; a stone stair climbs it from the plaza. Paths curve round both sides, the left
one up the bank to the north-west, the right one to the east. Great rooted trees stand behind
the ring, ordinary ones round the edges, and Moonroot's small glowing plants grow in the shade.

## Build

```sh
python3 scenes/stone-ring/prepare.py
python3 scenes/stone-ring/assemble.py
```

Built from the Moonstone Camp pipeline (`../moonstone-camp/`): `prepare.py` (the mound, shelves,
plaza, Moonroot's colours), `fill.js`, `routes.js` (`south`, `left`, `right`, `stair`; ports
`south`, `northwest`, `east`), `paving.js`, `ring.js` (paved circle, moon altar, standing stones,
bark-style rooted trees, glowing plants) and `scene.js`. `window.__scene.ring` exposes `ports`,
`junctions`, `routes` and `altar`.
