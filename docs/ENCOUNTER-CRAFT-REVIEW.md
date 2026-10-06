# Encounter and craft organisation — draft review

Base: `1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c` (main, rechecked 2026-10-06).
Branch: `feat/encounter-craft-review-20261006`. Do not merge or deploy before owner review.
PR80's four performance files and every CI/deploy workflow are unchanged.

## Before → after

| Area | Before | Proposed implementation |
|---|---|---|
| Normal populations | Species sample the entire zone; can silently underfill | 44 species/zone habitats, real geometry checks, explicit deficit reporting; same configured counts |
| Azure population, seed 12345 | 92 actual / 93 planned (one coastal gull missing) | 93 / 93 |
| Frontier population, seed 12345 | 300 normal + 2 bosses | Same 300 + 2 |
| Safe services | 9 m warp exclusion and safe-centre sampling | Aggro-aware warp/player/respawn exclusion; safe-floor/routing probes; existing roads and boss arenas kept clear |
| Field guide | Nominal `zone.level+`; declared species; zone drops omitted | Actual placement counts/ranges; species subhabitats; existing species + zone + global drops; discovered-area initial-spawn dots |
| Equipment crafting | Affordable items jump ahead, then file order | Canonical `equipmentItemLevel(recipe.itemLevel/base)` → slot/type → Thai/English name → ID |
| Craft filters | No recipe search in this view | Thai/English role/name/material search, category and craftable filters retain the same subsequence; Thai IME input is not replaced |
| Skill crafting | File/affordability order | Mechanical stage → role → weapon/playstyle → name; early healing/support; no new gates |

## Proposed route, using unchanged monster levels

Azure: coast 1–2 → meadow 2–3 / glade 3–4 → highlands 4–5 → forest 6–7 / headland 6–8 → frontier meadow 8–9.
Frontier: meadow 8–9 → glade 9–10 → forest 10–12 → wolf den 12–14 → coast 14–16 → wetland 16–18 → highlands 18–21 → ruins 21–24, Warden 25.

Low-risk groups remain near entrances; wolves, highland creatures and stalkers occupy distinct inner/deeper pockets. Crabs use existing shore-distance queries. Boss IDs, exact centres, arenas, levels and respawns are retained. Main contains no separate elite definition: Greyfang is a miniboss and Warden is the final boss; no elite content is invented.

The complete authored rectangles and Thai habitat names are in `data/encounters.json`. They do not create terrain, zones or unlocks. The atlas shows **initial spawn positions**, not wandering live positions, and respects discovery fog.

## Skill stages

| Stage | Existing craftable skills | Basis |
|---|---|---|
| Start simple | Whirl Blade, Healing Spring, Frost Nova, War Cry | Direct melee, healing circle, self-centred control, team buff |
| Situational role | Chain Spark, Hex, Spirit Wolf; Blink and Leap in movement tab | Neighbouring targets, debuff placement, autonomous temporary summon, choosing a destination |
| Timing/position plan | Stone Burst, Venom Mire | Actual 0.55-second delay; keeping enemies inside a persistent area |

Already-known starter skills (including Ward, basic attacks and starter movement) are not duplicated as new recipes. War Cry's old description claimed 25% while `damageBuff` is 0.18: the crafting description now derives 18% from the unchanged numeric effect. Other skill data and requirements are untouched.

## Separate proposals — NOT implemented

The audit covers 18 monster definitions, 46 species/zone entries including bosses, and all 113 recipes (82 equipment). Every recipe material has an actual monster source. **32 equipment recipes** use at least one material whose lowest monster level is above the equipment's wearable level. This is a review flag, not proof of a circular dependency.

Examples: Tusk/Hide starter equipment Lv.1 needs boar Lv.2; Hermit equipment Lv.6 needs hermit Lv.7; Greyfang equipment Lv.11 needs miniboss Lv.14; some highland gear Lv.16 needs Lv.18 sources; Gale Boots Lv.16 needs Duskmane Lv.20; Warden gear Lv.21 needs boss Lv.25. Consider whether each is an intentional boss/reward item or should have a contemporaneous alternative. Do not change prices, recipes, rates, stats or levels without a separate decision. The report includes every ingredient and its consumers/sources.

Adjacent bands still have inherited gaps: Azure glade→forest, Frontier glade→coast, meadow→wetland and forest→highlands. This draft insets threatening spawns and displays real ranges/warnings; it does **not** claim to eliminate those numeric gaps. Consider overlapping bands separately. Headland hermits also retain the inherited inland northern ridge assignment; a terrain/coastal-zone redesign is outside this patch.

Geometric access does not establish that every build can defeat the source at the equipment's nominal level. No combat win-rate or economy balancing has been performed.

## Preservation and implementation boundary

Existing monster/skill/item/recipe/progression/world JSON and all art are unchanged. No IDs, save versions, world layout revisions, discovery history, prices or wearable requirements are changed. Encounter layout is ephemeral and never enters saves.

`src/core/game-simulation.js` is a **byte-identical move** of main's Game file (blob `ffb6efb976b55795e204fe82e0419864a3ccae30`). `game.js` keeps the public Game API and overrides population placement only, with the old sampler as a fallback for maps without authored habitats. Combat, movement, drops and save routines remain verbatim. Placement uses a separate fixed, deterministic map seed so simulation and guide agree; newly spawned levels remain random within original ranges. This does not promise identical pre-patch RNG sequences.

## Reproduction

```sh
node --test tests/core/encounter-craft.test.js
node scripts/audit-encounter-craft.mjs tests/browser/out/encounter-audit
QUICK=1 node tests/browser/workspaces.mjs
BROWSER=webkit QUICK=1 node tests/browser/workspaces.mjs
```

The existing workspace suite calls `verifyEncounterCraft` before its previous tests, retains every old assertion and captures four viewports: 1440×960, 1180×820 touch, 844×390 touch, 390×844 touch. Captures and per-viewport reports use `*-encounter-*` under the already-uploaded workspace artifact paths. No workflow configuration changed.

## Evidence status at initial commit

10 targeted Node tests passed against the candidate helpers plus pure simulation/world declarations recovered from the exact-main CI build (artifact 11367791475, CI run 37362649227; ci-source.txt verified). Actual baseline and candidate population counts above come from that same headless harness. A directed 2 m flood with each edge checked by real `world.move` in at most 0.4 m steps reached all 395 candidate points from each map's existing player spawn. This is not a full source build or a combat test.

Local Chromium can render an offline page, but navigation to localhost fails with `ERR_BLOCKED_BY_ADMINISTRATOR`. Do not relabel that failure as an integrated browser pass. Source-build Chromium/WebKit and exact final screenshot review are pending at this initial commit. Keep the PR draft until those results and remaining visual limitations are attached; no physical iPad test has been performed.

## Godot port addendum

Keep the Game public interface described in GODOT-PORT.md. Translate `encounters.js` and load `encounters.json` alongside existing data, using the same mulberry32 placement seed and existing world geometry predicates. Feed simulation and atlas the same immutable placement list; persist none of its cache. Translate `craft-order.js` as presentation sorting only, using canonical item metadata; never reuse stage labels as unlock conditions. The unchanged simulation implementation now resides in `game-simulation.js`.
