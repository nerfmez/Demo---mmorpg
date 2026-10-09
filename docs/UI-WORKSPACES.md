# Seeker build workspaces — Travel Journal revision

## Current travel-journal build UI

The game uses bounded windows that leave the live scene visible. `compact.css`
provides the shared dark, quiet panel presentation while preserving painted icons,
mod engravings and the native passive chart. Controls retain touch-sized targets;
long content scrolls inside its own window rather than shrinking text.

The passive travel journal remains a paper/ink chart inside a bounded panel.
Search, Job Points, stages, pan/zoom and node details keep their native handlers.
Details appear only after selecting a node and have an explicit close button.
The initial overview never opens a details panel.

Equipment/inventory and skill/mod management now use the reviewed two-window
landscape layout. The left equipment window owns the full-body equipped avatar;
the right bag owns paginated painted objects and a compact selected-item action.
The skill window shows four combat objects and their actual mod sockets, plus the
separate movement slot. The right library contains skill art and owned coin
instances. Coins use red for attack power, blue for mechanics and green for
support; these colors never identify damage elements.

Details open on tap. Existing upgrade, grade and sale handlers remain available
in inventory details; skill/mod upgrades and crafting keep their existing pages.
Portrait supports the same two workspaces using explicit equipment/loadout and
inventory/library pane buttons. Landscape shows both panes with scene space between
them. Bag pages contain 12 objects, or 10 on short landscape screens; skill/mod
pages contain 12, or 6 on narrow/short screens. Page capacity changes retain the
selected object, an open dialog and its focus. Each pane contains its scrolling.

The controller is `src/ui/loadout-workspace.js`, owned by the normal `Panels`
lifecycle. It reads the actual character and calls the existing equip/socket core
and save callback. It never grants review items or installs renderer overrides.
Insertion, replacement and removal flights are cosmetic: the core commits first,
new input cancels the old motion, and reduced motion seats immediately. Temporary
avatar targets use the existing renderer and release their resources after capture.
The icon release remains the sole owner of painted assets and `art()` routing.
`tests/browser/loadout-live.mjs` verifies the real game and a persisted test save.

## Chapters and selective investment

The ten large overview marks are **chapters containing choices**, not purchasable
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
The 87 legacy node IDs remain inside the expanded 207-node network. Numerical effects
are rebalanced and new profession exercises extend single-focus investment to Job Lv40.
Character v4 refunds the old network once rather than retaining disconnected selections.
Dashed external markers are
actual adjacent nodes in other chapters; opening them only navigates. They do not
require completing the source chapter. The overview shows invested points only,
not a percent-complete meter. Search finds all nodes and opens the correct chapter.
Portrait overview rearranges the same chapters into two columns, preserving links.

### Passive stages

Major `sections` now own `tier` and `requiresSpent` metadata. They unlock from TOTAL
Job Points invested, excluding the origin. Every small node ALSO requires an owned linked
neighbour. An unlocked group does not grant a bonus or bypass its network. The four
profession oaths retain their level and one-profession rules. Groups offer optional
branches; the player does not need to complete a previous chapter. See `BALANCE-40.md`.


The UI shows a large section's unlock investment, and separate small-node connection
requirements. Job points and character Stat Points remain separate; profession changes
use town/Gold respec. Character v4 has an explicit one-time balance migration with a
free network refund, preserving other progression and existing item roll quality.

## Mod item art

`src/ui/mod-coins.js` draws the physical coins in the two loadout windows, including
the flying coin and seated socket. Fifteen engraved symbols identify the existing
mod types. Red faces mean attack power, blue means mechanics and green means support;
the real tag/stat rules remain authoritative. The separate icon release owns
`ART.mod` and the other shared icon surfaces, as well as the 76 painted skill,
gear and material PNGs. This UI change does not duplicate those assets or their routing.

## Shared type vocabulary and compatibility

`src/ui/buildmeta.js` is the shared presentation vocabulary for native tags, damage element, stat requirements, and all/any/excluded modifier tags. It reads the same definitions and calls the same `modFits` check used by socketing. Skill cards, selected skill details, movement, upgrades, crafting and inventory modifier details show this metadata; native skill types are not hidden in a collapsed section. Effective extra tags are explicitly labeled as modifier additions and do not silently change native-tag eligibility.

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

`tests/browser/journal.mjs` captures the new fullscreen overview, a chapter before and after investment, the mod workspace and mod inventory. It checks viewport bounds, no default inspector, partial investment, shared gem art and actual socketing. `tests/core/journal.test.js` protects the graph/effect projection and all fifteen unique engravings.

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

## Main menu (hub)

The HUD menu button (and Esc) opens a main menu that lists every page in five groups: adventurer
(character, passive path), skills and mods (skill set, mods, movement, level-up), items and shop
(bag, crafting, shop), journey (quests, map) and system (settings). Nothing else is shown until a
tile is pressed. A page lists only its own group in the sidebar (a select on phones) and has a
"‹ เมนูหลัก" button that returns to the hub; the bag and skill workspaces carry the same button in
their top bar. The passive travel journal is unchanged. Structure: `src/ui/menu-map.js`; styling:
`src/ui/menus.css`; test: `tests/browser/menu-hub.mjs`.
