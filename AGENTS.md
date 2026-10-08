# Frontier Demo — agent instructions

Current rules only. The code and `data/` are the source of truth for numbers.

## What this is

A playable web demo (an open world: Azure Coast and the Greenhollow Frontier meet along a seam; the neighbouring map streams in near the border) of an anime-style top-down MMORPG with PoE-style buildcraft. The design brief is `docs/DESIGN-SUMMARY-TH.txt`; `docs/DESIGN-STATUS.md` tracks what is built. The owner plays on an iPad (Safari/WebKit) and does not use a computer, so every change must work with touch controls.

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
- The game starts on a title screen (`ui/menu.js`): new character, 3 save slots, continue. Tests skip it with `?fresh=1` (a never-saved character). Saves are character JSON (`version: 11`); change the shape only with a migration in `migrateCharacter()` and a test.
- The map has real height: keep roads and ramps walkable and bridges joined to both banks (tested in `tests/core/world.test.js`).
- Art: "change the camera, not the style". Keep the anime cel look (3-step toon ramp, soft same-hue outlines), normal proportions (about 6.5 heads, never chibi), vivid but not pastel, and monsters that are not plush toys. The reference images in `docs/reference/` are style targets, not in-game sprites. For skill and combat effects, `docs/VFX-REFERENCE.md` is both the VFX research library and style target. Before implementing or substantially restyling a combat VFX, search the linked Cartoon FX Remaster gallery for effects matching the skill's element and function, study multiple relevant clips when available (anticipation, main motion, impact, trail and lingering/status layers), then build an original version for Frontier. Never copy paid assets or reproduce one reference one-to-one.

## Performance rules

- Anything removed from the scene must free its GPU buffers: use `disposeObject()` (`src/render/dispose.js`). Mark shared geometry/materials with `userData.shared`. Monster models are pooled (`View.takeRig/releaseRig`).
- No allocations per particle or per frame in hot paths (reuse scratch vectors/colours); read layout (`getBoundingClientRect`) once per frame.
- Run `node tests/browser/leak.mjs` only when changing resource ownership, pooling/disposal or a concrete growth symptom. Start with the relevant resource probe; extend the long session only if its samples remain unresolved. Record geometry stabilisation when this check applies.

## Validation and early review

For all visual, UI and animation work, follow [the visual quality workflow](docs/VISUAL_QUALITY_WORKFLOW.md). Define observable visual criteria, review an unobscured normal-speed prototype, then inspect the exact final runtime artifacts separately from technical tests. Major visible defects block a completion claim. Include a short delivery review record with artifact identity, inspected views/timestamps, faults found/fixed and remaining limits.

Choose checks from the changed behaviour, not the number of files. Planning/read-only
work runs no tests. Do not make a reviewable draft wait for unrelated full suites.

| Change | Before draft review | Before merge |
|---|---|---|
| Docs/instructions/planning | Inspect diff, links and executable examples if any; no game/browser tests | Relevant documentation checks only |
| CI/tooling | Static YAML, trigger and changed-file routing checks; affected tool tests | Relevant configuration/tool checks; no gameplay solely to edit this policy |
| Small visual/animation | Build and focused gameplay screenshot/sequence; targeted core checks if combat rules change | Core/build and desktop/iPad smoke in Chromium/WebKit; relevant visual sequence |
| Core/data/save | Targeted affected safety tests and build; focused browser case for changed presentation/input | Core/build and desktop/iPad smoke in Chromium/WebKit; affected UI/save flow |
| Terrain/map | World route/collision tests and focused location screenshots | Above game checks plus map walkthrough/capture |

- Contact attacks must not damage before the authored hit time or hit twice; test
  range/arc misses and state cleanup. Save changes need migration/preservation tests.
  These safety checks are automated; owner review covers poses, readability and feel.
- Skill effects: build and check them in the Skill Lab (`lab.html`, `docs/SKILL-LAB.md`; `node tests/browser/lab.mjs <skill>` takes ~10 s) and give the owner its link (`<site>/lab/lab.html`, published from `claude/vfx-*` branches). Do not record full-game videos for effect review.
- Use the existing focused capture that exercises changed content. Full-map capture,
  Dreamloop and long stress/leak runs apply to map-wide/resource changes or concrete
  evidence, not every local art edit. Inspect actual screenshots before sharing.
- After relevant checks pass, send the draft/screenshots for owner review. Report CI
  as pending/failed/passed; do not wait for unrelated jobs to deliver the draft.
  Required premerge checks still apply; never merge around branch protection.
- CI owns full smoke and affected UX; renderer review does not repeat them. Reuse a
  passing check for the same source/configuration; repeat only after changes, a new
  failure or unresolved evidence. Do not extrapolate hardware iPad FPS from SwiftShader.
- If an unrelated baseline/browser setup failure appears, report it separately.
  Do not expand the task into fixing it or repeatedly retrying it. After a blank
  capture, use one supported fallback; report a blocker if neither works.
- Stop validation once the relevant evidence is sufficient. Do not add arbitrary
  stress rounds, extra browser installs or broad exploration to fill a checklist.

## Shared Jev context (ChatGPT and Claude)

- Use direct search/read first when paths and contracts are known. Use Jev only when unresolved source discovery across systems would benefit from ranked context; multiple files alone are not a trigger. Docs/planning need no Jev unless that discovery is actually needed. If used, invoke it yourself or reuse an exact source/task report; do not ask the owner to run workflows. `CLAUDE.md` imports these same rules.
- Jev can help with unresolved debugging, change-impact discovery and cross-system planning. For debugging, put reproduction steps, expected/actual behaviour, device/engine and a short sanitized error in task; put relevant paths, symbols and test names in keywords. Reproduce the failure and inspect the full implementation before deciding its cause.
- Before delivering multi-file changes, review the diff and trace changed symbols/content IDs through callers, data consumers, UI/rendering, saves/migrations, tests and port documentation. If direct searches or an existing report leave affected areas unresolved and ranked retrieval would help, make a focused Jev request with changed paths/symbols and the suspected consumers; confirm references with `rg`, full-file reads and appropriate tests. Jev does not compute a dependency graph or certify that nothing is missing.
- For features spanning core/data/render/UI/saves or a Godot port, locate contracts and extension points with direct reads first; ask Jev only for unresolved discovery. Read the affected implementation and relevant port contracts; the agent owns the plan. Do not reread unrelated systems or request new context merely because a known-source edit changed its SHA.
- Keep one focused request for related questions; do not call Jev per file or routine edit. Request more context only when a new failure, changed scope/source or missing evidence requires it. Respect the existing budget and exact-match cache rules. Public requests must not contain credentials, private data or entire raw logs.
- ChatGPT with the installed Jev Connect plugin has a direct repository-ranking channel. When ranked source discovery is justified, call `jev_rank_repository_context` yourself; it reads the latest `main` at an exact commit, ranks bounded allowlisted text excerpts and returns the shortlist, `AGENTS.md`, source SHA and limitations. Do not create a request branch or wait for Actions for that normal ChatGPT path. Use `jev_evaluate` only for focused text/JSON evaluation when useful; it is not a repository reader. `jev_status` is readiness/budget metadata only and does not call TypeSafe.
- Claude in Claude Code on the web has a direct channel: the session proxy injects the TypeSafe key for `api.typesafe.ai`, so run `scripts/jev-context.mjs` from a clean checkout of the exact source commit with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt TYPESAFE_API_KEY=injected-by-proxy` and `JEV_OUTPUT_DIR`/`JEV_CACHE_DIR` outside the repo (see `docs/JEV-CONTEXT-TH.md`). Use it first; fall back to the GitHub request branch below if it fails. The placeholder is not a key; never read or print the injected one. Direct runs skip the Actions budget counter and leave no artifact, so record the report in the PR/handoff.
- GitHub Actions is the fallback when the active agent has no working direct Jev channel, or when ChatGPT must rank a committed source other than the latest `main`. Resolve the source to an exact 40-character commit SHA, create a unique `jev/request/<id>` branch from current main, then commit only `jev-request.json` with version 1, matching id, agent (`chatgpt` or `claude`), task, optional keywords and source_commit. See `docs/JEV-CONTEXT-TH.md` for the schema. Push triggers Jev automatically; never merge request branches.
- For the GitHub fallback path, use your GitHub connector or normal Git credentials. Poll `GET /repos/nerfmez/Demo---mmorpg/actions/runs?head_sha=<request-commit>` for Jev Context, then read its context job log/artifact yourself. Do not use a PR-only run-list wrapper for push requests. An Actions GITHUB_TOKEN push does not trigger this bridge. If your client has no direct Jev channel and no GitHub write/read-run tools, report that precise limitation and continue labelled offline retrieval; do not claim to have invoked Jev.
- For the GitHub fallback path, inspect the Actions Summary/artifact `context.md` or the `Rank relevant source with Jev` job log. Compare `sourceCommit` with your checkout; never reuse a report from another commit or task. For ChatGPT direct ranking, compare the returned source SHA with the latest `main` you are actually using.
- Jev ranks committed tracked source only. ChatGPT's direct repository-ranking tool currently targets latest `main`; use direct diff/search for branch-only or uncommitted edits, or the GitHub fallback for a different committed source SHA. Tooling files (`scripts/`, `tests/tools/`, workflows) and the Jev guide itself are outside the current source index: read them directly when relevant.
- This is a search shortlist, not a complete dependency map. Open full files, imports and affected tests before editing; expand search if evidence is weak or missing. Apply the validation tiers and visual-inspection requirements above.
- Never request, print, commit, or put `TYPESAFE_API_KEY` in the game frontend. Use the repository Secret for Actions; use offline retrieval if no key is available locally.
- When changing the context tool, run `npm run test:tools`. Do not claim measured token/time savings until the trial has been evaluated.
- In a PR or task handoff, record the source SHA, task/keywords, request/run link, report status/cache use, files actually inspected, unresolved impacts and test results. The next agent must fetch current source and recheck report identity before reuse. See [the shared guide](docs/JEV-CONTEXT-TH.md) and [handoff notes](docs/HANDOFF.md).
