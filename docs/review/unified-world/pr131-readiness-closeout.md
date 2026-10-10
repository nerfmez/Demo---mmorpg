# PR #131 readiness closeout

Source parent: `5a535a5c379269669a62f0c32b6de611e8d2a96d`. This follows the [collision, quest and saved-startup fixes](pr131-followup.md); it does not replace their historical artifact identities.

## Remaining failures and changes

The [previous CI run](https://github.com/nerfmez/Demo---mmorpg/actions/runs/37982817669) passed build, 569 core tests, 201 tooling tests, city routes, both engines' unified-world and saved-weapon cases, and the separate lighting checks. It still failed the fresh Medium VRM initial readiness predicate in WebKit at the existing 60-second bound. Chromium opening was cancelled at the existing 30-minute job bound while executing its final phone-portrait reload; no opening assertion failure preceded cancellation.

- Opaque initial loading now skips hidden gameplay input polling, event drains, HUD/quest/supply updates and autosaves. The independent preparation queue and animation clock continue. Retained events run once on the first ready frame, without a large delta or catch-up autosave.
- Drivers without `KHR_parallel_shader_compile` submit the same bounded material batches and await one final barrier, avoiding redundant serial polling timers. Drivers with parallel compilation, and unknown capabilities, retain serial barriers because Three polls mutable shared-material program state. Exact drawables, textures, shader variants and cancellation/error cleanup remain covered.
- Opening keeps its eight viewport/kit cases plus separate v10 migration, partitioned into nine jobs per engine. Each exact source/configuration receipt is mandatory in browser and release gates. Missing, duplicate or partial case coverage cannot certify opening. The 90-second readiness and 30-minute job limits are unchanged.
- Smoke records bounded named startup diagnostics on failure, then rethrows the original error. Its local `SMOKE_CASE=vrm` selector is rejected by the CI runner; default CI still runs desktop, iPad and VRM cases.

## Local validation and limits

Build succeeds with the existing large-chunk warning. All 207 tooling tests pass. 32 distinct focused core tests pass (startup drawing 10, shader preparation 8, region lifetime 11, construction timing 3), verified across focused commands and the final shader rerun. They cover the startup frame gate, shader readiness, cancellation and cleanup. Syntax, YAML and diff checks pass. Current-head CI must run the complete core and affected browser suites before merge.

Both canonical local VRM smoke cases pass with `ALL OK`, the original 60-second predicates, 15 skinned meshes, 36,206 triangles, head-above-hips animation and zero recorded errors:

| Engine | Initial UI readiness after navigation | Body readiness afterward | Evidence |
|---|---:|---:|---|
| Chromium | 26,859 ms | 5 ms | [Log](readiness/smoke-chromium.txt) |
| WebKit | 25,910 ms | 257 ms | [Log](readiness/smoke-webkit.txt) |

Separate total-navigation probes observed WebKit at 45,856 ms on the parent build and 38,135 ms on the final build. These sequential software-renderer observations are not controlled cold-to-cold benchmarks and do not establish a causal percentage improvement. The previous CI WebKit timeout was not reproduced locally; current-head CI remains the decisive check. [Measurements](readiness/measurements.json) retain dependency and regional phase snapshots.

## Exact final runtime review

[Identity manifest](readiness/identity.json) records source, log and capture SHA-256 hashes. Final runtime JavaScript is `main-DAsFQ0nf.js`, SHA-256 `985e3d31f6be7fb7bdc68c8db6bb4b2403ef2340939417c1edaa76d616b81826`. CSS is unchanged `main-D51y7kao.css`, SHA-256 `ae4f8273ee5b211873a17f32c7bf9835df3bfa4f8bdbf86da15e7ad7c00bc6ab`.

Root reviewed the exact final 1180 × 820 touch-emulated Medium VRM runtime captures: [WebKit after movement](readiness/vrm-webkit.png), [Chromium after movement](readiness/vrm-chromium-initial.png), and [settled Chromium](readiness/vrm-chromium-settled.png). Criteria: complete sand/shore/wreck geometry, intact character head/body/boots and shadows, HUD anchors and visible profile after its asynchronous render. No new missing terrain or partial primitives were found. Chromium's initial capture preceded profile completion; the bounded settled probe confirms the visible face at performance time 33,030 ms. No production portrait code was changed. The fullscreen glyph limitation existed in the parent capture.

No assets, texture sizes, preset values, scenery density or authored layout were reduced in this closeout. Still captures and software-renderer automation do not establish continuous motion quality, hardware iPad FPS/battery use, total-process RAM improvement, or a mathematically proven subjective 10% quality bound. No physical iPad was tested. CI owns full smoke and affected UI flows; those suites were not repeated locally. Direct source/caller inspection and independent reviews resolved the changed contracts; no Jev request was needed.
