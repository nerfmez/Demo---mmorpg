# Map streaming without synchronous grass GPU waits

Source: main `152eb744d242a9260cff5e3479e5f08000a5de54` (tree `372b39f755bc37ad52e5e52e6709bda8638e89d0`). Direct source inspection covered build-queue, grass, environment, region, View, ground caches, disposal/import ownership, Three's actual compile/readback implementation, and affected lifecycle tests. No unresolved source discovery requiring Jev.

The existing 6 ms shared queue cannot bound an indivisible generator step. A High runtime probe found a 307.5 ms synchronous grass readback while building Frontier and a 351.1 ms neighbour construction step. The initial region also overran. Software rendering is used here; these numbers identify blocking operations, not physical phone/iPad FPS.

This revision lets generators yield GPU promises. Waiting jobs leave the runnable queue; completion only schedules a later budgeted task. Abort keeps the bake's private target alive until its outstanding GPU read settles, then closes the generator in its region scope. Eviction no longer calls return directly behind the queue's back. Borrowed renderer target/cube-face/mip/clear state is restored before waiting. The shader is compiled for its actual off-screen target. Per-clump colour inputs are built in batches of 64 and matrices in batches of 128, with partial meshes adopted before yielding. Region materials are prepared before exposing a completed neighbour.

Quality settings, geometry, clump count, baked colour shader, shadows, texture resolution, culling distances and gameplay remain unchanged.

Validation in progress:
- Full local core: 486 passed; focused queue/region/grass lifecycle: 23 passed.
- Build passed. Real WebGL colour/input/framebuffer comparison passed for all three maps, 257 clumps each: zero different components/bytes. Disposal returned that isolated renderer to zero geometries/textures.
- Manual probes: `tests/browser/streaming-stutter.mjs` tests High at the production 6 ms budget, records actual walking plus a clearly marked queue-only phase to separate software-GPU frame cost from construction. `grass-bake-equivalence.mjs` compares production synchronous and asynchronous baking. `streaming-construction.mjs` profiles production assembly with a small output canvas; it is not a gameplay FPS measurement.
- Final assembly hotspot/resource probe, desktop/iPad-sized touch/phone visual review and exact-head CI are pending. Remaining indivisible work is reported, not hidden behind a hard 6 ms claim. No deployment or universal hitch-free-device claim.
