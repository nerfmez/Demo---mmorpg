# Frontier readiness timeout repair

Coastal source before this repair: `27eee8e0005f499878d6275e88f8b6a846095b0d`.
Main baseline: `cde062bb5251066703dcb007359dfe4e5f33a15f` (merged PR #124).
This is a scheduling follow-up in the same draft PR #126. No merge or deployment.

## Failure and causal evidence

The actual failure is the first Frontier-neighbour readiness predicate in
`tests/browser/open-world.mjs:58`, after initial loading and placement at
Azure local/global (-60, -92). It is not the initial loading predicate at line 31.

- [Main world job 113652614099](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37878337844/job/113652614099)
  checked out cde062bb and failed the 420000 ms wait at line 58.
- [PR world job 113690893562](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37890543302/job/113690893562)
  checked out 27eee8e and failed the same wait.
- Downloaded and inspected [main output artifact 11593412797](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37878337844/artifacts/11593412797)
  and [PR output artifact 11599135358](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37890543302/artifacts/11599135358):
  map travel and city passed; only open-world failed in each Chromium world shard.
  Neither archive contains failure-time queue state or an open-world failure frame.
  WebKit world passed on both sources. PR HUD/review/test gate logs reject the
  aggregate `BROWSER_RESULT=failure`, rather than a separate UI assertion.

To go beyond the earlier 60-second probes, the original first-neighbour wait was
run through completion with CI's Playwright 1.56.1 / Chromium headless shell
141.0.7390.37 (revision 1194), the original SwiftShader flags, viewport 1180x820,
mobile/touch context, fresh seed 4, Low test preset and streamBudget=600.
Instrumentation observed the original promises and generator resumes; it did not
replace GPU operations, force an extension fallback, alter assertions or timeouts.
The executor has four CPU cores; its host/OS is not the GitHub runner.

Before the repair, the local original wait succeeded inside 420 seconds. The
diagnostic stopped deliberately immediately afterward, before later test stages;
its sentinel exit is not a reproduced timeout. Both required neighbours completed.
The full trace exposed the following Frontier critical path:

| Observation | Before | After |
| --- | ---: | ---: |
| First Frontier GPU submission to ready observation | 332.872 s | 223.621 s |
| Generator steps | 462,339 | 462,339 |
| Async shader preparations, including grass variant | 163 | 163 |
| Shader promise settlement time, summed | 2.918 s | 2.274 s |
| Delay from shader settlement to generator resume, summed | 94.804 s | 0.943 s |
| Async grass readbacks | 46 | 46 |
| Readback promise settlement time, summed | 216.650 s | 219.045 s |
| Delay from readback settlement to generator resume, summed | 16.212 s | 0.412 s |

Moonroot also completed the same 177,521 steps in both traces. Through first
Frontier readiness there were 83 async reads and zero synchronous reads in both
complete game traces, including initial-world work. Required work was retained.

`regionSteps` publishes a neighbour only after grass baking and shader preparation.
Grass reads restore renderer state and yield an async fence. Shader preparation
submits batches of 16 exact objects. Three's compileAsync fallback waits 10 ms even
for ready programs when KHR_parallel_shader_compile is unavailable. The queue then
placed every settled promise behind afterPaint (rAF followed by a task), adding a
whole software-rendered game frame before each continuation. This magnified short
shader waits into approximately 95 seconds of extra latency, on top of slow GPU
grass fences. Increasing the CPU slice budget cannot remove these paint barriers.

The controlled change removed approximately 109 seconds from the complete local
critical path while retaining the same work and readback cost. This establishes
the paint barrier as a causal bottleneck in the failing readiness path. Historical
CI logs do not establish the exact pending GPU stage at their 420-second expiry;
no claim of a captured CI deadlock or a green rerun is made.

## Minimal repair and lifetime

Only `src/render/build-queue.js` changes production behavior. Settled GPU work
wakes a future timer task, replacing a pending paint-gated drain when necessary.
Completions coalesce and still use the shared round-robin queue and its six-ms
aggregate slice budget. Remaining CPU work continues to wait for paint. GPU
continuations may run between paints; this is a task budget, not a hard guarantee
of six milliseconds of total work per rendered frame.

Startup ownership temporarily selects the existing MessageChannel scheduler for
both ordinary and GPU continuation tasks, then restores both exact prior
schedulers. Cancellation still retains an in-flight read target until settlement;
the subsequent budgeted task closes the generator instead of publishing success.
No async readback, shader preparation, neighbour or resource cleanup is skipped.

The browser test now saves best-effort world/position, neighbour job states,
cancellation, CPU stats and errors on failure. Assertions and all original
timeouts are unchanged.

## Validation and visual scope

- PASS: complete original `tests/browser/open-world.mjs`, using the CI Chromium
  revision. First readiness, atlas placement, both actual keyboard crossings in
  the same document, Azure eviction, rebuilding and final Frontier eviction.
  All 16 owned wreck/weapon geometries disposed; rebuild restored exactly 16,
  with a new owned wreck and hidden weapon props. No console/page errors.
- PASS: 75 affected core checks across frame queue, startup scheduling/drawing,
  grass lifetime, region lifetime/shaders, material lifetime, seams, maps and
  world routes. Four added cases cover prompt GPU resumption, coalescing/fairness,
  eviction after GPU settlement and startup scheduler restoration. The first
  three also fail against the unchanged old scheduler.
- PASS: real-WebGL `grass-bake-equivalence.mjs`: all three maps, three chunks and
  773 clumps each; zero input, colour-attribute and High blade-framebuffer
  differences; zero remaining fixture geometries/textures after disposal.
- PASS: three coastal-boundary tests and production build. Existing bundle-size
  warning remains. Final bundle is `main-DTU0Xpkc.js`.
- REVIEWED: actual output pixels in `01-azure-looking-west.png` and
  `02-frontier-after-crossing.png` from the passing open-world run, 1180x820 Low.
  Ground, grass, trees and road are present on both loaded maps. Sampled frames
  establish appearance at those endpoints, not continuous playback or hardware FPS.
- REUSED: the approved High coastal evidence in `COASTAL-SEAM-REPAIR.md`. Ground,
  terrain-domain, region and grass source blobs are unchanged from 27eee8e;
  no material, quality preset, coast/wet mask, atlas phase, contact, core rule,
  save, collider, UI or asset change accompanies this scheduling fix.
- NOT RUN: whole CI/workflows, broad browser suite, AI runs, physical iPad,
  new WebKit run, or new High seam renders. The owner will run CI and decide merge.

Local evidence SHA-256 identities:

- Complete before readiness trace: `c740a9d3a830f041ef84a296f781f5d29d29521bc616ed8da66812858cbd98c2`.
- Complete after readiness trace: `d9d666c8ff3e07fbedddd644133912c72c08e2f688f6d8b8e62c3db93b2f3109`.
- Passing full open-world report: `7288100bfa34f64fc27a74374ef681d2764e37aa54e6645d45c97c0fb9059f24`.
- Azure runtime PNG: `a4d2d5def28eba7c4594db96bfab3c9ed54547d67ac161f596a8f6cb00e8fa02`.
- Frontier runtime PNG: `21f827787127ecb80309ff77c3d806f38d66c0851325b4d76f093b26d3a4e686`.

These new diagnostic outputs remain in the consuming workspace; they have not
been uploaded as Library files or republished screenshots. The owner's original
private screenshot is not included in diagnostic reports.

Focused reproduction after `npm run build`: use the pinned Playwright browser,
then `node tests/browser/open-world.mjs` and
`node tests/browser/grass-bake-equivalence.mjs`. Run the listed core files with
`node --test --test-isolation=none` and the coastal-boundary test separately.
