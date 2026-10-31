# Bramble Glade — standalone scene for owner review

**Owner status: v1 sent for review, 31 October 2026** (artifact https://claude.ai/artifact/Mbfp9jihRTVcdHZNy4qR5N).

Concept: `bramble-glade.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Second Greenhollow Frontier zone (ทุ่งพุ่มหนาม, levels 9–10), in the concept's warm sunny tone like
Sunny Meadow.

A sunny earth clearing among rock shelves overgrown with flowering bramble: green mounds starred
with small pink and white wild roses. A brambled rock island with a tree on it stands in the middle;
the path from the south opens into the clearing below it. One path climbs north-west past the island
to a short paved flight up to the high ground, one runs north under an arch of bramble (dark woody
stems twisting round each other, splaying at the feet, thick with leaves and roses), and one curves
away east past the right bank. Old trees with flaring roots stand on the banks and at the back.

## Build

```sh
python3 scenes/bramble-glade/prepare.py
python3 scenes/bramble-glade/assemble.py
```

Built from the Sunny Meadow pipeline (`../sunny-meadow/`): `prepare.py` (rock shelves, the clearing),
`fill.js`, `routes.js` (`south`, `northwest`, `north`, `east`; ports the same), `paving.js` (the
north-west flight), `bramble.js` (bramble mounds, the bramble arch; shared rooted trees, the Rose
Garden's cupped roses) and `scene.js` (boulders, pebbles, trees, bramble, grass and flowers).
`window.__scene.glade` exposes `ports`, `junctions`, `routes` and `arch`.
