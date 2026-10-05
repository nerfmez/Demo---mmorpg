# Three bow skills — Blender proof pass

PR #74 stays draft and on HOLD. The owner found the first procedural Three.js
clips insufficiently visible and asked for Blender authoring. Those first effects
were **not** Blender-authored. Their frame review is superseded, not acceptance.
This pass only creates editable Blender design proofs for Heavy Draw, Arrow Rain
and Pinning Arrow. Gameplay/source tests at `aaad1b5` remain intact. No new
Blender effects have been converted into the runtime, merged or deployed.

## Source and camera

`scripts/blender/export-bow-proof.mjs` loads the current main registry's real
`hairsample-male.glb` with its production outfit, equips the existing production
bow, and bakes `HumanoidAnimator` for the three casts at 30 Hz. It explicitly
requires the HairSample asset to load. The Lab's older hero is not used. The
bow is the real game's procedural equipment geometry; it is not an invented
replacement. glTF export translates toon materials to standard materials for
Blender, so proof shading is not pixel-identical to runtime shading.

`scripts/blender/bow-skills-proof.py` imports each baked GLB and authors editable
physical arrow geometry, tapered strokes, short contacts and the small control
cue. Each skill has its own `.blend`. The target is the game Lab's training-post
shape for scale context, not a replacement hero. One unit is one game metre.
Camera: production offset `(0,19,13.5)` above target height `.8`, vertical FOV
36 degrees. Proof raster: 960 × 600 (75% of 1280 × 800), 30 fps, 3 seconds.
Workbench flat studio shading preserves physical silhouette/colour without
requiring an unavailable denoiser; the proof is not a new cinematic scene.

## Timing and visible criteria

- Heavy Draw: fixed `.55 s` draw; four narrow amber tension strokes at the real
  bow, short release ticks, one physical arrow with a tapered ivory flight cue,
  compact directional contact. Base travel speed `27 m/s`.
- Arrow Rain: `.30 s` release, a short upward bow signal, three bounded arrowfall
  waves contacting at `.65/.95/1.25 s`. The chosen 2.1 m radius remains fixed.
  Each wave has 13 presentation arrows and brief contacts. These are decorative
  counts, **not ammo or collision counts**; the existing area tick gameplay and
  explicit 3-ammo cast cost remain unchanged.
- Pinning Arrow: `.22 s` release, physical sage-edged flight at `24 m/s`, compact
  contact, a `.52 m` thin movement ring and three restrained anchor wedges for
  `.9 s`. The proof shows a normal enemy cue; runtime boss duration/immunity and
  non-cancellation contracts remain unchanged. No knockback is shown.

No fire, cracked ground, pools, giant explosions, extra hits or new skills.

## Reproduce

Start `npm run dev -- --port 5173`, then:

```sh
BOW_PROOF_DIR=/tmp/bow-proof node scripts/blender/export-bow-proof.mjs
BOW_PROOF_DIR=/tmp/bow-proof MESA_SHADER_CACHE_DIR=/tmp/mesa-cache \
  blender --background --threads 2 --python scripts/blender/bow-skills-proof.py \
  -- heavy_draw --render
```

Repeat the Blender command for `arrow_rain` and `pinning_arrow`. The exporter
uses the full Playwright Chromium channel; configure its installed browser path
as needed. Use ffmpeg's 30 fps image-sequence input without time remapping.
Delivered originals, editable blends, baked real-hero GLBs and scripts are bundled
privately. Private delivery URLs never belong in repository or PR text.

## Runtime conversion proposal — after owner approval only

Keep the present production hero/action, bow release transform, skill events,
area wave timing, ammo rules, mods, root status and pooling/cleanup. Transfer the
approved Blender shapes and envelopes to a small shared arrow mesh, tapered
billboard trails, a bounded pooled wave of presentation arrows, compact contact
strokes and a pooled flat root cue. No Blender hero/model/ground is shipped as
new runtime content. Avoid per-frame allocation, collision on decorative rain
arrows and postprocessing that makes mobile clarity depend on bloom. Test at
normal game zoom in busy coastal combat and touch aim before acceptance.
Repeat resource/mod/boss/save and repeated-cast cleanup checks only as relevant
to conversion, then required final-head CI. Merge/release remains blocked by
owner proof review and those gates.

## Visual review

Initial actual frame review caught an old-hero reference mismatch and a dark,
noisy ground grid; those proof setups were discarded. Current HairSample export
and bright plain ground replace them. The target-area boundary was corrected
to hold its radius throughout the waves. Single-arrow contact strokes were also found to be hidden by the target body;
the final Heavy/Pin contacts are moved to the visible surface. Heavy draw strokes
were thickened slightly and held until release for game-scale readability.


Final private originals, 30 fps / 960 × 600 / 3 s:

| Artifact | SHA-256 |
|---|---|
| `heavy_draw-blender-proof.mp4` | `2a88afee9e2ea1bfba5482c7f2b6da62bc369225dadd3a1dd31352ecf59f2bbe` |
| `arrow_rain-blender-proof.mp4` | `850b6a1c81e5558625c4c93571d9ef637a3c635ea381ffcf1fc5b613ad1c4441` |
| `pinning_arrow-blender-proof.mp4` | `b1c3dde977769faee64533b3eb18dd47976a148da9726a3a0d0e4e8daaab9c1e` |

Inspected actual rendered frames: Heavy `.30/.50/.667/.80/1.467 s`;
Rain `.30/.567/.667/.967/1.267 s`; Pin `.167/.333/.50/1.00/1.60 s`.
The final corrected Heavy contact at `.80 s` and Pin contact/root at `.50 s`
were checked directly. Encoded delivery frames were also extracted and inspected
at Heavy `.80`, Rain `.667`, Pin `.50 s`. This is sampled-frame review, **not
continuous normal-speed viewing or physical-device testing**. Videos preserve
normal timing for owner playback. No video perception tool is available here.

At these frames: current hero/bow silhouette is visible; Heavy draw, flight and
contact read; Rain's three compact waves stay inside the fixed area; Pin has a
distinct contact and restrained cue that is gone by `1.60 s`. They are candidate
proofs awaiting owner motion/feel approval, not final aesthetic acceptance.
Runtime crowd/HUD/water contrast, portrait/mobile view, boss cue duration and
normal-speed legibility remain integration/review gates. Blender flat shading
is not the production toon shader. The reference gallery URL was unavailable
in this environment (previous direct attempt returned HTTP 403); repository
physical-arrow studies were used instead, without claiming new gallery playback.
No paid effect assets were copied.

Technical checks: real HairSample load assertion, successful `.blend` saves,
90 rendered frames per skill, correct encoded fps/dimensions/duration, source
syntax checks and clean whitespace diff. This proof pass changes only Blender
authoring scripts and documentation, not gameplay or production render code.
