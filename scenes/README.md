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
Done: space 3-4x larger (camera dist 54, layout metres x K = 1.8, terraces 3.3-3.7 m), root/arch
winding fixed, sun-glow overlay reduced.
1. Wait for the owner's feedback on the forest page.
2. Known gaps: the canopy band at the top is thinner than the concept, crowns a little lime,
   terrace tops sparser than the concept.
3. Then the ruins scene the same way.

Owner preferences learnt so far: judge composition and layout first, never just tone; round grey
stones, curved (never rectangular) ledges; check against the concept side by side before showing.
The in-game restyle (palette, water, ledges, waypoint ruin, ambience) is on PR #137; the owner did
not ask for it, it is not merged and its CI is red.
