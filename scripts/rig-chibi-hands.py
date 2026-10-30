# Give the chibi hero's hands finger bones (public/models/hero_chibi.glb, in place): the Meshy body
# came with one bone per hand, so a fist was a procedural bend of the whole hand and a glove made
# on another hand bent its own way. Each hand gets a thumb and four fingers of three bones each
# (Left|RightHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}, Mixamo's names), placed from the hand's own
# shape: the fingers are the separate tubes of the mesh past the knuckles, the thumb the tube
# hanging in front of the palm. The hand's skin weight is shared out among them along each finger
# (blended over a few millimetres at each joint). Only the skin (JOINTS_0, WEIGHTS_0, rewritten in
# place), the skeleton and its inverse-bind matrices change: the vertices and triangles keep their
# order, so the outfits' `hideBody` lists stay valid. Run once on the body without finger bones:
#   python3 scripts/rig-chibi-hands.py [public/models/hero_chibi.glb]
import json, struct, sys
import numpy as np

PATH = sys.argv[1] if len(sys.argv) > 1 else 'public/models/hero_chibi.glb'
FINGERS = ('Index', 'Middle', 'Ring', 'Pinky')  # front (thumb side) to back

raw = open(PATH, 'rb').read()
jlen = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jlen])
blen = struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]
BIN = bytearray(raw[28 + jlen:28 + jlen + blen])
names = [n['name'] for n in J['nodes']]
if any(n.startswith('LeftHandIndex') for n in names): raise SystemExit('already has finger bones')


def accessor(i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]
    dt = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(BIN, dt, a['count'] * n, off).reshape(a['count'], n), off, dt


prim = J['meshes'][0]['primitives'][0]
POS = accessor(prim['attributes']['POSITION'])[0].astype(float)
TRI = accessor(prim['indices'])[0].reshape(-1, 3)
JNT, joff, jdt = accessor(prim['attributes']['JOINTS_0'])
WGT, woff, wdt = accessor(prim['attributes']['WEIGHTS_0'])
JNT, WGT = JNT.astype(int).copy(), WGT.astype(float).copy()
skin = J['skins'][0]
IBM = accessor(skin['inverseBindMatrices'])[0].reshape(-1, 4, 4).transpose(0, 2, 1).astype(float)  # column-major
joints = list(skin['joints'])
jname = [names[i] for i in joints]

# the hand's frame for measuring: x out along the arm (mirrored for the right hand), y toward the
# front (the thumb's side), z up (the T-pose palm faces down)
side = lambda s: np.stack([s * POS[:, 0], POS[:, 2], POS[:, 1]], 1)


def loops(P, ax, c, sel):
    """the cut of the hand's triangles at P[:, ax] == c: each closed piece's middle and size"""
    d = P[TRI][:, :, ax] - c
    cr = (d.min(1) < 0) & (d.max(1) > 0) & sel
    key = {tuple(p): k for k, p in enumerate(np.round(P, 5))}
    wid = np.array([key[tuple(p)] for p in np.round(P, 5)])
    par = {}
    def find(a):
        while par.setdefault(a, a) != a: a = par[a]
        return a
    segs = []
    for t, dd in zip(TRI[cr], d[cr]):
        e = []
        for i, k in ((0, 1), (1, 2), (2, 0)):
            if (dd[i] < 0) != (dd[k] < 0):
                f = dd[i] / (dd[i] - dd[k]); e.append((tuple(sorted((wid[t[i]], wid[t[k]]))), P[t[i]] + f * (P[t[k]] - P[t[i]])))
        if len(e) == 2: segs.append(e); par[find(e[0][0])] = find(e[1][0])
    comp = {}
    for (a, p), (b, q) in segs: comp.setdefault(find(a), []).extend([p, q])
    return sorted((np.mean(v, 0) for v in comp.values()), key=lambda m: -m[1])  # front first


def landmarks(s):
    """joint positions (in the measuring frame) of one hand: thumb and four fingers, 4 points each
    (the bone heads and the tip)"""
    P = side(s)
    hand = P[TRI][:, :, 0].min(1) > 0.33
    tip = P[:, 0].max()
    # the fingers part where the cut first falls into four pieces; their lines from the slices beyond
    xs = np.arange(0.45, tip, 0.0025)
    cuts = [(x, loops(P, 0, x, hand)) for x in xs]
    four = [(x, c) for x, c in cuts if len(c) == 4]
    base = four[0][0]
    out = {}
    for k, f in enumerate(FINGERS):
        ys = np.array([c[k][1] for x, c in four]); zs = np.array([c[k][2] for x, c in four])
        # the finger's own tip: the farthest vertex near its line
        near = (np.abs(P[:, 1] - ys.mean()) < 0.008) & (P[:, 0] > base)
        end = P[near, 0].max()
        line = lambda x: np.array([x, np.interp(x, [c[0] for c in four], ys), np.interp(x, [c[0] for c in four], zs)])
        L = end - base
        # the knuckle a little inside the palm, then the two finger joints along the visible finger
        out[f] = [line(base - 0.008), line(base + 0.45 * L), line(base + 0.75 * L), line(end)]
    # the thumb: the piece hanging in front of the palm, cut across its length (front to back)
    th = hand & (P[TRI][:, :, 0].max(1) < base)
    ys = np.arange(P[:, 1].max() - 0.002, out['Index'][0][1], -0.002)
    mids = [(y, loops(P, 1, y, th)) for y in ys]
    mids = [(y, c[0]) for y, c in mids if len(c) == 1]
    tipv = P[P[:, 0] > 0.38][np.argmax(P[P[:, 0] > 0.38][:, 1])]
    root = mids[-1][1]  # where the thumb meets the palm, behind its front edge
    # its joints from the root to the tip along the slices' middles (the base well inside the palm)
    path = np.array([m for _, m in mids][::-1] + [tipv])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    at = lambda f: np.array([np.interp(f * seg[-1], seg, path[:, i]) for i in range(3)])
    out['Thumb'] = [at(0.0), at(0.4), at(0.7), at(1.0)]
    return out


def weights(s, L):
    """per vertex of that hand: {finger bone name: share of the hand's weight}"""
    P = side(s)
    res = {}
    fin = list(FINGERS)
    for v in np.nonzero(P[:, 0] > 0.36)[0]:
        p = P[v]
        # which finger (or thumb, or none: the palm): the nearest bone line, within reach
        best, bd, bt = None, 1e9, 0
        for f, pts in L.items():
            for b in range(3):
                a, c = pts[b], pts[b + 1]
                t = np.clip(np.dot(p - a, c - a) / np.dot(c - a, c - a), 0, 1)
                d = np.linalg.norm(p - (a + t * (c - a)))
                if d < bd: best, bd, bt, bb = f, d, t, b
        pts = L[best]
        # along that finger: how far past each joint (with a short blend across it)
        u = np.array([np.dot(p - pts[0], pts[1] - pts[0]) / np.linalg.norm(pts[1] - pts[0]) ** 2,
                      np.dot(p - pts[1], pts[2] - pts[1]) / np.linalg.norm(pts[2] - pts[1]) ** 2,
                      np.dot(p - pts[2], pts[3] - pts[2]) / np.linalg.norm(pts[3] - pts[2]) ** 2])
        blend = lambda x, w: float(np.clip(0.5 + x / w, 0, 1))
        lens = [np.linalg.norm(pts[i + 1] - pts[i]) for i in range(3)]
        b1 = blend(u[0] * lens[0] - (0.002 if best != 'Thumb' else 0.25 * lens[0]), 0.012)  # palm -> 1
        b2 = blend(u[1] * lens[1], 0.007)  # 1 -> 2
        b3 = blend(u[2] * lens[2], 0.006)  # 2 -> 3
        # a palm point far from every finger stays on the hand
        reach = 0.016 if best != 'Thumb' else 0.02
        if bd > reach: continue
        w3 = b1 * b2 * b3; w2 = b1 * b2 * (1 - b3); w1 = b1 * (1 - b2)
        res[v] = {f'{best}1': w1, f'{best}2': w2, f'{best}3': w3}
    return res


# --- the new bones: children of each hand, chained along each finger
new_ibm = [m for m in IBM]
for s, side_name in ((1, 'Left'), (-1, 'Right')):
    L = landmarks(s)
    for f, pts in L.items(): print(side_name, f, np.round(pts, 3).tolist())
    hand = names.index(side_name + 'Hand')
    hj = joints.index(hand)
    # measuring frame -> mesh space
    mesh = lambda p: np.array([s * p[0], p[2], p[1], 1.0])
    for f, pts in L.items():
        parent, pj = hand, hj
        for b in range(3):
            local = (new_ibm[pj] @ mesh(pts[b]))[:3]
            node = {'name': f'{side_name}Hand{f}{b + 1}', 'translation': local.tolist()}
            J['nodes'].append(node); ni = len(J['nodes']) - 1
            J['nodes'][parent].setdefault('children', []).append(ni)
            T = np.eye(4); T[:3, 3] = local
            m = np.linalg.inv(T) @ new_ibm[pj]
            joints.append(ni); new_ibm.append(m)
            parent, pj = ni, len(joints) - 1
    # the skin: the hand's weight shared out
    node_of = {n['name']: i for i, n in enumerate(J['nodes'])}
    W = weights(s, L)
    for v, share in W.items():
        idx = {int(JNT[v, k]): WGT[v, k] for k in range(4) if WGT[v, k] > 0}
        h = idx.pop(hj, 0.0)
        if h <= 0: continue
        rest = 1 - sum(share.values())
        if rest > 1e-6: idx[hj] = h * rest
        for bn, w in share.items():
            if w > 1e-6:
                k = joints.index(node_of[f'{side_name}Hand{bn}'])
                idx[k] = idx.get(k, 0) + h * w
        top = sorted(idx.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w for _, w in top)
        JNT[v] = [k for k, _ in top] + [0] * (4 - len(top))
        WGT[v] = [w / tot for _, w in top] + [0.0] * (4 - len(top))
    print(side_name, 'vertices on finger bones', len(W))
names = [n['name'] for n in J['nodes']]
skin['joints'] = joints

# rewrite the skin in place (same sizes), and the inverse-bind matrices appended to the buffer
if len(joints) > 255: raise SystemExit('too many joints for UNSIGNED_BYTE')
BIN[joff:joff + JNT.size] = JNT.astype(jdt).tobytes()
BIN[woff:woff + WGT.size * 4] = WGT.astype(wdt).tobytes()
BIN = bytearray(bytes(BIN))  # (the numpy views above hold the old one)
while len(BIN) % 16: BIN.append(0)
mats = np.array([m.T for m in new_ibm], np.float32).reshape(-1)
J['bufferViews'].append({'buffer': 0, 'byteOffset': len(BIN), 'byteLength': mats.nbytes})
BIN += mats.tobytes()
J['accessors'].append({'bufferView': len(J['bufferViews']) - 1, 'componentType': 5126, 'count': len(new_ibm), 'type': 'MAT4'})
skin['inverseBindMatrices'] = len(J['accessors']) - 1
J['buffers'][0]['byteLength'] = len(BIN)
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(BIN) % 4: BIN.append(0)
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(BIN)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(BIN)) + b'BIN\x00' + bytes(BIN)
open(PATH, 'wb').write(out)
print('wrote', PATH, len(joints), 'joints')
