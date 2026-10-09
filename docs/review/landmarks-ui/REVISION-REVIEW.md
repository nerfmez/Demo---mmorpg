# PR #125 design revision

Follow-up: [main integration and short-landscape caption fix](INTEGRATION-REVIEW.md) supersedes the deferred PR 124 integration and caption limitation below. This preceding record describes the design revision at `0015c0fc7da9b68ed6de43c20cee67df7d97b6d2`; its WebKit results remain historical.

Revision base: `6c480c749d88c40f97f35c559f9eb279a6ea9c71`; original game base: `152eb744d242a9260cff5e3479e5f08000a5de54`.
PR #124 streaming fixes at `cde062bb5251066703dcb007359dfe4e5f33a15f` are coordination context. They have not been merged or rebased during this design iteration.

## Acceptance gate

Landmarks must be recognizable at normal gameplay scale, grounded in their actual environment, and have strong cel-shaded value groups without fine visual noise. Inspect actual High game views, not only Blender renders. Geometry counts and technical tests do not establish artistic improvement. Keep the data-owned placement and collisions, PR #123 loading/batching/disposal, and gameplay unchanged.

The bag, materials, skills and mod collections must render one contiguous grid of all matching entries, with vertical scrolling to the final row. No page slicing, hidden pages or page arrows. Keep usable touch targets and readable original artwork, bounded panes and reachable details/actions. Verify selection, filtering, pane navigation and reopening.

## Complete critical inventory

The original and rejected pairs are the authentic `before/<id>-game.png` and `after/<id>-game.png` in this directory. Supplemental wide views establish tall silhouettes. Findings come from the game images and the world data, not a Blender-only inspection.

| Region | Landmark / source kind | Semantic finding and revision decision |
|---|---|---|
| Azure | Gull Shrine Gate / cliff_shrine | Readable ceremonial gateway with open passage and paired lanterns. Retain this coherent design; check against revised neighbors. |
| Azure | Singing Conch / giant_conch | Regression: rounded spiral and silhouette spines became a striped cone, aperture faces away. Rebuild bulging whorls, flared pink mouth and four broad spines, with a readable three-quarter approach. First batch. |
| Azure | Ranger Lookout / watchtower | Purpose remains clear, but excessive height crops the roof and thin support legs weaken its weight. Rework proportion and substantial bracing while keeping the footprint. |
| Azure | Rose Pavilion / garden_gazebo | Regression: roof ribs and floral corner framing disappeared into a plain pink disk. Rebuild a pitched faceted roof, cream ribs/eaves, substantial columns and grouped roses at selected corners. Fourth priority. |
| Azure | Hill Windmill / windmill | Working rotating sails, coherent tower and roof remain recognizable. Retain the existing source and cached spinner implementation. |
| Azure | Meadow Well / farm_well | Well, winch, scarecrow and hay communicate a working meadow farm. Retain this readable ensemble. |
| Frontier | Frontier Bell / bell_tower | Tall thin frame and small bell silhouette weaken the settlement signal. Rework around a larger flared bell and lower, substantial timber shelter. |
| Frontier | Crag Beacon / crag_beacon | Masonry reads as stacked coins and flame as thin sticks. Reinterpret as a rugged rocky beacon with a broad, layered static flame. |
| Frontier | Elder Mosstree / elder_mosstree | Regression: massive buttressed hollow trunk became thin generic support beneath flattened canopy. Rebuild asymmetric open trunk, sweeping roots, cyan heartwood focal point and irregular canopy. First batch. |
| Frontier | Bramble Arch / bramble_arch | Sparse leaflets and uniform tubing read as a wilted garden arch. Rebuild a wild thorn passage with substantial twisting boughs and broad grouped foliage. |
| Frontier | Glimmer Spire / glimmer_spire | Regression: luminous branching cluster became dull obelisks with disconnected tips. Rebuild dominant faceted crystal and unequal outward shards, dark socket and controlled cyan core faces. First batch. |
| Frontier | Sunfall Sea Arch / sea_arch | Uniform curved tube loses the identity of a weathered natural coastal opening. Reinterpret as asymmetric layered rock around an open window. |
| Frontier | Meadow Sundial / sundial | Dial and gnomon remain understandable; inspect the final group for value/scale before deciding whether a rebuild is necessary. |
| Moonroot | Moonstone / moonstone | Generic pencil silhouette and tiny lunar glyph are weak at game distance. Rebuild a broken ritual standing stone with a broad lunar inlay. |
| Moonroot | Moon Altar / moon_altar | Circular tube crescent reads as unfinished plumbing. Replace with a solid tapering moon sculpture and deliberate ritual dais. |
| Moonroot | Fiddlehead Rise / fiddlehead_ferns | Regression: curls turn edge-on and thin leaflets merge with grass. Rebuild stout unequal stalks, open curls at alternating approach-visible angles and broad grouped fronds. Fifth priority. |
| Moonroot | Moon Mirror / moon_mirror | Small crest and flat muted panel obscure the lunar moth identity. Reinterpret the frame and crest; use static facets rather than expensive live reflections. |
| Moonroot | Root Warren Gate / root_arch | Rounded pipes and tiny buried dots lose ancient roots and burrow identity. Rebuild sweeping ribbed roots and substantial recessed burrow openings. |

## First prototype review

The initial revised conch game view restored the pink mouth and four spines, but its head-on orientation hid too much of the spiral. The source was adjusted to a three-quarter approach before publishing proof. Further runtime findings, final artifact hashes and focused validation will be recorded below after inspection.

## Final visual inspection, 2026-10-09 UTC

The owner rejected the first replacement tree and crystal. Those prototypes are not the final sources or exports. The evidence Page labels their previous proof as rejected history. The new tree and crystal were rebuilt in Blender 4.3.2 and inspected as complete objects in the actual High game camera with nearby characters/trees for scale.

- **Elder Mosstree:** original-scale 2.38-unit asymmetric trunk and roughly 14-unit crown, seven broad buttresses spreading 4.75–5.5 units, substantial hollow jambs and sweeping root spines. The canopy uses the accepted forest's actual jagged branchlet atlas, `data/art.json` leaf colours and painted-lighting shader, rather than a different leaf style. The editable source packs its atlas; the export supplies UVs and vertex colours and borrows the existing cached runtime texture. Final pixels show substantial roots and ancient-tree scale, with foliage matching the surrounding trees. The owner accepted this final whole-object proof at 05:49:56 UTC with “เค”; the accepted source/export are preserved.
- **Glimmer Spire:** fresh double-ended faceted cluster, a dominant crystal and four unequal outward shards, broad cyan luminous core faces and darker readable facets, with the original rocky socket, satellite crystals and ward stones. The original luminous cluster is the comparison target. Final pixels recover a luminous crystal-cluster signal rather than the rejected dull obelisk/dagger shape. The owner accepted this final whole-object proof at 05:49:56 UTC with “เค”; the accepted source/export are preserved.
- **Singing Conch:** bulging cream whorls and raised spiral ridge, four silhouette spines, a flared pink aperture, and a three-quarter orientation that exposes both body and mouth. Kept the direction requested by the owner.
- **Rose Pavilion:** pitched faceted roof with integrated cream ribs/eaves, substantial columns, open entrance and broad rose/vine groups at three corners. A first export hid roses behind the roof/foliage; front-facing flower sprays corrected this. Removed hidden duplicate flowers after inspection and reinspected that exact final export in the game.
- **Fiddlehead Rise:** three stout dark stalks at unequal heights, large open light-green curls at alternating approach-visible orientations and broad grouped fronds. Final normal view clearly separates curls and stems from the grass.
- **Remaining rebuilds:** lower substantial watchtower and bell shelter, rocky beacon with broad static flame, wild bramble passage, eroded sea-rock window, broken moonstone tablet, solid tapered lunar altar, lunar moth mirror frame and sweeping root gate with readable recessed burrows. Actual region contact sheets were inspected; their stronger primary shapes replace the rejected tubes, thin sticks and small unreadable details.
- **Retained:** cliff shrine, windmill, farm well and sundial. Their sources/exports were not changed during this revision. Final neighboring game views preserve their purpose and the existing windmill animation.

Faults found and fixed during runtime inspection: conch aperture initially hid the spiral; a crystal iteration still lacked a broad luminous core; the tree initially used the wrong foliage atlas/style; Blender CustomData reallocation corrupted leaf colour writes with UV values (diagnostic rainbow foliage was excluded); gazebo roses were hidden; root-warren recesses were buried inside their earth mounds. Final tree colours are also checked as finite green paint values in the asset test.

The complete tree/crystal comparisons use High 1180×820, native follow-camera/FOV, review zoom 2.0 and the same approach for original and revised assets. Other inventory views use zoom 1.0; five representative landmarks were also inspected at zoom 1.35 in 1180×820, 844×390 landscape and 390×844 portrait. These are actual runtime screenshots, not Blender renders or generated images. Whole-object proof is specifically labelled; close tree views with cropped crowns are excluded from the delivered inventory gallery.

Remaining visual limits: the massive tree crown can exceed the close zoom-1.0 frame. Some close views of Sea Arch/Root Arch do not show the complete upper silhouette; the Root Arch wide view is included in the mobile archive. Existing portrait HUD placement can cover part of a landmark at certain approaches. Preserving ancient-tree presence takes priority over shrinking it to disguise close framing. No physical iPad frame-rate measurement is claimed. Tree/crystal acceptance is recorded separately above.

## Continuous inventory and bounded UI

The actual list renders every matching gear/material/skill/mod entry in one DOM grid. Removed page state, slicing, page-size calculation and arrows. A separate vertical scrollport preserves selection and offsets across refreshes, panes and reopening. Desktop/landscape/portrait use different column counts, not a scaled-down entire interface. Cells retain readable artwork/text and 44-pixel actions; the windows stay bounded with useful scene space. The global touchmove handler now permits the workspace's native scrolling instead of cancelling it.

High review fixture: 67 gear items and 32 material types on a never-saved character. Native Chromium touch/mouse scrolling reached the last row, selected/equipped the last gear item, changed filters/material category, selected the final material, switched panes, reopened and used details/actions. The final High PC/landscape/portrait scroll offsets were 965/965, 1195/1195 and 1465/1465 respectively. Tablet evidence also shows the final row.

Inactive selected equipment now keeps its red `#c83b35` border while active selected items retain gold. The workspaces test now reaches the portrait library pane and exercises `venom_mire` and mod controls in the contiguous list. A real short-landscape career defect was found: map controls covered a branch target. Moved the existing map-control DOM into the separate statusbar footer, with two footer rows in portrait, and sized hub columns from the actual map viewport. The final High career-only probe passed native branch/drag/zoom/search/learn/navigation flows at 1440×900, 1180×820, 844×390 and 390×844, with zero control/caption intersections. Stable-frame inspection at 06:10 UTC confirmed separate controls, readable/reachable landscape and portrait detail actions, and portrait branch titles. In the short 844×390 overview, branch captions remain clipped/very small; control reachability passing is not proof that every caption is legible. This visual limit is disclosed without starting another chart redesign. Page-turn animation frames are not final still evidence.

The HUD test replaces its obsolete fullscreen assertion with positive bounded-panel, exposed-scene-area, readable-text and reachable 44-pixel-close assertions. Other HUD artwork/control assertions remain intact. The standalone loadout-live review's directly affected pagination expectations were migrated to full-list/scrollport assertions; its save/equip/socket assertions were preserved. That extra long suite was not run; validation stays scoped to the three requested browser suites and focused repository checks.

## Evidence delivery and identity

[Existing evidence Page](https://chatgpt.com/space/page_558ff553da108191b4a28b72e5bac454), updated in place without removing its six initial images or older archive. The new revision delivers **50 distinct original screenshots**: 18 landmark inventory views, 15 High inventory UI images, 15 representative landmark viewport images and two original tree/crystal wide views. Two final whole-object views are already among the 18 inventory images. **13 contact/pair sheets** arrange authentic screenshots with labels only: seven inventory groups, four UI pairs and two original/revised whole-object pairs.

Six downloadable ZIP files in the Page contain all originals, split below the supported 10 MiB file limit. A screenshot JSON manifest records exact size and SHA-256. Every new sheet was confirmed in the Page and opened successfully through `read_page_reference`. Native `library_file_ids` are unavailable through this Page route; opaque `library-file:` references are not represented as attachment IDs. One direct desktop-detail PNG upload returned an unknown outcome and was not blindly retried; the complete 15-image inventory ZIP includes that original.

`REVISION-EVIDENCE.json` records source/export SHA-256, screenshots, file references and technical results. The GLBs are the runtime assets; the `.blend` sources retain editable parts and the tree's packed atlas. The actual Blender build script was used, with explicit kind arguments.

## Compatibility and resource budget

Fourteen source/GLB pairs, one packed-source atlas, the asset manifest/build/capture scripts, the foliage material adapter and compact inventory/career UI are revised. No data-owned placement, colliders, character save schema, game rule, map registry or graphics mode was changed. Existing cooperative imports, static material batches, cached hull/toon materials, spinner frame guard and per-region disposal are preserved. No new light, particle system, per-frame landmark animation/allocation or texture download was added.

Compared with the rejected head, all 18 exports total **38,565 triangles versus 45,294** (14.9% less) and **1,762,432 bytes versus 1,482,868** (18.9% more). Material groups total 113 versus 104; geometry batching still consolidates compatible opaque meshes. The elder crown is one joined foliage draw without rectangular outline hulls. These are honest asset budgets, not measured hardware performance. Added silhouette/form/colour data increases download bytes while triangle count decreases; High aesthetics are preserved.

## Focused technical validation

Results and artifact identities are recorded in `REVISION-EVIDENCE.json`. Browser input/technical results are separate from artistic judgment.

| Check | Observed result and scope |
|---|---|
| Chromium equipment-inactive | PASS: desktop, tablet, landscape and portrait; inactive selected equipment remains red. |
| Chromium workspaces | PASS: encounter and full workspace flows at all four sizes, including contiguous inventory, last-item actions, filters, pane return/reopen and career gestures. |
| Chromium fieldhud | PASS: all four sizes, positive bounded-panel/scene-space/readability/hit-target assertions. |
| Real-game WebKit fieldhud | PASS: all four sizes. |
| Real-game WebKit equipment-inactive | FAILED to complete: 90-second game-readiness timeout. Diagnostics after timeout showed modelsReady/loading done and no page errors; this does not establish a completed UI assertion pass. Earlier attempt passed desktop then stalled loading tablet. |
| Real-game WebKit workspaces | FAILED to complete: loading overlay intercepted the first encounter craft-filter action. Workspace assertions were not reached. |
| WebKit equipment-only supported offline UI harness | PASS: all four sizes; real Game/Panels and native WebKit DOM, renderer omitted. This proves the border assertions in that harness, not real-game loading. |
| WebKit workspace supported offline UI harness | FAILED: encounter helper expects renderer world data; `world.data` is unavailable. Continuous-inventory/career assertions were not reached. No assertions were weakened or skipped to manufacture a pass. |
| Final career-only High Chromium probe | PASS: all four sizes after the final footer move; native gestures and zero map-control/caption intersections. |
| Build | PASS after final footer move; existing large-chunk warning remains. |
| Asset/ownership tests | PASS: three cases covering all editable sources/exports, raw/batched exact-once cleanup/cancellation, borrowed foliage atlas/private material and green vertex colours. |
| Focused core/save checks | PASS: landmarks, equipment-inactive, workspaces and save test files. No core/data/save shape changed. |
| Focused High GPU ownership probe | PASS: isolated renderer using the loaded runtime asset and actual game camera; three cycles free 3 peak geometries to 0 while the one borrowed cached texture stays at 1. This excludes unrelated asynchronous world-streaming allocations. |
| Syntax and diff checks | PASS on changed JS/test files and `git diff --check`. |
| Standalone loadout-live | Directly affected pagination assertions updated and syntax checked; long suite NOT RUN. |

The three Chromium suites and real-game WebKit HUD pass preceded the last career-control footer move. Their unaffected inventory/border/HUD/panel-bound assertions are reused; the final affected career behavior was checked by the four-size High probe afterward. The full suites were not claimed to have been rerun against that final footer change. No further WebKit loading retries, broad suite runs, CI/review polling, merge, deployment or PR #124 integration were performed.
