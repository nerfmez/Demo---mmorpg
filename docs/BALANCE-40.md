# Progression and crafting balance, October 2026

Source baseline: `bc86bcbdecb99a37586dd7dab95d6ac9419935ce`. Scope is the existing anime
MMORPG demo, not new endgame content. Character Stat Points, Job Points, skill/material
growth and behaviour-changing mods retain separate purposes.

## Rules

- Character and Job caps are 40. Job Lv40 grants 39 points. Four professions each have
  connected choices sufficient for a single-focus build, including utility and defence.
- Shared foundation starts every new build. Global journey areas open at 0, 3, 9, 17, 25 and 33 spent points; profession entrances
  additionally require Job Lv5 and three invested points. Small nodes ALWAYS require an
  owned linked neighbour. Section unlock, connection, points and profession are separate.
- Stat growth is slower. Starting HP is preserved. STR/INT give 0.45 power per point;
  DEX gives 0.2 attack plus lower projectile/crit growth. Excess stacking has data caps
  and diminishing returns, including movement, cooldown, mitigation, healing and leech.
  Leech includes mod bonuses in its cap and only recovers from actual remaining target HP,
  never overkill damage.
- Crafted base gear is moderated. Grade variance is -5%..+5%, rather than -15%..+30%.
  C/B/A/S add 2/3/4/5 unique affixes. Every base and recipe pool supports five distinct options.
- +1..+5 adds 4% per step to base stats, not rolled affixes. It uses the recipe's monster
  part plus catalysts/gold, with no character-level or stat gate to upgrading. Grade
  promotion is separate and also resource-only: retain existing rolls and enhancement,
  then add one unique affix. Wearing uses the actual resulting item requirements.
- Skill ranks 2..5 require character Lv5/12/22/34 and progression stats 5/7/9/11. World
  materials/gold pay for ranks. Maximum direct power growth is +24%, previously +48%;
  MP-cost growth reaches +20%. Mod ranks require character Lv10/24. Repeats, ground damage
  and concentrated bonuses are moderated, without removing their behaviours.
- Crafting materials of quantities at least three increase by about 20% (rounded).
  Rare single-part requirements stay unchanged. First-craft quest supplies are adjusted
  to the new starter recipe, so onboarding never depends on a lucky drop.
- Repeat crafting has an explicit maximum of 1/5/10 attempts, grade/affix/quality goals,
  maximum budget and actual spend. Each selected recipe opens its own workshop with a
  stable one-click repeat button, per-recipe goals and the latest twenty results. Selecting
  a recipe never spends anything. Stop at target/material shortage, preserve all results,
  and let the player inspect/compare any roll. No automatic disposal or replacement.

## Isolated power audit

Fixtures spend 65% of available Stat Points on the kit's main stat and 20% on VIT;
weapons step through early/end bases. Rank 5 and +5 are deliberately retained in the
high-level comparison, including legacy investments. No affixes, Job nodes or mods are
included: this isolates the old stacked multipliers, rather than claiming a universal
DPS reduction for every build. Skill cooldown burst is not sustained spell DPS.

| Kit / character level | Old hit | New hit | Old HP | New HP |
|---|---:|---:|---:|---:|
| Sword 1 | 21.0 | 19.1 | 127 | 127 |
| Sword 10 | 85.5 | 43.0 | 271 | 199 |
| Sword 20 | 185.4 | 77.9 | 440 | 290 |
| Sword 40 | 260.5 | 101.4 | 748 | 442 |
| Bow 20 | 147.1 | 67.5 | 425 | 275 |
| Bow 40 | 196.8 | 90.2 | 733 | 427 |
| Staff 20 | 212.7 | 87.3 | 425 | 275 |
| Staff 40 | 300.3 | 113.9 | 733 | 427 |

Reproduce current fixtures with `node scripts/balance-report.mjs`. The original values
were measured with the baseline source before editing. Monsters retain readable authored
attacks, zone levels and material drops. Final encounter feel still requires player review;
this numeric audit does not establish hardware FPS or subjective difficulty.

## Saves and art

Character schema v4 retains the free, one-time tree refund introduced in v3. It preserves gold, stat points,
skill ranks, mods, equipped UIDs and materials. Existing gear affix QUALITY maps to the new
range without rerolling. Repeated migration is idempotent. No item or skill is deleted.
All v1/v2/v3 items receive missing slots up to 2/3/4/5 at conservative minimum rolls,
once, without changing existing affixes, grade, UID or enhancement. v3 roll values are
not converted again. Any item whose new wear requirements are unmet stays in the bag;
its ownership and investment are preserved. Starter items also have two minimum rolls.
Published `/lab/` previews use separate save slots; import an exported main code to try an
existing build safely. The main-game save envelope stays version 2.

All 17 skill icons have original action compositions. All 37 gear and 22 material icons
retain item-specific silhouettes, with saturated metal/leather/element colours and hard
cel planes. All 15 mod gems retain distinct engravings and brighter facets. Rarity remains
an independent frame/letter/affix-pip indicator. Physical and Firebolt VFX profiles are
unchanged. Contact sheets and UI captures are produced by `tests/browser/balance.mjs`.

## Primary research

- [Undecember Zodiac Traits](https://guide.floor.line.games/UD/en_US/detail/1166916634911400879):
  spent-point gates apply to trait groups; connected traits still require their preceding
  network. This distinction informed the sections/links rule; their exact thresholds were
  not copied.
- [Undecember Gear](https://guide.floor.line.games/UD/en_US/detail/1166916752808800098):
  grade affects option count. Frontier keeps its smaller four-grade ladder.
- [Undecember Gear Enchants](https://guide.floor.line.games/UD/en_US/detail/1166917747181300461):
  repeat attempts use explicit targets and stopping conditions. Frontier adds a ten-attempt
  budget cap and retains every result instead of destroying unwanted rolls.
- [Undecember Rune Growth](https://guide.floor.line.games/UD/en_US/detail/1166916578064600787):
  world-earned resources and gold support skill growth. Frontier preserves behaviour mods
  as its primary build choices and has guaranteed non-destructive upgrades.

## Equipment wear requirements (owner clarification, 2026-10-02)

Enhancement and grade promotion require only materials/gold at a workbench. They can be
performed at character Lv1 even if the item cannot be worn. Skill/mod rank gates are separate.

`gearRequirements()` uses only trained character stats. The base's `requirementStat` selects
STR/DEX/INT/VIT/AGI according to the item; existing base requirements retain their identity.
For bases without explicit requirements, the minimum is 3 (starter gear always uses this
baseline), otherwise ceil(C/+0 base power × 0.35), with a floor of 3. Every requirement
increases by ceil(max(0, actual weighted item power − C/+0 weighted base power − 2) × 0.5).
Weights, allowance and growth factors live in `items.requirements`; actual enhancement
and affix values are included. Better rolls therefore demand equal or greater stats.

Previews show exact after-enhancement requirements and a min/max range for new grade
affixes without rolling RNG. An equipped item upgraded beyond the owner's trained stats
is returned to the bag, with a warning shown before upgrading and confirmation afterward.
Stat respec and migration use the same enforcement; invalid gear never contributes to
derived combat stats or the hero's appearance. Re-equipping requires meeting its actual
current requirements. No item is deleted, and no upgrade is blocked by insufficient stats.

### Clarified small-node progression and mana investment

Every new character begins in the shared foundation. The 0/3/9/17/25/33 thresholds
open six global journey areas; all nodes in an area share its gate. Minor nodes also
require an owned linked neighbour. Three invested foundation points open stage II.
Existing node IDs/effects, one-profession rules and version-4 ownership remain.
Unspent points cannot open areas, and this revision does not reset existing saves.
Resource gear rolls, the shared eight-node mana route and Mana Siphon are alternatives
to offensive investment; reduced mana cost is capped at 35%, and on-hit recovery shares
a one-second player cooldown across targets and skill slots.
