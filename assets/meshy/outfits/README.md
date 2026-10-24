# Modelled chibi outfits

Each set: the owner's reference image of the chibi in the set, the Meshy model made from it and the
fit settings for `scripts/fit-chibi-outfit.py` (see `docs/OUTFIT-BASE.md`, "Modelled outfits").

- Travel Tunic (`travel_*`): reference sheet 03 of `chibi-outfits-20261025-v2` (`travel_reference.png`,
  the front view). meshy-t2 image-to-3d, smart topology, T-pose, untextured (task
  01a16f0d-97cc-72dc-962c-d0f0313ded3c, 4,260 tris), then a Meshy 6 retexture from the same image
  with the lighting removed (task 01a16f0e-59ef-702d-8ab9-715f349311ad): `travel_meshy.glb`.
  `travel.json` makes `public/models/outfits/travel_tunic.glb` (tunic, belt, skirt, trousers; 1,295
  tris) and `travel_boots.glb` (812 tris); `travel_hair.json` makes `public/models/hero_chibi_hair.glb`.
- The other sets (`<set>_reference.png` is the front view cut from each sheet, `<set>_meshy.glb` the
  meshy-t2 T-pose model with its Meshy 6 retexture, `<set>.json` the fit; task ids in
  `data/models.json`): ranger (sheet 01, `ranger_coat`), hide (04, `hide_vest`, `trail_boots`),
  storm (05, `storm_mantle`, `wisp_slippers`), shell (07, `shell_guard`, `tide_boots`), warden (08,
  `wardenstalker_coat`, `gale_boots`), crag (12, `crag_plate`, `crag_greaves`), wolf (14,
  `wolfpelt_coat`, `wolf_boots`), spore (16, `sporeweave_vest`, `moonleaf_slippers`). These give no
  `scale`: the script sizes each model by its arm axis (Meshy fits hoods and horns into the unit box
  too) and maps its arm length onto the chibi's (`armX`). The neck, sleeve-end (`cuff`) and boot-top
  cuts were read off each model's colours along the neck, arm and leg.
- Helms: `scripts/fit-chibi-helm.py assets/meshy/outfits/<set>.json <helm id>` makes
  `public/models/outfits/<helm id>.glb` from the same models: leather_cap (hide), beetle_helm (shell),
  spore_hood (spore), feather_circlet (storm), horned_helm (crag), ranger_hood (ranger),
  wardenstalker_hood (warden).
- Legs: the fit keeps the generated legs straight (the leg line is fitted through the slices near the
  ankle, so a coat or cape round the legs does not bend it) and does not push the trousers over the
  chibi's fuller thighs; the body under the armour is hidden in game.
