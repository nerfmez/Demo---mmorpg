# Open-world continuity and cooperative city assembly — review patch

Base: `767a789b53a296ce6a884e06702ed37eaa71869d`.
Branch created: `perf/open-world-continuity-20261006`.
This document describes a **local, reviewable patch**, not a merged change or a completed device-performance validation. The GitHub upload was interrupted by a tool-level safety-status rejection. The branch still points to the base; there is no partial implementation commit and no draft PR yet. Do not merge/deploy or merge PR80 as a substitute.

## Diagnosis and architecture decision

The existing two-map world already separates rule/collision worlds from streamed render regions, tiles terrain, instances grass and batches static objects in 24 m cells. The measured city post-load block sits outside the old per-neighbour generator budget. That supports subdividing construction before replacing the entire world with a new chunk hierarchy.

References consulted, and their actual relevance:

- [MDN Scheduler.yield](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield) distinguishes yielding into a future task from immediately continuing a resolved promise, and flags limited browser availability. The implementation does not require this API on iPad: it schedules a timer after an animation callback. This creates a rendering opportunity, not a guarantee of a particular physical display frame or a hard 6 ms deadline.
- [NASA-AMMOS 3DTilesRendererJS PriorityQueue](https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/master/src/core/renderer/utilities/PriorityQueue.js) demonstrates bounded concurrent jobs, explicit scheduling and removal/rejection of queued work. Here a single cooperative construction queue is shared by regions, city and outpost assembly. The library's download/parse concurrency mechanism is not incorrectly treated as a substitute for splitting a synchronous mesh operation.
- [Cesium3DTileset documentation](https://cesium.com/learn/cesiumjs/ref-doc/Cesium3DTileset.html) exposes preload and bounded-cache policies separately. This patch keeps the existing 140 m load / 200 m retain distances and extends the larger retention distance along the seam too. It does not import Cesium or its screen-space-error/LOD policy, reduce quality, or invent a device memory budget.
- [Three.js cleanup manual](https://threejs.org/manual/en/cleanup.html) makes resource release an application responsibility. Ownership of a loaded kit is tracked separately from global cached materials and shared textures; removing a scene node alone is not considered sufficient.

**Implemented:** one aggregate preparation queue, native generator subdivisions, full-edge render ownership, coordinate-continuous handover and scoped lifetime/readiness. **Not implemented:** a new global chunk system, worker-based GLTF parsing, a cross-load parsed-template cache, lazy rule-world construction, or changed LOD. Those are not proven unnecessary forever. A parsed-template cache needs a bounded memory/ownership policy and device measurements first; browser HTTP caching alone does not prove parsing is avoided.

## What is split, and what stays synchronous

`FrameBuildQueue` uses a nominal 6 ms aggregate slice and round-robin jobs. Work runs in a task scheduled after rAF, not inside a `Promise.resolve()` microtask loop. Each iterator invocation records elapsed CPU time; an oversized invocation is visible in `maxStepMs`, not hidden as a successful budget guarantee. The old neighbour `stepMs` report is preserved through an observational hook.

Construction now yields within:

| Path | Subdivision |
|---|---|
| `city-ground.js` | Original 512×512 pigment mask, row by row; same pixels and resolution |
| `ground-brush.js` | Shared brush-atlas preparation, bounded byte/daub/tuft groups; same resolution/seed |
| `city-cape.js` | Source triangle clipping and the recursive cape subdivision itself |
| `city-bank.js` | Authored retaining edges and subsegments |
| `city-palette.js`, `architecture.js` | Open-edge detection, feature-edge hashing and line assembly |
| `static-batch.js`, `geometry-steps.js` | Vertex copies/transforms, merged attribute buffers, normals and bounds |
| `city.js`, `city-dressing.js`, `town-kit.js` | File-order mesh/material preparation, placement, contours and batching |
| `ground.js`, `ground-work.js`, `ground-field.js` | Surface raster/blur loops and field rows, terrain tiles and sea tiles |
| `water-contact.js` | Geometry contributions and contact-mask rows/columns |

The original synchronous helper entrypoints remain available to legacy callers. Normal startup and streamed neighbours use the same queue. The global budget does **not** interrupt GLTFLoader's parse internals, arbitrary typed-array allocation, all scene traversals/NPC creation, driver uploads or shader compilation. Those remain possible long steps. Cancellation also cannot preempt JavaScript in the middle of a synchronous call.

## Water/terrain ownership and seam handover

`region-ownership.js` partitions the two linked rectangular maps at their full shared edge, including decorative terrain margins and sea aprons outside the walkable span. It clips actual triangles and interpolates vertex attributes, rather than covering the problem with fog, shader discard or a raised slab. This half-plane policy is specific to the current pair of linked maps; it is not presented as a general irregular-world partitioner.

A scan of **actual production-builder geometry** found:

| Map / geometry | Triangles crossing its ownership plane before | After |
|---|---:|---:|
| Azure water | 28,404 | 0 |
| Azure terrain | 11,600 | 0 |
| Frontier water | 4,564 | 0 |
| Frontier terrain | 15,760 | 0 |

These are rendered-triangle scans on CPU, not screenshot evidence that every shoreline/end cap is visually seamless. Total triangle counts fall because overlapping/out-of-region surfaces are removed, not because meshes are decimated or LOD is reduced. Intersections may add a small number of boundary triangles.

The previous handover could shift the world position about 1.45 m in the sampled crossing: an early source trigger plus an inward destination placement. Normal player walking now reaches the exact shared centre plane; handover performs only `local + sourceOffset - destinationOffset`. Monster/default movement keeps its previous radius-inset bounds. Combat/dead restrictions remain; a destination whose static render region is not ready produces a loading refusal at the real border, not a moved crossing point.

The positive outer boundary is classified into its adjacent authored zone instead of the fallback zone. Raw procedural zone queries are retained for world generation. Source-map discovery is flushed before `enterMap` swaps history, so immediate reversal does not lose the visited area. The existing no-old-world-checks-after-travel test remains in place.

**Explicit terrain-data change:** one Frontier seam-profile sample at local Z=173 (world Z=80) changes height **−0.31 → −0.05 m**, matching Azure's corresponding −0.05 m sample. This repairs a measured 0.26 m height discrepancy and affects the existing seam interpolation band, including its walk height. It is not claimed that absolutely no collision/terrain height changed. No collider boxes, spawn rules, gates, combat values or save schema are retuned.

Tests exercise the gate/central dry samples and the northern dry end in both directions. The southern sampled end is authored water and is explicitly tested as blocked, rather than silently skipped or made walkable. Actual camera pixels, HUD/toast timing and route-display behaviour still require browser/device review; algebraically correct camera shift events are not substituted for that review.

## Ownership, cancellation and readiness

Each import job captures its world/root/region-shift context. Every resumed iterator and its cleanup run with that captured shift; the prior active shift is restored. Late install recomposes frozen world matrices under the current region root exactly once.

An abort closes suspended generators, cleans adopted partial scene roots, frees job-owned source/replacement geometry, private imported material clones and owned textures, and rejects late results. Cached toon/outline resources and shared texture inputs are borrowed. Shader-only pigment texture dependencies survive successful adoption. Repeated disposal is idempotent; an old region cannot evict world caches still leased by its replacement. Grass bake error/cancellation cleanup restores the renderer target/clear state and releases transient resources without swallowing render errors.

Region states distinguish building/loading, `imported-ready`, cancelled and error. The success state follows city assembly, water/contact preparation, installation and the associated outpost import. Initial loading consumers follow a replacement region if the previous one was cancelled; they cannot interpret a cancelled completion as successful readiness. Genuine errors remain errors. The B3 `shaderSource` TypeError is **not** claimed fixed by these changes.

## Executed checks and limitations

**48/48 focused Node contracts passed:** 9 queue/import-owner checks, 7 geometry/surface equivalence checks, 6 seam/gameplay checks, 8 production-region lifetime/readiness checks, the 10 existing map tests and 8 existing encounter-approach tests. Region lifetime tests inject instrumented builders/loaders into production region control flow; they are not GPU tests. The local run of existing map tests replaced only the unavailable legacy-fixture helper import with the same production `loadData()`; its gameplay assertions remain intact except that a border-centre arrival uses the explicit seam-aware free-space option.

Actual source GLB bytes were parsed by the recovered project Three.js modules (`REVISION` 186; main declares Three `^0.186.1`). The final city result had **247 geometry-bearing objects before and after, zero differences** in compared attributes/indices, world transforms, material flags, paint-texture byte hashes and generated city paint shader strings. This proves construction equivalence for that fixture, **not WebGL shader execution or final rasterized pixel equivalence**. No dependency/package/lockfile changes are included.

Three recorded paired CPU probes are retained, including the slow outlier. The final probe's exact numbers are in the evidence JSON. These are Node timings with local GLB bytes and primed ground fields; the candidate uses `setImmediate` as the Node scheduling adapter. They are not iPad or SwiftShader frame measurements, network load times or representative benchmark averages.

| Recorded CPU probe | Baseline city ready | Candidate city ready | Candidate longest individual queued step |
|---|---:|---:|---:|
| Earlier retained run | 3,702.65 ms | 4,373.94 ms | 72.52 ms |
| Intermediate retained run | 4,039.12 ms | 4,094.13 ms | 8.97 ms |
| Final code probe | 3,736.75 ms | 3,965.17 ms | 11.41 ms |

All three construction comparisons match. The final city post-load stage is split into 9,162 iterator calls; its longest call is 5.67 ms in that run. **The retained 72.52 ms outlier prevents any assertion that every call stays below 6 ms.** Total ready time is higher in these runs. The intended improvement is allowing other browser work between construction steps, not an established reduction in total load time.

An additional same-seed rule-world comparison found unchanged circles, boxes, roads, waypoints, bridges, docks and actual spawn positions/rolled levels in both maps. Map reentry retains the pre-existing clearing/regeneration contract, not persistent entities. The source save schema, items, prices, quests and combat/AI definitions are unchanged.

The container could not clone the repository (DNS); source recovery and blob comparisons were used. A single ordinary local Chromium navigation attempt failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. It failed before a WebGL capability result was obtained, so this is **not** a claim that the machine lacks WebGL. No access-policy workaround, new host or benchmark workflow was attempted. There is no final full-source build, browser p95/p99/max frame-time, paired game screenshot, full streaming walk-through, GPU resource plateau or physical-iPad performance result for this patch.

## Reproduce after applying to an authorized full checkout

```sh
# Base identity must be checked before applying; do not reset a newer main.
git apply --check OpenWorld-continuity-767a789b.patch
git apply OpenWorld-continuity-767a789b.patch
node --test tests/core/frame-build-queue.test.js tests/core/stream-geometry.test.js \
  tests/core/seam-continuity.test.js tests/core/region-build-lifetime.test.js \
  tests/core/maps.test.js tests/core/encounter-approaches.test.js
npm run build
# Existing test defaults to a 600 ms software-GPU override; specify production's
# nominal budget explicitly for the requested run and keep its results separate.
STREAM_BUDGET=6 node tests/browser/open-world.mjs
BROWSER=webkit STREAM_BUDGET=6 node tests/browser/open-world.mjs
```

Extend the existing focused route, not CI configuration, for both seam ends, reversal during construction, eviction/reentry and screenshots **after each region's `ready` resolves with status `imported-ready`**. Record p95/p99/max and longest queued step along the same device/settings/route before and after. Existing software-GPU captures alone cannot resolve the real iPad profile.

## Godot port contract addendum

Port the new generators as resumable construction state, owned by one shared per-frame preparation queue. Keep source arrays/meshes at their authored resolution. Resume with the job's own map transform; install atomically under the current region root; distinguish cancellation from failure and ready. Preserve cache/resource leases across replacement regions. Translate the full-edge render partition separately from walkable seam spans. Player handover uses exact atlas translation; ordinary monster bounds and save rounding remain as before. Carry the explicit paired seam-height correction into the heightfield inputs. This addendum accompanies the existing `GODOT-PORT.md`; a full Godot implementation has not been executed.
