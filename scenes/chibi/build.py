# The chibi hero's base model (Sword x Staff style, 3 heads, 1.2 m), built from code in Blender and
# exported as GLB. Rigid parts hang from a joint hierarchy (no skinning), grouped by slot so each
# piece of clothing can be swapped: Body, Face, Hair, Top, Bottom, Boots, Gloves.
# Blender axes: X = the hero's left, -Y = front, Z = up (the exporter turns -Y into glTF +Z).
# Usage: python build.py face.png out.glb
import bpy, bmesh, math, sys
import numpy as np
from mathutils import Vector
FACE_PNG, OUT = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def lin(hexs):
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
PALETTE = {'Skin': '#ffe2d0', 'Under': '#4a4a5c', 'Hair': '#2e3b6e', 'Shirt': '#f3efe6', 'Trim': '#4a7bd0', 'Pants': '#45506e',
           'Leather': '#8a5a3a', 'LeatherLight': '#b9824f', 'Gold': '#e8b84a'}
MATS = {}
for name, col in PALETTE.items():
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*lin(col), 1); b.inputs['Roughness'].default_value = 0.9
    MATS[name] = m
face_mat = bpy.data.materials.new('Face'); face_mat.use_nodes = True
nt = face_mat.node_tree; b = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(FACE_PNG); tex.interpolation = 'Linear'
nt.links.new(tex.outputs['Color'], b.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
MATS['Face'] = face_mat

# ---- joints (world positions) ----
JOINTS = {  # name: (parent, position)
    'J_Root': (None, (0, 0, 0)),
    'J_Hips': ('J_Root', (0, 0, 0.46)),
    'J_Chest': ('J_Hips', (0, 0, 0.6)),
    'J_Neck': ('J_Chest', (0, 0.004, 0.77)),
    'J_Head': ('J_Neck', (0, 0.004, 0.81)),
}
for s, k in (('L', 1), ('R', -1)):
    JOINTS.update({
        f'J_UpperArm_{s}': ('J_Chest', (k * 0.112, 0.0, 0.732)),
        f'J_LowerArm_{s}': (f'J_UpperArm_{s}', (k * 0.128, 0.004, 0.615)),
        f'J_Hand_{s}': (f'J_LowerArm_{s}', (k * 0.138, -0.002, 0.505)),
        f'J_UpperLeg_{s}': ('J_Hips', (k * 0.055, 0, 0.44)),
        f'J_LowerLeg_{s}': (f'J_UpperLeg_{s}', (k * 0.057, 0.004, 0.262)),
        f'J_Foot_{s}': (f'J_LowerLeg_{s}', (k * 0.058, 0.006, 0.072)),
    })
EMPTIES = {}
for name, (parent, pos) in JOINTS.items():   # dict order puts parents first
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.03; scn.collection.objects.link(e)
    if parent:
        e.parent = EMPTIES[parent]; e.location = Vector(pos) - Vector(JOINTS[parent][1])
    else:
        e.location = pos
    EMPTIES[name] = e
JP = {n: np.array(p, float) for n, (_, p) in JOINTS.items()}

# ---- shape builders: each returns (verts Nx3 world, faces) ----
PIECES = {}   # (slot, joint, material, under) -> list of (verts, faces, uvs)
def add(slot, joint, mat, vf, uvs=None, under=''):
    # `under`: a body part that only shows while that clothing slot is empty
    PIECES.setdefault((slot, joint, mat, under), []).append((np.asarray(vf[0], float), vf[1], uvs))

def grid_faces(rows, cols, closed=True):
    f = []
    for r in range(rows - 1):
        for c in range(cols if closed else cols - 1):
            a, b = r * cols + c, r * cols + (c + 1) % cols
            f.append((a, b, b + cols, a + cols))
    return f

def sweep(centers, frames, radii, sides=16, power=2.0, cap0=True, cap1=True):
    """Rings of `sides` points round each centre in its frame (u, v), radii (ru, rv), superellipse
    power; ends closed by a fan to the centre (or the last ring collapses to a point if its radius is 0)."""
    verts, rings = [], 0
    for c, (u, v), (ru, rv) in zip(centers, frames, radii):
        for j in range(sides):
            a = 2 * math.pi * j / sides; ca, sa = math.cos(a), math.sin(a)
            e = 2 / power
            x = math.copysign(abs(ca) ** e, ca) * ru; y = math.copysign(abs(sa) ** e, sa) * rv
            verts.append(np.asarray(c) + u * x + v * y)
        rings += 1
    faces = grid_faces(rings, sides)
    if cap0:
        verts.append(np.asarray(centers[0])); i = len(verts) - 1
        faces += [(i, (j + 1) % sides, j) for j in range(sides)]
    if cap1:
        verts.append(np.asarray(centers[-1])); i = len(verts) - 1; o = (rings - 1) * sides
        faces += [(i, o + j, o + (j + 1) % sides) for j in range(sides)]
    return verts, faces

def perp_frame(t):
    t = t / np.linalg.norm(t)
    ref = np.array([0, -1.0, 0]) if abs(t[1]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ref, t); u /= np.linalg.norm(u); v = np.cross(t, u)
    return u, v

def limb(p0, p1, r0, r1, sides=16, round0=True, round1=True, flat=1.0, n=8):
    """A tapered tube from p0 to p1 with rounded (hemispherical) ends."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float); t = p1 - p0; L = np.linalg.norm(t); d = t / L
    u, v = perp_frame(d)
    cs, fr, rr = [], [], []
    if round0:
        for k in range(5, 0, -1):
            a = k / 5 * math.pi / 2; cs.append(p0 - d * r0 * math.sin(a) * 0.9); rr.append((r0 * math.cos(a) + 1e-4, r0 * math.cos(a) * flat + 1e-4)); fr.append((u, v))
    for i in range(n + 1):
        s = i / n; cs.append(p0 + t * s); r = r0 + (r1 - r0) * s; rr.append((r, r * flat)); fr.append((u, v))
    if round1:
        for k in range(1, 6):
            a = k / 5 * math.pi / 2; cs.append(p1 + d * r1 * math.sin(a) * 0.9); rr.append((r1 * math.cos(a) + 1e-4, r1 * math.cos(a) * flat + 1e-4)); fr.append((u, v))
    return sweep(cs, fr, rr, sides)

def ellipsoid(c, r, seg=32, rings=20, deform=None):
    verts, faces = [], []
    c = np.asarray(c, float)
    for i in range(1, rings):
        ph = math.pi * i / rings
        for j in range(seg):
            th = 2 * math.pi * j / seg
            dvec = np.array([math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)])
            p = c + dvec * r
            verts.append(deform(p, dvec) if deform else p)
    faces = grid_faces(rings - 1, seg)
    faces = [(a, d, c_, b) for a, b, c_, d in faces]   # outward winding for this layout
    top = len(verts); verts.append(deform(c + np.array([0, 0, r[2]]), np.array([0, 0, 1.0])) if deform else c + np.array([0, 0, r[2]]))
    bot = len(verts); verts.append(deform(c - np.array([0, 0, r[2]]), np.array([0, 0, -1.0])) if deform else c - np.array([0, 0, r[2]]))
    faces += [(top, (j + 1) % seg, j) for j in range(seg)]
    o = (rings - 2) * seg
    faces += [(bot, o + j, o + (j + 1) % seg) for j in range(seg)]
    return verts, faces

def loft(rows, sides=28, power=2.6, cap0=True, cap1=True):
    """rows: (z, half-width, half-depth, y-offset) from bottom to top; superellipse sections."""
    cs = [np.array([0, row[3] if len(row) > 3 else 0, row[0]]) for row in rows]
    fr = [(np.array([1.0, 0, 0]), np.array([0, -1.0, 0])) for _ in rows]
    return sweep(cs, fr, [(r[1], r[2]) for r in rows], sides, power, cap0, cap1)

def ring(z, rx, ry, tube, sides=28, tsides=8, y0=0.0):
    verts = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        for j in range(tsides):
            b = 2 * math.pi * j / tsides
            r = 1 + tube * math.cos(b) / max(rx, ry)
            verts.append(np.array([math.sin(a) * rx * r, y0 - math.cos(a) * ry * r, z + tube * math.sin(b)]))
    faces = []
    for i in range(sides):
        for j in range(tsides):
            a, b_ = i * tsides + j, i * tsides + (j + 1) % tsides
            c, d = ((i + 1) % sides) * tsides + (j + 1) % tsides, ((i + 1) % sides) * tsides + j
            faces.append((a, d, c, b_))
    return verts, faces

def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ---- head: a big round head, full cheeks narrowing to a small soft chin ----
HC = np.array([0, 0.004, 0.968]); HR = np.array([0.172, 0.162, 0.165])
def head_shape(p, d):
    p = p.copy()
    low = max(0.0, -d[2]); front = smoothstep(0.1, -0.7, d[1])
    p[0] = HC[0] + (p[0] - HC[0]) * (1 - 0.2 * low ** 1.7 * (0.55 + 0.45 * front))
    p[1] -= 0.012 * low ** 2 * front
    p[2] += 0.006 * low ** 3 * front                     # a softer, slightly lifted chin
    if d[1] > 0: p[1] = HC[1] + (p[1] - HC[1]) * 1.05   # a rounder back of the head
    return p
hv, hf = ellipsoid(HC, HR, 48, 32, head_shape)
add('Body', 'J_Head', 'Skin', (hv, hf))
for k in (1, -1):
    add('Body', 'J_Head', 'Skin', ellipsoid(HC + np.array([k * 0.168, 0.012, -0.03]), np.array([0.022, 0.028, 0.038]), 16, 10))
# the face: the front of the head, lifted 1.5 mm, mapped flat from the front onto the atlas' first cell
fv, ff, fuv = [], [], []
remap = {}
hv_arr = np.array(hv)
for f in hf:
    pts = hv_arr[list(f)]; c = pts.mean(0)
    if c[1] - HC[1] > -0.06 or c[2] < 0.79 or c[2] > 1.07: continue
    if np.linalg.norm((c - HC)[[0, 2]]) > 0.17: continue
    idx = []
    for i in f:
        if i not in remap:
            p = hv_arr[i]; n = (p - HC) / np.linalg.norm(p - HC)
            remap[i] = len(fv); fv.append(p + n * 0.0015)
            fuv.append(((0.5 + p[0] / 0.30) * 0.5, 0.5 + (0.5 + (p[2] - 0.93) / 0.30) * 0.5))
        idx.append(remap[i])
    ff.append(tuple(idx))
add('Face', 'J_Head', 'Face', (fv, ff), fuv)
add('Body', 'J_Neck', 'Skin', limb((0, 0.006, 0.75), (0, 0.006, 0.84), 0.036, 0.036, round0=False, round1=False))

# ---- hair: a cap over the skull and chunky tapered locks, each with its own outline ----
HAIR_C, HAIR_R = HC + np.array([0, 0.008, 0.012]), np.array([0.18, 0.174, 0.176])
def on_hair(th, ph, scale):
    return HAIR_C + np.array([HAIR_R[0] * math.cos(ph) * math.sin(th), -HAIR_R[1] * math.cos(ph) * math.cos(th), HAIR_R[2] * math.sin(ph)]) * scale
def hairline(th):
    # the cap's lower edge: high on the forehead, down over the temples, lowest at the nape
    a = abs(th)
    return 1.07 - 0.15 * smoothstep(0.4, 1.15, a) - 0.07 * smoothstep(1.7, 2.5, a)
def orient(verts, faces, centre):
    # wind every face outward from `centre` (the cap and the locks are open or thin shells)
    out = []
    for f in faces:
        p = [np.asarray(verts[i]) for i in f]; n = np.cross(p[1] - p[0], p[2] - p[0])
        out.append(tuple(f) if n.dot(np.mean(p, 0) - centre) >= 0 else tuple(reversed(f)))
    return out
# the cap: columns round the head, each running from the crown down to the hairline, so the edge is smooth
SEG, ROWS = 64, 16
cv = [on_hair(0, math.pi / 2, 1.0)]
for i in range(1, ROWS + 1):
    for j in range(SEG):
        th = 2 * math.pi * j / SEG - math.pi
        ph_end = math.asin(max(-0.99, min(0.99, (hairline(th) - HAIR_C[2]) / HAIR_R[2])))
        cv.append(on_hair(th, math.pi / 2 - (math.pi / 2 - ph_end) * i / ROWS, 1.0))
cf = [(0, 1 + (j + 1) % SEG, 1 + j) for j in range(SEG)]
for i in range(ROWS - 1):
    for j in range(SEG):
        a_, b_ = 1 + i * SEG + j, 1 + i * SEG + (j + 1) % SEG
        cf.append((a_, b_, b_ + SEG, a_ + SEG))
add('Hair', 'J_Head', 'Hair', (cv, orient(cv, cf, HAIR_C)))

def lock(th0, ph0, dph, dth=0.0, w0=0.07, k0=0.028, out=0.02, lift=0.03, flick=0.04, n=12, sides=10):
    """A tapered, flattened lock lying on the hair shell: from (th0, ph0) down by dph in elevation,
    drifting dth round the head; `flick` lifts the tip off the head."""
    cs, fr, rr = [], [], []
    pts = [on_hair(th0 + dth * t, ph0 - dph * t, 1 + out + lift * t + flick * t ** 3) for t in np.linspace(0, 1, n)]
    for i, t in enumerate(np.linspace(0, 1, n)):
        tg = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]; tg /= np.linalg.norm(tg)
        nrm = pts[i] - HC; nrm -= tg * nrm.dot(tg); nrm /= np.linalg.norm(nrm)
        side = np.cross(tg, nrm)
        w = w0 * (1 - t) ** 0.85 * (1 + 0.25 * math.sin(math.pi * t) * (1 - t)) + 1e-4
        k = k0 * (1 - t) ** 0.7 + 1e-4
        cs.append(pts[i] + nrm * k * 0.2); fr.append((side, nrm)); rr.append((w / 2, k / 2))
    return sweep(cs, fr, rr, sides, 2.0)

LOCKS = []
# fringe: two layers of overlapping locks over the forehead, the middle ones longest, the tips at
# the brows; the outer layer sits a little further out for depth
for th, dph, dth in ((-0.72, 0.78, -0.12), (-0.48, 0.86, -0.08), (-0.24, 0.94, -0.03), (0.0, 0.98, 0.04), (0.24, 0.92, 0.05), (0.48, 0.86, 0.08), (0.72, 0.78, 0.12)):
    LOCKS.append(lock(th, 0.98, dph, dth, w0=0.092, k0=0.034, out=0.012, lift=0.03, flick=0.03))
for th, dph, dth in ((-0.6, 0.7, -0.1), (-0.36, 0.78, -0.06), (-0.12, 0.84, 0.02), (0.12, 0.84, -0.02), (0.36, 0.78, 0.06), (0.6, 0.7, 0.1)):
    LOCKS.append(lock(th, 1.05, dph, dth, w0=0.085, k0=0.03, out=0.035, lift=0.03, flick=0.035))
# side locks over the ears, curling toward the cheeks
for k in (1, -1):
    for th, dph in ((1.08, 1.42), (1.36, 1.46), (1.66, 1.42), (1.96, 1.38)):
        LOCKS.append(lock(k * th, 0.66, dph, -k * 0.22, w0=0.088, k0=0.032, out=0.02, lift=0.02, flick=0.05))
# back: longer locks with tips flicking out at the nape
for th in (2.25, 2.6, 2.92, -2.25, -2.6, -2.92, math.pi):
    LOCKS.append(lock(th, 0.8, 1.65, 0.06 * math.copysign(1, th), w0=0.1, k0=0.036, out=0.02, lift=0.03, flick=0.12))
# the top: wide locks swept from above the fringe over the crown to the back (from the game's high
# camera they read as combed hair, not a star), and a few spikes standing up at the back of the crown
for th, dth in ((-0.62, -0.25), (-0.31, -0.12), (0.0, 0.0), (0.31, 0.12), (0.62, 0.25)):
    LOCKS.append(lock(th, 1.0, -1.25, dth, w0=0.12, k0=0.03, out=0.012, lift=0.02, flick=0.0))
for th in (2.7, math.pi, -2.7):
    LOCKS.append(lock(th, 1.25, 0.6, 0.0, w0=0.09, k0=0.034, out=0.015, lift=0.05, flick=0.14))
for v_, f_ in LOCKS: add('Hair', 'J_Head', 'Hair', (v_, f_))
# an ahoge: a thin curl springing up from the crown
top = on_hair(0.25, 1.35, 1.0)
path = [top + np.array(o) for o in ((0, 0, 0), (0.004, -0.004, 0.035), (0.016, -0.02, 0.058), (0.034, -0.04, 0.062), (0.046, -0.052, 0.046))]
cs, fr, rr = [], [], []
for i, p in enumerate(path):
    t = i / (len(path) - 1); tg = path[min(i + 1, 4)] - path[max(i - 1, 0)]; tg /= np.linalg.norm(tg)
    side = np.array([1.0, 0, 0]); nrm = np.cross(side, tg)
    cs.append(p); fr.append((side, nrm)); rr.append((0.012 * (1 - t) + 1e-4, 0.006 * (1 - t) + 1e-4))
add('Hair', 'J_Head', 'Hair', sweep(cs, fr, rr, 8))

# ---- top: a tunic with a blue collar, placket and hem; long sleeves with blue cuffs ----
add('Top', 'J_Chest', 'Shirt', loft([(0.452, 0.113, 0.08), (0.48, 0.106, 0.074), (0.53, 0.094, 0.066), (0.6, 0.099, 0.07),
                                      (0.66, 0.106, 0.074), (0.705, 0.112, 0.073), (0.738, 0.108, 0.066), (0.758, 0.086, 0.054), (0.774, 0.052, 0.042)]))
add('Top', 'J_Chest', 'Trim', ring(0.774, 0.05, 0.043, 0.011))
add('Top', 'J_Chest', 'Trim', ring(0.458, 0.114, 0.081, 0.009))
add('Top', 'J_Chest', 'Trim', limb((0, -0.077, 0.6), (0, -0.068, 0.755), 0.008, 0.008, sides=8, flat=0.5))
for s, k in (('L', 1), ('R', -1)):
    sh, el, wr = JP[f'J_UpperArm_{s}'], JP[f'J_LowerArm_{s}'], JP[f'J_Hand_{s}']
    add('Top', f'J_UpperArm_{s}', 'Shirt', limb(sh + np.array([-k * 0.004, 0, -0.006]), el, 0.038, 0.034))
    add('Top', f'J_LowerArm_{s}', 'Shirt', limb(el, wr + (el - wr) * 0.12, 0.034, 0.031, round1=False))
    cuff = wr + (el - wr) * 0.1
    add('Top', f'J_LowerArm_{s}', 'Trim', limb(cuff + (el - wr) * 0.07, cuff, 0.035, 0.035, round0=False, round1=False))
    # hands: a mitten with a thumb
    add('Body', f'J_Hand_{s}', 'Skin', ellipsoid(wr + np.array([k * 0.004, -0.003, -0.034]), np.array([0.022, 0.028, 0.034]), 16, 10))
    add('Body', f'J_Hand_{s}', 'Skin', ellipsoid(wr + np.array([-k * 0.008, -0.022, -0.022]), np.array([0.011, 0.011, 0.017]), 10, 8))
    add('Body', f'J_Hand_{s}', 'Skin', limb(wr + (el - wr) * 0.05, wr + np.array([0, 0, -0.012]), 0.023, 0.022, round0=False))
    # bracers (the glove slot): leather cuffs over the forearm with a light rim
    a, b_ = el + (wr - el) * 0.35, el + (wr - el) * 0.86
    add('Gloves', f'J_LowerArm_{s}', 'Leather', limb(a, b_, 0.037, 0.036, round0=False, round1=False))
    add('Gloves', f'J_LowerArm_{s}', 'LeatherLight', limb(a - (wr - el) * 0.03, a + (wr - el) * 0.03, 0.04, 0.04, round0=False, round1=False))

# ---- bottom: trousers and a belt with a gold buckle ----
add('Bottom', 'J_Hips', 'Pants', loft([(0.395, 0.07, 0.05), (0.415, 0.09, 0.062), (0.44, 0.097, 0.066), (0.465, 0.094, 0.06), (0.51, 0.084, 0.054)]))
add('Bottom', 'J_Hips', 'Leather', ring(0.497, 0.104, 0.074, 0.012))
add('Bottom', 'J_Hips', 'Gold', limb((0, -0.08, 0.485), (0, -0.08, 0.51), 0.013, 0.013, sides=8, flat=0.45))
for s, k in (('L', 1), ('R', -1)):
    hip, kn, an = JP[f'J_UpperLeg_{s}'], JP[f'J_LowerLeg_{s}'], JP[f'J_Foot_{s}']
    add('Bottom', f'J_UpperLeg_{s}', 'Pants', limb(hip + np.array([0, 0, 0.03]), kn, 0.052, 0.043, round0=False))
    add('Bottom', f'J_LowerLeg_{s}', 'Pants', ellipsoid(kn, np.array([0.043, 0.043, 0.043]), 16, 10))
    # boots: a shaft with a turned-down cuff and a chunky rounded foot
    add('Boots', f'J_LowerLeg_{s}', 'Leather', limb(kn + np.array([0, 0, -0.03]), an + np.array([0, 0, -0.02]), 0.043, 0.041, round0=False, round1=False))
    add('Boots', f'J_LowerLeg_{s}', 'LeatherLight', limb(kn + np.array([0, 0, -0.012]), kn + np.array([0, 0, -0.05]), 0.05, 0.047, round0=False, round1=False))
    def foot(p, d, an=an):
        p = p.copy(); p[2] = max(p[2], 0.004); return p
    add('Boots', f'J_Foot_{s}', 'Leather', ellipsoid(an + np.array([0, -0.03, -0.03]), np.array([0.044, 0.078, 0.046]), 24, 14, foot))

# ---- the base body under the clothes (each part only shows while its slot is empty) ----
add('Body', 'J_Chest', 'Skin', loft([(0.47, 0.098, 0.066), (0.53, 0.086, 0.058), (0.6, 0.09, 0.062), (0.66, 0.097, 0.066),
                                     (0.705, 0.1, 0.064), (0.736, 0.092, 0.056), (0.758, 0.064, 0.044), (0.772, 0.04, 0.034)]), under='Top')
add('Body', 'J_Hips', 'Under', loft([(0.398, 0.064, 0.044), (0.418, 0.084, 0.056), (0.45, 0.09, 0.06), (0.49, 0.089, 0.06), (0.515, 0.088, 0.059)]), under='Bottom')
for s, k in (('L', 1), ('R', -1)):
    sh, el, wr = JP[f'J_UpperArm_{s}'], JP[f'J_LowerArm_{s}'], JP[f'J_Hand_{s}']
    hip, kn, an = JP[f'J_UpperLeg_{s}'], JP[f'J_LowerLeg_{s}'], JP[f'J_Foot_{s}']
    add('Body', f'J_UpperArm_{s}', 'Skin', ellipsoid(sh, np.array([0.033, 0.033, 0.033]), 16, 10), under='Top')
    add('Body', f'J_UpperArm_{s}', 'Skin', limb(sh, el, 0.028, 0.025, round0=False), under='Top')
    add('Body', f'J_LowerArm_{s}', 'Skin', limb(el, wr, 0.025, 0.022, round1=False), under='Top')
    add('Body', f'J_UpperLeg_{s}', 'Skin', limb(hip + np.array([0, 0, 0.02]), kn, 0.04, 0.033, round0=False), under='Bottom')
    add('Body', f'J_LowerLeg_{s}', 'Skin', ellipsoid(kn, np.array([0.033, 0.033, 0.033]), 12, 8), under='Bottom')
    add('Body', f'J_LowerLeg_{s}', 'Skin', limb(kn, an, 0.032, 0.026, round0=False), under='Boots')
    def bare(p, d):
        p = p.copy(); p[2] = max(p[2], 0.003); return p
    add('Body', f'J_Foot_{s}', 'Skin', ellipsoid(an + np.array([0, -0.026, -0.036]), np.array([0.032, 0.062, 0.036]), 16, 10, bare), under='Boots')

# ---- build the Blender objects ----
for (slot, joint, mat, under), parts in PIECES.items():
    verts, faces, uvs = [], [], []
    for v_, f_, uv in parts:
        if len(v_) == 0: continue
        o = len(verts); verts += [tuple(p - JP[joint]) for p in v_]; faces += [tuple(i + o for i in f) for f in f_]
        if uv is not None: uvs += uv
    if not faces: continue
    name = f'{slot}.{joint}.{mat}' + (f'.under{under}' if under else '')
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6) if not uvs else None
    if slot != 'Face': bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    if uvs:
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices: uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    for poly in me.polygons: poly.use_smooth = True
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me); scn.collection.objects.link(ob)
    ob.parent = EMPTIES[joint]; ob['slot'] = slot
    if under: ob['under'] = under
print('objects', len([o for o in scn.objects if o.type == 'MESH']), 'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scn.objects if o.type == 'MESH'))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_extras=True, export_apply=False)
print('exported', OUT)
