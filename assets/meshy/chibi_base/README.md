# Chibi base body (Meshy)

The owner's new hero base (2026-10-25): a bald chibi body in white briefs, about 4.5 heads, slim,
with a neck, so the outfit sheets' Meshy models fit it with little warping.

- `chibi_base_reference.png`: the owner's front, three-quarter, side and back sheet.
- `chibi_base_meshy.glb`: Meshy 6 multi-image-to-3d from its front, side and back views, textured,
  remeshed to about 10,000 triangles (task 01a172f4-6fe0-7417-b5f1-f69e2c86d277, 30 credits).

Next: rig it with the chibi armature, refit the outfit sets onto it, then the owner's face and hair.

In game (2026-10-25): rigged by Meshy at 1.2 m (task 01a172f9-b5d4-73b6-a4bc-2a36657a6107, 5 credits;
`chibi_base_rigged.glb`, the same 24 bones as before), welded and decimated to 5,199 triangles
(`scripts/decimate-chibi.py`; the first cut, unwelded, opened cracks along every UV seam) and prepared by `scripts/prep-chibi.py --size 2048 --quality 86` into
`public/models/hero_chibi.glb`, replacing the first chibi body. It needs no head reshape or torso
flatten; its landmarks (`characters.hero_chibi.fit`) move the outfit sets' fits onto it, and all nine
armour sets were refitted. The first body's face and neck paint scripts do not apply to it.
