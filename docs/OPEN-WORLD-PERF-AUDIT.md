# Open-world runtime audit: region lifetime, first small patch

Status: **draft; no merge or deployment authorized. No measured gameplay speedup.**

Baseline: `1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c` (main after PR79).
Tree: `b3e2422c8b46a22db6fa74a1e7069474b94b59f0`.
Audit date: 2026-10-06 Asia/Bangkok (2026-10-05 UTC).

This is runtime/open-world work, not another CI redesign. Preserve coordinates,
city placement, collision, spawning/RNG, saves, gameplay and all quality settings.
Greyfang, weapon creation and bow-skill PR74 are excluded. The existing main CI
run `37362649227` was still queued/incomplete when checked; existing Pages run
`37362649844` reported failure before this patch was published. Its cause was
not diagnosed here. Neither run is evidence for this patch, and neither was
restarted or modified by this task.

## Access and evidence boundaries

GitHub connector source reads succeeded. Direct container Git access failed DNS
resolution (`Could not resolve host: github.com`), so this was not a full clone.
The two changed runtime sources were copied from exact-SHA reads and verified
against Git's blob IDs before editing:

| Original file | Git blob |
| --- | --- |
| `src/render/region.js` | `c6f6f839bb641e68d642fbff5c562c93ed9028d2` |
| `src/render/grass.js` | `76f9e702fa80060e013f2fa35bfadd2287ba0f41` |
| `src/render/dispose.js` (unchanged test dependency) | `09bee24708532aff57edefd1b03fffbf2106d3f7` |

An existing Actions build was available locally. Its `ci-source.txt` identified
the baseline above. A Chromium/SwiftShader attempt to open that build on localhost
failed at navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The attempted URL
used `fresh=1&quality=medium&seed=4&dynres=0&stream=0` to isolate initial boot.
No game ran in that attempt; no browser-policy bypass was attempted. There are
**no valid local before/after frame-time, loading-time, draw-call or GPU-memory
results**, and no physical iPad test. Full npm/build/browser validation of the
candidate was not run locally. The evidence below is source inspection and
executed Node lifecycle contracts with instrumented resource/loader doubles.

## How the baseline actually loads and retains the world

Source references in this section refer to the pinned baseline, not an assumed
future main. Read `src/data.js`, `src/main.js`, the streaming/sync/warmup methods
of `src/render/view.js`, `src/render/region.js`, `src/render/models.js`,
`src/render/city.js`, `src/render/town-kit.js`, `src/render/static-batch.js`,
`src/render/grass.js`, `src/render/dispose.js`, the surface/cache/terrain builders
in `src/render/ground.js`, and the constructor/spawning/travel/enterWorld methods
in `src/core/game.js`. This was a targeted audit, not an inspection of every
shader, AI branch or asset. Direct reads resolved the changed ownership path;
Jev ranking was not needed or invoked.

**Startup.** `src/data.js` statically imports both current map descriptions and
the city data into the browser bundle. `main.js` defines a lazy-looking
`coreWorld(id)` cache, but then immediately calls it for every map. Thus all
current rule/collision worlds are prepared and retained at startup, while not
all rendering scenes are. Whether that cost is small must be measured, not
inferred from the comment. `new View()` drains `buildRegion()` synchronously for
the initial map. Surface/terrain, environment, grass colour baking, static
batching and NPC construction precede normal interactive frames.

**Assets and shaders.** `loadModels()` starts character/monster registry loads
at boot with `Promise.all`. Weapons already have demand loading, an in-flight
map, a template cache and a failed-request guard; do not replace this with a new
weapons system. `warmup()` builds representative rigs/effects and calls
`renderer.compile()` and a draw; `refreshModelRigs()` can compile again after
imports finish. The startup readiness promise also waits for city and existing
VFX assets. City and outpost loaders each instantiate a GLTFLoader and start
multiple files with `Promise.all`, then transform materials/meshes/outlines and
batch on the main thread. These two loaders have no explicit shared template or
in-flight cache across region rebuilds. HTTP/browser caching may avoid transfers;
it does not prove repeated GLTF processing or scene construction is avoided.

**Approaching a seam.** `View.updateStreaming()` starts a neighbour's
`regionSteps` within 140 m of the seam, subject to its along-seam span. It retains
that neighbour until 200 m away. This perpendicular load/unload hysteresis
already exists. The along-span eligibility uses the same 140 m expansion for
both loading and retaining; endpoint oscillation is a possible remaining churn
case. Each neighbour gets its own nominal 6 ms loop; the clock is checked only
between generator steps. A single step can exceed 6 ms, and multiple neighbours
can each spend that budget. It is not a hard global main-thread budget.

**Readiness and crossings.** A completed static region is attached at its atlas
delta. `neighbourReady()` checks for a region object, not the completion of
`region.ready` (the imported city/outpost chain). Crossing can therefore happen
before those imported objects are ready. `switchRegion()` reuses the loaded
region, shifts camera/roots to the new local origin and keeps the previous
region as a neighbour. Immediate back-and-forth crossings can reuse both static
scenes. However, `Game.enterWorld()` clears old monsters, shots, areas, drops and
spawn points and calls `spawnMonsters()` for the destination again. It shifts
allies and retains the character/session. The static scene cache is **not** a
persistent monster-state cache. Do not change this gameplay/RNG contract merely
to make a crossing benchmark faster.

**Leaving and returning.** Outside the retain band the completed region is
removed and disposed; an incomplete build is closed with `steps.return()`.
The ground surface cache is deleted and its three field textures explicitly
disposed. Rule/collision worlds remain in `worlds`; global imported templates
and rig pools remain. Reapproaching after eviction rebuilds the static region
and invokes its city/outpost loader chain again. There is no bounded recently
used whole-region cache. Travel without a ready neighbour falls back to the
existing page-reload path, so removing all reloads would be a larger change.

**Existing per-frame optimizations.** Terrain is already tiled (32 grid cells
per side), fixed compatible scenery is merged per 24 m cell and its transforms
are frozen. Grass uses instancing and culling hooks. Monster views are created
within 58 m, retained to 68 m, sphere-frustum culled, and not posed when outside
the camera; rigs are pooled up to six per type/boss key. Scenery NPCs have a
render-distance guard; functional NPCs, allies and drops have update loops.
The core declares an 85 m AI range, but this audit does not certify all combat
exceptions or AI costs. Shadows and post-processing already follow quality
presets. Object counts, shadow-pass cost and total frame draw calls were not
measured here. Do not claim missing culling/instancing, or solve performance by
silently reducing shadows, resolution, effects or geometry.

## Findings and the first patch

### Correctness defects reproduced in isolated lifecycle tests

1. `inRegion()` manually advanced nested generators but did not forward closing
   them. `regionSteps()` had no cleanup on early return/throw. Completed sections
   and ground caches could remain undisposed after cancellation. In particular,
   the environment was not yet owned by the region root during grass GPU baking.
2. The grass bake's temporary ShaderMaterial was disposed only at normal
   completion, not when its generator was closed between chunks. Exceptions
   during render/readback also bypassed temporary target/geometry cleanup.
3. The grass bake changed the renderer clear colour/alpha and retained a single
   old target snapshot across yields instead of preserving each caller's state.
4. `disposeRegion()` detached NPC scarves before traversing the region to dispose
   it. The detached meshes were therefore excluded from that disposal traversal.
   A repeated disposal also repeated ground-cache eviction for the same world.
5. Although stale imported results were already discarded, the next outpost
   load could still start after a region had been disposed.

**Changes:** unwind nested builds; adopt completed environment before GPU work;
dispose a failed/cancelled region; restore renderer state and temporary bake
resources in `finally`; include NPC scarves in root disposal; make region
disposal idempotent; skip starting the outpost chain for a disposed region.

There is no shader/palette/sampling-resolution change, no threshold adjustment,
and no change to `Game`, save data, world data, collision or spawning. Moving
the environment under the still-detached identity region root is an ownership
change, not an intended placement change. Actual rendered equivalence remains
to be checked. Shared texture/geometry owners are respected using the existing
`disposeObject` contract; the temporary bake material does not own the shared
ground textures. See Three.js's [resource disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html).

**Not fixed by this patch:** started GLTF loads are not aborted; work already
inside city/outpost loaders can still complete before the stale-result guard.
Those loaders' failure cleanup and caching need separate ownership review.
Partially constructed terrain/environment internals before they return are not
claimed universally leak-free. Multi-view cache reference counting, disposal
spikes, shader compilation and synchronous GPU readback are not redesigned.

### Likely hitch sources to measure, not ranked by invented milliseconds

The main-thread paths warranting timestamps first are `createWorld`, initial
`buildRegion`, individual surface/terrain/environment steps, grass
`readRenderTargetPixels`, `batchStatic`, imported-kit preparation/water-contact
baking, shader warmup and `Game.enterWorld`/`spawnMonsters`. Terrain currently
yields every six tiles; surface loops use row batches and several blur passes
without per-operation deadlines. Static batching and imported post-processing
can each run as a single large operation outside a useful frame budget.
A `Promise` does not make the CPU work in its callback run off the main thread.
The actual largest bottleneck and its contribution are not established yet.

## Executed before/after results

Same test file, same Node v22.16.0 container, different render-source directory.
The fixture loads the actual generator/disposal functions while substituting
instrumented Three.js, renderer and async-loader bindings. It does not implement
WebGL, measure graphics memory or run the game.

| Measurement | Baseline source | Patched source |
| --- | --- | --- |
| Lifecycle contracts | 3 passed / 11 failed | 14 passed / 0 failed |
| Skipped or cancelled tests | 0 / 0 | 0 / 0 |
| Undisposed fake bake materials after 25 interrupted bakes | 25 | 0 |
| Real frame p95/p99/max, cold/warm load time | Not obtained | Not obtained |
| Real frame draw calls, JS/GPU memory | Not obtained | Not obtained |
| Physical iPad FPS or thermal stability | Not tested | Not tested |

The candidate also passed `node --check` for both runtime files and the test.
Tests cover return/throw, render/readback exceptions, two-palette output
attributes, per-yield renderer state, empty input, repeated cancellation,
ownership transfer, scarf disposal, shared geometry, late city/outpost results
and the live outpost completion path. Node runner elapsed times were 87.573 ms
baseline and 86.131 ms candidate. **That difference is not a speedup metric.**
The material counter is an instrumented ownership count, not a measured number
of leaked WebGL programs or megabytes.

Reproduce the focused candidate tests from a checkout containing this draft:

```sh
node --check src/render/region.js
node --check src/render/grass.js
node --check tests/core/region-lifecycle.test.js
node --test tests/core/region-lifecycle.test.js
```

Reproduce the deliberately failing baseline comparison without modifying the
checkout (the last command should fail on the old implementation):

```sh
BASE=1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c
OLD=$(mktemp -d)
trap 'rm -rf "$OLD"' EXIT
for FILE in region.js grass.js dispose.js; do
  git show "$BASE:src/render/$FILE" > "$OLD/$FILE"
done
REGION_LIFECYCLE_SOURCE="$OLD" node --test tests/core/region-lifecycle.test.js
```

## Ordered follow-up plan (not implemented without measurements/review)

| Priority | Approach and expected benefit | Risk and bounded scope |
| --- | --- | --- |
| 1 | Validate this lifetime patch in real WebGL; remove cancellation-related retention before increasing streaming churn. | Low-to-medium resource-ownership risk; two runtime files. Not a 60 FPS claim. |
| 2 | Keep map units; timestamp and subdivide the worst indivisible builders. Give all pending regions one global frame-work budget; prioritize nearest traversable seam and bound concurrent preparation. | Medium; rendering scheduler/builders only. A global budget alone cannot preempt one long step. Keep geometry, RNG order and map handoff unchanged. |
| 3 | Deduplicate shared kit fetch/parse, then add an explicitly byte/entry-bounded warm cache or short retention grace. Add along-span hysteresis and distance/velocity prefetch that still allows immediate reversal. | Medium; loaders and streaming policy. Requires shared ownership/reference accounting and stale generation tokens. Prefer preserving adjacent regions over blindly predicting only forward travel. More retention trades memory for fewer rebuilds. |
| 4 | Decouple lightweight atlas metadata from eager rule-world creation; consider render chunks inside a map only when profiling or world growth justifies it. | High architectural scope; inspect HUD/atlas/waypoint consumers of `game.worlds`, collision readiness and save/travel contracts first. Keep authored atlas coordinates/city/collision, not a new world layout. Proposal and owner approval required. |
| 5 | Profile NPC/ally/drop updates, shadow passes and scene traversal before further culling/LOD/instancing. Consider visual LOD or device presets only as explicit options. | Medium-to-high visible/gameplay risk; no silent AI cadence, spawn, shadow or quality reductions. Existing instancing and culling should be retained. |

Prefer stages 1-3 over replacing the whole world streamer now. They target
observed implementation gaps while keeping the authored maps. No benefit
percentage, memory budget, cache size or device-specific quality change is
asserted before representative measurements exist.

## Required real before/after capture protocol

Build the pinned baseline and candidate into isolated local directories/ports;
do not replace production or use personal saves. Record exact source, browser,
GPU/hardware, viewport, DPR/render scale and graphics settings. Use `fresh=1`,
`seed=4`, `quality=medium`, `dynres=0`, normal streaming enabled and the production
6 ms stream budget. Test desktop and touch viewport separately, and use the same
configuration for each A/B pair. Repeat at the owner's normal settings later;
do not present the fixed-quality diagnostic as the default device experience.

Capture initial boot with a fresh browser context and cold cache; then repeated
crossings with the same context, and finally leave far enough to evict the
neighbour before re-entering. On the existing Azure/Frontier gate, approach from
100 m inside, then 8 m, then walk across from approximately 1.2 m inside and back,
using normal movement for the crossing. Repeat six round trips, preserving
spawn/combat rules. Log a refused crossing as refused, not a silent monster
removal. Use a separate labelled fixture to isolate renderer-only cancellation.
Also test entering and leaving the prefetch band before completion, and rapid
reversals near both span endpoints. Do not change the spawn state merely to
improve measured results.

Record raw `requestAnimationFrame` intervals (not the game's clamped `dt`),
p50/p95/p99/max and counts over 33.3/50/100 ms per phase; separate HTTP/parse,
static-ready, imported-ready (`region.ready`) and first rendered frame after
crossing. Record build-step durations and long tasks where supported. Reject
empty sample sets rather than reporting zero or a made-up percentile.

Collect whole-frame `renderer.info.render.calls` and triangles with explicit
handling of multiple render/shadow/post/bake passes (reset at frame boundary,
not silently at each sub-render). Record geometry/texture/program counts and
available JS heap metrics; renderer counts are not GPU bytes. Compare settled
post-eviction plateaus across cycles after model/rig caches warm. Do not force
GC in only one half of the comparison, and do not count a live neighbour as a
leak. Inspect screenshots of both sides, grass colours, water, NPC scarves,
shadows and seams at the same points; verify no missing imports or stale roots.

`tests/browser/open-world.mjs` is useful for continuity assertions, but its
software-GPU default `STREAM_BUDGET=600` is not the production 6 ms budget. It
must not be presented as a device performance benchmark. Use the existing
map/collision/save safety tests plus focused Chromium/WebKit continuity/resource
checks before merge. Physical iPad Safari must be measured separately; browser
emulation cannot establish its FPS, GPU memory or thermal behaviour.
