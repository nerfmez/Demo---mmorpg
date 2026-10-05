# Balance to the monster cap (October 2026)

Supersedes the level and zone parts of [BALANCE-40.md](BALANCE-40.md). Its stat, skill and
crafting rules still apply. All numbers live in `data/`. The model is `src/core/balance.js`,
`node scripts/balance-report.mjs` prints it, and `tests/core/balance-model.test.js` and
`tests/core/gear-tiers.test.js` keep the data inside the targets below.

## Levels

- **Monster levels:** 1–25, the cap. Character levels go to 30 and Job levels to 40.
- **Azure Coast** (Lv1–8):

  | Zone | Levels |
  |---|---|
  | coast | 1–2 |
  | meadow | 2–3 |
  | glade | 3–4 |
  | highlands | 4–5 |
  | forest | 6–7 |
  | headland | 6–8 |

- **Greenhollow Frontier** (Lv8–25):

  | Zone | Levels |
  |---|---|
  | meadow | 8–9 |
  | glade | 9–10 |
  | forest | 10–12 |
  | wolf den | 12–14, Greyfang Lv14 |
  | coast | 14–16 |
  | wetland | 16–18 |
  | highlands | 18–21 |
  | ruins | 21–24, Horned Warden Lv25 |

- **Monster scaling per level:** HP +30%, damage +50%, EXP +15%.
- **Character EXP curve:** 22 × L^2.2.
- **Job EXP curve:** 18 × L^1.8, so the top job-tree section (33 points) is reachable by Lv25.
- **Rank gates:** skills at Lv4/10/17/24, mods at Lv8/18.
- **Quests:** each has a `level`. A main quest rewards 35% of that level's EXP, a side quest 25%.

## Model and targets

A reference hero of each kit (sword with two light weapons, bow, staff) spends its stat
points by the kit's build. It wears the expected gear tier for its level, at grade B +2, and
fights the average normal monster of its level. 55% of the fight is spent casting. MP
regenerates over the fight plus 6 s to the next one.

| Kit | Lv | DPS | Time to kill | Time to die | Minutes per level |
|---|---:|---:|---:|---:|---:|
| sword | 1 | 37.5 | 1.8 s | 41 s | 0.1 |
| sword | 10 | 65.8 | 3.9 s | 21 s | 12.3 |
| sword | 20 | 109.3 | 4.2 s | 31 s | 35.7 |
| sword | 25 | 133.4 | 4.2 s | 36 s | 48.9 |
| staff | 10 | 54.1 | 4.7 s | 22 s | 13.3 |
| staff | 25 | 108.2 | 5.2 s | 37 s | 53.6 |

Reaching Lv25 on same-level monsters alone takes 7.4–7.5 h (sword and bow) to 8.2 h (staff).
Quests add more.

| Target | Range |
|---|---|
| Time to kill | 1.5–7 s (the first levels are deliberately quick) |
| Standing time to die | 10–45 s |
| Hours to the cap | 6.5–10 |
| Boss fights | 30–150 s |

This is a model. Feel, dodging and encounter difficulty still need play review.

## Gear tiers

- **Tiers:** item levels 1, 6, 11, 16 and 21, placed by the monsters whose parts make each item.
  `scripts/gear-tiers.mjs` is the one-time content pass. Every tier has every weapon kind,
  a shield and every armour slot.
- **Names:** tier 1–2 items are named after their parts. From tier 3 the names are free; the
  item lists its parts.
- **Base stats:** weapons follow `items.handRules` (two-hand 2.2×, heavy 1.5×). Armour
  follows the slot's share of the set reference (armor 45%, helm 20%, boots 15%, gloves 10%,
  shield 30% plus block). Charms are 12% of the weapon reference.
- **Recipes:** cost grows with the tier, with a main part, a second part, bulk lower-tier
  parts (10–30), a rare part from tier 4, and gold. First-tier recipes keep their onboarding
  values.

## Mid/high monsters (levels 11–24)

Five normal monsters fill the mid and high zones, so high gear does not hang on old monsters
or repeated boss kills. Each has its own body, attack pattern and part. No new boss.

| Monster | Levels, zone | Pattern | Drops | Main use |
|---|---|---|---|---|
| ตั๊กแตนพงหนาม `thicket_mantis` | 11–14 forest, wolf den | Rears with both scythes, X-slash in a 150° cone, hops back; lunge from 3–7 m | mantis_scythe 55%, beetle_shell 30% | IL11 blades, axe, gloves, talisman |
| งูกกพิษ `reed_viper` | 14–18 Frontier coast, wetland | Coils, then a fast straight strike; lobs venom onto a marked pool (3 s); keeps 3–6 m | viper_scale 60% ×1–2, venom_gland 35% | IL16 wisp/storm gear, armour, boots |
| แพะผาเขาเหล็ก `ironhorn_ram` | 18–21 highlands | Paws the ground, then a long charge (lane); a miss leaves it stunned 1.4 s; rears and stomps a 2.6 m ring | ram_horn 50%, crag_stone 30% | IL16 maul/shield, IL21 horn and crag gear |
| เสือเงาแผงคอเทา `duskmane_stalker` | 20–23 highlands, ruins | Circles half-seen; crouches and pounces onto a marked spot; claw swipe; backs off. A hit or any wind-up reveals it | dusk_pelt 55% ×1–2 | Wardenstalker set, IL21 bow and dagger, greaves, gauntlets |
| ทหารยามศิลารูน `rune_sentinel` | 21–24 ruins | Charges a 12 m beam (locked after 55% of a 1.2 s wind-up); shard ring around itself up close; slow, does not chase far | rune_core 40%, ruin_shard 12% | Ancient staff/ring, relic wand, oathblade |

- **Experience:** each new monster gives experience per minute inside its zone's range, never
  above the fastest monster already there (`monsterExpPerMin`, tested).
- **Spawns:** they replace part of the old counts in those zones. The Frontier has 300 spawns
  (was 282).

### Recipes (IL11–21)

The main part of each tier comes from the new monster of that band. A boss-only part stays as
a small key (at most 2 per recipe; `greyfang_mane`, `warden_horn` and `ancient_core` stay
boss-only), and bulk first-tier parts stay lighter (12–20 instead of 20–37).

| Recipe | Before | Now |
|---|---|---|
| Wardenstalker coat / hood / gloves | greyfang_mane 12 each (36 Greyfang kills) | greyfang_mane 2, dusk_pelt 15–20 |
| horn_greatblade, horned_helm | warden_horn 12 | warden_horn 2, ram_horn 15–20 |
| ancient_staff, ancient_ring | ancient_core 12 | ancient_core 2, rune_core 17 |
| greyfang_sabre, knight_greatsword | greyfang_mane 8 | greyfang_mane 2, mantis_scythe 10–12 |
| IL21 bulk | boar_tusk / boar_hide 30 | 17 |
| IL16 bulk | spore_sac 37, boar_tusk 25 | 18–23 |

`ruin_shard` (2 per IL21 recipe) now also drops from the sentinel; before, only the Horned
Warden dropped it. The tier rule still holds: each tier asks for at least 20% more parts than
the one below.

### Farming time (model)

`recipeFarming` (core/balance.js) estimates minutes for one recipe:
- Each part comes from its quickest spawn at or below the tier band (tier to tier + 5).
- It includes C-grade salvage of the gear those monsters drop.
- It adds the parts one after another, so it is an upper bound (in play several come at once).
- These are calculated values, not measured play.

| Tier | Average minutes per piece | Levelling through the band |
|---|---|---|
| IL11 | about 10 | 89 min (Lv11–15) |
| IL16 | about 11 | 146 min (Lv16–20) |
| IL21 | about 25 | 162 min (Lv21–25) |

- **Tested:** at least three pieces of a tier fit inside the time to level through its band,
  so a set is done before it goes out of date. Each tier takes longer than the one below.
- **Boss kills:** no recipe needs more than 2 kills of a boss.
- **Example:** the Wardenstalker set now takes about 50 min of farming plus 6 Greyfang kills
  and 1 Horned Warden kill.

## Gear drops

A monster drops gear made from its own parts, of the tier for its level. When no such item
exists, it drops the nearest lower tier. A normal kill rolls each grade once, best first:

| Grade | Chance per normal kill |
|---|---:|
| S | 0.03% |
| A | 0.1% |
| B | 0.4% |
| C | 1.2% |

Bosses always drop one item, weighted C 40 / B 35 / A 20 / S 5. Gear lands on the ground in
its grade colour (A/S with a beam) and is picked up into the bag. Crafting still rolls better
grades (C/B/A/S 45/35/16/4%).

## Journal build lines

The field journal has nine build lines on three pages per stage. Each page holds three lines
that suit each other: weapon (physical, damage, crit), magic and tempo (element, MP, speed),
and survival and hunting (guardian, agility, treasure).

- **Inside a line:** each stage starts at an entry and forks into two focuses (for crit: crit
  chance or crit damage). The focuses meet again at a meeting node, which needs only one of
  them (`requiresAny`).
- **Between lines:** bridge nodes beside the entries mix two neighbouring lines. A bridge
  needs either line's entry and opens either line's meeting node, so a player can change line
  on the way.
- **Across pages:** at stages 3 and 4, three bridges cross to another page: crit + treasure
  (bow), speed + agility, physical + guardian.
- **Mastery:** after stage 5, each line continues into a mastery chain on its own page.
- **Points:** one line alone still takes all 39 Job points (Job Lv40) through the stage gates
  (0/3/7/17/25 points spent).

`scripts/journal-lines.mjs` generates the nodes, bridges and page grids into
`data/jobtree.json`.

| Line | Gives |
|---|---|
| ดาเมจล้วน (damage) | attack, magic, `damagePct` |
| คริติคอล (crit) | `critChancePct`, `critMultPct` |
| ตีเร็ว (speed) | `castSpeedPct` (cast time and cooldown), `cooldownPct` |
| ธาตุ (element) | `elementalDamagePct`, poison chance |
| กายภาพ (physical) | `attackDamagePct`, `penetrationPct` (ignores monster defence) |
| ป้องกันและโจมตี (guardian) | max HP, defence, block, melee damage |
| คล่องตัว (agility) | move speed, `movementRechargePct`, HP regen |
| MP | max MP, MP regen, `manaCostReductionPct` |
| ล่าสมบัติ (treasure) | gold, part and gear find, projectile damage |

- **No penalties.** Lines only give. The trade-off is the points not spent elsewhere, and MP:
  fast or many skills drain it unless the MP line (or MP gear) is taken.
- **Model checks** (`tests/core/balance-model.test.js`, Lv25):
  - A pure damage line on a kit it fits gives 1.45–2.0× DPS over no nodes, and lines are
    within 1.35× of each other.
  - Guardian gives at least 1.4× time-to-die.
  - In a 90-second fight (`longFightDps`), a staff with pure speed is held back by MP. Speed
    24 + MP 15 beats it by more than 1.2×.
  - All line stats fit their caps after the soft cap.
  - Mixed builds hold up. Bow crit + speed is at least as strong as either pure line. Sword
    physical + guardian keeps at least 1.45× DPS and 1.3× time-to-die. Staff element + MP
    keeps at least 1.45× DPS.
- **Farming.** The treasure line plus hunter arrows (parts +10%, gear +10%) net 1.1–1.6× a
  sword hero's income at the same level, after the arrow cost (about 9–13% of gross). Find
  stats are capped at 60/50/40 and add nothing to the power score.
