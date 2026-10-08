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
