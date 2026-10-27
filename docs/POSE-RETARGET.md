# Poses from reference clips

Hero stances (and later attack keys) start from a reference animation, not from hand-tuned bone
angles. Two CC0 libraries are used:

- **KayKit Adventurers** (Kay Lousberg): chibi characters close to the hero's proportions, holding
  real weapon props (`1H_Sword`, `2H_Sword`, shields): `Idle`, `2H_Melee_Idle`, `Blocking`,
  `1H_Melee_Attack_*`, `2H_Melee_Attack_*`, `Dualwield_Melee_Attack_*`, `Spellcast*`,
  `2H_Ranged_Aiming/Shoot`, `Dodge_*`, … Prefer it for the chibi hero. Profile `kaykit`.
- Quaternius **Universal Animation Library** 1 and 2: a ~1.8 m humanoid mannequin with 250+ clips
  (`Sword_Idle`, `Idle_Shield_Loop`, `Sword_Block`, `Bow_Notch`/`Bow_Aim_*`/`Bow_Shoot`,
  `Spell_Simple_*`, `Spell_Double_*`, `Sword_Regular_A/B/C`, `Sword_Heavy_A–D`,
  `Sword_GroundPound`, `Shield_Dash`, `Sword_Dash`, `Melee_*`, …), no weapon props. Profile `ual`.

The GLBs are not committed: `scripts/pose-retarget/fetch-ual.sh` copies `UAL1.glb`, `UAL2.glb`,
KayKit's `Knight.glb` and `Barbarian.glb` into `tests/browser/out/ual/` (ignored).

## Run

```sh
scripts/pose-retarget/fetch-ual.sh                # once: the reference GLBs
npx vite --host 127.0.0.1 --port 4190 &            # the dev server (the tool drives the FX bench)
node scripts/pose-retarget/run.mjs --profile kaykit --file Knight.glb --clip Idle --time 0.5 --prop 1H_Sword --skill slash --legs 0.5 --arms 0.3 --shots out/
node scripts/pose-retarget/run.mjs --profile kaykit --file Knight.glb --clip 2H_Melee_Idle --time 0.5 --prop 2H_Sword --skill frontline_split --legs 0.5
node scripts/pose-retarget/run.mjs --file UAL1.glb --clip Sword_Idle --time 0.6 --skill slash
```

- `--prop` names the reference's weapon: the blade axis and flat come from the prop itself.
- `--legs k` scales the leg channels (k < 1 stands taller; the owner found the full crouch too low).
- `--arms k` scales the arms' outward lift (KayKit's armoured knight holds them away from its body).
- `--mirror` swaps left and right: the reference archer holds the bow in its left hand, the hero in its
  right. For a bow the fist line is the limbs (`up`) and the arrow leaves past the knuckles (`dir`).
- `--weapon kind` previews another right-hand weapon than the bench skill's (the bench has no wand
  skill: `--skill firebolt --weapon wand`).
- `--face` turns the frame about the hips so the pelvis faces +Z: frames taken from a combo
  (`*_Rec`, mid-attack) may face anywhere, which otherwise flips the pelvis.

It prints `{ stance, hold, action, source }`:

- `stance` — driver channels for `data/weapon-holds.json` `stances` (add `_from` with `source`).
- `hold` — the right palm (`hand`, in the animator's 1.75 m carry space), the blade axis (`dir`)
  and its flat (`up`) for the weapon's carry (`data/models.json` `characters.hero_chibi.holds`).
- `action` — the same frame as an action key for `src/render/actions.js`: absolute channels, the body
  `drop` and the `weapon` channel (the blade's turn in the hand, with the actions' own roll).
- `--shots` renders the chibi in that pose from front, side, three-quarter and the game camera,
  facing +Z like the reference, for a side-by-side check.

## Attack clips

`scripts/pose-retarget/clip-keys.mjs` turns a whole clip into an action: `--keys` evenly spaced keys
plus the contact (the blade tip's fastest frame, `hit`), each with absolute channels, `drop` and the
`weapon` channel, and the blade's `sweep` (+1 toward the hero's left). `--face` turns the clip by its
first frame's facing (one turn for every key, so the swing's own twist stays). The result goes into
`data/action-clips.json`; `actions.js` registers each entry as an action and `COMBOS` picks them per
weapon. The slash effect sweeps the way the action's `sweep` says.

```sh
node scripts/pose-retarget/clip-keys.mjs --file UAL2.glb --clip Sword_Light_A --skill slash --keys 8 --legs 0.8 --face
```

In use: `swordCut` (Sword_Light_A, the owner's pick A) is every step of the sword's basic cut;
`daggerCut` (Sword_Light_B, pick B) the dagger's.
`splitChop` (KayKit Melee_2H_Attack_Chop on the Knight's 2H_Sword, the legs re-solved so the feet stay
planted) is Frontline Split; `bowShot`, `bowSkyShot`, `bowDrawHold` and `bowLooseShot` (Quaternius
Bow_Notch/Bow_Shoot/Bow_Aim_Neutral/Bow_RapidShoot_Loop and KayKit Ranged_Bow_Release/Draw_Up/Release_Up,
mirrored: the hero draws with its left hand) are the bow skills; `boltCast` (Quaternius Spell_Simple_Enter
and Spell_Simple_Shoot mirrored: the wand arm pushes straight out at the target on the release) is Arcane
Bolt and Firebolt with any weapon but the staff and the bow. Each entry's `_from` records its clips, commands and edits. The greatblade's basic attack (and the axe's
and mace's held in both hands) stays the hand-made `heavyA`/`heavyB`: the owner preferred it to the KayKit
two-handed slice. `sunderChop`/`sunderChop1H` (KayKit Melee_1H_Attack_Slice_Diagonal, the
left hand on the haft or kept on the shield) are Sunder Cut. `staffCast` (KayKit Mage Spellcast_Shoot with the 2H_Staff, the release arm from
Spell_Simple_Enter/Shoot, the weapon channel recomputed so the staff keeps the Mage's direction, the staff
held near its foot with `gripSlide`) is Firebolt and Arcane Bolt with the staff. Both casts have
`ends: 'carry'` (eased in from the carry and back to it, no snap at the fades), a still hold before the
push, and the push ends at full reach on the hit, where the bolt leaves; `boltCast` points the weapon
up and forward through the gather (the charge in front of the hand) and at the target from the release.
`flankStab` (Melee_1H_Attack_Stab) is Flank Thrust, `shieldShove` (Melee_Block_Attack, the sword arm kept
at the guard) Shield Bash, `breakbeatSlam` (a two-handed jumping smash: arms straight up overhead in the air, straight out forward and down into the ground on the hit, hanging there a moment) Breakbeat Slam, `whirlSpin` (Melee_2H_Attack_Spinning with `--spin`: each frame faced
forward and its turn kept as the `spin` channel, so a full turn does not wrap back) Whirl Blade,
`warCryRoar` (Skeletons_Taunt) War Cry and `riposteGuard` (Melee_Blocking) Measured Riposte's guard. `volleyKneel` (bowShot's approved draw, release and follow-through on the upper body, the legs from Quaternius Fixing_Kneeling at 2.08 s: one knee down) is Rapid Volley's five looses. `killShot` (bowDrawHold's draw held, bowLooseShot's release, the legs from Quaternius Crouch_Idle_Loop: a braced crouch) is Killing Arrow.
The movement skills play `moveDash` (KayKit Dodge_Forward), `moveRoll` (Roll: only its limbs' tuck, the game
turns the body over itself and keeps it on the ground), `moveBlink` (Dodge_Forward's first lean) and `moveLeap` (Sword_GroundPound: the blade
overhead in the air, slammed down on landing) over the whole move (hero.js `MOVE_CLIPS`).

## Choosing a clip and previewing an action

```sh
# frames of reference clips (rows: views, columns: frames); clip@a-b limits the range
node scripts/pose-retarget/ref-strip.mjs --file Barbarian.glb --anim Rig_Medium_CombatMelee.glb --props 2H_Axe \
  --clips Melee_2H_Attack_Chop,Melee_2H_Attack_Slice --frames 8 --views q,side --out tests/browser/out/refs
# a whole clip as an action; --anim plays KayKit's animation library on an Adventurer with props
node scripts/pose-retarget/clip-keys.mjs --profile kaykit --file Barbarian.glb --anim Rig_Medium_CombatMelee.glb \
  --clip Melee_2H_Attack_Chop --prop 2H_Axe --skill frontline_split --keys 8 --legs 0.6 --face > cand.json
# the candidate on the chibi with the game's timing (keys before hit over the cast time, the rest over 0.28 s)
node scripts/pose-retarget/preview-action.mjs --action cand.json --weapon greatblade --cast 0.65 --out tests/browser/out/preview
```

`ref-strip.mjs` lists a file's clips when run without `--clips`. `preview-action.mjs` registers the
candidate in the bench page only (nothing in `data/` changes), renders the game camera's angle and
close views at even times plus the hit frame, and reports where the weapon tip moves fastest (a
strike's contact belongs on the hit). `--bench --skill id` casts the bench skill for real with its
effects instead. A clip action moves the weapon itself (`own`): a two-handed weapon's left hand holds
the haft only where its keys set `grip: [1, 0, 0]`; `own: false` keeps a staff at its carry angle
through a spell gesture.

## Roll in the hand

A reference only fixes the blade's direction; its roll about the blade must match how the hero's
actions hold the weapon, or the hand twists when an attack starts (the owner saw the dagger upside
down). After writing a carry, run
`node scripts/pose-retarget/match-roll.mjs weakpoint dagger dual` (bench skill, left weapon or
`null`, carry key) and write the printed `up` values back. For a run carry (`hold.run`) add
`null run` (the right-hand weapon, then `run`): the hero runs and the run carry's `up` is matched.
The owner saw a twisted hand on the run until this was done.

A clip cut has the same gap: the blade's direction comes from the reference but its roll does not, so
the strike can hit with the flat (the owner saw the blade "slap with its wide side"). After writing a
cut, run `node scripts/pose-retarget/edge-roll.mjs --action cand.json --weapon sword > edged.json`
(`--offhand shield` for a one-handed weapon with a shield, `--tip 0.35` for a dagger's short blade).
It plays the action on the bench hero and rolls each key's weapon about the blade so the `+X` side
(the cutting edge) leads the tip through the strike, the segment into the hit key; the wind-up keeps
the strike's roll, a fast follow-through keeps leading, and the first and last keys keep the carry's
roll. A model whose edge is its `-X` side (`models.json` `edge: -1`) is turned half a turn about the
blade by `hero.js` while a clip plays, so one key list serves both kinds.

## Dragged run carries

A run carry that only moves the palm (`hand`, `dir`, `up`) leaves the wrist to aim the weapon, and
the owner saw it twist however the roll was matched. The sword and the heavy weapons instead hold
their own arm channels on the run (`hold.run.arms`: the arm hangs, the wrist stays straight) and
turn the weapon in the fist (`socket`, the weapon channel's x: past pi/2 the blade leaves the fist's
little-finger side, `roll` turns it about its length). With `reverse` the chibi's fist keeps its
thumb toward the pommel (`chibi-body.js`); without it the fist turns its thumb toward the blade, a
half turn of the hand. The owner's reference is a greatsword dragged one-handed (arm hanging a
little behind and out, elbow almost straight, the blade's flat to the side, its tip on the ground):
heavy weapons hang low and drag, the sword holds the same grip with the arm out in an A-pose. After
changing a heavy carry, find the socket that puts the tip on the ground at the run's low point:

```sh
node scripts/pose-retarget/drag-tip.mjs '[["frontline_split","two",null],["armor_cleave","two",null],["interrupt_slam","two",null]]'
```

## How it maps

`scripts/pose-retarget/retarget.js` samples the mannequin's joints at the clip time and points each
driver bone (`src/render/hero.js`: limbs hang along -Y, spine along +Y, faces +Z, left = +X) along
the same segment: upper arm and thigh take the bend plane of the forearm/shin, elbows and knees stay
hinges, the feet follow the toes, the head takes the head bone's turn from the A-pose. The hips keep
yaw and roll only (the animator owns hips x). The body drops until the lower foot touches the ground.
The reference skeleton's own bends at rest (its T/A-pose knees, sloped feet, spine curve) are
subtracted. The weapon direction comes from the prop (`--prop`), else from the fist: a grip runs
along the knuckle line, pinky to index.

In use: `sword_draw_ready` (Quaternius UAL2 `Sword_Dash` at 0 s, legs 0.8; the owner's pick from the
Arcane Draw Cut preview, 2026-10-27) is the chibi's one-hand sword carry: the sword held low and forward
at the right hip, the up re-solved with `match-roll.mjs`. The earlier carry, `sword_guard` (UAL2
`Sword_Block` at 0.2 s, legs 0.6, blade raised across the body), is kept in `presets.sword_guard_carry`. Measured Riposte's guard key
(`guardUp` in `actions.js`) is pick B, the high guard of `Sword_Regular_A_Rec` at 0.05 s (`--face`,
legs 0.6), its head turned back to face the foe. `sword_ready` (KayKit `Idle`, legs 0.5, arms 0.3) is
the `dual` carry (`--prop 1H_Sword --propL 1H_Sword_Offhand --offhand sword`, used by the
sword and wand with a second weapon in the left hand). `dagger_ready` (Quaternius `Sword_Idle` at
0.6 s, full crouch, the first reference stance) is the dagger's own low trailing guard: the owner
picked it for the dagger, alone and dual (the left dagger mirrors the right). `two_hand_ready` (KayKit
`2H_Melee_Idle`, legs 0.5) is kept as `presets.two_hand_feminine` for a female body; the male
chibi keeps its hand-set two-hand carries. Mage and archer (owner picks): `staff_ready` (KayKit Mage `Spellcasting` at 0.4 s with
`2H_Staff`: staff upright at the side, the free hand out), `wand_ready` (KayKit Mage `Idle` at 0.4 s
with `1H_Wand`, low; its `dual` carry mirrors it into the left hand), `bow_ready` (Quaternius UAL2
`Bow_Notch` at 0.15 s, mirrored: the bow before the body, the drawing hand at the face). The staff is
held in one hand (a two-hand weapon with no second weapon); the wand may be held in each hand. The mace held in one hand (a shield in the
left) takes the wand's carry and `wand_ready` (owner: "the small mace like the wand").
Each stance's `_from` records its source and settings.

- `--propL` names the reference's left-hand weapon (a dual carry's `hold.left`); `--offhand`
  previews the hero with that weapon in its left hand.

Angles are copied, so the chibi keeps the reference's stance width and crouch relative to its own
short legs; review on the chibi and use `--legs`/`--arms` when the owner asks for a softer pose.
