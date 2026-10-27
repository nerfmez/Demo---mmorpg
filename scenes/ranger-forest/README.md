# Coastal Ranger Forest — preliminarily accepted standalone scene

**Owner status: ผ่านเบื้องต้น — preliminary approval, 26 October 2026** ("ผมว่าโอเคละ"), artifact version 2:
https://claude.ai/artifact/4XG7vAN6FvXnACVHgMzQSw. Retain as the baseline for game integration.

Concept: `coastal-ranger-forest.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
First of the remaining Azure Coast zones (owner, 26 October 2026: Azure Coast first, then Moonroot).

A timber ranger watchtower with a railed lookout and a red tiled roof stands on the upper plateau at
the top left. A light stone stair climbs the plateau's front from the path. The path divides round a
rock island and joins again behind it under the high bank, which carries a fence. On the right, the
coast path ends at a railed clifftop over the sea, with sea stacks in the water. Trees, shrubs,
grass, flowers, the hero and the toon paint are the game's own; the water is the approved beach
water.

## Build

```sh
python3 scenes/ranger-forest/prepare.py
python3 scenes/ranger-forest/assemble.py            # CDN Three 0.170
python3 scenes/ranger-forest/assemble.py --three /path/to/three-0.170/package   # one offline HTML
```

- `prepare.py` derives `world.js` from the retained terrain (`ruins/scene.js`): this scene's terraces,
  the coast as a land terrace whose edge is a rock face down to the sea, the tower plateau's earth.
- `coast.js` traces the waterline and gives the sea shader a frame along it (`seaQ`, `seaDist`), so the
  beach water, built for a shore across the screen, lies against this diagonal coast.
- `routes.js` holds six connected routes (`south`, `left`, `stair`, `behind`, `right`, `coast`), their
  junctions and two ports (`south`, `east`); `paving.js` lays the stair as level courses with risers.
- `tower.js` builds the watchtower; `scene.js` places fences, props, sea stacks, rocks and foliage.

`window.__scene.ranger` exposes `ports`, `junctions`, `routes` and `tower`. Game integration is the next step.
