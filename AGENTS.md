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
- Art: "change the camera, not the style". Keep the anime cel look (3-step toon ramp, soft same-hue outlines), normal proportions (about 6.5 heads, never chibi), vivid but not pastel, and monsters that are not plush toys. The reference images in `docs/reference/` are style targets, not in-game sprites.

## Verification before pushing

1. `npm test` passes.
2. `npm run build` passes.
3. `npm run test:browser` passes. It serves `dist/` and runs Chromium at desktop and iPad-touch sizes. CI also runs WebKit.
4. For visual changes, run `node tests/browser/capture.mjs` and look at the PNGs in `tests/browser/out/`. A passing test does not prove the art is right.
5. The container has no GPU (SwiftShader), so frame times from `tests/browser/perf.mjs` are only relative. Keep visible triangles and draw calls low for iPad. Big prop sets use chunked `InstancedMesh`.
