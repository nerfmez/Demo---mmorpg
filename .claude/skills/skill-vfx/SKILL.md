---
name: skill-vfx
description: How Frontier's skill effects are made and judged (src/render/skillfx/*-fx.js, the FX bench fx-test.html) - the owner's quality bar (Firebolt, Flame Stream, Chain Spark), the techniques that meet it, the review process on the game camera, and the owner's standing rules. Use before making, rebuilding or restyling any skill or combat effect, or when the owner says an effect is weak, messy, flat or "ห่วย".
---

# Skill effects (VFX)

Effects live in `src/render/skillfx/*-fx.js`, driven by `src/render/skill-fx.js` (the same director in
the game View and on the FX bench `fx-test.html`, published as the "เว็บทดลองสกิล" artifact). They are
cosmetic only: they read core events and never change rules. History and lessons in detail:
`docs/VFX-REFERENCE.md`; the bench: `docs/FX-BENCH.md`; the port: `docs/GODOT-PORT.md`.

## The bar is the owner's best effects, not a style name

The owner judges quality against **Firebolt** and **Flame Stream** (best) and **Chain Spark**
("simple but right"); the other bench skills are fine. Before building, open the reference skill
of the same element and read its code, not just its frames. A style label ("light", "anime",
"3D toon") is never the goal: four Meteor versions were rejected for quality, not style, until it
was built with Firebolt's techniques.

What makes the reference skills good:
- **Fire as see-through layers cut from flowing noise** (Firebolt, `fireball-v5.js`): nested
  double-sided shells; fire cut out of domain-warped gradient noise (`V5_FIELD`) that is carried along
  the flow; a smooth hot-to-cool heat ramp with narrow transitions; glow above the tone mapping.
- **One mass, one outline** (Flame Stream, `flame-fx.js`): many soft blobs summed into a density
  buffer and thresholded in one pass; never a pile of separately outlined stickers.
- **Smooth motion every frame**: no stepped "drawings"; boil comes from advected noise.
- **Clean angular lightning** (Chain Spark, `chain-fx.js` `zig`): few straight segments with hard
  kinks, a white crackling core in a blue glow, re-jagged 15 times a second, a fork or two.
- **Contact**: a ragged flash (`flashMaterial`), fluttering curved embers or bouncing sparks
  (`FireExtras.burst`, Chain Spark sparks), a point light, a short shake.
- **Ground**: something touches the ground on big hits (a crater, scorch, light pool), shaded like
  the world (three toon steps from a height field for a crater).

## Reuse the pieces

- Fire: `meteor-flame.js` (`flameMaterial`, `cometShell`, `domeShell` on Firebolt's `V5_FIELD`),
  `FireExtras` (`impact(x, y, z, false, size)`, `burst(...)`, `gather(total)`).
- Lightning: `chain-fx.js` exports `zig`, `CRACKLE_FS`, `BOLT_GLOW_FS`, `Rng`, `rewindPts`.
- Sky cues under the high game camera: `skyAbove(camera, x, z, height, right, out)` (fx-common).
- Ground warning: `warnDisc(scene, element)` (anime-kit): a crisp two-tone edge at the true radius
  and a plain fill growing to the landing time.
- Light-and-ribbon bits: `light-kit.js` (`Ribbon` strips, glow/star/flare sprites, sparks).
Pools only; no allocation per particle or per frame; shared geometry/textures marked
`userData.shared`.

## The owner's standing rules (from reviews)

- Never paste or cut in pictures (sprite sheets, references) - build the effect live. Reference
  images teach shape language only.
- Flat 2D picture-like fire and toon-shaded solid fire meshes both read worse than the usual effects.
- Warnings: plain fills, no dense hatching or diagonal stripes; the area is the true hit radius.
- No ground cracks for big impacts: a round sunken crater instead.
- No cloud overhead: from the game camera it hides the circle and the monsters' wind-ups.
- Lightning must not look messy: few bolts, one fork each, low jag.
- Big job skills (Job Lv 40, 10-12 s cooldown) get more beats and presence than basic spells, but
  stay inside the real area and never hide monster wind-ups.
- A sky source must stay on screen under the game camera (`skyAbove`, or slide toward the camera).
- Rocks or objects should not tumble in the sky for long; things that land shrink away.

## Process

1. Read the skill's rules (`data/skills.json`, the core events it emits: `area`, `burst`, waves,
   delays) and the reference skill's code.
2. Build phase by phase (warning/anticipation, travel, impact, aftermath); keep one approach and
   polish it - do not swap techniques between rounds.
3. Check on the bench with the game camera (the default; `?cam=game|hero|close`), stepping time
   with `__fxtest.freeze()` / `castDown()` / `castUp()` / `advance(s)`; take a frame sheet across the
   whole effect. Zoom crops to judge detail. Also check the real game with the game stepped by hand
   (pause, then `game.update` + `view.render` per frame) - the game camera is high (CAM_OFFSET
   (0, 19, 13.5), fov 36).
4. Self-review against the reference frames before sending: readable from the game camera, no
   straight cuts, nothing hiding the area or monsters, the rock/object leading its own fire, no
   stray objects (e.g. a tongue pointing at the camera reads as a ball).
5. Run the focused tests (`fx-bench`, `combat-fx`, `job-skills`), `npm run build`, confirm the
   reference skills still look the same, commit and push, republish the bench artifact, and send
   the owner the frame sheet in Thai with what changed and what is still weak. Ask whether it passes.
6. Record the round in `docs/VFX-REFERENCE.md` (what the owner said, what changed) and keep
   `docs/GODOT-PORT.md` accurate.
