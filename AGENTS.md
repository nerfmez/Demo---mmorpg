# Frontier Demo — agent instructions

Current rules only. The code and `data/` are the source of truth for numbers.

## What this is

A playable 1-map web demo of an anime-style top-down MMORPG with PoE-style buildcraft. The design brief is `docs/DESIGN-SUMMARY-TH.txt`; `docs/DESIGN-STATUS.md` tracks what is built. The owner plays on an iPad (Safari/WebKit) and does not use a computer, so every change must work with touch controls.

## Architecture rules (keep it Godot-portable)

- `src/core/` holds game rules only: no `three`, no DOM, no `window`. It must run in Node (`npm test`). The renderer and UI read state and drain `game.events`; they never change game rules.
- Tunable numbers and content live in `data/*.json`, not in code. New skills, mods, monsters, items and recipes are data first.
- Randomness goes through `core/rng.js` (seeded), never `Math.random`, inside `src/core/`. Cosmetic randomness in `src/render/` is fine.
- Axes: X right, Y up, Z toward the camera. A facing angle `a` points along `(sin a, cos a)` on the XZ plane (`rotation.y = a`), the same as Godot.
- When you add a rule, add or extend a test in `tests/core/`. `docs/GODOT-PORT.md` must stay accurate.

## Design rules (from the owner's brief)

- MMORPG feel first. Monsters have readable patterns with a visible wind-up. It is not a screen-clearing race.
- Soft targeting: auto-lock only in range, switch by aim, release out of range, never auto-chase.
- Basic attack is a normal, removable skill. The movement skill has its own slot.
- Mods change behaviour (split, pierce, chain, ground, echo, element, trigger), not just damage, and are limited by tags.
- Character Level gives Stat Points. Job Level gives Job Points for the Job Tree. The Job is chosen later, not at creation. Respec costs in-game gold only.
- Monsters drop their own parts, and every material must have a use (tested in `tests/core/data.test.js`).
- Crafted gear has a random Grade and options. Upgrade (+N) is a separate system.
- The game starts on a title screen (`ui/menu.js`): new character, 3 save slots, continue. Tests skip it with `?fresh=1` (a never-saved character). Saves are character JSON (`version: 2`); change the shape only with a migration in `migrateCharacter()` and a test.
- The map has real height: keep roads and ramps walkable and bridges joined to both banks (tested in `tests/core/world.test.js`).
- Art: "change the camera, not the style". Keep the anime cel look (3-step toon ramp, soft same-hue outlines), normal proportions (about 6.5 heads, never chibi), vivid but not pastel, and monsters that are not plush toys. The reference images in `docs/reference/` are style targets, not in-game sprites.

## Performance rules

- Anything removed from the scene must free its GPU buffers: use `disposeObject()` (`src/render/dispose.js`). Mark shared geometry/materials with `userData.shared`. Monster models are pooled (`View.takeRig/releaseRig`).
- No allocations per particle or per frame in hot paths (reuse scratch vectors/colours); read layout (`getBoundingClientRect`) once per frame.
- `node tests/browser/leak.mjs` must show GPU geometry levelling off over a long session.

## Verification before pushing

1. `npm test` passes.
2. `npm run build` passes.
3. `npm run test:browser` passes. It serves `dist/` and runs Chromium at desktop and iPad-touch sizes. CI also runs WebKit.
4. For visual changes, run `node tests/browser/capture.mjs` and look at the PNGs in `tests/browser/out/`. A passing test does not prove the art is right.
5. The container has no GPU (SwiftShader), so frame times from `tests/browser/perf.mjs` are only relative. Keep visible triangles and draw calls low for iPad. Big prop sets use chunked `InstancedMesh`.

## Shared Jev context (ChatGPT and Claude)

- For multi-file work, invoke Jev yourself through GitHub before broad exploration, or reuse a report matching the exact task, keywords and source commit. Do not ask the owner to press Run workflow or copy reports. `CLAUDE.md` imports these same rules.
- Resolve the working source to an exact 40-character commit SHA. Create a unique `jev/request/<id>` branch from current main, then commit only `jev-request.json` with version 1, matching id, agent (`chatgpt` or `claude`), task, optional keywords and source_commit. See `docs/JEV-CONTEXT-TH.md` for the schema. Push triggers Jev automatically; never merge request branches.
- Use your GitHub connector or normal Git credentials. Poll `GET /repos/nerfmez/Demo---mmorpg/actions/runs?head_sha=<request-commit>` for Jev Context, then read its context job log/artifact yourself. Do not use a PR-only run-list wrapper for push requests. An Actions GITHUB_TOKEN push does not trigger this bridge. If your client has no GitHub write/read-run tools, report that precise limitation and continue labelled offline retrieval; do not claim to have invoked Jev.
- Inspect the Actions Summary/artifact `context.md` or the `Rank relevant source with Jev` job log. Compare `sourceCommit` with your checkout; never reuse a report from another commit or task.
- This is a search shortlist, not a complete dependency map. Open full files, imports and affected tests before editing; expand search if evidence is weak or missing. Preserve all verification and visual-inspection requirements above.
- Never request, print, commit, or put `TYPESAFE_API_KEY` in the game frontend. Use the repository Secret for Actions; use offline retrieval if no key is available locally.
- When changing the context tool, run `npm run test:tools`. Do not claim measured token/time savings until the trial has been evaluated.
