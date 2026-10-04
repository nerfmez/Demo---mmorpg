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

Reaching Lv25 on same-level monsters alone takes 7.6 h (sword and bow) to 8.3 h (staff).
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

## Ranger farming line

- **Bonuses:** `goldFindPct`, `materialFindPct` and `gearFindPct`, capped at 60/50/40.
- **Where they come from:**
  - The Ranger tier columns "ตาพรานล่าทรัพย์" (Hunter's Eye: parts +5% ×5) and
    "ถุงทองนักล่า" (Hunter's Purse: gold +8% and gear +5% ×5).
  - Hunter arrows add parts +10% and gear +10%.
- **Tradeoff:** they add nothing to the power score, and arrows cost about 9–13% of gross
  income.
- **Model check:** the farming Ranger nets 1.1–1.6× a sword hero's income at the same level.
