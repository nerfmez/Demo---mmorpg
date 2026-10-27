# Mirror Pond — preliminarily accepted standalone scene

**Owner status: ผ่านเบื้องต้น — preliminary approval, 26 October 2026** ("โอเคฉากต่อไปได้"), artifact version 6:
https://claude.ai/artifact/YRE8REPWfr1GbfzaNNPxw1.

Concept: `mirror-pond.png` from concept commit `8ce972eb90d58dedb25c8fcf3c019dc89025ff96`
(branch `docs/landscape-concepts-40deg-20261022`), retained without recompression as `concept.png`.
First Moonroot Grove zone. The owner chose the region concept
(`assets/moonroot/moonroot_grove_concept.jpg`) for the layout and tone of the whole region (camp,
pond, stone ring from west to east; deep teal crowns; stepping stones across the pond; trees with
spreading roots) and the 40° zone references for each zone's details.

A still pond in a ring of mossy stone blocks lies in front of an open earth clearing. Stepping
stones cross it to a stone stair up the rock rim; on the high ground behind stands the moon gate,
a ring of dressed stone with a pale disc and a crescent of moon-glass. Paths ring the pond on
both sides, climbing stone flights to the high ground and on out west and north. Two weeping
willows lean over the water; old trees round the clearing spread their roots, one over the rim
into the water. Lily pads, a rocky islet and Moonroot's small glowing plants finish it.

## Build

```sh
python3 scenes/mirror-pond/prepare.py
python3 scenes/mirror-pond/assemble.py
```

Built from the Gull Headland pipeline (`../gull-headland/`): `prepare.py` (terraces, the clearing,
Moonroot's grass and path colours), `pond.js` (the waterline as a smooth radius round the pond's
centre; `pondIn` is metres inside the water, used by the ground, the water shader and planting),
`fill.js` (no ravines), `routes.js` (`south`, `left`, `right`, `back`, `west`, `stair`; ports `south`,
`west`, `north`), `paving.js` (stone flights wherever a route climbs), `shrine.js` (moon gate,
stepping stones, shore blocks, islet, lily pads, willows, rooted trees, glowing plants) and
`scene.js`. The hero can walk the stepping stones. `window.__scene.pond` exposes `ports`,
`junctions`, `routes`, `moon` and `stones`.

Owner, on version 1 (circling the left willow): "make that tree only strands, no bush, and improve
all the roots". The willows are now strands only, springing from branch ends over the crown and
falling in curtains; every tree's roots flare from the trunk as tapered buttresses, run half
buried over the ground and fork, and the roots that reach the pond end just past its waterline.

Owner, on version 2: "the roots don't join the real trunk". Each root now leaves the game trunk's
bark (its authored spine radius at that height), as thick as the bark it grows from, and curves
down onto the ground within a short flare, so trunk and roots read as one piece.

Owner, on version 3: the roots join now but still look like another tree's, and walk across the
stones. Roots and the willows' trunks, branches and foot roots are now bark in the game trunk's
own style (`barkTube`: nine flat facets toned light, mid or shadow by the sun). The stepping
stones are an even chain from the plaza's shore to the rim stair's foot, close enough to step
across; the way across (shore, stones, stair) is walkable, and the moon gate blocks only its two
feet. Checked by walking the hero from the plaza over every stone and up the stair to the gate.

Owner, on version 4: the stones need not be that close, just walkable; make the moon gate more
like the reference. The stones are now a stride apart (still walkable along the crossing line,
checked by walking the hero to the gate). The moon gate is the reference's: an open ring of
twenty dressed, mossy stones, a round stone moon held in its upper middle, three curved block
steps below and flowers at its foot.

Owner (circling the spot), on version 5: the moon goes here and floats, joined to nothing. The
stone moon now floats inside the ring right of its middle, a little above centre, with no collar.
