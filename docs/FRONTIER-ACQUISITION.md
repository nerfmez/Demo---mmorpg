# PR102 acquisition and compatibility

Current source base: main `63d734df69458255f896b26d03a104a38d116da9` (PR119 merged after Moonroot `5f210396786429c2743c8142c7d7309fd31719da`). Existing PR102 head: `fdd0cce93df675de8da7be6205c3566af2867b90`. Only the merged PR119 code is integrated.

28 combat skills / 4 movement / 34 mods: main added `arcane_bolt` while PR102 waited. Both it and the prototype `arcane_shot` retain their IDs and different staff/wand identities. No free grants; fresh characters own only their kit basic. All 14 additions + 19 mods use normal workbench recipes and inventory. `prototype:true` remains solely an authoring/Lab routing marker, not an acquisition gate.

## Recipe choices

No new drop IDs, gear slots, economy or combat stat changes. Quantities mirror existing 2–6 part, 15–45 gold skill/mod recipes. Early attack, guard and healing stay reachable in Azure; Moonroot materials specialize mobility, protection and control; highland parts gate later summons/triggers. Material sources are the practical progression gates; no hidden level requirement. Grades follow existing C utility/B advanced behavior mods. `rootdigger_claw` remains the three-claw mole part.

| Type / ID | Cost (quantity × material) | Source emphasis |
|---|---|---|
| skill `charged_shot` | 3 × shore_feather, 2 × boar_tusk, 25 × gold | Azure / existing frontier parts |
| skill `riposte` | 3 × crab_shell, 2 × boar_tusk, 25 × gold | Azure / existing frontier parts |
| skill `weakpoint` | 3 × boar_tusk, 2 × shore_feather, 25 × gold | Azure / existing frontier parts |
| skill `armor_cleave` | 4 × boar_tusk, 2 × beetle_shell, 30 × gold | Azure / existing frontier parts |
| skill `interrupt_slam` | 3 × rootdigger_claw, 2 × boar_tusk, 30 × gold | Moonroot + earlier parts |
| skill `frontline_split` | 3 × rootdigger_claw, 2 × wolf_fang, 35 × gold | Moonroot + earlier parts |
| skill `shield_bash` | 4 × crab_shell, 2 × boar_hide, 25 × gold | Azure / existing frontier parts |
| skill `arrow_rain` | 3 × fern_ear_tuft, 3 × shore_feather, 30 × gold | Moonroot + earlier parts |
| skill `arcane_shot` | 2 × glow_dust, 20 × gold | Azure / existing frontier parts |
| skill `flame_stream` | 3 × glow_dust, 2 × spore_sac, 30 × gold | Azure / existing frontier parts |
| skill `crystal_wall` | 3 × mirror_scale, 2 × rootdigger_claw, 35 × gold | Moonroot + earlier parts |
| skill `cleanse` | 3 × salt_gel, 2 × glow_dust, 25 × gold | Azure / existing frontier parts |
| skill `battle_aura` | 3 × mirror_scale, 2 × fern_ear_tuft, 35 × gold | Moonroot + earlier parts |
| skill `stone_guardian` | 3 × crag_stone, 2 × rootdigger_claw, 40 × gold | Frontier/highland + earlier parts |
| mod `short_stride` | 2 × fern_ear_tuft, 2 × boar_hide, 20 × gold | Moonroot + earlier parts |
| mod `returning_shot` | 2 × mirror_scale, 2 × shore_feather, 25 × gold | Moonroot + earlier parts |
| mod `terminal_burst` | 3 × glow_dust, 2 × crab_shell, 20 × gold | Azure / existing frontier parts |
| mod `chain_return` | 2 × wisp_core, 1 × mirror_scale, 30 × gold | Frontier/highland + earlier parts |
| mod `advancing_edge` | 2 × fern_ear_tuft, 2 × boar_tusk, 20 × gold | Moonroot + earlier parts |
| mod `gathering_cut` | 3 × rootdigger_claw, 1 × boar_hide, 25 × gold | Moonroot + earlier parts |
| mod `laceration` | 3 × boar_tusk, 1 × crab_shell, 20 × gold | Azure / existing frontier parts |
| mod `ash_detonation` | 3 × glow_dust, 2 × spore_sac, 25 × gold | Azure / existing frontier parts |
| mod `shatter` | 2 × mirror_scale, 2 × glow_dust, 25 × gold | Moonroot + earlier parts |
| mod `following_field` | 2 × fern_ear_tuft, 2 × spore_sac, 25 × gold | Moonroot + earlier parts |
| mod `binding_field` | 2 × rootdigger_claw, 2 × spore_sac, 25 × gold | Moonroot + earlier parts |
| mod `healing_chain` | 2 × mirror_scale, 2 × glow_dust, 25 × gold | Moonroot + earlier parts |
| mod `healing_barrier` | 2 × beetle_shell, 2 × glow_dust, 20 × gold | Azure / existing frontier parts |
| mod `breaking_ward` | 2 × rootdigger_claw, 2 × beetle_shell, 25 × gold | Moonroot + earlier parts |
| mod `spreading_hex` | 3 × spore_sac, 1 × mirror_scale, 25 × gold | Moonroot + earlier parts |
| mod `focused_pack` | 2 × wolf_fang, 2 × fern_ear_tuft, 30 × gold | Moonroot + earlier parts |
| mod `guardian_bond` | 3 × rootdigger_claw, 2 × wolf_pelt, 30 × gold | Moonroot + earlier parts |
| mod `following_aura` | 2 × mirror_scale, 2 × wolf_pelt, 30 × gold | Moonroot + earlier parts |
| mod `cast_on_guard` | 2 × wisp_core, 2 × rootdigger_claw, 40 × gold | Frontier/highland + earlier parts |

## Native compatibility (all 19 additions)

All pairs also checked through actual socket action, UI fit status and compiled active mods. Stat/weapon requirements still apply. Shatter additionally works after an active compatible Frost Shift conversion; incompatible/missing-stat conversions do not activate it. Existing symmetric conflicts remain.

| Mod | Native skill consumers |
|---|---|
| `short_stride` | `dash`, `roll`, `blink`, `leap` |
| `returning_shot` | `hunter_shot`, `arcane_bolt`, `firebolt`, `charged_shot`, `arcane_shot` |
| `terminal_burst` | `hunter_shot`, `arcane_bolt`, `firebolt`, `charged_shot`, `arcane_shot` |
| `chain_return` | `chain_spark` |
| `advancing_edge` | `slash`, `weakpoint`, `armor_cleave`, `interrupt_slam`, `shield_bash` |
| `gathering_cut` | `whirl_blade`, `stone_burst`, `frost_nova`, `arrow_rain` |
| `laceration` | `slash`, `whirl_blade`, `hunter_shot`, `arcane_bolt`, `charged_shot`, `weakpoint`, `armor_cleave`, `interrupt_slam`, `frontline_split`, `shield_bash` |
| `ash_detonation` | `firebolt` |
| `shatter` | `frost_nova` |
| `following_field` | `venom_mire`, `healing_spring` |
| `binding_field` | `venom_mire` |
| `healing_chain` | `cleanse` |
| `healing_barrier` | `healing_spring`, `cleanse` |
| `breaking_ward` | `ward` |
| `spreading_hex` | `hex` |
| `focused_pack` | `spirit_wolf`, `stone_guardian` |
| `guardian_bond` | `spirit_wolf`, `stone_guardian` |
| `following_aura` | `war_cry` |
| `cast_on_guard` | `arcane_bolt`, `firebolt`, `frost_nova`, `ward`, `arcane_shot`, `cleanse` |

## Save contract

Character v13 adds the movement socket to current v12 saves. Existing v9 prototype sockets, skills, ranks, mod UIDs, gear and loadout IDs survive. Missing movementMods becomes []; duplicate/invalid/combat-assigned references are filtered. Existing autoPotion settings are preserved for v12+, with main’s pre-v12 migration unchanged. No changes to equipment requirement enforcement.

## Presentation limits

Prototype line/wall/aura/flame/healing effects remain interim original effects. Stone Guardian still uses crag_golem. This integration does not claim a final animation/VFX redesign; normal-speed playback/physical iPad review remains owner review. Craft guidance now describes hold/release, channeling, heal, aura, wall and shield requirements instead of generic attack instructions.

## Executor audit corrections

- Delivery-kind filters reject silent no-ops: Multistrike on counter/line, Burning Ground on counter/line, Spiked Ward outside actual barriers, Echo on melee arc/wall, and dodge triggers on aura/wall. Wide Arc requires a real arc; Advancing Edge also requires an arc so its narrower-angle penalty is real. Existing UIDs remain stored, even when a formerly accepted no-op becomes inactive.
- Arrow Rain now executes Echo as a second set of three delayed waves, without a second MP/arrow charge.
- Shield Bash keeps the socketed Knockback distance instead of overwriting it with the base distance during compilation.
- Guard-triggered Ward respects its 60/65/70% effect; one trigger pays MP once and respects cooldown/insufficient MP.

PR119 integration preserves its independent allocation groups and treeRevision 3 selective refund unchanged. Combined v9/v12/v13 tests retain active nodes and movement/combat UIDs, refund each retired/missing node once, and remain idempotent on repeated load.
