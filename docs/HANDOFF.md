# Handoff notes (for ChatGPT, Claude and other agents)

Read `AGENTS.md` first, then `README.md` and `docs/DESIGN-STATUS.md`. The owner plays on an
iPad, writes in Thai, and deploys from `main` to GitHub Pages
(https://nerfmez.github.io/Demo---mmorpg/). Always `git fetch` first: the owner also works on
this repo with other tools, so `main` may have moved.

## Shared Jev workflow (2026-09-30)

`AGENTS.md` is the shared instruction source; `CLAUDE.md` imports it. Read
[JEV-CONTEXT-TH.md](JEV-CONTEXT-TH.md) for request examples and retrieval limits.
Besides initial exploration, use Jev for focused bug-source retrieval, unresolved
change impacts before delivery, and planning across systems/Godot boundaries.
Follow the exact-commit, budget, full-source inspection and handoff rules there;
Jev does not replace reproduction, reference searches, tests or image review.

The harbor starter-map work is tracked separately in
[draft PR #18](https://github.com/nerfmez/Demo---mmorpg/pull/18). Check its current
description, branch and test status before continuing; it is not the map on main
at the time of this note. Owner image review remains pending. Its target is a
local coastal harbor region with more land than sea, new players starting on the
beach, and beginner-appropriate beach monsters. The continent image is a concept,
not a final layout or authorization to build the whole continent.

## State (2026-09-29)

- Newest local revision: trunk geometry and colours redesigned at owner request.
  Read ART-STUDY.md; trunk parameters/palette are in data/art.json. Use
  DREAMLOOP_TRUNK_REVIEW=1 for its diagnostic close-up. Still preview only.
- Current follow-up: known flatness has been revised using arched patch geometry
  and multidirectional volume placement. Dreamloop now supports ART_ORBIT for a
  diagnostic side view. Owner visual approval is still required before publishing.
- Latest owner correction: foliage should read as connected jagged paint masses,
  not equal-sized complete leaves. IMG_0639.webp is the contour reference; keep the
  soft existing palette. The new local patch revision removes round filler cores,
  adds irregular silhouettes and unequal bowed patches; image review remains pending.
- Previous local work: owner approved proceeding with the Ni no Kuni direction plan.
  An opt-in sample is implemented with `art=anime`; `art=baseline` provides matching
  specimen positions using the previous rejected art. Read `docs/ART-STUDY.md` for
  capture commands, coordinates, caveats and the image-review gate. New foliage is
  `src/render/anime-study.js`; palettes/shape arrays are in `data/art.json → anime`.
  The extra sample props are renderer-only and are not release collision/layout data.
- Owner image review is still pending. Do not merge/deploy or expand all biomes from
  technical tests. Earlier solid crowns, directed leaf sprays and oval-leaf shrubs
  were rejected. The new screenshots must be reviewed separately.
- Owner's latest environment direction: softer daylight/colours like the seaside video.
  No pine trees anywhere. Beach sand has shells, with no grass/flowers/ferns/reeds/bushes.
  `sea.surf` controls waves washing up and retreating. The centre river is shallow and
  freely wadeable (`river.walkable/depth/bankWidth`); bridges are optional. Preserve this
  direction when adding props; use the shared `isBeach()` mask. Dreamloop now includes
  surf phases and touch traversal in both directions.
- Map 448×352 m with terrain height, 9 zones incl. Sunfall Coast by the sea, 8 waypoints,
  ~280 monsters, 2 bosses. Title screen, character creation, 3 save slots, quests.
- Art/UX redesign by the owner (art.js, atlas.js, inventory.js, ux.css, art.css) is the
  current visual style: new content ids need artwork in `src/ui/art.js`
  (tests/core/presentation.test.js enforces it).
- Long-session stutter fixed by freeing GPU buffers (`src/render/dispose.js`) and pooling
  monster models; check with `node tests/browser/leak.mjs`.
- EXP/Job strip at the bottom of the screen; combat has a 1-2-3 combo finisher, monster
  flinch, hit-stop and hurt vignette (`progression.json` → `combat`).

## Tools

- Meshy MCP server is configured in `.mcp.json`. The key comes from the environment
  (API credential for api.meshy.ai + `MESHY_API_KEY` env var placeholder). Never ask the
  owner to paste a key. First check: `meshy_check_balance` (free). Tell the owner the
  credit cost before any generation.
- Meshy pipeline (first asset: `rusty_sword`): concept image with `meshy_image_to_image`
  (nano-banana, 3 cr) from the item's icon, then `meshy_image_to_3d` smart-topology meshy-t2
  textured (15 cr). Shrink the texture to 512 px, bake the grip to the origin with the blade
  along +Z, save to `public/models/`, and register it in `data/models.json`. Good fits: rigid
  pieces (weapons, helms, hair pieces, props, drops) and monsters. The player body stays
  procedural so skin, eye and hair colours stay customisable.
- Hero body plan (owner approved): Meshy bare body + rig (done, `src/render/skinned.js`),
  everything else in code. Steps: 1) skinned body in game, 2) old animations drive it
  (both done), 3) anime face drawn as a texture (done, `src/render/face.js`: open, blink,
  attack and hurt expressions), 4) hair (done, `src/render/hair.js`: locks + hairline-cut cap per style, angel-ring
  highlight, hair colour from the look), 5) clothes and armour (done, `src/render/outfit.js`: bandolier, belt,
  pouches, boot cuffs, bracers; per-armour body colour (`vest` zone) and pieces; hair tucks
  under helmets), next: NPCs on the skinned body, then NPCs. `buildHumanoid(..., {procedural: true})`
  still builds the old body for comparison.
- Monster models (done for all 8 regular monsters and both bosses): concept with
  `meshy_image_to_image` (nano-banana, 3 cr) from `docs/reference/target-gameplay-mock.png`,
  then `meshy_image_to_3d` meshy-6 textured, remeshed (30 cr); shrink the texture to 512 px.
  Register in `data/models.json` → `monsters` and tune `bones`/`segments` with a lab page
  that renders the monster's states (idle, walk, wind-up, act) until nothing tears.
- Animation: walk/run come from Meshy's mocap clips baked into `data/gait.json` by
  `node scripts/bake-gait.mjs` (re-run it if the body or its rig changes); step rate follows
  ground speed so feet do not slide. The sword combo is slashA/slashB/slashC, picked by
  `castStart.step`. Shoulders shrug when an arm goes overhead (skinned.js).
- Skill animations live in `src/render/actions.js`: one action per skill line (`BY_SKILL`,
  fallback `BY_KIND`), melee combos per weapon (sword, greatblade/axe two-handed, dagger),
  bow vs thrown Hunter's Shot. Channels beyond bone angles: drop, spin, ikL/ikR+ikw (hand
  targets, `src/render/ik.js`), grip (second hand on the handle), aim (drawn bow faces the
  target). Each action's `hit` key is stretched onto the skill's cast time. Review poses with
  the lab pages (sheet.html pattern: play an action, step to key times, render a grid).
- Art review pages: run `npx vite --port 5199` and open pages you put in the git-ignored
  `tests/browser/out/` (import from `/src/...`), then screenshot them with Playwright.

## Possible next steps the owner mentioned

- Copy animation timing/poses from reference videos (extract frames, turn into keyframes
  for `HumanoidAnimator` in `src/render/hero.js`).
- Use Meshy for models/rigs/animations, keeping the game's art style and iPad budgets.
