# PR125 targeted CI correction

Integrated main `fc776206092c7399f8b1f49c6e11440da1078bed` (PR126) into
`codex/blender-landmarks-minimal-ui-20261008`, whose previous head was
`4be54c543e94cfe9353340d521311996b8707af5`. The merge had no conflicts. This is
a normal merge commit and push to the existing draft PR, without force push,
PR merge, deployment or CI/review polling.

## Preservation and changed scope

- All 39 landmark source/export/texture/manifest/README files match the previous
  accepted artifact hashes byte for byte. The accepted tree and crystal are intact.
- There are no new changes to `src/ui`, `src/core`, `data`, landmark sources or
  game exports. Continuous inventory, inactive red precedence, compact panels,
  career captions, High graphics and save behavior retain the previous source.
- Main's build queue, ground and terrain-domain files are byte-identical to
  `fc776206`. Region assembly incorporates main's coastal domain argument in both
  water paths while retaining the queued landmark loading/shader/disposal path.
  PR124 asynchronous work and PR126 GPU-resume scheduling are preserved.
- Apart from inherited main changes, authored changes are browser checks and two
  shared test helpers. One extra trailing blank line in main's coastal repair
  document was removed for the whitespace check.

## Test corrections

`journal-controls.mjs` selects visible chapter controls, or the visible native
footer navigation when the rail is hidden, and asserts the snapshot tier. Branch
coverage traverses real pagination, checks the entire data-owned group set
(explicitly including impact/support), and verifies navigation never spends points.
No forced clicks or hidden-element bypasses are used.

The journal harness now follows production CSS order, including `compact.css`,
loadout styles and the actual fonts. Journal checks positively assert margins,
at least 12% area outside the panel, reachable 44 px controls, portrait pane
switching, rotation and preserved modifier state. Learning, point spending,
compiler effects and crafting assertions remain. The modifier library check
checks every owned UID rather than the obsolete first-page count of 15.

The motion check retains target-size, overlap, learning, gesture, audio and
motion assertions. Where bounded portrait/short-landscape cannot show all six
nodes simultaneously at readable zoom, it checks each whole node and caption
using native pan/zoom and inspection. Audio sampling starts before the native
gesture so WebKit protocol latency does not miss the short actual rustle; the
same real analyser threshold of `>.002` remains.

`game-ui-ready.mjs` waits for models, simulation and the actual loading-card gate
before journal/workspace inputs, with the existing 60-second timeout. Failure
diagnostics retain real queue/import/context state. The weapon reload retains
its 90-second timeout and gains diagnostics specifically before Continue.

Inventory scrolling uses incremental native mouse wheel input on desktop.
Mobile WebKit uses the focusable region's supported native PageDown/End keys,
followed by touch taps. It never assigns `scrollTop` in the check. Bottom-row
position, last-item selection, details, equip, filters, categories, pane return
and reopen assertions remain. **This proves keyboard scrolling plus touch
actions in mobile emulation, not a physical Safari finger swipe.**

## Targeted technical results

No unrelated browser suites or full core suite were run. Browser UI cases that
already passed unaffected assertions were reused across focused corrections;
those are not described as a single final-source full-suite run.

| Check | Result and practical scope |
| --- | --- |
| Production build | PASS; `main-BukqDVVf.js` / `main-D4oOXd4z.css`. Existing large-chunk warning remains. |
| Integration-affected core/render checks | PASS, 78 tests in 11 files, no failures/skips: frame-build-queue, startup-scheduling, grass-bake-lifetime, region-build-lifetime, region-shader-preparation, startup-drawing, startup-ready-contract, seam-continuity, world, maps and coastal-seam. |
| Syntax / whitespace / identity | PASS for eight authored browser files, staged diff, 39 unchanged assets and four exact main files. |
| Journal-motion / `skill-journal`, Chromium | All five UI-harness sizes have positive results across focused runs: desktop, iPad, portrait, landscape and reduced motion. Desktop/iPad/portrait used system Chromium 151; final landscape/reduced checks used Playwright Chromium 141. Earlier unaffected cases were reused. |
| Journal-motion / `skill-journal`, WebKit | All five UI-harness sizes have positive results across focused runs with WebKit 2215. Earlier desktop/iPad/portrait results were reused; final landscape/reduced checks passed with the pre-gesture audio sampler. |
| Journal, full game, Chromium | FAIL at 60-second startup gate before UI assertions. At that deadline `__frontier`/view had not been exposed; `modelsReady=false`. Cause unconfirmed. |
| Journal, full game, WebKit | FAIL at 60-second startup gate before UI assertions. Static region ready; imports loading; `city.preload-assembly` suspended at 468 steps; context not lost. |
| Journal, production-style UI fallback | PASS at all four sizes in both browsers, including portrait pane switching/rotation and real learning/mod compiler assertions. Chromium cases were assembled from a four-case run and corrected portrait-only recheck. This is real Game/Panels without the renderer, not a full-game pass. |
| Journal-lines, Chromium 141 | iPad PASS through native chapter/path controls and real purchases: 39 learned, zero points left, damage 35, bridge false. Next phone-landscape case FAIL at 60-second startup, before UI assertions. Suite incomplete. |
| Journal-lines, WebKit | FAIL at first iPad 60-second startup wait, before UI assertions. Suite incomplete. |
| Workspaces, real-game WebKit | FAIL at first desktop 60-second startup gate, before encounter/workspace assertions. Static region ready; imports loading; `city.preload-assembly` suspended at 284 steps; context not lost. |
| Existing workspace inventory helper, WebKit UI fallback | PASS at 1440×960, 1180×820, 844×390 and 390×844. Desktop native wheel; mobile native PageDown/End plus touch taps. Final row, details/equip, filters/categories, portrait panes and reopen checked. This focused fallback does not certify the full encounter/world workspace flow. |
| Open-world, original check, Chromium 141 | FAIL at original 420-second first Frontier readiness wait. See diagnosis below; no timeout/assertion changes. |
| Open-world, original check, system Chromium 151 | Crossing/atlas/eviction/rebuild assertions completed, including disposal/restoration of 16 wreck buffers; overall FAIL at final console-errors assertion on one HTTP 404. Its URL was not recorded, so it is not dismissed as a favicon error. This is not a passing CI-browser run. |
| Weapon-models, original full check, Chromium 141 | PASS: all 38 exact geometry checks, grip/ammo/action/viewport checks, stable resources and actual saved-slot reload/Continue. Models ready before Continue at 82,457 ms within the original 90-second wait. Reload/Continue total 100,331 ms. No page/console errors. |
| One focused WebKit main/branch startup comparison | Both PASS using the same original 60-second readiness predicate, sequentially with no other full-game browser test running: main 61,043 ms and integrated PR125 60,272 ms total including navigation. Both imported-ready, no context loss, page errors or request failures. These elapsed totals are not the wait timeout. |

The earlier full-game loading failures occurred while other software-rendered
browser checks were active. The single focused comparison did not reproduce
them on either main or this branch. It does not establish a branch-specific
cause or guarantee every viewport/suite can load; the incomplete runs above
remain incomplete. No indefinite startup retries were performed.

Chromium 141 is Playwright's pinned headless shell (1194); system Chromium 151
results are explicitly distinguished. WebKit used the existing 2215 binary and
existing local shared libraries. All required libraries were verified loadable;
the static host `ldconfig` check was bypassed because it cannot see that local
library path. No behavioral assertion was disabled.

## Remaining open-world evidence

At the Chromium 141 deadline, Azure remained active at `[-60,-92]`. Queue stats
were 2,233 slices / 992,140 steps, maximum step 430.7 ms. Frontier was not ready:
job `waiting`, not cancelled, 456,603 steps / 7,900.7 ms recorded CPU work.
Moonroot had completed successfully. There were no reported JavaScript/console
errors. The existing queue contract makes `waiting` an unsettled yielded Promise,
not a settled GPU continuation waiting for the resume scheduler fixed by PR126.
The report does not identify which fence/shader Promise remains pending. The
precise cause remains unresolved; this streaming check is **not claimed fixed**.

Weapon resource samples were stable at 122 geometries, 116 textures and 83
programs across all three rounds; each completed the existing GPU fence before
saved-slot navigation. GPU completion times were 38,531 / 37,742 / 33,170 ms.
The previously failing saved-slot wait passed in this run. That observation alone
does not prove PR126 was its cause or remove the small remaining timeout margin.

## Visual and evidence scope

This correction introduces no new visual design. The accepted game UI and all
landmark bytes are unchanged; prior actual High game-camera review remains in
[the integration review](INTEGRATION-REVIEW.md). No fresh art acceptance is
inferred from tests, and no new screenshot packaging or Page edit was performed.
The evidence Page remains
<https://chatgpt.com/space/page_558ff553da108191b4a28b72e5bac454>.

[CI-correction evidence](CI-CORRECTION-EVIDENCE.json) records exact test/build
identities, the focused comparison, open-world failure state and weapon
measurements. Full local logs remain under `work/ci-correction`; they are not
published CI results. Parent monitors CI after the normal push.
