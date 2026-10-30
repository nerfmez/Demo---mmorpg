# VFX reference library and research workflow

เว็บนี้เป็น **คลังอ้างอิงสำหรับค้นและศึกษา VFX ตามสกิลที่กำลังทำจริง** และเป็นแนวทางด้านสไตล์ของเกม ไม่ใช่แค่ mood board และไม่ใช่ asset ที่จะนำมาใส่เกมตรง ๆ

**Primary reference library:** [Cartoon FX Remaster gallery](https://www.jeanmoreno.com/unity/cartoonfxremaster_gallery/?fxpp=8&page=1) (Jean Moreno, Unity Asset Store).

The packs are paid Unity assets. Never copy, extract or reproduce their textures, meshes, prefabs or a complete effect one-to-one. Study the visual language and motion, then rebuild an original effect in our renderer (`src/render/vfx.js`, `particles.js`, `trail.js`, `ribbon.js`) with tunable numbers in `data/combat-fx.json`.

## Required workflow for new or reworked skill VFX

Before implementing a new combat effect, or substantially redesigning an existing one:

1. **Search the gallery for the actual skill need.** Use the skill's element plus function, not only the element: for example lightning/electric + strike, impact, explosion, projectile, barrier, surface, aura, trail or status.
2. **Inspect several relevant effects when available (normally 2–5).** Do not pick one clip and imitate it. Compare what each reference does well.
3. **Break the motion into phases:** anticipation/charge, main attack motion, hit/impact, secondary sparks/debris/trail, and lingering/status/ground effect when the gameplay needs them.
4. **Study transferable principles:** silhouette and shape progression, timing, acceleration/easing, layer order, scale change, spacing, colour hierarchy, impact readability and how long each phase remains visible.
5. **Design an original Frontier version.** Combine only the useful principles, change shapes/timing/colour/layering for our skill mechanics, camera and anime cel-shaded world, and keep the visual footprint aligned with the real gameplay hit area.
6. **Validate in the actual game camera.** Iterate in the [Skill Lab](SKILL-LAB.md) (same camera angle, loads in seconds) and share its link with the owner; then check readability against monsters, terrain and other combat effects, especially on iPad. Reduce layers/noise before sacrificing gameplay clarity or performance.

If the gallery has no useful match, broader web/video reference research may be used, but the same rule applies: study motion and visual principles, never clone a complete effect or copy protected assets.

## Example: developing a lightning skill

For a lightning skill, do not stop at "make it electric." Search the gallery for several roles that could make up the final effect, such as:

- lightning strike / bolt for the main attack motion
- electric impact / explosion for the hit frame
- sparks for secondary hit accents
- electric surface for a lingering ground zone
- electrified/status effects for a short shock state
- barrier/aura effects for anticipation or charge-up when appropriate

A single skill may borrow the **timing idea** from one reference, the **impact shape language** from another and the **secondary spark behaviour** from a third, then be rebuilt as one coherent original effect for Frontier.

## What to learn from the gallery

- Chunky, readable shapes: bold flash cores, star/spark bursts, rings and short thick slash arcs instead of fine noise.
- Short, punchy timing: fast pop-in, decisive main motion, readable impact, then eased fade-out.
- Strong per-element colour identity while preserving a clear brightness hierarchy between core, body and secondary particles.
- Clear layer separation: main shape first, supporting particles second, optional lingering/status layer last.
- Categories that map well to our needs: hits and slashes, sword trails per element, elemental projectiles and explosions, auras and shields, pickups, status expressions, water splashes/ripples, dust, leaves and weather.

## How to adapt it to Frontier

- Keep our anime cel look (see `AGENTS.md`). Effects must not hide monster wind-ups or turn combat into a screen-clearing race.
- Effect shapes and timing must communicate the real gameplay hit area and hit timing.
- Fit iPad performance: pooled/reused particles, no per-frame allocations, and `disposeObject()` for anything removed.
- Mods such as split, pierce, chain, ground, echo, element and trigger should alter the effect in ways that remain readable without requiring a completely unrelated visual language for every combination.
- For substantial VFX work, note the gallery effect names/categories studied and the principles taken from them in the PR or handoff. This is research provenance, not permission to copy the assets.


### Physical attack study — 2026-10-01

Inspected the primary Cartoon FX Remaster gallery previews for `CFXR4 Sword Trail PLAIN (360 Thin Spiral)`, `CFXR4 Sword Trail SLASH (360 Spiral)`, `CFXR4 Sword Hit PLAIN (Slash)` and `CFXR Hit Sparks HDR`. The useful motion principles are a narrow taper, a quickly traveling leading edge, a contact cut shorter than the trail, and separate directional shards that decay after the contact flash. Frontier uses original procedural ivory/steel ribbons and warm contact shards, with no copied preview, texture or paid asset in the game. Its reach, arc and contact time continue to come from the existing skill rules.

### Other physical skills — 2026-10-01

Also inspected `CFXR2 Ground Hit (Alt) + Debris (Lit)`, `CFXR2 Debris Hit (Lit)`, `CFXR Impact Contrast` and `CFXR Magic Poof` in the same primary gallery. Ground contact is immediate while solid debris has a separate gravity/decay phase; compact high-contrast contacts read before their small fragments. Summoning separates reveal from upward disappearing accents. Frontier adapts these timing principles into original faceted earth geometry, restrained chips, thin arrow strokes and inward spirit marks, without reference media/assets in the game. The broad poof/cloud and colourful star silhouettes are not reproduced.

### Monster strikes — 2026-10-08

The gallery host was blocked by this session's network policy, so no gallery clip was inspected for this pass. A first version drew claw/fang/pincer shapes as camera-facing marks on the hero; the owner rejected it because it looked like images pasted on top and did not come from the monster. The current version follows the same rule as the hero's blade trail: thin ribbons recorded from the real tip of the striking limb (paw claws, jaws/tusks, crab claws, mantis blades), bright only while that tip moves fast, with the strike animations sweeping across the body so the trail reads from the game camera. No reference media was copied. Re-check against relevant gallery claw/bite/hit clips when the host is reachable.

### Dodges: Blink and the Leap's slam — 2026-10-25

The gallery could not be reached from the cloud session that rebuilt these (network policy), so the
principles already recorded above were applied: `CFXR Magic Poof` (the reveal kept apart from its
accents) for Blink, `CFXR2 Ground Hit (Alt) + Debris (Lit)` and `CFXR Impact Contrast` (an immediate
compact contact, debris on its own gravity phase) for the landing. Original Frontier shapes in
`src/render/skillfx/move-fx.js`: a violet gather ring and spiral wisps, a slit pinching shut, a
flash-step streak and a slit opening with a ring; a single tapered leap ribbon (no bead trail), a
compact flash, two shock rings sized to the landing radius, short ground cracks, a low dust skirt and
a few chips.


### Anime style for job skills — 2026-10-26 (current)

The owner rejected the light-and-ribbon job effects as low quality, asked for research, and then picked
the **anime (sakuga)** style from two quality references (a painted and an anime fireball sheet). The
research source is the MIT-licensed `rng-vfx` guide (https://github.com/MRRengi/rng-vfx), itself
drawn from Riot's League of Legends VFX style guide, Arc System Works' Guilty Gear Xrd GDC talk and
Gilland's *Elemental Magic*; most VFX sites are blocked from the build container. Rules we follow:

- Designed shapes, hard edges, flat fills: a white core, one saturated band, a darker hue-shifted
  shadow band (never black); bands follow the shape's body, not only its age. No soft additive haze.
- Shapes are redrawn on a 12-drawings-per-second grid (`drawingOf`); positions may move smoothly.
  Nothing designed is held unchanged for more than 2 drawings.
- Projectile heads are stretched along the motion (a comet, not a ball); trails taper to nothing.
- No straight cuts: every shape narrows or ends inside its quad or strip.
- Telegraphs show the true area: a crisp edge, a low fill, and a fill growing from the centre to the
  edge on the landing frame (hatched so the ground and monsters stay readable).
- Smoke is solid cel smoke (two lit bands, round scallops), dies by holes opening, then shrinks; fire
  chunks cool into smoke from the outside in.
- Few big shapes and many small accents (about 1 : 0.5 : 0.15), staggered by 1-3 frames.
- Impacts: a compressed core then the full shape in 1-2 drawings, never a slow grow; no closed even
  rings (they read as a selection circle), no concentric star plus ring plus disc (a reticle).

A first live comet shader stayed far from the reference ("ไม่ใกล้เคียงกับตังอย่างเลย"). Pasting the
reference images in as flipbooks was rejected too: effects are built live, the images are only a model
for the shape language ("คุณต้องทำเอฟเฟคสกิลไม่ใช่เอารูปมาตัดใส่"). What we take from the reference:
a mass of round cloud lobes at the base with big curling flame tongues rising and splaying outward
above; a pale yellow core in front with its own tongue edges and an orange crescent; an orange body
with a dark red crescent on the side away from the light and a thin dark line; dark plum cel smoke
behind that takes over as the fire breaks up. A second try built the fire from many separate flame quads ("ห่วย รูปทรงไม่ได้เลย"), a third drew one
flat fire mass per quad, a fourth was toon-shaded solid 3D meshes. The owner: "คุณภาพมันไม่ดีพอ มันไม่
เกี่ยวกับสไตล์แล้ว" and named the bar: **Firebolt and Flame Stream** (Chain Spark simple but right; the
rest fine). What makes them good: fire as nested see-through shells (or one thresholded density
field) cut from domain-warped noise that is carried along the flow, a smooth hot-to-cool heat ramp
with narrow transitions, glow above the tone mapping, smooth motion every frame (no stepped drawings),
fluttering curved embers, a ragged flash at contact, lights on the ground. Meteor now uses exactly
those techniques with its own shapes (`skillfx/meteor-flame.js`: Firebolt's `V5_FIELD` noise and heat
ramp and colours on a comet shell round the rock and an explosion dome whose cut-off rises with age;
`FireExtras` embers, flash and puff at meteor size). Lessons: judge against the owner's best skills,
not a style name; polish one approach instead of swapping approaches; a shell in front of the rock
hides it (draw the rock last, without depth test). Owner review (better, "ดีขึ้นมาก"): ground cracks
replaced by a round sunken crater, shaded in three toon steps from a height field (a bowl, a raised
broken lip; soot; a molten floor that cools); the flying rock chunks land and shrink away (left as
rubble was rejected); the
warning fill is plain (no dense hatching). Showing the meteor the whole warning made the rock tumble
oddly in the sky (rejected): it falls only in the last 0.6 s again, out of a sky cue made like
Firebolt's charge: a small fire swelling as the gather wisps spiral in, with a turning flare glint.
Checked in the real game: its camera is far higher than the bench's (18.9 m up, 13.5 m back, fov 36),
so a cue 7 m above the target is off the top of the screen. The owner wanted it higher: the fire is
born 11 m up where a ray through a point near the top of the screen, a little right of the target,
meets that height, and the meteor falls from there. `skillfx/anime-kit.js` keeps the ground warning. Thunderstorm (owner pass on Meteor, then next) is built from Chain Spark's own
lightning (`chain-fx.js` exports `zig`, its crackling core and glow shaders). Owner review: the storm
eye high in the sky became a ball of lightning hovering 6.5 m over the circle (slid toward the
camera when it would leave the top of the screen) and drifting slowly
after the monsters in it (a plasma sphere: white-hot heart, electric-blue rim, flowing bands, normal
blending so it stays blue over grass; short arcs crawling over it; a ragged flash flicker), and the
bolts were too busy: two clean bolts a wave (one fork each, low jag, no second parallel bolt) drop
from the ball to the monsters (else to spots in the circle); each lands in a ragged flash, a few flat
tendrils, sparks, a scorch mark and Chain Spark's shocked arcs; the last wave is a big bolt to the
centre and two more, and the ball bursts out. `skyAbove` (fx-common) places Meteor's sky fire.
Blizzard (after Thunderstorm passed) follows `.claude/skills/skill-vfx`: Frost Nova's
clean cel frost spreads to the true radius with snow drifts sweeping round over it (noise carried
round the centre); a wall of wind rises round the edge, cut from Firebolt's warped noise (`V5_FIELD`)
carried round the circle and stretched into streaks, see-through where it faces the camera so the
monsters inside stay readable; snow streaks and flakes spiral round the centre (curved trails along
their own orbit); at the end the wall tears apart and the frost melts inward. Passed by the owner, who chose
not to add more swirling snow for fear of the cost on the iPad: keep these zones light.

### Job melee skills — 2026-10-26

Sky Shatter (heavy weapons, a 0.7 s wind-up, a 140 degree stunning slam), `skillfx/shatter-fx.js`:
pebbles lift and tremble round the hero through the wind-up; on the contact a ragged flash and light
rays at the landing point, a round crater (the shared `ground-kit.js` crater, also Meteor's), three
rows of blunt ground slabs heaving up over the true arc and range a beat apart (inner edge lifted,
dust off them, then sinking back; first built as sharp spikes, but the owner noted a stun is blunt
force, so no points), the pebbles flung forward; Breakbeat Slam's stun stars on
the struck monsters. The owner then asked for a ground-pry motion and picked candidate A (Quaternius
Sword_UpperCut, CC0) over a dragged lift: `skyPry` in `data/action-clips.json` (the blade low in the
ground through the crouch, ripped up and overhead on the hit), and the pebbles are thrown up with the
blade. The rip read too fast: the rise was spread to about a quarter second and the
held overhead pose plays over 0.6 s; the skill is renamed Earth Heave (งัดพสุธา, id kept
`sky_shatter` for saves) to match the motion.

Earth Rend (แผ่นดินแยก, heavy weapons, an 8 m x 1.8 m line after a 0.8 s wind-up), `skillfx/rend-fx.js`:
Frontline Split's lane on the ground through the wind-up; on 'lineStrike' a ragged flash and dust where
the weapon lands, then a rift races down the lane (a chasm decal: dark depth, the sun-side wall lit, a
broken lip, the rift wandering), both banks heave up as blunt slabs tilted away from it, dust bursts off
the running front and rock chunks are thrown up; the slabs sink back and the chasm closes from the far
end. Stone, dust and slab pieces are shared from `ground-kit.js`. Owner review ("ยังไม่สวย": the banks and the lack of power):
the slabs became one continuous heaved ridge on each bank (a mesh rebuilt per frame: a torn wall into
the chasm, broken plates shoved up at different heights and tilts, a ragged outer edge), and the run
got beats: the front speeds up, every fifth of the way a dust column and rock chunks burst up with a
shake pulse, and the far end ends in a big burst. Still rejected ("เหมือนตัดแปะ": the ridge meshes read as pasted on
the ground). Third version, per the owner: a jump slash (`rendLeap`, Breakbeat Slam's approved jumping
smash with a higher leap) and everything at once on the hit, no running front: a jagged fissure with
forks glowing hot for a moment inside a band of scorched earth that blends into the ground, blunt rock
pillars bursting up out of it and shattering into pieces that fly and fall, small rocks and a wall of
dust along the whole lane, one hard shake.

Cross Cut (ฟันไขว้, daggers, two quick cuts 0.14 s apart), first built with `skillfx/cross-fx.js` (since removed): the two cuts are the
bench's slash crescents with fixed, opposite steep tilts (`SlashFx` takes a `tilt` and `y` per strike),
so together they draw an X; on the second cut an X of light (white core strokes in a blue glow, sharp
at the tips, drawn over the bodies) flares in the air in front of the hero, holds a beat, then splits
apart along its arms and fades, sparks thrown off the crossing; each struck monster gets a small X
glint on its body.
Owner review: Cross Cut became a dagger main skill (two cuts per press, MP economy round), and it got
its own motion, candidate B picked by the owner: `crossCut`, the first two cuts of Quaternius
Sword_Light_Combo (a diagonal cut down across the body on the hit, a backhand out the other way on the
repeat), so the hero's two cuts match the two crescents and the X lands with the backhand.
Owner review ("กากบาทเหมือนรูปแปะ", and asked for violet): the ready-made X floating between the hero
and its targets is gone. The crescents are violet, and each monster the cuts reach gets the cuts' own
lines across its body: the first zips in as the first cut lands and waits, the second crosses it,
then both flare with a burst of sparks and thin away. A line in the hero's vertical plane was tried
first and read edge-on from the high game camera, so the lines lie across the camera's view.
Owner, next round ("ไม่ต้องมีกากบาทแยกออกมา เอาคลื่นโค้งๆนั้นแหละฟังสลับกันเป็นกากบาท"): no separate X at
all. The effect is only the two violet crescents: same height and reach, opposite tilts and sweeps, the
first held until the second has swept across it so the two crescents themselves cross as an X, then
both fade together. `cross-fx.js` is gone. Rolled about the hero's facing, the two crescents overlap as
one band from the game camera, so these two face the camera at opposite 45° diagonals with a flatter
64° arc and cross over the target area in front of the hero.
Owner: "X มันต้องไปข้างหน้า อันนี้มันล่างขึ้นบน" (a camera-facing X stands up the screen). The crescents now lie
level at waist height, crossing as an X whose arms reach forward from the hero, and drift forward
over the target.
Checked close up from the game camera, the two usual fan-shaped crescents met like a ">": they are now
thin curved bands crossing at their middles, drawn over the monster they cross so the X is whole.
Owner: the X must read from the hero's point of view, not from above. The two thin crescents now stand
upright in front of the hero, facing it, crossing as an X in the air ahead (the bench's `?cam=pov`
looks over the hero's shoulder). From the high game camera an upright X facing the hero is seen
edge-on when the hero faces across the screen.
The owner's iPad recording confirmed it ("เปลี่ยนมุมก็มั่ว มองไม่เห็น": turning, the X vanished). The X now leans
back about 60° from upright: from the hero's view it is still the X cut in front, and the game camera
reads it in every facing (checked aiming up, down, left, right and diagonally).
Owner: "แกนยังไม่ตั้งตรง และฝั่งคม (สีอ่อน) ต้องพุ่งไปข้างหน้าตรง": the X must come out of the forward cut. The two crescents are
now ordinary cuts around the hero, bulging forward with the bright sharp edge leading, rolled 45° either
way about the facing so they make an upright X from the hero's view, and they fly on forward as a wave.
From the high camera they read as forward-flying crescents in every facing.

Blade Storm (พายุมีด, daggers, four spins 0.3 s apart over a 3 m circle), `skillfx/storm-fx.js`: each spin is a
slash crescent round the whole circle in the blade job's violet (Cross Cut's), each a little higher
than the last so the four stack like a whirlwind of blades; wind streaks spiral up round the hero
through the spins; the last spin flings sparks outward with a flash and a short shake. The hero
spins with Whirl Blade's approved `whirlSpin` run four turns (`bladeStorm`).
Owner: daggers should not reach that far; make it quick short spins round the body and a main skill. Now
two quick spins 0.15 s apart within 1.8 m (0.9 s, 22 MP), two small rings, a light burst; `bladeStorm`
is two quick turns.

Backstab (แทงหลัง, daggers, the blade job's 8 s cooldown that replaced Blade Storm's slot), `skillfx/shadow-fx.js`:
on the rules' `shadowStep` the hero vanishes in a spray of violet shards with a closing ground ring, a
violet streak arcs low from there to behind the target, shards gather in where the hero appears and a
violet light flashes. The stab is Flank Thrust's spear and hard burst (`ThrustFx`, `violet`) in the
blade job's colour with a shake, and "แทงหลัง!" when it lands from behind (the rules' 1.5x positional
bonus); the hero plays `flankStab`.
Owner: "เอฟเฟคตอนวาปยังธรรมดาไป". The gallery host was blocked again (403), so no clip was inspected.
The step is now drawn as shadow, not light: a dark ink body with a violet rim reads on any ground. A
noise-edged shadow pool opens under each end, ink tendrils whip up and sink, a thick ink streak with a
bright thread swings out round the target's side to its back (a curve, never through the body), dark
afterimages of the hero's pose are left where it stood and along the curve, and a tall violet slit
flashes where it appears. Also asked: target skills should lock by dragging the button, so a drag on
Backstab picks the monster it points at within 7 m (target ring) and steps behind that one.
Owner: no effect on the ground, and the Thai name is แทงหลัง. The shadow pools are gone; the ink wisps
now leave the body (0.45-1.35 m up) and curl outward instead of rising from the ground.

Earth Heave (งัดพสุธา), owner: the pit should follow the cone. The round crater is now a fan-shaped pit
(`craterFan`) over the true 140° arc and 3.2 m reach, its point at the hero's feet; Meteor's stays round.
Owner: not as dark as Meteor's, nothing burns. It is freshly dug soil (`uBurn` 0): lighter browns, no
scorched floor, loose soil instead of soot round it.

Rally (ปลุกใจ, a duelist party buff: +12% damage for 15 s to the hero and allies within 8 m),
`skillfx/buff-fx.js` (`LOOKS` holds each party shout's colours and mark; the other warcry buffs will
join it), warm orange-red: embers spiral up through the cast; on the shout a ring and its echo race
out at waist height to the true 8 m radius (nothing on the ground), shout lines burst out like a manga
roar, spirit streaks shoot up with a star glint, and up-chevrons (the anime "power up" mark) rise over
every body the buff reached; while it lasts small ember streaks drift up off each buffed body. The
first try (thin gold lines, a pale ring) vanished on grass: an orange rim and a red glow read better.

Frenzy Roar (คำรามคลั่ง, a duelist speed buff: +20% speed for 8 s within 8 m), the same `BuffFx` in
blood red: a jagged roar ring (a roar's teeth) and its echo, the shout lines, chevrons ">>>" over each
body pointing the way it faces and sliding forward, and speed trails streaming back off each buffed
body while it lasts. A first pink tint read as cute, not frenzied; it is a deeper red.
Owner: it should look like a roar, as its name says. The shout marks (jagged ring, shout lines,
chevrons) are gone: air is drawn in to the mouth through the cast, then sound waves (wavy rings) pulse out
one after another at head height to the true radius, a blast of arcs ")))" bursts ahead of the mouth
and the camera rumbles; the speed trails stay while it lasts. Owner: no wavy lines; the rings are smooth.

Stand Firm (ยืนหยัด, a duelist guard buff: 15% less damage taken for 8 s within 8 m), the same
`BuffFx` in guard blue: the shout (ring and echo to the true radius, shout lines, spirit streaks, a cold
glint), a shield emblem that pops up over each body the buff reached and holds, and small streaks
circling each buffed body while it lasts.

Hold the Line (ยืนหยัดทีม, a guardian guard buff: 20% less damage taken and no knockback for 8 s
within 9 m), the same `BuffFx` in guardian gold: Stand Firm's shout and emblem (drawn twice, one inside
the other) plus a shield wall, eight shields snapping up one after another round the hero, held, then
fading; small streaks circle each buffed body while it lasts.

Blessing of Light (พรแห่งแสง, a priest spell: +10% damage and 10% less damage taken for 12 s within
9 m), first in the same `BuffFx` as holy light rather than a shout: motes of light drift down onto the hero through
the cast (Frost Nova's cast pose), a column of light falls on it as the soft ring goes out to the true
radius, a halo lights over each body the buff reached, and motes drift down round each buffed body while
it lasts. The column's additive glow tinted green on grass, so its core is wider and its glow softer.
Owner: make it prettier. Rebuilt in its own `skillfx/bless-fx.js` with the reference skills' techniques:
the column is a real see-through shaft of light (a cylinder whose streaks are noise carried down it, bright
at the rim, drawn over the scene so it stays white-gold), crisp four-point stars pop and twinkle as they
drift down, a glint flares where the light lands, and the halo stays over each blessed body, breathing
softly, for the whole buff.

Rapid Volley (ยิงรัว, bows: five arrows 0.12 s apart), `skillfx/volley-fx.js` in a cool wind tint: each
arrow is a real arrow (it was drawn as a generic orb before; `BOW_SHOTS` in vfx.js), a flick at the bow
(speed lines and a ring of air) marks each loose and the hero replays a quick shot for each, a wind streak
follows each arrow, and each hit bursts on the target, so the five shots read as a rhythm.
Owner: a cooldown skill must be grander than a main skill; kneel to shoot, and each arrow should fly like
a ball of wind splitting the air. The hero now drops to one knee for the five looses (`volleyKneel`); each
arrow carries a cone of split air on its head (a see-through shell with spiral wind bands) and two spirals
of wind round its path, a ring of air stands across the shot at each loose, and each hit bursts a gust.
The gallery host was blocked (403); no clip was inspected.

Killing Arrow (ศรสังหาร, bows: a 0.55 s aim, one heavy arrow out to 16 m, 10 s cooldown),
`skillfx/kill-fx.js`, crimson and gold, every beat of a cooldown skill: the hero sinks into a braced crouch
holding the deepest draw (`killShot`), a sight line runs out to the target while light gathers at the
arrow's tip and a reticle closes onto the target; the loose bursts two rings of air across the shot,
throws recoil streaks back and kicks the camera; a thick blazing streak follows the arrow and the line it
cut hangs in the air a moment; the hit bursts long rays along the shot, two rings and sparks with a hard
shake. The gallery host was blocked (403); no clip was inspected.
Owner: more effects. Added a sigil of turning rings standing across the shot in front of the bow through
the aim (the arrow bursts through it and it flies apart), a spinning ring round the charging tip, two
crimson spirals wound round the arrow shedding sparks in flight, and on the hit a beam piercing out the
far side of the target with a ring of air further on.

Holy Bell (ระฆังศักดิ์สิทธิ์, a priest cooldown spell: a toll of light 4.5 m round the caster that stuns),
`skillfx/bell-fx.js` in Blessing's holy white-gold: a see-through bell of light comes down over the priest
through the cast; on the toll it flashes and swells with a wobble, three rings of sound race out to the
true radius, stars burst outward and the camera shakes, and the stunned monsters get the stun stars;
then the bell lifts and fades. The first frames showed a vertical seam down the bell (its noise did not
wrap round the lathe); the shell noise is now taken round a circle, also on Blessing's column and Rapid
Volley's cone.
Owner: could be better. The bell is richer (gold bands at its lip, waist and shoulder, a light glowing
inside) and the toll a real event: a dome of sound races out with the rings, rays of light shoot up from
the crown, a smaller echo toll follows, and each struck target rings with a ring round it and a star.

Chain of Light (โซ่แสง, a priest cooldown spell: a chain thrown straight ahead; the struck target is 85%
slower for 2 s), `skillfx/lightchain-fx.js` in the holy white-gold: a real chain of light links pays out
from the staff to a star-headed tip, catches the target with a flash, pulls taut and dissolves from the
hand, and three loops of chain wind round the target, tighten and turn for as long as it is slowed, then
fall away; a miss draws the chain back. The game's generic orb is no longer drawn for it.
Owner: could be better. A sheen runs down the thrown chain, the head is a bigger star with a turning
cross of rays, the catch bursts stars, and the bound target is held in a web: four chains shoot out from
it to rings of light hanging in the air round it, and a seal turns over its head while it is slowed.

Spell Wave (คลื่นดาบเวท, a spellblade sword skill: a cut that sends a wide wave of arcane blade out 10 m),
`skillfx/wave-fx.js` in arcane blue-violet: the hero cuts with the sword (the bench's slash crescent in the
wave's colours), and a wide crescent of light bulging forward flies out with two fading afterimages,
speed lines off its tips and rune sparks; each hit slashes a crossing cut mark across the target; at the
end of its reach the wave thins and flies apart. The game's generic orb is no longer drawn for it.
Owner: it repeated Flame Wave Slash (Slash fused with Firebolt: a wide horizontal crescent of fire). Spell
Wave now cuts down (`splitChop`) and sends a tall upright crescent along a narrow line (`projectileRadius`
0.5), the line it cut hanging in the air behind it and an upright cut mark on each one struck. Owner: it
should not pierce on its own, since the pierce mod does that; it stops at the first monster unless the
pierce mod carries it through more. Owner: it should be a main skill. It is now the spellblade's main attack
(0.8 s cooldown, 24 MP, 90 + 0.9x, cast 0.24 s), and lighter to match: one afterimage, a shorter hanging
line, fewer sparks; several waves can be in the air at once (pooled by projectile id). Owner: a skill that is
already magic cannot fuse with a spell: Spell Wave (Arcane) is no longer a fusion carrier (`data/fusion.json`
carrier excludes Arcane). Element shift mods go only on attacks with no element; owner: Arcane has no
special effect, so it does not count, and a fire, frost or poison shift on Spell Wave recolours the cut
and the wave (`wavePalette`, per-wave colours from the projectile's element).

Iron Body (กายเหล็ก, a heavy-weapon self buff: 6 s of no knockback and 15% less damage taken),
`skillfx/iron-fx.js`, in the bench's light-and-ribbon language with a steel tint (the gallery host was
blocked, 403): steel speed lines rush into the chest through the cast; on the buff a shell of hexagon
plates sweeps up round the body, holds and shrinks into it, with a steel glint at the chest, a ring
snapping out at the waist (in the air, nothing on the ground) and sparks; while it lasts a sheen ring
slides up the body every 1.2 s so the state stays readable. The shell is drawn over the scene, not
added to it: an additive version turned green on grass. The hero plays the War Cry roar.

### Meteor, Thunderstorm and Blizzard — 2026-10-26

Reference (owner): **the effects already made on the FX bench** (`fx-test.html`, published bench),
not outside sources and not the approved meshes' shapes. Three earlier versions were rejected: soft
fog-like glows (too vague), a build from the approved meshes (copied shapes), and flat cartoon shapes
with dark outlines (not the bench's style). The bench language, studied frame by frame from the game
camera (Slash, Firebolt, Chain Spark, Frost Nova, Flame Stream, Arrow Rain, Frontline Split, Breakbeat
Slam): light, not ink; a near-white core strip inside a coloured additive glow; soft radial glow
sprites that pop; sharp rays; thin ring/rectangle outlines of light marking the real area; little
four-point stars; spark streaks on gravity; Chain Spark's thin angular crackling bolts; Frost Nova's
lit pale ice with white facet edges. Shared pieces: `skillfx/light-kit.js`.
The size follows the skill's tier (owner): these are job skills (job level 40, 10-12 s cooldowns), so
they get more beats and a wider footprint than the basic spells, inside the real hit area.
Meteor: a double ring with a closing timer ring and a star in the sky; a fire-light ball with a thick
tail; on impact a big glow pop, rays, two shock rings, glowing cracks that cool, sparks, stars, embers.
Thunderstorm: a double ring with a crackle running round it; thin crackling bolts from the sky with
ragged flashes, glow pops, rays and sparks; the last wave a big bolt, a large flash, a shock ring.
Blizzard: a double ring over a faint frost sheet; lit ice blades bursting up round the edge; spiralling
wind-light streaks, snow stars and glints; the blades shatter at the end.

### Warden boulder roll — 2026-10-26

The gallery host returned 403 to this session again, so no clip was inspected. The roll uses the anime
motion language the owner asked for: a few fading afterimages of the ball itself behind it (motion blur
read as cel frames), thin cream speed lines streaking back from its silhouette in staggered pulses, a
soft dust streak on the ground and a slight stretch of the ball along its path. Original procedural
shapes (`src/render/roll-fx.js`, numbers in `data/combat-fx.json` `roll`); nothing copied. Re-check
against relevant gallery dash/rush/speed-line clips when the host is reachable.

### Blink Draw — 2026-10-27

The spellblade's dash cut (`draw_cut`, `skillfx/draw-fx.js`), first round. The owner picked the hero's
motion from Quaternius `Sword_Dash` (pick A) over searching for a hand-on-hilt reference, so the
"magic sheath" is drawn as light: a sheath ribbon closing along the blade through the 0.35 s wind-up with
rune motes drifting into the hilt. The dash leaves three speed streaks (thick at the hero); on arrival
the whole lane is cut at once: one white-hot line that holds a beat, then parts in two and fades, a trace
on the ground so it reads from the high camera, the sheath breaking into shards at the hero, and a long
diagonal cut mark on each monster in the lane. Principles kept from the gallery's sword trails and hit
sparks (above): narrow taper, a fast leading edge, the cut shorter-lived than the trail, directional
shards. Spell Wave's arcane blue-violet; an element shift recolours it. One ribbon pair, pooled sparks.

Round 2 (owner: "stiff and plain"). The motion keeps the clip but follows the anime beat: the crouch
loads early and is held coiled, the draw snaps to the hit in 0.035 s, the lunge overshoots, settles with
the blade swept back and holds through a new rules beat, `cutDelay` 0.18 s (the hero arrives, a breath,
then the lane falls apart). The effect gained a layer per beat: focus lines rushing in on the ground and
a glint on the blade before the draw; the draw's flat crescent and a ring with kicked sparks where the
hero leaves; three violet posed afterimages along the dash; a small flash on arrival while the streaks
hang; then the cut: the white-hot lane line, two slanted cut lines across it one after the other, a
ground trace, sheath shards, and an X of cuts with a flash on each monster, with a stronger shake.

Round 3 (owner: no draw crescent like that; the white line along the path is stiff; the hits are weak).
The draw's crescent is gone. No ruler line: the dash leaves a short wavering comet tail on the body that
collapses into it on arrival, and a slipstream of thin speed dashes at many heights, each drifting back
and fading on its own. The cut runs down the lane from where the dash began (0.016 s per metre): quick
curved cuts in the air, and on each monster a big curved slash drawn by a fast leading edge with a
thinner slide beside it, a ragged arcane flash (Firebolt's `flashMaterial`, violet) and shards sprayed
along the cut. The arrival glow and the lane's straight line and ground trace were removed.

Round 4 (owner: "I did not ask to change the style, only that it was not good enough; I do not like the
new hit at all"; and a new name, Blink Draw / ชักดาบพริบตา). Round 3 is reverted to round 2's look, without
the draw's crescent. Every line is now a blade: many points, sharp at both ends and fullest just behind
its leading end, with a faint shimmer; each is drawn by a fast leading edge and gives way from its tail
(the dash streaks from where the hero left, the lane line after it parts) instead of popping in or out as
a flat bar. The X on each monster is two such blades, the second a hair after the first, and the glow
blobs became short spinning star glints.

## Greatshield skills, round 1 (2026-10-30)

The owner tried the three greatshield skills on the bench with stand-ins ("ไม่มีเอฟเฟคอะไรเลย"). The Cartoon FX
gallery host is blocked from this session's network, so the round follows the game's approved guard language
(Measured Riposte's pane and clash, Hold the Line's gold), `skillfx/greatshield-fx.js`:
- Line Breaker: light drawn in to the shield's front over the wind-up; a bow wave of three gold chevrons pushed
  ahead of the shield, speed lines streaming off the body and two skid lines on the ground; each monster reached
  bursts gold with sparks thrown out to its side; a boss or big monster that stops the charge sets off a clash
  (spinning stars, a glint, upright and ground rings, a hard shake); a dust ring on arrival.
- Shield Fortress: a tall curved pane of gold glass (a faint hex weave, crisp rim, sliding shine) over the guard's
  140 degrees while held, an arc on the ground; a blocked blow ripples the pane where it struck, with a clash star,
  glint and sparks thrown back; it sinks away when the shield drops.
- Wall of Faith: a line of light runs out both ways on the ground with rune ticks, then the wall rises with an
  overshoot. The high camera sees a wall across the aim almost edge on, so its height is carried by eleven posts of
  light (wide at the foot) joined by a bright top edge, a glow band on its footprint and motes rising, over a pane
  whose columns stream upward; a stopped shot rings a ripple and a flash; it dissolves upward at its end.


Round 2 (owner: "เดี๋ยวเอฟเฟคสกิลผมเคยให้บันทึกวิธีคิดวิธีทำไว้แล้วนี่"): round 1 had skipped this method. It was rebuilt
after reading the reference skills' code (Firebolt `fireball-v5.js`, `meteor-flame.js`, `fire-extras.js`, Blizzard's
wind wall, Blessing's and Holy Bell's shells), with their techniques; the gallery host is still blocked, so no clip was
inspected. The force is gold light made like Firebolt's fire: two nested see-through shells per skill, cut out of
`V5_FIELD` noise carried along the flow, a white-to-amber ramp with narrow transitions, see-through where a shell faces
the camera; one shell program for all three. Contacts: the ragged `flashMaterial` flash in gold, sparks that bounce,
gold embers that flutter up, dust puffs, a point light, a short shake.
- Line Breaker: wisps spiral in to the shield over the wind-up while a knot of force swells there; the charge is a bow
  wave (a comet shell over the shield's front, its light streaming back) with dust kicked up behind; each monster hit
  flashes and throws sparks to the side it is knocked; a boss that stops it: a big flash, sparks, embers, a ring of
  dust, a hard shake (a dug pit was tried; owner: no pit); on arrival the wave collapses forward.
- Shield Fortress: the shield is planted (a low flash, dust at the curtain's foot) and a curved curtain of gold light rises
  over the true 140° arc, flowing up and torn into short tongues at the top; a block flashes where it struck, a ripple
  runs through the curtain, sparks fly back at the attacker; the curtain burns away from the top when the shield drops.
- Wall of Faith: a seam of light opens along the ground in a pool of light, then the wall bursts up with an overshoot
  (dust and embers along it, a shake). It is a row of overlapping columns under one noise field: face on it reads as one
  curtain of holy flame, edge on (aim across the screen) as a tall row of pillars, so it keeps its height under the high
  camera. Embers drift off it; a stopped shot flashes, ripples and throws sparks back; at its end the tongues burn away.
