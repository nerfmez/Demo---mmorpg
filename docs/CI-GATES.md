# CI gates and browser regression

## Before review, merge and Pages upload

CI on a PR checks its exact head SHA. `Build, core and CI tools` runs the build
and **all** core tests once for game changes (including migration, character/save
preservation, combat contact timing and world safety). Tool checks also run on every
game gate, so missing inventory entries cannot silently pass. Changes limited to
`tests/tools/` run tooling only; documentation-only changes do not boot the game.

The reused change-scope action emits a browser plan. Every game change gets a real
boot/create/save/reload/Continue check in Chromium desktop + touch and WebKit touch.
Explicit local paths add their affected functional suites. Core, data, saves,
shared renderer/UI, dependency changes, `.github/`, `scripts/`, and unknown paths fall back to
the **entire** inventory. Deleted/renamed paths are considered on both sides of the
diff. Missing history errors out; missing event ranges fall back full.

Browser suites run independently, at most six jobs concurrently, with the same
built artifact and exact checkout SHA. Neither `QUICK` viewport omission nor
`SKIP_CAPTURES` is accepted by the CI runner. Each shard emits per-script timestamps,
durations, exit codes and source SHA; artifact names include mode/source/engine/suite
and run attempt. Reports are checkpointed with `complete: false` until the shard ends.
Every assertion, viewport and capture in each selected script is retained. Menu-hub
alone holds its already-rendered world backdrop while checking paused UI; it keeps
RAF/input/UI previews live and asserts zero additional world-scene draws, while
separately recording preview draws and held frame updates.

`test (chromium)` and `test (webkit)` retain the old check names. They now summarize
**the quick affected gate**, not a claim that every browser test ran. Both summaries
wait for and fail on any selected shard failure, cancellation or unexpected skip.
They deliberately share the combined result, so one engine's failure blocks both
summaries. Docs/tool-test-only runs explicitly report that no browser suite was selected.
An empty/missing game plan or source also fails the gate.
There is no failure waiver. No branch protection/ruleset settings are changed.

Pages game publishing calls the same workflow in quick-gate mode and depends on its
success. Release calls always build/test core/boot, including documentation-only
pushes, so there is always a validated artifact to upload. It downloads that exact
build instead of rebuilding before upload. The build records `dist/ci-source.txt`,
which browser shards and Pages upload verify against the planned SHA. Artifact names
include the producing run ID/attempt and are passed as outputs, including on retries.
Published verification checks out that same source rather than a moving branch.
Skill Lab-only publishing keeps its existing path, lab preservation and live checks.
The deployment environment and permissions remain unchanged. A conservative full
fallback can still make a broad game release slower than a bounded local edit.

## Full regression

CI on every main push and `workflow_dispatch` requests all suites in both engines,
including UX and map captures regardless of affected flags. This full postmerge run
is independent of the deployment quick gate; it is not a deployment dependency.
Use the Actions CI workflow's **Run workflow** on the requested ref for an explicit
full run once this workflow definition exists on main. Distinct main SHAs have
separate concurrency groups; a later push does not cancel their full regression.
PR CI/build-infrastructure changes select all suites even before manual dispatch
is available. The PR job label remains `Quick affected`; inspect its actual plan
and all results rather than inferring coverage from that label.

`scripts/ci-browser-plan.mjs` is the single inventory for affected and full checks.
It retains all 16 original CI browser scripts and adds boot, atomic journal-save,
and PR78 actual-game details regression: 19 scripts across 12 suites / 24 engine
shards. `details-game-touch.mjs` is mandatory in `equipment`, not an optional file.
Do not remove the original isolated `details-touch.mjs` check. Renderer/UI/HUD review workflows, focused tests not previously in CI,
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
fixture. At original PR77 head `c0488351063f65501abd24e86d5208ba982bdc9f`,
[CI run 37345797990](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37345797990)
ran only boot and menu in both engines. Its Chromium menu script took 107.564 s
(job 111884953191), retaining all three viewports. This is an observed run, not a
controlled benchmark or proof of full regression. No total speedup is claimed.

Before approval, confirm the retained status names and changed quick/full semantics
against protection requirements. Rulesets list was readable (empty), but this token
cannot read main branch protection (403). If the owner wants full regression as an
additional required premerge check, that is a separate explicit settings decision;
this PR neither bypasses nor edits protection. Existing other required workflows
may still delay merge when they select their relevant checks.

## PR77 / PR78 integration and acceptance

PR77 depends on PR78 head `530e410ee543c63671781006d14d7e2a859d6c39`. Carry PR78's
main entry-point fix, actual-game test and review note unchanged; retain PR77's
sharded CI and register the new test in equipment. Both PRs remain drafts until
the owner reviews measured results. Do not merge either into main for testing.
After owner approval and passing required checks, merge PR78 first, retarget PR77
to current main, reconcile any new changes, and validate the final source again.

Full acceptance requires all 24 selected engine/suite jobs and 38 script executions
to finish successfully at the final source, with complete timing reports and the
same built artifact. Preserve both engines, core/save/migration checks, assertions
and captures. A partial green run, missing script/report, cancellation or timeout
is not full-suite certification.

The follow-up's isolated `ci-hardening.test.mjs` checks routing, actual shell gate
outcomes, wrong/missing build identity, durable reports and injected child failures.
Its browser names are runner fixtures, not real browser launches. Local fixture
results do not substitute for full Actions/build/browser or published-game evidence.
No new gameplay or open-world optimization is included in this CI follow-up.
