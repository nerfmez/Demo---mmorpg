# Portrait exception-state guard review

A controlled portrait readback exception on current main can leave the game's borrowed WebGL renderer bound to its temporary 128×128 target. `refreshPortrait()` catches the exception; the next post-processing pass preserves that abandoned target. This change restores the caller's render target, cube face and mip level in `finally`, then releases the owned target and returned hero/scarf. Shared resources retain the existing `disposeObject()` policy. Camera, lighting, dimensions, SRGB output and pixel-row flip remain unchanged.

The original black-wolf/blank-minimap causal connection is **unproven**. No native renderer exception occurred in the actual inventory/skills/weapon-swap probes. The geographic minimap uses a separate Canvas2D cache; this WebGL guard does not establish or repair its reported failure.

Five production-method regressions pass: build, render, readback and PNG-encoding failures retain the original error and release owned resources, plus successful row flipping and borrowed-target restoration. The same tests fail on main `24ff2b43c2be0413a6679077f0edd7698ba501cd`. Production build passes. These results are reused for the unchanged source/test hashes recorded in [verification.json](verification.json).

The exact built candidate also passed a real WebKit renderer test with an intentionally injected readback `TypeError`: 45,096 ms real elapsed, 0.55 simulated seconds, restored target, live context, zero GL/page error, unchanged geographic cache pixels and normal subsequent world rendering. This controlled failure is distinct from the user's unresolved device incident.

| Normal portrait before injected failure | Normal portrait after injected failure |
| --- | --- |
| ![Before](portrait-before-normal.png) | ![After](portrait-after-normal.png) |

Both original 128×128 PNG files are byte-for-byte identical: SHA-256 `36b4244adc436754961e5454064d1d134cbf33d90b6e67ef3047a32490e3b946`. They show the same hair, scarf and face pixels. Their bytes were copied unchanged from the inspected runtime artifacts.

Review was sampled still inspection of the normal portrait and post-failure world frame at 1180×820, with medium quality and native rAF. Linux software WebKit is not physical iPad/Safari Metal; automation skips the existing device dynamic-resolution governor. No normal-speed video or physical-device review is claimed. Raw reports, logs, the bounded harness and full-game captures remain in `/workspace/render-bug-evidence/menu-portrait-followup-evidence.zip`; this directory publishes the compact result and original portrait proof without adding runtime instrumentation or new gameplay loops.
