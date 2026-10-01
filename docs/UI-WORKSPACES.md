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
The 87 node IDs, effects, costs, link graph and Job gates are unchanged. A checksum
regression test protects that gameplay projection. Dashed external markers are
actual adjacent nodes in other chapters; opening them only navigates. They do not
require completing the source chapter. The overview shows invested points only,
not a percent-complete meter. Search finds all nodes and opens the correct chapter.
Portrait overview rearranges the same chapters into two columns, preserving links.

### Passive stages

Nodes now have explicit `tier` and `requiresSpent` metadata. Tier I choices can be
taken immediately; deeper tiers require a configured number of Job Points already
invested in lower tiers of that same chapter. The requirement counts points, not an
exact line through the graph, so the player can mix earlier branches and leave most
nodes untouched. Profession chapters count only the selected profession's oath.

The UI shows the node stage and current/required earlier-stage investment. Existing
graph links remain visible relationships and cross-chapter navigation; they are not a
completion checklist. Character Stat Points, Job Points, the single-profession
constraint and town/Gold respec rules are unchanged. Save format stays version 2 and
previously allocated nodes remain valid.

## Mod item art

`src/ui/gemart.js` defines a shared small faceted jewel with a single-colour etched
mark. `src/ui/sigils.js` supplies fifteen distinct vector symbols. `ART.mod` uses
these drawings centrally, so the inventory, modifier list, socket presentation,
crafting and upgrades use the same item identity. There are no raster illustrations,
external requests, or per-item generated images. Muted gem tint is visual identity,
not a skill-compatibility rule. The real tag/stat rules remain visible and authoritative.

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
