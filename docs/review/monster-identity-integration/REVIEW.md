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
The final follow-up commit updates evidence and capture metadata only; runtime
data, UI, approved assets and all main models remain the tested bytes.

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
