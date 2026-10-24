# Poses from reference clips

Hero stances (and later attack keys) start from a reference animation, not from hand-tuned bone
angles. The reference is the Quaternius **Universal Animation Library** 1 and 2 (CC0, a humanoid
mannequin with 250+ clips: `Sword_Idle`, `Idle_Shield_Loop`, `Sword_Block`, `Bow_Notch`/`Bow_Aim_*`/
`Bow_Shoot`, `Spell_Simple_*`, `Spell_Double_*`, `Sword_Regular_A/B/C`, `Sword_Light_*`,
`Sword_Heavy_A–D`, `Sword_GroundPound`, `Shield_Dash`, `Sword_Dash`, `Melee_*`, …). The GLBs are not
committed; `scripts/pose-retarget/fetch-ual.sh` copies them into `tests/browser/out/ual/` (ignored).

## Run

```sh
scripts/pose-retarget/fetch-ual.sh                # once: UAL1.glb, UAL2.glb
npx vite --host 127.0.0.1 --port 4190 &            # the dev server (the tool drives the FX bench)
node scripts/pose-retarget/run.mjs --file UAL1.glb --clip Sword_Idle --time 0.6 --skill slash --shots out/
```

It prints `{ stance, hold, source }`:

- `stance` — driver channels for `data/weapon-holds.json` `stances` (add `_from` with `source`).
- `hold` — the right palm (`hand`, in the animator's 1.75 m carry space), the blade axis (`dir`)
  and its flat (`up`) for the weapon's carry (`data/models.json` `characters.hero_chibi.holds`).
- `--shots` renders the chibi in that pose from front, side, three-quarter and the game camera,
  facing +Z like the reference, for a side-by-side check.

## How it maps

`scripts/pose-retarget/retarget.js` samples the mannequin's joints at the clip time and points each
driver bone (`src/render/hero.js`: limbs hang along -Y, spine along +Y, faces +Z, left = +X) along
the same segment: upper arm and thigh take the bend plane of the forearm/shin, elbows and knees stay
hinges, the feet follow the toes, the head takes the head bone's turn from the A-pose. The hips keep
yaw and roll only (the animator owns hips x). The body drops until the lower foot touches the ground.
The weapon direction comes from the fist: a grip runs along the knuckle line, pinky to index.

Angles are copied, so the chibi keeps the reference's stance width and crouch relative to its own
short legs; review on the chibi and soften there (scale the stance) only if the owner asks.
