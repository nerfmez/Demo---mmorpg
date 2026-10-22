# Concept scenes (standalone, outside the game)

The owner's concept images (`concepts/`) rebuilt as standalone 3D pages, one per area, as close to
the concept as possible, before anything moves into the game. Three.js 0.170 from jsDelivr; open
the built `index.html` in a browser. Each page has a wipe slider to compare with the concept.

| Scene | Status | Build |
|---|---|---|
| Beach (`arrival-beach-40deg`) | **Approved by the owner** ("the opening scene is OK"). Published: https://claude.ai/artifact/7Eth678okKYw3UenAP4CGq | `python3 tools/buildbeach.py` writes `beach/index.html` |
| Forest trail (`forest-trail-40deg`) | **In progress**, shown to the owner after the 3-4x space change. `forest/latest-vs-concept.png` is the last capture (concept on top) | `python3 forest/assemble.py && python3 forest/buildpage.py` writes `forest/index.html` |
| Ruins approach (`ruins-approach-40deg`) | Not started | — |
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
1. Wait for the owner's feedback on the forest page (artifact HqTbjpLK4p91KHAw3yiJWd).
2. Known gaps: canopy band at the top thinner than the concept, crowns a little lime, terrace tops
   sparser than the concept, a hard dark shadow patch by the stairs.
3. Then the ruins scene the same way. `ruins/assemble.py` and `ruins/buildpage.py` are copied
   from the forest; `ruins/scene.js` is not written yet. The layout notes (plaza with a stone
   ring, arch, pillars, a retaining wall with a paved ramp) are in the session handoff.

Owner preferences learnt so far: judge composition and layout first, never just tone; round grey
stones, curved (never rectangular) ledges, some ledge runs as one slab; more room to walk; big trees; check against the concept side by side before showing.
The in-game restyle (palette, water, ledges, waypoint ruin, ambience) is on PR #137; the owner did
not ask for it, it is not merged and its CI is red.
