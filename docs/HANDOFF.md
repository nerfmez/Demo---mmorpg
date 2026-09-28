# Handoff notes (for a new Claude session)

Read `AGENTS.md` first, then `README.md` and `docs/DESIGN-STATUS.md`. The owner plays on an
iPad, writes in Thai, and deploys from `main` to GitHub Pages
(https://nerfmez.github.io/Demo---mmorpg/). Always `git fetch` first: the owner also works on
this repo with other tools, so `main` may have moved.

## State (2026-09-28)

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

## Possible next steps the owner mentioned

- Copy animation timing/poses from reference videos (extract frames, turn into keyframes
  for `HumanoidAnimator` in `src/render/hero.js`).
- Use Meshy for models/rigs/animations, keeping the game's art style and iPad budgets.
