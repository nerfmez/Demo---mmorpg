# Root Warren — standalone scene in owner review

**Owner status: in review, 26 October 2026**, artifact version 5:
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

Owner, on version 2: the trunk must be far thicker, it is a giant. The great tree now has a
giant's trunk as wide on screen as the reference's: a column core with eight great strands
twisting up round it (the reference's trunk reads as fused roots), each strand splaying out and
down at the foot; the great roots leave from its surface.

Owner, on version 3: the stones are not yet natural. Each block is now a weathered old stone
(`weatheredBlock`): edges worn round, tilted and sunk into the ground, warm grey of differing
shades; some broad and low, some tall, some split into two stacked pieces; a smaller broken piece
leaning on it, rubble at its foot, moss on its top, and grass, flowers, a fern and a bush growing
up round its base.

Owner, on version 4: improve the burrows' area a little. The bank's face is now earth set with
small rounded brown stones (`bankFace`), thin roots hang over its lip, grass, flowers and bushes
spill from its top, and ferns and flowers grow along its foot. Each burrow is a tunnel growing
darker inward under an arch of small earth-brown stones set into the face, with pebbles and a few
small orange mushrooms before its mouth.
