# Cut one face's features (eyes, brows, mouth, blush, tears) off a bald-head sheet cell as an RGBA
# decal over the skin: alpha from each pixel's distance to the skin colour, inside the head (not
# its outline or ears). The decal covers u in [-U, U] head widths about the head's middle and v in
# [V0, 1] of the way from the head's top to its chin.
import sys, json, numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, box, out = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
U, V0, OW, OH = 0.5, 0.34, 512, 352
a = np.array(Image.open(src).convert('RGB')).astype(float)
x0, y0, x1, y1 = box[:4]
pad = 12; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
c = a[y0:y1, x0:x1]
r, g, b = c[..., 0], c[..., 1], c[..., 2]
skin = (r > 200) & (r - b > 18) & (r - b < 90) & (g > 170)
H, W = skin.shape
# the head: the skin piece in the middle of the cell, holes (the features) filled
lab = np.zeros(skin.shape, bool); q = deque()
sy, sx = int(H * 0.3), W // 2
while not skin[sy, sx]: sy += 1
q.append((sy, sx)); lab[sy, sx] = True
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and skin[ny, nx] and not lab[ny, nx]: lab[ny, nx] = True; q.append((ny, nx))
# fill holes: everything not reachable from the border through non-head pixels
out_ = np.zeros(skin.shape, bool); q = deque()
for y in range(H):
    for x in (0, W - 1):
        if not lab[y, x]: out_[y, x] = True; q.append((y, x))
for x in range(W):
    for y in (0, H - 1):
        if not lab[y, x] and not out_[y, x]: out_[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and not lab[ny, nx] and not out_[ny, nx]: out_[ny, nx] = True; q.append((ny, nx))
head = ~out_
rows = [np.where(lab[y])[0] for y in range(H)]
ys = [y for y in range(H) if len(rows[y])]
top = ys[0]
yq = top + int((ys[-1] - top) * 0.22)
cx = (rows[yq].min() + rows[yq].max()) / 2; hw = rows[yq].max() - rows[yq].min()
# the chin: the lowest row the head is at least half its width
chin = max(y for y in ys if rows[y].max() - rows[y].min() > 0.5 * hw)
skinc = np.median(c[lab & (np.abs(np.arange(W)[None, :] - cx) < 0.3 * hw)], axis=0)
# the face: inside an ellipse a little within the head's outline (the outline, ears and neck stay out)
yy, xx = np.mgrid[0:H, 0:W]
inner = (((xx - cx) / (0.455 * hw)) ** 2 + ((yy - (top + chin) / 2) / (0.47 * (chin - top))) ** 2) < 1
d = np.sqrt(((c - skinc) ** 2).sum(-1))
alpha = np.clip((d - 10) / 60, 0, 1) * inner
# unblend from the skin: the feature's own colour
al = np.maximum(alpha, 1e-3)[..., None]
col = np.clip((c - skinc * (1 - al)) / al, 0, 255)
rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')
# resample into the decal frame
L = cx - U * hw; R = cx + U * hw; T = top + V0 * (chin - top); B = chin
dec = im.transform((OW, OH), Image.EXTENT, (L, T, R, B), Image.BICUBIC)
dec.save(out)
print(json.dumps({'skin': skinc.round().tolist(), 'headW': int(hw), 'top': top, 'chin': chin, 'cx': cx}))
