"""Shared steps for painting Meshy shapes in Blender (scripts/blender/grotto-props.py).

Meshy's smart-topology shapes come untextured. These helpers split a sheet into its objects, measure
each surface (folds, height, distance along it), paint per-vertex colour from that and bake ambient
occlusion into it, so the game's cel material only has to light them.
"""
import bpy, bmesh, heapq, math
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree


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


def kd_of(points):
    kd = KDTree(max(1, len(points)))
    for i, q in enumerate(points):
        kd.insert(q, i)
    kd.balance()
    return kd


def load(path):
    """The Meshy file added to the scene, split into its loose parts. Returns the new parts."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    src = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in before][0]
    for o in bpy.context.scene.objects:
        o.select_set(o is src)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.context.scene.objects):
        if o not in before and o.type != 'MESH':
            bpy.data.objects.remove(o)  # the importer's empties
    return [part(o) for o in bpy.context.scene.objects if o not in before and o.type == 'MESH' and o.data.vertices]


def part(o):
    vs = [v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return {'ob': o, 'n': len(vs), 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn}


def objects(parts, gap=0.004):
    """Group the loose parts into the sheet's objects: parts whose boxes (grown by `gap`) touch
    belong together."""
    n = len(parts)
    up = list(range(n))

    def find(i):
        while up[i] != i:
            up[i] = up[up[i]]
            i = up[i]
        return i
    for i in range(n):
        a = parts[i]
        for j in range(i + 1, n):
            b = parts[j]
            if all(a['min'][k] - gap < b['max'][k] and b['min'][k] - gap < a['max'][k] for k in range(3)):
                up[find(i)] = find(j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(parts[i])
    out = []
    for g in groups.values():
        mn = Vector((min(p['min'].x for p in g), min(p['min'].y for p in g), min(p['min'].z for p in g)))
        mx = Vector((max(p['max'].x for p in g), max(p['max'].y for p in g), max(p['max'].z for p in g)))
        out.append({'parts': g, 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn, 'n': sum(p['n'] for p in g)})
    return out


def reading_order(objs, rows):
    """Objects sorted top row first, left to right; `rows` splits them by the height of their middle."""
    rows = sorted(rows, reverse=True)
    def row(o):
        return sum(1 for r in rows if o['c'].z < r)
    return sorted(objs, key=lambda o: (row(o), o['c'].x))


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


def concavity(me, rings=4):
    """Per vertex index: + where the surface folds in (a groove, a recess), - on a crest or an edge."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    raw = []
    for v in bm.verts:
        if not v.link_edges:
            raw.append(0.0)
            continue
        avg = sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
        raw.append((avg - v.co).dot(v.normal))
    for _ in range(rings):
        raw = [(raw[v.index] + sum(raw[e.other_vert(v).index] for e in v.link_edges)) / (1 + len(v.link_edges)) for v in bm.verts]
    bm.free()
    s = sorted(abs(x) for x in raw)
    scale = s[int(len(s) * 0.9)] or 1.0
    return [x / scale for x in raw]


def geodesic(me, seed):
    """Distance along the surface from the vertices seed(co) picks, per vertex index (inf: not reached)."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dist = [math.inf] * len(bm.verts)
    heap = []
    for v in bm.verts:
        if seed(v.co):
            dist[v.index] = 0.0
            heap.append((0.0, v.index))
    heapq.heapify(heap)
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
    bm.free()
    return dist


def islands(me):
    """Per vertex index: which connected piece of the mesh it is on; plus each piece's box."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    comp = [-1] * len(bm.verts)
    boxes = []
    for v in bm.verts:
        if comp[v.index] >= 0:
            continue
        k = len(boxes)
        stack, pts = [v], []
        comp[v.index] = k
        while stack:
            x = stack.pop()
            pts.append(x.co.copy())
            for e in x.link_edges:
                y = e.other_vert(x)
                if comp[y.index] < 0:
                    comp[y.index] = k
                    stack.append(y)
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        boxes.append({'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn, 'n': len(pts)})
    bm.free()
    return comp, boxes


def paint(ob, shade, smooth_shade=True):
    """shade(vertex) -> linear colour, per vertex."""
    me = ob.data
    for poly in me.polygons:
        poly.use_smooth = smooth_shade
    if 'Col' in me.color_attributes:
        me.color_attributes.remove(me.color_attributes['Col'])
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        layer.data[v.index].color = (*shade(v), 1.0)
    me.color_attributes.active_color = layer


def bake_ao(objs, distance, floor=0.45, samples=48):
    """Ambient occlusion (Cycles) multiplied into each object's colours: `floor` is the darkest."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    if not scene.world:
        scene.world = bpy.data.worlds.new('paint')
    scene.world.light_settings.distance = distance
    mat = bpy.data.materials.get('paint') or bpy.data.materials.new('paint')
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
            c, f = col.data[i].color, floor + (1 - floor) * ao.data[i].color[0]
            col.data[i].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)
        me.color_attributes.remove(me.color_attributes['ao'])
        me.color_attributes.active_color = me.color_attributes['Col']


def split_faces(ob, keep, name):
    """Faces whose corners keep(vertex index) mostly picks move to their own object, returned (or None)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for f in bm.faces:
        f.select = sum(1 for v in f.verts if keep(v.index)) * 2 > len(f.verts)
    any_sel = any(f.select for f in bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    if not any_sel:
        return None
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o is not ob]
    if not new:
        return None
    new[0].name = new[0].data.name = name
    return new[0]


def stand(objs, scale, foot=None):
    """Move objs so the foot (default: the middle of their lowest point's box) is the origin, scaled to metres."""
    vs = [v.co for o in objs for v in o.data.vertices]
    if foot is None:
        foot = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
    m = Matrix.Scale(scale, 4) @ Matrix.Translation(-foot)
    for o in objs:
        o.data.transform(m)
        o.location = (0, 0, 0)


def export(path, keep_names):
    for o in list(bpy.context.scene.objects):
        if o.name not in keep_names:
            bpy.data.objects.remove(o)
    for o in bpy.context.scene.objects:
        o.data.materials.clear()
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_vertex_color='ACTIVE', export_apply=True,
                              export_yup=True, export_normals=False, export_materials='NONE')
    return {o.name: len(o.data.polygons) for o in bpy.context.scene.objects}
