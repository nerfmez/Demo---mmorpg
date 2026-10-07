# Dedicated crafting and equipment workshop — draft review

Base: `380e3b077d422e968e0d8558e0cbdf255f9a8211` (current main, quest PR94).
Branch: `feat/dedicated-workshop-20261007`. Owner review before merge/deploy.
Quest PR94 is incorporated through a merge of main; both workshop and quest action handlers
are retained. No CI, core, data or renderer changes were added by the strike revision.

## Scope and design

The equipment detail in the bag now links to a dedicated full-screen workshop.
`craft` opens the recipe library; `forge` opens the owned-equipment workspace.
Both use the same navigation: crafting, enhancement (+N), grade promotion.
The menu keeps its five groups and adds one forge tile to the existing items group.

Selection is on the left; the existing item artwork, before/after stats and wear
requirements are in the centre; material amounts, shortfalls and confirmation are
on the right. On smaller screens columns stack; the item list stays bounded and
filters can scroll horizontally inside their own strip. No icon/art assets change.
Craft recipes retain canonical level ordering, skill-mechanic stages, search and
craftable filtering. Advanced repeat crafting remains available in a disclosure.
Recent crafted results link to the bag and to the exact item UID in the forge.

Grade and +N are independent. Enhancement compares actual item stats. Promotion
compares base stats only and explicitly describes the new random option slots;
it does not pretend to know random future affixes. Existing option values are kept.
The page shows unmet requirements and warns about items automatically put in the
bag by existing equipment rules. A locked-against-sale item is not newly forbidden
from enhancement. Maxed items, empty categories and stale/deleted UIDs are handled.

## Rule and lifetime boundary

`workshop-model.js` is a UI adapter over unchanged `core/crafting.js`,
`core/character.js` and `core/craft-order.js`. There is no new price, chance, recipe,
stat, reward, prerequisite, UID allocator or save schema. Arrow crafting retains
its own combat/cap rules and does not receive a duplicate craft quest event.
Batch crafting calls the existing stop-condition algorithm and retains every result.

The controller synchronously checks the current service, calls the existing core
command, then invokes `Panels.changed()` (refresh and existing save callback).
Only the visual result lasts 900 ms (300 ms in reduced-motion mode). The one-strike
CSS animation is 850 ms (240 ms in reduced motion). Animation callbacks cannot pay, roll, mutate gear or award
quests. Rapid requests while busy are refused. Closing/switching/skip invalidates
the timer token; already committed inventory and the last receipt survive. No
promise rejection or real rule/save exception is swallowed. Receipt/timer/selection
state belongs to the Panels instance and never enters the character save.

## Integration and affected checks

- Panels creates one controller and mounts the workshop on `craft` / `forge`.
- Bag links carry `forge-open`, mode and UID; opening does not spend.
- Existing craft/equipment actions are intercepted by the workshop controller.
- Existing `upgrade-materials.mjs` opens the new page from the real bag, retains its
  stone-payment checks, and calls `workshop-checks.mjs` with real Game/Panels.
- `wearable-level.mjs` checks unchanged level requirements on the new grade page
  rather than the removed upgrade block in the bag. Payment/equip checks remain.
- `menu-hub.mjs` checks 13 tiles, the new forge page and its three navigation modes.
- No workflow, timeout, bypass or skip condition was added or relaxed.

The merge of main conflicted only at the action-dispatch hook in Panels. Both
`workshop.handle` and `handleQuestJournalAction` remain; the journal view/import is
the current-main version. The diff against main contains workshop hooks only.

## Strike revision and executed evidence (2026-10-07)

The custom workshop hammer has a readable flat striking face. It lifts up/back
for 323 ms, accelerates diagonally downward for 119 ms, holds at contact for 51 ms,
then recoils lightly for 102 ms and fades. The face lands at the same pedestal
point as the effects: 50% / 78 px. It does not continue through the workpiece.

At contact only, eight short metallic sparks travel at most 44 px, a white-orange
flash lasts 68 ms, and a small elliptical impact ring fades within 145 ms. There
is no rotating ornament, continuous flare or full-stage glow. Reduced motion
keeps a 14 px hammer-down movement and a smaller 53 ms flash; particles, ring and
item movement are disabled. This remains CSS presentation. The only controller
change extends reduced-motion feedback from 80 to 300 ms so the 240 ms hit reads.

Executed checks:

- `node --test tests/core/workshop.test.js tests/core/crafting.test.js tests/core/quest-journey.test.js`: **63/63 passed**, no failures/skips. Includes exact payment/command equivalence, seeded RNG, normal/reduced repeated requests, skip/close/reopen, stale timer not unlocking a later operation, receipt/UID/event/save preservation.
- `npm run build`: passed; existing large-chunk warning remains.
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/upgrade-materials.mjs`: passed desktop and iPad-sized, with real Game/Panels payments, workshop lifecycle and service/save checks.
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/wearable-level.mjs`: passed desktop, iPad-sized and phone; under-level crafting, fixed-level upgrades and equipment preservation.
- `tests/browser/workshop-motion.mjs`: passed iPad-sized 1180×820, phone landscape 844×390 and reduced-motion 1180×820 using real Game/Panels without the 3D renderer. Repeated taps, close/back/reopen, no craft reroll, receipt preservation, no horizontal overflow, no page errors or missing assets.
- `tests/browser/workshop-game.mjs`: passed the same three views in the built game. The WebGL world and imported region initialized and were captured; the existing `freezeScene` helper then held the completed frame for paused UI review. Simulation stays paused, repeated taps pay once and finish/close/reopen retains state. No page errors or horizontal overflow. This is Chromium SwiftShader viewport emulation, not physical iPad testing or a performance result.
- Syntax checks for the two changed production JS files and two new browser scripts, and `git diff --check`: passed.
- `tests/browser/menu-hub.mjs`: passed iPad-sized, phone landscape and phone portrait after the integration follow-up below. The five-group iPad fit assertion remains unchanged.
- **Blocked:** WebKit launch: browser executable `webkit-2215/pw_run.sh` is absent. Physical iPad/Safari and broad full-game regression were not run.

The two focused capture scripts accept `EVIDENCE_DIR`. The motion script also
accepts `CAPTURE_TAG` and `CAPTURE_ONLY=1` for baseline capture. Videos are recorded
in real wall-clock time; diagnostic stills separately freeze the production CSS
at authored transition times. Frozen diagnostic frames are excluded from the
short delivered motion excerpts.

## Visual review record

Baseline animation source: PR95 `b7daae4cfc94ff4d501d0ada07394622cf147e5f`,
recaptured after merging main at `d8902934f1ba7b6b04df5dcd1c249abead165d90`.
Final source and exact delivered artifact hashes are recorded in the evidence
manifest and PR body. No core/data/payment/odds/stat changes are introduced.

Criteria: slower lift, accelerating downward hit, visible contact stop and light
recoil; 6–12 metallic sparks only at contact; short local flash/ring; item, stats
and controls remain readable; reduced motion still communicates a hit without
orbit/particles; cancellation never controls the committed result.

Inspected exact after-artifact stage stills at 0/150/320/400/442/470/530/700 ms,
reduced-motion 0/70/100/140/200 ms, full iPad/landscape screenshots and built-game
impact/results. Inspected sampled sequential frames from original-speed MP4s
(12 fps normal detail and 16 fps reduced sample). Observed the lift above/right,
face arrested at contact, small recoil, local flash and short sparks with no UI
occlusion. The static decorative rings remain stationary. Landscape uses vertical
scrolling; it is not claimed to fit all controls in one screen.

Found/fixed: the prior hammer swept through and the old reduced-motion mode hid
all hit feedback. The new face/contact stop and reduced hit address both in the
sampled frames. An early capture loaded legacy CSS after workshop CSS, causing an
incorrect dark layout; capture CSS order was corrected and both before/after were
recaptured. The first built-game harness checked `__frontier.paused`, while real
pause also depends on `panels.isOpen`; it now checks the open panel and unchanged
simulation time, and the final run passes.

**Ready for owner visual review within these limits, still draft/unmerged.**
Continuous normal-speed playback inspection is unavailable in this execution
environment. Original-speed video is delivered for owner playback; sampled frames
cannot certify smooth motion by themselves. No physical iPad, Safari/WebKit or
hardware FPS claim is made. Owner motion approval and outstanding CI results remain
premerge review items. No merge or deployment was performed.

## Workshop integration follow-up (2026-10-07)

Inspected the original PR run `37569141512` and the motion-head boot log rather
than assuming test failures. Workshop adds the thirteenth tile; boot and UX had
still expected twelve. Their counts now match the real hub. Arrow and UX recipes
use the existing action/id selectors instead of the removed `.recipe-pick` class.
UX goes back through the visible hub when leaving the workshop, whose dedicated
navigation intentionally hides the old sidebar. Quest journal assertions remain.

The actual tablet hub had 627 px of content in a 611 px body. Reducing only the
items-group header/bottom/gap spacing by 20 px fits its fourth tile while keeping
58 px touch targets, full-width labels and all five groups. The final screenshot
was inspected after the real startup-ready gate; no fit assertion was relaxed.

Equipment details now link to the workshop rather than embedding upgrade costs.
Both touch suites follow that real link and assert the selected UID, unchanged
character on opening, the same stone/gold costs, one upgrade/payment, and disabled
actions away from the workbench. A valid five-option S item preserves native touch
overflow coverage; the >50 px swipe and reachable-close assertions remain. Closing
the loadout workspace now removes its old details dialog, preventing a hidden
backdrop from surviving the workshop transition.

Follow-up checks on Chromium `/usr/bin/chromium`:

- `details-touch.mjs`: passed 1180×820 and 844×390, native swipe plus repeated bag/equipped/crafted entry, costs/payment and away-from-bench checks.
- `details-game-touch.mjs`: passed both sizes with the real document touch guard, native swipe, clean dialog transfer and exact payment. The initialized WebGL background was held with the existing UI capture helper.
- `menu-hub.mjs`: passed all three touch layouts, thirteen tiles, five-group iPad fit, group navigation and workshop modes. No timeout changes.
- `QUICK=1 ux.mjs`: passed iPad-sized; includes current Quest journal artwork/state assertions, real craft/equip/mod actions, service checks and interrupted input. Other UX viewports are left to CI; this is not a full UX-suite pass.
- `gear-hands.mjs`: every equipment/arrow-craft/drop assertion reached completion; the final console-error assertion failed with one 404. A separate resource probe identified the missing `/favicon.ico` URL. This unrelated baseline asset was not changed or ignored; the full suite is reported failed.
- `boot.mjs`: local run timed out clicking the title-screen start button before reaching the tile assertion. The motion-head CI log independently confirmed the 13-versus-12 failure; the expectation is repaired, but local boot is not claimed passed.
- Build, changed JS syntax and whitespace checks passed. No workflow, bypass, timeout or unrelated gameplay feature was changed.

Motion evidence was captured at `bf1929153d533859f26bca0823105c3cec735109`;
the follow-up does not change the hammer, effects or controller. The delivery
manifest records the final integration head separately. Library confirms the
before/after images, original-speed clips, reduced-motion sample and built-game
viewport images; exact file identities are in the delivery receipt.

## Reproduction / Godot handoff

In a full checkout with dependencies and assets:

```sh
node --test tests/core/workshop.test.js
npm run build
node tests/browser/upgrade-materials.mjs
BROWSER=webkit node tests/browser/upgrade-materials.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/workshop-motion.mjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/workshop-game.mjs
node tests/browser/menu-hub.mjs
node tests/browser/wearable-level.mjs
```

For a Godot port, retain existing crafting/payment/equip rules. Implement a UI-owned
receipt and cancellable cosmetic timer. Commit the command and save before starting
the animation; never reroll or refund solely because the panel closed. Reuse the
same level and role comparators. No character migration or gameplay port change is
introduced by this patch. Do not merge/deploy before the owner authorizes it.
