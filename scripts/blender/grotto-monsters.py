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
import bpy, bmesh, math, os
from mathutils import Matrix, Vector

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = lambda n: os.path.join(ROOT, 'assets', 'meshy', 'grotto', f'{n}_textured_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'grotto-monsters.glb')
TEXTURE = 1024  # px: plenty for a monster two metres long, and light on the iPad

bpy.ops.wm.read_factory_settings(use_empty=True)
MONSTERS = {}  # monster -> {part: object}


def load(path):
    """The textured shape, its seams merged, split into its loose pieces: [{ob, n, min, max, c, size}]."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    src = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in before][0]
    for o in bpy.context.scene.objects:
        o.select_set(o is src)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Meshy's retexture hands the shape back cut along every texture chart: weld the charts back
    # together (the texture keeps its seams, they live in the UVs), then bring it to a 1 unit box,
    # the size the untextured shape came at, which the sorting below is measured in
    bm = bmesh.new()
    bm.from_mesh(src.data)
    ext = max((max(v.co[k] for v in bm.verts) - min(v.co[k] for v in bm.verts)) for k in range(3))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=ext * 2e-4)
    bmesh.ops.scale(bm, vec=(1 / ext, 1 / ext, 1 / ext), verts=bm.verts)
    bm.to_mesh(src.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.context.scene.objects):
        if o not in before and o.type != 'MESH':
            bpy.data.objects.remove(o)  # the importer's empties
    out = []
    for o in bpy.context.scene.objects:
        if o in before or o.type != 'MESH' or not o.data.vertices:
            continue
        vs = [v.co for v in o.data.vertices]
        mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        out.append({'ob': o, 'n': len(vs), 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn})
    return sorted(out, key=lambda p: -p['n'])


def put(monster, part, pieces):
    obs = [p['ob'] for p in pieces]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = f'mon_{monster}_{part}'
    for poly in ob.data.polygons:
        poly.use_smooth = True
    MONSTERS.setdefault(monster, {})[part] = ob


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
    obs = list(kinds.values())
    vs = [v.co for ob in obs for v in ob.data.vertices]
    axis, metres = SIZE[name]
    if metres is None:  # the hidden boss: as tall as the boss's shell stands out of it
        metres = BOSS_HEIGHT * 0.92
    k = 'xyz'.index(axis)
    foot = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
    m = Matrix.Rotation(TURN[name], 4, 'Z') @ Matrix.Scale(metres / (max(v[k] for v in vs) - min(v[k] for v in vs)), 4) @ Matrix.Translation(-foot)
    for ob in obs:
        ob.data.transform(m)
        ob.location = (0, 0, 0)
    if name == 'boss':
        BOSS_HEIGHT = max(v.co.z for ob in obs for v in ob.data.vertices)
for img in bpy.data.images:
    if img.size[0] > TEXTURE:
        img.scale(TEXTURE, TEXTURE)
keep = {ob.name for kinds in MONSTERS.values() for ob in kinds.values()}
for o in list(bpy.context.scene.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_normals=True,
                          export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88)
print('wrote', OUT, {o.name: len(o.data.polygons) for o in bpy.context.scene.objects})
