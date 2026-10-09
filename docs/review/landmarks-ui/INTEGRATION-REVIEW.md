# PR 125 main integration and short landscape career review

This follow-up integrates main `cde062bb5251066703dcb007359dfe4e5f33a15f` (PR 124) into the existing branch at `0015c0fc7da9b68ed6de43c20cee67df7d97b6d2`. It fixes the acknowledged short-landscape career caption defect. The accepted landmark designs are preserved exactly; this is not another art revision.

## Integration decisions

Three conflicts were resolved:

- `src/render/environment.js`: retain main's sliced scenery, foliage, grass, harbor and town construction; landmarks remain owned by the Blender asset loader.
- `src/render/landmarks.js`: retain its deletion. All 18 kinds have integrated exports; restoring the procedural path would duplicate or replace the accepted models.
- `src/render/region.js`: retain main's asynchronous grass readback and bounded shader preparation, together with the existing GLB lifecycle. Prepare the landmark shaders through the same build queue before installing their root. Cancellation checks and region disposal remain in place.

The six main streaming implementations in `art-study.js`, `build-queue.js`, `grass.js`, `harbor.js`, `meadow.js` and `view.js` match the integrated main byte for byte. `anime-study.js` differs from main only by the existing JSON import attribute. All **39** landmark sources, exports, atlas, manifest and source README match the previous pushed head. This includes the exact Elder Mosstree and Glimmer Spire designs accepted at 05:49:56 UTC. Data-owned placement, collision, game rules, saves, continuous inventory and inactive red border are unchanged in this follow-up.

## Caption and control fix

Compact branch cards keep the icon beside the complete title, description and count. Their physical font sizes are 14/12/12 pixels, with inverse camera units preserving readable text while the chart pans and zooms. The number of cards follows the actual bounded chart width; the existing career spreads remain accessible. Inventory remains one continuous vertical grid.

On narrow short landscape screens, the existing five chapter controls move into the toolbar with 44-pixel targets. The node inspector becomes a bounded side sheet; its essential information has a contained, keyboard-focusable scroll region and its actions remain reachable. Responsive junction relayout clears only the obsolete camera position for that junction, so returning from portrait does not move the new cards outside the viewport. Drilldown, learning, search, panning, zoom and point accounting remain intact.

## Technical validation

| Check | Result and precise scope |
| --- | --- |
| Integration, affected core and export checks | **PASS**, 11 files, 0 failures: frame-build-queue, grass-bake-lifetime, region-shader-preparation, foliage/meadow-streaming-equivalence, landmarks, equipment-inactive, workspaces, save, journal and landmark-assets. |
| Final production build | **PASS**. `main-BR0NfZku.js` and `main-D4oOXd4z.css`; the existing large-chunk warning remains. |
| Syntax and whitespace | **PASS** for changed journal/browser helper and region; `git diff --check` passes. |
| Integrated High Chromium career flow | **PASS** at 844×390, 740×360, 776×540 and 1180×820: all 12 stage-three branches have complete, reachable captions; native drilldown/return, learning, search, pan/zoom and tablet pinch preserve interaction and points. Panels remain bounded. This run preceded the last 740-only inspector/toolbar and orientation-camera correction. |
| Exact final High Chromium recheck | **PASS**, final built artifact at 740×360: all 12 captions and native drilldown/return, learning/search/pan/zoom, all five chapter tabs, and portrait 390×844 → landscape 740×360 reachability. No page errors. |
| Integration inventory/border preservation smoke | **PASS** in the four-size run: native touch scroll to the final inventory row, last-item equip, filters, materials and reopen; selected inactive equipped item remains `rgb(200, 59, 53)`. These unchanged paths were not rerun in the final career-only check. |
| Asynchronous import | **PASS**: actual High game reached `imported-ready`; queued city, water and landmark shader work completed, including four landmark shader preparation steps. No hardware performance claim. |
| WebKit | **Not run on this integrated revision.** Prior real-game HUD results, equipment/workspaces loading failures and harness limitations are historical and separately recorded in `REVISION-REVIEW.md`; they neither establish a pass nor a resolved loading issue for this head. No new baseline comparison was needed or performed. |

The three complete affected browser suites were not repeated during this bounded integration follow-up. CI is left to the parent after the normal push; no workflow or review polling, merge or deployment was performed. The focused runtime probe reused the existing passive and inventory assertions in the actual game, rather than an equipment-only harness. Gameplay/render updates were paused after imports for stable UI pixel inspection; this is not a frame-rate or long-session streaming benchmark.

## Visual inspection and remaining limits

Technical assertions are separate from pixel review. The final 740×360 originals were opened and inspected: whole branch names, notes and counts are readable; the node title, complete bonus, upgrade and close controls fit. The 844×390, 776×540 and 1180×820 overview originals from the four-size run were also inspected. Useful screen area remains outside the bounded panels; neither the captions nor the whole interface were hidden or uniformly shrunk.

Faults found and corrected during the focused review: short-landscape bottom-sheet overflow, clipped node heading/bonus, a chapter tab obstructed by the central HUD control, and stale portrait camera coordinates after rotation. The final narrow images are proof of the correction, not new landmark approval. Accepted landmark sources/exports remain identical. WebKit loading on the new head remains unverified.

[Existing evidence Page](https://chatgpt.com/space/page_558ff553da108191b4a28b72e5bac454) now includes **two additional authentic final High 740×360 originals**, overview and node detail. Existing content is preserved. Both references were found in Page readback and opened successfully; their hashes match the local originals. No replacement images, retouching, new contact sheets or archive packaging was performed. Native attachment `library_file_ids` are unavailable through this Page route.

Artifact hashes, source identity, preserved asset digests, focused result scopes and the two verified Page references are recorded in [INTEGRATION-EVIDENCE.json](INTEGRATION-EVIDENCE.json).
