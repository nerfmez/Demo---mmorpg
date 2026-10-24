---
name: anime-action
description: Anime combat animation for Frontier's keyframed hero and monster actions (src/render/actions.js, rig.js, hero.js) and weapon stances (data/weapon-holds.json, hero_chibi holds) - reference poses first, then timing, impact and review. Use before making or changing any attack, cast, guard, dodge or hit-reaction animation, or when the owner says an animation looks weak, floaty, stiff or wrong.
---

# Anime action animation

The hero and monsters move by keyframed poses in code (`src/render/actions.js`), played by
`HumanoidAnimator.play()` (`src/render/hero.js`). The owner reviews feel on an iPad, from the game's
high three-quarter camera, with a chibi hero (big head, short limbs). This skill is the standard for
how those actions should read. It works with the effects (`docs/VFX-REFERENCE.md`) and the visual
workflow (`docs/VISUAL_QUALITY_WORKFLOW.md`); it does not change combat rules.

## Start from a reference, never from guessed angles

Hand-tuned bone angles read wrong to the owner ("ไปเอาตัวอย่างมาจากไหน"). Every new pose - an idle
stance, a weapon carry or an attack key - starts from a real animation clip:

1. Find candidate clips in the CC0 libraries (): KayKit Adventurers (chibi,
   real weapon props; prefer it for the hero) and the Quaternius Universal Animation Library. If
   neither has the move, search for another CC0 source before inventing one.
2. Show the owner the candidates (reference and the retargeted chibi side by side, from the front,
   three-quarter and game camera) and let them pick. Offer more than one when the request is about
   style ("ธรรมดาไป").
3. Retarget the chosen frame with  (/ only to tone it
   for the chibi,  for frames from a combo) and fix the weapon's roll in the hand with
   , so the hand does not twist when an action takes over.
4. Keep what the owner already approved: change only the weapon or pose they asked about, and keep a
   rejected-for-now variant as data () when they say it suits another character.

## How the engine plays a key list (know this before posing)

- An action is `{ hit, keys: [[t, pose], ...] }`. `play(skill, dur, weapon, step, hitTime)` stretches
  the keys so the `hit` key lands exactly on the rules' cast time. Everything before `hit` is the
  wind-up; everything after is follow-through and recovery.
- Every segment between two keys is eased in and out (`smoother` in `rig.js samplePose`). So:
  - a **hold** is two neighbouring keys with the same pose;
  - a **snap** is a short segment (small `t` gap) - easing alone never makes a strike fast;
  - an **overshoot** is an extra key past the target, then a key settling back;
  - a long segment between very different poses always looks floaty.
- A channel left out of a key is carried from the neighbour key; put every channel the action
  touches back to rest in the last key (see `REST`).
- The action fades in over 0.06 s and out over 0.1 s, and legs are blended down while running.

## Timing: the anime beat

Split every attack into these beats. Values are fractions of the action (0..1) with `hit` at the
contact; tune by eye, but keep the shape.

| Beat | What happens | Share |
|---|---|---|
| 1. Anticipation | body loads away from the strike (twist back, weapon back, weight on the rear leg, a little `drop`) | most of the time before `hit` |
| 2. Hold (key pose) | the loaded pose held still for a moment - the "anime freeze" before the blow | 2-3 keys repeated, ~0.05-0.1 |
| 3. Strike | the fastest segment of the action: one short segment straight to the contact pose | 0.05-0.12 before `hit` |
| 4. Impact | contact pose on the `hit` key; the view adds hit-stop and shake, the effect fires here | at `hit` |
| 5. Overshoot | the body and weapon carry past the contact a little | just after `hit` |
| 6. Pose hold | the finished, readable "money pose" held | 0.15-0.3 |
| 7. Recovery | ease back to rest, slower than the strike | the rest |

Rules of thumb:
- The player's own attacks must answer input at once: keep their anticipation short (the rules' cast
  time is the budget) and put the drama in the hold, strike and pose. Monsters get long, readable
  wind-ups - their anticipation is the telegraph the player dodges (AGENTS.md design rule).
- Contrast is everything: slow-slow-FAST-hold. If every segment has the same length it reads as
  floaty no matter how big the poses are.
- Heavy weapons (greatblade, axe, mace) load longer, drop lower (`drop`) and hold the pose longer;
  daggers and fists snap with almost no hold.
- Repeated swings alternate the arm (`step` 0/1); each still gets its own anticipation, strike, pose.

## Posing for this camera and this hero

- Read the silhouette from above and behind. Twist (`torso`/`chest`/`hips` y) and arm reach show;
  small forward/back bends (x) mostly do not. Push the twist and the arm/weapon line wider than feels
  natural from the side.
- Chibi proportions: the big head hides the shoulders and the short arms hide small angles. Exaggerate
  arm and weapon angles further than for a normal-proportion body, and lean the whole body
  (`torso` x, `drop`) rather than only bending the elbows.
- One clear line of action per key pose: from the rear foot through the hips and chest to the weapon
  tip. Avoid poses where the weapon is hidden behind the head or body from the game camera.
- Keep feet planted during the strike (the animator flattens planted feet); step into heavy blows by
  changing `legL/legR` and `kneeL/kneeR`, not by sliding.
- The weapon leads, the body follows: in the strike segment move the arm/weapon a little earlier than
  the torso settles (the overshoot key can carry the torso further than the arm).

## Impact and effects belong together

- The contact pose must sit on the `hit` key, so the effect, damage number and hit-stop land with it.
- Hit-stop and shake live in the view (`View.hitStop`, `addShake`) and in the skill effects
  (`onShake`); the pose itself should already be at the contact when they fire.
- Every action that draws a trail or crescent must have the weapon actually travel along that arc
  between the last strike key and the `hit` key (`docs/VFX-REFERENCE.md`, the approved slash crescent).
- Guards and charges hold a pose for the whole state (the animator freezes `a.t` before `hit` while
  charging/channelling); give them a pose that already reads as "ready", not a mid-swing frame.

## Template (melee strike)

```js
// wind (anticipation) -> hold -> strike -> contact (hit) -> overshoot -> pose -> rest
ACTIONS.example = { hit: 0.42, keys: [
  [0, REST],
  [0.26, WIND],                 // anticipation: twisted back, weapon loaded, weight back, small drop
  [0.33, WIND_HELD],            // hold: same as WIND with a touch more twist (the anime freeze)
  [0.42, HIT],                  // strike: one short segment to the contact pose on the hit key
  [0.5, { ...HIT, ...PAST }],   // overshoot: weapon and torso carry past the contact
  [0.75, POSE],                 // money pose: settled, readable, held
  [1, REST],
] };
```

## Review before showing the owner

1. Build, then step the action at fixed 60 Hz and take a frame sheet: the FX bench
   (`fx-test.html`, `__fxtest.freeze()` / `__fxtest.advance(seconds)`) or the game sandbox
   (`?fresh=1&skillSandbox=1`). Capture at least: rest, end of anticipation, the hold, the `hit`
   frame, the overshoot and the money pose, from the game camera.
2. Check each frame against this list:
   - the anticipation pose and the money pose are readable as silhouettes from the game camera;
   - the strike is visibly faster than the wind-up and the recovery (fewer frames between poses);
   - the weapon is at the contact on the `hit` frame, together with the effect and the hit-stop;
   - nothing clips into the head or the ground; feet do not slide;
   - the chibi's weapon and arms are not hidden behind its head;
   - every channel is back to rest at the end (no snapped arm after the action fades).
3. Send the sheet to the owner in Thai with the beat each frame shows. Feel is the owner's call; the
   sheet and this list are the evidence, not a claim that it "looks good".

## Common faults and their fixes

| The owner says / you see | Cause | Fix |
|---|---|---|
| "เอาตัวอย่างมาจากไหน", the pose looks made up | angles guessed by hand | start again from a reference clip (above) and show it beside the result |
| a weapon upside down, the hand twists when an attack starts | the carry's blade roll differs from the actions' | , write the printed  |
| crouch too deep, arms too wide on the chibi | a reference built for longer limbs or bulky armour | ,  when retargeting |
| "ห่วย", floaty, no power | all segments similar length | shorten the strike segment, add a hold before it and a pose hold after |
| stiff, robotic | only the arm moves | add torso/chest/hips twist and `drop`; lead with the weapon, follow with the body |
| can't tell what happened | weak silhouette from above | widen the twist and the arm/weapon line; check from the game camera |
| hit feels late or early | contact pose not on `hit` | move the contact pose to the `hit` key time |
| snaps at the end | a channel never returns to rest | add the channel to the last key (`REST`) |
| wrong animation (a cut instead of a stab) | the skill falls back to a family action | give the skill its own action and map it in `BY_SKILL` |

## Sources behind these rules

- Animation principles for games: anticipation as the enemy telegraph, near-instant player response,
  keyframed core actions with procedural follow-through, easing as weight
  (https://bugnet.io/blog/animation-principles-every-game-developer-should-know,
  https://bugnet.io/blog/animation-basics-that-make-your-game-feel-alive,
  https://playbooks.com/skills/dylantarre/animation-principles/game-development).
- Anime timing (hold on the key pose, a very short strike, the held finishing pose) and the owner's
  reviews of this game's skills (`docs/FX-BENCH.md`).
