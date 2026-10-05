# Targeted garment coverage additions

Six additions build on the completed icon release 9ff7ff2. Existing 78 bases, recipes, stats and 122 registered raster images remain unchanged. New totals: 84 gear bases, 33 worn pieces, 111 item icons including 22 materials and 5 arrow types; 128 registered PNGs including 17 skills. No new weapons, starter filler, upgrade stones, grade variants, skill-tree changes or level-gated wear rules.

| ID | Name | Item level / slot / trained stat | Role and tradeoff |
|---|---|---|---|
| sporeweave_vest | Sporeweave Vest / เสื้อทอสปอร์ | 6 / armor / INT | Early-mid mana/healing torso; no HP or movement base bonus; lower defense than shell/pelt armor at 6 |
| sporeweave_gloves | Sporeweave Gloves / ถุงมือทอสปอร์ | 6 / gloves / INT | Magic, mana and healing; no cooldown base bonus, so Wisp Wraps retain their later tempo role |
| moonleaf_slippers | Moonleaf Slippers / รองเท้าผ้าใบจันทร์ | 11 / boots / INT | Mana/cooldown footwear; does not replace Wisp Slippers' 15% mana regeneration or AGI shoes' movement |
| wardenstalker_coat | Wardenstalker Coat / เสื้อพรานผู้พิทักษ์ | 21 / armor / VIT | Movement with defense/HP; lower defense than Crag Plate, lower HP than Ranger Coat at 11 |
| wardenstalker_hood | Wardenstalker Hood / ฮู้ดพรานผู้พิทักษ์ | 21 / helm / AGI | Crit/tempo; lower HP than Ranger Hood and no attack base bonus like Horned Helm |
| wardenstalker_gloves | Wardenstalker Gloves / ถุงมือพรานผู้พิทักษ์ | 21 / gloves / DEX | Attack/crit; sacrifices the large defense/HP of Crag Gauntlets |

These are mixed-slot, flexible-stat items, not locked class sets or set bonuses. INT can assemble vest/gloves at 6 with Spore Hood and existing Wisp Slippers, then select the new boots at 11. Rangers gain upper-tier torso/head/hands at 21 and may keep Gale Boots at 16. This intentionally avoids a new complete outfit at every five item levels. Item level is progression metadata; trained stats and current item power still determine wear.

## Existing balance and crafting contracts

Power follows progression.balance.gear and items.requirements.weights, using unchanged shares: armor .45, helm .2, gloves .1, boots .15. New stat shapes are scaled to that budget and rounded to one decimal. All six end within .1 weighted power of their target. Grade, affix and +N rules are untouched.

Recipe material counts use the existing scripts/gear-tiers.mjs schedule: level 6 has 6 main + 3 secondary + 10 first-tier parts and 60 gold; level 11 has 8 main + 4 secondary + 10 previous-tier + 20 first-tier and 150 gold; level 21 has 12 main + 5 secondary + 15 previous-tier + 30 first-tier + 2 ruin shards and 500 gold. Duplicate material entries are summed. Existing drop-candidate selection automatically includes them through recipe ingredients; no drop rates or monster content change.

## Shared illustrated / future modular garment designs

- Sporeweave vest: ivory hip-length split tunic, small open standing collar, short sleeves, ochre spotted shoulder panels and brown belt. Reuses current `tunic` model template until separately authored models exist. The spot scale and ochre/cream palette derive from Spore Hood.
- Sporeweave gloves: fully covered ivory cloth fingers, compact ochre spotted cuffs, short brown wrist ties. Reuses `wrap`; no dangling ribbons or human skin in icon.
- Moonleaf Slippers: low sage cloth shoes with ivory folded ankle cuffs, thin brown soles, small silver leaf clasps; no wings or heavy plates. Uses normal existing boot rendering, not a new model.
- Wardenstalker coat: forest-green fitted coat, compact brown shoulder panels, small grey fur collar, split thigh hem, ivory horn toggles. Reuses `pelt` model template. Keep collar low beneath the separate hood capelet; no claim that current model matches illustrated detail.
- Wardenstalker hood: reinforced green cloth crown, compact grey fur edge, short brown capelet, one ivory throat toggle. Reuses `hood`. Capelet should end above the arm joint in future 3D.
- Wardenstalker gloves: fitted brown leather, grey fur cuffs, green wrist straps, small ivory knuckle plates with flexible gaps. Reuses `pelt`. Wrist cuffs should overlap sleeves without doubling bulk.

Weapons remain unconstrained by garment-family templates. Existing approved art remains canonical and untouched.

## Review and validation

Six 512x512 RGBA PNGs exported from the retained OpenAI-generated 1254px sheet using connected alpha-component extraction and proportional sizing with transparent margins. Unique hashes and provenance are in icon-assets-manifest.json. Some native crops are smaller than 512px; exported resolution is not claimed as individually generated native 512 masters.

Inspected six exports at 144/40px on dark background and actual runtime markup at 128/48/32px on light background. Reviewed new vest/boots/coat crafting screenshots and tablet glove inventory. Complete silhouettes, distinct material families, no skin/bodies, no text baked into icons. Existing UI labels may truncate at small inventory size; no layout redesign.

31 targeted tests passed (data, recipes, gear tiers/drop candidates, new-item craft/payment/stat-equip checks, metadata, presentation and raster coverage). Production build and diff whitespace check passed. Focused Chromium rendered all six recipe icons without page errors or image HTTP failures. Physical iPad/WebKit not tested for this local addition. No new 3D meshes created. Native artifact upload is left to parent with direct authorization; no known-failing Library/Drive route retried.

This addition is held separately from PR62's completed 46-icon release. No release of these six items is implied.
