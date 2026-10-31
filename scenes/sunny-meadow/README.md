# Sunny Meadow — standalone scene for owner review

**Owner status: ผ่าน — approved, 31 October 2026** ("ผ่านแล้ว ทำโซนต่อไปเลย"), artifact version 2:
https://claude.ai/artifact/ULSj8QMektw5PWnv14ZCVA.

Owner, on version 1 (circling the blocks in front of the big oak): "เอาหินออก". The big square blocks and
the boulder beside the oak's trunk are gone; the oak stands in the grass between the paths.

Concept: `sunny-meadow.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
First Greenhollow Frontier zone (ทุ่งหญ้าแดดอุ่น, levels 8–9). It keeps the concept's warm, sunny
yellow-green: the ruins' own grass and path colours, not Moonroot's teal.

A level meadow in warm sun. In its middle a sundial stands on a round two-course stone dais with
three curved steps at its front: a pale disc carved with a ring of hour marks and a star, and a tall
triangular blade. Seven weathered stone posts stand round it. A broad earth apron lies in front of
the dial. The path from the south splits below it: west round the big oak, north-west up the left side (with a short link from the apron), and east round
the right, joining the apron. Low shelves of mossy rock line the paths at the front corners, the
right and left banks and behind the dial; oaks frame the meadow; white and yellow flowers grow
thickest along the front.

## Build

```sh
python3 scenes/sunny-meadow/prepare.py
python3 scenes/sunny-meadow/assemble.py
```

Built from the Old Root Stone Ring pipeline (`../stone-ring/`): `prepare.py` (low rock shelves, the
earth apron, the ruins' warm colours), `fill.js`, `routes.js` (`south`, `west`, `northwest`, `east`,
`link`; ports `south`, `west`, `northwest`, `east`; all on one level, so no stone stair), `paving.js`,
`dial.js` (the sundial and its dais, the posts, and the shared bark-style rooted trees) and `scene.js`
(loose boulders and pebbles, oaks, shrubs, grass and flowers).
`window.__scene.meadow` exposes `ports`, `junctions`, `routes` and `dial`.
