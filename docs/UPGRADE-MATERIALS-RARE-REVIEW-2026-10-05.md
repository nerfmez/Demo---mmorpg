# Uncommon upgrade materials — revised local prototype

This replaces the rejected 20%/15% prototype and its guaranteed one-of-each salvage
bonus. Local only: no push, PR, merge or deployment. Base remains
`1f575c49291bdc24820374e33a1fdc472ef18cac`, branch `codex/upgrade-materials`.

## Exact current rules

- `enhancement_stone` / หินเสริมอุปกรณ์: 3% base drop, quantity one.
- `skill_crystal` / ผลึกทักษะ: 2% base drop, quantity one.
- Both are independent secondary rolls for normal monsters and bosses. Probability
  of either per kill is 4.94%; both together is 0.06%. No boss guarantee or bonus.
- Existing material-find applies, capped by the existing character system: at +50%
  find the chances become 4.5%/3%. Monster/zone part tables remain untouched.
- Enemy summoned minions remain gold-only. Player summons/NPCs do not become loot
  sources; enemies killed by player summons receive the normal enemy drop rules.
- **No base stone or crystal reward from salvaging any gear**, regardless of grade,
  item level, starter status, whether crafted or dropped. No probabilistic salvage
  roll is added. The only relevant-gear source is recovery from enhanced equipment.
- Enhancement salvage returns `floor(total enhancement stone cost × 0.5)`.
  +0/+1/+2/+3/+4/+5 return 0/0/1/3/5/8 stones. This pools investment before rounding,
  rather than the first prototype's per-step rounding. There is no gold refund and
  no crystal return from equipment. Existing recipe-part salvage is retained.
- For new stone-funded items this is the actual deterministic investment. Old saves
  have no payment ledger: legacy +N gear receives the same **current-cost valuation**,
  not a claim that it historically spent stones. Legacy +5 still refunds eight
  stones. Existing inventory parts/gold/levels/grades/affixes are never converted,
  removed or retroactively charged. No migration or save version change required.
- Unchanged upgrade costs: equipment 1/2/3/4/6 stones; skills 1/2/3/4 crystals;
  mods 2/3 crystals. Gold, caps, effects, requirements, guaranteed success and
  equipment grade promotion are unchanged. No failure, paid mechanic or destruction.

## Model and alternatives (not measured play data)

Existing `balanceAt` for sword/bow/staff at levels 1..25 produces 7.8–11.2 seconds
per kill including its authored 6-second between-kill allowance and 55% combat
uptime. This is approximately 321–462 kills/hour of the modelled combat loop;
menus, extended travel, questing, player skill and breaks are not measured here.
At level 10: sword 9.9, bow 10.1, staff 10.7 seconds per kill.

| Candidate base chances | Stone/crystal per 100 kills | Either per kill | First stone / crystal expected kills |
|---|---|---|---|
| 4% / 3% | 4 / 3 | 6.88% | 25 / 33.3 |
| **3% / 2% selected** | **3 / 2** | **4.94%** | **33.3 / 50** |
| 2% / 1% | 2 / 1 | 2.98% | 50 / 100 |

The selected middle candidate cuts direct output by 85%/86.7%, avoids the old
near-every-third-kill combined material event (32%), and avoids doubling the
crystal wait of the most conservative candidate. These are prototype parameters
for owner review, not a claim of finished live balancing.

Expected kills per individual upgrade, **before material-find** and not guarantees:

| Flow | Unchanged per-step cost | Expected kills per step | Total to cap one item/skill/mod |
|---|---|---|---|
| Equipment +1..+5 | 1/2/3/4/6 | 33.3/66.7/100/133.3/200 | 533.3 kills, ~69–100 model minutes |
| Skill Lv2..5 | 1/2/3/4 | 50/100/150/200 | 500 kills, ~65–93 model minutes |
| Mod Lv2..3 | 2/3 | 100/150 | 250 kills, ~33–47 model minutes |

First enhancement averages ~4.3–6.2 model minutes; first skill rank ~6.5–9.3.
All streams accumulate while doing existing combat. Maxing several equipment slots
or several skills requires proportionally more materials; the model does not prove
that every build's full-upgrade pacing is enjoyable. Costs are deliberately unchanged
in this rarity correction, making that tradeoff visible for review.

Existing normal gear rate totals 1.73%. The rejected bonus therefore added up to
1.73 of EACH material per 100 normal kills if every gear drop was salvaged, plus
one of each per boss gear drop and repeatable crafting conversions. The revised
base yield is **zero**, including bosses, all grades and crafted gear. Enhanced-gear
refund is recovery of part of a sunk investment, not a new acquisition stream;
every new-item upgrade/salvage loop loses at least half its stones plus all paid gold.

## Evidence and inspection

50 affected tests passed across upgrade-materials, crafting, gear-hands and
balance-model. The ten dedicated tests cover every starter base, every recipe/grade
at +0, each +N refund, sparse save/load, legacy salvage, repeated salvage rejection,
locked/equipped protection, seeded rates, find multipliers, costs/caps/gates and
resource-insufficient atomic rejection. No changes to recipes or gear bases.

Build passed (pre-existing large-chunk warning only), diff check passed.
Focused real Game/Panels browser flow passed again on Chromium 1440×900 desktop
and 1180×820 touch; zero page errors. Final iPad material-source screenshot inspected:
3% and the recovery-only rule wrap visibly in the actual detail dialog. Costs/icons
are unchanged; previous native-size and integrated icon review remains applicable.
No full-world, WebKit or physical iPad measurement is claimed. No live economy result.

The existing illustrated 512×512 transparent icons and contact sheet are unchanged.
Their IDs remain `enhancement_stone` and `skill_crystal`; the approved raster list is
still explicit, preserving future SVG fallback semantics. Current final ZIP will
replace the prior Library ZIP version; old local artifacts are superseded.
