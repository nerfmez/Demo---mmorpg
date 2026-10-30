"""The grotto's props from the owner's sheets: Meshy's shapes, painted here.

Run headless:  blender -b --python scripts/blender/grotto-props.py
Reads the Meshy image-to-3D shapes in assets/meshy/grotto/ (smart topology, no texture, each made
from one of the owner's pictures in docs/reference/grotto-*.png, sent as they are) and writes
public/models/grotto/grotto-props.glb (sheets: grotto-crystals, grotto-coral-tree, grotto-hoard,
grotto-ruins, grotto-pearl-altar). Meshy split every sheet into its pieces (a pillar's blocks,
a chest's bands and corners, each rock); each piece is painted as what it is, per vertex, then
ambient occlusion is baked in. Every prop stands on its own origin, in metres, facing -Y here (+Z in
the game), as objects named prop_<name>_<kind>, where kind says how the game draws it:
  flat    cel-lit, faceted (stone, wood, metal, rock)
  smooth  cel-lit, smooth
  shine   cel-lit, faceted, giving off its own colour (crystals, gems)
  shinesm cel-lit, smooth, giving off its own colour (pearls, the coral tree)
  glow    unlit (flames, the coral tree's tips, the sealed door's runes)
Props: crystal_s, crystal_m, crystal_l (sheet grotto-crystals), coral_tree, chest,
chest_open, candles, barrel, crate, post (grotto-hoard), pillar, pillar_broken, pillar_fallen, arch,
arch_shell, arch_sealed (grotto-ruins), pearl_altar.
"""
import bpy, bmesh, math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grotto_paint as gp
from grotto_paint import lin, mix, smooth, kd_of
from mathutils import Matrix, Vector, noise

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = lambda n: os.path.join(ROOT, 'assets', 'meshy', 'grotto', f'{n}_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'grotto-props.glb')
rng = random.Random(11)
noise.seed_set(11)
VIEW = Vector((0, -0.55, 0.83))  # toward the game camera: in front (-Y) and above

# ---- colours (linear) ----
STONE, STONE_DARK, STONE_EDGE = lin('#d6cfb9'), lin('#a49a83'), lin('#eee8d6')
TEAL, TEAL_DARK = lin('#93c8bd'), lin('#5c968d')
MOSS, MOSS_DARK = lin('#5a9442'), lin('#2f6230')
WOOD, WOOD_LIGHT, WOOD_DARK = lin('#8a5730'), lin('#b0743f'), lin('#55331b')
IRON, IRON_LIGHT = lin('#474d61'), lin('#7a8299')
GOLD, GOLD_LIGHT, GOLD_DARK = lin('#dca838'), lin('#ffe596'), lin('#9a6a1c')
WAX, WAX_SHADE = lin('#f4e8cb'), lin('#d9c296')
FLAME, FLAME_TIP = lin('#ff7a1c'), lin('#fff4b8')
ROCK, ROCK_LIGHT = lin('#625a52'), lin('#8b8073')
ROPE, ROPE_DARK = lin('#cfa566'), lin('#8e6a3c')
GEMS = [lin(h) for h in ('#e8344e', '#2f70f2', '#38c45a', '#9a4ae6')]
PEARL = [lin(h) for h in ('#f4f0f6', '#8fe6ee', '#c9a6f2', '#f4b2d2', '#f4f0f6')]
CORALS = [lin(h) for h in ('#a05ae6', '#3f86f0', '#e060c8')]
RUNE = lin('#8ff4ff')


def spread(p):
    """How elongated a part really is, whichever way it leans: the square root of its two largest
    variances' ratio (a tilted prism has a fat box but a long spread)."""
    if 'spread' not in p:
        vs = [v.co for v in p['ob'].data.vertices]
        n = len(vs)
        c = sum(vs, Vector()) / n
        m = [[sum((v[i] - c[i]) * (v[j] - c[j]) for v in vs) / n for j in range(3)] for i in range(3)]
        ev = sorted(Matrix(m).to_3x3().eigenvalues() if hasattr(Matrix, 'eigenvalues') else jacobi(m), reverse=True)
        p['spread'] = math.sqrt(max(ev[0], 1e-12) / max(ev[1], 1e-12))
    return p['spread']


def jacobi(m):
    """Eigenvalues of a symmetric 3x3 matrix (cyclic Jacobi)."""
    a = [row[:] for row in m]
    for _ in range(30):
        for p_, q in ((0, 1), (0, 2), (1, 2)):
            if abs(a[p_][q]) < 1e-14:
                continue
            th = 0.5 * math.atan2(2 * a[p_][q], a[q][q] - a[p_][p_])
            c, s_ = math.cos(th), math.sin(th)
            for k in range(3):
                akp, akq = a[k][p_], a[k][q]
                a[k][p_], a[k][q] = c * akp - s_ * akq, s_ * akp + c * akq
            for k in range(3):
                apk, aqk = a[p_][k], a[q][k]
                a[p_][k], a[q][k] = c * apk - s_ * aqk, s_ * apk + c * aqk
    return [a[0][0], a[1][1], a[2][2]]


def shape(p):
    a, b, c = sorted(p['size'])
    return {'round': a / max(c, 1e-6), 'elong': c / max(b, 1e-6), 'thin': a / max(b, 1e-6), 'big': c, 'vol': a * b * c}


def long_axis(p):
    s = p['size']
    return max(range(3), key=lambda k: s[k])


# ---- painters: each takes the part (and its object) and returns shade(vertex) ----
def stone(p, o, teal=0.0):
    tone = rng.uniform(-0.08, 0.08)
    z0, h = o['min'].z, o['size'].z
    def shade(v, conc):
        co, n = v.co, v.normal
        c = mix(STONE, STONE_DARK, 0.25 + tone + 0.22 * noise.noise(co * 70))
        c = mix(c, TEAL, teal)
        c = mix(c, TEAL_DARK, 0.85 * smooth(0.15, 0.8, conc))        # carvings and inner corners
        c = mix(c, STONE_EDGE, 0.5 * smooth(-0.3, -0.9, conc))       # worn, sunlit edges
        # moss on the tops (the seaweed down the sides is its own strands)
        top = smooth(0.6, 0.9, n.z) * smooth(0.1, 0.45, noise.noise(co * 30))
        return mix(c, mix(MOSS, MOSS_DARK, smooth(-0.2, 0.4, noise.noise(co * 90))), 0.85 * smooth(0.3, 0.6, top))
    return shade


def wood(p, o, plank=True):
    axis = long_axis(p)
    tone = rng.uniform(-0.12, 0.12)
    def shade(v, conc):
        co = v.co
        q = [co.x * 90, co.y * 90, co.z * 90]
        q[axis] *= 0.06  # grain runs along the plank
        grain = noise.noise(Vector(q))
        c = mix(WOOD, WOOD_LIGHT, 0.35 + tone + 0.3 * grain)
        c = mix(c, WOOD_DARK, 0.8 * smooth(0.1, 0.7, conc))
        return mix(c, WOOD_LIGHT, 0.35 * smooth(-0.3, -0.9, conc))
    return shade


def metal(light, base, dark):
    def painter(p, o):
        def shade(v, conc):
            c = mix(base, light, 0.6 * smooth(0.1, 0.9, v.normal.dot(VIEW)))
            return mix(c, dark, 0.7 * smooth(0.1, 0.7, conc))
        return shade
    return painter


iron = metal(IRON_LIGHT, IRON, lin('#2a2e3c'))
gold = metal(GOLD_LIGHT, GOLD, GOLD_DARK)


def rock(p, o, moss=0.6):
    tone = rng.uniform(-0.1, 0.1)
    def shade(v, conc):
        co, n = v.co, v.normal
        c = mix(ROCK, ROCK_LIGHT, 0.4 + tone + 0.3 * noise.noise(co * 80) + 0.3 * n.z)
        m = smooth(0.4, 0.8, n.z) * smooth(-0.1, 0.3, noise.noise(co * 50)) * moss
        return mix(c, mix(MOSS, MOSS_DARK, 0.4), smooth(0.2, 0.5, m))
    return shade


def barrel(p, o):
    """Wood staves; iron hoops where the outline stands proud of its own smooth curve."""
    staves, hoops = wood(p, o), iron(p, o)
    vs = p['ob'].data.vertices
    cx, cy = p['c'].x, p['c'].y
    z0, z1 = p['min'].z, p['max'].z
    N = 40
    rmax = [0.0] * N
    def bin_of(z):
        return min(N - 1, int((z - z0) / max(z1 - z0, 1e-6) * N))
    for v in vs:
        k = bin_of(v.co.z)
        rmax[k] = max(rmax[k], math.hypot(v.co.x - cx, v.co.y - cy))
    for k in range(N):
        if rmax[k] == 0:
            rmax[k] = rmax[k - 1] if k else 0
    curve = [sorted(rmax[max(0, k - 4):k + 5])[len(rmax[max(0, k - 4):k + 5]) // 2] for k in range(N)]
    hoop = [rmax[k] > curve[k] * 1.006 for k in range(N)]
    def shade(v, conc):
        k = bin_of(v.co.z)
        r = math.hypot(v.co.x - cx, v.co.y - cy)
        if hoop[k] and r > rmax[k] * 0.95 and abs(v.normal.z) < 0.6:
            return hoops(v, conc)
        return staves(v, conc)
    return shade


def flat_colour(col):
    return lambda p, o: (lambda v, conc: col)


def wax(p, o):
    z0, z1 = p['min'].z, p['max'].z
    def shade(v, conc):
        t = (v.co.z - z0) / max(z1 - z0, 1e-6)
        drip = smooth(0.2, 0.5, noise.noise(Vector((v.co.x * 90, v.co.y * 90, 0)))) * smooth(0.5, 0.95, t)
        return mix(mix(WAX_SHADE, WAX, smooth(0.0, 0.6, t)), lin('#fffaf0'), 0.5 * drip)
    return shade


def flame(p, o):
    z0, z1 = p['min'].z, p['max'].z
    return lambda v, conc: mix(FLAME, FLAME_TIP, smooth(0.15, 0.85, (v.co.z - z0) / max(z1 - z0, 1e-6)))


def rope(p, o):
    def shade(v, conc):
        twist = math.sin((v.co.x + v.co.y) * 260 + v.co.z * 260)
        return mix(ROPE, ROPE_DARK, 0.5 * smooth(-0.2, 0.8, twist) + 0.5 * smooth(0.1, 0.7, conc))
    return shade


def pearl(p, o):
    c0 = p['c']
    def shade(v, conc):
        d = (v.co - c0).normalized()
        up, fwd, side = d.z, -d.y, d.x
        t = (math.atan2(up + 0.3 * side, fwd) / math.pi + 1) * 0.9 + side * 0.5 + 0.15 * math.sin(up * 5)
        k = (t % 1.0) * (len(PEARL) - 1)
        a = int(k)
        col = mix(PEARL[a], PEARL[a + 1], k - a)
        return mix(col, lin('#ffffff'), 0.6 * smooth(0.55, 0.98, d.dot(VIEW)))
    return shade


def crystal(p, o, violet=None):
    violet = rng.random() < 0.35 if violet is None else violet
    base, mid, tip = (lin('#4a3cd8'), lin('#8a64f0'), lin('#f2d2ff')) if violet else (lin('#2a52d8'), lin('#3f9af6'), lin('#c8f4ff'))
    zs = [v.co.z for v in p['ob'].data.vertices]
    lo, hi = min(zs), max(zs)
    def shade(v, conc):
        t = (v.co.z - lo) / max(hi - lo, 1e-6)
        c = mix(mix(base, mid, smooth(0.0, 0.55, t)), tip, smooth(0.55, 1.0, t))
        # facets: the side the light comes from paler, the other deeper
        return mix(c, tip, 0.35 * smooth(0.2, 0.9, v.normal.dot(Vector((-0.5, -0.6, 0.6)).normalized())))
    return shade


def gem(p, o):
    col = rng.choice(GEMS)
    return lambda v, conc: mix(col, lin('#ffffff'), 0.45 * smooth(0.5, 0.95, v.normal.dot(VIEW)))


# ---- assembling a prop: paint each part, join by kind ----
def build(name, assigned, subdiv=None):
    """assigned: [(part, painter, kind)]. Paints each part (simple subdivision first where it is big
    enough to carry the paint), joins the parts of each kind into prop_<name>_<kind>."""
    by_kind = {}
    for p, painter, kind in assigned:
        ob = p['ob']
        levels = subdiv(p) if subdiv else 0
        if levels:
            gp.modify(ob, 'SUBSURF', levels=levels, render_levels=levels, subdivision_type='SIMPLE')
        conc = gp.concavity(ob.data, rings=2)
        shade = painter(p, current)
        gp.paint(ob, lambda v, shade=shade, conc=conc: shade(v, conc[v.index]), smooth_shade=kind in ('smooth', 'shinesm'))
        by_kind.setdefault(kind, []).append(ob)
    out = {}
    for kind, obs in by_kind.items():
        out[kind] = gp.join(obs, f'prop_{name}_{kind}')
    PROPS[name] = out
    return out


def seaweed(ob, o, name, n):
    """Strands of seaweed hanging from the upper part of a ruin down its sides: wavy ribbons
    just off the stone, dark at the root, paler toward the tip."""
    me = ob.data
    me.calc_loop_triangles()
    z0, h = o['min'].z, o['size'].z
    spots = [t for t in me.loop_triangles if abs(t.normal.z) < 0.3 and t.normal.y < 0.5 and t.center.z > z0 + 0.45 * h and t.area > 0]
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new('Col')
    total = sum(t.area for t in spots)
    for i in range(n):
        x, acc = rng.random() * total, 0.0
        for t in spots:
            acc += t.area
            if acc >= x:
                break
        nrm = t.normal.copy()
        side = Vector((-nrm.y, nrm.x, 0)).normalized()
        start = t.center + nrm * 0.003
        length = h * rng.uniform(0.15, 0.4)
        w = h * rng.uniform(0.035, 0.055)
        seg = 10
        prev = None
        phase = rng.uniform(0, 6.28)
        for k in range(seg + 1):
            f = k / seg
            at = start + Vector((0, 0, -length * f)) + side * (math.sin(phase + f * 5) * w * 0.8)
            half = side * (w * (1 - 0.6 * f) / 2)
            a, b = bm.verts.new(at - half), bm.verts.new(at + half)
            c = mix(lin('#3f7f36'), lin('#7cc457'), smooth(0.0, 0.9, f))
            a[col] = b[col] = (*c, 1.0)
            if prev:
                face = bm.faces.new((prev[0], prev[1], b, a))
                face.normal_update()
                if face.normal.dot(nrm) < 0:
                    face.normal_flip()  # facing out of the stone, toward the light
            prev = (a, b)
    me2 = bpy.data.meshes.new(name)
    bm.to_mesh(me2)
    bm.free()
    weed = bpy.data.objects.new(name, me2)
    bpy.context.scene.collection.objects.link(weed)
    me2.color_attributes.active_color = me2.color_attributes['Col']
    for poly in me2.polygons:
        poly.use_smooth = True
    return weed


def drop(parts):
    for p in parts:
        bpy.data.objects.remove(p['ob'])


def nearest(objs, refs):
    """Name each object by the reference point (x, y, z) it is closest to."""
    out = {}
    for name, ref in refs.items():
        out[name] = min(objs, key=lambda o: (o['c'] - Vector(ref)).length)
    return out


def sheet(name, offset):
    parts = gp.load(SRC(name))
    t = Matrix.Translation((offset, 0, 0))
    out = []
    for p in parts:
        p['ob'].data.transform(t)
        out.append(gp.part(p['ob']))
    return out


PROPS = {}
current = None
big_enough = lambda k: (lambda p: k if shape(p)['big'] > 0.05 else (1 if shape(p)['big'] > 0.02 else 0))

# ---- crystals and the pearl in its shell ----
objs = sorted(gp.objects(sheet('crystals', 0.0)), key=lambda o: o['c'].x)
# the fourth, a pearl in an open shell, came out as a heap of chips: the small pearls keep the game's own
drop(objs[3]['parts'])
for name, o in zip(('crystal_s', 'crystal_m', 'crystal_l'), objs):
    current = o
    assigned = []
    for p in o['parts']:
        s = shape(p)
        if spread(p) > 1.6:
            assigned.append((p, crystal, 'shine'))
        elif s['big'] < 0.02:
            assigned.append((p, gem if rng.random() < 0.3 else crystal, 'shine'))
        else:
            assigned.append((p, rock, 'flat'))
    build(name, assigned, subdiv=lambda p: 0)

# ---- the coral tree ----
parts = sheet('coral_tree', 3.0)
tree = gp.join([p['ob'] for p in parts], 'tree')
gp.modify(tree, 'SUBSURF', levels=1, render_levels=1)
me = tree.data
zs = [v.co.z for v in me.vertices]
z0, h = min(zs), max(zs) - min(zs)
g = gp.geodesic(me, lambda co: co.z < z0 + 0.008)
gmax = max(x for x in g if x < math.inf)
kd = kd_of([v.co for v in me.vertices])
tips = [v.co.copy() for v in me.vertices if g[v.index] > 0.45 * gmax and all(g[j] <= g[v.index] for (_, j, _) in kd.find_range(v.co, 0.025))]
tk = kd_of(tips)
xs = [v.co.x for v in me.vertices]
xc, xw = (min(xs) + max(xs)) / 2, (max(xs) - min(xs)) / 2
FOOT, BODY, CROWN, BLUE, TIP = lin('#5c44c4'), lin('#9266e2'), lin('#e48ee8'), lin('#6a7ef0'), lin('#ffd6f6')
tipw = [smooth(0.016, 0.006, tk.find(v.co)[2]) if tips else 0.0 for v in me.vertices]
def tree_shade(v):
    t = (v.co.z - z0) / h
    c = mix(mix(FOOT, BODY, smooth(0.0, 0.4, t)), CROWN, smooth(0.4, 1.0, t))
    c = mix(c, BLUE, 0.45 * smooth(0.0, -0.9, (v.co.x - xc) / xw) * smooth(0.2, 0.7, t))  # bluer on the left
    c = mix(c, lin('#3a2a7a'), 0.5 * smooth(0.25, 0.7, noise.noise(v.co * 160)) * smooth(0.5, 0.0, t))  # pitted trunk
    return mix(c, TIP, tipw[v.index])
gp.paint(tree, tree_shade)
glow = gp.split_faces(tree, lambda i: tipw[i] > 0.5, 'prop_coral_tree_glow')
tree.name = tree.data.name = 'prop_coral_tree_shinesm'
PROPS['coral_tree'] = {'shinesm': tree, **({'glow': glow} if glow else {})}
print('coral tree tips', len(tips))

# ---- the hoard: chests, candles, barrel, crate, post ----
objs = gp.objects(sheet('hoard_props', 6.0))
refs = {'chest': (6 - 0.286, 0.067, 0.047), 'chest_open': (6 + 0.094, 0.247, 0.064), 'candles': (6 - 0.368, -0.3, -0.097),
        'barrel': (6 - 0.071, -0.234, -0.097), 'crate': (6 + 0.157, -0.12, -0.104), 'post': (6 + 0.432, 0.005, -0.094)}
named = nearest(objs, refs)
for name, o in named.items():
    current = o
    parts = sorted(o['parts'], key=lambda p: -shape(p)['vol'])
    assigned = []
    W, H = o['size'].x, o['size'].z
    if name in ('chest', 'chest_open'):
        woods = [p for p in parts if shape(p)['vol'] > 0.2 * shape(parts[0])['vol']]
        for p in parts:
            s = shape(p)
            if p in woods or (s['thin'] < 0.3 and long_axis(p) == 0 and p['size'].x > 0.5 * W):
                assigned.append((p, wood, 'flat'))  # the box, the lid and the long planks
            elif name == 'chest_open' and p['c'].z > woods[0]['c'].z and s['big'] < 0.06 and p['size'].x > 0.14 * W * 0.3 and abs(p['c'].x - o['c'].x) < 0.4 * W:
                # the hoard inside: coins, gems, pearls
                r = rng.random()
                assigned.append((p, gem, 'shine') if r < 0.3 else (p, pearl, 'shinesm') if r < 0.42 else (p, gold, 'flat'))
            elif p['size'].x < 0.14 * W and max(p['size'].y, p['size'].z) > 0.45 * max(o['size'].y, H):
                assigned.append((p, iron, 'flat'))  # the bands round the chest
            else:
                assigned.append((p, gold, 'flat'))  # corners, rims, the lock, the ring
    elif name == 'candles':
        flames = [p for p in parts if long_axis(p) == 2 and shape(p)['elong'] > 1.8 and p['c'].z > o['min'].z + 0.35 * H]
        def under_flame(p):
            return any(p['min'].x < f['c'].x < p['max'].x and p['min'].y < f['c'].y < p['max'].y and p['max'].z <= f['c'].z for f in flames)
        for p in parts:
            if p in flames:
                assigned.append((p, flame, 'glow'))
            elif under_flame(p):
                assigned.append((p, wax, 'smooth'))
            else:
                assigned.append((p, rock, 'flat'))
    elif name == 'barrel':
        assigned.append((parts[0], barrel, 'flat'))
        for p in parts[1:]:
            assigned.append((p, wood, 'flat'))
    elif name == 'crate':
        for p in parts:
            assigned.append((p, wood, 'flat') if shape(p)['big'] > 0.35 * max(o['size']) else (p, iron, 'flat'))
    elif name == 'post':
        post = max(parts, key=lambda p: p['size'].z)
        for p in parts:
            if p is post:
                assigned.append((p, wood, 'flat'))
            elif p['c'].z > o['min'].z + 0.25 * H:
                assigned.append((p, rope, 'flat'))  # wound round the post
            else:
                assigned.append((p, rock, 'flat'))
    build(name, assigned, subdiv=big_enough(2))

# ---- the temple ruins ----
objs = gp.objects(sheet('temple_ruins', 9.0))
merged = max(objs, key=lambda o: o['size'].x)
objs.remove(merged)
def gap_cut(parts, lo, hi):
    """The middle of the widest stretch of x (between lo and hi) that no large part covers."""
    spans = sorted((p['min'].x, p['max'].x) for p in parts if shape(p)['big'] > 0.04)
    best, reach = (0, (lo + hi) / 2), -math.inf
    for a, b in spans:
        if reach > -math.inf and a > reach and lo < (a + reach) / 2 < hi and a - reach > best[0]:
            best = (a - reach, (a + reach) / 2)
        reach = max(reach, b)
    return best[1]
cut = gap_cut(merged['parts'], merged['min'].x + 0.25 * merged['size'].x, merged['max'].x - 0.25 * merged['size'].x)
print('arches cut at', round(cut - 9, 3))
for side in (lambda p: p['c'].x < cut, lambda p: p['c'].x >= cut):
    g = [p for p in merged['parts'] if side(p)]
    mn = Vector((min(p['min'].x for p in g), min(p['min'].y for p in g), min(p['min'].z for p in g)))
    mx = Vector((max(p['max'].x for p in g), max(p['max'].y for p in g), max(p['max'].z for p in g)))
    objs.append({'parts': g, 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn, 'n': sum(p['n'] for p in g)})
refs = {'pillar': (9 - 0.332, -0.067, 0.163), 'pillar_broken': (9 - 0.072, -0.01, 0.143), 'pillar_fallen': (9 + 0.274, 0.083, 0.082),
        'arch': (9 - 0.36, -0.1, -0.145), 'arch_shell': (9 + 0.0, -0.1, -0.145), 'arch_sealed': (9 + 0.351, 0.054, -0.165)}
named = nearest(objs, refs)
for name, o in named.items():
    current = o
    assigned = []
    door = []
    for p in o['parts']:
        s = shape(p)
        low = (p['c'].z - o['min'].z) / o['size'].z
        if s['big'] < 0.05 and low < 0.3:
            r = rng.random()
            painter = rock if r < 0.55 else flat_colour(rng.choice(CORALS)) if r < 0.75 else flat_colour(lin('#e6dcc4'))
            assigned.append((p, painter, 'flat'))
        elif s['round'] > 0.55 and s['big'] < 0.05 and 0.3 < low < 0.85:
            assigned.append((p, pearl, 'shinesm'))  # the pearl in the carved shell
        elif s['big'] < 0.05:
            assigned.append((p, flat_colour(lin('#e6dcc4')) if rng.random() < 0.5 else rock, 'flat'))  # barnacles, chips
        elif name == 'arch_sealed' and abs(p['c'].x - o['c'].x) < 0.22 * o['size'].x and p['size'].z > 0.45 * o['size'].z:
            door.append(p)
            assigned.append((p, lambda p, o: stone(p, o, teal=0.8), 'flat'))
        else:
            assigned.append((p, lambda p, o, low=low: stone(p, o, teal=0.7 if low < 0.3 else 0.12), 'flat'))
    built = build(name, assigned, subdiv=big_enough(2))
    built['smooth'] = seaweed(built['flat'], o, f'prop_{name}_smooth', 14 if name.startswith('arch') else 8)
    if door:
        # the seal: two rings, a diamond at each quarter, lines between, glowing on the door's face
        x0 = o['c'].x
        front = min(p['min'].y for p in door) - 0.002
        zc = o['min'].z + o['size'].z * 0.46
        R = o['size'].x * 0.2
        bm = bmesh.new()
        def strip(a, b, w):
            d = (b - a).normalized()
            nrm = Vector((-d.z, 0, d.x)) * (w / 2)
            vs = [bm.verts.new(q) for q in (a - nrm, a + nrm, b + nrm, b - nrm)]
            bm.faces.new(vs)
        def ring(r, w, n=48):
            for i in range(n):
                a0, a1 = i / n * math.tau, (i + 1) / n * math.tau
                strip(Vector((x0 + math.cos(a0) * r, front, zc + math.sin(a0) * r)), Vector((x0 + math.cos(a1) * r, front, zc + math.sin(a1) * r)), w)
        ring(R, R * 0.07)
        ring(R * 0.55, R * 0.05)
        for k in range(4):
            a = k / 4 * math.tau + math.pi / 4
            cx, cz = x0 + math.cos(a) * R * 1.25, zc + math.sin(a) * R * 1.25
            dd = R * 0.16
            pts = [Vector((cx + dd, front, cz)), Vector((cx, front, cz + dd * 1.4)), Vector((cx - dd, front, cz)), Vector((cx, front, cz - dd * 1.4))]
            for i in range(4):
                strip(pts[i], pts[(i + 1) % 4], R * 0.05)
            strip(Vector((x0 + math.cos(a) * R * 0.55, front, zc + math.sin(a) * R * 0.55)), Vector((x0 + math.cos(a) * R, front, zc + math.sin(a) * R)), R * 0.04)
        me = bpy.data.meshes.new('prop_arch_sealed_glow')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('prop_arch_sealed_glow', me)
        bpy.context.scene.collection.objects.link(ob)
        gp.paint(ob, lambda v: RUNE, smooth_shade=False)
        built['glow'] = ob

# ---- the pearl altar ----
parts = sheet('pearl_altar', 12.0)
mn = Vector((min(p['min'].x for p in parts), min(p['min'].y for p in parts), min(p['min'].z for p in parts)))
mx = Vector((max(p['max'].x for p in parts), max(p['max'].y for p in parts), max(p['max'].z for p in parts)))
current = {'parts': parts, 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn}
big = max(parts, key=lambda p: p['n'] * shape(p)['round'] ** 4)
# Meshy's pearl has holes in it: a clean sphere of its size takes its place
r = sum(big['size']) / 6
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=4, radius=r)
bmesh.ops.translate(bm, verts=bm.verts[:], vec=big['c'])
bm.to_mesh(big['ob'].data)
bm.free()
big.update(gp.part(big['ob']))
z0, z1 = mn.z, mx.z
bands = sorted((p for p in parts if p is not big and 0.3 < (p['c'].z - z0) / (z1 - z0) < 0.6), key=lambda p: -p['n'])[:2]
def panel(p, o):
    def shade(v, conc):
        relief = smooth(0.05, -0.3, conc)  # raised swirls gold, the ground between them teal
        teal = mix(TEAL_DARK, lin('#6fb3a6'), 0.5 + 0.5 * v.normal.dot(VIEW))
        return mix(teal, mix(GOLD, GOLD_LIGHT, 0.4), relief)
    return shade
assigned = []
for p in parts:
    s = shape(p)
    if p is big:
        assigned.append((p, pearl, 'shinesm'))
    elif p in bands:
        assigned.append((p, panel, 'flat'))
    elif s['round'] > 0.6 and s['big'] < 0.08:
        assigned.append((p, pearl, 'shinesm'))
    else:
        assigned.append((p, gold, 'flat'))
build('pearl_altar', assigned, subdiv=lambda p: 2 if p in bands else 0)

# ---- occlusion, then each prop on its own foot in metres ----
gp.bake_ao([ob for kinds in PROPS.values() for k, ob in kinds.items() if k != 'glow'], distance=0.03)
SIZE = {  # metres along the given axis (z: height, x: width)
    'crystal_s': ('z', 0.95), 'crystal_m': ('z', 1.6), 'crystal_l': ('z', 2.5),
    'coral_tree': ('z', 5.6), 'chest': ('x', 1.3), 'chest_open': ('x', 1.3), 'candles': ('z', 0.85), 'barrel': ('z', 1.05),
    'crate': ('x', 0.9), 'post': ('z', 1.4), 'pillar': ('z', 4.4), 'pillar_broken': ('z', 2.6), 'pillar_fallen': ('x', 4.4),
    'arch': ('x', 6.6), 'arch_shell': ('x', 6.6), 'arch_sealed': ('x', 7.0), 'pearl_altar': ('z', 3.4),
}
for name, kinds in PROPS.items():
    obs = list(kinds.values())
    vs = [v.co for ob in obs for v in ob.data.vertices]
    axis, metres = SIZE[name]
    k = 0 if axis == 'x' else 2
    span = max(v[k] for v in vs) - min(v[k] for v in vs)
    gp.stand(obs, metres / span)
    if name == 'pillar_fallen':
        # it lies along the game's depth (its blockers run along z): turn it a quarter
        for ob in obs:
            ob.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
keep = {ob.name for kinds in PROPS.values() for ob in kinds.values()}
print('wrote', OUT, gp.export(OUT, keep))
