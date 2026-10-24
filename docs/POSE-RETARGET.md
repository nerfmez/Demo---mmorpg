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

## Roll in the hand

A reference only fixes the blade's direction; its roll about the blade must match how the hero's
actions hold the weapon, or the hand twists when an attack starts (the owner saw the dagger upside
down). After writing a carry, run
`node scripts/pose-retarget/match-roll.mjs weakpoint dagger dual` (bench skill, left weapon or
`null`, carry key) and write the printed `up` values back.

## How it maps

`scripts/pose-retarget/retarget.js` samples the mannequin's joints at the clip time and points each
driver bone (`src/render/hero.js`: limbs hang along -Y, spine along +Y, faces +Z, left = +X) along
the same segment: upper arm and thigh take the bend plane of the forearm/shin, elbows and knees stay
hinges, the feet follow the toes, the head takes the head bone's turn from the A-pose. The hips keep
yaw and roll only (the animator owns hips x). The body drops until the lower foot touches the ground.
The reference skeleton's own bends at rest (its T/A-pose knees, sloped feet, spine curve) are
subtracted. The weapon direction comes from the prop (`--prop`), else from the fist: a grip runs
along the knuckle line, pinky to index.

In use: `sword_guard` (Quaternius UAL2 `Sword_Block` at 0.2 s, legs 0.6; the owner's pick A of five)
is the chibi's one-hand sword carry, blade raised across the body. Measured Riposte's guard key
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
held in one hand (a two-hand weapon with no second weapon); the wand may be held in each hand.
Each stance's `_from` records its source and settings.

- `--propL` names the reference's left-hand weapon (a dual carry's `hold.left`); `--offhand`
  previews the hero with that weapon in its left hand.

Angles are copied, so the chibi keeps the reference's stance width and crouch relative to its own
short legs; review on the chibi and use `--legs`/`--arms` when the owner asks for a softer pose.
