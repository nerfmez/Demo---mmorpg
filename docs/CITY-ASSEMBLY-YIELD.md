# Cooperative imported-city assembly — draft, not a device-performance claim

Base: `767a789b53a296ce6a884e06702ed37eaa71869d` (main after PR83/84).
PR80 was read but **not merged or cherry-picked**. No CI/workflow/deployment,
quality, gameplay, save, collision, spawn, asset or map-description changes.
The independent idempotent dispose guard overlaps one small PR80 concern;
its grass-bake/scarf/static-region cancellation changes are not incorporated.

## What is split

`loadCity()` now sends construction generators to one shared 6 ms city CPU
queue. The queue is round-robin across city jobs and restores each job's
captured region-shift context before every resume and cleanup. A visible-tab
rAF callback schedules a timer task, rather than running heavy continuation
inside an rAF Promise microtask. Thus there is a rendering opportunity between
slices. Hidden/no-rAF environments use a 16 ms timer fallback. This is a
cooperative budget, not preemption or a guarantee that every task is <=6 ms.

The actual per-file/per-mesh pass lives in `city-assembly.js`. Cape subdivision
and paving clipping yield within triangles/recursive subdivisions. Material
open-edge analysis yields within a mesh and copies the scratch colour before
suspension. Structure contours yield within edge construction, transformations
and array copies; lazy Map iteration avoids eager enumeration of all edge keys.
Static batching yields in classification, vertex/index expansion, colour and
normal transforms, merged-buffer copying, bounds and cleanup/freezing. Mask
painting yields every 128 pixels without changing its 512x512 resolution.
Dressing downloads do not independently run heavy postload callbacks: template
conversion/contours and placement cloning enter the same queue.

Existing synchronous callers of cape/palette/contour/batch/ground helpers drain
the same generators immediately. Ordering, tessellation, colours, material
selection, shadow flags, 24 m batch grouping and authored transforms remain.
Those shared helpers have wider callers: CPU city equivalence below does not
constitute a full game's visual regression pass.

## Lifetime, ownership and readiness

Each region has an import AbortController and explicit `loading`, `assembling`,
`imported-ready`, `cancelled` or `error` state. Its `ready` promise reports the
terminal success/cancellation status; genuine errors still reject with the
original error and remain observable. Synthetic shaderSource-like error tests
verify propagation only, **not a fix for the historical B3 shader failure**.

City roots stay detached while assembling/batching. Water-contact baking and
installation are queued; installation rechecks lifetime and recomposes using
the region's latest placement. No atlas delta is baked twice into city-local
vertices. `imported-ready` follows city/water installation and any applicable
town-kit completion, not merely network completion or batching.

The city owner tracks its private GLTF scenes, removed nodes, original
materials/source textures and per-load toon clones. The latter are explicitly
owned even though the batcher marks them shared. Cached toon ramps, contour
and hull materials and explicitly shared geometry/textures are borrowed.
Generator cleanup releases unfinished temporary buffers. Abort while loading
settles the wait; a private result arriving later is disposed instead of
installed. This does not claim to interrupt GLTFLoader's in-progress parser or
network request. Native water-contact clones are borrowed and not disposed by
the city owner. Repeated old-region cleanup is ignored on reentry.

## Executed validation

- 24 new focused Node/Three contracts: exact feature edges, per-mesh yielding,
  indexed/colour/normal expansion, merge/bounds, scratch-colour interleaving,
  private/shared cleanup, cancellation during material retirement, late loads,
  queue budgeting/task boundary, shifted installation, cancel-before-install,
  reentry and error propagation. Region boundary tests run production region
  functions with isolated scenery/loader doubles, not a renderer.
- Existing `tests/core/city-cohesion.test.js` unchanged: 3/3 pass, covering boat
  berths, pier seams and cape walking/support. Total executed: **27 passed,
  0 failed, 0 skipped**. Not full core/save/browser regression.
- Actual GLB city + all 248 dressing placements parsed with Three r186; each
  asset's bytes checked against current `city-v3.json` SHA-256 metadata.
  Compared the full city after `loadCity()`/batching: 247 geometry-bearing draw
  objects, attributes/indices, matrices, material properties, shadow flags,
  bounds, ground pigment bytes and generated ground shader strings match.
  The canonical CPU signature on both sides is
  `6bebd1d1f82c0582c69d4a2c20f2feca4a0bcc6fb93f57d681ac232359f4ae7c`.
  Source mesh count stays 955; batch before/after stays 2173/213; object count
  stays 263. These are scene counters, **not renderer draw-call measurements**.

## Timing evidence and limitations

Historical real-iPad A/B reports supplied by the owner identified
`city.postload-assembly`: A `1c6d2269` about 1304 ms; B PR80 `08bf5cbb`
about 1365 ms within B's 1600 ms maximum frame. Their city source matched.
They diagnose the old bottleneck, not the performance of this new candidate.

One final same-container CPU-only before/after probe used the existing
profiling recorder from the previous A/B kit. Native terrain fields and brush
were prepared on **both** sides first, as production region construction does.
GLBs were parsed from local files, with no network, renderer or display frames.

| CPU-only metric | Main before | New candidate |
| --- | ---: | ---: |
| Old uninterrupted postload mesh/contour pass | 2648.79 ms | split |
| Sum of queued assembly/retirement step CPU time | not separately recorded | 2472.54 ms |
| Largest individual assembly generator step | old pass above | 19.12 ms |
| Largest assembly queue slice | old pass above | 20.03 ms |
| Largest dressing / batching step | not separately recorded | 1.64 / 2.75 ms |
| Time until `loadCity()` completed, including waits | 5355.78 ms | 20218.64 ms |
| Browser frame p95 / p99 / max | **not measured** | **not measured** |

The scopes of the old pass and assembly/retirement CPU sum are not identical;
no CPU-speedup ratio is claimed. The candidate's total completion time is
**longer** with the timer fallback. Returning control trades latency for
opportunities to respond/render. The single sample is not a stable benchmark.
The largest preload step was 127.88 ms in this run; even bounded mask spans
can exceed budget through work/GC/host scheduling. Neither 6 ms compliance nor
complete removal of all loading hitches is proven. Earlier development probes
also showed sensitivity to shared-cache preparation and host timing.

GLTF parsing, some scene-graph/native allocation operations, first shared-cache
creation outside the normal region path, fountain/bank creation, water-contact
baking and first shader compilation remain potential long operations. Water
installation is gated but its contact bake itself is not subdivided here.

## Reproduction and release gate

Focused contracts (existing normal test runner, no new workflow):

```sh
node --test tests/core/city-work.test.js tests/core/city-assembly.test.js \
  tests/core/city-import-lifecycle.test.js tests/core/city-cohesion.test.js
```

Direct Git access failed DNS in this environment. The existing A/B artifact
provided source maps and model bytes; changed baseline renderer files,
`core/world.js`, `data/world.json`, `data/city-v3.json`, the data loader and
existing cohesion test were checked against current-main Git blob IDs.
This was a source subset, **not a complete current-main checkout/build**.
A local-only Node import shim supplied Vite's JSON/base-URL semantics for the
CPU probe. No shim, old profiling overlay or recovered dependency is committed.

Chromium in this environment returned no WebGL2 context, including the
SwiftShader attempt. No host/policy workaround was attempted. Consequently
there are **no new game screenshots, no valid browser frame-time measurements,
no SwiftShader performance results and no new physical-iPad results**.
CPU geometry/shader-string equality does not prove pixels, shader compilation
or on-device stability.

Before merge, use the existing device recorder and normal browser checks with
this main baseline and candidate, same device/quality/seed/path, including
cold/warm, pause/cancel, unload/reenter and a shift while import is suspended.
Record longest synchronous work, frame p95/p99/max, total ready latency and
images after imported-ready; keep real hardware separate from software GL.
The old overlay's monolithic city span markers must be adapted to the new
assembly generator if used: queued CPU stats exclude time suspended, whereas
one span surrounding an await includes idle time. No new benchmark service,
CI change, merge or deployment is part of this draft.
