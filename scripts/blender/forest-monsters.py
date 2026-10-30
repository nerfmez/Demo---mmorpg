"""Three forest monsters from the owner's sheet (docs/reference/forest-monster-sheet.png): Meshy's
shapes and Meshy's textures, made like the grotto's monsters (grotto-monsters.py).

Run headless:  blender -b --python scripts/blender/forest-monsters.py
Each monster of the sheet was cut out as it is (docs/reference/forest-stone-pangolin.png,
forest-leaf-fox.png, forest-leaf-tanuki.png) and sent to Meshy alone: image-to-3D, smart topology
(meshy-t2), no texture (assets/meshy/forest/*_meshy.glb), then retextured with Meshy 6 from the same
picture (2K, original UVs kept, lighting removed: assets/meshy/forest/*_textured_meshy.glb).
Writes public/models/forest/forest-monsters.glb with objects mon_<monster>_<part>, each standing on
its own origin, in metres, facing -Y here (+Z in the game):
  pangolin  the stone pangolin: body (one piece: its plates, claws and tail)
  fox       the leaf fox: body (with its ears, ruff and the leaves on its neck), tail (the leaves of its tail)
  tanuki    the leaf tanuki: body (one piece with its tail; its eyes and the leaf on its brow with it)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meshy_parts import reset, load, put, stand, write

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = lambda n: os.path.join(ROOT, 'assets', 'meshy', 'forest', f'{n}_textured_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'forest', 'forest-monsters.glb')

MONSTERS = reset()

# ---- the stone pangolin: head toward -Y ----
parts = load(SRC('stone_pangolin'))
put(MONSTERS, 'pangolin', 'body', parts)

# ---- the leaf fox: head toward -Y, its leafy tail toward +Y ----
parts = load(SRC('leaf_fox'))
body = parts[0]
tail = [p for p in parts[1:] if p['c'].y > 0.08]
put(MONSTERS, 'fox', 'body', [body] + [p for p in parts[1:] if p not in tail])
put(MONSTERS, 'fox', 'tail', tail)

# ---- the leaf tanuki: head toward -Y ----
parts = load(SRC('leaf_tanuki'))
put(MONSTERS, 'tanuki', 'body', parts)

# ---- each on its own foot, metres long (nose to tail), facing -Y ----
SIZE = {'pangolin': 1.8, 'fox': 1.9, 'tanuki': 1.5}
for name, kinds in MONSTERS.items():
    stand(list(kinds.values()), 'y', SIZE[name], 0.0)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write(MONSTERS, OUT)
