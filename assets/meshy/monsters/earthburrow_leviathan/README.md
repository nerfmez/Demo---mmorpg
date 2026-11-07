# Earthburrow Leviathan (Moonroot Grove boss)

The owner's sheet (`concept_sheet.jpg`, 2026-11-07): a giant earth serpent, roots grown through its stone scales, and
its drops: Leviathan Fang, Earthen Scale, Subterranean Core (`drops_sheet.png`, the cut-out drop pictures, for the
materials when its den and drops are added).

- `root_viper_meshy.glb`: the owner's Meshy model (a straight serpent along -x, unrigged, 4,139 triangles).
- In game (2026-11-07, round 2): the owner's HD model `meshy-root-viper-hd.glb` (713,108 triangles, 24 MB, head toward
  +z; not kept here for its size) through `scripts/prep-monster-glb.py --tris 6000 --tex 768 --quality 66`; bones in
  `data/models.json`, posed by `src/render/leviathan-anim.js`. The first, less detailed model is kept as
  `root_viper_meshy.glb`.
- `public/assets/icons/monster/earthburrow_leviathan.png`: the head cut from the concept sheet (its white ground
  flood-filled away), 256 px.
