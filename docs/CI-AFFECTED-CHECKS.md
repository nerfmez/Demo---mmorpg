# Affected checks and release evidence

> Historical rollout record. The owner-approved 2026-10-08 publication policy in
> [CI-GATES.md](CI-GATES.md) supersedes the full-fallback, trigger, broad-review
> and release-path descriptions below. Retained implementation details are
> historical evidence, not current gating requirements.


PR checks certify the affected plan at an exact head SHA. Main pushes and manual
CI runs execute the full inventory. An affected pass is not a full-regression pass.
No branch protection, account settings or release triggers are changed.

## Bounded routes

Every runtime plan retains build, all core tests, all tool tests, and `boot.mjs`
in Chromium and WebKit. Boot creates a real character, applies kit/appearance,
renders the world, saves, reloads, Continues, and compares preserved character
fields. It captures the title, creator and loaded game.

| Example change | Previous PR browser suites | New PR browser suites, each in both engines |
| --- | --- | --- |
| Registered `public/assets/icons/gear/wisp_staff.png` | All 12 | boot, icons |
| `docs/icon-assets-manifest.json` | Documentation-only | boot, icons |
| `src/ui/fieldhud.css` | All 12 + serial broad UI/HUD review | boot, hud |
| `src/ui/quest-journal.js` | All 12 + serial broad UI/HUD review | boot, quests, hud |
| `src/ui/menu.js` | boot, smoke, menu, ux, save + broad UI/HUD review | boot, menu |
| Item PNG + shared CSS/core/save/dependency/unknown file | All 12 | All 23 |
| New/unregistered PNG or new UI/CSS module | All 12 | All 23 |

The exact `docs/icon-assets-manifest.json` input also selects boot/icons and
core/tools/build; other documentation paths retain their existing policy.
Only registered gear/material/arrow/skill PNG paths qualify. Registry code,
monster/region images, new images and other asset types remain conservative.
The icon case decodes actual inventory pages, crafting categories, skill and
movement libraries, atlas/quest images, HUD buttons and material/gear ground
loot. It checks native dimensions for routable images and captures all four
layouts. Portrait inventory keeps its existing rotation prompt; decoding its
hidden pages is not claimed as portrait hit-testing coverage.

Quest checks retain the existing UX assertions about story/optional artwork,
locked work and read-only browsing, then verify real tracking, normal saves,
HUD state, reload/Continue, auto-tracking and close/escape. They capture desktop,
iPad, both phone orientations and reduced motion. Escape in native fullscreen
may exit fullscreen before the panel receives keydown: that branch must preserve
the journal/character, retain the paused-game gate, resume, and dismiss normally.
A separate real windowed fixture proves keyboard dismissal for intercepted
cases without changing the saved character; other layouts retain their direct
Escape dismissal assertion. HUD CSS uses the complete
existing `fieldhud.mjs`, including all four layouts and hit checks.

Shared UI/styles, core/data/save, dependency/build/routing changes and unknown
paths select the full inventory. Explicit older allowlists retain their broad
review owners. Existing skill-journal files have explicit consumer suites;
new modules fall back full. There is no `src/ui/**` allowlist or capture-skip mode.

## Full regression ownership

Full CI now owns every script from the previous nine-script UI review and the
HUD review: journal, skill-journal, fullscreen-overlays, workspaces,
journal-route-upgrade, journal-lines, skill-lines, wearable-level,
journal-route-save and fieldhud. Each has one CI shard owner, and both engines
run them after merge and on manual full runs. Existing smoke/UX scripts,
assertions and viewport lists remain intact. The PR-only legacy review workflows
also retain their checks for shared/unbounded edits.

The wearable shard checks upgrade requirements directly: the next upgrade and
every upgrade-track rank must retain Lv.6, with no wear warning and successful
equip at exactly Lv.6. Deterministic C/B/A/S crafts use the real seeded RNG and
UI actions, then upgrade through every rank with exact payment, UID, ownership
and option preservation checks. Promotion copy is checked only when a next
grade exists; S must show the maximum-grade state without a promotion action.

These additional full owners make 23 suites / 46 browser jobs, plus build and
two gate summaries. A bounded image or HUD CSS plan has four browser jobs; a
quest component plan has six. These are job counts, not promised durations.

Workshop #95 stays separate. Its new UI/controller/styles are not allowlisted.
Workshop may become bounded only after its actual consumer coverage has an
explicit CI owner: preview without spending or rerolling, craft/upgrade/grade
once, exact UID, rapid taps, close during animation, reload and reduced motion.
This PR changes no Workshop feature or transaction code.

## Failed or incomplete work stays failed

Both existing `test (chromium)` and `test (webkit)` summaries still require
successful preparation and all selected shards. They also download this run
attempt's small JSON report artifacts and verify source, engine, suite, mode, clean checkout,
completion, exact script list and every exit status. Missing reports, cancelled
children, partial scripts, unexpected skips or stale source cannot turn green.

## Reuse before Pages publication

Reuse applies only to a completed successful latest same-repository PR CI
attempt, merged into main, whose tested head tree exactly equals the release
tree. All core/tools/build and selected jobs/mandatory steps must succeed.

The resolver verifies immutable artifact name, source/run/attempt metadata,
expiry, SHA-256 download digest, source marker and built entrypoint. The receipt
binds the event PR/main and executed workflow revision. GitHub-owned commit
parents bind that revision to the base/head; complete GitHub tree responses
reconstruct `git diff --no-renames BASE HEAD`, including deleted/renamed paths
and file modes. The release source recomputes the expected suites from this diff
and its current routing version/digest. Artifact-declared suite coverage never
determines required jobs. The recomputed plan must match the receipt exactly,
and executed/source workflow blobs must match.

Changed routing bytes, missing/cancelled/skipped selected jobs, incomplete
steps, tampered receipts, truncated API results, a newer failed run, stale
artifact identity, or download/extraction failure selects normal release
validation. The source marker is retained; a build is never relabelled with a
different SHA. Main full regression remains independent of publication.

GitHub defines the workflow revision and attempt variables in its
[variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

## Verification

Contract tests cover bounded images/CSS/page UI, mixed/shared/core/save changes,
unknown paths, routing version/digest drift, selected-job/report failures and
tampered/stale artifacts. Resolver fixtures exercise the complete download,
digest, receipt, tree-diff and expected-job path. Existing traversal/symlink,
same-tree provenance and workflow DAG tests remain.

Local validation is reported separately from GitHub CI. Browser scripts record
per-script timings in each shard report. Duration comparisons should use
successful equivalent source/configuration runs; job counts alone do not
establish faster publication.
