# Skill FX bench

`fx-test.html` (published at `<site>/fx-test.html`) is a separate test page for the
Chain Spark, Frost Nova and Flame Stream effect prototypes (`docs/review/fx-prototypes`
on `claude/fx-prototypes`). It is not the Skill Lab and not part of the game.

- The rules are real: `src/fxtest/sandbox.js` builds a `Game` with a staff caster, the
  chosen skill in slot 1 with up to `maxModsPerSkill` mods (levels 1–3), a Dash movement
  skill and training dummies on a flat floor. Cooldown and MP are refilled every step;
  dummies have 100 000 HP. Nothing is saved.
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
