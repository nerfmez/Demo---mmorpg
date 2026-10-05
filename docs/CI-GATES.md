# CI gates and browser regression

## Before review, merge and Pages upload

CI on a PR checks its exact head SHA. `Build, core and CI tools` runs the build
and **all** core tests once for game changes (including migration, character/save
preservation, combat contact timing and world safety); tool changes run all tool
tests. Documentation-only changes do not boot the game.

The reused change-scope action emits a browser plan. Every game change gets a real
boot/create/save/reload/Continue check in Chromium desktop + touch and WebKit touch.
Explicit local paths add their affected functional suites. Core, data, saves,
shared renderer/UI, dependency changes and unknown runtime/test paths fall back to
the **entire** inventory. Deleted/renamed paths are considered on both sides of the
diff. Missing history errors out; missing event ranges fall back full.

Browser suites run independently, at most six jobs concurrently, with the same
built artifact and exact checkout SHA. Neither `QUICK` viewport omission nor
`SKIP_CAPTURES` is accepted by the CI runner. Each shard emits per-script timestamps,
durations, exit codes and source SHA; artifact names include mode/source/engine/suite.
Every assertion, viewport and capture in each selected script is retained. Menu-hub
alone holds its already-rendered world backdrop while checking paused UI; it keeps
RAF/input/UI previews live and asserts the renderer frame counter stays held.

`test (chromium)` and `test (webkit)` retain the old check names. They now summarize
**the quick affected gate**, not a claim that every browser test ran. Both summaries
wait for and fail on any selected shard failure, cancellation or unexpected skip.
They deliberately share the combined result, so one engine's failure blocks both
summaries. Docs/tool-only runs explicitly report that no browser suite was selected.
There is no failure waiver. No branch protection/ruleset settings are changed.

Pages game publishing calls the same workflow in quick-gate mode and depends on its
success. Release calls always build/test core/boot, including documentation-only
pushes, so there is always a validated artifact to upload. It downloads that exact
build instead of rebuilding before upload.
Skill Lab-only publishing keeps its existing path, lab preservation and live checks.
The deployment environment and permissions remain unchanged. A conservative full
fallback can still make a broad game release slower than a bounded local edit.

## Full regression

CI on every main push and `workflow_dispatch` requests all suites in both engines,
including UX and map captures regardless of affected flags. This full postmerge run
is independent of the deployment quick gate; it is not a deployment dependency.
Use the Actions CI workflow's **Run workflow** on the requested ref for an explicit
full run once this workflow definition exists on main.

`scripts/ci-browser-plan.mjs` is the single inventory for affected and full checks.
It retains all 16 original CI browser scripts and adds boot and atomic journal-save
regression. Renderer/UI/HUD review workflows, focused tests not previously in CI,
and published Dreamloop/save checks retain their existing owners. Full regression
is not an instruction to run every one-off capture/stress script in the repository.

Sharding reduces serial waiting, not test work. Every shard installs its engine and
npm dependencies; full runs have more runner/setup overhead. The release quick gate
and independent postmerge full run intentionally overlap affected checks. Build/core
are shared within each run rather than repeated for both browsers. There is no new
paid service, schedule or automation.

## Measurement and protection review

Baseline: PR #75 head `df55a11a9f4ccddef8a6da0d44b15ed069cc660f`,
[CI run 37335791786](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37335791786).
The jobs API reports Chromium 60m27s and WebKit 18m04s. Chromium smoke 10m03s,
weapon-loading/models 15m27s, menu 6m35s, UX 10m30s; WebKit weapons 1m40s.
Chromium core 68s and build 1s. Browser execution, rather than build/queue time,
dominates this sample. Both engines use software rendering on CI, so this does not
measure iPad hardware performance.

The menu suite paused simulation but `main.js` still called `view.render()` on every
frame. A completed-world-frame hold removes this repeated rendering only in the UI
fixture. Equivalent before/after menu measurements and new CI evidence are recorded
in the draft PR; total full-run speedup must be measured in Actions rather than
inferred from the number of shards. No speed target or overall reduction is claimed.

Before approval, confirm the retained status names and changed quick/full semantics
against protection requirements. Rulesets list was readable (empty), but this token
cannot read main branch protection (403). If the owner wants full regression as an
additional required premerge check, that is a separate explicit settings decision;
this PR neither bypasses nor edits protection. Existing other required workflows
may still delay merge when they select their relevant checks.
