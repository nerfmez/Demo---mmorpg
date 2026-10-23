# Chibi body (Meshy, opt-in preview)

Bald chibi body base for an opt-in hero preview (`?hero=chibi`, `src/render/chibi-body.js`).
The default hero is unchanged; the art rules keep the shipped hero at normal proportions.

- `concept_body_base.png`: the "Body base" figure cropped from the owner's part sheet.
- Mesh: Meshy meshy-t2 smart-topology image-to-3d, T-pose, untextured, 4,442 tris
  (task 01a162c5-0125-7289-8cd7-59e93e89c4c4).
- Texture: Meshy 6 retexture with the concept image as the only style input, no text prompt
  (task 01a162e0-e0b9-7089-aa90-af14b6525dc7).
- Rig: Meshy auto-rig at 1.2 m (task 01a162e3-50ba-704c-8317-01e2a3b889f2); 24 Mixamo-like
  bones, the same names as `hero_base`.
- `public/models/hero_chibi.glb` is the rigged GLB after `scripts/prep-chibi.py` (drops the rig
  task's animation and tangents, resizes the texture to 1024 px): 2.7 MB → 369 KB.
- Meshy exports faceted (split) normals; `chibi-body.js` smooths them at load. A Meshy remesh to
  8,000 tris was tried and was lumpier than the 4,442-tri original, so it was not used.
- The Meshy hands are open and have no finger bones; `curlFist` in `chibi-body.js` bends the
  finger vertices into a fist (thumb folded under) at load as one morph target per hand; a hand
  closes only while it holds something, and held weapons are seated in the fist's hole.
- Hair (`public/models/hero_chibi_hair.glb`, 3,014 tris): meshy-t2 mesh of the chibi head with hair
  cropped straight from the sheet (task 01a1681c-6a87-7494-abca-d5d86c39028f), Meshy 6 retexture
  (01a1681c-98d1-76ba-8638-999ccb467f7f; washed out and blotchy, so the game draws the hair in one
  colour, `color`); head and collar removed by `scripts/prep-chibi-hair.py`, fitted per axis in
  `chibi-body.js`. Earlier tries: the hair image alone came out flat, and an AI-drawn head came out
  with normal proportions.
