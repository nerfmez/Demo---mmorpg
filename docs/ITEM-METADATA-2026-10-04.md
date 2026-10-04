# Equipment level and persistent mod grade

The owner approved adding progression-based equipment levels and independent persistent
C/B/A/S mod grades, with safe save defaults and unchanged stat wear requirements.
The following numeric mapping is an authored initial choice, not a list supplied by the owner.

## Initial mapping

Use the earliest authored acquisition level for each non-gold recipe ingredient,
then the highest of those levels for the recipe's progression tier. Sources are
Azure Coast at `62373780fac1a007f0939135497e91e2507536bc` and Greenhollow Frontier
at PR #55 `005814e0c10d6147e13d27f39cce3df5d57595fd`. Monster spawns use their lower
level bound; bosses use their authored level; zone-wide extra drops use zone level.
For example, Azure highlands supplies ruin_shard at tier 3, before the Warden.
These values are copied into data once; changing maps never recomputes an owned item.
This metadata does not introduce new acquisition paths or merge the map branch.

Gear recipes store `itemLevel`; new crafted instances copy that exact value.
Starter gear uses Lv.1. A base's default is the minimum level across recipes producing
it, because a legacy save does not record which recipe created the instance.
Thus tide_boots uses Lv.2 through its named recipe and Lv.1 through salt_boots;
legacy tide_boots defaults to 1. Shell_guard uses Lv.2 or Lv.3 through hermit_guard;
its legacy default is 2. Neither enhancement nor character level modifies item level.

Mod recipe tiers 1–2 initially receive C, 3–5 B, 6–8 A and 9+ S. Current recipes
therefore include C/B/A; none initially creates S. S remains a supported persisted
value, without adding a new recipe/drop/economy. Grade changes the displayed name
color only, using the existing C/B/A/S palette. Mod effects, compatibility, stat gates,
rank upgrades, prices and costs continue to use their existing rules.

| Recipe | Result | Source progression tier | New instance metadata |
|---|---|---:|---|
| tusk_blade | tusk_blade | 1 | Lv. 1 |
| hunter_bow | hunter_bow | 1 | Lv. 1 |
| fang_dagger | fang_dagger | 3 | Lv. 3 |
| wisp_staff | wisp_staff | 5 | Lv. 5 |
| spore_wand | spore_wand | 2 | Lv. 2 |
| crag_axe | crag_axe | 6 | Lv. 6 |
| storm_bow | storm_bow | 4 | Lv. 4 |
| greyfang_sabre | greyfang_sabre | 5 | Lv. 5 |
| horn_greatblade | horn_greatblade | 9 | Lv. 9 |
| ancient_staff | ancient_staff | 9 | Lv. 9 |
| hide_vest | hide_vest | 1 | Lv. 1 |
| shell_guard | shell_guard | 2 | Lv. 2 |
| wolfpelt_coat | wolfpelt_coat | 3 | Lv. 3 |
| storm_mantle | storm_mantle | 4 | Lv. 4 |
| crag_plate | crag_plate | 6 | Lv. 6 |
| leather_cap | leather_cap | 1 | Lv. 1 |
| beetle_helm | beetle_helm | 2 | Lv. 2 |
| spore_hood | spore_hood | 2 | Lv. 2 |
| feather_circlet | feather_circlet | 2 | Lv. 2 |
| horned_helm | horned_helm | 9 | Lv. 9 |
| wolf_boots | wolf_boots | 3 | Lv. 3 |
| wisp_slippers | wisp_slippers | 1 | Lv. 1 |
| crag_greaves | crag_greaves | 6 | Lv. 6 |
| tusk_charm | tusk_charm | 1 | Lv. 1 |
| wisp_pendant | wisp_pendant | 5 | Lv. 5 |
| spore_amulet | spore_amulet | 2 | Lv. 2 |
| feather_charm | feather_charm | 4 | Lv. 4 |
| golem_amulet | golem_amulet | 6 | Lv. 6 |
| ancient_ring | ancient_ring | 9 | Lv. 9 |
| mod_split | split | 1 | C |
| mod_pierce | pierce | 1 | C |
| mod_bounce | bounce | 5 | B |
| mod_burning_ground | burning_ground | 2 | C |
| mod_echo | echo | 5 | B |
| mod_wide_arc | wide_arc | 1 | C |
| mod_multistrike | multistrike | 3 | B |
| mod_frost_shift | frost_shift | 2 | C |
| mod_knockback | knockback | 2 | C |
| mod_concentrated | concentrated | 6 | A |
| mod_lingering | lingering | 2 | C |
| mod_life_leech | life_leech | 3 | B |
| mod_spiked_ward | spiked_ward | 2 | C |
| mod_pack_leader | pack_leader | 3 | B |
| mod_cast_on_dodge | cast_on_dodge | 5 | B |
| crabshell_helm | crabshell_helm | 1 | Lv. 1 |
| tide_boots | tide_boots | 2 | Lv. 2 |
| pearl_pendant | pearl_pendant | 1 | Lv. 1 |
| salt_boots | tide_boots | 1 | Lv. 1 |
| shore_circlet | feather_circlet | 2 | Lv. 2 |
| hermit_guard | shell_guard | 3 | Lv. 3 |

## Save preservation

`normalizeItemMetadata()` runs after unknown-item filtering in `migrateCharacter()`
on every load, independent of the character version. Valid positive integer gear
levels and valid C/B/A/S mod grades survive unchanged. Missing/invalid gear levels
use the authored base default; missing/invalid mod grades use C. Never infer an
old mod's grade from its rank, reroll grade on load, spend RNG, alter ownership/UIDs,
or modify sockets, maps, position, enhancement or affixes. The slot envelope is unchanged.
The parallel map migration may retain character v5; these optional fields need no
competing version bump. Equipment is still worn according to raw stat requirements,
with no character-level requirement.

## Verification and visual criteria

Targeted tests cover all creation paths, recipe-specific duplicate bases, valid and
invalid legacy defaults, repeat migration/JSON reload, v5 map record preservation,
unchanged RNG rolls, unchanged stats/wear gates and grade-independent mod effects.
Browser checks exercise actual saved equipment levels, grade-colored mod names,
semantic coin materials, touch equip/replace/remove, rapid taps/cancellation, reduced
motion and reload. Inspect desktop, tablet and 844×390 phone screenshots after the
last relevant source change; no clipped selection actions or crowded metadata lines.
CI and visual artifact identity are recorded in the final handoff, rather than
claimed before they finish.
