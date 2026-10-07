# One continuous quest journey

Source base: `1adeea36d6766a7ed4adf0c94bc5301fbfe12497` (main read before work).
Branch: `feat/continuous-quest-journey-20261007`. Draft for owner review, not merge/deploy authorization.

## What was wrong, and what changes

The previous implementation already stored one global main array and one global quest history. It did not maintain separate quest registries per city. The discontinuity came from its town-first round trip, the mandatory headland detour, discovery evaluation against the currently active map, every side quest being activated immediately, no saved player-selected tracker, and a navigation fallback to the first exit. Gate distance was presented as if it were distance to the actual objective.

This replacement separates narrative prerequisites, objective addresses and persistent journal state. Existing map geometry, spawning, combat, materials, recipes, assets and world streaming are untouched. PR80/85/89 and CI are not part of this branch.

## Story and optional missions

One journey, **13 main missions in 5 chapters**, with **11 optional missions** unlocked along that journey. The title is “เส้นทางที่เราเชื่อมถึงกัน”. The connected supply road gives the shore, outpost, forest, river and ruins a shared purpose; chapters are story beats, not map-owned quest lists.

| Chapter | Main missions in order |
| --- | --- |
| ก้าวแรกของผู้เดินทาง | `h_slimes` → `h_crabs` → `h_arrival` → `h_craft` |
| ถนนที่เชื่อมผู้คน | `h_fields` → `h_grove` → `f_road` |
| รอยเท้าที่ขวางเส้นทาง | `m_forest` → `m_greyfang` |
| ตามสายน้ำสู่ที่สูง | `s_coast` → `m_wetland` → `m_highlands` |
| คำตอบใต้ซากหิน | `m_warden` |

The new character learns on the existing shore before going into town to prepare equipment, rather than first visiting town and immediately returning to the shore. An early town/forest visit remains valid evidence when its mission becomes available. The headland mission `h_lighthouse` becomes optional; its text now accurately describes the headland waypoint, not an invented visit to the actual lighthouse. `s_coast` becomes a main step between Greyfang and the wetland. IDs retain their historical spelling even when their role changes.

Optional missions: `h_birds`, `s_mods`, `s_job`, `h_lighthouse`, `h_hermits`, `m_boars`, `s_spores`, `s_wolves`, `s_feathers`, `s_golems`, `s_collector`. Each has explicit story prerequisites. Boar, spore and wolf missions accept their defined targets on both existing maps. Other address-specific missions retain explicit map restrictions. “Progress persists across maps” does not mean every kill on any map is eligible.

All 24 live titles, descriptions and objective labels are rewritten. The 26 historical definitions remain addressable, including archived `m_craft` and `s_crabs`. They are not silently reactivated as extra rewards. Primary target counts and every numeric reward remain equal to the old data; `tests/fixtures/quest-v7-contract.json` freezes that contract. **Reward timing and the main/optional distribution intentionally change.** This is not a claim that the economic effect is unchanged or that a full new-character farm has been balanced.

Three missions have explicit independent objectives: `f_road` records the Azure forest marker and the Frontier outpost marker; Greyfang records the den and the boss defeat; Warden records the ruins and the boss defeat. Secondary exploration objectives do not create extra payouts. Recommended levels guide the player and are not unlock gates.

## Runtime contract

`src/core/quests.js` is renderer-free. `objectives[]` holds stable objective IDs, type, target, count and optional `world`/`worlds`. The old single-objective form remains supported for historical test fixtures. Top-level type/target/count fields remain for existing data tooling; the objective array is authoritative for runtime progress.

`refreshQuests` resolves prerequisites to a fixed point and reads map-qualified discovery from `progress.maps` plus the current character map. It uses `ch.worldId` when deciding which discovery list is current, so a handover frame cannot confuse an Azure town stone with a Frontier stone of the same name. It does not create a new world or run renderer logic. Old active missions remain active even if their new prerequisites precede them.

Kill/collect events are credited only to active eligible objectives, capped to their counts. One event cannot be replayed into the successor that it just unlocked. Historical unscoped lifetime totals do not invent map-qualified kill credit. Waypoint/zone discovery and existing socket/job accomplishments can satisfy a mission after it becomes available.

`refreshQuests` returns earned but unpaid IDs. The public `Game.completeQuests` boundary claims each reward once before calling the unchanged simulation payout, preventing duplicate IDs, repeated refresh and level-up re-entry from paying twice. `game-simulation.js` is unchanged. Inspection methods and journal navigation do not complete or pay missions.

## Save v8, not a progress reset

`CHARACTER_VERSION` changes from 7 to 8. `migrateCharacter` calls `migrateQuestJournal` before recording v8. New state is:

```js
progress.questJournal = { version: 1, trackedId: null };
progress.quests[id] = {
  status: 'locked' | 'active' | 'done',
  progress: 0,              // primary counter for legacy consumers
  objectives: { primary: 0 /* additional stable objective IDs */ },
  rewardClaimed: false      // explicitly set on completion/migration
};
```

The migration preserves IDs, old completed/active/partial records and historical unknown IDs. Legacy completed records are marked paid, not paid again. A legacy partial primary counter is copied only to its matching primary objective; it cannot invent completion of a new exploration objective. A completed legacy mission stays completed without forcing replay of its new secondary objective. An earned but unpaid **v8** mission survives a save/reload and is consumed once. Repeated migration is idempotent. Existing character inventory, equipment UIDs/rolls, skills, gold, levels and map discoveries retain their existing migration rules.

The pinned active mission is saved and remains pinned through crossing, return, death and reload; finishing it clears the pin and resumes automatic story tracking. Invalid/finished pins are cleared safely. Clicking chapters/tabs only changes local UI selection; the normal Panels.changed path saves an explicit pin change.

## Destination and UI contract

`quest-navigation.js` resolves the next incomplete objective using actual waypoints, rule-world encounter locations, bosses, monster drops, zone drops and global material drops. It does not build a rule/render world to open the UI. Cached addresses are invalidated when data/world references change; nearest eligible selection is a linear pass rather than a full sort every HUD update.

Routes between maps use a cycle-safe breadth-first map graph. An unavailable target is reported, not replaced by the first unrelated exit. The navigation marker may point to the next border gate, but the displayed distance is the straight-line world-coordinate distance to the final destination. It is labelled as approximate straight-line distance in the journal; it is not a navmesh walking-distance promise. Quest navigation never moves the hero, camera or seam.

The quest-specific parchment journal has five chapter bookmarks, current/next objectives, optional missions, history, per-objective area labels, recommended levels and pin/automatic-story controls. It uses existing artwork. Styling is scoped to `.quest-journey`, leaving the passive tree journal and other panels alone. On small screens chapter bookmarks scroll horizontally inside their own container, the introduction collapses, and controls retain 44px minimum height. Skill/job objectives open their existing menu, not a fake spatial target.

HUD and Atlas retain the `questTarget` x/z contract through the new resolver. The tracker now displays aggregate objective counts and the next incomplete objective. No spawn, collision, travel permission, monster reset/RNG, renderer quality or performance-code change is included.

## Godot port addendum (supersedes older quest/save rows)

For this branch, this section supersedes the historical version-4/7 and quest rows in `GODOT-PORT.md`; unrelated rendering/physics guidance there still applies.

Translate `quests.js` into the existing Quests service and `quest-navigation.js` into a rule-only destination resolver. Store v8 journal/objective/claim fields in the Character Dictionary/Resource and apply the same legacy migration. Feed committed gameplay events once and pass their map ID. Read current and stored map discovery by qualified ID. Claim before invoking the existing reward code; no reward action belongs in Control rendering. Preserve existing Game composition rather than introducing a second simulation loop.

Godot UI maps chapter selection to UI-local state, mission pinning to character state, and next-gate arrows to local presentation coordinates. Distance uses atlas world coordinates. Port the same tests for same-named stones, crossing-frame map identity, multi-objective partials, reward replay and legacy unknown IDs. No save wipe or new world format is required.

## Executed validation and limits

Local validation uses current relevant source files checked against Git blob hashes, recovered source/data plus exact-current overlays. Direct clone was unavailable. **This is not a full current-main checkout/build or full regression pass.** No old build's performance or UI checks are transferred to this patch.

- 30 new quest tests pass, including a scripted full 13-mission sequence with save/reload after every step, actual rule-world crossing, map-qualified evidence, old-format fixtures, save preservation, pinning, read-only UI and exactly-once rewards.
- 10 existing map tests pass with only the affected quest-order setup adapted. All crossing, wrong-map credit and preservation assertions remain.
- Three relevant current harbor scenarios pass as extracted unchanged test bodies with their imports/fixture setup adapted to the local source subset. This is **not** the complete harbor suite. The committed harbor file retains every unrelated test and updates only the new initial quest, early-town-visit expectation and current-v8 layout-only fixture.
- Total executed: **43 tests, zero failed/skipped/cancelled**. The scripted quest sequence supplies events/discovery evidence; it is not a combat win-rate or real farming walkthrough.
- An isolated **Chromium** review executes the production pure Game, journal component and shared click handler in desktop 1440×1000, iPad-size 1180×820 touch, phone 390×844 touch and phone-landscape 844×390 touch. All four pass: no page errors, expected click/tap and pin behavior, actual original PNG loading, no horizontal document overflow. The local adapter serializes a snapshot for its save callback; it does not claim browser localStorage or native Continue coverage.
- Screenshots are labelled isolated component, not full Panels/game/3D. Reviewed iPad cross-map and phone start views. An overflowing nested weapon icon was fixed; mobile chapter navigation and header height were then reduced and the exact final screenshots recaptured. Physical iPad, Safari/WebKit, integrated game HUD/Atlas styling, full build and normal CI remain separate acceptance steps.

Reproduce in a complete source checkout:

```sh
node --test tests/core/quest-journey.test.js tests/core/maps.test.js tests/core/harbor.test.js
npm run build
# Then use existing desktop/iPad smoke, UX and open-world checks, without increasing timeouts.
```

No workflow, timeout, benchmark service, shared host or deployment was modified. Keep the PR draft until integrated visual/save/travel checks and owner review are complete.
