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

Not every outfit can come from a hoodie. Each style names a **base category**
(`bases` in `data/outfits.json`), and the category decides which garments are worn:

| Category | Base garments | Styles / items |
|---|---|---|
| `cloth` | the HairSample hoodie, trousers, shoes | tunic, vest: travel tunic, hide vest, sporeweave vest |
| `coat` | a body-fitted top shell (no hood) + a knee-length skirt open at the front | coat: wolfpelt, ranger, wardenstalker coats |
| `robe` | top shell + an ankle-length closed skirt | mantle: storm mantle |
| `armor` | a thicker top shell + a short split skirt (plate segments) | plate and shell: crag plate, shell guard |

`src/render/base-garments.js` builds the coat, robe and armour bases from the body itself:
- **Top shell:** the body's torso and arms pushed out along the normals by `offset`. It keeps
  the body's skin weights, so it moves exactly with the body.
- **Skirt:** a flared ring hung from the measured waist. Its weights blend from the hips into
  the thigh on each side (anime skirt weighting), so coats and robes part and swing with the
  legs.

The bases are built once per body and size and shared by every rig. A style or item may
override the skirt (`length`, `flare`, `opening`).

Accessories (charms, pendants, rings) are not drawn on the character.

## How a look is built

`resolveOutfit(gearLook, outfits, appearance)` (`src/core/outfit-look.js`) merges, in order:

1. `base`: the adventurer's defaults (hoodie in the chosen tunic colour, dark trousers, tucked-in
   travel boots, bandolier, belt, pouch, thigh strap, bracers).
2. `styles[item.style]`: the archetype (`tunic`, `vest`, `coat`, `mantle`, `plate` or `shell`), which also picks the base category.
3. `armor[equipped armour]`: this item's palette, cut and parts (`drop` removes inherited parts).
4. `boots[equipped boots]`: boot colours, where the shaft starts, and boot parts.

| Field | Meaning |
|---|---|
| `palette` | `main sleeve trim accent cuff pattern pants pantsTrim shoes sole` for the garments, plus `leather strap metal fur gem` for parts. `"$tunic"` is the character's chosen colour. |
| `cut.sleeve`, `cut.cuff` | 0..1 from shoulder to wrist: where the sleeve ends (shows the arm) and where the cuff band starts. |
| `cut.hem` | Metres below the hips where the top ends (0.16 is the base hoodie, the longest). |
| `cut.trim`, `panel`, `yoke`, `stripe`, `neck` | Piping width, placket half width, yoke depth, sleeve stripe half width, V-neck depth (m). |
| `cut.pants`, `cut.boot` | 0..1 from hips to ankle: where the trousers end and where the boot shaft starts (>1 = slippers, no shaft). |
| `cut.pattern` | 0 none, 1 hem bands, 2 dots, 3 plate segments. |
| `skirt` | `length` below the waist and `flare` at the hem (m), `opening` (radians either side of the front, 0 = closed). |
| `parts` | Names in `PARTS` (`src/render/outfit.js`). |

`src/render/garments.js` cuts and paints the three garments in the shader from the bind-pose
position (one program per garment kind, colours and cuts as per-rig uniforms), with an outline
hull that follows the same cut. `src/render/outfit.js` `PARTS` holds the raised pieces:

- straps: `bandolier belt hipPouch thighStrap bracers`
- boots: `bootCuffs bootStraps furCuffs toeClaws ankleRibbons ankleWings shinGuards`
- neck and shoulders: `furCollar highCollar capelet halfCape`
- waist and below: `tabard sash tassets`
- armour: `chestPlate shellPlate gem pauldronL pauldronR`

The hero wears no scarf and no fixed shoulder guard: shoulders change only with the outfit.

## Adding an outfit

1. Pick a style and three colours (main / sleeve / accent) plus a trim colour.
2. Change at least one silhouette point (shoulders, hem or boots) with `cut` or `parts`.
3. Add it under `armor` (or `boots`) with the item id. `tests/core/outfits.test.js` checks that
   every item has an entry, colours and cuts are valid, parts exist, and no two items look the
   same.
4. Review it with `node tests/browser/outfits.mjs` (front and back stills of every armour).

A new kind of piece is a new function in `PARTS`, built in rest world space (metres, the driver
bones' rest positions `W`) and added to the bone it should follow.
