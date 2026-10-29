# Chibi hair styles and faces

How the hero's hair styles (`data/models.json` `characters.hero_chibi_hair_<style>`) and drawn faces
(`public/models/faces/<id>.png`) were made, so a new one can be made the same way.

## A hair style

1. **Model.** Meshy `meshy-t2` smart-topology image-to-3d of one style from the owner's hair sheet
   (a bald chibi head with that hair), then a Meshy 6 retexture from the same picture. Task ids are
   in each entry's `source`.
2. **Cut.** `scripts/cut-chibi-hair.py` (Blender as a Python module):
   `python3 scripts/cut-chibi-hair.py -- <meshy.glb> <out.glb> '<options>'`.
   Every texel is skin (peach: red minus blue at least `skinRB`) or hair; dark lines and white rims
   take their neighbours' class. Triangles across the hairline are subdivided until a few texels
   wide and split on the line, so the cut follows the painted hairline. The skin side goes; small
   skin patches ringed by hair (`holeArea`, painted highlights) stay and are repainted; small or dark
   loose pieces go; `dropBoxes`/`dropPieces` remove painted eyes, a mouth or a collar; near-black
   blots are repainted with the hair round them (`repaint`), except the hair tie (`keepDarkAbove`);
   the result is decimated to `tris` (4,000). Options used: `{"darkArea":0.03,"darkPiece":175,
   "white":232,"iso":0.4,"repaint":90,"tris":4000,"holeArea":0.015}`.
3. **Box.** The entry's `box` is the skull of the head the hair was made on (rays out from inside
   that head), so the fit scales the hair by the head it was made for.
4. **Fit.** `scripts/fit-chibi-hair-auto.py` finds the width, depth, lift and back that put the
   hair's scalp on the chibi head (`CHIBI_HEAD`: the chibi head dumped from the game in head-bone
   space). The shipped fits are that result 0.8 wide, 0.76 deep and 0.14 head heights lower, the
   tightness the owner approved on the ponytail; then adjusted by eye (`tilt` leans the ponytail back;
   buns and long were made smaller on the owner's review).
5. **In game.** `chibi-body.js` `fitHairToHead` keeps the head under the hair (`fit.tuck`); check
   that no hair vertex is inside the head (a ray from the head's middle through it meets an odd
   number of head surfaces beyond it) at every style before shipping.

The hair is painted light grey; `hairColorMaterial` draws it flat in the look's `hair` colour (no
soft light or gloss: lit, the generated paint reads as plastic), darkened only along its painted
strand lines and by one hard cel shadow tone.
`fitHairToHead` also draws the hair's triangles into a map of the directions it covers from the
head's middle; the head (`underHair`) is drawn in the hair's shade per pixel where that map says
hair, so a gap left between locks shows dark hair, not the scalp, and the shade ends with the hair,
not along the head's triangles. The head's split seam vertices move together, and the head is drawn
on both sides, so no crack or step under the hair opens a pale hole.

## A face

`scripts/cut-chibi-face.py <sheet> '[x0,y0,x1,y1]' <out.png>` cuts one head of the owner's bald-head
face sheet into an RGBA decal: the features' alpha is their distance from the skin colour inside an
ellipse within the head's outline, unblended from the skin. The decal spans half a head width either
side of the middle and from 0.34 of the way down to the chin. In game it is drawn over the painted
face (`faceDecalMaterial`, `hero_chibi.faceDecal`).
