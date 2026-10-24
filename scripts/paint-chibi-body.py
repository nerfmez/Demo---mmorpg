# Paint the chibi body's dark under-suit bands on the forearms, hands and neck in its skin colour
# (the modelled outfits leave those parts bare). Rewrites the GLB's texture only; already applied
# to public/models/hero_chibi.glb.
#   python3 scripts/paint-chibi-body.py public/models/hero_chibi.glb out.glb
import json, struct, io, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); bin0 = 20 + n + 8
binlen = struct.unpack('<I', b[20 + n:24 + n])[0]; BIN = b[bin0:bin0 + binlen]
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]; nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.frombuffer(BIN, dt, a['count'] * nc, off).reshape(a['count'], nc) if nc > 1 else np.frombuffer(BIN, dt, a['count'], off)
pr = [m for m in j['meshes'] if 'JOINTS_0' in m['primitives'][0]['attributes']][0]['primitives'][0]
P = acc(pr['attributes']['POSITION']); UV = acc(pr['attributes']['TEXCOORD_0']); I = acc(pr['indices']).reshape(-1, 3)
img = j['images'][0]; bv = j['bufferViews'][img['bufferView']]
im = Image.open(io.BytesIO(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB'); W, H = im.size
a = np.asarray(im).astype(float)
mask = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(mask)
for t in I:
    c = P[t].mean(0)
    arm = abs(c[0]) > 0.17 and c[1] > 0.6
    neck = 0.785 < c[1] < 0.86 and abs(c[0]) < 0.09
    if arm or neck: dr.polygon([(UV[k][0] * W, UV[k][1] * H) for k in t], fill=255)
m = np.asarray(mask.filter(ImageFilter.MaxFilter(5))) > 0
mx, mn = a.max(2), a.min(2)
skinpx = (mx - mn > 30) & (a[:, :, 0] > 200)
skin = np.median(a[skinpx & m], axis=0)
dark = m & ~((mx - mn > 22) & (a[:, :, 0] > 170))
print('skin', skin.round(), 'painted px', dark.sum())
a[dark] = skin
out = io.BytesIO(); Image.fromarray(a.astype(np.uint8)).save(out, 'JPEG', quality=92); data = out.getvalue()
# rebuild the binary chunk with the new image
views = j['bufferViews']; chunks = []; pos = 0; newbin = b''
order = sorted(range(len(views)), key=lambda k: views[k].get('byteOffset', 0))
for k in order:
    v = views[k]; blob = data if k == img['bufferView'] else BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    while len(newbin) % 4: newbin += b'\0'
    v['byteOffset'] = len(newbin); v['byteLength'] = len(blob); newbin += blob
while len(newbin) % 4: newbin += b'\0'
j['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(newbin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(newbin), 0x004E4942) + newbin)
