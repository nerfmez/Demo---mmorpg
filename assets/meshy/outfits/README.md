# Modelled chibi outfits

Each set: the owner's reference image of the chibi in the set, the Meshy model made from it and the
fit settings for `scripts/fit-chibi-outfit.py` (see `docs/OUTFIT-BASE.md`, "Modelled outfits").

- Travel Tunic (`travel_*`): reference sheet 03 of `chibi-outfits-20261025-v2` (`travel_reference.png`,
  the front view). meshy-t2 image-to-3d, smart topology, T-pose, untextured (task
  01a16f0d-97cc-72dc-962c-d0f0313ded3c, 4,260 tris), then a Meshy 6 retexture from the same image
  with the lighting removed (task 01a16f0e-59ef-702d-8ab9-715f349311ad): `travel_meshy.glb`.
  `travel.json` makes `public/models/outfits/travel_tunic.glb` (tunic, belt, skirt, trousers; 1,295
  tris) and `travel_boots.glb` (812 tris); `travel_hair.json` makes `public/models/hero_chibi_hair.glb`.
