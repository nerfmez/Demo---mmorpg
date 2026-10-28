"""Pearlshell Grotto kit: the modelled pieces the dungeon is built from, made in Blender.

Run headless:  blender -b --python scripts/blender/grotto-kit.py
Writes public/models/grotto/grotto-kit.glb: every piece is its own object at the origin, named
as the renderer asks for it (src/render/grotto/kit.js). Shading is baked into vertex colours
(light from above, darker cavities, lighter worn edges) so the game's cel materials only tint it.

Pieces (metres, +Y up in Blender becomes +Y up in the glTF):
  rock_0..rock_5   angular basalt chunks, about 1 m, for the cave rim
  wall_0..wall_2   columnar rock wall sections for the back of a cave (about 3 m wide, 4-5 m tall)
  tile_0..tile_3   worn paving slabs (0.9 m), chipped corners, for dungeon floors
  pebble_0..3      loose rubble
  gate             a carved stone archway (opening 2.6 m wide, 4.4 m tall to the keystone)
  chest, crate, post
"""
import bpy, bmesh, math, random, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'grotto', 'grotto-kit.glb')
rng = random.Random(1709)

bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}


def material(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
        MATS[name] = m
    return MATS[name]


def new_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material(mat))
    return ob


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(ob, base, top, dark, edge=0.18, jitter=0.08, seed=0):
    """Bake light into vertex colours: lit from above, cavities darker, convex edges lighter.
    Colours are given as display (sRGB) values and stored linear (FLOAT_COLOR), as glTF wants."""
    me = ob.data
    r = random.Random(seed)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    convex = {}
    for v in bm.verts:
        if not v.link_edges:
            convex[v.index] = 0
            continue
        avg = Vector((0, 0, 0))
        for e in v.link_edges:
            avg += e.other_vert(v).co
        avg /= len(v.link_edges)
        convex[v.index] = max(-1, min(1, (v.co - avg).dot(v.normal) * 3))
    face_tint = {f.index: 1 + r.uniform(-jitter, jitter) for f in bm.faces}
    bm.free()
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        up = max(0.0, poly.normal.z)
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            c = lerp(base, top, up ** 1.5)
            cv = convex[vi]
            c = lerp(c, dark, max(0, -cv) * 0.8) if cv < 0 else tuple(min(1, x + cv * edge) for x in c)
            k = face_tint[poly.index]
            layer.data[li].color = tuple(min(1, x * k) ** 2.2 for x in c) + (1,)
    me.color_attributes.active_color = layer


def hull(points):
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    return bm


def bevel(bm, width, segments=1):
    bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=width, segments=segments, affect='EDGES', profile=0.5)


def box(bm, cx, cy, cz, sx, sy, sz, rot=0.0):
    res = bmesh.ops.create_cube(bm, size=1)
    vs = res['verts']
    for v in vs:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
        x, y = v.co.x, v.co.y
        v.co.x = x * math.cos(rot) - y * math.sin(rot)
        v.co.y = x * math.sin(rot) + y * math.cos(rot)
        v.co += Vector((cx, cy, cz))
    return vs


# ---------------- rocks: blocky stacked stones ----------------
ROCK = ((0.27, 0.26, 0.25), (0.55, 0.52, 0.48), (0.10, 0.095, 0.09))
for i in range(6):
    # points from a squashed box, not a sphere: flat faces and hard edges like split stone
    sx, sy, sz = rng.uniform(0.8, 1.2), rng.uniform(0.6, 1.0), rng.uniform(0.55, 1.0)
    pts = []
    for cx in (-1, 1):
        for cy in (-1, 1):
            for cz in (-1, 1):
                pts.append(Vector((cx * sx * rng.uniform(0.35, 0.5), cy * sy * rng.uniform(0.35, 0.5), cz * sz * rng.uniform(0.35, 0.5) + 0.1)))
    for _ in range(4):  # a few knocked-off corners
        pts.append(Vector((rng.uniform(-0.45, 0.45) * sx, rng.uniform(-0.45, 0.45) * sy, rng.uniform(0.3, 0.55) * sz + 0.1)))
    bm = hull(pts)
    bevel(bm, 0.03)
    ob = new_object(f'rock_{i}', bm, 'rock')
    shade(ob, *ROCK, edge=0.1, jitter=0.12, seed=i)

# ---------------- cave wall: a broken rock face of fused columns ----------------
for i in range(3):
    bm = bmesh.new()
    n = rng.randint(5, 6)
    width = 3.2
    for k in range(n):
        x = (k - (n - 1) / 2) * (width / n) + rng.uniform(-0.1, 0.1)
        y = rng.uniform(-0.3, 0.15)
        h = rng.uniform(2.6, 4.2)
        r = rng.uniform(0.42, 0.6)
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=5, radius1=r * 1.25, radius2=r * 0.85, depth=h)
        lean = rng.uniform(-0.05, 0.05)
        rot = rng.uniform(0, math.pi)
        for v in res['verts']:
            x0, y0 = v.co.x, v.co.y
            v.co.x = x0 * math.cos(rot) - y0 * math.sin(rot)
            v.co.y = x0 * math.sin(rot) + y0 * math.cos(rot)
            v.co.z += h / 2
            v.co.x += x + v.co.z * lean
            v.co.y += y
            if v.co.z > h - 0.01:
                v.co.z -= rng.uniform(0, 0.5)
    # a backing slab so no gap shows between the columns
    box(bm, 0, 0.45, 1.5, width + 0.4, 0.6, 3.0)
    bevel(bm, 0.035)
    ob = new_object(f'wall_{i}', bm, 'rock')
    shade(ob, (0.27, 0.25, 0.23), (0.46, 0.43, 0.39), (0.08, 0.075, 0.07), edge=0.08, jitter=0.1, seed=20 + i)

# ---------------- paving slabs: worn, chipped ----------------
for i in range(4):
    bm = bmesh.new()
    # three 1x1 slabs and one long 2x1 slab (laid over two cells)
    w, d = (0.9, 0.9) if i < 3 else (1.82, 0.9)
    box(bm, 0, 0, -0.07, w * rng.uniform(0.96, 0.99), d * rng.uniform(0.96, 0.99), 0.14)
    bevel(bm, 0.04, 2)
    ob = new_object(f'tile_{i}', bm, 'stone')
    # flat worn tops (the placement tilts and tints each slab); the rounded edges catch less light
    shade(ob, (0.42, 0.39, 0.35), (0.66, 0.62, 0.56), (0.30, 0.27, 0.23), edge=0.04, jitter=0.03, seed=40 + i)

# ---------------- pebbles ----------------
for i in range(4):
    pts = [Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 0.8))).normalized() * 0.5 for _ in range(9)]
    bm = hull(pts)
    s = rng.uniform(0.12, 0.22)
    for v in bm.verts:
        v.co *= s
        v.co.z += s * 0.25
    ob = new_object(f'pebble_{i}', bm, 'rock')
    shade(ob, (0.36, 0.34, 0.31), (0.58, 0.55, 0.50), (0.12, 0.11, 0.10), edge=0.2, seed=60 + i)

# ---------------- the carved gate ----------------
STONE = ((0.56, 0.52, 0.47), (0.74, 0.70, 0.63), (0.22, 0.20, 0.17))
bm = bmesh.new()
half, h = 1.3, 2.9  # half the opening; the springing height of the arch
for side in (-1, 1):
    x = side * (half + 0.36)
    box(bm, x, 0, 0.22, 1.05, 1.05, 0.44)               # plinth
    box(bm, x, 0, 0.44 + (h - 0.44) / 2, 0.72, 0.72, h - 0.44)  # shaft
    box(bm, x, 0, h + 0.14, 0.96, 0.92, 0.28)            # capital
    for k in range(3):                                    # carved bands down the shaft
        box(bm, x, 0, 1.0 + k * 0.62, 0.78, 0.78, 0.08)
# voussoirs: the arch in nine stones and a keystone
R0, R1 = half + 0.02, half + 0.62
n = 9
for k in range(n):
    a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
    gap = 0.012
    a0 += gap; a1 -= gap
    pts = []
    for a in (a0, a1):
        for r in (R0, R1):
            for y in (-0.42, 0.42):
                pts.append(Vector((math.cos(a) * r, y, h + 0.28 + math.sin(a) * r)))
    if k == n // 2:  # the keystone stands proud
        for p in pts:
            p.y *= 1.15
            if math.hypot(p.x, p.z - h - 0.28) > R0 + 0.3:
                p.z += 0.18
    sub = hull(pts)
    tmp = bpy.data.meshes.new('tmp')
    sub.to_mesh(tmp)
    sub.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
box(bm, 0, 0, h + 0.28 + R1 + 0.16, 2 * (half + 0.9), 0.95, 0.32)  # lintel cornice above
box(bm, 0, 0, 0.05, 2 * half + 0.2, 1.0, 0.1)                       # threshold
bevel(bm, 0.03)
ob = new_object('gate', bm, 'stone')
shade(ob, *STONE, edge=0.2, jitter=0.07, seed=80)

# ---------------- chest ----------------
bm = bmesh.new()
box(bm, 0, 0, 0.3, 1.0, 0.64, 0.6)
bevel(bm, 0.03)
ob = new_object('chest_body', bm, 'wood')
shade(ob, (0.42, 0.26, 0.15), (0.58, 0.38, 0.22), (0.16, 0.09, 0.05), edge=0.15, seed=90)
bm = bmesh.new()
res = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.32, radius2=0.32, depth=1.0)
for v in res['verts']:
    x, y, z = v.co.x, v.co.y, v.co.z
    v.co = Vector((z, y, x))  # lay the cylinder along x
    v.co.z = max(v.co.z, 0) + 0.6
bevel(bm, 0.02)
ob = new_object('chest_lid', bm, 'wood')
shade(ob, (0.44, 0.27, 0.15), (0.62, 0.41, 0.24), (0.16, 0.09, 0.05), edge=0.15, seed=91)
bm = bmesh.new()
for x in (-0.36, 0.36):
    box(bm, x, 0, 0.47, 0.1, 0.68, 0.98)
box(bm, 0, 0.33, 0.55, 0.16, 0.05, 0.2)  # lock plate
ob = new_object('chest_metal', bm, 'metal')
shade(ob, (0.36, 0.30, 0.20), (0.75, 0.62, 0.36), (0.12, 0.10, 0.07), edge=0.3, seed=92)

# ---------------- crate ----------------
bm = bmesh.new()
for z in (0.1, 0.34, 0.58):
    for side in (-1, 1):
        box(bm, 0, side * 0.36, z, 0.8, 0.07, 0.2)
        box(bm, side * 0.36, 0, z, 0.07, 0.76, 0.2)
box(bm, 0, 0, 0.66, 0.8, 0.8, 0.06)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(bm, sx * 0.37, sy * 0.37, 0.35, 0.1, 0.1, 0.72)
bevel(bm, 0.012)
ob = new_object('crate', bm, 'wood')
shade(ob, (0.46, 0.33, 0.20), (0.62, 0.47, 0.30), (0.18, 0.12, 0.07), edge=0.18, jitter=0.12, seed=95)

# ---------------- short stone post ----------------
bm = bmesh.new()
box(bm, 0, 0, 0.12, 0.6, 0.6, 0.24)
box(bm, 0, 0, 0.24 + 0.5, 0.42, 0.42, 1.0)
box(bm, 0, 0, 1.3, 0.54, 0.54, 0.18)
for v in bm.verts:
    if v.co.z > 1.35 and rng.random() < 0.5:
        v.co.z -= rng.uniform(0.04, 0.12)
bevel(bm, 0.025)
ob = new_object('post', bm, 'stone')
shade(ob, *STONE, edge=0.2, seed=97)

# ---------------- coral: a bushy staghorn and a branching fan ----------------
def coral(name, seed, fan):
    r = random.Random(seed)
    bm = bmesh.new()
    def branch(p, d, length, rad, depth):
        q = p + d * length
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=rad, radius2=rad * 0.72, depth=length)
        up = Vector((0, 0, 1))
        rot = up.rotation_difference(d).to_matrix().to_4x4()
        for v in res['verts']:
            v.co.z += length / 2
            v.co = rot @ v.co
            v.co += p
        if depth == 0:
            tip = bmesh.ops.create_uvsphere(bm, u_segments=5, v_segments=3, radius=rad * 1.25)
            for v in tip['verts']:
                v.co += q
            return
        kids = 3 if depth > 1 else 2
        for k in range(kids):
            if fan:
                # stays in one plane (x-z), spreading sideways
                a = (k / (kids - 1) - 0.5) * 1.3 + r.uniform(-0.2, 0.2) if kids > 1 else 0
                nd = Vector((math.sin(a) + d.x * 0.6, r.uniform(-0.08, 0.08), math.cos(a) * 0.8 + d.z * 0.6)).normalized()
            else:
                a = k * 2.1 + r.uniform(-0.6, 0.6)
                spread = r.uniform(0.35, 0.7)
                nd = (d + Vector((math.cos(a) * spread, math.sin(a) * spread, r.uniform(0.1, 0.4)))).normalized()
            branch(q, nd, length * r.uniform(0.62, 0.8), rad * 0.72, depth - 1)
    stems = 3 if not fan else 2
    for k in range(stems):
        a = k * 2.3 + r.uniform(-0.4, 0.4)
        d0 = Vector((math.cos(a) * 0.25, math.sin(a) * 0.25 * (0.2 if fan else 1), 1)).normalized()
        branch(Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0)), d0, r.uniform(0.32, 0.4), 0.075, 4)
    ob = new_object(name, bm, 'coral')
    # pale tips, deeper colour toward the base (the material supplies the hue)
    me = ob.data
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    zmax = max(v.co.z for v in me.vertices) or 1
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = max(0.0, me.vertices[me.loops[li].vertex_index].co.z / zmax)
            c = 0.45 + 0.55 * z ** 1.4
            layer.data[li].color = (c, c, c, 1)
    me.color_attributes.active_color = layer

coral('coral_bush', 301, False)
coral('coral_fan', 302, True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
# Blender is Z-up; glTF export converts to Y-up
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_apply=True, export_yup=True)
print('wrote', os.path.normpath(OUT), sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'faces')
