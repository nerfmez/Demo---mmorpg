# The iris of each drawn face (public/models/faces/<id>.png) as a grey mask the size of the face
# (public/models/faces/iris/<id>.png), so the look's eye colour recolours the iris alone
# (chibi-body.js faceDecalMaterial), not the brows, lashes, whites, mouth or blush.
# The iris's hue is the face's own: that of its coloured, mid-bright drawing above the mouth. The iris
# is what lies near that hue there, coloured, neither dark (the lash line, the pupil) nor near-white
# (the white and its glints) nor light pink (lid blush), in the two largest such pieces (a brow of the
# same hue is a thin stroke above). A grey iris (too little coloured drawing) is the mid-grey inside the
# two open eye shapes; closed eyes (lines) and a white stare have none: the owner, 29 October 2026,
# faces that show no iris keep their eyes. Usage: python3 scripts/face-iris-mask.py [face ids...] (all faces when none are given)
import sys, glob, os
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

FACES = 'public/models/faces'


def pieces(feat):
    """Connected drawn pieces (8-neighbour): a list of (area, cy, cx, y0, y1, x0, x1)."""
    H, W = feat.shape
    seen = np.zeros_like(feat)
    out = []
    for sy, sx in zip(*np.nonzero(feat)):
        if seen[sy, sx]: continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; ys, xs = [], []
        while q:
            y, x = q.popleft(); ys.append(y); xs.append(x)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and feat[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
        out.append((len(ys), np.mean(ys), np.mean(xs), min(ys), max(ys), min(xs), max(xs)))
    return out


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def grey(rgb, alpha, sat, lum, pink, above):
    """An open grey iris (no coloured drawing): the mid-grey inside the two eye shapes (the largest drawn
    pieces above the mouth, each taller than a closed eye's line), below their lash lines."""
    H, W = alpha.shape
    shapes = sorted((p for p in pieces((alpha > 0.35) & above) if p[0] > 400), reverse=True)[:2]
    m = np.zeros((H, W))
    ys = np.arange(H)[:, None] * np.ones((1, W))
    for _, _, _, y0, y1, x0, x1 in shapes:
        if (y1 - y0) < 0.35 * (x1 - x0): continue  # a closed eye: a line
        box = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        m[box] = (smooth(lum[box], 0.3, 0.4) * (1 - smooth(lum[box], 0.78, 0.88)) * (1 - smooth(sat[box], 0.2, 0.3))
                  * smooth((ys[box] - y0) / max(1, y1 - y0), 0.25, 0.4) * smooth(alpha[box], 0.3, 0.6) * (1 - pink[box]))
    if (m > 0.5).sum() < 1500: return Image.new('L', (W, H)), None  # a white stare: no iris
    return Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.7)), 'grey'


def mask(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(float) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    H, W = alpha.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    lum = rgb @ [0.299, 0.587, 0.114]
    hue = np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)  # radians round the colour wheel
    pink = (r > g + 0.05) & (np.abs(g - b) < 0.1) & (lum > 0.6)  # lid blush, a tear's glint
    above = np.arange(H)[:, None] < 0.72 * H  # the eyes: above the mouth
    # the iris's own hue: the peak (15-degree bins, smoothed) of the face's coloured, mid-bright
    # drawing above the mouth; too little there (closed eyes, a white stare, a grey iris) is none
    col = above & (alpha > 0.5) & (sat > 0.15) & (lum > 0.25) & (lum < 0.85) & ~pink
    deg = np.degrees(hue) % 360
    hist = np.bincount((deg[col] // 15).astype(int), minlength=24)
    hist = hist + np.roll(hist, 1) + np.roll(hist, -1)
    if hist.max() < 3800: return grey(rgb, alpha, sat, lum, pink, above)
    h0 = np.radians(hist.argmax() * 15 + 7.5)
    near = 1 - smooth(np.abs(np.angle(np.exp(1j * (hue - h0)))), np.radians(30), np.radians(50))
    # coloured, near that hue, not dark (the lash line, the pupil), not white (the white, glints)
    m = smooth(sat, 0.1, 0.2) * near * smooth(lum, 0.16, 0.28) * (1 - smooth(lum, 0.86, 0.96))
    m *= smooth(alpha, 0.3, 0.6) * (1 - pink) * above
    # the irises: the two largest such pieces (a brow of the same hue is a thin stroke above)
    # (one eye closed: the other piece is far smaller), its top faded (a lash line of the iris's hue)
    eyes = sorted(pieces(m > 0.4), reverse=True)[:2]
    eyes = [e for e in eyes if e[0] >= 0.3 * eyes[0][0]]
    keep = np.zeros_like(m)
    ys = np.arange(H)[:, None] * np.ones((1, W))
    for _, _, _, y0, y1, x0, x1 in eyes:
        box = (slice(max(0, y0 - 4), y1 + 5), slice(max(0, x0 - 4), x1 + 5))
        keep[box] = smooth((ys[box] - y0) / max(1, y1 - y0), 0.08, 0.2)
    m *= keep
    img = Image.fromarray((m * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(0.7))
    return img, round(float(np.degrees(h0)) % 360)


ids = sys.argv[1:] or sorted(os.path.basename(p)[:-4] for p in glob.glob(f'{FACES}/*.png'))
os.makedirs(f'{FACES}/iris', exist_ok=True)
for i in ids:
    img, n = mask(f'{FACES}/{i}.png')
    img.save(f'{FACES}/iris/{i}.png', optimize=True)
    print(i, 'iris hue', n, 'px', int((np.array(img) > 128).sum()))
