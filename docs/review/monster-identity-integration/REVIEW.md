# Integrated pixel review, 2026-10-07

Reviewed the owner-approved individual exports and their actual rendered use
on desktop 1440×960 and iPad viewport 1180×820, in Chromium/SwiftShader.
`browser-report.json` records the exact served eight PNG hashes, screenshot
hashes, viewport sizes and observed labels. All 18 generated runtime captures
were inspected; eight representative captures are retained here. Reproduce the
complete set with `CHROMIUM_EXECUTABLE=/usr/bin/chromium node
tests/browser/monster-identity.mjs` after building.

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
The deterministic journal rebuild also passes.

PR106 remains the model dependency. These screenshots use the current main
models behind paused menus; this patch imports no models and does not claim
to review PR106's integrated 3D animation. Reconcile and repeat affected checks
after its merge before releasing the follow-up PR. Local WebKit is unavailable;
required release CI must supply that check. No physical iPad/Safari or FPS
result is claimed. No blocking visible defect was found in this approved UI
identity batch.
