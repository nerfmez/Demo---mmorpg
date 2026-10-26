# Gull Headland — standalone scene (draft, owner review pending)

Concept: `gull-headland.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
Second of the remaining Azure Coast zones.

On the headland top, at the very edge of the sea cliff (owner, 26 October 2026: the gate must stand right at the cliff), a weathered stone gate with a carved gull on its crossbeam stands between two
stone lanterns, over a court with a ring of flat stones round a low standing stone and old standing
stones at its edge. The sea lies behind the gate. A curbed stone stair winds up from the middle tier; a west path
climbs the terraces on the left to the court and on out to the north-west. The right side is a sea cliff with
stacks and two palms; trees, shrubs, grass and flowers are the game's own; the water is the
approved beach water.

## Build

```sh
python3 scenes/gull-headland/prepare.py
python3 scenes/gull-headland/assemble.py
```

Built from the Coastal Ranger Forest pipeline (`../ranger-forest/`): `prepare.py` (terraces, the
court, the coast as a land terrace), `coast.js` (sea frame along this coast), `routes.js` (`south`,
`stair`, `west`, `westcourt`; ports `south`, `northwest`), `paving.js` (the stair as
level courses), `gate.js` (gate, lanterns, stone circle, standing stones) and `scene.js`.
`window.__scene.headland` exposes `ports`, `junctions`, `routes` and `gate`.
