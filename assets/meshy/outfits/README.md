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
- Helms: `scripts/fit-chibi-helm.py assets/meshy/outfits/<set>.json <helm id>` makes (headwear only:
  the generated hair is dropped and the game draws the hero's own hair under it; a hood keeps its
  drape behind the neck with `drape`/`drapeY`)
  `public/models/outfits/<helm id>.glb` from the same models: leather_cap (hide), beetle_helm (shell),
  spore_hood (spore), horned_helm (crag), ranger_hood (ranger), wardenstalker_hood (warden).
  The ranger and warden hoods drop the collar under the chin (`chinCut`, `chinBack`): turning with
  the head, it tore off the coat's. The ranger coat keeps its fur collar instead (`collar`): placed as
  one piece, its lobes set on the shoulders (`spread` out, `lift` down: the chibi's chin sits there).
- The storm set's band was too coarse to cut out: `feather_circlet_meshy.glb` was generated (Meshy 6
  multi-image, 30 credits) from the owner's three-view sheet `feather_circlet_reference.png`, and
  `scripts/fit-feather-circlet.py` bends it round the hero's hair (`public/models/outfits/feather_circlet.glb`,
  drawn over the hero's own hair: `withHair`).
- Legs: the fit keeps the generated legs straight (the leg line is fitted through the slices near the
  ankle, so a coat or cape round the legs does not bend it) and does not push the trousers over the
  chibi's fuller thighs; the body under the armour is hidden in game.

- The warden hood was regenerated on the new chibi base (`warden2_reference.png` → `warden2_meshy.glb`,
  Meshy image-to-image then Meshy 6 image-to-3d, about 38 credits; `warden2.json`): the first hood's
  back was made for a lower head and left a gap behind the neck.

## Set pieces from the equipment turnarounds (2026-10-26)

The 29 set pieces proposed with the equipment turnarounds (`assets-source/equipment/20261026`,
icons in `assets-source/equipment/20261025/icons`) are live items (`scripts/set-pieces.mjs`). Their
models come from the front view of each set's turnaround (`<id>_reference.png`, the backdrop
flooded to white): meshy-t2 image-to-3d in T-pose, untextured, then a Meshy 6 retexture from the
same image with the lighting removed (15 credits each; task ids in each `<id>.json` and
`data/models.json`). Cut heights were read off renders of each model in the fit frame.

- New sets: `crabshell` (crabshell_vest, crabshell_helm; its boots stay `tide_boots`), `moonleaf`
  (moonleaf_robe; the existing `moonleaf_slippers` stay, the cowl is the built `cowl` headwear, a
  collar its model has no separate piece for), `burrowguard`, `wisp`, `mirrorwing` and `fernstep`
  (armour, boots and helm each).
- One missing piece of an existing set: `travel2` (travel_cap), `beetle` (beetle_boots), `spore2`
  (sporeweave_boots), `warden3` (wardenstalker_boots), `wolf2` (wolfpelt_hood). Only that piece is
  exported (`out` null for the rest).
- `boarhide_boots` use the hide set's modelled boots (`trail_boots.glb`): the boarhide turnaround
  draws the same fur-topped boots, so no model was generated for them.
- Gloves stay the code-built shells, like every other glove.

## Gloves from the same models (2026-10-30)

The owner asked for 3D gloves on every set. `glove` in a set's settings is where its gloves begin
out along the arm (|x| in the fit frame, read off a front render of the model's arm; it may be
inside the sleeve's `cuff`, so a fur cuff over the sleeve's end stays with the glove), and
`out.gloves` names the file. `FIT_ONLY=gloves` writes the gloves alone, leaving the armour and boots
files as they were. `wrist` is the model's wrist (read off front and top renders of its hand):
Meshy draws short hands (7-23 cm from the wrist; the chibi's are 15 cm), so the glove's hand is
mapped wrist to wrist and fingertip to fingertip onto the chibi's, and then drawn onto the hand
inside it (`hugKeep` of its distance beyond the margin kept, 0.3): their fingers stood 2-3 cm off
the hand and read as long fingers sticking out of the fist. Gloves: crag (`crag_gauntlets`), hide (`hide_gloves`), shell (`shell_mitts`),
wolf (`wolf_grips`), wisp (`wisp_wraps`), ranger (`brigand_gloves`), spore (`sporeweave_gloves`),
warden (`wardenstalker_gloves`), beetle (`beetle_gloves`), burrowguard, mirrorwing, fernstep and
moonleaf (`<set>_gloves`). The travel and storm models draw bare or wrapped hands, not
`travel_gloves` or `storm_gloves`, so those two keep the built shells.

## Pearl-scale, snail-shell and leaf-bear sets (2026-10-30, from PR #170)

The owner's turnarounds (`<set>_turnaround.png`, the front view `<set>_reference.png`), meshy-t2
T-pose models with Meshy 6 retextures (task ids in each `<set>.json`). Armour, boots, helm and
gloves: `pearlscale_{armor,boots,crest,gloves}`, `snailshell_{plate,greaves,helm,gloves}`,
`leafbear_{coat,boots,hood,gloves}`. Models only: no items use them yet.

- Helms: `fit-chibi-helm.py` sizes a helm by the eyes, and these sheets draw bigger heads (or, for
  pearl-scale, scales on the forehead the eye search took for eyes: `eyes` gives them), so the helms
  came out up to twice the head's size. `fitHead` (1.0) then scales each about the hero's hair's
  middle so its inside lies on that hair (the median over the crown, sides and back).
  `keepAbove` keeps the small pieces of the leaf-bear hood's crown leaf.
- The leaf-bear model grew a limb out of its back that the sheet does not draw: `dropBehind` drops
  any loose piece reaching further behind than that.
