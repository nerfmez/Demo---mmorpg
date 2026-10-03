# Matched approved-city performance review

Baseline: `85fe85a70cdae43376aec811a2767f366e8587b6`. After: approved V3 integration on that base. Exact release head is recorded in the PR and delivery report.

Both use Chromium SwiftShader, viewport 1180×820, touch/mobile browser context, device scale 1, seed 9, medium quality, dynamic resolution off, paused simulation, identical camera coordinates/zoom/fog. Frame samples include render plus requestAnimationFrame scheduling (12 samples/view; p95 is maximum), with the ordinary render loop still active. They are software-renderer observations, not physical-device FPS or isolated GPU draw timings.

| View | Calls before → after | Triangles before → after | Frame p50 ms before → after | Frame p95 ms before → after |
|---|---:|---:|---:|---:|
| fountain | 352 → 340 | 405,930 → 470,924 | 1146.4 → 1403.7 | 1798.4 → 1942.8 |
| east-facing-house | 184 → 162 | 398,370 → 382,156 | 1131.4 → 1280.7 | 1769.2 → 1938.8 |
| overview | 642 → 513 | 1,142,979 → 793,242 | 2357.1 → 2195.8 | 3576.4 → 3380.7 |

Fresh local page readiness: 18,676 → 15,316 ms. This is one local cold-context observation including shaders, imported models and the water bake; it is not public-network load latency.
Total decoded GLB response bytes: 4,885,472 → 10,339,840. No HTTP/page errors occurred.

The approved source has 13 chunks / 7,028,440 bytes / 274,215 placed triangles. Excluding prototype Sea/Trees and stripping unused UV/tangent buffers produces 11 chunks / 5,454,368 bytes / 263,189 triangles; positions, normals, colours, indices and node transforms are preserved exactly. No geometry decimation.

Source mesh draws: 1,472. Native surface/hull/feature-edge static batching: 2,411 → 143 draws across 158 objects. Latest cold city parse/batch readiness 7947.7 ms; one-time actual native/source water-contact bake 678.1 ms / 206 sections.

The static-city resource probe remains at 101 geometries / 12 materials / 123 root children across all review views. Whole-game geometry counts also include native grass/pooled rigs/shaders, so they differ by visited view.

Calls improve in these three views, but the fountain triangle count and close-view software timings increase. No claim of overall speed-up or physical iPad/phone 60 FPS is made. Physical-device city performance remains unmeasured. Raw measurements and matched before/after screenshots are in the delivery bundle.
