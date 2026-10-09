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
- **No cloth simulation (iPad).** Skirts are skinned with weights blended between the hips and
  the thighs, so they swing with the legs. Capes ride the chest. This is the cheap version of
  the skirt-bone chains anime games use.

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

**Boots, gloves and helms** are their own items, each shaped after its icon:
- **Boots** (`boots`): shaft height `len` (ankle to knee, >1 above it), colours
  main / trim (top band) / accent / sole, a `pattern` (laces, plate bands) and parts (cuffs,
  fur, fins, wings, leaf tips, shin guards).
- **Gloves** (`gloves`): a hand-and-forearm shell of length `len`, with a cuff band, wraps or
  plates, and parts (fur cuffs, claws, studs, a glowing gem).
- **Helms** (`helms`): a `kind` built in `src/render/headwear.js` (`cap`, `shell` with
  optional `spikes`, `pointedHood`, `circlet`, `horned`, `furHood`) and its palette.

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
