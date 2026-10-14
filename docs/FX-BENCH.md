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

## Slash (bench look and rule trial)

`src/fxtest/slash-fx.js` draws each swing from the sword's real path: while a swing window is
open (from 0.12 s before the authored contact to 0.08 s after) the hilt and tip are sampled
every frame and the swept surface is smoothed into one crescent ribbon with a white core
along the tip path, a pale body thinning toward the hilt and the tail, and a quick fade.
There are no cut marks on targets. Multistrike repeats each open their own swing on their
own hit time, so three strikes read as three swings. A linked payload tints the tip edge.

Rule trial (bench only, `SINGLE_STRIKE` in `src/fxtest/sandbox.js`): Slash is one plain
strike, with no 1-2-3 combo and therefore no finisher knockback. The game is unchanged
until this is approved and moved into `data/skills.json` with a core rule and test.
