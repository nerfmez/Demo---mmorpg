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
| Chibi hero model (Blender, `chibi/`) | **Paused** by the owner (quality not good enough; Meshy or bought/commissioned models suggested) | needs Blender bpy: `python chibi/build.py chibi/face.png chibi.glb` |

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
