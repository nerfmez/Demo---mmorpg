# Completed weapon model integration — draft review

Base: `7689351388703366d414f7025fcf83fce5fb4d4a` (main, includes PR73 grip/carry/swing presentation).

19 original GLBs are copied byte-for-byte from authorized private source ZIPs. Only GLBs and sanitized provenance enter runtime/repository; editable Blender sources and private source links stay outside it. The source inventory and all authoring manifests were read locally. Delivery locks and the user's later approval/version instructions supersede historical creation statuses. No geometry was rebuilt, simplified, recentered or rescaled.

## Exact in list

| Item ID | Source revision | Triangles | GLB bytes |
| --- | --- | ---: | ---: |
| `rusty_sword` | remake R1 | 5,052 | 1,335,312 |
| `fang_bow` | pair7 R1 | 20,996 | 1,798,328 |
| `frontier_kris` | pair8 R1 | 9,646 | 2,122,152 |
| `fang_dagger` | blade_detail_r4 | 23,610 | 1,533,856 |
| `hermit_cleaver` | pair6_r1 | 12,904 | 2,244,960 |
| `spore_staff` | pair7 R1 | 26,164 | 2,451,460 |
| `tide_staff` | remake R1 | 17,740 | 2,340,576 |
| `tusk_greatblade` | blade_detail_r4 | 27,206 | 1,982,672 |
| `venom_wand` | pair6_r1 | 16,008 | 1,709,180 |
| `old_bow` | batch2_r1 | 9,820 | 2,231,076 |
| `spore_wand` | batch2_r1 | 33,168 | 2,637,216 |
| `tusk_blade` | batch2_r1 | 7,376 | 1,961,488 |
| `apprentice_staff` | batch2_r1 | 6,156 | 2,131,268 |
| `hunter_bow` | batch3_r1 | 9,784 | 2,167,628 |
| `tusk_club` | batch3_r1 | 22,224 | 2,856,900 |
| `shell_knife` | R4 | 15,318 | 1,195,576 |
| `beetle_maul` | R2 | 16,332 | 547,672 |
| `skyrender_bow` | R2 | 12,238 | 537,032 |
| `wolfbite_sword` | blade_detail_r4 | 34,544 | 1,714,200 |

All 19 have one exported material. Aggregate source payload: 35,498,552 bytes / 326,286 triangles; 35 embedded images (color plus PBR roughness where supplied). The game samples color/alpha/emissive/normal maps with its existing toon ramp. PBR roughness/metallic maps are released after preparation because toon shading does not sample them. Individual geometry, authoring units, origins and GLB node transforms are retained. Outlines are 3 mm for these detailed originals; transparent/cutout surfaces omit opaque hulls. Outline rendering adds another triangle pass for opaque weapons. This is a presentation conversion to the existing game style, not a claim that Blender materials render identically.

## Exact out list

`wisp_staff`, `crag_axe`, `storm_bow`, `greyfang_sabre`, `horn_greatblade`, `ancient_staff`, `moonleaf_wand`, `ranger_axe`, `knight_greatsword`, `tidecaller_staff`, `dusk_longbow`, `stormglass_blade`, `wisp_stiletto`, `lantern_wand`, `thunder_maul`, `galebreaker`, `oathblade`, `ruin_fang`, `relic_wand`.

These retain procedural fallback. Greyfang is pending review and is not marked complete. Tide R3 is deliberately excluded in favor of remake R1. No rejected R2/R3 substitutes are included for the approved latest overrides. Beetle Maul R2 and Skyrender Bow R2 are the preserved versions explicitly included in the authorized first-four package.

## Preservation and loading

Hero/rig, carry/IK/actions, one/two-hand rules, offhand/dual wield, bow/ammo/skills, stats, save schema, wardrobe and monsters are unchanged. Geometry/textures are cached for the page. Rig toon materials retain the existing per-rig flash uniform and are disposed by `disposeObject` when replacing equipment; shared geometry/textures survive. Repeated/concurrent registry loads are deduplicated. Failed/missing models keep the existing procedural fallback.

The existing boot preload policy remains: all registry weapons load once per page, so this batch adds a 35.50 MB uncompressed weapon payload at boot. This is a material increase from the old starter sword and is explicitly disclosed for parent review. No physical iPad or phone FPS measurements have been made. The legacy 400 KB / 4,000-triangle weapon safety test now allows only the enumerated exact-source originals via hash, byte and actual GLB triangle verification; unrelated assets keep their old limits. This exception preserves the approved geometry and needs review before merge.

## Validation and visual review

Observable criteria: grip centered on palm; correct authored axis and meter scale; complete model silhouette and all parts; no floating handle, detached detail, giant scale or excessive body clipping; appropriate color/alpha/toon edge treatment; readable carry, swing and bow presentation across desktop/iPad/mobile viewports.

Build passed. Core suite passed (275 tests). Focused integration captures/resource/save/bow tests are in progress. Chromium uses software rendering, not physical-device hardware. Local WebKit cannot launch because its host libraries are missing; required CI owns WebKit smoke. Exact final captures and a per-artifact review record will be added incrementally.

Status: draft integration for parent review. Do not merge or deploy until the parent gate is satisfied.
