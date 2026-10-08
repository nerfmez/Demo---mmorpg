# Movement effect resource lifetime investigation

Baseline: `618eec8e22bfeb94bae517f328fb8d952fb8b2b5` (current main when branched).

The loaded Azure Coast scene recreates and then disposes movement shader materials
on every use. Dash/Blink also clone the full hero hierarchy, geometry and a material
per mesh for each afterimage. This repeats CPU allocation, GPU buffer uploads and
program relinking; it is unrelated to the unmerged multiplayer work.

The patch retains bounded, Vfx-owned pools for the same movement surfaces, Leap
landing meshes/dust, and independent pose snapshots. Character setup warms shader
variants. Echoes borrow immutable source geometry; their skeletons and material
remain independently owned. Appearance changes retire echoes before freeing the
old hero; pagehide explicitly clears movement resources. Overflow still renders
and is disposed. No core, content, save, route, CI or gameplay numbers change.

## Reproduction

Build main and the patch into separate directories. Serve them one at a time with
Vite preview (or on distinct ports). Do not run GPU probes concurrently.

```
MOVEMENT_URL=http://localhost:4193/ MOVEMENT_OUT=/tmp/movement-baseline \
  node tests/browser/movement-stutter.mjs
MOVEMENT_TOUCH=1 MOVEMENT_URL=http://localhost:4194/ \
  MOVEMENT_RESOURCES=1 MOVEMENT_OUT=/tmp/movement-fixed-touch \
  node tests/browser/movement-stutter.mjs
node tests/browser/movement-stutter-summary.mjs /tmp/movement-fixed-touch/touch.json
```

`CHROMIUM_EXECUTABLE` selects the installed Chromium; default is `/usr/bin/chromium`.
Touch recording needs Playwright's FFmpeg executable. This environment used the
installed `/usr/bin/ffmpeg` via a symlink in `/workspace/.playwright/ffmpeg-1011`,
with `PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright`.

The probe waits for the real scene/models, grants each movement skill only in the
test fixture, supplies the Short Stride/Short Step AGI requirement, asserts its
half distance, and installs the real quest route. It uses keyboard Space or the
actual touch movement button, records first/second/third uses, and resets charges
between stimuli. Cooldown/save invariants are covered by the focused core checks;
this is a latency probe, not a simulated ordinary skill-acquisition flow.

Instrumentation records rAF gaps, input, simulation/collision, hero/VFX, camera,
streaming, HUD, route slices, renderer submission, long tasks and GL allocation/
program calls. GL compile/link calls enqueue work: their call duration is not GPU
completion time. Large renderer submission stalls on SwiftShader must not be
reported as physical Android/iPad performance. The actual user's device remains
unconfirmed. No physical-device evidence was obtained.

The first baseline fixture accidentally left Short Step inactive (AGI 3). Its
normal cases remain useful; all Short Step numbers in the accepted comparison
come from corrected, asserted AGI 20 reruns. Do not cite the discarded labels as
mod coverage.

## Validation and visual review

Technical and visual acceptance are separate. Criteria: real hero pose snapshots
at the original times; original number/color/lifetime of trails and dust; no stale
pose, residual echo, missing landing effect or hidden terrain/route/UI; no new
movement privilege or gameplay rule.

Focused checks: skills/combat-fx; frontier-content/frontier-acquisition (movement
mods, v13/treeRevision3 preservation); pool overflow/cleanup and independent
skeleton/morph snapshots; production build. Full unrelated suites are not rerun.

Measured comparison, artifact identities, inspected frames and remaining review
limits are recorded below once the exact fixed runtime capture has completed.

## Accepted results (2026-10-08, Chromium + SwiftShader)

All four skills were exercised three times per combination, in desktop 1024×700
and touch 844×390, normal/Short Step, route OFF/ON. The `before-*-normal.json` files
exclude the invalid early Short Step labels; `before-*-short.json` are corrected
reruns. `after-*.json` cover the complete fixed matrix. Each file contains per-use
frame-gap p50/p95/max, long tasks, CPU timings and GL call counts, not average FPS.

A compact comparison of **second/third Short Step uses across both route states**
(four uses per skill) follows. The touch runs are both recorded at real speed.

| Touch metric | Before | After |
|---|---:|---:|
| Dash effect construction max | 74.8 ms | 0.3 ms |
| Blink effect construction max | 94.5 ms | 0.5 ms |
| Dash new buffer uploads / program links | 1410 / 20 | 0 / 0 |
| Blink new buffer uploads / program links | 710 / 20 | 0 / 0 |
| Roll program links | 4 | 0 |
| Leap program links | 7 | 0 |
| Dash frame-gap p95 / max | 1250 / 1316.7 ms | 516.6 / 666.6 ms |
| Roll frame-gap p95 / max | 1116.6 / 1349.9 ms | 533.3 / 766.6 ms |
| Blink frame-gap p95 / max | 1383.2 / 1400 ms | 633.3 / 933.3 ms |
| Leap frame-gap p95 / max | 1416.6 / 1633.3 ms | 333.4 / 716.6 ms |

For the same desktop Short Step repeat subset, Dash CPU max is 32.5→0.3 ms,
Blink 78.7→0.4 ms; both have zero new buffer uploads/program links after the fix.
Across the complete fixed matrix, Dash/Blink effect work maxes at 1.3 ms on desktop,
and 0.6/0.8 ms on touch. Ordinary simulation, collision, route following, camera
and streaming are small relative to effect allocation and software rendering.
No neighbouring-region load occurs at this beach location; this does not certify
seam performance or every map. The multiplayer networking change is not merged into the tested branch.

First uses are deliberately retained in the JSON. They are **not all hitch-free**:
the first touch Dash overlaps a delayed HUD portrait refresh (1777.9 ms,
`view.portrait`, 11 temporary program links). The first Leap renderer submission
still takes 776.3 ms while its GPU assets are first used; its repeats are 10.6 and
25.6 ms. These are separate startup/software-GPU costs, not evidence of a recurrent
movement allocation after the fix. Software frame gaps remain visibly poor;
there is no claim of physical-device smoothness or final visual acceptance.

Resource plateau during the last 12 casts:

- Desktop: 83 geometries, 100 textures, 81 programs throughout.
- Touch: 88 geometries, 85 textures, 81 programs throughout.
- Pool disposal leaves 0 active effects, 0 movement pools and no echo pool.
  Desktop textures return to 43, touch to 47; source geometries remain 83/88.
- All retained pools are bounded at at most three idle objects; all leases return.
  Both full-scene runs have no page errors. Unit tests cover overflow, skeleton
  independence, morph snapshots, disposal exactly once and borrowed geometry.
- Skill Lab clear/recast/rebuild checks cover all four skills. Its reset path now
  returns leases, and source changes/tuning changes explicitly retire owned pools.
  The lab fixture measures disposals during clear itself, separately from legitimate
  asynchronous weapon/model rebuilds.

## Exact artifacts and review status

Measured game source: `8c419614339a9f2c577484a62da7236764f79483`.
Final lab/reset integration and reporting edits leave the production game bundle
byte-identical: `main-DIK47iKD.js`, SHA-256
`a0335cea6b245fddfc2f1128bc238d9c10186563b9f6e68e140f83853faa6e90`.

- [Before Short Step Dash, real-speed touch capture](before-short-dash-touch.mp4)
  is the continuous 48–62 s portion of the baseline recording.
- [After, all four skills, real-speed touch capture](after-touch-four-skills.mp4)
  is the continuous 73–118 s portion of the fixed recording. It includes the prior
  landing tail, Dash, Roll, Blink, and Leap; no retiming or interpolated frames.
- Full recordings and raw samples remain at `/tmp/movement-before-short-touch/`
  and `/tmp/movement-after-touch/`; desktop raw samples are `/tmp/movement-after/`.
- Inspected sequential full-scene frames: baseline 48–53.5 s and fixed 75–80.5 s
  at 0.5 s spacing, plus wider timelines. Inspected enlarged Skill Lab Dash/Blink
  at 0.117 s, Roll at 0.117 s, and Leap landing at 0.517 s.
- Visible samples retain a posed blue Dash echo/wake, a purple Blink origin echo
  with destination effect, the Roll silhouette, and Leap stones/dust. No sampled
  T-pose, displaced stale echo or missing landing effect was found. Resource reset
  was checked separately from those visual observations.
- **Interim visual review:** the tools support frame inspection but not direct
  continuous video playback inspection. Videos are supplied for that review;
  continuous-playback and physical-device approval remain outstanding. No claim
  that sampled frames establish smooth motion. Keep the PR a draft until reviewed.

Build and 38 focused Node assertions pass (36 existing core checks + 2 new pool
checks); focused loaded-scene and lab ownership probes pass. CI on the initial
code commit passed build/core/tools and Chromium/WebKit visual/regression jobs;
other automatically routed checks were still running when evidence was prepared.
CI is not a substitute for the outstanding playback/device review. No CI files
were changed, and nothing was merged or deployed.
