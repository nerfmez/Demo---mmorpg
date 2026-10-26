# Root Warren — standalone scene in owner review

**Owner status: in review, 26 October 2026**, artifact version 2:
https://claude.ai/artifact/EuwKaqYC2DzvzctjRKvZVQ.

Concept: `root-warren.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Fifth and last Moonroot Grove zone, in the region concept's teal tone with its great old trees.

A wide clearing lies under a great old tree on the high ground; its roots pour down over a steep
bare-earth bank and out onto the clearing, twisting and forking, and three burrows open in the
bank's face. On the left a root arch (the region's Great Root Arch: braided roots meeting over the
path, their feet flaring into the ground) spans the path to the north-west; on the right a stone
stair climbs to a path north-east, and a branch leaves east. Mossy boulders, ferns, rooted trees
and Moonroot's glowing plants ring it.

## Build

```sh
python3 scenes/root-warren/prepare.py
python3 scenes/root-warren/assemble.py
```

Built from the Fern Rise pipeline (`../fern-rise/`): `prepare.py` (the bank, side grounds, the
clearing, Moonroot's colours; steep ground painted as bare earth), `fill.js`, `routes.js` (`south`,
`arch`, `right`, `east`; ports `south`, `northwest`, `northeast`, `east`), `paving.js`, `warren.js`
(burrows, fern clumps, bark-style roots and rooted trees, glowing plants) and `scene.js` (the great
tree, the root arch). `window.__scene.warren` exposes `ports`, `junctions` and `routes`.

Owner, on version 1: not passed; the details must be as close to the reference as possible. Rebuilt
against the reference, item by item: the great tree stands right behind the bank, its eleven very
thick roots each steered to where the reference draws it (fanning down over the bank to the
clearing, wandering, forked, a strand twisting round the thickest, moss and bushes riding them);
the root arch is seven roots braided round each other; the burrows sit under arches of small
pale earth-brown stones with nothing growing before their mouths; the bank's top is a thicket;
the grass island lies in the middle of the clearing; squared, cracked, mossy blocks stand where the
reference has them (on the bank, by the arch, in the clearing and in clusters in both front
corners among dense bushes and ferns).
