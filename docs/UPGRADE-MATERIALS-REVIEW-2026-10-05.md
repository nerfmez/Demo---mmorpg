# SUPERSEDED ECONOMY — historical first review

The user rejected the abundance in this first prototype. Current rates, salvage rules
and validation are in [UPGRADE-MATERIALS-RARE-REVIEW-2026-10-05.md](UPGRADE-MATERIALS-RARE-REVIEW-2026-10-05.md).
The 20%/15% and base-salvage bonus described below are no longer active.

# Dedicated upgrade materials — local review

Base: `1f575c49291bdc24820374e33a1fdc472ef18cac` (fetched origin/main).
Branch: `codex/upgrade-materials`. No push, PR, merge or deployment requested/performed.

## Rules and economy

- `enhancement_stone` / หินเสริมอุปกรณ์: +1..+5 costs 1/2/3/4/6; unchanged gold 35/75/140/240/380.
- `skill_crystal` / ผลึกทักษะ: skill Lv2..5 costs 1/2/3/4; unchanged gold 35/90/180/320. Mod Lv2..3 costs 2/3; unchanged gold 40/80.
- Shared monster drop table adds one stone at 20% and one crystal at 15%, independent rolls, existing material-find bonus applies. Original monster and zone drops retained. Existing minion gold-only filter remains.
- Non-starter gear salvage adds one of each material alongside the existing recipe-part return. Upgraded gear returns floor(50% of each enhancement step) in stones, as before rounding per step; +5 refunds 7 stones, plus the non-starter bonus if eligible. Starter equipment gives no base stone/crystal bonus. Equipped and locked items remain protected.
- Equipment grade promotion ALREADY EXISTS on this base. It stays unchanged and separate. No new grade system, tiers, recipes, bosses or skill-tree/VFX changes.

The actual base rates used: salt slime glow dust 20% ×1, sporecap dust 15% ×1,
highlands ruin shard 12% ×1, boar tusk 45% ×1, normal equipment 1.73% total.
The first slash upgrade previously needed 3 tusks (6.67 expected boars); one crystal
at 15% also averages 6.67 kills. The final skill rank previously needed 12 tusks
(26.67 boars) plus ruin shards; four crystals average 26.67 kills, with no competing
part/catalyst cost. Enhancement steps average 5/10/15/20/30 kills from direct drops;
skill ranks 6.67/13.33/20/26.67; mod ranks 13.33/20. These are expectations,
not guarantees, before salvage/find bonuses. The modest salvage bonus is supplemental
at the existing low normal gear drop rate. Both new materials sell for 4G, matching
existing glow dust; the farming-income model now includes these shared drops.
No claim of a measured play-session economy: extended player balancing is future work.

## Compatibility and integration

Sparse `character.materials` already supports new IDs; absent keys count as zero.
No save-shape/version change, conversion, deletion or retrospective charge. Existing
parts, gold, grades, affixes, +N and skill/mod levels survive save/load. Old +N gear
uses the new current-cost salvage refund; no historical payment ledger is added.
Per-base `upgradeMaterial` is retained solely for the existing base-part salvage
fallback, allowing concurrent gear additions to keep their current metadata.

`data/recipes.json` and `gearBases` are untouched. Parent must reconcile additive
changes to `data/items.json`, raster registry, ART catalogue and asset manifest with
icon PR62 and gear-gap branch `19cda11e97ba2a6706ad33478d728c2140ed7147`.
Do not replace those whole files. Known new gear keys are distinct from both material IDs.
The raster test uses registry/manifest lengths instead of a fixed 76/78 count to
avoid unrelated future asset additions breaking the count assertion.

Impact traced directly through crafting, character migration, save slots, Game.kill,
material-find and farming income, inventory/loadout/growth/cost rendering, atlas,
ART/raster mapping, dropSprite and Godot port notes. No unresolved source discovery;
Jev not needed or invoked. No external source claims or paid tools used.

## Technical evidence

80 targeted Node tests passed across upgrade-materials, crafting, data, gear-hands,
item-metadata, progress, save, presentation, raster-icons and balance-model.
After a count-only raster-test edit, its four tests passed again.
`npm run build` passed (existing large-chunk warning remains).
`git diff --check` passed.

`node tests/browser/upgrade-materials.mjs` passed on Chromium desktop 1440×900 and
1180×820 with touch input. Real Game/Panels, actual PNG bytes and clicks/taps verify
costs, material deductions, source/use text, and disabled insufficient-resource action.
Zero browser page errors. Final screenshots/report under
`tests/browser/out/upgrade-materials/` (also included in the delivery archive).

## Visual review

References inspected: actual `material/ruin_shard.png` and `material/crag_stone.png`.
Two originals generated through the built-in OpenAI imagegen; final exports use
ImageMagick Lanczos resize only. No paid provider. 512×512 RGBA, alpha 0..255 with
transparent and antialiased edge pixels, no frame/background. No recoloured tiers.

Final reviewed hashes:
- enhancement_stone.png: `d9a66c7035c265ecabd90c44679bfa82d63da9c516399c5d833d89ba1c004bce`
- skill_crystal.png: `fa2363718a47ef8e941f5b4eff64337b776059d6e4f1928a1f838e5de78de311`

Observed final files at native 512, inventory scale, source detail, equipment cost,
skill cost and mod cost. Stone has a squat dark faceted outline and gold chevron;
crystal has an elongated turquoise silhouette and pale internal diamond. Both remain
distinguishable at small cost-chip scale; edge treatment and cel facets match references.
Initial equipment cost text inherited pale dark-theme green on parchment; fixed only
parchment cost-chip success/failure colors and inspected the final screenshot again.
Inventory truncates the long stone name inside narrow cells as designed; the selected
shelf/detail shows the complete name. Initial captures hid costs below scroll fold;
final cost views scroll to the actual costs/actions. No major new visible defects found.

Limits: UI harness omits the 3D avatar/world renderer; empty portrait pedestal is a
harness limitation, not a claimed game regression. Ground-loot mapping traced but
no ground sprite screenshot. Chromium touch emulation is not physical iPad/Safari
validation. WebKit/full smoke remain premerge work after reconciliation. Static icons;
no animation review needed. Ready for local owner review within these limits.

## Follow-up affected safety check

Nine tests in `upgrade-materials.test.js` passed, including two additional focused
checks across every starter base and every gear recipe/grade. Starter +0 returns
no stones/crystals; every starter +N stone refund is strictly below the stones paid;
there is no repeatable starter crafting recipe. Every non-starter craft/salvage
cycle consumes gold and at least one base material, so the one-of-each salvage
bonus is a paid conversion, not a free loop. A migrated legacy A/+5 item returns
8 stones (1 base + 7 enhancement) and 1 crystal, adds recipe refunds without
subtracting any old inventory parts, and cannot be salvaged twice. Existing
locked/equipped and bulk-salvage protections remain covered. No production change
was needed after this follow-up. Prior 80-test/build/browser evidence still applies.

The two-icon contact sheet is `two-icon-contact-sheet.png` in the delivery supplement.
Reviewed at 1200×700: exact final 512px icons side by side on navy, complete silhouettes,
transparent-edge compositing, unobscured readable English names and IDs. No icon
pixels were edited. The original approved raster allowlist remains explicit; unknown
future content still retains its existing SVG fallback. Parent should preserve PR62's
approved-list/fallback semantics when reconciling the two additive material entries.
