# Seeker build workspaces — Travel Journal revision

## Current travel-journal build UI

The fullscreen travel-journal passive UI and engraved modifier gems are part of the
current game UI. Subsequent gameplay changes should preserve the same full-viewport
paper/ink presentation and touch-first interaction rules.

The passive screen is a full-viewport paper/ink **travel journal**, not a book
object or floating menu. Its normal sidebar, header/footer frame and persistent
inspector are hidden. The chart owns the screen between a small search/points
bar and pan/zoom controls. Details appear only after selecting a node and have
an explicit close button. The initial overview never opens a details panel.

Other build workspaces use quiet dark translucent panels and blue selection
accents (the owner's Minimal Panel direction). Equipping skills, managing mods,
movement, upgrades, inventory and crafting still have separate responsibilities.

## Chapters and selective investment

The eleven chapter cards are **chapters containing choices**, not purchasable
keystones, completion tasks or exclusive paths. Only individual linked nodes spend
Job Points. Every chapter can be left partly invested while choosing branches in
other chapters. Names and memberships now express journeys, with mixed effects:

- หน้าแรกของการเดินทาง / First Footsteps: basic preparations, health, mana and power.
- กองไฟพักแรม / At the Campfire: melee, vitality, recovery, sweep and leech.
- หอจดหมายเหตุ / The Old Archive: spell foundations, mana, area and radius branches.
- สัญญาร่วมทาง / A Shared Promise: healing, companions, areas and resource exchange.
- คำสาบานของผู้เดินทาง / The Oaths We Keep: the existing four profession subviews.
- ร่มไม้ระหว่างทาง / Beneath the Boughs: defense, recovery and companion support.
- สายน้ำไม่หวน / The River Remembers: herbs, companions, lingering fields and erosion.
- ขอบฟ้าไกล / A Farther Horizon: projectiles, movement, precision and poison.
- หมึกและคมเหล็ก / Ink and Iron: hybrid martial/magic paths and control duration.
- ทางแยกไร้ชื่อ / The Unnamed Crossing: hybrid weapons, movement and recovery.

Old internal category IDs remain for compatibility; they are not the visible
chapter names or a filter limiting what effects may be added to a chapter.
The 87 legacy node IDs remain inside the expanded 233-node network. Numerical effects
are rebalanced and new profession exercises extend single-focus investment to Job Lv40.
Character v4 refunds the old network once rather than retaining disconnected selections.
Dashed external markers are
actual adjacent nodes in other chapters; opening them only navigates. They do not
require completing the source chapter. The overview shows invested points only,
not a percent-complete meter. Search finds all nodes and opens the correct chapter.
The contents page uses scrollable cards with functional labels; phones use one column. External node links remain available inside each chapter.

### Passive stages

Major `sections` now own `tier` and `requiresSpent` metadata. They unlock from TOTAL
Job Points invested, excluding the origin. Only notable/job nodes use these total-spent gates. Minor nodes require an owned linked
neighbour without their own investment gate. An unlocked group does not grant a bonus or bypass its network. The four
profession oaths retain their level and one-profession rules. Groups offer optional
branches; the player does not need to complete a previous chapter. See `BALANCE-40.md`.


The UI shows a large section's unlock investment, and separate small-node connection
requirements. Job points and character Stat Points remain separate; profession changes
use town/Gold respec. Character v4 has an explicit one-time balance migration with a
free network refund, preserving other progression and existing item roll quality.

## Mod item art

`src/ui/gemart.js` defines a shared small faceted jewel with a single-colour etched
mark. `src/ui/sigils.js` supplies sixteen distinct vector symbols. `ART.mod` uses
these drawings centrally, so the inventory, modifier list, socket presentation,
crafting and upgrades use the same item identity. There are no raster illustrations,
external requests, or per-item generated images. Muted gem tint is visual identity,
not a skill-compatibility rule. The real tag/stat rules remain visible and authoritative.

## Shared type vocabulary and compatibility

`src/ui/buildmeta.js` is the shared presentation vocabulary for native tags, damage element, stat requirements, and all/any/excluded modifier tags. It reads the same definitions and calls the same `modFits` check used by socketing. Skill cards, selected skill details, movement, upgrades, crafting and inventory modifier details show this metadata; native skill types are not hidden in a collapsed section. Effective extra tags are explicitly labeled as modifier additions and do not silently change native shape eligibility. Active element conversion replaces the element tags used for element-specific requirements.

Type badges use short names: กายภาพ (`Attack`), เวท (`Spell`), โปรเจกไทล์
(`Projectile`), วงกว้าง (`Area`), ประชิด (`Melee`), ต่อเนื่อง (`DoT`) and the
other native tags. Both Attack and Spell are selectable skill filters. Modifier
tiles and recipe cards show required/all, at-least-one/any and forbidden tags
as badges; modifier details show the modifier's own tags separately. Read these
from existing definitions, never infer compatibility from descriptions or icon
colours. Damage element is separate: Stone Burst remains Spell even though
its damage is physical, and Frost Shift does not change Attack to Spell.

The modifier page distinguishes: type mismatch, missing stats (stored but inactive), already equipped here, equipped in another slot (move), duplicate modifier type, and full capacity. Incompatible modifiers remain inspectable. A filter can show type-compatible entries only, without concealing stat requirements.

`DoT` means damage over time; `Persistent` means a lasting field. Healing Spring is Persistent but is not DoT. Hex is a duration-based curse, not a Persistent field.

- `dotDamagePct` affects the damage of Venom Mire and Burning Ground only; not burn/poison status damage.
- `persistentDurationPct` extends Venom Mire, Healing Spring and Burning Ground; not buffs, curses, summons or cast time.
- `controlDurationPct` extends chilling hits and Hex; not slow intensity, knockback or War Cry.
- Lingering requires a native lasting field, or an eligible Burning Ground modifier already equipped. Removing the provider leaves Lingering in inventory/socket but inactive; no item is lost. This state is displayed.
- Burning Ground, Knockback, Life Leech and Frost Shift are on-hit modifiers and exclude DoT skills because the current field executor does not apply their on-hit effects. Older invalid combinations remain stored but are inactive rather than claiming unsupported effects.
- Ground radius/duration scaling is applied after collecting modifiers, so socket order cannot change the outcome.

No active combat skills, channeling system, terrain, camera, 3D materials, combat HUD, multiplayer, or economy backend are added by this change. The current 13 combat skills and 4 movement skills remain. Future channeled skills must get an actual executor and tests before being advertised as a supported category.

## Reference studied

Official LINE Games guides, used as documented design references rather than a claim about the latest client layout:

- Zodiac Traits (guide updated January 23, 2024): https://guide.floor.line.games/UD/en_US/detail/1166916634911400879 — category/type and tier overview, small-to-large connected trait structure, search across constellations, specialization choice.
- Rune Types: https://guide.floor.line.games/UD/en_US/detail/1166916574409800978 — visible skill properties and Link Rune compatibility rules.
- Rune Cast: https://guide.floor.line.games/UD/en_US/detail/1166916576948300323 — inspect a target skill and highlight compatible modifiers.

No names, trait content, graphics or assets from Undecember are copied. Our Job Points, save rules and build categories remain this game's rules.

## Verification

```
npm test
npm run build
node tests/browser/journal.mjs
BROWSER=webkit node tests/browser/journal.mjs
node tests/browser/workspaces.mjs
BROWSER=webkit node tests/browser/workspaces.mjs
npm run test:browser
npm run test:ux
```

`tests/browser/journal.mjs` captures the new fullscreen overview, a chapter before and after investment, the mod workspace and mod inventory. It checks viewport bounds, no default inspector, partial investment, shared gem art and actual socketing. `tests/core/journal.test.js` protects the graph/effect projection and all sixteen unique engravings.

`tests/browser/workspaces.mjs` uses real controls at 1440x960, 1180x820 touch, 844x390 touch and 390x844 touch. It covers chapter browsing, inspection versus allocation, staged point gates, search/jump, native skill tags, modifier incompatibility, socketing, movement selection, upgrade-page rendering, clipping and page errors. Screenshots and reports are written under `tests/browser/out/workspaces-<browser>/`. The shared `passive-checks.mjs` verifies stage locks/unlocks, one-Job restrictions, drag/cancel and native Chromium two-finger pinch. Both this suite and the deployment Dreamloop use the shared checks so the live audit stays aligned with the new UI.

For a runtime without local HTTP browser access, `OFFLINE_UI=1 CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/workspaces.mjs` bundles the real Game and Panels into an offline harness. This checks the actual UI/core, not the full 3D renderer or hardware FPS. Full-game Chromium/WebKit checks must still run in CI. The full-game runs call `freezeScene` (`tests/browser/freeze-scene.mjs`) after load: it leaves one finished 3D frame behind the panels and stops redrawing the scene, because under software GL the scene redraws at 1-3 fps and every tap or screenshot waits on frames (Chromium took about 17 minutes for the journal and workspaces steps together, now about 4). Fonts stay local/bundled by the existing app; no dependency archive is a user deliverable.

## Material progression and anime icons, October 2026

The bag, workbench and growth workspace share grade letters, affix pips and quality ranges,
skill level milestones, equipment wear requirements and actual upgrade previews. Repeat crafting is bounded by attempts and
resources and displays actual spend and every retained result. All 91 skill/gear/material/
mod icons receive original cel artwork while keeping the dark panel design. The passive
journal keeps paper/ink sections and connected nodes. `tests/browser/balance.mjs` checks
real controls in desktop/iPad/phone Chromium and WebKit and captures all icon sheets.

### Selected recipe workshops and equipment wear (2026-10-02)

Element chips also use the shared core taxonomy: Fire, Cold, Lightning, Earth, Poison,
Arcane and Physical damage. Skill filters include these tags. The detail separates
native type from current element; conversion shows the original element in a short
explanatory line, and a Fire ground effect is explicitly secondary. Modifier panels
use stat-active converters when checking element requirements. Conversion never grants
a native Projectile/Area/Spell type to a different shape.

Rolled element options show matching chips in the bag and recipe pool; repeat crafting
can target each option. “รอยจารึกธาตุ” adds 18 optional passive nodes to the 233-node,
11-chapter journal without changing older allocations. Node details show their element,
search finds the Thai element name, and each path requires the prior connected node as
well as its 0/3/9-point major section gate. Amounts and affix pools remain JSON content.

`craftview.js` is a generic workshop for every recipe. Choosing an item opens its own
detail; the catalog never crafts on selection. The single-craft button stays in place
after each roll. Goals, expansion state and up to twenty recent result UIDs are stored
per recipe in view state, while the bag retains all crafted items. Comparing a result
opens the bag with a return-to-the-same-workshop button. Catalog/detail/back and repeated
crafting are checked with real mouse/touch input in Chromium and WebKit.

C/B/A/S frames show 2/3/4/5 affix pips and actual roll counts. Enhancement/promotion is
resource-only at the workbench. Raw character stats gate wearing, computed from the
item's actual power by core `gearRequirements`. Previews show next enhancement's wear
requirements and a grade promotion range; worn gear that becomes unusable returns to
the bag with a clear warning. No character-level requirement applies to upgrading gear.

## Mana build choices and readable stages

Equipment rolls now offer max MP %, mana regeneration % and reduced mana cost on crafted
weapons, charms and selected mana clothing. They consume the same 2/3/4/5 option slots.
`manaCostPct` is capped at 35%, applies once to rank-scaled combat cost and does not alter
zero-cost skills. Character stats show real regeneration and reduced cost.

Eight optional `mana_*` nodes in First Footsteps form a shared connected resource path;
no profession is required. The seven small choices plus two fire small nodes reach the
9-point major unlock without buying an unrelated element. Opening a card or stage shortcut
only navigates. Remaining points and total spent points have separate labels.

`jobtree.stages` supplies 0/3/9/17/25/33, `sections` reference those tiers, and `layout`
supplies column/lane spacing. Duplicate thresholds share one band; `clusterPos` lies in
that actual band. Minor-only bands are labeled paths, never a points requirement.
Major descriptions show total spent / needed and a linked route with navigable node names.
The graph starts at 100% near an owned/available node, with stage shortcuts and fit/zoom.

The new Mana Siphon gem fits direct Damage, excludes DoT/Summon/Minion, and requires INT 6.
It returns 1/1.5/2 MP per successful direct player hit at ranks 1/2/3, with a shared
1-second player cooldown. Multiple targets, projectiles, repeats and other skills share
that cooldown. DoT, allies, dead players and dead targets cannot refund MP.

On phones, focusing a selected node anchors it above the details sheet, so its disc and
caption remain visible while reading requirements. Camera movement still cannot allocate.
