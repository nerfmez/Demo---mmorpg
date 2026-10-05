# Approved VFX integration — 2026-10-05

This draft ports the accepted Blender effects into the existing Three.js skill renderers. It introduces no skill, gameplay rule, save migration, damage, cooldown, hitbox, AI or camera change. WaterSlash V9 is deferred for a future skill. Original round Ward is retained. Hex, redesigned Ward and retired poison-pool assets are excluded; existing poison gameplay remains intact. No merge or deployment is included.

## Sources and implementation

Source identity and hashes are recorded in `APPROVED-VFX-SOURCES.json`; exported geometry metadata also records the original scene hash. Local source folder names there are provenance, not runtime dependencies.

| Existing skill | Accepted source and realtime adaptation |
|---|---|
| Firebolt | Fireball V5. Original [source ZIP](https://drive.google.com/file/d/11Af1lZV135niZI6MKe32DVOVMe7UqDTK/view), all 25 manifest hashes verified. Procedural gathering/flight and sampled impact geometry. Cast compressed into the unchanged .22 s gameplay cast; projectile remains 9 m/s. Staff support IK solved after current main's skin attachment. |
| FrostNova | V2. Exact 61 effect meshes sampled at 30 Hz: sharp outward ice, wakes and fractures. No mannequin, stage or movie. |
| Chain Spark | Approved lightning meshes sampled at 30 Hz. Vertical branched strike at each existing chain endpoint; does not replace target selection or damage. This is an adaptation of the skystrike to the chain skill, not a connecting horizontal bolt. |
| Slash / Whirl Blade | Batch02 crescent mesh formulas and palette; real hero, blade trail and contact system retained. Nonphysical conversions retain their existing appearance. |
| Hunter Shot | Batch02 shaft, point and fletching proportions; original projectile trajectory, draw animation and contact timing retained. |
| StoneBurst / Leap | Approved no-crack scenes. Sampled effect meshes only; no ground cracks. Stone warning retains a thin footprint boundary during its unchanged delay. |
| HealingSpring | Brighter source's mint/turquoise ramp, soft field, crosses and motes. Existing area radius, duration and healing ticks unchanged. |
| WarCry | Revised source pressure texture on two short outgoing fronts, followed by existing status aura. Existing eight-second buff unchanged. |
| Dash / Roll / Blink | Batch06 RGBA artwork with realtime flow/dissolve. Real rig afterimages for dash/blink and low roll dust. Existing movement, invulnerability and actor poses unchanged. |
| SpiritWolf | Batch06 reveal/wisps adapted to the existing animated wolf and AI. Height reveal at spawn/expiry, original material restored before pooling. Actual summon lifetime unchanged; Lab retains its short presentation replay. |

Shared immutable half-float geometry/color atlases drive Frost, lightning, stone and leap. Each live effect owns a disposable material. Textured effects use two approved RGBA images. GPU resource probes cover repeated casts, expiry and representative ownership paths. No rendered video or full Blender scene is loaded in game.

Blender compositing/noise and material lighting are approximated by realtime shaders; geometry samples interpolate linearly. The source's static preview wolf/mannequin are not runtime actors. Fixed geometry controls that no longer affect the approved stone/whirl shape are hidden in Lab; author geometry in the source and re-export. New adapters allow focused Lab review of the mapped skills without modifying imported gameplay data.

## Review and validation

- Production build passes (existing large-bundle warning remains).
- Seven focused combat-FX/Lab tuning tests pass, including fixed-geometry controls.
- All 13 non-Fireball Lab sequences pass startup/runtime/expiry checks: frost, lightning, stone, slash, whirl, arrow, heal, warcry, dash, roll, blink, leap and wolf. Each has a desktop sequence and portrait sample.
- Fireball Lab checks cover one contact, conversion, split and expiry. Real-game origin probe confirms staff-tip release, current skin palm attachment, unchanged cast/speed, one hit and cleanup.
- Eight repeated-cast ownership probes stabilize: dash 28→28, blink 28→28, healing 25→25, wolf 49→49, stone 28→28, frost 26→26, lightning 28→28, warcry 26→26; all live effect/area counts return to zero.
- Actual Game/View captures cover frost, stone, warcry, heal and wolf on grassy terrain at game camera scale, desktop and portrait. These empty-target placement captures do not claim damage coverage; Fireball separately exercises a real target.
- Visual review uses actual renderer sequences/contact sheets and selected game frames, not technical pass alone. Sharp frost spokes, no-crack earth emergence, blue-white bolt, short pressure fronts, brighter mint healing, sparse movement trails and real-wolf reveal inspected. Healing color/blending was corrected after its first muddy/white preview. Close Lab framing may crop the top of the skybolt or wide WarCry fronts. Ground effects remain subtler on bright grass than in Blender.
- Continuous playback cannot be visually inspected in this interface. MP4 encodes consecutive 30 Hz simulation frames at normal cadence; only sequential frames were visually reviewed. No physical iPad or phone performance claim. Local WebKit is unavailable; CI owns final-head Chromium/WebKit smoke.

Run `npm run build`, start `npx vite preview --port 4192 --strictPort`, then `node tests/browser/approved-vfx.mjs <skill>` or `node tests/browser/approved-game-camera.mjs`. Set `CHROMIUM_EXECUTABLE` if Chromium is not at `/usr/bin/chromium`. The resource probe is `tests/browser/approved-vfx-resources.mjs`. Generated review files stay outside Git.

The earlier Fireball media were a checkpoint before the final staff support fix; they are not final-head evidence. `FIREBALL-V5-LOCAL-REVIEW.md` is historical producer evidence, not current test results. Library saving failed before upload; delivery uses the existing owner-only Drive folder without sharing expansion.

Direct repository inspection was sufficient; no Jev request was made. Inspected contracts include event routing in View/Vfx, HeroAnim/skin attachment, Lab adapters/tuning, disposal/pooling and source exporters. Core/saves/Godot-port contracts are unchanged. Rebased onto main after Claude PR #64; its monster/progression/material/recipe and cancelled-windup changes are retained. Final commit and CI status are recorded in the PR rather than predicted here.
