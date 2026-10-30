"""The six glowing corals of the grotto: Meshy's shapes, painted here.

Run headless:  blender -b --python scripts/blender/grotto-corals.py
Reads assets/meshy/grotto/glow_corals_meshy.glb (Meshy image-to-3D, smart topology, no texture,
made in one go from the owner's sheet docs/reference/glow-corals.png) and writes
public/models/grotto/glow-corals.glb: for each coral of the sheet two objects the game asks for by
name (src/render/grotto/corals.js):
  coral_<name>_body  the coral, cel-lit, its colour painted per vertex with baked occlusion
  coral_<name>_glow  what glows on it: the bulbs at the branch tips and the specks along it
<name> is purple, blue, teal (the three trees of the top row), tubes, bubbles, pink (bottom row).
Each coral stands on its own origin (the middle of its foot), in metres, its face toward -Y here
(+Z in the game). The sheet's sizes are kept: the purple tree is the tallest.
Meshy left a few tip bulbs floating off their branches; they are moved back onto them.
"""
import bpy, bmesh, heapq, math, os, random
from mathutils import Matrix, Vector, noise
from mathutils.kdtree import KDTree

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'meshy', 'grotto', 'glow_corals_meshy.glb')
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'glow-corals.glb')
K = 7.0  # Meshy units to metres: the purple tree stands about 3 m

bpy.ops.wm.read_factory_settings(use_empty=True)
noise.seed_set(9)
rng = random.Random(9)
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


CORE = lin('#ffffff')
VIEW = Vector((0, -0.55, 0.83))  # toward the game camera: in front (-Y) and above
# the sheet's colours: foot, body, crown (the trees lighten upward), bulb, speck
LOOK = {
    'purple': dict(foot='#4a2a9c', body='#7446d0', crown='#a565e8', bulb='#ff9cf2', speck='#6cb8ff', specks=90, bulbsize=1.0),
    'blue': dict(foot='#1c4aa8', body='#2d6fdc', crown='#3fa4f0', bulb='#8ef2ff', speck='#86ecff', specks=70, bulbsize=1.0),
    'teal': dict(foot='#1d7a7c', body='#2fa9a4', crown='#5fd2c4', bulb='#b0fff0', speck='#9ff8ec', specks=40, bulbsize=0.8),
    'pink': dict(foot='#8f3488', body='#cc5cba', crown='#ef8ad6', bulb='#ffc4f0', speck='#ffd0f4', specks=30, bulbsize=0.55),
    'tubes': dict(foot='#2f3594', body='#4a55c8', crown='#6472e0', rim='#b8a8f2', inside='#262470', speck='#62bcff', specks=150),
    'bubbles': dict(foot='#4a2a78', body='#8a50bc', crown='#b47ad8', speck='#7ff0ff', specks=0),
}


def centre(o):
    vs = [v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return (mn + mx) / 2, mx - mn


# ---- which loose part belongs to which coral (the sheet: three trees above, three below) ----
parts = []
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        c, size = centre(o)
        parts.append({'ob': o, 'n': len(o.data.vertices), 'c': c, 'size': size})
trees = sorted([p for p in parts if p['n'] >= 150 and p['c'].z > -0.12], key=lambda p: p['c'].x)
pink = [p for p in parts if p['n'] >= 150 and p['c'].z <= -0.12][0]
heads = dict(zip(('purple', 'blue', 'teal'), trees))
coral = {k: [v] for k, v in heads.items()}
coral.update(tubes=[], bubbles=[], pink=[pink])


def gap(p, q):
    """The smallest distance from part p's centre to part q's surface."""
    return min((v.co - p['c']).length for v in q['ob'].data.vertices)


for p in parts:
    if p in trees or p is pink:
        continue
    if p['c'].z > -0.12:
        # a bulb above: it belongs to the nearest tree, and goes back onto the branch it left
        name = min(heads, key=lambda k: gap(p, heads[k]))
        tree = heads[name]
        r = max(p['size']) / 2
        near = min((v.co for v in tree['ob'].data.vertices), key=lambda q: (q - p['c']).length)
        d = p['c'] - near
        if d.length > r * 0.6:
            shift = d.normalized() * (r * 0.6) - d
            p['ob'].data.transform(Matrix.Translation(shift))
            p['c'] = p['c'] + shift
        coral[name].append(p)
    else:
        coral['tubes' if p['c'].x < -0.12 else 'bubbles' if p['c'].x < 0.27 else 'pink'].append(p)
print({k: len(v) for k, v in coral.items()})


def modify(ob, kind, **kw):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(m, k, v)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def join(obs, name):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def geodesic(bm, seeds):
    """Distance along the surface from the seed vertices, per vertex index."""
    dist = [math.inf] * len(bm.verts)
    heap = []
    for v in seeds:
        dist[v.index] = 0.0
        heap.append((0.0, v.index))
    heapq.heapify(heap)
    bm.verts.ensure_lookup_table()
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        v = bm.verts[i]
        for e in v.link_edges:
            w = e.other_vert(v)
            nd = d + e.calc_length()
            if nd < dist[w.index]:
                dist[w.index] = nd
                heapq.heappush(heap, (nd, w.index))
    return dist


def kd_of(points):
    kd = KDTree(max(1, len(points)))
    for i, q in enumerate(points):
        kd.insert(q, i)
    kd.balance()
    return kd


def tip_weight(ob, size=1.0):
    """Per vertex 0..1: how much it is a tip bulb. A tip is a vertex farthest along the surface from
    the foot in its neighbourhood; its bulb is what lies within a bulb's size of it, back toward the foot.
    The bulbs Meshy made as separate balls are wholly bulb."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    zmin = min(v.co.z for v in bm.verts)
    g = geodesic(bm, [v for v in bm.verts if v.co.z < zmin + 0.006])
    reach = [x for x in g if x < math.inf]
    gmax = max(reach)
    kd = kd_of([v.co for v in bm.verts])
    tips = []
    for v in bm.verts:
        gv = g[v.index]
        if gv == math.inf or gv < 0.4 * gmax:
            continue
        if all(g[j] <= gv for (_, j, _) in kd.find_range(v.co, 0.03)):
            tips.append((v.co.copy(), gv))
    tk = kd_of([t[0] for t in tips])
    w = []
    for v in bm.verts:
        if g[v.index] == math.inf:
            w.append(1.0)  # a separate ball (a bulb Meshy did not join on)
            continue
        best = 0.0
        for (_, j, d) in tk.find_range(v.co, 0.05 * size):
            gt = tips[j][1]
            best = max(best, smooth(0.045 * size, 0.03 * size, d) * smooth(gt - 0.05 * size, gt - 0.032 * size, g[v.index]))
        w.append(best)
    bm.free()
    return w, tips


def paint(ob, shade):
    me = ob.data
    for poly in me.polygons:
        poly.use_smooth = True
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        layer.data[v.index].color = (*shade(v), 1.0)
    me.color_attributes.active_color = layer


def bake_ao(objs):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    if not scene.world:
        scene.world = bpy.data.worlds.new('corals')
    scene.world.light_settings.distance = 0.06
    mat = bpy.data.materials.get('coral') or bpy.data.materials.new('coral')
    mat.use_nodes = True
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
    for o in objs:
        me = o.data
        col = me.color_attributes['Col']
        ao = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ao
        for q in bpy.context.scene.objects:
            q.select_set(q == o)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for i in range(len(col.data)):
            c, f = col.data[i].color, 0.5 + 0.5 * ao.data[i].color[0]
            col.data[i].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)
        me.color_attributes.remove(me.color_attributes['ao'])
        me.color_attributes.active_color = me.color_attributes['Col']


def surface_points(ob, n, keep):
    """n seeded points spread over the surface by area, where keep(point, normal) allows."""
    me = ob.data
    me.calc_loop_triangles()
    tris = [(t, t.area) for t in me.loop_triangles]
    total = sum(a for _, a in tris)
    out, tries = [], 0
    while len(out) < n and tries < n * 60:
        tries += 1
        x, acc = rng.random() * total, 0.0
        for t, a in tris:
            acc += a
            if acc >= x:
                break
        a, b, c = (me.vertices[i].co for i in t.vertices)
        u, v = rng.random(), rng.random()
        if u + v > 1:
            u, v = 1 - u, 1 - v
        p = a + (b - a) * u + (c - a) * v
        if keep(p, t.normal):
            out.append((p, t.normal.copy()))
    return out


def specks(points, size, colour):
    """Small glowing dots (octahedra) half sunk into the surface, one mesh."""
    bm = bmesh.new()
    layer = bm.verts.layers.float_color.new('Col')
    for p, nrm in points:
        r = size * (0.7 + 0.6 * rng.random())
        ring = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in ring['verts']:
            v.co += p + nrm * (r * 0.25)
            v[layer] = (*colour, 1.0)
    me = bpy.data.meshes.new('specks')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('specks', me)
    bpy.context.scene.collection.objects.link(ob)
    for poly in me.polygons:
        poly.use_smooth = True
    me.color_attributes.active_color = me.color_attributes['Col']
    return ob


def split_glow(ob, weight, name):
    """The faces whose corners are mostly bulb go to their own object."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    sel = [f for f in bm.faces if sum(weight[v.index] for v in f.verts) / len(f.verts) > 0.5]
    for f in bm.faces:
        f.select = f in sel
    bm.to_mesh(ob.data)
    bm.free()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    glow = [o for o in bpy.context.selected_objects if o is not ob]
    if glow:
        glow[0].name = glow[0].data.name = name
        return glow[0]
    return None


bodies, glows = {}, {}
for name, members in coral.items():
    look = {k: (lin(v) if isinstance(v, str) else v) for k, v in LOOK[name].items()}
    ob = join([m['ob'] for m in members], f'coral_{name}_body')
    modify(ob, 'SUBSURF', levels=1, render_levels=1)
    me = ob.data
    zmin = min(v.co.z for v in me.vertices)
    zmax = max(v.co.z for v in me.vertices)
    hgt = zmax - zmin
    up = lambda co: (co.z - zmin) / hgt
    glow_parts = []
    if name in ('purple', 'blue', 'teal', 'pink'):
        w, tips = tip_weight(ob, look['bulbsize'])
        print(name, 'tips', len(tips))
        bulb, crown = look['bulb'], look['crown']

        def shade(v, w=w):
            t = up(v.co)
            body = mix(mix(look['foot'], look['body'], smooth(0.0, 0.35, t)), crown, smooth(0.45, 1.0, t))
            if w[v.index] < 0.5:
                # the bulb's colour comes up the branch a little before the bulb itself
                return mix(body, mix(crown, bulb, 0.5), 0.6 * smooth(0.1, 0.5, w[v.index]))
            # a hot white core on the side the game camera sees
            return mix(bulb, CORE, 0.5 * smooth(0.55, 1.0, v.normal.dot(VIEW)))
        paint(ob, shade)
        bake_ao([ob])
        g = split_glow(ob, w, f'coral_{name}_glow')
        if g:
            glow_parts.append(g)
        n_specks = look['specks']
        pts = surface_points(ob, n_specks, lambda p, nrm: 0.08 < up(p) < 0.92 and nrm.y < 0.35)
        glow_parts.append(specks(pts, 0.0035, look['speck']))
    elif name == 'tubes':
        # each tube is one part: its axis by its bounds, its mouth at the top
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        # loose pieces of the joined mesh, each with its own axis (lowest-to-highest ring centres)
        seen, comp_of, comps = set(), {}, []
        for v in bm.verts:
            if v.index in seen:
                continue
            stack, c = [v], []
            seen.add(v.index)
            while stack:
                x = stack.pop()
                c.append(x)
                for e in x.link_edges:
                    y = e.other_vert(x)
                    if y.index not in seen:
                        seen.add(y.index)
                        stack.append(y)
            k = len(comps)
            for x in c:
                comp_of[x.index] = k
            zs = sorted(x.co.z for x in c)
            lo, hi = zs[0], zs[-1]
            bot = [x.co for x in c if x.co.z < lo + (hi - lo) * 0.2]
            top = [x.co for x in c if x.co.z > hi - (hi - lo) * 0.2]
            a = sum(bot, Vector()) / len(bot)
            b = sum(top, Vector()) / len(top)
            comps.append({'a': a, 'axis': (b - a).normalized(), 'len': (b - a).length, 'hi': hi})
        info = []
        for v in bm.verts:
            cp = comps[comp_of[v.index]]
            rel = v.co - cp['a']
            along = rel.dot(cp['axis'])
            radial = rel - cp['axis'] * along
            inside = radial.length > 1e-6 and v.normal.dot(radial.normalized()) < -0.2
            info.append((along / max(1e-6, cp['len']), inside, cp))
        bm.free()

        def shade(v):
            t, inside, cp = info[v.index]
            if inside:
                return mix(look['inside'], look['rim'], smooth(0.8, 1.0, t) * 0.5)
            body = mix(mix(look['foot'], look['body'], smooth(0.0, 0.4, t)), look['crown'], smooth(0.5, 1.0, t))
            return mix(body, look['rim'], smooth(0.9, 0.98, t))
        paint(ob, shade)
        bake_ao([ob])
        pts = surface_points(ob, look['specks'], lambda p, nrm: nrm.y < 0.4 and nrm.z < 0.85)
        glow_parts.append(specks(pts, 0.003, look['speck']))
    else:  # bubbles: each ball covered in small round cells, a cyan dot in each, lighter on top
        modify(ob, 'SUBSURF', levels=1, render_levels=1)  # one more: the cells need the vertices
        balls = []
        for m in members:
            n = 16
            dirs = []
            for i in range(n):
                # an even spread over the ball (a Fibonacci sphere), each cell nudged off the grid
                zz = 1 - 2 * (i + 0.5) / n
                a = i * 2.39996 + rng.uniform(-0.3, 0.3)
                rr = math.sqrt(1 - zz * zz)
                dirs.append(Vector((rr * math.cos(a), rr * math.sin(a), zz)).normalized())
            balls.append({'c': m['c'], 'r': max(m['size']) / 2, 'cells': dirs})
        ck = kd_of([b['c'] for b in balls])

        def shade(v):
            ball = balls[ck.find(v.co)[1]]
            n = (v.co - ball['c']).normalized()
            near = max(n.dot(d) for d in ball['cells'])
            edge = smooth(0.06, 0.2, 1 - near)  # a round cell: its own colour in the middle, dark around it
            lit = smooth(-0.5, 0.9, n.z * 0.75 - n.y * 0.35)
            cell = mix(look['body'], look['crown'], lit)
            return mix(cell, look['foot'], 0.75 * edge)
        paint(ob, shade)
        bake_ao([ob])
        pts = []
        for ball in balls:
            for d in ball['cells']:
                if d.dot(VIEW) < -0.3:
                    continue  # nobody sees under a ball
                hit, at, nrm, _ = ob.ray_cast(ball['c'] + d * ball['r'] * 2, -d)
                if hit and (at - ball['c']).length < ball['r'] * 1.3:
                    pts.append((at, nrm))
        glow_parts.append(specks(pts, 0.0028, look['speck']))
    bodies[name] = ob
    glows[name] = join(glow_parts, f'coral_{name}_glow')

# ---- each coral on its own origin, in metres ----
for name in coral:
    b, g = bodies[name], glows[name]
    vs = [v.co for v in b.data.vertices]
    foot = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
    m = Matrix.Scale(K, 4) @ Matrix.Translation(-foot)
    for o in (b, g):
        o.data.transform(m)
        o.location = (0, 0, 0)

keep = {o.name for o in list(bodies.values()) + list(glows.values())}
for o in list(bpy.context.scene.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o)
for o in bpy.context.scene.objects:
    o.data.materials.clear()
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_apply=True, export_yup=True, export_normals=False, export_materials='NONE')
print('wrote', OUT, {o.name: len(o.data.polygons) for o in bpy.context.scene.objects})
