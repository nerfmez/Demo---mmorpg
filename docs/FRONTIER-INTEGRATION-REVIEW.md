# PR102 integration review — 2026-10-08

Existing draft PR102 only. Original head `fdd0cce93df675de8da7be6205c3566af2867b90`, merged locally with main `5f210396786429c2743c8142c7d7309fd31719da` without rewriting history. This report belongs to the integration commit containing it. PR119 remains separate; no unmerged skill-tree code is included.

Before: 14 prototype skills / 19 mods were available only in an unsaved sandbox and Lab; PR102 targeted the already-merged equipment branch; the historical CI run failed at charged-shot icon consumers.

After: 33 normal workbench recipes use existing monster materials, including Moonroot hare/moth/mole parts, with early Azure options. Basic-only starters remain. There are 28 combat skills because main added `arcane_bolt` while PR102 waited; all IDs including `arcane_shot` are preserved. [Full acquisition and compatibility table](FRONTIER-ACQUISITION.md).

## Integration and safety

Resolved conflicts in AGENTS, combat FX data, port guide, character version/start, opening/session pause flow, animation dispatch, render state, movement workspace, skill art and quest migration test. Kept main's opening/completion system, v12 auto-potion migration, inactive equipment rules, Moonroot AI/rendering and CI structure. Character v13 introduces the separate movement socket while preserving v9 prototype and current v12 ownership, UID and loadout data. Job-tree data and consumables code are unchanged from main.

Traced data through crafting, core compilation/execution, socket/UI fit rules, inventory, input/HUD, renderer, Lab, saves and port notes using direct file reads and `rg`; no Jev request was needed. Fixed silent unsupported mod combinations with delivery filters, Arrow Rain Echo execution, overwritten Shield Bash knockback and guard-triggered Ward scaling. Updated omitted 15% tradeoffs in Returning Shot / Healing Chain descriptions; no numeric rebalance.

## Verification

- Full core: **464 passed**, including charged-shot release/cancel/resource timing, all new executors/mod mechanics, basic-only opening, inactive equipment, Moonroot and auto-potion regressions.
- Tools: **161 passed**. Locked dependency install required a writable npm cache; no dependency or CI redesign.
- Production build: passed (existing chunk-size advisory).
- Final catalogue/acquisition checks after description-only edits: **10 passed**. All 33 recipes have valid drop materials, atomic insufficient-resource rejection, exact payment and durable ownership.
- `frontier-content.mjs`: Chromium desktop 1440×900, touch 1180×820 and 844×390 passed all 14 Lab skills, real hold/release controls, weapon requirements and separate Short Stride socket. Final phone recapture repeated after the sandbox positioning correction. No page errors. Focused geometry samples stabilized at 40/40/40 (desktop), 35/35/35 (touch).
- `icon-consumers.mjs`: Chromium desktop, iPad-sized touch, landscape phone and portrait phone all passed; includes all HUD skill vectors, specifically charged_shot, plus crafting/library/loot consumers. Current main's vector-aware consumer test correctly accepts authored SVG fallback; no fake raster registration was added.
- `frontier-acquisition.mjs`: the same four viewport classes passed in ordinary `?fresh=1` mode, with only Slash initially, no sandbox and no mods. Seeded exact ingredients, then used actual workbench buttons for Charged Shot, Crystal Wall and Short Stride; verified cost deductions, item/skill storage and blocked repeat craft. Ingredient seeding is test-only. An initial test fixture used object rather than array workbench coordinates; corrected, then all four passed.
- `git diff --check`: passed. PR checks still need to run on the pushed commit; no merge or deployment authorized.

Local Chromium uses software rendering. WebKit is not installed here; CI owns WebKit and full smoke/affected UX. No physical iPad FPS or Safari claim.

## Visual review

Criteria: authored charged-shot icon visible in HUD, charge feedback readable, independent movement socket usable at short-phone height, crafting material counts/actions readable, no test picker over fullscreen/ammo controls, existing visual style retained.

Exact inspected files are in [review/frontier-integration](review/frontier-integration), with SHA-256 identities in [sha256.json](review/frontier-integration/sha256.json): desktop movement socket, final phone charge and movement, iPad Crystal Wall crafting, portrait Short Stride crafting, and Lab flame/wall/guardian stills. Runtime frames were sampled in Chromium; this is **not** a claim of continuous playback review.

Found/fixed: sandbox picker overlapped fullscreen, then the compact ammo card; final phone picker sits at bottom center and clears both. Desktop movement and phone socket show distance 3 m / 3 charges / unchanged 3 s recharge for Dash + Short Stride. Crystal Wall recipe visibly uses mirror_scale ×3 + rootdigger_claw ×2 + 35 gold. Portrait Short Stride shows fern_ear_tuft ×2 + boar_hide ×2 + 20 gold. Short landscape craft panels scroll; the title/result may be outside the viewport while tapping the craft button, whereas portrait exposes the full recipe controls.

Remaining limits: prototype flame is a flat stylized cone; crystal segments are simple facets; Guardian reuses crag_golem. These are interim visuals, not polished final VFX. Main's portrait fullscreen control remains near the workshop title (unchanged global layout). No VFX restyle or paid-reference asset use occurred. Owner normal-speed feel review remains pending. Status: draft integration ready for review within these limits, not merged or published.
