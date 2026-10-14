# Skill FX bench

`fx-test.html` (published at `<site>/fx-test.html`) is a separate test page for the
Chain Spark, Frost Nova and Flame Stream effect prototypes (`docs/review/fx-prototypes`
on `claude/fx-prototypes`), a new Slash look, Firebolt (the game's own renderer) and the
prototype skill fusion. It is not the Skill Lab and not part of the game.

- The rules are real: `src/fxtest/sandbox.js` builds a `Game` with a staff caster, the
  chosen skill in slot 1 with up to `maxModsPerSkill` mods (levels 1–3), a Dash movement
  skill and training dummies on a flat floor. Cooldown and MP are refilled every step;
  dummies have 100 000 HP. Cooldowns run for real (the cast button shows them); MP is
  refilled every step. Nothing is saved.
- Effects only read core events: `castStart`, `chain`, `nova`, `channelStart/Pulse/End`,
  `hit`, `trigger`, `burst` (`mod_burst`) and the live `burning_ground` areas. Mods show
  through those events: Bounce adds hops, Chain Return draws the bolt back, Frost Shift
  recolours lightning/fire to cold, Echo plays a second nova, Concentrated shrinks it,
  Burning Ground leaves a fire patch, Knockback/Gathering Cut move the dummies, Shatter
  bursts on chilled dummies, Life Leech shows green heal numbers, Cast on Dodge fires
  the skill from the dodge button. Guard triggers are hidden (no guard skill on the bench).
- Controls: tap the floor to aim, **ร่าย** casts (hold for Flame Stream), **หลบ** dashes,
  slow motion ×0.5/×0.25, close/game camera, auto-repeat, reset dummies.
- Effects are cosmetic prototypes in `src/fxtest/*-fx.js`. Porting one into the game
  still means rebuilding it in `src/render/` with its numbers in `data/combat-fx.json`.

`node --test tests/core/fx-bench.test.js` checks that the bench offers fitting mods and
that they change the events the effects draw. Review hooks: `__fxtest.freeze()` then
`__fxtest.advance(seconds)` renders deterministic 60 Hz steps for screenshots.

## Skill fusion (prototype)

Rules live in `data/fusion.json`; `src/fxtest/fusion.js` applies them on top of the real
rules without changing `src/core`. A physical attack with a short cooldown (the carrier,
e.g. Slash) can link one fast damage spell (the payload, currently projectile spells:
Firebolt, Arcane Bolt, Arcane Dart) into one of its mod sockets. When the carrier connects,
the payload fires once from the first struck target, flying on away from the caster and
skipping that target, with its full behaviour and only its main damage scaled by
`payloadDamageMult`. The fused skill uses the longer cooldown and the summed MP cost. A miss
fires nothing. `maxCooldown` stands in for the planned Core / Cooldown skill types.

## Slash (new look)

`src/fxtest/slash-fx.js`: a crescent smear across the real range and arc, started on
`castStart` so its fast leading edge crosses the arc at the authored contact time; the
direction follows the weapon tip, the tail thins and tears into strands. Each struck target
gets a short steel cut (shorter than the smear), a small flash, sparks and dust; the third
combo step is a wider double smear. A linked payload tints the smear's outer rim with its
element. Reference principles: the 2026-10-01 physical study in `docs/VFX-REFERENCE.md`
(the gallery was blocked from this container).
