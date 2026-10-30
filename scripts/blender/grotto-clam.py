"""The giant clam that keeps a pearl: Meshy's shape, painted here.

Run headless:  blender -b --python scripts/blender/grotto-clam.py
Reads assets/meshy/grotto/giant_clam_meshy.glb (Meshy image-to-3D, smart topology, no texture,
from docs/reference/giant-clam-pearl.png) and writes public/models/grotto/giant-clam.glb with three
objects the game asks for by name (src/render/grotto/props.js):
  clam_lid    the upper valve with its barnacles and coral sprigs
  clam_cup    the lower valve, its barnacles and the folded flesh inside it
  clam_pearl  the pearl (the game gives it a soft glow)
Each valve gets a wall (solidify) and one subdivision; colour is painted per vertex, smooth-shaded,
as the reference shows it: cream fold crests and
blue-teal furrows outside, teal toward the lip in a dry-brush zigzag, a pale lavender nacre band
along the inside of each lip, deeper lavender inside, peach flesh with darker creases, grey-beige
barnacles, red-orange coral, an iridescent pearl. Ambient occlusion (Cycles) darkens the gape.
"""
import bpy, bmesh, math, os
from mathutils import Vector, noise
from mathutils.kdtree import KDTree

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'meshy', 'grotto', 'giant_clam_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'giant-clam.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
noise.seed_set(5)
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')


def lin(hex_):
    h = hex_.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mul(a, k):
    return tuple(c * k for c in a)


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


CREAM, TEAL = lin('#ece6d2'), lin('#6f9fa6')
LIP, NACRE, NACRE_DEEP = lin('#e6d8f0'), lin('#d3bfe6'), lin('#9c86b6')
FLESH, CREASE = lin('#ecc6b8'), lin('#c08a79')
BARNACLE, BARNACLE_TOP = lin('#9c9688'), lin('#c4beb0')
CORAL, CORAL_TIP = lin('#c9604a'), lin('#ee9a7c')
PEARL = [lin(h) for h in ('#f2eef4', '#7fe0ea', '#c39cf0', '#f0a9cc', '#f2eef4')]


def bounds(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return mn, mx


# ---- which loose part is which ----
parts = []
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        mn, mx = bounds(o)
        parts.append({'ob': o, 'faces': len(o.data.polygons), 'c': (mn + mx) / 2, 'size': mx - mn})
parts.sort(key=lambda p: -p['faces'])
big = parts[:4]
lid = max(big, key=lambda p: p['c'].z)
pearl = min(big, key=lambda p: max(p['size']) / max(1e-6, min(p['size'])))  # the roundest
rest = [p for p in big if p not in (lid, pearl)]
cup = max(rest, key=lambda p: p['faces'])
mantle = [p for p in rest if p is not cup][0]
small = parts[4:]
corals = [p for p in small if p['faces'] > 90]
barnacles = [p for p in small if p['faces'] <= 90]
P = pearl['c']
print('lid', lid['faces'], 'cup', cup['faces'], 'mantle', mantle['faces'], 'pearl', pearl['faces'], 'corals', len(corals), 'barnacles', len(barnacles))


def concavity(me):
    """Per vertex: + where the surface folds in (a furrow), - on a crest; smoothed over two rings."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    raw = []
    for v in bm.verts:
        if not v.link_edges:
            raw.append(0.0)
            continue
        avg = sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
        raw.append((avg - v.co).dot(v.normal))
    for _ in range(6):
        raw = [(raw[v.index] + sum(raw[e.other_vert(v).index] for e in v.link_edges)) / (1 + len(v.link_edges)) for v in bm.verts]
    pts = [v.co.copy() for v in bm.verts]
    bm.free()
    s = sorted(abs(x) for x in raw)
    scale = s[int(len(s) * 0.9)] or 1.0
    kd = KDTree(len(pts))
    for i, q in enumerate(pts):
        kd.insert(q, i)
    kd.balance()
    vals = [x / scale for x in raw]
    return lambda co: vals[kd.find(co)[1]]


def lip_tree(me):
    """The lip of a valve: where its surface turns from facing out to facing the pearl (Meshy's
    valves are closed thin solids, so the lip is a fold, not an open edge), plus any open edge."""
    bm = bmesh.new()
    bm.from_mesh(me)
    inner = lambda f: f.normal.dot(f.calc_center_median() - P) < 0
    pts = [v.co.copy() for v in bm.verts
           if any(len(e.link_faces) == 1 for e in v.link_edges) or len({inner(f) for f in v.link_faces}) == 2]
    bm.free()
    kd = KDTree(max(1, len(pts)))
    for i, q in enumerate(pts):
        kd.insert(q, i)
    kd.balance()
    return (lambda co: kd.find(co)[2]) if pts else (lambda co: 1.0)


def modify(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def paint(part, shade):
    """shade(position, vertex normal) -> linear colour, per vertex (smooth-shaded, painted look)."""
    me = part['ob'].data
    for poly in me.polygons:
        poly.use_smooth = True
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        layer.data[v.index].color = (*shade(v.co, v.normal), 1.0)
    me.color_attributes.active_color = layer


def valve(part):
    ob = part['ob']
    furrow_at, lip_at = concavity(ob.data), lip_tree(ob.data)
    # Meshy made each valve one thin sheet: give it a wall, so the nacre inside has its own face
    modify(ob, 'SOLIDIFY', thickness=0.016, offset=-1.0, use_rim=True)
    modify(ob, 'SUBSURF', levels=1, render_levels=1)

    def shade(co, nrm):
        d_lip = lip_at(co)
        if nrm.dot(co - P) < 0:
            # the nacre: pale at the lip, deeper toward the hinge
            return mix(LIP, mix(NACRE, NACRE_DEEP, smooth(0.08, 0.3, d_lip)), smooth(0.02, 0.07, d_lip))
        if d_lip < 0.012:
            return LIP  # the lip's rounded edge shows its lavender
        # dry-brush strokes: fine across the folds, long along them (they run hinge to lip)
        jag = 0.55 * noise.noise(Vector((co.x * 34, co.y * 5, co.z * 5))) + 0.25 * noise.noise(co * 60)
        # teal down the furrows and over the lip half, its edge a crisp zigzag; cream on the crests
        furrow = smooth(-0.02, 0.05, furrow_at(co) + 0.35 * jag)
        lipward = smooth(0.24, 0.2, d_lip + 0.11 * jag)
        return mix(CREAM, TEAL, max(furrow, lipward * 0.95))
    paint(part, shade)


valve(lid)
valve(cup)

crease = concavity(mantle['ob'].data)
modify(mantle['ob'], 'SUBSURF', levels=1, render_levels=1)
paint(mantle, lambda co, nrm: mix(FLESH, CREASE, smooth(-0.1, 0.5, crease(co))))


def pearl_shade(co, nrm):
    v = (co - P).normalized()
    # Blender z is up, -y faces the front
    up, fwd, side = v.z, -v.y, v.x
    t = (math.atan2(up + 0.3 * side, fwd) / math.pi + 1) * 0.9 + side * 0.5 + 0.15 * math.sin(up * 5)
    k = (t % 1.0) * (len(PEARL) - 1)
    a = int(k)
    col = mix(PEARL[a], PEARL[a + 1], k - a)
    return mix(col, lin('#ffffff'), 0.65 * smooth(0.6, 0.98, fwd * 0.6 + up * 0.55 - side * 0.3))


modify(pearl['ob'], 'SUBSURF', levels=2, render_levels=2)
paint(pearl, pearl_shade)

for b in barnacles:
    cb = b['c']
    paint(b, lambda co, nrm, cb=cb: mix(BARNACLE, BARNACLE_TOP, smooth(0.2, 0.7, nrm.dot((cb - P).normalized()))))
for k in corals:
    ck, sk = k['c'], max(k['size'])
    paint(k, lambda co, nrm, ck=ck, sk=sk: mix(CORAL, CORAL_TIP, smooth(0.25, 0.5, (co - ck).length / sk)))

# ---- ambient occlusion: the gape, the underside of the lid and the hollows go darker ----
objs = [p['ob'] for p in parts]
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 64
scene.world = bpy.data.worlds.new('clam')
scene.world.light_settings.distance = 0.35
mat = bpy.data.materials.new('clam')
mat.use_nodes = True
for o in objs:
    o.data.materials.clear()
    o.data.materials.append(mat)
for o in objs:
    me = o.data
    col = me.color_attributes['Col']
    ao = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ao
    for q in objs:
        q.select_set(q == o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for i in range(len(col.data)):
        c, f = col.data[i].color, 0.42 + 0.58 * ao.data[i].color[0]
        col.data[i].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)
    me.color_attributes.remove(me.color_attributes['ao'])
    me.color_attributes.active_color = me.color_attributes['Col']

# ---- join into the three pieces; each barnacle and sprig rides the valve it grows on ----
def nearest_valve(p):
    def dist(v):
        mw = v['ob'].matrix_world
        return min((mw @ x.co - p['c']).length for x in v['ob'].data.vertices)
    return lid if dist(lid) < dist(cup) else cup


groups = {'clam_lid': [lid], 'clam_cup': [cup, mantle], 'clam_pearl': [pearl]}
for p in barnacles + corals:
    groups['clam_lid' if nearest_valve(p) is lid else 'clam_cup'].append(p)
for name, members in groups.items():
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for m in members:
        m['ob'].select_set(True)
    bpy.context.view_layer.objects.active = members[0]['ob']
    if len(members) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name

for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or o.name not in groups:
        bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_apply=True, export_yup=True)
print('wrote', OUT, {o.name: len(o.data.polygons) for o in bpy.context.scene.objects})
