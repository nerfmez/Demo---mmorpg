# Fit a chibi hair to the chibi head: choose fit.width/depth/lift/back so the hair's inner surface
# (its scalp) lies on the chibi head, seen from the head's middle over the head's covered
# directions (not the face). Prints the fit. Uses the same hairFrame math as the game.
# Usage (Blender as a module): python3 fit-chibi-hair-auto.py -- <hair.glb> '<box json>' '{"tilt":0}'
# with CHIBI_HEAD=<head.json>: the chibi head in head-bone space (verts, above, tris, headMatrix),
# dumped from the game (docs/CHIBI-HAIR.md). The shipped fits are this result made 0.8 wide,
# 0.76 deep and 0.14 head heights lower, the tightness the owner approved on the ponytail.
import bpy, bmesh, sys, json, math, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
hair, box, extra = sys.argv[-3], json.loads(sys.argv[-2]), json.loads(sys.argv[-1])
import os
H = json.load(open(os.environ['CHIBI_HEAD']))
V = np.array(H['verts']); above = np.array(H['above']) > 0
M = np.array(H['headMatrix']).reshape(4, 4).T
W = (M @ np.c_[V, np.ones(len(V))].T).T[:, :3][above]
C8 = np.array([[x, y, z, 1] for x in (W.min(0)[0], W.max(0)[0]) for y in (W.min(0)[1], W.max(0)[1]) for z in (W.min(0)[2], W.max(0)[2])])
L8 = (np.linalg.inv(M) @ C8.T).T[:, :3]; lo, hi = L8.min(0), L8.max(0); hw, hh, hd = hi - lo
hv = V[above]; c = (hv.min(0) + hv.max(0)) / 2  # the head's middle (real bounds)
tris = [tuple(H['tris'][i:i + 3]) for i in range(0, len(H['tris']), 3)]
head = BVHTree.FromPolygons([Vector(p) for p in V], tris)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=hair)
g = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bm = bmesh.new(); bm.from_mesh(g.data); bm.transform(g.matrix_world)
HP = np.array([(v.co.x, v.co.z, -v.co.y) for v in bm.verts]); bm.verts.ensure_lookup_table()
HT = [tuple(v.index for v in f.verts) for f in bm.faces]
b0, b1 = np.array(box[0]), np.array(box[1]); cbox = (b0 + b1) / 2
# directions: the head's covered part (above the jaw; not the face: in front and below the brow)
dirs = []
for p in np.linspace(4, 120, 30):
    for a in np.linspace(-180, 180, 48, endpoint=False):
        pr, ar = math.radians(p), math.radians(a)
        d = np.array([math.sin(pr) * math.sin(ar), math.cos(pr), math.sin(pr) * math.cos(ar)])
        if d[2] > 0.35 and p > extra.get('brow', 62): continue  # the face
        dirs.append(d)
def far(tree, d, start):
    o = Vector(start); best = None
    while True:
        hit = tree.ray_cast(o, Vector(d))
        if hit[0] is None: return best
        best = (hit[0] - Vector(c)).length; o = hit[0] + Vector(d) * 1e-3
rc = [far(head, d, c) for d in dirs]
def frame(f):
    sx = hw * f['width'] / (b1[0] - b0[0]); sz = hd * f['depth'] / (b1[2] - b0[2]); sy = (sx + sz) / 2 * f.get('height', 1)
    pos = np.array([(lo[0] + hi[0]) / 2 - sx * (b0[0] + b1[0]) / 2, hi[1] + hh * f['lift'] - sy * b1[1], (lo[2] + hi[2]) / 2 - hd * f['back'] - sz * (b0[2] + b1[2]) / 2])
    q = HP
    if f.get('tilt'):
        t = math.radians(-f['tilt']); ct, st = math.cos(t), math.sin(t); dd = q - cbox
        q = cbox + np.c_[dd[:, 0], dd[:, 1] * ct - dd[:, 2] * st, dd[:, 1] * st + dd[:, 2] * ct]
    return q * [sx, sy, sz] + pos
def score(f):
    P = frame(f); tree = BVHTree.FromPolygons([Vector(p) for p in P], HT)
    err, n, miss = 0, 0, 0
    for d, r in zip(dirs, rc):
        if r is None: continue
        hit = tree.ray_cast(Vector(c), Vector(d))
        if hit[0] is None: miss += 1; continue
        e = (hit[0] - Vector(c)).length - (r + extra.get('margin', 0.02) * hw)
        err += min(abs(e), 0.3 * hw) * (2 if e < 0 else 1); n += 1  # hair sinking in counts double
    return err / max(n, 1) / hw + 0.5 * miss / len(dirs)
best = None
f0 = {'width': 1, 'depth': 1, 'lift': 0, 'back': 0, 'tilt': extra.get('tilt', 0), 'height': 1}
for w in np.arange(0.6, 1.45, 0.05):
    for l in np.arange(-0.3, 0.16, 0.05):
        f = dict(f0, width=w, depth=w, lift=l); s = score(f)
        if best is None or s < best[0]: best = (s, f)
for _ in range(2):
    f = best[1]
    for k, rng in (('width', 0.04), ('depth', 0.04), ('lift', 0.04), ('back', 0.06)):
        for dv in np.linspace(-rng * 2, rng * 2, 9):
            t = dict(best[1]); t[k] = round(t[k] + dv, 3); s = score(t)
            if s < best[0]: best = (s, t)
print('AUTOFIT', round(best[0], 4), json.dumps({k: round(float(v), 3) for k, v in best[1].items()}))
