# Wearable character-level gate — draft review

Base: `852c22f1e6e209ad35c09d90308cd6e48e3c0c7a` (includes Claude PR64/66/69 and PR67/68).
Separate branch: `codex/wearable-character-level`. Parent/owner review required before merge/deploy.

## Policy and preservation

Only `armor`, `helm`, `gloves`, `boots`, `charm` use character level. Required level is the
existing positive integer instance `itemLevel`, otherwise the existing base-level fallback
(then 1). All catalog bases/recipes are valid and match; no zero/missing/custom catalog
levels were found. Tiers remain 1/6/11/16/21; Tide Walkers remains Lv1. A valid custom save
level is retained, not guessed or clamped (synthetic Lv31 migration case tests the Lv30 cap).
The 38 weapon bases and 5 offhand shields retain trained-stat and dual-wield rules.
No item stats, costs, grade/affix pools, skill/mod gates or data JSON changed.

Craft/upgrade/promotion still require resources only. Wearable grade, +N and affixes do
not raise required level. Only `ch.level` counts. `gearEquipState` governs equip, derived
stats and appearance; upgrade UI uses the same helper. Existing legal equipment stays.
Migration runs enforcement after level-cap adjustment and clears only equipped references;
all items already exist in `ch.gear` (unbounded, paginated in UI). No slot-capacity insertion,
deletion or new UID is involved. Repeated save/load and >300-item inventory tested.
The modern bag now displays the existing migration notice, including all returned names.

## Review criteria and actual views

Keep the current UI/art; show required and current Lv in recipe, crafted result, bag and
details; allow underlevel crafting, disable equip until the threshold, preserve readable
buttons. Preview +N/grade must keep the level and never falsely say a legal item will be removed.
Views: real rendered game, desktop 1440×900, iPad 1180×820, phone craft 390×844 and equipment
844×390. The existing equipment screen intentionally requests landscape on portrait phones.
The existing `freezeScene` helper freezes only the rendered background while Game/Panels/input
remain live. Inspect exact final screenshots independently of assertions.

Faults fixed: upgrade preview previously read level as a trained stat; migration notice was
not visible in the newer bag; keep required/current level in the existing shelf status row
so short screens retain their buttons. Initial browser navigation waited for full load and
timed out; use the project's DOM-ready/game-ready path. Phone bag verification rotates as
requested by the existing UI rather than interacting behind its orientation screen.

Validation: production build passed (existing bundle-size warning); 76 focused core tests
passed covering all wearable thresholds, weapon/shield regression, crafting/grades/upgrades,
legacy save ownership/cap migration/respec, skills/mods and UI contracts. Full Chromium/WebKit
premerge checks belong to CI; no physical iPad performance claim. No Jev retrieval needed:
direct reads traced every changed requirement consumer, inventory/upgrade UI, migrations,
derived stats/look and port contract. No unresolved source discovery.

## Exact affected base IDs

| Slot | Count | Base IDs |
|---|---:|---|
| armor | 9 | `travel_tunic`, `hide_vest`, `shell_guard`, `wolfpelt_coat`, `storm_mantle`, `crag_plate`, `ranger_coat`, `sporeweave_vest`, `wardenstalker_coat` |
| helm | 8 | `leather_cap`, `beetle_helm`, `spore_hood`, `feather_circlet`, `horned_helm`, `crabshell_helm`, `ranger_hood`, `wardenstalker_hood` |
| gloves | 8 | `hide_gloves`, `shell_mitts`, `wolf_grips`, `wisp_wraps`, `crag_gauntlets`, `brigand_gloves`, `sporeweave_gloves`, `wardenstalker_gloves` |
| boots | 8 | `travel_boots`, `wolf_boots`, `wisp_slippers`, `crag_greaves`, `tide_boots`, `trail_boots`, `gale_boots`, `moonleaf_slippers` |
| charm | 8 | `tusk_charm`, `wisp_pendant`, `spore_amulet`, `feather_charm`, `golem_amulet`, `ancient_ring`, `pearl_pendant`, `fang_talisman` |

## Final artifact record

Final real-game Chromium flows pass desktop/iPad/phone with zero page errors. Inspected
Tide Walkers craft, Lv6 craft at character Lv1, below-level bag, exact-level equip and
fixed-level upgrade details. Return-notice display uses a UI fixture; actual migration
item preservation is tested in core. Ready for draft review; CI/WebKit pending.

Private review images are delivered separately in the owner conversation; no sharing expansion.

Artifact SHA256 (under `tests/browser/out/wearable-level-chromium/`):

- `ipad-tide-walkers.png`: `98a99682768f96cd03ca4dc7435b00adcf981fa5539d6d2c46c5da2d7a42d258`
- `ipad-underlevel-craft.png`: `517bfbed35af988e2b33183dad9e66022fefe78583939a49119e3fbe5e4d81e6`
- `phone-underlevel-bag.png`: `0860c9482d0fd20cdbf8470310a72004b3c12077e1f3aa378b85fb67cdf8558a`
- `phone-fixed-level-upgrades.png`: `313535b00ec87c3634f475934b849e7585c822b9ec7966c099c628bea8eb10b1`
- `report.json`: `c4f0042acc696ae40d5fc6bb2fe9d39ad3d20a4f167141c8c2d52a11987acea0`

Reviewed runtime source SHA256:

- `src/core/character.js`: `873c3df950ec385c9ce6848b8be3d4b3b8aaa0b6762474d624ce39da69111294`
- `src/core/item-metadata.js`: `3ac795453d1214e627c6387a5e9140782822b270f875092c70891df41f36c995`
- `src/ui/craftview.js`: `1c699a00d146cff9afb05bb3c7a8bce54e233560c9c1bc4961e009adee445f2b`
- `src/ui/inventory.js`: `86b66b8baf33729918e5184b4b6ea2ab620029d7656121497b683218dd792d8e`
- `src/ui/loadout-workspace.js`: `29b1e5fbc77fdc93a0157330e4c012d18d5e4a3bb296eaf61e12e623f1c13dde`
- `src/ui/loadout-workspace.css`: `c7f01dedc905bd8523bb12dafe5fcc127ddc71194de69b2cf18c7d718db87d54`
- `src/ui/progressionview.js`: `7bb10267bcca531995b6762ea9f5ff99daa6277bc88570bdf722deb59edf4689`

## CI fixture correction

Initial PR70 CI run 37283017304 failed in `gear-hands.mjs` on both Chromium and WebKit:
`crag_gauntlets level`. That model/hand fixture set trained stats to 60 but left the
character at Lv1 while equipping authored Lv21 gloves. The level refusal is correct.
The fixture now advances to the highest authored level of its requested equipment,
and first verifies Lv1/high-stat glove equip refusal is atomic. All original hand,
shield, arrow, seven-slot, phone-layout and pickup assertions remain intact.
No production code, gates or test assertions were relaxed.

Local full Chromium gear-hands completed the gameplay assertions through pickup, then
failed its strict empty-console assertion on `/favicon.ico` 404. An independent page-load
probe confirmed that same missing icon occurs before dressing. This unrelated local
baseline is not changed; CI must still pass the original error check. WebKit is not
installed locally. New-head Chromium/WebKit CI results are the premerge gate.
