# New item PNG integration review

Base: `380e3b077d422e968e0d8558e0cbdf255f9a8211` (latest main when integrated).
The runtime source and screenshot SHA-256 values are retained in `verification.json`.

The provided `new-item-art-20261007.zip` was fetched through the user-authorized Drive route and verified as `ce8cccd0f44e4888e143129d347d660e572cb8f99ec83281bcd9a5cefe09a5fe`. Only its eleven `final/material/` and `final/consumable/` 512×512 RGBA files were copied into public assets. Each final file matches its handoff hash in `docs/icon-assets-manifest.json`. All 84 existing gear and five arrow PNGs match main byte for byte. The original material and potion SVGs remain fallback artwork for unregistered content.

## Observable criteria and visual review

References: the supplied final images and handoff contact sheet, including its light/dark 40px examples. Criteria: distinct material silhouettes; red HP versus blue MP; increasing small/medium/large bottle size on the original shared baseline; transparent edges without a visible rectangular matte; complete tips and curls; readable counts; icons contained by their existing controls.

Manual final screenshot inspection: 2026-10-07 05:24:20 UTC.

The final Chromium captures cover the real game at touch viewports 1180×820 (iPad layout) and 844×390 (landscape phone). Inspect `ipad-bag.png`, `ipad-craft.png`, `ipad-shop.png`, `ipad-shop-mana.png`, `ipad-quickslots.png` and the matching five `phone-landscape-*.png` files. Craft ingredients and shop cards were scrolled into view where needed. The existing `freezeScene` helper retains a finished scenery frame while the actual UI, touch actions and game rules remain active. This is a static icon review, not animation or hardware performance measurement.

The five new materials remain distinguishable in the bag and recipe costs. HP and MP remain distinguishable at the HUD's smaller scale, and the three bottle sizes preserve their supplied proportions. Transparent margins keep the mantis tip, horn curl and crystal points inside their slots. No major clipping or matte-edge defect was observed in the inspected final views. The first capture showed some existing images before decode; final captures wait for visible images to decode. Final captures also expose the ingredients and mana cards below the phone's initial scroll fold.

## Technical verification

- `node --test tests/core/raster-icons.test.js tests/core/consumables.test.js`: 13 passing tests; the enhanced raster assertions were rerun with all six passing.
- `node --test tests/core/presentation.test.js`: four passing tests.
- `npm run build`: passed (existing large-chunk warning).
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/new-item-icons.mjs`: passed at both sizes. All five materials decode in the actual bag and craft views; all six potions decode in the shop, assign through touch controls, and consume exactly one potion through the HUD with restoration and cooldown.
- Actual PNG alpha decoding verifies clear margins, partial-alpha edge pixels, original 512px dimensions, bottle size progression and the common lower baseline. Asset hashes match the handoff.
- HUD PNG canvases fit inside their quick buttons; no overlaps with combat controls, quest widget or interaction prompt, no horizontal overflow, no page errors and no failed icon responses.
- JavaScript syntax and `git diff --check`: passed.

Potions are displayed in the shop/slot selector and HUD in the current game; the bag contains materials and equipment, and potion crafting is not part of this UI. Existing callsites in `panels.js` and `input.js` share `potionArt(def)`, so they did not need edits. The live bag calls the shared material resolver through `loadout-workspace.js`; recipe costs and ground loot use the same registry.

Status: ready for owner review in a draft PR. WebKit is not installed in this executor; physical iPad/Safari review and required CI/premerge checks remain outstanding. No gameplay, item IDs, quantities, prices, save fields, Panels, workflow, merge or deployment changes are included. Source discovery used direct file reads and callsite searches; no unresolved dependency required Jev ranking.
