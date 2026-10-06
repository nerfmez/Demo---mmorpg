# PR80: isolated streaming instrumentation (not an optimization)

## Source and release boundary

Baseline: `1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c`.
Lifecycle candidate / PR80: `08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24`.
This tools-only branch is stacked on PR80. It changes no tracked runtime file, CI,
settings, gameplay, map data, save or quality preset. Do not merge or deploy either
branch on the strength of these helper tests.

`prepare.mjs` exports an exact committed source into a NEW directory outside the
repository. Only that disposable copy receives profiling wrappers. The normal
build imports none of the recorder. A profiling copy additionally requires BOTH
`vite build --mode profile` AND `?profile=1`. No automatic network upload occurs.
Keep profiling builds local or on an explicitly authorized private test runner;
never publish them as the game release.

## What was actually verified in this follow-up

- Main and PR80 still point to the two SHAs above; PR80 remains draft/unmerged.
- PR80 CI run 37367011170 attempt 1: prepare/build/core/tooling passed; 8 browser
  shards passed and 16 were cancelled. WebKit summary log reports
  `PREPARE=success`, `BROWSER_RESULT=abandoned`: this is a propagated incomplete
  run, not a failed gameplay assertion. No cause of the cancellations is inferred.
- A single-job rerun request was made for the cancelled WebKit world job. The
  latest job list has 9 successful browser shards and 15 cancelled; the overall
  gate is still not green. The downloaded attempt-2 WebKit world report confirms
  all three scripts (`map-travel`, `open-world`, `open-world-city`) exit 0 at 08bf5cb.
  Its artifact ID is 11384745454; ZIP SHA-256:
  `434a06770e15b547ce08500520bf104f99520db6c90e790089b8689d0e8c8b9e`.
- Existing candidate Chromium world artifact 11368179084 is complete/clean at
  08bf5cb and has all three scripts exit 0. ZIP SHA-256:
  `2ad68a1049d287cd2dff409cbac692949fae0ea8ca269c8f36015b3d73ea2c47`.
- Candidate build artifact 11368093837 source marker is 08bf5cb; its SHA-256 is
  `a1ece705a453b62a69effca246c93e79f834988ab3f06275a05ace8411a4e5be`.
  Of 269 files, 266 match the main build byte-for-byte. Differences are the main
  JS bundle/name, its index reference, and source marker. Asset equality is NOT
  proof of identical runtime pixels or successful resource disposal.
- The original 14 isolated lifecycle contracts were rerun locally: 14 pass,
  0 fail/skip/cancel. Recorder/overlay/protocol contracts: 16 pass, 0 fail/skip/cancel.
  They use instrumented doubles where needed; these are NOT GPU memory samples.
- Overlay generation and JS syntax were checked against the exact baseline and
  candidate region.js/grass.js. The other full-source overlay integrations and a
  full profile Vite build have NOT been run in the chat container.

## Navigation timeout: established facts, not an invented cause

Renderer workflow 37367011262, Chromium visual job 111954511269:

- Current build succeeds, Vite reports 553 ms.
- Failure is `page.goto` at render-light.mjs:18, waiting for `load` at
  `http://localhost:4193/?fresh=1&seed=9&quality=high`, after 30,000 ms.
- This precedes modelsReady/game readiness, screenshots and quality assertions.
- The preceding successful baseline uses OLD SHA
  `58bc3db4f929eb699b2e5d40fac43638b0151ccb`, not main 1c6d226. It is served by
  Python on 127.0.0.1:4194; the candidate uses Vite on localhost:4193.
- The candidate report is empty scenes/errors with no `ok:true`. The archive has
  old-baseline screenshots, NOT a candidate screenshot. Empty errors does not
  establish successful boot or exclude a main-thread stall.
- The current test discards preview stdout/stderr and stores neither outstanding
  requests, request failures, navigation milestones nor a browser trace. Thus
  the exact cause (blocking preparation, resource load, browser or server issue)
  cannot be distinguished retrospectively from the retained evidence.
- The existing timeout is NOT increased and the failure is NOT waived here.
  The new runner retains the SAME total 30-second navigation deadline, records
  commit/load separately and captures request/response/completion/failure,
  console, page/crash events, server output, trace and partial profile when readable.

Other status distinctions: main full CI 37362649227 has 12 successful browser
shards and 12 cancelled. Pages 37362649844 has cancelled prepare and skipped
build/deploy. PR80 Azure layout and both UI jobs were cancelled; Combat HUD's
Chromium scope-only job skipped its browser test, and its WebKit job was cancelled.
These are not successful visual certifications or demonstrated code regressions.
The annotation GET endpoint was rejected by the connector allowlist; that access
limitation does not establish a runner permission failure.

## Actual visuals inspected and their limits

Candidate Chromium seam approach/arrival shows connected terrain, grass, trees,
NPCs and the outpost kit; matching baseline arrival has the same visible scenery
layout. Candidate WebKit seam approach/arrival and the imported-city test image
were inspected separately. A WebKit arrival capture does not yet show the outpost
kit visible in Chromium; the ordinary crossing test waits only for static-ready,
not imported-ready. This remains an observation requiring a settled capture, not
proof that the kit was permanently lost. The dedicated imported-city test awaits
region.ready and checks city existence and frozen world matrices within 0.01 m.
Its screenshot does not inspect every district of Azure.

The map-travel fallback capture contains a blank world edge. That test explicitly
uses `stream=0`; do not confuse its one-map fallback with the seamless test or
quietly certify the blank area as correct normal-game presentation. Existing
fallback tests verify saved slot/map discovery. Existing world tests are controlled
fixtures, not combat playthroughs; some reposition/delete monsters for setup.
No new six-roundtrip / real-WebGL mid-build-cancellation / memory plateau test has
completed here. Physical iPad validation remains missing.

## Existing runtime observations are NOT the requested paired benchmark

| Existing job evidence | Build CPU total | Largest generator resume | Frame samples |
| --- | ---: | ---: | ---: |
| Main Chromium world | 3423 ms | 260 ms | 0 |
| Candidate Chromium world | 9686 ms | 977 ms | 2 |
| Candidate WebKit world (rerun) | 5680 ms | 122 ms | 0 |

The existing tests use a 600 ms streaming budget, different runners/times, and
start the frame observer too late to capture all work. The two-sample reported
33 ms p95 is unusable for this task. No p99, stall-count comparison or real memory
trend is certified. These numbers neither prove a speedup nor a slowdown caused
by PR80. Controlled completed A/B pairs in this follow-up: **0 of 3**.

First bottleneck to investigate: the long, indivisible generator resume (one
observed candidate Chromium step takes 977 ms). A nominal 6 ms loop cannot
interrupt such a step. The new nested labels should identify the responsible
terrain/environment/batch/bake stage. Propose splitting ONLY that worst measured
stage at safe ownership boundaries, then repeat the same protocol. Risks are
interleaved region-shift state, cleanup on early return, and delayed imported-ready
publication. This is a proposal only; no scheduler, chunking or quality change is
implemented. A global budget alone cannot solve an indivisible 977 ms operation.

## Run on an authorized host (Node 22, full repo, Playwright system dependencies)

Do not run this recipe on a host whose browser navigation is administratively
blocked. The previously tested local route returned ERR_BLOCKED_BY_ADMINISTRATOR;
that route was stopped, not bypassed by changing flags, ports, policies or hosts.
GitHub Actions is an independently authorized route used for the focused rerun.
No workflow is added/modified to force a benchmark. The complete profiling recipe
below still requires an authorized runner/session capable of executing it.

From a full checkout containing this tools branch and both source commits:

```bash
node --test tools/perf/self-test.mjs
# Run normal source validation before producing overlays, not via CI shard runner
# inside a source archive. Profile copies intentionally do not have a .git folder.
ROOT="$PWD"
LAB=$(mktemp -d /tmp/pr80-profile.XXXXXX)
node tools/perf/prepare.mjs 1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c "$LAB/baseline"
node tools/perf/prepare.mjs 08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24 "$LAB/candidate"
(cd "$LAB/baseline" && npm ci && npm run build -- --mode profile)
(cd "$LAB/candidate" && npm ci && npm run build -- --mode profile)
(cd "$LAB/candidate" && npx playwright install --with-deps chromium webkit)
PERF_QUALITY=medium node "$ROOT/tools/perf/run.mjs" "$LAB/baseline" "$LAB/candidate" "$LAB/chromium-results"
BROWSER=webkit PERF_QUALITY=medium node "$ROOT/tools/perf/run.mjs" "$LAB/baseline" "$LAB/candidate" "$LAB/webkit-results"
```

On an authorized software-GPU runner, explicitly set `PERF_SOFTWARE_GPU=1` for
Chromium; do not label that result physical iPad or hardware 60 FPS. Do not use the
flag as a workaround for an administrator block. Inspect actual GPU identification
in the result. No blanket browser policy or sandbox bypass is provided.

The runner uses AB / BA / AB order, three fresh browser processes per variant,
identical lockfiles, quality, seed, viewport/DPR, dynres=0 and streamBudget=6.
Each run: cold-open; first neighbour load; six keyboard roundtrips; evict-return;
mid-preparation cancellation; re-enter; five quiet samples after each checkpoint.
Setup points use freeSpotNear and camera snap (not continuous walking between
points). No monster deletion, fake invulnerability, gameplay or save mutation is
added by this harness; a combat-obstructed route fails and needs protocol review.
It stops the experiment on failure, including an administrator block, without
retrying until green. Large profile/diagnostic buffers fail when truncated.

## Measurements and interpretation

- `terrain.build.next`, `environment.build.next`, `grass.bake.next`: active CPU
  resume spans, excluding time suspended between frames; native return/throw forwarded.
- `batchStatic`: synchronous CPU time; `gpu.readback.sync`: caller-side synchronous
  wait/submission duration, NOT an elapsed GPU timer query. Shader compile and
  renderer submission are separate nested spans; do not sum overlapping spans.
- `city.preload-assembly`, `city.postload-assembly`, `town-kit.postload-assembly`:
  synchronous assembly intervals. `city.dressing-wall` includes asynchronous time.
- `gltf.request+parse`: whole GLTF operation, NOT network-only. ResourceTiming and
  runner network events separate resource fetches; opaque/cross-origin timing may
  be unavailable. GLTF concurrency and pending network requests have distinct counts.
- `streaming.frame`: one aggregate duration around all neighbours in that call;
  per-frame streamingCpuMs is retained without changing scheduling.
- Per-phase View.render start-to-start intervals: nearest-rank p95/p99/max, counts
  over 33/50 ms, hidden flags and raw samples. Startup before the first render is
  separately visible; initial recorder time is not identical to navigation start.
- renderer.info counts include all render passes in the profiled frame, not only a
  post-process quad. These remain COUNTS, not GPU bytes.
- Quiet samples: actual renderer counts, optional approximate performance.memory,
  and Chromium Runtime.getHeapUsage (no forced GC). WebKit unsupported heap data is
  null. GPU bytes remain null, never extrapolated from material counts.
- Instrumentation/trace overhead is retained and identical across variants. Its
  full browser overhead has not been measured. Snapshots/diagnostics and data
  export are performed outside target streaming spans where practical.

Review raw profiles, partial failure reports, actual screenshots and source
manifests before making any safety/performance claim. Self-tests are not a
substitute for a successful profile build, repeated runtime traversal or iPad play.
