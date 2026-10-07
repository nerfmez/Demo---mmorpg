# Six-monster identity preparation

**Owner review candidate — no runtime changes, merge or deployment.**

Main inspected: `0e2d9fd58b7e6e10b6226158130e642d366c301a`. PR106 inspected: `867147209c520c05c8f32b7b5dfb5710ec1a899d` ([PR106](https://github.com/nerfmez/Demo---mmorpg/pull/106)).

The six exact concept sheets were inspected as pixels, including their drop drawings. English identities come from sheet titles and PR106 provenance; Thai translations below are proposed except existing Greyfang. No additional conversation design files were provided to this task.

## Monster old → new mapping

| Stable ID | Current stored name / Thai | Reference name / Thai proposal | Exact source |
|---|---|---|---|
| `salt_slime` | สไลม์น้ำเค็ม / สไลม์น้ำเค็ม | Tidal Slime / สไลม์คลื่นทะเล | [salt_slime_concept_v2.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/salt_slime_concept_v2.jpg) |
| `tusk_boar` | Tusk Boar / หมูป่างาแหลม | Boarbull / หมูกระทิง | [tusk_boar_concept_v2.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/tusk_boar_concept_v2.jpg) |
| `thornback_wolf` | Thornback Wolf / หมาป่าหลังหนาม | Maskfang Wolf / หมาป่าหน้ากาก | [thornback_wolf_concept_v2.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/thornback_wolf_concept_v2.jpg) |
| `greyfang` | Greyfang / เกรย์แฟง จ่าฝูง | Greyfang Alpha / เกรย์แฟง จ่าฝูง | [greyfang_concept_v2.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/greyfang_concept_v2.jpg) |
| `reed_viper` | Reed Viper / งูกกพิษ | Reedblade Viper / งูใบกกพิษ | [reed_viper_concept_v4.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/reed_viper_concept_v4.jpg) |
| `marsh_wisp` | Marsh Wisp / ภูตไฟหนองน้ำ | Lostlight Wisp / ภูตแสงหลงทาง | [marsh_wisp_concept_v2.jpg](https://github.com/nerfmez/Demo---mmorpg/blob/867147209c520c05c8f32b7b5dfb5710ec1a899d/assets/meshy/monsters/marsh_wisp_concept_v2.jpg) |

## Material old → new mapping

| Stable ID | Current English / Thai | Proposed English / Thai | Art decision | Source Library file ID |
|---|---|---|---|---|
| `salt_gel` | เจลเกลือทะเล / เจลเกลือทะเล | เจลเกลือทะเล / เจลเกลือทะเล | reuse approved bytes | `libfile_3ee18fe414f08191aa7740dc41c72235` |
| `glow_dust` | Glow Dust / ผงเรืองแสง | Glow Dust / ผงเรืองแสง | reuse approved bytes | `libfile_6abc9dba91788191935776b83c59c949` |
| `boar_hide` | Boar Hide / หนังหมูป่า | Boarbull Hide / หนังหมูกระทิง | reuse approved bytes | `libfile_5fc5839050408191b052275dbd6c7bd7` |
| `boar_tusk` | Boar Tusk / เขี้ยวหมูป่า | Boarbull Horn / เขาหมูกระทิง | reuse approved bytes | `libfile_79ce7954691c8191a24b9dc5d140b052` |
| `wolf_pelt` | Thorn Pelt / หนังหมาป่าหนาม | Maskfang Pelt / หนังหมาป่าหน้ากาก | reuse approved bytes | `libfile_cb058d24b6e08191be237709eb0d9570` |
| `wolf_fang` | Wolf Fang / เขี้ยวหมาป่า | Wolf Fang / เขี้ยวหมาป่า | reuse approved bytes | `libfile_e7f9b0a6888c8191bab4b409bf8702ff` |
| `greyfang_mane` | Greyfang Mane / แผงคอเกรย์แฟง | Greyfang Mane / แผงคอเกรย์แฟง | reuse approved bytes | `libfile_b10a6d119ab08191a67e6862a2424685` |
| `viper_scale` | Reed Viper Scale / เกล็ดงูกก | Reedblade Scale / เกล็ดใบกก | candidate | `libfile_b3694b07ba9c8191916c482828795bcb` |
| `venom_gland` | Venom Gland / ต่อมพิษ | Venom Gland / ต่อมพิษ | reuse approved bytes | `libfile_2bf419ffecfc8191b6dde99c620ff864` |
| `wisp_core` | Wisp Core / แกนภูตไฟ | Lostlight Core / แกนภูตแสงหลงทาง | candidate | `libfile_d47a73f6b88c8191b030bb1d85e89bc5` |

Only the two missing matching material designs receive new candidate art. Eight approved icons are reused byte-for-byte. This does not add the extra salt crystal or separate tusk shown on the concepts as loot.

Shared items retain their generic names: venom_gland also comes from moss_beetle; glow_dust also comes from sporecap and salt_slime; wolf_fang/wolf_pelt are shared by both wolves. See mapping.json for exact source/archive IDs, SHA256 hashes and unchanged drop odds/amounts.

## Recipe and quest references

106 recipes use these materials. Their ingredient labels resolve through data/items.json; preserve every cost, recipe ID, result and optionPool. Exact IDs and costs are in mapping.json.

Literal text edits: h_slimes, m_boars and s_wolves (descTh, objectiveTextTh and objectives[].labelTh); m_boars also says horns instead of tusks. m_greyfang already says Greyfang and remains valid; no count/reward changes. h_crabs and archived m_craft reuse renamed/reviewed material labels dynamically.

data/items.json gradeUpgrade B/A costs use wisp_core and glow_dust; keep exact costs. gearBases upgradeMaterial fields remain stable legacy metadata. Enhancement uses enhancement_stone; no rebalance.

proposed-labels.json records each exact JSON pointer and before → proposed value. Eight dependent gear label options are included separately for owner review; no PR104 weapon art or models are changed.

## UI / source references to synchronize after approval

- data/monsters.json name/nameTh: Atlas entries, encounter pin titles, inventory source text, boss bar, target display and quest navigation use these definitions.
- data/items.json materials name/nameTh: inventory, ingredient seeker, all recipe ingredient/reward text, grade promotion costs, salvage output and loot toasts use central labels.
- public/assets/icons/monster/<id>.png + MONSTER_PORTRAITS in src/ui/raster-icons.js: 50px field-guide/Atlas portraits.
- src/ui/atlas.js boss markers and src/ui/inventory.js material-source portraits call art('monster',id). They still resolve old SVGs. Introduce a scoped registry for these six approved images in art()/RASTER_ICONS; retain other SVGs. A portrait-only PNG replacement would miss these consumers.
- src/ui/quest-journal.js receives the same art resolver; verify kill quest pictures at 44/54px as part of eventual integration.
- public/assets/icons/material/{viper_scale,wisp_core}.png and RASTER_ICONS: existing registry paths already cover bag, crafting and src/render/dropart.js ground-loot textures. No new drop geometry or rules.
- assets/atlas-journal/manifest.json, assets/atlas-monsters/manifest.json and scripts/split-atlas-journal.py: use a six-ID override batch so rebuilding old sheets cannot overwrite approved replacements; retain historical sheets/cells. Update source identity and output hashes only for these six.
- docs/icon-assets-manifest.json: preserve old provenance, append candidate source/edit/export lineage and final hashes for the two material replacements.

## Preservation / pending work

Stable monster/material/recipe/quest/gear IDs, save v7, drop odds/amounts, counts/rewards, recipes, stats, item values and balance remain untouched. Candidate names/art are confined to this review folder. PR106, PR102/103/104 and other proposals are not modified.

No paid Meshy call. No new zone/mole/accessory/beetle work. No live-site/art acceptance or hardware iPad claim. Final integration requires owner art/name review, then focused UI/browser checks against the merged model revision.
