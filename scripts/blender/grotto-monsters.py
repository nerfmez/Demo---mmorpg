"""The grotto's three monsters from the owner's sheet: Meshy's shapes and Meshy's textures, cut into
the parts the game moves.

Run headless:  blender -b --python scripts/blender/grotto-monsters.py
Each monster of the owner's sheet was cut out as it is (docs/reference/grotto-pearl-fish.png,
grotto-pearl-slug.png, grotto-eye-clam.png) and sent to Meshy alone: image-to-3D, smart topology
(meshy-t2), no texture (assets/meshy/grotto/{pearl_fish,pearl_slug,eye_clam}_meshy.glb), then
retextured with Meshy 6 from the same picture (2K, original UVs kept, lighting removed:
assets/meshy/grotto/*_textured_meshy.glb). Here each textured shape is split into the loose pieces
Meshy made (the charts the retexture cut it into are welded back first), the pieces are
grouped into the parts the game moves on their own, the texture is brought down to 1024 px (JPEG)
and every monster stands on its own origin, in metres, facing -Y here (+Z in the game). Writes
public/models/grotto/grotto-monsters.glb with objects mon_<monster>_<part>, each with its monster's
textured material:
  fish   body (with its eyes, lips and middle fins), tail, finl, finr
  slug   body (with its feet), cerata (the wing-like plumes on its back), pearls (and the feelers' tips)
  clam   shell (with its barnacles), eye, pearls (the ones in its gape)
  boss       the Pearl Snail King out of its shell (docs/reference/grotto-boss-snail.png): body (with its
             shell and barnacles), eyel, eyer (the balls at its stalks' tips), pearl (the great pearl in its shell)
  bossshell  the boss hidden in its shell (grotto-boss-shell.png): shell, pearl
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meshy_parts import reset, load, put as put_in, stand, write

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = lambda n: os.path.join(ROOT, 'assets', 'meshy', 'grotto', f'{n}_textured_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'grotto-monsters.glb')

MONSTERS = reset()  # monster -> {part: object}
put = lambda monster, part, pieces: put_in(MONSTERS, monster, part, pieces)


# ---- the pearl fish: head toward -X, its sides toward ±Y ----
parts = load(SRC('pearl_fish'))
body = parts[0]
eyes = [p for p in parts if p['size'].y > 0.05 and p['size'].x < 0.09 and p['c'].x < -0.3]
lips = [p for p in parts if p is not body and p not in eyes and p['c'].x < -0.38]
thin = [p for p in parts if p is not body and p not in eyes and p not in lips]
tail = [p for p in thin if p['c'].x > 0.3]
fin_l = [p for p in thin if p['c'].y > 0.1]
fin_r = [p for p in thin if p['c'].y < -0.1]
middle = [p for p in thin if p not in tail + fin_l + fin_r]
put('fish', 'body', [body] + eyes + lips + middle)
put('fish', 'tail', tail)
put('fish', 'finl', fin_l)
put('fish', 'finr', fin_r)

# ---- the pearl sea slug: head toward -Y ----
parts = load(SRC('pearl_slug'))
body = parts[0]
cerata = [p for p in parts[1:] if p['n'] > 60]
balls = [p for p in parts[1:] if p['n'] <= 60 and max(p['size']) < 0.11 and abs(p['size'].x - p['size'].y) < 0.03]
feet = [p for p in parts[1:] if p not in cerata and p not in balls]
put('slug', 'body', [body] + feet)
put('slug', 'cerata', cerata)
put('slug', 'pearls', balls)

# ---- the one-eyed clam: its gape toward -Y ----
parts = load(SRC('eye_clam'))
shell = parts[0]
eye = max(parts[1:], key=lambda p: p['n'])
small = [p for p in parts[1:] if p is not eye]
EC = eye['c']
pearls = [p for p in small if p['c'].y < EC.y + 0.05 and (p['c'] - EC).length < 0.48 and p['c'].z < EC.z + 0.12]
put('clam', 'shell', [shell] + [p for p in small if p not in pearls])
put('clam', 'eye', [eye])
put('clam', 'pearls', pearls)

# ---- the boss, the Pearl Snail King, out of its shell: head toward -Y, its shell behind ----
parts = load(SRC('boss_snail'))
body = parts[0]
eyes = [p for p in parts[1:] if p['c'].y < -0.4 and p['c'].z > 0.15]
pearl = max((p for p in parts[1:] if p not in eyes and p['c'].z > 0.15 and p['c'].y > -0.2), key=lambda p: p['n'])
rest = [p for p in parts[1:] if p not in eyes and p is not pearl]
put('boss', 'body', [body] + rest)
put('boss', 'eyel', [p for p in eyes if p['c'].x < 0])
put('boss', 'eyer', [p for p in eyes if p['c'].x >= 0])
put('boss', 'pearl', [pearl])

# ---- the boss hidden in its shell: its mouth toward -X ----
parts = load(SRC('boss_shell'))
shell = parts[0]
# the great pearl: the biggest round piece at the top (Meshy also left a second, smaller ball inside it: that one stays with the shell)
pearl = max((p for p in parts[1:] if p['c'].z > 0.1 and max(p['size']) > 0.2 and max(p['size']) - min(p['size']) < 0.05), key=lambda p: p['n'])
put('bossshell', 'shell', [shell] + [p for p in parts[1:] if p is not pearl])
put('bossshell', 'pearl', [pearl])

# ---- each monster on its own foot in metres, facing -Y; textures brought down ----
SIZE = {'fish': ('x', 2.0), 'slug': ('y', 1.7), 'clam': ('x', 1.8), 'boss': ('y', 6.5), 'bossshell': ('z', None)}  # metres along the axis, before turning
# the fish's head points -X and the hidden boss's mouth too: turn them to -Y (the hidden boss's spiral
# then sits on the same side as the boss's own)
TURN = {'fish': math.pi / 2, 'slug': 0.0, 'clam': 0.0, 'boss': 0.0, 'bossshell': math.pi / 2}
for name, kinds in MONSTERS.items():
    axis, metres = SIZE[name]
    if metres is None:  # the hidden boss: as tall as the boss's shell stands out of it
        metres = BOSS_HEIGHT * 0.92
    height = stand(list(kinds.values()), axis, metres, TURN[name])
    if name == 'boss':
        BOSS_HEIGHT = height
write(MONSTERS, OUT)
