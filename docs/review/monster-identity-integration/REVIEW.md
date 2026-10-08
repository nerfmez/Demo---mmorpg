# Integrated pixel review, 2026-10-07

Refreshed after PR106's merge: reviewed the owner-approved individual exports
and their actual rendered use
on desktop 1440×960 and iPad viewport 1180×820, in Chromium/SwiftShader.
`browser-report.json` records the exact served eight PNG hashes, screenshot
hashes, viewport sizes and observed labels. All 18 generated runtime captures
were inspected; eight representative captures are retained here. Reproduce the
complete set with `CHROMIUM_EXECUTABLE=/usr/bin/chromium node
tests/browser/monster-identity.mjs` after building.

Exact runtime source: recovered patch `340fc17363f1ad1a5dc96b3887f95791c31a792b`,
based on post-PR106 main `3225b3cdc8bff2909b4ce6297f683f4e01f899b1`.
Capture run began at 15:57:31 UTC on 2026-10-07; each of the 18 final screenshots
was opened as pixels after capture, through 16:02 UTC. Model definitions hash:
`be8feacb2a2de43bce8db61dda271bbce615b030f146772a94a2ad6c74c8fb5d`.
Recovery follow-up `4a76d2f` updates evidence and capture metadata only; later
follow-ups change tests, CI registration and this record. Runtime data, UI,
approved assets and all main models remain the tested bytes.

Acceptance criteria: recognize the approved six concepts at their existing
footprints; retain the journal's subdued painted style and inventory's isolated
item shapes; show one consistent portrait and Thai label through each affected
menu; avoid matte backgrounds, crop clipping, neighbouring fragments and page
overflow. Existing layout, gameplay, quantities and unrelated approved art stay
unchanged. Source concept inspection and the earlier cream/dark, alpha and small
icon reviews are retained in approved preview commit
`0e782d8d4d7a8aa7498c8a79c899bdd5734f5dc9`.

## Visible result

- The six silhouettes retain the wave/foam, broad boar horns, two masked wolf
  faces with a wider alpha mane, coiled reed snake and blue wisp with one gold
  torso core. The 50px journal portraits are readable against the dark panel;
  the cream quest cards also preserve their painted edges.
- Greyfang's shared boss portrait remains inside the original 24px map marker.
  The cream facial mask carries recognition at this size, while fine fur detail
  softens. Other boss artwork and all location paintings remain unchanged.
- The 30px material-source pictures match their journal portraits. The new
  reed scale and gold wisp crystal remain distinct in dark inventory/ingredient
  cells and the cream detail dialog. No opaque matte, torn transparent edge,
  asset clipping or neighbouring batch fragment was observed.
- Full material names appear in the selected summary and details. Existing
  compact bag tiles shorten long names with ellipses; no layout sizing changed.
  The existing detail stack badge is pale on cream, while the ordinary quantity
  line is readable. Neither observation is introduced by the new PNGs.
- Recipe ingredient names and quantities render correctly, including both
  single and batch cost instances. Quest descriptions/objectives use the
  approved monster names; the boar quest now refers to horns. The iPad journal
  requires normal vertical scrolling to see a whole card and the next card.

## Evidence and limits

Representative views: [boss map](captures/desktop-atlas-boss.png),
[wolves](captures/ipad-atlas-wolves.png),
[wisp and viper](captures/ipad-atlas-wetland.png),
[bag](captures/ipad-bag.png),
[material source](captures/ipad-material-source.png),
[recipe costs](captures/ipad-craft.png),
[slime quest](captures/ipad-quest-slime.png), and
[boar/wolf quests](captures/desktop-quest-optional.png).

Focused runtime verification passes in both viewports: 17 region controls,
all six approved portraits, all ten material-source details, five changed
material labels in recipe costs and three changed quest cards. All eight
served images match their approved hashes. Zero page exceptions, failed icon
responses or page overflow. The scoped core/data/quest/save checks pass (50
tests), and the production build passes with its existing bundle-size warning.
The deterministic journal rebuild passed during original preparation; its
script, source assets and generated runtime bytes are retained exactly.

PR106 merged at 14:31 UTC; its merge dependency is satisfied. These refreshed
screenshots use post-PR106 main models behind paused menus. This patch preserves
all models and does not claim a new 3D-animation review. No new visual defect
was found in the approved UI identity batch; the existing pale cream map heading
and detail stack badge remain outside this patch. Local checks use Chromium;
required release CI must supply WebKit. No physical iPad/Safari or FPS result is
claimed. PR106's separate deployment setup failure is not an integration gate.
Draft PR111 is ready for parent release review within these stated limits;
no merge or deployment was performed.

## CI assertion follow-up

[CI run 37649015901](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37649015901)
on `4a76d2f` failed in the full core suite: `presentation.test.js` treated the
six shared PNG portraits as SVGs because it consulted only `RASTER_ICONS`.
The failure was reproduced locally. CI build and browser execution were skipped
after that core failure; the preceding build/browser results are local evidence.
This is separate from the WebKit setup issue.

The assertion now consults `SHARED_MONSTER_PORTRAITS` for monsters and requires
exactly the six approved IDs. It checks each registered PNG path, preserves
category coverage and distinct active artwork, requires distinct retained SVG
fallbacks for every monster, and keeps SVG rendering checks for unregistered IDs.
No assertion is skipped and no runtime, art, model or CI file changes.

Before the single follow-up push, full `npm test` passed: **395 tests, 0 failures,
0 skipped**, in about 70 seconds. The prior build and 18 visually inspected
captures remain applicable to the identical runtime bytes. New CI is pending;
the draft remains unmerged and undeployed.

## Focused CI registration follow-up

`monster-identity.mjs` now has one dedicated `monster-identity` owner in the CI
inventory and scheduler. Its affected test-file route selects boot plus this
suite; full/manual plans and this PR's data/shared-art changes include it.
The UI owner also requires both-engine evidence on a distinct merge tree.
The existing desktop/iPad touch checks, approved hashes, label checks, captures
and failure assertions remain byte-identical to `6c87141`.

Engine ownership rejects a Chromium-only launch as WebKit evidence. Contracts
verify both Chromium/WebKit jobs, runner engine forwarding, exact-source reports
and one execution owner. Full evidence pagination now derives the 52 browser
jobs' 105 artifacts from the inventory and still tests second-page build reuse
and malformed-page rejection. No workflow or browser setup changes.

`npm run test:tools` passes: **154 tests, 0 failures, 0 skipped**. These are CI
planner/runner contracts; the actual focused WebKit UI run remains pending new
CI. The existing local Chromium visual evidence and 395-core-test pass are
retained for the unchanged runtime. PR111 remains draft; PR112 stays closed.
No merge or deployment was performed.

## Post-PR109 refresh

PR111's existing head `c6e0bbba72d7b929fb9e7705221f2113ba7aede6` incorporates
main `11e1f3020500a8236de215fa342a96e49f8fbd6e` without conflicts. PR109's pinned
Playwright container setup and weapon GPU completion checks are retained exactly.
The six portraits, two material images, all 30 approved label fields, runtime
sources and dedicated identity suite/registration remain byte-identical to the
previous PR111 head. Preservation was rechecked against the new main: all 168
other icons, models, recipes, gameplay sources and workflow files match it.

The prior pixel captures remain historical evidence at their recorded source;
they have not been relabelled as a new browser attempt. Before pushing, all 54
focused core/data/quest/save/presentation tests and all 160 tooling tests passed
with no failures or skips. The production build passed with its existing bundle
size warning. CI owns the complete new Chromium/WebKit
attempt, including identity UI evidence. No partial browser rerun is requested.
PR111 stays draft and unmerged; PR112 stays closed. Pages release `37711788822`
remains under parent coordination.
