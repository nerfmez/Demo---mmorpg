# Crag Highlands — standalone scene for owner review

**Owner status: v1 sent for review, 31 October 2026** (artifact https://claude.ai/artifact/HxUNnCdrbyDT74z5eschgz).

Concept: `crag-highlands.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Sixth Greenhollow Frontier zone (ที่ราบสูงผาหิน, the game's name for it), in the concept's warm
sunny tone.

A grassy clearing with an earth path among tall columned crags. A path climbs north-west up the
gully between the left crag and the shrine's rock (stone steps where it is steep). From the east
path a stone stair climbs to the shrine on the high shelf: a paved court, a stepped plinth with a
stone fire bowl and its flickering flame and warm glow, weathered pillars round it. The east path
runs on past a ruined wall of dressed blocks (a taller pier at its end, fallen blocks at its foot);
a path leaves west between the crags. White-barked birches on the crags (the game's tree in a white
bark sleeve with dark marks), old rooted trees, shrubs, white and yellow flowers, rounded mossy rocks.

All routes (`south`, `northwest`, `east`, `stair`, `west`) are walkable (checked by sampling
`blocked` and the ground height along each: no blocked rows, no jumps). The north-west path climbs
about 8.7 m, the shrine stair about 6.9 m; the west path rises gently between the crags at the
frame's edge (the no-ravine fill), so its port's height will need matching when it joins the map.

## Build

```sh
python3 scenes/crag-highlands/prepare.py
python3 scenes/crag-highlands/assemble.py
```

Built from the Greyfang Den pipeline (`../greyfang-den/`): `prepare.py` (the shrine shelf, the left
crag, the low step, the right crag, the front corner crags, the clearing), `fill.js`, `routes.js`
(ports `south`, `northwest`, `east`, `west`), `paving.js` (the shrine stair whole, other paths where
steep), `crag.js` (the shrine with its brazier and flame, the ruined wall, birches; shared rooted
trees) and `scene.js`. `window.__scene.crag` exposes `ports`, `junctions`, `routes`, `brazier`,
`blocked` and `height`.

## When it goes into the map

As for the other Frontier scenes (owner, 31 October 2026), the scene's planting carries on round it
into the map (`plantSceneSurrounds`), not ending at its bounds.
