# Independent skill-line hubs — owner review

Final base: `5cc2cfa9bd4c528cdfe72305c6e06da0232dcafa` (main, including PR66 models and PR67 approved VFX fixes).
Implementation started at 102ae6c and was rebased without conflicts after those releases.
Branch: `codex/skilltree-main-lines`. PR67's VFX fixes are retained unchanged.
No game data, core rules, renderer, VFX/model assets or save formats are changed.

## Result

The three family gateways are replaced by nine independent line gateways, directly
on each chapter overview: กายภาพ, ดาเมจล้วน, คริติคอล, ธาตุ, MP, ตีเร็ว,
ป้องกันและโจมตี, คล่องตัว, ล่าสมบัติ. Existing impact/support/power/guard/flow
pages remain. Hubs for chapters 2–5: 5/6/3/6 → 11/12/9/9 (20 → 41).
Branch pages: 5/6/3/6 → 11/12/9/18 (20 → 50); chapter 5's nine hubs each have
regular/mastery views, and their overview progress includes both. Chapter 1 is unchanged.

For example, `fam.weapon.3` (28 nodes) is now three display pages:
`view.physical.3`, `view.damage.3`, `view.crit.3`, with eight existing line nodes
each. All four original bridges remain; each bridge also appears on the other
endpoint's page. Bridge shortcuts name their destination, and the inspector links
to either connected line. Opening any gateway/navigation link is free.

`line-groups.js` keeps display membership separate from canonical route scope.
A `view.physical.3` purchase still plans within `fam.weapon.3`; a bridge proxy uses
its original owner, even from another family. Multi-node previews list all charged
IDs, and off-page acquisitions are called out. ALL/ANY prerequisites, links, gates,
costs and effects remain canonical. All 408 active IDs (including 30 bridges) are
reachable; all 614 stored IDs remain intact for existing saves.

## Visual criteria and evidence

Keep the full-screen parchment journal, independent overview nodes, readable names,
separate fork columns, visible bridge destinations, 44px+ touch targets, free
navigation, and working pan/pinch without accidental spending. Long portrait pages
pan vertically at a readable minimum zoom; shallow landscape pages pan horizontally.

- Before: [crowded mobile family](https://drive.google.com/file/d/18fU1yo38SedB8AZFMPf9TFRZtKoufjO0/view).
  Captured at 1f575c4; the journal source and jobtree are unchanged between that
  revision and the 102ae6c base, confirmed by git diff.
- Early runtime proof: [independent iPad overview nodes](https://drive.google.com/file/d/1ws5uQw_a9hHMkVBuSAjGj3DnjaIleOqd/view).
- Final [iPad main nodes](https://drive.google.com/file/d/1OBiZr3mKzk1hLmxQhyUFirMYsMlrcIoO/view), [mobile fork](https://drive.google.com/file/d/1fB83nWTM-5XIDyY-KibWZymgjKJRnJPE/view), and [bridge destination navigation](https://drive.google.com/file/d/1w--DWaIGPGsaCVlKxMynykllRXMgG8BR/view).
- Owner-only evidence folder: https://drive.google.com/drive/folders/1M1YeXlXt7ddweeIg9z1QFDkj_dSAUvfJ

Inspected actual rendered screenshots at desktop 1440×900, iPad viewport 1180×820
and phone 390×844, plus shallow 844×390. Initial phone back-button/bridge-toolbar
collision was fixed; caption collisions from the old three-line page are gone in
the split pages. Initial shallow layout showed too few vertical rows, so it now
uses a horizontal strip. Long page edges naturally clip while panning; remaining
nodes remain reachable. No claim of physical iPad performance or Safari execution locally.

The focused full-game capture uses the repository's `freezeScene` helper after one
real 3D frame; Game, Panels, DOM input and allocation remain live. This avoids
repeated software-GL background redraws while checking an opaque pause journal.
Static screenshots are visual evidence; assertions alone are not aesthetic proof.

## Validation

- Production build passes (existing large-chunk advisory remains).
- Core suite: 255/255 pass, including five new display/route/save tests, on the original 102ae6c base. The rebase changes models/VFX but not the journal/jobtree/core route contracts; CI repeats required full gates on the final head.
- Focused new presentation + canonical route tests: 13/13 pass again after rebasing onto 5cc2cfa.
- Existing integrated journal: Chromium iPad + phone pass.
- New focused Game+Panels browser flow: desktop/iPad/phone pass (all nine direct
  line hubs, readable columns, pan, bridge navigation, mastery, search, exact
  three-point bridge purchase, unchanged owned IDs on reopen).
- Full-game focused flow: desktop/iPad/phone pass, no page errors. Trusted Chromium touch pinch/drag and 44px+ hit targets were checked, with no accidental spending. Existing funded journal-lines traversal passes iPad and 844×390 landscape.
- Final runtime screenshots were rechecked after rebasing. The last landscape-only framing adjustment was rechecked in the actual game; other layouts are unchanged. Landscape now opens at the entry rather than the middle of the strip.
- WebKit is unavailable locally. Both Chromium and WebKit run the new focused
  flow in Seeker UI Review CI; CI status and owner review remain merge gates.

Read AGENTS.md and the visual workflow. Direct source retrieval resolved contracts;
Jev was not needed. Traced presentation → journal navigation/layout → route scope →
canonical plan/allocation → saved IDs, plus focused browser tests and Godot notes.
No merge or deployment is authorized by this draft.

## Delivered artifact identity

All images below were opened for direct pixel inspection. Pan/zoom at normal UI speed
was exercised by browser input; no continuous video or hardware FPS claim is made.
The phone/iPad bridge/fork detail captures use the same unchanged portrait/landscape-iPad
UI source as the final rebase; final overview/line captures also ran on the updated base.

- `final-ipad-overview.png` — SHA256 `2918886812cb21c0af2ba11ddcaac153b8802c8afd500a3d42de5b6e5f60cde2`
- `final-ipad-line.png` — SHA256 `9fc1c845be185222dc14d15268de4bde6d69b7730c4161ebf991b4f17d9592c1`
- `final-phone-line.png` — SHA256 `941df2bf918bec732806ec8b6cc99055fea561963b272330a01d688243060d31`
- `phone-branches.png` — SHA256 `cafe3de1638c91023fa9a3d12cbf7ad05a1b3d572b10a6afed546f200d8ff5dd`
- `ipad-bridge.png` — SHA256 `0601cf455fbf44232caf2bb5ac93fe8e919f0f1cab1ab7c32c91606d06b5c5c8`
- `final-desktop-line.png` — SHA256 `315292f3a26de189d6f04342d32ddfb2c28348835d35f7225baef005ebfc5208`
- `final-landscape-line.png` — SHA256 `cd5453487ab98d559a5ad619be195f718afb9fc0f7755d2a6259b2c8e42769c2`

Draft complete within the stated local scope. Owner/parent visual review and final-head CI/WebKit remain required; no merge or deployment has been performed.
