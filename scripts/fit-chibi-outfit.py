# Fit an AI-generated dressed chibi (Meshy, T-pose) onto the game's chibi body and export its
# garments as GLBs skinned to the chibi armature (docs/OUTFIT-BASE.md, "Modelled outfits").
#   pip install --target <dir> bpy   # Blender as a Python module
#   PYTHONPATH=<dir> python3 scripts/fit-chibi-outfit.py -- assets/meshy/outfits/travel.json
# Run from the repository root. Steps: cut the neck, sleeves and boot tops with planes; warp the
# generated body's landmarks (crotch, arm axis, neck, leg centre lines) onto the chibi's; push the
# cloth out of the chibi body (flattened as the game flattens it) and spread the push over the
# surface; take the body's skin weights at the nearest body point; record the body triangles each
# piece covers (node extras `hideBody`, hidden in game); export the armour and the boots.
# Blender space: Z up, front is -Y (glTF +Z).
import bpy, bmesh, json, sys, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

C = json.load(open(sys.argv[-1]))
CHIBI = C.get('chibi', 'public/models/hero_chibi.glb')
ARM_AXIS = 0.838  # the generated chibi's arm axis height (m) that its landmarks (torsoZ, armAxis) are given for
CHIBI_TIP = 0.513  # the chibi's fingertips out from its middle in the T-pose (m)
FLATTEN = json.load(open('data/models.json'))['characters']['hero_chibi'].get('flatten', [])
bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=p)
    return [o for o in bpy.data.objects if o not in before]


ch = imp(CHIBI)
arm = [o for o in ch if o.type == 'ARMATURE'][0]
body = [o for o in ch if o.type == 'MESH' and o.vertex_groups][0]
for o in ch:
    if o not in (arm, body): bpy.data.objects.remove(o)
bm_world = body.matrix_world.copy()
BV = np.array([tuple(bm_world @ v.co) for v in body.data.vertices])
G = [g.name for g in body.vertex_groups]
BW = np.zeros((len(BV), len(G)))
for v in body.data.vertices:
    for e in v.groups: BW[v.index, e.group] = e.weight
body.data.calc_loop_triangles()
BT = np.array([tuple(t.vertices) for t in body.data.loop_triangles])

# the game flattens the chibi's bust and hips at load (chibi-body.js flattenBody); do the same so
# the garments sit on the body the game draws (three y = Z, three z = -Y)
armg = [i for i, n in enumerate(G) if any(k in n for k in ('Shoulder', 'Arm', 'Hand'))]
for f in FLATTEN:
    y0, y1, z, k = f['y0'], f['y1'], f['z'], f['k']
    w = 1 - BW[:, armg].sum(1)
    tz = -BV[:, 1]
    m = (w > 0) & (BV[:, 2] > y0) & (BV[:, 2] < y1) & ((tz > z) if z > 0 else (tz < z))
    s = np.sin(np.pi * (BV[m, 2] - y0) / (y1 - y0))
    tz[m] = z + (tz[m] - z) * (1 - k * w[m] * s)
    BV[:, 1] = -tz
body_bvh = BVHTree.FromPolygons([Vector(v) for v in BV], [tuple(t) for t in BT])

# --- the generated character, in the chibi's metres
gen = [o for o in imp(C['src']) if o.type == 'MESH'][0]
gen.data.transform(gen.matrix_world)
if 'scale' not in C:
    # Meshy fits the whole model (helm, horns, hood) to a unit box, so size it by the body: the feet
    # on the ground and the arm axis (the T-pose forearm's middle, out at 85% of the span, past any
    # cape or sleeve hanging from the arm) at ARM_AXIS
    R = np.array([tuple(v.co) for v in gen.data.vertices])
    band = R[np.abs(np.abs(R[:, 0]) - 0.85 * np.abs(R[:, 0]).max()) < 0.02]
    za = (band[:, 2].min() + band[:, 2].max()) / 2
    C['scale'] = ARM_AXIS / (za - R[:, 2].min())
    C['lift'] = -R[:, 2].min() * C['scale']
    print('scale %.4f lift %.4f' % (C['scale'], C['lift']))
    C.setdefault('armX', [[0.12, 0.12], [float(np.abs(R[:, 0]).max() * C['scale']), CHIBI_TIP]])
gen.data.transform(Matrix.Translation((0, 0, C['lift'])) @ Matrix.Scale(C['scale'], 4))
gen.matrix_world = Matrix.Identity(4)
img = [n for n in gen.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image

bm = bmesh.new()
bm.from_mesh(gen.data)
uvl = bm.loops.layers.uv.active
# glTF splits vertices at UV seams; weld them so the surface moves as one piece (UVs stay per loop)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)


def cut(co, no):
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)


cut((0, 0, C['neck']), (0, 0, 1))
cut((C['cuff'], 0, 0), (1, 0, 0))
cut((-C['cuff'], 0, 0), (1, 0, 0))
cut((0, 0, C['bootTop']), (0, 0, 1))
bmesh.ops.triangulate(bm, faces=bm.faces[:])
drop = []
for f in bm.faces:
    c = f.calc_center_median()
    if abs(c.x) > C['cuff'] or (c.z > C['neck'] and abs(c.x) < C.get('neckHalf', 0.16)) or c.z > C.get('top', C['neck'] + 0.03):
        drop.append(f)
bmesh.ops.delete(bm, geom=drop, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.verts.index_update()
src = bm.verts.layers.int.new('src')  # each vertex's index here, kept through the per-piece copies
for v in bm.verts: v[src] = v.index
P0 = np.array([tuple(v.co) for v in bm.verts])


# --- warp: landmark heights, leg centre lines and arm axis of the generated body onto the chibi's
def seg_points(P, F, ax, c):
    d = P[F][:, :, ax] - c
    cross = (d.min(1) < 0) & (d.max(1) > 0)
    out = []
    for t, dd in zip(P[F[cross]], d[cross]):
        for i, j in ((0, 1), (1, 2), (2, 0)):
            if (dd[i] < 0) != (dd[j] < 0):
                k = dd[i] / (dd[i] - dd[j]); out.append(t[i] + k * (t[j] - t[i]))
    return np.array(out)


GF = np.array([[v.index for v in f.verts] for f in bm.faces])


def leg_centres(P, F, zs):
    out = []
    for z in zs:
        S = seg_points(P, F, 2, z)
        S = S[S[:, 0] > 0.004] if len(S) else S
        out.append(((S[:, 0].min() + S[:, 0].max()) / 2, (S[:, 1].min() + S[:, 1].max()) / 2) if len(S) else (np.nan, np.nan))
    return np.array(out)


tz = np.array(C['torsoZ'])
crotchG, crotchC = tz[0]
zmapT = lambda z: np.interp(z, tz[:, 0], tz[:, 1], left=None, right=None) + np.where(z > tz[-1, 0], z - tz[-1, 0], 0) + np.where(z < tz[0, 0], (z - tz[0, 0]) * (crotchC / crotchG - 1), 0)
zmapL = lambda z: z * crotchC / crotchG
zs = np.linspace(0.03, crotchG - 0.03, 24)
cg = leg_centres(P0, GF, zs)
cc = leg_centres(BV, BT, zmapL(zs))
ok = ~np.isnan(cg).any(1) & ~np.isnan(cc).any(1)
zs, dcx, dcy = zs[ok], (cc - cg)[ok, 0], (cc - cg)[ok, 1]
gx = np.interp(P0[:, 2], zs, cg[ok, 0])
gy = np.interp(P0[:, 2], zs, cg[ok, 1])


def smooth01(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


x, y, z = P0.T
ax = abs(x); sx = np.sign(x)
# torso
sT = C['torsoScale']
T = np.stack([x * sT, (y - C['torsoY'][0]) * sT + C['torsoY'][1], zmapT(z)], 1)
# legs
sL = C['legScale']
L = np.stack([sx * (gx + np.interp(z, zs, dcx) + (ax - gx) * sL), gy + np.interp(z, zs, dcy) + (y - gy) * sL, zmapL(z)], 1)
# arms: `armX` maps distances out along the arm (from the shoulder to the fingertips), else `armLen` scales them
a0, a1 = C['armAxis']; sA = C['armScale']
if C.get('armX'):
    ArmX = np.array(C['armX'], float)
    armx = lambda d: np.interp(d, ArmX[:, 0], ArmX[:, 1], left=None, right=None) + np.where(d > ArmX[-1, 0], (d - ArmX[-1, 0]) * (ArmX[-1, 1] - ArmX[-2, 1]) / (ArmX[-1, 0] - ArmX[-2, 0]), 0) + np.where(d < ArmX[0, 0], d - ArmX[0, 0], 0)
else:
    armx = lambda d: d * C.get('armLen', 1.0)
A = np.stack([sx * armx(ax), y * sA, a1 + (z - a0) * sA], 1)
wl = smooth01(crotchG + 0.02, crotchG - 0.03, z)[:, None]
wa = (smooth01(0.10, 0.16, ax) * (z > a0 - 0.08))[:, None]
P = T * (1 - wl) + L * wl
P = P * (1 - wa) + A * wa


# --- keep the garment outside the body: push out along the body's normal, then spread the push
#     over the neighbours so the cloth moves as a surface (repeat, then a last strict pass)
nbr = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
piece = np.array([0 if v.co.z < C['bootTop'] else 1 for v in bm.verts])  # 0 boots, 1 armour
margin = np.where(piece == 0, C['margin']['boots'], C['margin']['armor'])


def push(Q):
    D = np.zeros_like(Q)
    for i, q in enumerate(Q):
        loc, n, idx, dist = body_bvh.find_nearest(Vector(q))
        if loc is None: continue
        d = (Vector(q) - loc).dot(n)
        if d < margin[i]: D[i] = np.array(n) * (margin[i] - d)
    return D


D = np.zeros_like(P)
for it in range(C.get('pushIters', 8)):
    D += push(P + D)
    for _ in range(4):
        D = 0.5 * D + 0.5 * np.array([D[n].mean(0) if n else D[i] for i, n in enumerate(nbr)])
P = P + D
P = P + push(P)
for v, p in zip(bm.verts, P): v.co = Vector(p)
bm.normal_update()
print('pushed: mean %.4f max %.4f' % (np.linalg.norm(D, axis=1).mean(), np.linalg.norm(D, axis=1).max()))


# --- weights: the body's, at the nearest point of the body (barycentric); the skirt below the hips
#     leans on the hips so it does not tear between the legs
def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.clip([1 - v - w, v, w], 0, 1)


W = np.zeros((len(P), len(G)))
for i, p in enumerate(P):
    loc, n, idx, dist = body_bvh.find_nearest(Vector(p))
    t = BT[idx]
    b = bary(np.array(loc), *BV[t]); b /= b.sum()
    W[i] = b @ BW[t]
hips = G.index('Hips')
sk = C.get('skirt')
if sk:
    # the skirt or coat tails: above the crotch, or hanging clear of the legs below it (not trousers)
    clear = np.array([body_bvh.find_nearest(Vector(p))[3] > sk.get('clear', 0.025) for p in P])
    k = smooth01(sk['to'], sk['from'], P[:, 2]) * sk['hips'] * (piece == 1) * ((P0[:, 2] > crotchG - 0.01) | clear)
    W = W * (1 - k[:, None]); W[:, hips] += k
# four largest, normalised
for i in range(len(W)):
    o = np.argsort(W[i])[:-4]; W[i, o] = 0
W /= W.sum(1, keepdims=True)

# --- the body faces each piece covers (hidden in game, so the skin cannot poke through)
hidden = {}
names = {0: 'boots', 1: 'armor'}
# body faces well inside a piece are hidden outright (the armpits are open in the T-pose): the armour
# from just above the boot tops to below the collar, out to just inside the sleeve ends
HIDE = {'armor': [zmapL(C['bootTop']) + 0.02, 0.785, float(armx(np.array(C['cuff']))) - 0.02], 'boots': [-1, zmapL(C['bootTop']) - 0.02, 1]}
for pc, name in names.items():
    fs = [f for f in bm.faces if piece[f.verts[0].index] == pc]
    vs = sorted({v.index for f in fs for v in f.verts})
    remap = {j: k for k, j in enumerate(vs)}
    tree = BVHTree.FromPolygons([Vector(P[j]) for j in vs], [[remap[v.index] for v in f.verts] for f in fs])
    hid = []
    for ti, t in enumerate(BT):
        a, b, c = BV[t]
        cen = (a + b + c) / 3; n = np.cross(b - a, c - a); nl = np.linalg.norm(n)
        if nl == 0: continue
        n /= nl
        reg = C.get('hideRegion', {}).get(name) or HIDE[name]
        if reg and all(reg[0] < q[2] < reg[1] and abs(q[0]) < reg[2] for q in (a, b, c)):
            hid.append(ti); continue  # well inside what the piece covers (the armpits open in the T-pose)
        hits = 0
        for q in (cen, a * 0.8 + cen * 0.2, b * 0.8 + cen * 0.2, c * 0.8 + cen * 0.2):
            h = tree.ray_cast(Vector(q + n * 0.0005), Vector(n), C['cover'])
            if h[0] is not None: hits += 1
        if hits >= C.get('coverHits', 4): hid.append(ti)
    hidden[name] = hid
    print(name, 'faces', len(fs), 'hides body tris', len(hid))

# --- build one object per piece, skinned to the chibi armature, and export
img.scale(C.get('tex', 1024), C.get('tex', 1024))
mat = bpy.data.materials.new('garment')
mat.use_nodes = True
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
bsdf = mat.node_tree.nodes['Principled BSDF']
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1
inv = bm_world.inverted()
outs = []
for pc, name in names.items():
    nb = bm.copy()
    src = nb.verts.layers.int.get('src')
    bmesh.ops.delete(nb, geom=[f for f in nb.faces if piece[f.verts[0][src]] != pc], context='FACES')
    bmesh.ops.delete(nb, geom=[v for v in nb.verts if not v.link_faces], context='VERTS')
    nb.verts.index_update()
    keep = [v[src] for v in nb.verts]
    me = bpy.data.meshes.new(C['id'] + '_' + name)
    nb.to_mesh(me)
    me.transform(inv)  # the body mesh's own space, so it binds like the body
    me.materials.append(mat)
    ob = bpy.data.objects.new(C['id'] + '_' + name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    ob.matrix_world = bm_world
    for g in G: ob.vertex_groups.new(name=g)
    for k, j in enumerate(keep):
        for gi in np.nonzero(W[j])[0]: ob.vertex_groups[gi].add([k], float(W[j, gi]), 'REPLACE')
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    for poly in me.polygons: poly.use_smooth = True
    ob['hideBody'] = json.dumps(hidden[name])
    outs.append(ob)
    nb.free()
gen.hide_set(True)
body.hide_set(True)
for o in bpy.data.objects: o.select_set(False)
arm.select_set(True)
for path, ob in ((C['out']['armor'], outs[1]), (C['out']['boots'], outs[0])):
    for o in outs: o.select_set(o is ob)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_skins=True, export_animations=False,
                              export_image_format='JPEG', export_jpeg_quality=88, export_extras=True, export_morph=False, export_yup=True)
    print('wrote', path)
