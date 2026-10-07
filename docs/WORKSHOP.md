# Dedicated crafting and equipment workshop — draft review

Base: `1adeea36d6766a7ed4adf0c94bc5301fbfe12497`.
Branch: `feat/dedicated-workshop-20261007`. Owner review before merge/deploy.
Quest PR94 and renderer/open-world/CI work are not incorporated.

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
Only the visual result lasts 900 ms (80 ms in reduced-motion mode). The one-strike
CSS animation is 850 ms. Animation callbacks cannot pay, roll, mutate gear or award
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

PR94 modifies the quest import/render/action area of Panels. This patch modifies
workshop imports, lifecycle and craft/forge rendering only; review the eventual
merge together instead of overwriting either full file from an older snapshot.

## Executed evidence

17 focused Node tests pass, zero failures/skips, using actual current-main data,
character/crafting/RNG modules and a small service/event adapter. They cover preview
purity, normal command equivalence, promotion preservation, duplicate commands,
closing and stale callbacks, exact material/gold deduction, batch stop conditions,
arrow cap/combat/event handling, learning, stable ordering and UID identity.

Offline Chromium component checks passed desktop 1440x900, iPad-sized 1180x820,
phone landscape 844x390, portrait 390x844, plus reduced motion. The actual workshop
view/controller and character/crafting modules run with a local scene/service and
panel-action adapter, original existing PNGs and the existing global CSS. No page
errors, missing images or horizontal document overflow occurred. These are NOT
full Game/Panels-constructor, WebGL, Safari or physical-iPad acceptance results.

JavaScript syntax and diff whitespace checks were run. The baseline UI files and
three modified existing browser scripts were verified by Git blob against main.
The local workspace is a recovered source subset, not a complete Vite checkout.
Full source build and the updated real-Game browser suites remain pending; do not
attribute component passes to those suites. No FPS claim is made for a menu change.

## Visual review record

Acceptance: item identity and operation are obvious; +N differs from grade; before/
after and shortfalls are readable; one clear confirmation; touch targets at least
44 px; content remains scrollable without horizontal document overflow; a short
non-flashing anticipation/strike/reveal does not conceal or determine a payment.

Reviewed the final iPad upgrade-before, upgrade-after, craft-detail and grade
screenshots; portrait upgrade-before; landscape craft-detail; and a 5 fps contact
sheet of the original-speed motion recording (0.0–3.0 s). Delivery includes a
normal-speed MP4 excerpt with no time remapping; continuous playback and physical
hardware review are NOT claimed. Hashes and exact filenames are in the evidence
manifest alongside the unmodified screenshot bytes.

Found and fixed: inherited sidebar gutter on full-screen pages; dark old search
field styling; very light old heading colours; missing preview image in an early
capture taken before image decoding; the old header's gold value in the local
adapter. Final capture explicitly waits for image/font readiness. UI review does
not certify the full-game surrounding integration. Portrait requires vertical
scrolling through selection, preview and materials; it is not claimed to fit one
screen. Physical-device readability and owner motion preference remain review items.

## Reproduction / Godot handoff

In a full checkout with dependencies and assets:

```sh
node --test tests/core/workshop.test.js
npm run build
node tests/browser/upgrade-materials.mjs
BROWSER=webkit node tests/browser/upgrade-materials.mjs
node tests/browser/menu-hub.mjs
node tests/browser/wearable-level.mjs
```

For a Godot port, retain existing crafting/payment/equip rules. Implement a UI-owned
receipt and cancellable cosmetic timer. Commit the command and save before starting
the animation; never reroll or refund solely because the panel closed. Reuse the
same level and role comparators. No character migration or gameplay port change is
introduced by this patch. Do not merge/deploy before the owner authorizes it.
