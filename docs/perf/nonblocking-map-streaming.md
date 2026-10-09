# Map streaming without synchronous grass GPU waits

Source: main `152eb744d242a9260cff5e3479e5f08000a5de54` (tree `372b39f755bc37ad52e5e52e6709bda8638e89d0`). Direct source inspection covered the queue, grass, scenery/foliage/meadow/harbor/landmarks, region, View, GPU ownership, Three's compile/readback implementation and lifecycle tests. No unresolved source discovery requiring Jev.

The existing 6 ms shared queue cannot bound an indivisible generator step. A High software-rendered probe found a 307.5 ms synchronous grass readback while building Frontier and a 351.1 ms neighbour construction step. Profiling also exposed a meadow callback constructing 120 patches, or a whole wild row, before yielding. These measurements identify blocking work; they are not physical phone/iPad FPS.

Generators can now yield GPU promises. Waiting jobs leave the runnable queue; completion only schedules a later budgeted task. Abort keeps a bake's private target alive until its outstanding GPU read settles, then closes the generator in its region scope. Eviction no longer calls return behind the queue's back. Borrowed renderer target/cube-face/mip/clear state is restored before waiting. The grass shader is compiled for its actual off-screen target. Texture uploads are prepared one texture per step before first use. Region and imported-kit shader submissions use batches of 16 actual objects before installation; compileAsync alone still submitted the whole map synchronously.

Grass surface construction yields every 64 clumps; instance matrices every 128 items. Scenery projection, foliage cards, meadow candidates/patches, town buildings, harbor structures, landmarks and NPCs also yield in smaller batches. Foliage reuses palette/direction scratch values instead of allocating them per vertex. Partial roots and meshes are adopted before yielding so cancellation releases their resources. Meadow generation retains the exact random-number order and placements.

High quality settings, geometry, plant counts/placements, baked colour shader, shadows, texture resolution, culling distances and gameplay remain unchanged. This adds no economy preset.

## Local validation

- Full core suite earlier in this revision: 486 passed. Final focused queue, grass lifetime, shader preparation, foliage and meadow checks: 28 passed. The five added equivalence/preparation cases are included in the full suite on exact-head CI.
- Final build passed: `main-CsEvPj1y.js` / `main-BRlgWkyn.css`.
- Real WebGL comparison across Azure, Frontier and Moonroot, 257 clumps each: zero different input/colour components or rendered blade framebuffer bytes. Isolated disposal returned geometries/textures to zero.
- Final High walking/streaming probe at 844×390 touch, DPR 1, normal 6 ms shared queue: zero synchronous grass readback calls; Frontier imported successfully, maximum observed neighbour step 28.7 ms. The separate small-canvas construction profile observed 30.1 ms. These remain over the soft 6 ms budget; no hard bound or precise hardware speedup is claimed. Cold initial-region steps still reached 272 ms and startup is not claimed fixed.
- Production View eviction cancelled two pending GPU reads. Both cycles returned to the same isolated renderer counts: 0 geometries / 11 resident textures, with no errors or retained regions. Foliage position/normal/colour/UV arrays and bounds match the prior calculation byte for byte in six seed/tree/shrub cases. Meadow placement and RNG outputs match the prior indivisible implementation exactly.
- Reproduction tools: `tests/browser/streaming-stutter.mjs` records actual walking and a separately labelled queue-only phase; `streaming-construction.mjs` profiles assembly with a small canvas; `grass-bake-equivalence.mjs` compares synchronous/asynchronous production baking. Software GPU rendering and the queue-only phase are not device FPS measurements.

## Visual review

Reviewed the final built artifact `main-CsEvPj1y.js` in runtime stills at 844×390, 1194×834 and 1600×900. These views use the same touch context, High setting and fully imported regions. Character, cel shading, foliage, shore/water, shadows and HUD remain visible; no new material loss or layout fault was identified. Exact blade framebuffer and geometry comparisons above provide stronger preservation evidence than the stills alone. The large viewport is not a mouse-input desktop smoke test. Stills do not prove smooth motion or touch interactions on physical hardware; exact-head Chromium/WebKit desktop/iPad CI must pass before merge. No deployment or universal hitch-free-device claim.
