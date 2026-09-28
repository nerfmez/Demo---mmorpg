# Seeker build workspaces

## Player-facing changes

The build UI is now separated into **combat loadout**, **modifier management**, **movement**, **material upgrades**, and **passive paths**. The inventory, crafting, quests, map, settings, and Character Stat page retain their separate responsibilities. Desktop/tablet use a persistent rail; narrow portrait phones use a native page selector, leaving room for the task itself. Inspection does not allocate, socket, or spend materials.

The passive tree opens on ten categories: foundation, melee, projectile, area, lasting damage/fields, control, protection/healing, summons, movement/cadence, and specialization. Specialization has four separate subviews. The graph still uses the actual `links` from `data/jobtree.json`. Cross-category connections are marked ↗ and listed in the selected-node panel; the shortest route can take the player to the next prerequisite without spending points. Small nodes have smaller discs, but separate >=44px hit targets at every supported zoom. Node labels retain readable text size while zooming out.

There are 87 nodes: the original 61 IDs, effects and links are retained; 23 optional small stat nodes and 3 notables were added. Existing original nodes can acquire extra links to new optional branches. New flat HP/MP/attack/magic/defense nodes spend **Job Points**, not Character **Stat Points**. There are no new STR/INT requirement bonuses. Save version remains 2. Job level gates, only-one-job restrictions, and respec gold rules remain in core logic.

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
node tests/browser/workspaces.mjs
BROWSER=webkit node tests/browser/workspaces.mjs
npm run test:browser
npm run test:ux
```

`tests/browser/workspaces.mjs` uses real controls at 1440x960, 1180x820 touch, 844x390 touch and 390x844 touch. It covers category/branch browsing, inspection versus allocation, search/jump, native skill tags, modifier incompatibility, socketing, movement selection, upgrade-page rendering, clipping and page errors. Screenshots and reports are written under `tests/browser/out/workspaces-<browser>/`. The shared `passive-checks.mjs` also verifies cross-category prerequisites, one-Job restrictions, route navigation without spending, drag/cancel and native Chromium two-finger pinch. Both this suite and the deployment Dreamloop use the shared checks so the live audit stays aligned with the new UI.

For a runtime without local HTTP browser access, `OFFLINE_UI=1 CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/workspaces.mjs` bundles the real Game and Panels into an offline harness. This checks the actual UI/core, not the full 3D renderer or hardware FPS. Full-game Chromium/WebKit checks must still run in CI. Fonts stay local/bundled by the existing app; no dependency archive is a user deliverable.
