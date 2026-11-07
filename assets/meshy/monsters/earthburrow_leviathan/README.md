# Earthburrow Leviathan (Moonroot Grove boss)

The owner's sheet (`concept_sheet.jpg`, 2026-11-07): a giant earth serpent, roots grown through its stone scales, and
its drops: Leviathan Fang, Earthen Scale, Subterranean Core (`drops_sheet.png`, the cut-out drop pictures, for the
materials when its den and drops are added).

- `root_viper_meshy.glb`: the owner's Meshy model (a straight serpent along -x, unrigged, 4,139 triangles).
- In game: `public/models/monsters/earthburrow_leviathan.glb` from `scripts/prep-monster-glb.py root_viper_meshy.glb
  --yaw 90` (head toward +z); bones in `data/models.json`, posed by `src/render/leviathan-anim.js`.
- `public/assets/icons/monster/earthburrow_leviathan.png`: the head cut from the concept sheet (its white ground
  flood-filled away), 256 px.
