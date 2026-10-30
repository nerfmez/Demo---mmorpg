# Outfit base (ชุดเบส)

Every look the hero wears is one base outfit, changed by data. A new armour or pair of boots is
an entry in `data/outfits.json`, not a new model.

## What anime games do, and what we take

- **One body, one base garment set, many looks.** VRoid-style and anime action RPG characters
  wear modular garments (top, bottoms, shoes) skinned to the same skeleton as the body.
  Outfit variety mostly comes from how the shared garment is cut and painted (masks, trims and
  colour blocks), plus a small set of add-on pieces. Separate full meshes are only modelled for
  hero costumes. Our HairSample wardrobe (hoodie, trousers, shoes) is that base. The complete
  base skin is underneath, so a shorter sleeve or hem only needs to hide (discard) part of the
  garment.
- **Silhouette first.** From our top-down camera, small details (buttons, seams) disappear.
  What reads is the shape at the shoulders (capes, pauldrons, collars), at the hem (coat tails,
  tabards) and at the boots. Every armour style changes at least one of those.
- **Colour blocking at 60/30/10.** A main colour, a secondary colour (sleeves, i.e. the layer
  underneath) and an accent (placket, cape lining, sash). **Trim/piping** in a contrasting
  colour runs along hems, cuffs, the neckline and the placket. Cel shading flattens volume, so
  edges are where anime outfits put their contrast. Outlines stay same-hue (the garment colour
  darkened), as on the rest of the cast.
- **Layering by colour.** A vest is the torso in the main colour over sleeves in the undershirt
  colour. A coat is the main colour plus coat tails, a yoke and a high collar. One mesh reads
  as two or three layers.
- **Tiers read from a distance.**
  - IL1: plain cloth.
  - IL6: leather and shell.
  - IL11: coats with piping.
  - IL16–21: mantles and plate with gold trim and a glowing gem.
- **No full cloth simulation (iPad).** Skirts are skinned with weights blended between the hips and
  the thighs, so they swing with the legs. Capes ride the chest. On the chibi hero a modelled
  robe, skirt or coat with `cloth` (data/models.json) also swings on its own: the cloth below the
  waist hangs from eight panel bones round the hips, each driven by one damped spring (the
  skirt-bone chains anime games use, one bone deep; `render/chibi-cloth.js`).

## Bases by category

There is no shared hoodie. Each armour style names a **base category** (`bases` in
`data/outfits.json`):

| Category | Base | Armour |
|---|---|---|
| `cloth` | thin top shell; a tunic adds a closed knee-high hem (skirt) | travel tunic, storm mantle (a feather cloak over it) |
| `vest` | thicker top shell, sleeveless, deep open front | hide vest, sporeweave vest |
| `coat` | top shell + a knee-length skirt open at the front | wolfpelt, ranger, wardenstalker coats |
| `armor` | the thickest top shell + a short split skirt, plate segments | crag plate, shell guard |

Every garment is built from the body itself (`src/render/base-garments.js`):
- **Shells:** a body region pushed out along the normals, keeping the body's skin weights, so
  it moves exactly with the body. The regions are the torso and arms (tops), the hands and
  forearms (gloves), and the shins (boot shafts).
- **Skirts:** a flared ring hung from the measured waist. Its weights blend from the hips into
  each thigh (anime skirt weighting), so hems part and swing with the legs.

The HairSample trousers and shoes stay as the base legwear. Each armour item sets its trousers'
colour and how they are cut; the shoes take the boots' colours.

**Trousers come with the armour** (there is no trousers item): `trousers.pattern` on each armour
draws a design in the armour's own trim and accent colours, so the legs match the top:
1 a stripe down the outer side (hide vest, ranger coat, storm mantle), 2 leg wraps criss-crossing
the shins (travel tunic, wardenstalker coat), 3 knee guards and thigh plates (shell guard, crag
plate), 4 a deep cuff and a knee patch (sporeweave vest, wolfpelt coat).

**Boots stop below the knee**: `len` is at most 0.85 of ankle to knee (mid-shin for most).

**The chibi hero** (the default; `?hero=classic` is the HairSample one) wears the same outfits: `src/render/chibi-garments.js` cuts the
top, trousers, skirt, boots (with the feet) and gloves from the chibi body and paints them with
the same shaders, reading the chibi's bind position times `SCALE` so the cuts keep their metres.

**Boots, gloves and helms** are their own items, each shaped after its icon:
- **Boots** (`boots`): shaft height `len` (ankle to knee, >1 above it), colours
  main / trim (top band) / accent / sole, a `pattern` (laces, plate bands) and parts (cuffs,
  fur, fins, wings, leaf tips, shin guards).
- **Gloves** (`gloves`): a hand-and-forearm shell of length `len`, with a cuff band, wraps or
  plates, and parts (fur cuffs, claws, studs, a glowing gem).
- **Helms** (`helms`): a `kind` built in `src/render/headwear.js` (`cap`, `shell` with
  optional `spikes`, `pointedHood`, `circlet`, `horned`, `furHood`, `cowl`: a cloth collar
  round the neck that, like the circlet, leaves the hair whole) and its palette.

**Accessories** (charms, pendants, rings) are not drawn on the character.

## How a look is built

`resolveOutfit(gearLook, outfits, appearance)` (`src/core/outfit-look.js`) merges:

1. `base`: defaults (palette, cut, a belt);
2. `styles[armour.style]`, which also picks the base category;
3. `armor[equipped armour]`: palette, cut, skirt and parts (`drop` removes inherited parts).

It also returns the equipped `boots` (travel boots by default), `gloves` and `helm` pieces.

| Field | Meaning |
|---|---|
| `palette` | `main sleeve trim accent cuff pattern pants pantsTrim` for the top, skirt and trousers, plus `leather strap metal fur gem` for parts. `"$tunic"` is the character's chosen colour. |
| `cut.sleeve`, `cut.cuff` | 0..1 from shoulder to wrist (0 = sleeveless). |
| `cut.hem` | Metres below the hips where the top ends (≤ 0.16). |
| `cut.trim`, `panel`, `yoke`, `stripe`, `neck` | Piping width, placket half width, yoke depth, sleeve stripe, V-neck depth (m). |
| `cut.pants` | 0..1 from hips to ankle where the trousers end. |
| `cut.pattern` | 0 none, 1 bands, 2 dots, 3 plate segments. |
| `skirt` | `length` and `flare` (m), `opening` (radians either side of the front, 0 = closed). |
| `parts` | Names in `PARTS` (`src/render/outfit.js`). |

`src/render/garments.js` cuts and paints every garment in the shader from the bind-pose
position, and adds a same-cut outline hull. There is one program per garment kind (top, skirt,
trousers, shoes, boots, gloves); colours and cuts are per-rig uniforms.

## Adding an outfit

1. Pick a style and three colours (main / sleeve / accent) plus a trim colour.
2. Change at least one silhouette point (shoulders, hem or boots) with `cut` or `parts`.
3. Add it under `armor`, `boots`, `gloves` or `helms` with the item id, colours sampled from
   the item icon. `tests/core/outfits.test.js` checks that
   every item has an entry, colours and cuts are valid, parts exist, and no two items look the
   same.
4. Review it with `node tests/browser/outfits.mjs` (front and back stills of full sets, plus
   walk frames).

A new kind of piece is a new function in `PARTS`, built in rest world space (metres, the driver
bones' rest positions `W`) and added to the bone it should follow.

**Hiding the helm**: a toggle beside the helm slot (`ch.hideHelm`, `toggleHelm`) hides the worn
helm's look; it still counts for stats. `gearLook` then leaves it out (`helmHidden: true`).

## Modelled outfits (chibi hero)

The code-built shells above are the fallback. An armour or boots item can instead have a modelled
outfit for the chibi hero (`data/models.json` characters `outfit_<item id>`, `chibiOutfit`):

1. Draw the chibi wearing the set (the owner's reference sheets) and generate it with Meshy
   (meshy-t2 image-to-3d in T-pose, then a Meshy 6 retexture from the same image).
2. `scripts/fit-chibi-outfit.py` (Blender as a Python module) cuts the neck, sleeves and boot tops,
   warps the generated body onto `hero_chibi`, pushes the cloth outside the body, copies the body's
   skin weights and records the body triangles each piece covers. Faces that a cut-away part covered
   in the generated model (a pad's top under the hood's fur) are repainted from the nearest faces of
   their own part, since their texture there was never meant to be seen. A loose shoulder plate can be
   made to move as one piece on its mean weights (`rigidPads`, the crabshell pauldrons): blended
   per vertex between the chest and the arm, its corner stretched into a spike when the arm came down. Its settings per set live in
   `assets/meshy/outfits/<set>.json` beside the Meshy source. The Travel Tunic's neck and cuffs are
   then repainted by `scripts/clean-travel-tunic.py` (the generated paint there was a blur of skin,
   teal and a dark smear), and its collar, a crumpled tangle no repaint makes neat, is cut clean in
   game by the outfit's `neckline` (a V and the neck's round, trimmed teal, `chibi-garments.js`).
3. In game (`render/chibi-garments.js`) the model replaces the shells it covers. The body under it is
   not removed: the covered vertices are tucked inside the cloth, shaded as its inside and pushed back
   in depth (`characters.hero_chibi.underCloth`), so nothing pokes through, no gap ever shows the
   background, and no per-pose adjustment is needed; garment insides are shaded too.
   Gloves come from the same model: past `glove` (the gloves' tops, read off the model, out along
   the arm) the hands and forearms are kept as a third piece, fitted and skinned like the sleeves,
   the hand mapped from the model's `wrist` onto the chibi's and drawn onto the hand inside
   (`hugKeep`); they take the body's finger-bone weights, so they close with the hand inside,
   and the hand inside them is not drawn (the mitten hand showed between their fingers). The
   Travel and Storm sets' models draw bare or wrapped hands, not their gloves' icons, so
   `travel_gloves` and `storm_gloves` (and boots without a model) still use the code-built shells;
   the body inside them is tucked the same way, and each shell is cut clean at its length in the shader.
4. Helms: `scripts/fit-chibi-helm.py` cuts the same model's headwear only (its generated hair and
   the face cut away) and moves it onto the Travel model's head by the eyes, the frame the hero's
   hair is fitted in; `fitHead` then scales it about the hair's middle so its inside lies on the
   hero's hair (the eyes alone left helms from sheets with bigger heads twice too large). Worn, it is
   drawn over the hero's own hair, in the default hair's frame whatever the hair style (`outfit_<helm id>`, `chibiOutfit`
   "helm"), the hair pulled just inside it, so none pokes through and none is cut away; the
   crabshell helm, which has no sheet, keeps the built one. The feather
   circlet is its own Meshy model (`scripts/fit-feather-circlet.py`) drawn over the hero's hair
   (`withHair`).

Every armour and boots item has one (`assets/meshy/outfits/README.md`); the boots made with the ranger
coat are not used (the hide set's `trail_boots` are). The models load when first worn
(`render/models.js` `chibiOutfit`); until then the code-built garments are drawn.
