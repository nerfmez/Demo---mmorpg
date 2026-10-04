# Local premerge review — transparent skill delivery

Continuation of `SKILL-TRANSPARENCY-REVIEW-2026-10-04.md`, from local commit `1bd16ccdb2b9ec4075b52e26060fd28d7ec5f40c` on `codex/ui-live-integration-20261004`. No push, merge, public deployment or production UI replacement is authorized or performed.

## Delivery sizing

All 17 approved 1254×1254 transparent masters are retained byte-for-byte under `assets-source/skills/`, outside Vite's public directory. The public registry paths now contain proportional 512×512 RGBA PNG delivery exports. The registry, layout, gameplay, data, saves, renderer, VFX, HUD anchors and accepted Skill Tree source are unchanged by this follow-up. All 59 gear/material images retain their previous hashes.

The background-removal artwork was previously created through supported reference-image editing. This follow-up performs a deterministic delivery export only: ImageMagick 7, Lanczos scaling, 8-bit RGBA PNG; no crop, matte, background removal, recoloring or regenerated art. `scripts/export-skill-icons.mjs` verifies each approved master hash before export and updates the delivery manifest. The real PNG alpha decoder in the raster tests verifies clear pixels, partial edge pixels and range 0–255, rather than trusting the manifest alone.

| Set | File bytes | Raw simultaneous RGBA pixels |
|---|---:|---:|
| Previous opaque 512px skill inputs | 6,199,062 | 17 MiB |
| Retained transparent 1254px masters | 27,358,624 | 101.98 MiB |
| Transparent 512px delivery PNGs | 6,586,332 | 17 MiB |

The delivery export cuts transfer bytes by 75.93% and raw decoded pixels by 83.33% versus serving the masters. Its file bytes are 6.25% above the old opaque inputs. Browser/GPU overhead is excluded; these are asset arithmetic, not hardware measurements. The largest reviewed contained skill image is approximately 135 CSS px on desktop, smaller on tablet/phone; 512px covers the reviewed phone at 3× and tablet at 2× pixel density without needing the 1254px source. Actual viewport screenshots use DPR 1. The build excludes `assets-source/` and copies the verified delivery bytes.

## Official WebKit setup and recoverable failures

Playwright 1.56.1's official WebKit 26.0 build 2215 downloaded successfully. The repository's official dependency installation route attempted `su root` and failed with `Authentication failure`; the worker has no sudo/root access. Debian 13 packages matching the environment's snapshot repository were downloaded and extracted beneath `/tmp/mmo-webkit-deps`, then linked into the official browser bundle's `sys/lib` directory. No browser binary or launcher was patched. Package names, versions and SHA-256 values are in `debian-package-provenance.txt`.

The real browser launches and runs the game. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` skips the ldconfig-cache preflight because system ldconfig cannot see `/tmp`'s extracted `libGLESv2.so.2`; it does not switch engines or bypass runtime loading. `webkit-env.sh`, `launch.log` and `binary-ldd.txt` document this portable setup. This is Linux WebKit/WPE, not macOS Safari or a physical iPad.

The focused harness was made engine-portable: trim WebKit's trailing label newline; wait up to three seconds for actual motion/invalid-feedback completion and simulation progress instead of fixed 1200/300/160ms sleeps; parameterize initial phone/tablet touch viewports; capture tablet views and wait for PNG decode. Product behavior and animation durations are unchanged. The original shorter sleeps passed on the phone; the final bounded waits complete the tablet flow without assuming the software renderer's frame rate.

Pixel inspection found that the Chromium-oriented `freezeScene` helper causes stopped WPE WebGL frames to be discarded, leaving a blank navy world. WebKit now keeps the native world renderer running. The affected screenshots were recaptured and reinspected with the actual world visible through the window gap. This was a capture artifact; normal world rendering and gameplay passed general smoke.

## Final visual inspection

The exact final production-build captures were viewed directly: equipment, skills page 1, skills page 2, movement, mods and materials at desktop 1440×900, tablet 1180×820 and landscape phone 844×390, plus the unobscured native world/HUD view. All ten master/export gallery PNGs were inspected, including ivory/navy surfaces and 135/46/42/29px delivery views. `asset-delivery-audit.json` and the handoff artifact index identify the exact PNG hashes.

The approved silhouettes and VFX remain recognizable, transparent gaps composite onto the cards, and no new boxed matte or conspicuous export halo was seen. The two windows remain distinct with a visible world gap; avatar/grid selection and actions retain their hierarchy. Actual coins, attached sockets, connecting lines and ownership/count/requires states remain readable. Essential actions fit within the landscape viewports. Dense frost, poison vapor and fine engraving lose detail at the smallest sizes, and secondary phone text remains small. The underlying game avatar remains low detail. Muted images correctly represent unmet or unlearned skills.

An existing HUD presentation limitation is visible with this test character: the Firebolt MP label prints the unrounded JavaScript value `6.300000000000001`. `src/ui/input.js` is unchanged; this is separate from PNG fit and is recorded rather than expanding this bounded asset/verification task. All skill PNGs themselves fit the existing HUD buttons.

## Evidence scope

Passing checks: 173 core tests (including four focused raster contracts); production build; 59 general smoke checks in WebKit and 59 in Chromium; 40 focused WebKit phone checks and 40 focused WebKit tablet checks; all 17 skill images decoded and 51 HUD image fits across the three viewports. Final counts are recorded in `verification-summary.json` with full logs and engine-specific reports in the evidence archive. The focused touch suite exercises real Continue/save state, equipment changes, mod insertion/replacement/removal, cancel/rapid input/latest state, compatibility/stat feedback, reduced motion, close/reopen, unchanged Skill Tree, HUD bounds, pagination and no essential scrolling. General smoke covers desktop/iPad-sized game/menu/input/render/save regressions. No page errors or failed icon requests occurred in the final capture. The production JS runtime hash remains `87738197b1bb842b489a82dcfad541a065865171541bb907f8eaf6c77caa2f24`.

Earlier transparent-master desktop/phone MP4s remain in the authorized Drive Motion folder, with their previously inspected frame timestamps and limitations recorded in the transparency review. They are historical motion evidence, not a new recording of these 512px exports. This follow-up adds WebKit interaction evidence and final screenshots, without claiming continuous visual movie playback or hardware performance.

Physical iPad/Safari input, memory pressure and performance remain unmeasured. Local engine checks do not imply remote CI/branch protection has passed. Drive backups use new versioned files in the existing type folders, preserve earlier deliveries, and do not change sharing permissions.
