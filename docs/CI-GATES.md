# Demo publication and regression

This is the owner's approved simpler demo policy (2026-10-08). It replaces the
universal full-browser fallback described in earlier CI rollout notes. It changes
workflows, verification tools and tests only: the Pages URL, game, Lab, character
format, renderer and monster implementation remain unchanged. No protection,
credentials, hosting, billing or account settings are changed.

## Before publication

1. Retain the previous **successful** Pages site as `previous-site` for 90 days,
   including its original release receipt, Lab, hidden files and every game byte.
   Its game source is the release comparison baseline. This covers accumulated
   unpublished changes when GitHub replaces pending runs. A stale main commit
   behind this baseline fails instead of publishing over a newer successful game.
2. Try authenticated reuse of the latest successful same-repository PR CI at the
   exact release tree. Require all selected jobs/steps, source and run/attempt
   identities, archive SHA-256, executed workflow, original base/head parents,
   current routing digest and actual merge delta coverage. Stale PR base metadata
   is resolved from executed merge parents only after proving reported-base
   ancestry and the exact event head; both bases remain recorded in provenance. A retargeted PR is
   allowed only after these proofs; its old base name alone is not disqualifying.
   Missing or mismatched evidence runs the bounded release gate; it never grants
   an exception. A missing previous-site checkpoint/baseline blocks publication.
3. Otherwise build once with locked dependencies and Node 22; run all core tests
   (including migrations, save preservation, contact timing and world safety),
   tool tests and the affected browser plan below. Both browser engines consume
   this build. `ci-build.json` binds its source/tree, Node version, package/lock/
   Vite/workflow configuration and file hashes. Browser jobs verify these bytes
   and exact checkout; required summaries reject any missing, skipped, cancelled,
   partial, stale or failed selected result.
4. Download **that artifact**, verify its manifest, keep build origin distinct
   from release target, preserve the currently published `/lab`, seal the combined
   site and upload it to Pages. There is no second game build in `deploy.yml`.
   `ci-source.txt` is never rewritten to disguise a reused build's origin.

Every runtime plan includes `boot` and `save`: real title/create/appearance/kit,
rendered startup, save/reload/Continue, plus atomic journal purchase and reload.
Each selected suite runs its existing assertions/viewports in Chromium and WebKit.
A release always runs these safeguards even for documentation-only changes.

| Changed area | Additional browser checks |
| --- | --- |
| AI/combat/monsters/damage/projectiles/VFX | combat, monster identity, smoke |
| World/terrain/map/harbor/environment | world travel, smoke |
| Character/save/progression/skills/job tree/mods | opening, journal upgrade, skill lines |
| Equipment/crafting/items/weapons/loot/shop/potions | equipment focus, weapons, items |
| Unknown UI component | menu, HUD, overlays |
| Shared/unknown runtime, build, dependencies, CI infrastructure | smoke, combat, menu, HUD |
| Known local files/registered assets | explicit consumers in `ci-browser-plan.mjs` |

Plans union these families, including deleted/renamed paths. A single shared file
selects six suites / 12 engine jobs, **not all 27 suites / 54 engine jobs**. Large
cross-area changes can legitimately union more suites. AST-proven equipment
narrowing retains its existing consumers. Unknown paths select the shared risk
set, not zero checks. This is a deliberate demo risk tradeoff, not proof of full
regression or a computed dependency graph. All core tests remain mandatory.

## PR followups and evidence

Required `test`, `review` and `field-hud` status names remain. Separate head/merge
UI/HUD evidence remains when trees differ. Selected checks have one execution
owner; no passing checkbox substitutes for machine evidence.

A synchronize event changing **only** root README/AGENTS/CLAUDE or `docs/*.md`
(including nested markdown) can reuse a prior successful same-PR run. The resolver
verifies unchanged runtime/tests/configuration at both the new head and merge,
commit ancestry, original workflow/base/head, complete jobs, build digest and
manifest. A newer incomplete/failed run, new runtime base drift, policy/test/asset
edit, missing receipt or expired artifact selects normal affected validation.
The summary names the original run/source and says no new browser run is claimed.
No build is relabelled. Consecutive prose followups can trace back to the original
successful build. If a prose followup has no fresh reusable build, main performs
its own bounded startup/save gate once against the published baseline.

## Publication, queueing and rollback

The `pages` concurrency group uses `cancel-in-progress: false` for main, Lab and
manual rollback. A newer merge cannot cancel the active release or its reusable
validation: release-validation groups are run-unique, PR groups alone cancel
obsolete revisions, and regression has separate groups. With GitHub's default
single pending slot, newer arrivals **replace pending runs**; this is not a
promise that every merge/dispatch runs, or FIFO by dispatch time. See
[GitHub concurrency semantics](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

After Pages accepts the artifact, bounded WebKit startup/save/Continue verifies
the live release receipt in an isolated browser context. The deployment job has
a 12-minute ceiling. A postrelease failure leaves the run red and site published;
there is no automatic rollback, source revert, save deletion or data migration.
The live checker uses the reviewed workflow harness, including for legacy rollback.
It is not a hardware iPad performance certification.

To restore bytes explicitly, open **Deploy to GitHub Pages → Run workflow** on
`main`, set `rollback_run` to a successful main Pages run ID, and leave
`rollback_previous` false. To restore the previous successful site retained by
that run, also set `rollback_previous` true. This is useful for the first release
under this policy: it checkpoints the pre-policy successful main site before
replacing it. Select a retained artifact; an expired/missing archive fails with
no rebuild fallback. GitHub archive digests, original successful publication,
source receipt and all site file hashes are verified. Selection uses the successful
deployment step timestamp across complete run history and every attempt, not run
creation order. A later failed retry cannot hide an earlier publication. The
selected archive must have been created during that published attempt, before
publication; a newer unpublished replacement is rejected. Legacy sites keep their
original bytes without adding or changing metadata. Player storage is untouched;
code rollback does not promise compatibility with saves created by later code.

`github-pages` and `previous-site` request 90-day retention, subject to repository
retention limits and artifact deletion. This is retained-artifact rollback, not a
permanent archive. No paid storage is added. An explicit pending rollback can also
be replaced by a new arrival; inspect its actual run status and redispatch after
the active release if needed.

Lab-only publication restores the current published game artifact, replaces only
`/lab` with the successful same-repository Lab artifact, and reseals the combined
site. It does not rebuild the game or change its source identity.

## Full regression and visible failures

`CI` starts a separate full run after the Pages workflow completes, and remains
manually dispatchable. It is never a dependency of publication. It tests the exact
upstream workflow SHA (a rollback's CI run therefore checks the current workflow
source, while bounded live verification checks the restored game). The complete
27-suite / 54-engine inventory is retained. Full WebKit exploration/Dreamloop and
crafting/loadout/reload moved from the publication path into an additional full
regression job. Their failures remain red with retained reports and screenshots;
there is no failure waiver or automatic revert. Full runs can compete for hosted
runner capacity; they are separated logically, not given reserved capacity.

## Timing evidence and limits

Observed successful [CI run 37782090006](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37782090006)
at `c70cae592b403b9196b89de9a1f495ee18952f86`, obtained from job start/end timestamps:

| Job | Seconds |
| --- | ---: |
| Build/core/tools | 168 |
| Boot Chromium / WebKit | 346 / 153 |
| Save Chromium / WebKit | 119 / 140 |
| Smoke Chromium / WebKit | 392 / 314 |
| Combat Chromium / WebKit | 395 / 251 |
| Menu Chromium / WebKit | 156 / 196 |
| HUD Chromium / WebKit | 726 / 490 |

Using those existing jobs as a proxy, fresh startup/save validation has
168 + max(346,153,119,140) = **514 seconds** of dependency-path work; the shared
six-suite plan has **894 seconds** (168 + 726). These exclude baseline lookup,
artifact transfer, queueing, gate summaries, Pages and the live check, and are
**not measured new end-to-end durations or delivery promises**. Verified PR reuse
removes the build/browser segment from the publication path. No new measured
speedup is claimed until the approved workflow runs. Core/build and browser setup
costs may change; Actions summaries and JSON reports retain actual timings.

Local contract validation: `npm run test:tools`, JavaScript syntax checks,
YAML parsing and actionlint. Archive tests exercise real ZIP/TAR extraction and
positive/negative identity, routing, failure, concurrency, checkpoint, rollback,
retarget and prose-followup cases. No production workflow is dispatched to test
this policy. Activation remains a separate review/merge decision.

## First activation and rollback rehearsal

Wait for the already-running pre-policy publication to reach a terminal result
before merging the reviewed PR. This avoids overlapping old and new workflow
definitions; do not cancel or rerun that publication to activate this policy.
If it fails, inspect whether its Pages step already published, resolve that
status explicitly, and keep the last successful artifact as rollback baseline.
Then merge only after the reviewed head's required checks pass. The first new
release captures its successful predecessor before replacing the site.

Rollback rehearsal does not require a production dispatch: download the chosen
retained archive, verify its API digest and successful run/attempt, restore into
a temporary directory with `restoreSite`, and serve that directory locally. Run
`tests/browser/boot.mjs` with `BOOT_URL` pointing at the local server and
`EXPECTED_RELEASE` set to its original source. Do not run a build. Hash the
restored files before/after. This exercises archive selection and real
startup/save/Continue in an isolated browser context without changing the live
site or player saves. The deployment action itself remains a separately reviewed
production operation; a local rehearsal does not certify CDN propagation or
hardware iPad performance.
