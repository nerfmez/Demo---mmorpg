# CI ownership and premerge coverage

CI runs all core/save safety tests and the build once at the exact PR head. Every
selected browser script runs in Chromium and WebKit without assertion/capture
shortcuts. Pushes to main and manual CI retain the complete browser inventory.

The `test (chromium/webkit)`, `review (chromium/webkit)` and
`field-hud (chromium/webkit)` check names remain unchanged. The latter four are
now evidence gates in CI. The former UI/HUD workflows remain available for an
explicit manual full review; they no longer repeat scripts on every PR.

Head evidence can certify the merge review only when both complete Git trees are
identical. CI validates the event merge commit's exact base/head parents. A
different merge tree receives a separate build and affected UI/HUD execution,
including changed consumers brought in from the base. Source, engine, selected
scripts, run attempt and completion must match before a gate passes. Missing,
cancelled, failing, partial and stale reports fail closed.

Scheduling uses the existing hosted account capacity, without the previous
six-job cap. Long suites are placed first and engines are interleaved. Playwright
downloads are cached by OS, engine and dependency lock; browser/dependency
installation still runs on every job. No account limits or billing are changed.

Equipment narrowing is defined in `scripts/ci-equipment-impact.mjs`. Shared
character/crafting/panel/progression modules require before/after AST evidence
that changes stay within recognized equipment functions/actions. The equipment
notice block can change independently; the rest of save migration must remain
identical. Creation, derived stats, unrelated actions, imports, unknown exports,
new shared modules, dependencies and infrastructure retain full fallback. The
bounded equipment and loadout components retain their equipment, skill/mod
workspace, combat, item, menu, save, wearable and HUD consumers.

The focused `equipment-focused.mjs` check exercises actual rendered desktop,
iPad and phone equipment thresholds, combined-hand deficits, touch details,
recovery, model bindings and migration preservation in both engines. Existing
broad equipment/crafting/model tests keep their owners and assertions.

PR101 is independent. Its `equipment-inactive.mjs` is discovered only when
present at the tested source, with its own CI suite. Its legacy hard-coded
Chromium launcher is rejected rather than reported as WebKit success. Once
PR101 lands, refresh this branch and update that test's engine selection and
browser-specific launch options here before declaring the integration ready.

Branch-protection settings could not be read with the available integration
(HTTP 403). Actual check-run names were inspected; no protections were changed.
