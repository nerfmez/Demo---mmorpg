# Paint the chibi face like the Meshy outfit sheets' faces (characters.hero_chibi): the texture is
# doubled to 2048 so the new strokes stay crisp, then, working in the head's own space (each
# texel's point on the bind-pose mesh), the irises get a dark top fading to a light lower half and
# two catch-lights, and the cheeks a soft blush with three fine strokes. Rewrites the texture only.
#   python3 scripts/paint-chibi-face.py public/models/hero_chibi.glb out.glb
import json, struct, io, sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); bin0 = 20 + n + 8
binlen = struct.unpack('<I', b[20 + n:24 + n])[0]; BIN = b[bin0:bin0 + binlen]
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]; nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.frombuffer(BIN, dt, a['count'] * nc, off).reshape(a['count'], nc) if nc > 1 else np.frombuffer(BIN, dt, a['count'], off)
pr = [m for m in j['meshes'] if 'JOINTS_0' in m['primitives'][0]['attributes']][0]['primitives'][0]
P = acc(pr['attributes']['POSITION']).astype(float); UV = acc(pr['attributes']['TEXCOORD_0']).astype(float); I = acc(pr['indices']).reshape(-1, 3)
img = j['images'][0]; ibv = j['bufferViews'][img['bufferView']]
im = Image.open(io.BytesIO(BIN[ibv.get('byteOffset', 0):ibv.get('byteOffset', 0) + ibv['byteLength']])).convert('RGB')
S = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
if im.size[0] < S: im = im.resize((S, S), Image.LANCZOS)
a = np.asarray(im).astype(float)
# each texel's point on the mesh (barycentric over the triangle it lies in), on the head only
XYZ = np.full((S, S, 3), np.nan)
head = P[:, 1] > 0.8
for t in I:
    if not head[t].all(): continue
    uv = UV[t] * S; x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
    gx, gy = np.meshgrid(np.arange(max(x0, 0), min(x1, S)) + 0.5, np.arange(max(y0, 0), min(y1, S)) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9: continue
    w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den; w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den; w2 = 1 - w0 - w1
    ins = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
    if not ins.any(): continue
    p = w0[..., None] * P[t[0]] + w1[..., None] * P[t[1]] + w2[..., None] * P[t[2]]
    ys, xs = gy[ins].astype(int), gx[ins].astype(int)
    XYZ[ys, xs] = p[ins]
ok = ~np.isnan(XYZ[..., 0])
iris = ok & (a[..., 2] - a[..., 0] > 25) & (a[..., 2] > 70)
XYZ[~ok] = 99  # texels off the head: far from every stroke
X, Y, Z = XYZ[..., 0], XYZ[..., 1], XYZ[..., 2]
skin = np.median(a[ok & ~iris & (a[..., 0] > 200) & (a[..., 0] - a[..., 2] > 15)], 0)
for sd in (1, -1):
    e = iris & (np.sign(X) == sd)
    cx = X[e].mean(); y0, y1 = Y[e].min(), Y[e].max(); h = y1 - y0
    ty = np.clip((Y - y0) / h, 0, 1)
    # the iris: dark under the upper lid, light toward the lower lid
    dark = (0.65 * np.clip((ty - 0.45) / 0.4, 0, 1))[..., None] * e[..., None]
    light = (0.5 * np.clip((0.5 - ty) / 0.4, 0, 1))[..., None] * e[..., None]
    a = a + (np.array([28, 36, 70]) - a) * dark + (np.array([140, 190, 235]) - a) * light
    # catch-lights: a large one high on the outer side, a small one low on the inner side
    for ox, oy, r in ((0.18 * sd, 0.68, 0.17), (-0.16 * sd, 0.25, 0.08)):
        d = np.hypot((X - (cx + ox * h)) / (r * h), (Y - (y0 + oy * h)) / (r * h))
        k = (np.clip((1 - d) * 6, 0, 1) * e)[..., None]
        a = a + (255 - a) * k
    # the blush under the eye, out toward the cheek, with three fine strokes
    bx, by = cx + 0.012 * sd, y0 - 0.022
    d2 = ((X - bx) / 0.034) ** 2 + ((Y - by) / 0.016) ** 2
    cheek = ok & ~iris & (Z > 0.08) & (np.abs(a - skin).sum(-1) < 60)
    k = (0.3 * np.exp(-d2 * 1.4) * cheek)[..., None]
    a = a + (np.array([250, 150, 150]) - a) * k
    for i in (-1, 0, 1):
        u = (X - bx - i * 0.011) * sd; v = Y - by
        line = np.abs(u - 0.6 * v) < 0.0016
        k = (0.18 * line * (np.abs(v) < 0.006) * cheek)[..., None]
        a = a + (np.array([235, 110, 110]) - a) * k
    print('eye', sd, 'centre x %.3f y %.3f..%.3f' % (cx, y0, y1))
out = io.BytesIO(); Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(out, 'JPEG', quality=86)  # under the 600 KB character budget
data = out.getvalue()
views = j['bufferViews']; newbin = b''
for k in sorted(range(len(views)), key=lambda k: views[k].get('byteOffset', 0)):
    v = views[k]; blob = data if k == img['bufferView'] else BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    while len(newbin) % 4: newbin += b'\0'
    v['byteOffset'] = len(newbin); v['byteLength'] = len(blob); newbin += blob
while len(newbin) % 4: newbin += b'\0'
j['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(newbin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(newbin), 0x004E4942) + newbin)
