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
- Controls: tap the floor to aim, **ร่าย** casts (hold for Flame Stream), **หลบ** uses the move picked in the panel's หลบ row (dash, roll, blink or leap; the leap arcs through the air as in the game, with the game's dodge effects),
  slow motion ×0.5/×0.25, close/game camera, auto-repeat, reset dummies.
- The effects are the game's: `src/render/skillfx/*-fx.js`, driven by the same director
  (`src/render/skill-fx.js`) in the bench and in the game View. A change made here is a change
  to the game. The bench keeps their point lights and the flame occluder pass; the game turns
  them off. Only the skill fusion (`flame-slash-fx.js`, `fusion.js`) is bench-only.
- The rule trials made here (Venom Arrow, the slam stun, the quick stab, no third-hit finisher)
  are now game rules in `data/skills.json` and `src/core/`.

`node --test tests/core/fx-bench.test.js` checks that the bench offers fitting mods and
that they change the events the effects draw. Review hooks: `__fxtest.freeze()` then
`__fxtest.advance(seconds)` renders deterministic 60 Hz steps for screenshots.

## Skill fusion (prototype)

Rules live in `data/fusion.json`; `src/fxtest/fusion.js` applies them on top of the real
rules without changing `src/core`. A physical attack with a short cooldown (the carrier,
e.g. Slash, Hunter's Shot) can link one fast damage spell (the payload: projectile spells such as
Firebolt and Arcane Bolt, and Chain Spark) into one of its mod sockets. When the carrier connects,
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

### Recipe: Thunder Arrow / ศรอัสนี (Hunter's Shot + Chain Spark)

`type: arrow_chain`. Casting starts a 0.6 s draw (the bow drawn and held, `bowDrawHold`; aim
follows the pointer); at its end one arrow is loosed (`bowLooseShot`; a real projectile: 30 m/s,
16 m, radius 0.35, Hunter's Shot's damage). On its first hit Chain Spark's lightning bursts from
the struck target: it and up to Chain Spark's chain count of the nearest others within its
chain range each take `chainDamageMult` (0.6) of Chain Spark's damage with its falloff, once
each; the `chain` event carries `from` so the chain starts at the target, not the hand.
Cooldown 1.0 s, MP = both skills. Visuals in `src/fxtest/thunder-arrow-fx.js`: short jagged
arcs crackling round the drawn arrow, more and brighter as the draw fills, and a cold nock glow;
the arrow (drawn as an arrow by vfx.js) wrapped in three re-struck lightning strands trailing
behind its head with a head glow and shed sparks; the hit is Chain Spark's own lightning.

## Slash (bench look and rule trial)

`src/render/skillfx/slash-fx.js` draws one clean crescent of light around the caster over the real range
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

Every melee arc skill is one plain strike (owner request, now a game rule): swings in a row only
alternate the arm; there is no third-hit finisher with extra damage and knockback.

## Firebolt additions

The game's Firebolt renderer is unchanged. `src/render/skillfx/fire-extras.js` adds two bench layers:
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
Venom Mire is now **Venom Arrow**, a bow attack (in the game too, `data/skills.json` `venom_mire`
with core poison stacks): a fast thin arrow
(26 m/s, 14 m, cooldown 0.6 s, uses arrows, no pierce of its own) with a small direct hit. Every
hit adds a poison stack on that target, up to 5, and refreshes its 4 s; each stack adds dps worth
0.6 x that hit, so one target kept under fire ramps past a plain arrow while a single hit is weak.
Firebolt is burst on whatever it hits; Venom Arrow rewards staying on one target. Arrow mods fit
(Split, Pierce, Bounce, Returning Shot, Laceration...); field mods and element Shifts do not.

`src/render/skillfx/venom-fx.js` uses the same language as the bench's Firebolt and Chain Spark (light,
not solid shapes): the arrow is a thin hot yellow-green needle of light with a short trail and a
fine wisp twisting round it; on impact a small ragged poison flash (`ELEMENT_LOOK.poison`), a puff
and a few streaks; a poisoned dummy is tinted green by its stacks and gives off rising motes, more
with more stacks, and a "พิษ ×N" label shows each new stack.
The Cartoon FX gallery host was blocked for this
pass, so no gallery clip was studied; it follows the cel rules in `docs/VFX-REFERENCE.md`.

## Arrow Rain

`src/render/skillfx/rain-fx.js`, in the same light-and-ribbon language. The rules send one `area` event
per wave, each with its delay, and a `burst` as each lands.
- **Up-shot.** The hero plays the `bowSkyShot` clip action: lean back, raise the bow, draw and
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

`src/render/skillfx/power-fx.js`, in the same light-and-ribbon language. Hold **ร่าย** to charge (the
rules' `chargeStart`; release calls `releaseCharge`, auto-repeat holds about 1.6 s).
- **Hero.** Raises and draws, then holds at full draw (the `bowDrawHold` clip action), and snaps the loose
  on release (`bowLooseShot`).
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

`src/render/skillfx/split-fx.js`, in the same light-and-ribbon language, with a greatblade.
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

`src/render/skillfx/sunder-fx.js`, with an axe (two-handed heavy swing). The cut is the bench Slash
crescent in amber steel (`SUNDER_PALETTE`, passed to slash-fx). On each struck target:
- a hard burst: a glow that pops, rays thrown on along the cut and a short camera shake;
- angular armour shards of light breaking off and falling.

While the rules keep the target's armour exposure (18 % for 5 s), a broken ring of light (six arcs
with gaps) circles it at chest height, slowly turning and pulsing. A broken-shield icon (two
amber halves split by a zigzag crack, drawn once into a canvas) pops in over its head and bobs
there. Both fade as the exposure runs out.

Frontline Split also cracks the ground open along the lane: a zigzag fissure with forked
branches tears open just behind the crescent, glowing hot at first, then left as a dark crack with
rubble thrown up; it lingers 1.8 s and fades.

## Breakbeat Slam (slam and stun)

The owner found the interrupt timing hard to use, so Breakbeat Slam stuns everything it hits (now a
game rule, `stun` in `data/skills.json`): 1.2 s, bosses 0.4 s, using the rules' stunned state, which
the bench clears after the time (its dummies run no AI).

`src/render/skillfx/mace-fx.js`, with a mace (overhead `slam`). On contact (the rules' `slash`; no
horizontal crescent, it is a downward blow):
- a heavy ground impact in front: a popping glow and upward rays;
- two shock rings racing out over the 65 degree cone and a ring at the impact point;
- a hard burst on each struck target, and a camera shake;
- a "มึน!" banner, with little stars of light circling each stunned head until it recovers.

## Flank Thrust (the dagger's quick main stab)

Owner: make it a main skill with a short cooldown and less damage, and less from the front too.
It is now a 0.5 s, no-MP stab (game data too):
- base damage 6 + 0.6 x power (it was 10 + 1.1 x power on a 2.5 s cooldown);
- a front hit lands at 0.7x;
- the rules' 1.6x side/back bonus is unchanged, so a stab from behind is about 2.3x a front stab.

The game keeps its Flank Thrust until this is approved.

`src/render/skillfx/thrust-fx.js`, with a dagger. It is a stab, not a cut, so the slash crescent is
skipped. The hero plays a bench-only `thrust` action (pull the dagger back at the hip, lunge and
drive it straight out). Multistrike repeats replay the skill's own motion and effect (`OWN_STRIKE`
in main.js: Flank Thrust and Breakbeat Slam draw their own strike on each repeat's `slash`). The
Slash crescent is only for skills that cut.
- **Layout.** On the bench (`FACINGS` in sandbox) one dummy in the thrust faces the hero and one
  turns its back. Each dummy's weak side is marked on the ground with a dashed gold half-ring
  behind it.
- **Contact** (the rules' `slash`). A narrow spear of light shoots out to the 2.5 m reach, with two
  thin speed lines beside it.
- **Front hit.** A small blue-white burst.
- **Side or back hit** (the rules' 1.6x positional bonus, the same facing test as the rules):
  - a hard gold burst with rays thrown on along the stab;
  - a gold weak-point diamond that snaps shut on the target;
  - a "จุดอ่อน!" label and a camera shake.

## Shield Bash

`src/render/skillfx/bash-fx.js`, with a sword and a shield (sandbox equips the skill's `requiresOffhand`).
The hero plays a bench-only `shieldBash` action: the shield arm loads back across the body, then
drives the shield straight out. It is not a crescent.
- **Contact** (the rules' `slash`):
  - a burst at the shield;
  - two upright rings of light racing forward, facing the bash;
  - a cone shock ring over the 90 degree arc on the ground;
  - a short camera shake.
- **Each struck target:**
  - a hard burst;
  - a fading skid streak on the ground as the rules' knock slides it back;
  - for the rules' 3 s taunt, a red anime anger mark over its head and a red ring at its feet,
    pulsing until it ends.

## Measured Riposte

`src/render/skillfx/riposte-fx.js`, with a sword. Something has to strike the hero, so on the bench the
nearest dummy winds up (a red "!" over it, 1 s) every 3.2 s and then strikes the hero through the
rules' `damagePlayer` (bench-only; the hero is never brought below 30% life).
- **Guard** (first press, the rules' `guardStance`, 0.8 s): the hero plays a bench-only
  `guardBlock` action (the sword brought up across the front) and a curved pane of light over
  the guard's 110 degree arc stands in front of it, following its facing: crisp cel rims, a glassy
  fill strongest at its foot, diagonal shine streaks sliding over it; it pops up with a little
  overshoot and flickers out, with a matching arc on the ground.
- **The blow:** a red lunge streak from the attacker. If the guard catches it (the rules'
  `playerHit` with `blocked`), an anime clash (owner: the first parry was too weak):
  - a big four-point star of light where blade meets blow, a second one turned 45 degrees behind
    it, popping in and spinning out;
  - a long thin glint across the contact and focus lines bursting out around it;
  - a spray of hot metal sparks thrown back at the attacker and out to the sides;
  - two upright shock rings facing the attacker and a ring on the ground;
  - the guard wall breaks into shards; a hard camera shake and the banner "ปัดป้อง!".
  A blow the guard misses flashes red on the hero.
- **Counter window** (the rules' 1.5 s ready window): a gold ring pulses at the hero's feet, the
  blade glows gold and the cast button gets a gold halo (its cooldown shade is hidden, since the
  counter ignores the cooldown).
- **Counter** (second press inside the window): a big cut with a gold crescent (the slash-fx
  palette `RIPOSTE_PALETTE`) and a hard gold burst on each target, with a shake.

Owner review: Chain Spark has no contact burst on its targets, and the Frost Nova ground is a
flat cel decal (scalloped edge, rim band, no inner lines) that recedes inward to melt.
