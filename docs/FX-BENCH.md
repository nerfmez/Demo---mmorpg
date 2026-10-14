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

`src/fxtest/slash-fx.js` draws one clean crescent of light around the caster over the real range
and arc: the outer edge is the reach and the inner edge bows in, so it is thick in the middle
and pointed at both ends: a white-hot outer edge falling off to transparent toward the caster,
a soft additive glow, thin speed lines sliding along the arc, a bright leading edge with the
trail behind it fading, sparks off the leading edge and a short light. It
reveals from one end to the other, passing the middle at the contact time, then thins from its
inner edge and fades. Strikes in quick succession (within 1.2 s, including Multistrike repeats)
cycle through different tilts, heights and reach, and alternate the arm's side; the arc sweeps
the same way as the swing pose. There are no cut marks on targets. A linked payload tints the
outer line.

Multistrike (game data): one extra strike at levels 1-2, two at level 3. Each repeat is a
separate strike on its own time, and the bench plays a swing for each.

Rule trial (bench only, `SINGLE_STRIKE` in `src/fxtest/sandbox.js`): Slash is one plain
strike, with no 1-2-3 combo and therefore no finisher knockback. The game is unchanged
until this is approved and moved into `data/skills.json` with a core rule and test.

## Firebolt additions

The game's Firebolt renderer is unchanged. `src/fxtest/fire-extras.js` adds two bench layers:
flame wisps and embers that spiral in from around the staff head and arrive at release (the
charge reads as fire being gathered within the real cast time), and impact embers that burst
out, then sway, curl and drift upward while flickering and cooling, drawn as short curved
trails from their own recent path, scattering in every direction at varied speeds. The bench
also shows only the smooth filled core of the game's charge (the core the flying ball shows),
hiding its noisy flame layers and small gather wisps, with a warm halo growing around it, so
the charge reads as one ball growing as the fire gathers. Fire hits use a round burst (a
ragged flash and a fire puff that swells and burns away) instead of the game's one-sided
contact splash, so nothing flies off in one direction. Porting them means moving them into `src/render/` with
numbers in `data/combat-fx.json`.
