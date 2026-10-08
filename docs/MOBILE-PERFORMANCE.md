# High-quality performance without lowering visual quality

The target is the existing **High** graphics preset with lower redundant CPU work,
GPU upload bandwidth and frame-blocking waits. All three presets, defaults,
render resolution floors, shadow map sizes, MSAA, post-processing, grass density,
ambient effects and streaming budgets match main at
`036e6bca897eb2c0318b96dc239f1bd60fcaa7fa`.
There is no additional graphics preset or automatic quality reduction in this PR.

## Changes

- Reject a grass chunk's conservative immutable wind envelope before inspecting
  its individual clumps. Visible chunks retain the same individual sphere tests,
  original transforms and baked colours. Re-entering the camera restores the
  complete authored population. The shadow/render pipeline is unchanged.
- Upload only the live prefix of pooled particle position, colour, size and alpha
  buffers; upload nothing for empty pools. Keep every active particle and the same
  physics, blending and shader. Prefix ranges cover swap removal, spawning and
  multiple updates before a draw.
- Reuse camera and scarf scratch vectors. The scarf's complete vertex/normal and
  simulation-state trace matches the original across movement, large dt, reset
  and teleport; no animation timing or detail changes.
- Prepare HUD portrait shaders and read pixels asynchronously. Return the borrowed
  render target before awaiting GPU completion, free owned resources on success
  and failure, allow only one in-flight request and reject obsolete gear results.
  This removes a synchronous readback wait; it does not remove the GPU work.

## Evidence and limits

See `review/mobile-performance/report.json` for matched High results, exact source
file hashes and resource counts, and `manifest.json` for final artifact identity.
The diagnostic compares the original grass function from the immutable main
revision above against the production scene hook, and original full-capacity
particle uploads against the live-prefix implementation. It alternates grass
measurements and compares complete framebuffer bytes on the same frozen scene.
The scene state, shaders, lighting, sun/shadows and screen grade are shared.

Matched High results (particle bytes per draw; median culling CPU across 4×64 samples):

| Scene | Particle upload before → after | Grass CPU before → after | Framebuffer difference |
|---|---|---|---|
| beach | 131,200 → 3,680 bytes | 0.65 → 0.10 ms | 0 changed channels |
| town | 131,200 → 3,744 bytes | 0.70 → <0.10 ms (timer resolution) | 0 changed channels |
| field | 131,200 → 3,808 bytes | 0.65 → 0.20 ms | 0 changed channels |

High assertions: DPR 2, shadow map 2048×2048 and 4-sample post target. GPU upload
counts measure bytes passed to `bufferSubData`, not memory allocation savings.
Grass timing measures only grass culling under small camera translations; it is
not a full native walking frame benchmark or a before/after full-game FPS claim.
All measurements here use Chromium/ANGLE SwiftShader. Physical phone/iPad speed,
battery/temperature and Safari/WebKit remain outside local evidence.

Final validation: full core **480/480**, focused rendering/portrait/grass/
resolution/particle/scarf checks **23/23**, production build, matched High
framebuffer comparisons, actual joystick input/release and async portrait resource
probe all passed. Exact-head GitHub CI, including browser/WebKit, remains pending.

This is a focused reduction of avoidable work. It does not establish that every
walking hitch is fixed: streaming can still overrun its cooperative budget in an
indivisible build step, and High still pays for its original full-resolution
shadows, MSAA and post processing.

## Visual acceptance

Preservation criteria: unchanged grass population at camera edges/re-entry,
same sharpness, outline, colour grade, shadows, particles and HUD/touch layout.
Inspect the exact production captures `phone-high.png` (844×390, DPR2),
`ipad-high.png` (1180×820, DPR2), and `desktop-high.png` (1280×720, DPR2).
The runtime touch probe verifies actual joystick movement and release on High.
Two actual async portrait readbacks let 79 UI frames progress; both
returned to 345 geometries/52 textures with GL error 0.
Static captures and exact pixel comparison are separate from motion judgement.
There is no claim of physical-device or continuous playback inspection.

## Reproduce

```sh
npm run build
node --test tests/core/rendering.test.js tests/core/portrait-lifetime.test.js tests/core/particle-upload.test.js tests/core/ribbon-motion.test.js tests/render/grass-culling.test.mjs tests/render/resolution.test.mjs
PERF_OUT=/tmp/high-performance node tests/browser/mobile-performance.mjs
```

Use `CHROMIUM_EXECUTABLE` to select an installed Chromium executable. The paired
reference requires the main revision above to exist in the local git history.
CI browser smoke remains governed by the existing scope rules; no workflow or
repository setting is changed.
