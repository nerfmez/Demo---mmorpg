# Fireball V5 local review

Base: `e38b2b9e12f76fb0e094e26ddd439497b2d2260c` (main, PR48 + PR49). No city repairs are included. This is an unpublished local review, not an approved replacement release.

Run `npm ci && npm run dev`, then open `/?fresh=1&kit=staff`. Add `&fireball=legacy` to recover the previous effect with its original art data. The existing Skill Lab at `/lab.html?skill=firebolt` uses V5 by default. Gameplay, targeting, progression and save shapes are unchanged. Firebolt's authored speed is still 9 m/s, cast .22 seconds, cooldown .7 seconds, cost 6, base damage 10 + 1.1 scaling. Derived character bonuses continue to apply normally. No new pause/hit-stop is introduced.

## Input provenance

The normal browser attachments were readable locally and hashes matched before implementation:

- `Azure_Fireball_V5.blend`, 5,414,884 bytes, SHA256 `4dbd8dd906f5b14a0996c07787b163d19ffd0c055826bd15b717ffb6c9cfdfc6`.
- `Fireball_V5_1x.mp4`, 799,052 bytes, SHA256 `152cf31546c178e4bf64136258389d16715f4f5089453f657093212936924cf6`.
- `Fireball_V5_Producer_Handoff.zip`, 184,913 bytes, SHA256 `5133e5aea6bf1ef54b2c0b1978c60bb8f297642fd956adcc121c8f7489e538b3`.

Inspected a 24-frame contact sheet and separate actual charge, travel and impact frames. Blender 4.3.2 opened the original with scripts disabled. The producer's exact formulas supplemented those pixels. The task specifically requests the approved original V5, so its source is the visual authority here rather than a fresh gallery redesign.

## Runtime translation

`fireball-v5.js` constructs shared 48×24 continuous capped flight shells, shared 32×20 charge shells and a filled smaller charge core. Only the negative flight axis is lengthened 17%, as in the approved source. Meshes do not swim, spin or birth discrete ribbon packets. A continuous backward-advected field erodes the two shells; charge rotates the field inside the geometry. Unlit warm linear-color emission is alpha composited with depth testing and no depth writing. Flight heat is longitudinal, independently from coverage noise. The reference charge spans .625 seconds; the unchanged gameplay cast is only .22 seconds. Its field is time-compressed. The user explicitly keeps this .22-second duration; this is not equivalent reference timing. Flight and impact retain real-time speed. Each shot owns a clock advanced by simulation dt, so pause freezes the field.

Noise is normalized gradient fBM with slow continuous 3D-coordinate drift standing in for the fourth dimension. It is **not bit-identical Blender 4D noise**. Blender's Cycles transparency, high-contrast display and compositor glow are also not identical to the game's raster compositing. The default source palette is retained; existing Lab flow and palette controls multiply that source look. Legacy controls for old billboards, detached wisps and smoke do not redefine baked V5 particles.

`fireball-v5-contact.js` uses only the approved 47 contact objects (pressure silhouettes, peeling lobes, broad flakes, heat patches, chips and local radiance), sampled from the actual Blender scene at 24 Hz and interpolated continuously. Positions, colors and alpha are stored in two shared half-float atlases (764,800 bytes total, plus metadata). One contact draw has 1,912 vertices and 2,108 triangles; no arena geometry, video playback, textures from paid assets or smoke are included. Concave silhouettes use triangulation from their largest-area source pose, not center fans. The view-facing contact basis is aligned with projected flight direction. This preserves the approved source's planar contact mechanism while adapting it to the game camera. Source Bezier interpolation between 24 Hz samples is approximated linearly; half-float storage adds small quantization.

The original source's flake shape, seeded trajectory, drag, cooling and tumbling are evaluated offline into the geometry atlas. Runtime interpolation needs no new particle objects or per-frame CPU buffers. The short residual flight wake expires in 2/24 second; the contact's entire flake lifecycle expires after 1 second. Charge/flight materials and the one material per contact are disposed at expiry/reset; geometry and the two textures are shared for the app lifetime. `clearFireballs()` supports replacing a game in the current view. Return to title uses the existing full reload. VFX active-list compaction now happens in place.

## Reproduction and limits

`blender -b /path/to/Azure_Fireball_V5.blend --disable-autoexec --python scripts/export-fireball-v5.py` regenerates only the contact atlases and metadata, rejecting a source hash mismatch.

`npm run build`; `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/firebolt-lab.mjs` checks the full Lab sequence, conversion, split replay and expiry plateau. `tests/browser/fireball-v5-review.mjs` records a real normal-rule shot at an actual monster using fixed 60 Hz simulation steps; it serves from the local preview on port 4192. `VIDEO=1` adds all frames, which are encoded at 60 fps without slow motion. `tests/browser/fireball-v5-lifecycle.mjs` adds renderer-only simultaneous-shot stress, freeze/reset/menu and full-scene timing probes. Those synthetic multi-shot probes are explicitly not combat-balance tests.

Actual measured results and environment limits accompany the review bundle. A normal-speed frame-stepped MP4 shows simulation timing, **not achieved hardware frame rate**. Browser automation uses software rendering; no physical-phone/iPad FPS claim is made. WebKit launch is blocked on this executor by absent system libraries, recorded separately. Final owner review of motion/material parity and physical-device testing remain necessary before any publishing decision.

## Staff grip and launch correction

The first local clip was rejected because the charge sat near the ground and the full tail appeared through the character. The staff-only ready and Firebolt poses now solve the right palm onto the handle, aim the shaft independently of wrist rotation, and bring the support palm to the shaft. The charge follows the actual procedural staff head at local Z=1.1475. No sword/model/appearance/UI/EXP data is changed. The correction is excluded during other authored actions, dash and death.

Release retains the last visible charged socket, then blends its small IK offset into the existing gameplay trajectory over .6 metres. The core projectile simulation remains untouched at 9 m/s. The visual offset can slightly change the rendered centre's instantaneous speed during those first .6 metres. The initial rounded gathered body opens continuously; its rear extent grows only into the path already traversed. A fading filled launch core adds at most one draw per newly released shot for .6/9 seconds. Shared geometry remains cached; instance materials follow the existing disposal lifecycle.

`ASSERT_ORIGIN=1 ANGLES=1 PRELUDE=1 VIDEO=1 V5_OUT=/path/to/output node tests/browser/fireball-v5-origin.mjs` checks the staff tip, both grips, release continuity, unchanged speed, real monster hit and full cleanup. It captures the standard game camera plus optional close rotated views. Encode `frame-%03d.png` at 60 fps for unchanged simulation speed. The legacy effect remains recoverable by query parameter; the separate staff grip correction also applies in that comparison.

## Accepted effect: narrow charge-onset refinement

After accepting the staff/launch repair and the overall effect, the user requested only a gradual gathering onset. Five small warm wisps now converge locally at the same staff-head anchor, with a progressively growing/revealing core and shells. The envelope smoothly grows from a tiny seed to the same approved final size by 92% of the existing .22-second cast. Wisps fade into that body before release; they do not orbit, leave the socket, persist after charge or alter travel/impact. The first rendered core has under 12% of final scale, rather than the previously immediate large ball.

`fireball-v5-gather.js` batches five quads (10 triangles) in one additional charge-only draw, using shared geometry and one disposed material per cast. All convergence and fade motion is evaluated in the shader without per-frame CPU allocation. Flight's filled launch core has a completed build factor by default and is unchanged. The original shader field, staff grip, final charge size, release offset, tail, contact atlases and gameplay rules are retained.

The origin probe additionally checks monotonic buildup, a complete final charge, exactly 13 charge frames at 60 Hz, and the same release frame. `VIDEO_FRAMES=90 CLOSE_VIDEO=1` records a focused 1.5-second normal-speed game-camera and close-camera pair while still checking the later monster hit and full effect cleanup.
