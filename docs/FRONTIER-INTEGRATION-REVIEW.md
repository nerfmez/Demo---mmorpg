# PR102 integration review — 2026-10-08

Existing draft PR102 only. Original head `fdd0cce93df675de8da7be6205c3566af2867b90`, merged locally with main `5f210396786429c2743c8142c7d7309fd31719da` without rewriting history. This report belongs to the integration commit containing it. PR119 was subsequently merged as `63d734df69458255f896b26d03a104a38d116da9` and integrated cleanly at `0e8d05265910b389dc9b27f58a4e5ce902cba72e`; no unmerged skill-tree code is included.

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
- `git diff --check`: passed. Initial integration checks were submitted; the owner subsequently authorized merge/publication as recorded below.

Local Chromium uses software rendering. WebKit is not installed here; CI owns WebKit and full smoke/affected UX. No physical iPad FPS or Safari claim.

## Visual review

Criteria: authored charged-shot icon visible in HUD, charge feedback readable, independent movement socket usable at short-phone height, crafting material counts/actions readable, no test picker over fullscreen/ammo controls, existing visual style retained.

Exact inspected files are in [review/frontier-integration](review/frontier-integration), with SHA-256 identities in [sha256.json](review/frontier-integration/sha256.json): desktop movement socket, final phone charge and movement, iPad Crystal Wall crafting, portrait Short Stride crafting, and Lab flame/wall/guardian stills. Runtime frames were sampled in Chromium; this is **not** a claim of continuous playback review.

Found/fixed: sandbox picker overlapped fullscreen, then the compact ammo card; final phone picker sits at bottom center and clears both. Desktop movement and phone socket show distance 3 m / 3 charges / unchanged 3 s recharge for Dash + Short Stride. Crystal Wall recipe visibly uses mirror_scale ×3 + rootdigger_claw ×2 + 35 gold. Portrait Short Stride shows fern_ear_tuft ×2 + boar_hide ×2 + 20 gold. Short landscape craft panels scroll; the title/result may be outside the viewport while tapping the craft button, whereas portrait exposes the full recipe controls.

Remaining limits: prototype flame is a flat stylized cone; crystal segments are simple facets; Guardian reuses crag_golem. These are interim visuals, not polished final VFX. Main's portrait fullscreen control remains near the workshop title (unchanged global layout). No VFX restyle or paid-reference asset use occurred. Owner normal-speed feel review remains pending. These limits were disclosed and subsequently accepted for this release; publication status is tracked in PR102.

## Authorized release preparation after PR119

The owner approved merge/publication with the disclosed interim VFX. Release order remains PR119 publication/live checks first, then PR102. PR119 retains character v12 and treeRevision 3; PR102 adds character v13 without changing its selective refund or independent groups. New combined regression covers old v9/v12/v13 characters, absent/present movement sockets, duplicate retired IDs, retained learned nodes, exact-once refunds and repeated reload.

A new focused `frontier-published.mjs` check creates an isolated normal bow character, crafts Charged Shot/Roll/Short Stride/Returning Shot through real menus, checks atomic payment and insufficient resources, equips through normal confirmation/socket controls, reloads, and verifies charged release consumes 8 MP + one arrow once. It then reloads a test-only legacy treeRevision 2 save twice to verify the selective refund and mod UIDs together. No owner profile/save is accessed or reset.

Local Chromium cannot navigate the live origin because its trust store rejects this environment's proxy CA (`ERR_CERT_AUTHORITY_INVALID`); curl and the Playwright request client both validate TLS successfully. No certificate check was disabled. The focused live test is appended to the **existing** Safari publication job, with its report included in the existing live artifact; no new hosting service or CI architecture. Local dry runs use an explicitly marked test-only receipt and are not publication evidence.

Combined validation after merged PR119: **471 core tests, 161 tools tests, production build and the isolated Chromium normal-game release rehearsal passed**. The rehearsal verified crafting, insufficient resources, exact payment, normal loadout confirmations, charged HUD SVG, one-release payment, preserved movement UIDs and selective refunds across two reloads. `combined-report.json` explicitly records a local test receipt, not a live publication. Inspected `combined-ipad-reloaded.png`: charged HUD, roll socket, potion settings and touch controls remain readable without overlapping the workbench action. PR119 publication run 37775002540 and both existing live Safari checks succeeded before PR102 publication.
