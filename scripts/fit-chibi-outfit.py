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
HERO = json.load(open('data/models.json'))['characters']['hero_chibi']
FLATTEN = HERO.get('flatten', [])
# the sets' settings and the cuts below were made for the first chibi body (crotch 0.45 m, arm axis
# 0.769 m, neck 0.83 m); its heights are moved onto this body's own landmarks (`fit`)
FIT = HERO.get('fit', {})
CHIBI_TIP = FIT.get('tip', 0.513)  # the chibi's fingertips out from its middle in the T-pose (m)
_old, _new = [0, 0.45, 0.769, 0.83, 1.2], [0, FIT.get('crotch', 0.45), FIT.get('armAxis', 0.769), FIT.get('neck', 0.83), 1.2]
B = lambda h: np.interp(h, _old, _new)
C['torsoZ'] = [[g, float(B(c))] for g, c in C['torsoZ']]
C['armAxis'] = [C['armAxis'][0], float(B(C['armAxis'][1]))]
# this body's chest is slimmer across than the first one's: the torso's scale with it (`fit.torso`)
C['torsoScale'] = C['torsoScale'] * FIT.get('torso', 1)
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
collar, skin = set(), set()
if 'collar' in C:
    # a fur collar round the neck (`collar`: its pale, unsaturated faces between `from` and `top`,
    # within `half` across and in front of `back`, or a hood's fur drape behind `behind`): kept whole above the neck cut and placed as one
    # piece (below), since the chibi's big head leaves no room for the torso warp to bend it
    K = C['collar']; cw, ch = img.size; cpx = np.array(img.pixels[:]).reshape(ch, cw, 4)[:, :, :3] * 255
    for f in bm.faces:
        c = f.calc_center_median()
        if not (K['from'] < c.z < K['top'] and abs(c.x) < K['half'] and (c.y > K['behind'] if 'behind' in K else c.y < K.get('back', 0.03))): continue
        u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops); v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
        col = cpx[int(np.clip((v % 1) * ch, 0, ch - 1)), int(np.clip((u % 1) * cw, 0, cw - 1))]
        if col.min() > K.get('light', 120) and col.max() - col.min() < K.get('grey', 50): collar.add(f)
        elif col[0] > 190 and col[0] - col[2] > 25: skin.add(f)
    # its shaded faces between (two of three neighbours in it; not the neck's skin), and no loose bits
    for _ in range(3):
        collar |= {f for f in bm.faces if f not in collar and f not in skin and K['from'] < f.calc_center_median().z < K['top']
                   and sum(any(o in collar for o in e.link_faces if o is not f) for e in f.edges) >= 2}
    seen = set()
    for f in list(collar):
        if f in seen: continue
        comp, todo = {f}, [f]
        while todo:
            t = todo.pop()
            for e in t.edges:
                for o in e.link_faces:
                    if o in collar and o not in comp: comp.add(o); todo.append(o)
        seen |= comp
        if len(comp) < K.get('minPiece', 12): collar -= comp
drop = []
for f in bm.faces:
    c = f.calc_center_median()
    # the sleeve cut is for the arms only (from the armpits up): lower down it would cut the outer
    # half off wide hips, trousers and boots
    if f in collar: continue
    # `backCut` [z, y]: behind y the coat ends lower, at z, under a hood's drape (the neck cut would
    # slice the hood's fur open there)
    if 'backCut' in C and c.z > C['backCut'][0] and c.y > C['backCut'][1]:
        drop.append(f); continue
    if (abs(c.x) > C['cuff'] and c.z > C.get('armpit', 0.66)) or (c.z > C['neck'] and abs(c.x) < C.get('neckHalf', 0.16)) or c.z > C.get('top', C['neck'] + 0.03):
        drop.append(f)
bmesh.ops.delete(bm, geom=drop, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.verts.index_update()
src = bm.verts.layers.int.new('src')  # each vertex's index here, kept through the per-piece copies
for v in bm.verts: v[src] = v.index
P0 = np.array([tuple(v.co) for v in bm.verts])
incollar = np.array([any(f in collar for f in v.link_faces) for v in bm.verts])
bm.normal_update(); N0 = np.array([tuple(v.normal) for v in bm.verts])


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


def slice_loops(P, F, z):
    # the cut of the surface at height z as closed loops (2D points), joined end to end by edge
    d = P[F][:, :, 2] - z
    cross = (d.min(1) < 0) & (d.max(1) > 0)
    segs = []
    for f, dd in zip(F[cross], d[cross]):
        ends = []
        for i, j in ((0, 1), (1, 2), (2, 0)):
            if (dd[i] < 0) != (dd[j] < 0):
                k = dd[i] / (dd[i] - dd[j]); ends.append((min(f[i], f[j]), max(f[i], f[j]), P[f[i]] + k * (P[f[j]] - P[f[i]])))
        if len(ends) == 2: segs.append(ends)
    at = {}
    for n, (a, b) in enumerate(segs):
        at.setdefault(a[:2], []).append(n); at.setdefault(b[:2], []).append(n)
    used, loops = set(), []
    for n in range(len(segs)):
        if n in used: continue
        used.add(n); a, b = segs[n]; pts = [a[2][:2], b[2][:2]]; key = b[:2]
        while True:
            nxt = [m for m in at.get(key, []) if m not in used]
            if not nxt: break
            m = nxt[0]; used.add(m); a, b = segs[m]
            e = b if a[:2] == key else a
            pts.append(e[2][:2]); key = e[:2]
        loops.append(np.array(pts))
    return loops


def inside(p, poly):
    x, y = poly[:, 0], poly[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    c = ((y > p[1]) != (y2 > p[1])) & (p[0] < (x2 - x) * (p[1] - y) / (y2 - y + 1e-12) + x)
    return c.sum() % 2 == 1


def leg_track(P, F, zs, start):
    # the leg's own tube, followed up from the ankle: at each height the closed loop around the
    # last centre (coat panels and capes are other loops), its box middle the leg's centre
    out, c = [], np.array(start, float)
    for z in zs:
        loops = [l for l in slice_loops(P, F, z) if len(l) > 5 and l[:, 0].mean() > 0.004]
        hit = [l for l in loops if inside(c, l)]
        if hit:
            l = min(hit, key=lambda l: np.ptp(l[:, 0]) * np.ptp(l[:, 1]))  # the innermost
            c = np.array([(l[:, 0].min() + l[:, 0].max()) / 2, (l[:, 1].min() + l[:, 1].max()) / 2])
            out.append(c.copy())
        else:
            out.append((np.nan, np.nan))
    return np.array(out)


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
if C.get('legTrack', True):
    # a coat or cape hanging round the legs pulls a whole slice's centre off the leg: follow the
    # leg's own loop up from the lower shin (the boot shaft, below any coat) instead
    sh = np.nanmedian(leg_centres(P0, GF, np.linspace(0.12, 0.2, 5)), axis=0)
    tr = leg_track(P0, GF, zs, sh)
    ok_t = ~np.isnan(tr[:, 0]) & (zs > 0.1)
    cg[ok_t] = tr[ok_t]
cc = leg_centres(BV, BT, zmapL(zs))
ok = ~np.isnan(cg).any(1) & ~np.isnan(cc).any(1)
zs, cg, cc = zs[ok], cg[ok], cc[ok]


# both legs stand straight (Meshy's T-pose, the chibi's bind pose); armour plates and boot heels
# move a slice's centre about, and following those wiggles bends the legs: map the straight line
# through the generated leg's centres onto the straight line through the chibi's
up = zs >= 0.1
for k in (0, 1):
    cg[:, k] = np.polyval(np.polyfit(zs[up], cg[up, k], 1), zs)
    cc[:, k] = np.polyval(np.polyfit(zs[up], cc[up, k], 1), zs)
# the generated leg line goes onto the chibi's own leg line
dcy = cc[:, 1] - cg[:, 1]
gx = np.interp(P0[:, 2], zs, cg[:, 0])
gy = np.interp(P0[:, 2], zs, cg[:, 1])


def smooth01(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


x, y, z = P0.T
ax = abs(x); sx = np.sign(x)
# torso
sT = C['torsoScale']
# front to back the torso goes where the legs go: the generated hips (the leg line's top) onto the
# chibi's. Meshy centres the whole model in its box, so a hood or cape behind the body moves the
# body forward by up to 10 cm; a fixed offset sheared the coat between the torso and the legs
ty0, ty1 = cg[-1, 1], cc[-1, 1]
T = np.stack([x * sT, (y - ty0) * sT + ty1, zmapT(z)], 1)
# legs
sL = C['legScale']
# across, the boots and the trousers' hems stand on the chibi's leg lines, so any set's boots meet
# any set's trousers; going up, the legs turn to the generated stance spaced as the torso is
# (x * sT) by the hips, so the thighs do not jump inward below them (that pinched the calves
# together)
ccx = np.interp(z, zs, cc[:, 0])
t = smooth01(C['bootTop'], crotchG, z)
tx = ccx + (gx * sT - ccx) * t
L = np.stack([sx * (tx + (ax - gx) * sL), gy + np.interp(z, zs, dcy) + (y - gy) * sL, zmapL(z)], 1)
# arms: `armX` maps distances out along the arm (from the shoulder to the fingertips), else `armLen` scales them
a0, a1 = C['armAxis']; sA = C['armScale']
if C.get('armX'):
    ArmX = np.array(C['armX'], float)
    armx = lambda d: np.interp(d, ArmX[:, 0], ArmX[:, 1], left=None, right=None) + np.where(d > ArmX[-1, 0], (d - ArmX[-1, 0]) * (ArmX[-1, 1] - ArmX[-2, 1]) / (ArmX[-1, 0] - ArmX[-2, 0]), 0) + np.where(d < ArmX[0, 0], d - ArmX[0, 0], 0)
else:
    armx = lambda d: d * C.get('armLen', 1.0)
# the chibi's own arm centre line (its arm-weighted vertices, a straight fit out along the arm): the
# sleeve's middle goes there (a fixed height left it below a sloping arm, so it hung off the arm)
armV = BV[BW[:, armg].sum(1) > 0.6]; armV = armV[np.abs(armV[:, 0]) > 0.14]
kz = np.polyfit(np.abs(armV[:, 0]), armV[:, 2], 1); ky = np.polyfit(np.abs(armV[:, 0]), armV[:, 1], 1)
ac = armx(ax)
# front to back the sleeve is measured from the generated body's middle (its hips, as the torso is):
# Meshy centres the whole model in its box, so a hood or cape behind it moves the arms forward
A = np.stack([sx * ac, np.polyval(ky, ac) + (y - ty0) * sA, np.polyval(kz, ac) + (z - a0) * sA], 1)
wl = smooth01(crotchG + 0.02, crotchG - 0.03, z)[:, None]
wa = (smooth01(0.10, 0.16, ax) * (z > a0 - 0.08))[:, None]
P = T * (1 - wl) + L * wl
P = P * (1 - wa) + A * wa
if incollar.any():
    # the collar as one piece, scaled by `scale` (default the torso's), its two lobes standing where
    # the warp puts their feet (on the shoulders); across, the move fades out toward the middle so
    # the band round the back of the neck stays joined
    K = C['collar']; k = K.get('scale', sT)
    o = []
    for sd in (1, -1):
        side = incollar & (sx == sd) & (ax > 0.08)
        foot = side & (P0[:, 2] < np.percentile(P0[side, 2], 15))
        o.append(P[foot].mean(0) - k * P0[foot].mean(0))
    oz, oy, ox = (o[0][2] + o[1][2]) / 2, (o[0][1] + o[1][1]) / 2, (o[0][0] - o[1][0]) / 2
    ci = np.nonzero(incollar)[0]
    P[ci] = k * P0[ci] + np.stack([sx[ci] * ox * smooth01(0, 0.08, ax[ci]), np.full(len(ci), oy), np.full(len(ci), oz + K.get('lift', 0))], 1)
    # out over the shoulders (`spread` across) and down onto them (`lift` < 0): the chibi's head is
    # wider, and its chin sits at the shoulders
    P[ci, 0] *= K.get('spread', 1)


# --- keep the garment outside the body: push out along the body's normal, then spread the push
#     over the neighbours so the cloth moves as a surface (repeat, then a last strict pass)
nbr = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
piece = np.array([0 if v.co.z < C['bootTop'] else 1 for v in bm.verts])  # 0 boots, 1 armour
margin = np.where(piece == 0, C['margin']['boots'], C['margin']['armor'])
# the cloth is pushed out of the body only from the chest up (`pushAbove`): lower down the body is
# hidden under it (HIDE), and pushing the trousers over the chibi's fuller hips and thighs bulged
# them; there the generated shape is kept as it was made
pushed = (P[:, 2] > B(C.get('pushAbove', 0.69))) & ~incollar


def push(Q):
    D = np.zeros_like(Q)
    for i, q in enumerate(Q):
        if not pushed[i]: continue
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
# the collar's fur fluffed out along its surface (`inflate`), as thick as the sheet's
P[incollar] += N0[incollar] * C.get('collar', {}).get('inflate', 0)
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


# the trousers and boots take the weights of their own leg at their own height: a ray from that
# leg's centre line out through the vertex meets the leg's skin (the nearest body point can be the
# other leg or the crotch when the cloth is slimmer than the chibi's legs, which twists the legs)
zl = zmapL(zs)
legc = lambda zc, side: np.array([side * np.interp(zc, zl, cc[:, 0]), np.interp(zc, zl, cc[:, 1]), zc])
W = np.zeros((len(P), len(G)))
for i, p in enumerate(P):
    loc = idx = None
    if P0[i, 2] < crotchG - 0.03:
        c = legc(p[2], 1 if p[0] >= 0 else -1)
        d = Vector((p[0] - c[0], p[1] - c[1], 0))
        if d.length < 1e-4: d = Vector((1 if p[0] >= 0 else -1, 0, 0))
        loc, n, idx, dist = body_bvh.ray_cast(Vector(c), d.normalized(), 0.3)
    if idx is None:
        loc, n, idx, dist = body_bvh.find_nearest(Vector(p))
    t = BT[idx]
    b = bary(np.array(loc), *BV[t]); b /= b.sum()
    W[i] = b @ BW[t]
# from the waist up the weights are smoothed over the cloth's own surface: taken from the nearest
# body point they jump between the chest and the arm across a shoulder pad or a sleeve, and the
# pieces tear apart into shards when the arms come down
# (round the shoulders only: the sleeve keeps the arm's own weights, or blended with the upper arm
# and chest its cuff stays behind when the forearm swings and hangs off the arm)
up = np.nonzero((P[:, 2] > crotchC + 0.08) & (np.abs(P[:, 0]) < C.get('smoothOut', 0.15)))[0]
for _ in range(C.get('weightSmooth', 10)):
    W[up] = 0.5 * W[up] + 0.5 * np.array([W[nbr[i]].mean(0) if nbr[i] else W[i] for i in up])
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
# the collar rides the upper chest: the shoulders' arm weights would tear it when the arms come down
W[incollar] = 0; W[incollar, G.index('Spine02')] = 1
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
# body faces well inside a piece are hidden outright (the armpits are open in the T-pose, and the
# trousers are not pushed over the fuller legs): the armour's legs from inside the boot tops, its
# torso below the arms, and up to below the collar out to just inside the sleeve ends (boxes of
# [z from, z to, |x| below] that overlap, so no band of skin is left between them)
HIDE = {'armor': [[zmapL(C['bootTop']) - 0.04, crotchC, 1], [crotchC - 0.01, B(0.70), 0.22], [B(0.69), B(0.785), float(armx(np.array(C['cuff']))) - 0.02],
                  [B(0.70), B(0.84), float(armx(np.array(C['cuff']))) - 0.02, 0.11]],  # the whole upper arm in a sleeve
        'boots': [[-1, zmapL(C['bootTop']) + 0.01, 1]]}
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
        regs = C.get('hideRegion', {}).get(name) or HIDE[name]  # boxes [z from, z to, |x| below(, |x| above)]
        if all(any(r[0] < q[2] < r[1] and (r[3] if len(r) > 3 else -1) < abs(q[0]) < r[2] for r in regs) for q in (a, b, c)):  # each corner in some box
            hid.append(ti); continue  # well inside what the piece covers (the armpits open in the T-pose)
        hits = 0
        for q in (cen, a * 0.8 + cen * 0.2, b * 0.8 + cen * 0.2, c * 0.8 + cen * 0.2):
            h = tree.ray_cast(Vector(q + n * 0.0005), Vector(n), C['cover'])
            if h[0] is not None: hits += 1
        if hits >= C.get('coverHits', 4): hid.append(ti)
    hidden[name] = hid
    print(name, 'faces', len(fs), 'hides body tris', len(hid))

# --- the trousers' top hidden under a hem in the generated model is painted dark there; when the
#     legs move it shows, so paint it the trousers' own colour: a leg face whose outward ray meets
#     the garment again within a few cm, or that faces down (the underside under the hem), was
#     covered, and takes the median colour of the open trouser faces a little lower
img.scale(C.get('tex', 2048), C.get('tex', 2048))
tw, th = img.size
tex = np.array(img.pixels[:]).reshape(th, tw, 4)
uvl = bm.loops.layers.uv.active
garm = BVHTree.FromBMesh(bm)


def face_uv(f):
    return np.array([(l[uvl].uv.x % 1 * tw, l[uvl].uv.y % 1 * th) for l in f.loops])


def face_rgb(f):
    u, v = face_uv(f).mean(0)
    return tex[int(np.clip(v, 0, th - 1)), int(np.clip(u, 0, tw - 1)), :3]


legs = [f for f in bm.faces if piece[f.verts[0].index] == 1 and P0[f.verts[0].index, 2] < crotchG + 0.08]
band = [f for f in legs if crotchG - 0.12 < P0[f.verts[0].index, 2]]
covered = []
for f in band:
    c, n = f.calc_center_median(), f.normal
    hit = garm.ray_cast(c + n * 0.002, n, 0.05)
    # covered by the hem, or the underside joining the hem to the trousers (it faces the ground)
    if hit[0] is not None or n.z < -0.4: covered.append(f)
open_ = [f for f in legs if crotchG - 0.2 < P0[f.verts[0].index, 2] < crotchG - 0.08 and f not in covered]
if covered and open_:
    ref = np.median([face_rgb(f) for f in open_], axis=0)
    yy, xx = np.mgrid[0:th, 0:tw]
    for f in covered:
        if face_rgb(f).mean() > 0.75 * ref.mean(): continue  # not darkened: leave its pattern
        (x0, y0), (x1, y1), (x2, y2) = face_uv(f)
        bx0, bx1 = int(max(0, min(x0, x1, x2) - 2)), int(min(tw, max(x0, x1, x2) + 3))
        by0, by1 = int(max(0, min(y0, y1, y2) - 2)), int(min(th, max(y0, y1, y2) + 3))
        X, Y = xx[by0:by1, bx0:bx1] + 0.5, yy[by0:by1, bx0:bx1] + 0.5
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-9: continue
        a = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / d
        b = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / d
        inside = (a > -0.08) & (b > -0.08) & (1 - a - b > -0.08)  # a little past the edge, for filtering
        tex[by0:by1, bx0:bx1, :3][inside] = ref
    img.pixels = tex.ravel().tolist()
    print('repainted covered trouser faces', len(covered))

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
