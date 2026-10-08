# Walking smoothness / weak-phone graphics

Base: `036e6bca897eb2c0318b96dc239f1bd60fcaa7fa` (PR121 movement-pool fix included).
Review: 2026-10-09 Asia/Bangkok. This is a separate optimization of ordinary
walking/graphics; no combat rules, saves, map geometry/collision or CI changes.

## Observed causes and changes

- In the original production walking probe the first loaded-model HUD portrait
  took **5840.7 ms synchronously**; renderer submission inside it peaked at
  3217.5 ms. This is one measured SwiftShader startup/refresh hitch, not proof of
  every reported recurring device hitch. Portrait creation now prepares shaders
  asynchronously and queues non-blocking GPU readback. It restores the borrowed
  target before yielding, retains owned resources until completion and drops
  outdated gear/model results. The caller allows only one request in flight.
- Original grass visibility scanned every chunk whenever the camera moved,
  including far-off chunks. An immutable full-chunk wind envelope now rejects
  those chunks before per-clump tests or upload. The original compaction order,
  attributes and full-density appearance are preserved on other presets.
- Old Low clamped the world buffer to at least DPR 1 even when the resolution
  governor asked for less. Low now permits DPR 0.67. Economy starts at DPR 0.85,
  permits a floor of 0.5, draws a stable 35% of original grass and 30% ambient
  particles, disables shadows/post and uses a shared 3 ms streaming build budget.
  Camera scratch vectors and per-tier settings are reused.

The default for a new coarse-pointer phone (short side under 600 CSS px), or a
coarse-pointer device reporting at most 4 GB RAM, is Economy. Existing stored
choices and explicit URL quality choices win; no device capability is inferred
from FPS. Small-window/coarse devices can choose another tier manually.

Select **เมนู → ตั้งค่า → กราฟิก → ประหยัด**. 3D looks softer and decorative grass
is thinner; HUD text, touch controls, enemies, attack warnings and landmarks retain
their layout/content. Full detail can be restored without reloading the scene.
At the governor's default minimum scale, Economy uses DPR 0.5695, about **32.4%**
of the old Low world pixels. This is a buffer-area calculation, not an FPS gain.
The cooperative streaming budget can delay neighbour readiness; a single build
step can still overrun. Existing safe seam gating and cancellation remain intact.

## Validation and scope

- Production build and whitespace pass. Final focused renderer/grass/governor/
  portrait tests: **22/22 pass**, including compile/render/readback/encoding
  exceptions, restoring state before pending reads, later-frame state preservation,
  row orientation, disposal, wind-edge visibility and reversible density.
- Full core: **478/479 pass** while running alongside the software-GPU probe.
  The unchanged quest-route 50 ms timer test failed under contention; isolated
  quest-route recheck **8/8 pass**. No timer/assertion/production route was changed.
  Exact-head CI still owns the complete premerge gate.
- Original baseline sample: 844×390 touch/DPR2, Low, seed5, native rAF,
  three scene positions and 32 walking frames each. The same production harness
  records rules/HUD/render/grass CPU durations separately from real frame gaps.
- An exploratory candidate overlapped full-core execution; its frame timings are
  retained separately and **not used to establish a speedup**. Final measurement
  runs without that competing suite. It remains a single software-GPU sample.

Final reports/screenshots and results are recorded in `review/mobile-performance/`.
No physical Android/iPad, Safari/WebKit, guaranteed minimum phone specification,
60 FPS or complete elimination of all hitches is established by this review.
No merge/deployment is claimed. This draft remains subject to exact-head CI and
device/owner review.

### Final observed sample

| View | Grass CPU p95 ms: before Low → after Low → Economy | Mean frame gap ms: before Low → after Low → Economy |
| --- | --- | --- |
| Arrival beach | 4.4 → 1.1 → 0.3 | 415.7 → 416.4 → 219.2 |
| Market/town | 2.5 → 0.2 → 0.2 | 466.6 → 563.1 → 327.1 |
| Field | 2.6 → 1.1 → 1.1 | 748.7 → 429.2 → 324.6 |

These are native-rAF **Chromium SwiftShader** samples, not physical phone FPS.
Low frame timing is mixed: town got worse, beach essentially unchanged. Streaming,
first asset use, slightly different walking endpoints and software scheduling
prevent attributing all frame-gap changes to one patch. The scene is still heavy;
there is no claim that every hitch is solved. Field grass count changed from
1188 to 420; total field triangles 368197 → 345157. Economy saves world-pixel
work and grass work but does not reduce town triangle count or all asset memory.
The final streaming queue reported a 304.6 ms indivisible step during the run:
the 3 ms budget remains cooperative, not a hard stall guarantee.

Final real-browser checks pass: Economy UI selection/persistence, Low restores
full grass, sub-CSS dynamic resolution, viewport resize, actual CDP touch joystick
movement/release and real async portrait reads. During two awaited portrait
reads, **31 UI frames progressed**; geometry/textures stayed **268/51 → 268/51**,
borrowed target was restored and GL error was zero.

### Visual review record

Exact final production build; runtime/artifact hashes in
`review/mobile-performance/manifest.json`. Inspected stills:
`phone-field.png` (844×390/DPR2), `phone-settings.png` (same),
`ipad-settings.png` and `ipad-walking.png` (1180×820/DPR2 touch).
Criteria: full-size readable HUD, four reachable quality choices, coherent native
world style at lower 3D resolution, retained hero/monster/landmark silhouettes and
touch controls. All four choice buttons fit on the phone; explanation follows in
the existing scrollable settings body. Tablet explanation remains visible.
3D is visibly softer, as intended; no newly blank scene or lost controls observed.
The existing fullscreen glyph appears as an empty square in this Linux capture;
it was not changed in this scope. This is still inspection plus technical native
frame measurement and real input, **not continuous motion-playback acceptance**.

## Reproduce

```sh
npm ci
npm run build
node --test tests/core/rendering.test.js tests/core/portrait-lifetime.test.js tests/render/grass-culling.test.mjs tests/render/resolution.test.mjs
PERF_CHECKS=1 PERF_OUT=/tmp/mobile-performance node tests/browser/mobile-performance.mjs
```

The harness starts/stops Vite preview and Chromium. Set `CHROMIUM_EXECUTABLE` for
the installed browser. It leaves streaming active, actually moves with simulation
input and does not substitute a frozen scene for timing. The focused visual/UI
checks hold a completed scene only during menu still capture, then restore native
rendering for a real CDP touch joystick interaction and two GPU portrait readbacks.
Do not run CPU-heavy suites concurrently when comparing frame timings.

The [Three.js WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)
documents `compileAsync` and `readRenderTargetPixelsAsync`; implementation was
also checked against the installed Three r186 source. These APIs reduce blocking
CPU waits; they do not remove the GPU work itself.
