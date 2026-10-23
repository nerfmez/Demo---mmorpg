# Skill FX bench

`fx-test.html` (published at `<site>/fx-test.html`) is a separate test page for the
Chain Spark, Frost Nova, Flame Stream and Venom Shot effect prototypes (`docs/review/fx-prototypes`
on `claude/fx-prototypes`), a new Slash look, Firebolt (the game's own renderer) and the
prototype skill fusion. It is not the Skill Lab and not part of the game.

- The rules are real: `src/fxtest/sandbox.js` builds a `Game` with a staff caster, the
  chosen skill in slot 1 with up to `maxModsPerSkill` mods (levels 1–3), a Dash movement
  skill and training dummies on a flat floor. Cooldown and MP are refilled every step;
  dummies have 100 000 HP. Cooldowns run for real (the cast button shows them); MP is
  refilled every step. Nothing is saved.
- Effects only read core events: `castStart`, `chain`, `nova`, `channelStart/Pulse/End`,
  `hit`, `trigger` and `burst` (`mod_burst`). No mod leaves a field on the ground. Mods show
  through those events: Bounce adds hops, Chain Return draws the bolt back, Echo plays a second nova,
  Concentrated shrinks it, Knockback/Gathering Cut move the dummies, Shatter
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

### Recipe: Flame Wave Slash (Slash + Firebolt)

`data/fusion.json` `recipes` define authored fusions that replace the generic rule for their
pair. Flame Wave Slash: casting starts a 1 s charge (no damage, the swing's wind-up stretched
over it, aim still follows the pointer); at its end the carrier's Slash lands and a crescent
fire wave (a real piercing projectile: 11 m/s, 8 m, radius 1.2, Firebolt's damage and burn)
hits every target in its path once. Cooldown 1.6 s, MP = both skills. The wave carries the
carrier's mods: an element change (Frost Shift makes it a chilling ice wave), knockback, leech,
chill, status mods (Laceration), Wide Arc widens it in proportion,
and Multistrike sends a weaker wave with each repeat swing. Visuals in
`src/fxtest/flame-slash-fx.js` are its own: none of Slash's or Firebolt's effects are used
except fire sparks on hits. During the charge the sword's own materials heat from dull red to
glowing red-orange (restored once it cools after the cut) with heat embers and a few wisps;
the wave is a clean half-moon of fire (smooth front and inner arcs meeting in sharp points,
flowing cel bands, short tongues off the back edge, a soft glow) that widens and burns away
from the back at the end of its range. With a cold element the blade frosts and the wave is
an ice crescent, with ice chips on hits.

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

## Venom Arrow (rule trial of Venom Mire)

The owner did not want a poison pool, and a poison shot from the staff was too close to Firebolt.
The bench now shows Venom Mire as **Venom Arrow**, a bow attack (`VENOM_ARROW` / `benchData()` in
`src/fxtest/sandbox.js`; the game data keeps its zone until this is approved): a fast thin arrow
(26 m/s, 14 m, cooldown 0.6 s, uses arrows, no pierce of its own) with a small direct hit. Every
hit adds a poison stack on that target, up to 5, and refreshes its 4 s; each stack adds dps worth
0.6 x that hit, so one target kept under fire ramps past a plain arrow while a single hit is weak.
Firebolt is burst on whatever it hits; Venom Arrow rewards staying on one target. Arrow mods fit
(Split, Pierce, Bounce, Returning Shot, Laceration...); field mods and element Shifts do not.

`src/fxtest/venom-fx.js` uses the same language as the bench's Firebolt and Chain Spark (light,
not solid shapes): the arrow is a thin hot yellow-green needle of light with a short trail and a
fine wisp twisting round it; on impact a small ragged poison flash (`ELEMENT_LOOK.poison`), a puff
and a few streaks; a poisoned dummy is tinted green by its stacks and gives off rising motes, more
with more stacks, and a "พิษ ×N" label shows each new stack.
The Cartoon FX gallery host was blocked for this
pass, so no gallery clip was studied; it follows the cel rules in `docs/VFX-REFERENCE.md`.

## Arrow Rain

`src/fxtest/rain-fx.js`, in the same light-and-ribbon language. The rules send one `area` event
per wave, each with its delay, and a `burst` as each lands.
- **Up-shot.** The hero plays a bench-only `bowSky` action: lean back, raise the bow, draw and
  loose at the sky. As the volley's first `area` event arrives, a bright streak climbs from the bow
  and bursts above the target in a ragged flash.
- **Rain.** Each wave's 26 arrows come down from around that burst as streaks of light with a
  bright head. They land one after another, from 0.28 s before that wave's burst to 0.14 s after
  it, not all at once.
- **Landing.** Each landing leaves a short stub along its line of flight and a couple of sparks.
- **Circle.** A thin cel circle with an inner guide ring marks the volley and pulses with each
  wave.

Echo, Wide Field and Concentrated show through the events; element Shifts recolour it. Venom Arrow
plays the plain bow action on the bench; the game's action table is unchanged.

## Power Draw

`src/fxtest/power-fx.js`, in the same light-and-ribbon language. Hold **ร่าย** to charge (the
rules' `chargeStart`; release calls `releaseCharge`, auto-repeat holds about 1.6 s).
- **Hero.** Raises and draws, then holds at full draw (bench-only `bowDraw`), and snaps the loose
  on release (`bowLoose`).
- **Charge.** Streaks of light are drawn in to the arrow tip, where a soft round glow with a hot
  centre grows. Three arcs of light circle the arrow, widening and speeding up with the charge.
  Reaching full charge pings once (a burst and a ring) and the glow then pulses, so a full draw
  reads at a glance.
- **Shot.** A streak of light whose width and glow grow with the charge, with a small burst at the
  bow. Over half charge, a ring of pushed air forms at the bow; near full, more rings keep coming
  off its path.
- **Impact.** A clean burst, all scaled by the charge (owner: no ragged flash, no bar): a round
  glow that pops and fades, sharp rays of light with the longest thrown on along the shot, a thin
  ring and a few sparks.

## Frontline Split

`src/fxtest/split-fx.js`, in the same light-and-ribbon language, with a greatblade.
- **Hero.** Plays the overhead `slam`, raised during the rules' 0.65 s wind-up and chopping down
  at the strike.
- **Wind-up.** The lane it will cut (5 m x 1.4 m, turning with the aim since the skill aims during
  the cast) is drawn on the ground as a thin cel outline. It fills from the hero outward, and light
  gathers along the raised blade.
- **Strike.** On the rules' `lineStrike` (owner: a vertical crescent and a harder hit):
  - the blade hits the ground with a burst of upward rays and a shockwave ring;
  - a tall **vertical crescent** of light (a mesh: tips up and down, bulging forward, white-hot
    front edge, speed lines, a soft additive glow) flies down the lane;
  - a cut line opens in the ground behind it;
  - as the crescent reaches each struck target, a hard burst goes off on it (a glow that pops,
    rays thrown on along the cut, a ring);
  - the bench camera gives a short shake on the ground hit and on each target.

## Sunder Cut

`src/fxtest/sunder-fx.js`, with an axe (two-handed heavy swing). The cut is the bench Slash
crescent in amber steel (`SUNDER_PALETTE`, passed to slash-fx). On each struck target:
- a hard burst: a glow that pops, rays thrown on along the cut and a short camera shake;
- angular armour shards of light breaking off and falling.

While the rules keep the target's armour exposure (18 % for 5 s), a broken ring of light (six arcs
with gaps) circles it at chest height, slowly turning and pulsing. A broken-shield icon (two
amber halves split by a zigzag crack, drawn once into a canvas) pops in over its head and bobs
there. Both fade as the exposure runs out.

Owner review: Chain Spark has no contact burst on its targets, and the Frost Nova ground is a
flat cel decal (scalloped edge, rim band, no inner lines) that recedes inward to melt.
