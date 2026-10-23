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
- Hair (`public/models/hero_chibi_hair.glb`, 3,300 tris, 41 KB): the owner made the chibi character
  untextured and detailed on the Meshy site (`hair_meshy_web.glb`, 8,429 tris, whole body, hair fused
  to the head). `scripts/prep-chibi-hair.py --cut` keeps the hair: everything above the neck (lower
  at the back, so the nape hair stays) minus the face skin. The face is found as the smooth sheet reached by flood fill from
  the middle of the face without crossing a sharp crease, so the fringe strands lying over it stay. The flood starts on the innermost
  surface at the middle of the face (the frontmost one there can be a strand tip) and reaches up to
  the hairline; the fit uses a fixed `box`, so re-cutting does not move the hair. The game draws it in one colour and
  fits it per axis (`chibi-body.js`; fit chosen by counting scalp pixels left visible from 24 views).
  Earlier tries (hair image alone, an AI-drawn normal-proportion head, a textured meshy-t2 run) gave a
  flat card, a stretched fit or a front fringe that did not match the sheet.
- Hair back (`public/models/hero_chibi_hair_back.glb`, 3,014 tris): the textured meshy-t2 run, whose
  spiky back the owner preferred; the game draws only its back part (`keep`) and only the front part
  of `hero_chibi_hair`, so the swept fringe and the spiky back are joined on the head.
- Face: the sheet's head is rounder with bigger eyes than the Meshy retexture. The painted eyes
  were enlarged 1.3x in `hero_chibi.glb`'s texture (`scripts/chibi-eyes.py public/models/hero_chibi.glb
  --eye 747 649 --eye 789 821 --scale 1.3`, run once), and `chibi-body.js` reshapes the head at load
  (`headShape` in data: wider, shorter chin, fuller cheeks, normals bent toward the head centre).
- Torso: the Meshy body had a bust and round hips; `chibi-body.js` flattens them at load
  (`flatten` in data: chest front to 0.072 m between 0.64 and 0.8 m, backside to -0.045 m between
  0.4 and 0.62 m), so the torso is straight like the sheet's boy.
