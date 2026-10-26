# Concept scenes (standalone, outside the game)

The owner's concept images (`concepts/`) rebuilt as standalone 3D pages, one per area, as close to
the concept as possible, before anything moves into the game. Three.js 0.170 from jsDelivr; open
the built `index.html` in a browser. Each page has a wipe slider to compare with the concept.

| Scene | Status | Build |
|---|---|---|
| Beach (`arrival-beach-40deg`) | **Approved by the owner** ("the opening scene is OK"). Published: https://claude.ai/artifact/7Eth678okKYw3UenAP4CGq | `python3 tools/buildbeach.py` writes `beach/index.html` |
| Forest trail (`forest-trail-40deg`) | **Approved by the owner**. `forest/latest-vs-concept.png` is the last capture (concept on top) | `python3 forest/assemble.py && python3 forest/buildpage.py` writes `forest/index.html` |
| Ruins approach (`ruins-approach-40deg`) | **Rebuilt 23 October; owner review pending.** [Rebuild and inspection record](ruins/REVIEW.md) | `python3 ruins/assemble.py && python3 ruins/buildpage.py` writes `ruins/index.html` |
| Singing Conch Coast (`shell-beach/`) | **ผ่านเบื้องต้น — preliminary owner approval, 23 October, public version 6.** Retain as the baseline; uses the approved opening beach water. [Build and review record](shell-beach/README.md) | `python3 shell-beach/prepare.py && python3 shell-beach/assemble.py` |
| Hill Windmill (`hill-windmill/`) | **ผ่านขั้นต้น — preliminary owner approval, 24 October 2026 (public version 8).** Retained baseline: timber/plaster windmill, connected hill routes and four world-space exits. [Build and review](hill-windmill/README.md) | `python3 hill-windmill/prepare.py && python3 hill-windmill/assemble.py` |
| Azure Meadow Well (`azure-meadow/`) | **ผ่านเบื้องต้น — preliminary owner approval, 24 October 2026 (public version 10).** Retained baseline: revised composition, oval well, broken field walls and orchard; seven connected routes and five world-space ports. [Build and review](azure-meadow/README.md) | `python3 azure-meadow/prepare.py && python3 azure-meadow/assemble.py` |
| Rose Garden Glade (`rose-garden/`) | **ผ่านเบื้องต้น — preliminary owner approval, 24 October 2026 (public version 11).** Retained baseline: timber gazebo, climbing roses, planted stone court and connected stair paths. [Build and review](rose-garden/README.md) | `python3 rose-garden/prepare.py && python3 rose-garden/assemble.py` |
| Coastal Ranger Forest (`ranger-forest/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 2, https://claude.ai/artifact/4XG7vAN6FvXnACVHgMzQSw).** Watchtower plateau, stone stair, path dividing round a rock island, sea cliffs with stacks. In the game on Azure Coast's east coast (x 162–216.6, z -62..-22.1). [Build](ranger-forest/README.md) | `python3 ranger-forest/prepare.py && python3 ranger-forest/assemble.py` |
| Gull Headland (`gull-headland/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 3, https://claude.ai/artifact/3hvjamnVTdp4HwGZDfhHv9).** Stone gate with a carved gull, lanterns and stone circle on the headland top, curbed stair, sea cliffs with stacks. In the game at Azure Coast's north-east corner (x 162–216.6, z -120..-80.1), beside the Moonroot seam. [Build](gull-headland/README.md) | `python3 gull-headland/prepare.py && python3 gull-headland/assemble.py` |
| Mirror Pond (`mirror-pond/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 6, https://claude.ai/artifact/YRE8REPWfr1GbfzaNNPxw1).** First Moonroot Grove zone, in the region concept's teal tone: a pond in a ring of mossy stone, stepping stones to a stair up the rock rim and a moon gate behind, willows and rooted trees. [Build](mirror-pond/README.md) | `python3 mirror-pond/prepare.py && python3 mirror-pond/assemble.py` |
| Moonstone Camp (`moonstone-camp/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 3, https://claude.ai/artifact/PqbowbCkpB7D95dBY2AfR6).** Second Moonroot Grove zone, in the region's teal tone: a clearing under a wooded rock terrace with two canvas tents, a campfire, log benches and the camp warp pillar in its rubble ring; stone stairs up both banks. [Build](moonstone-camp/README.md) | `python3 moonstone-camp/prepare.py && python3 moonstone-camp/assemble.py` |
| Old Root Stone Ring (`stone-ring/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 1, https://claude.ai/artifact/E1j8hiqDU25sz3r6mabsTE).** Third Moonroot Grove zone, in the region's teal tone: on a mound above a plaza, tall weathered standing stones ring a paved circle and a broken moon altar; great rooted trees behind; a stone stair up the mound and paths round both sides. [Build](stone-ring/README.md) | `python3 stone-ring/prepare.py && python3 stone-ring/assemble.py` |
| Fern Rise (`fern-rise/`) | **ผ่านเบื้องต้น — preliminary owner approval, 26 October 2026 (artifact version 1, https://claude.ai/artifact/KbQwZdwcNs42peJmAdscX8).** Fourth Moonroot Grove zone, in the region's teal tone: giant fiddlehead ferns coil on a mossy rock rise amid a fern thicket; paths wind up both sides and a stone stair climbs the right; great rooted trees round. [Build](fern-rise/README.md) | `python3 fern-rise/prepare.py && python3 fern-rise/assemble.py` |
| Chibi hero model (Blender, `chibi/`) | **Paused** by the owner (quality not good enough; Meshy or bought/commissioned models suggested) | needs Blender bpy: `python chibi/build.py chibi/face.png chibi.glb` |

## Zone tones (owner, 26 October 2026)
Each region keeps its own colour mood, so the zones feel different. Moonroot Grove scenes take the
tone of `assets/moonroot/moonroot_grove_concept.jpg` (deep teal-green, blue-green round crowns,
pale roots, glowing cyan plants and white flowers, cool water), not the warmer yellow-green of the
per-zone 40-degree concepts (`docs/reference/landscapes-40deg-20261022/moonroot-grove/` on branch
`docs/landscape-concepts-40deg-20261022`); those give the layout of each Moonroot zone.

## Shared stone style
All scenes use the arrival beach's stones: neutral grey palette, mossy tops, lavender-shadow
three-step light and the `#4c4852` ink outline. The ruins-derived scenes take it from
`ruins/scene.js` (`ruinPalette`, `masonryMaterial`). Their stairs (`*/paving.js`) are continuous
grey courses on every steep section; the earlier short flights are only replayed for their
seeded draws, so layouts and colliders stay as approved.
Loose field stones and dry-stone walls use `fieldStone` (`ruins/scene.js`): the same palette and
outline, smooth-shaded and rounded, never taller than wide. A terrace marked `stones` gets a
dry-stone face instead of rock columns (Azure Meadow).

## How the forest page is made
`forest/assemble.py` takes the reusable blocks of `beach/src.html` (page + wipe, renderer, the
painted 3-step `paint()` shader, faceted stones, the game's foliage, the hero) and appends
`forest/scene.js`. In `scene.js` the layout is authored in **concept pixels** (u, v = fractions of
the 1672x941 concept) and projected onto the ground by `P(u, v, y)`, so ledges, trails, trees and
rocks land where the concept has them. Terraces are closed outlines with stone ledges on their
walls, trails are polylines with widths in metres, stairs climb from the left trail to the back.

## Next steps
Done:
- Space enlarged twice. Now K = 2.4: camera dist 72, and every layout metre is x K.
  `assemble.py` reads K from `scene.js` for the camera and the shadow box.
- Owner feedback round 2 (the owner prefers the forest over the other attempts):
  - the middle island is now a roundabout, walled all round, with a trail behind it from the
    stairs foot to the right trail;
  - some ledge runs are one long slab instead of separate blocks;
  - trees are bigger (scale TS = K/1.8 x 1.25), and back-row trunks are lower so the crowns
    stay in frame.
- Owner feedback round 3 ("the root arch isn't pretty; the trails are cut too sharp"):
  - the arch is 8 strands braided round a core curve, loose at the feet and tight over the
    trail; each strand carries on as a root leg into the ground, with leaves along the top;
  - trails are Catmull-Rom curves through the authored points. Their edge wanders
    (`edgeWob`), and the bake breaks it up further: a soft ragged border, grass islands on the
    dirt and bare patches in the grass. Grass and bushes follow the same `trailEdge`.
- Owner feedback round 4 ("not pretty": the root arch and the trees/bushes):
  - crowns and shrubs use `clumpFoliage`/`clumpTexture` in place of the game's foliage. A crown
    is many small puffs of lobed-leaf cards; each puff is lit on its own in three hard steps,
    over a dark core;
  - the arch is one thick trunk (`coreR`) with six ropy cords wound round it and buttress
    roots at both feet.
- Owner feedback round 5 ("why black leaves"; "the concept's cliffs are rock faces with grass
  growing, not stones set round a cliff"):
  - the dark core is gone from the crowns, and the shade tone is a clearer blue-green;
  - ledge terraces have smooth outlines and a sharp drop. `buildCliffs` builds one continuous
    face along them, split by vertical cracks into columns; each column is two planes meeting
    at a ridge. A grass lip rolls over the top, with grass on the lip and in the cracks;
  - cliffs are 1.45x taller (`H()`).
- Owner feedback round 6 ("the cliff tops have no rock in them"; "the roots are still not
  good"; "why did you change the leaf style again — it must go into the game"; "make the middle
  tree a sakura"):
  - foliage is back to the game's own `animeFoliage` (keep it; do not invent a new leaf style);
  - each cliff column has a rounded edge and a flat stone cap, mossy in patches, with the grass
    behind it;
  - roots use `groundRoot`: they lie along the ground half sunk, and at a cliff they bend over
    the lip and run down the face;
  - the island tree is a cherry: the game's trunk and crown in `SAKURA` colours, with petals
    on the ground and falling;
  - shadow normal bias scales with K (removes acne stripes).
1. Wait for the owner's feedback on the forest page (artifact HqTbjpLK4p91KHAw3yiJWd).
2. Known gaps: canopy band at the top thinner than the concept, crowns a little lime, terrace tops
   sparser than the concept, a hard dark shadow patch by the stairs.
3. Earlier ruins scene (superseded by the 23 October rebuild in [ruins/REVIEW.md](ruins/REVIEW.md)):
   Method:
   - Each element is authored as its screen box in the concept: [u0, u1] across, the foot at
     vFoot, the top at vTop. Its real size comes from the camera (`wide()`, `tall()`), and
     the whole world is then scaled by K. The frame matches the concept; only the hero is
     smaller, which gives the extra room.
   - The concept cheats its heights. Read in 3D it is: the path, a rock ridge (with a high
     tier on its left), then a plaza only ~1 m up behind the ridge, reached by a gentle
     paved ramp round the ridge's right end.
   - Check: `python3 scenes/tools/diffmap.py <capture.png> <out.png>` segments the concept
     and the render into dirt and stone, and prints a coarse overlap score.
     - Current score: dirt 0.56, stone 0.44 (the old version scored 0.44 / 0.29).
     - Target: 0.7 or better.
   Known gaps: the ridge is one continuous face (the concept's is stacked blocks with greenery
   between them), the back trees hide part of the ruins row, and the foreground rocks are too
   round.

## Status (owner's verdict)
- Singing Conch Coast (`shell-beach/`): **ผ่านเบื้องต้น**, 23 October 2026, public version 6. Keep the revised conch, curved path and expanded space as the accepted baseline.
- Beach (`beach/`): approved. Forest (`forest/`): approved ("ผ่าน").
- In the game (PR #148): all six finished scenes are placed in the world. On 25 October their surroundings were blended in: ground aprons, grass rings and ring planting. See `docs/review/accepted-scenes-20261024/REVIEW.md`.
- Ruins (`ruins/`): rebuilt again on 23 October to the approved beach/forest standard,
  with fitted arch wedges, bonded masonry, fractured ridge shelves and flush worn
  approach paving. Waiting for the owner's verdict; the review record identifies
  the exact delivered preview and inspected captures.
- More concepts to build the same way: 19 zone concepts at the 40-degree camera on branch
  `docs/landscape-concepts-40deg-20261022`, folder `docs/reference/landscapes-40deg-20261022/`.
- The in-game restyle that was on this branch (palette, water, ledges, waypoint ruin, ambience)
  was never requested. It was taken off this branch so that only the scenes go into the
  project. It is still in history: the commits before `a65c073`, for example `5380c2a`.

Owner preferences learnt so far: everything must be portable into the game (reuse the game's
foliage and models, only recolour); judge composition and layout first, never just tone; round grey
stones; cliffs are rock faces with grass growing on them, never stones set in a row; more room to walk; big trees; check against the concept side by side before showing.
The earlier in-game restyle was removed from PR #137 at `a3f60a2`; its historical
status does not describe this standalone-scene rebuild.

For a single offline ruins HTML with its Three 0.170 modules embedded, run
`python3 ruins/buildpage.py --three /absolute/path/to/three-0.170-package` after
assembly. The default build keeps the original CDN import map.
