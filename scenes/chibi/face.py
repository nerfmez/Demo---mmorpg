# The chibi hero's painted face: a 2x2 atlas (open, blink / happy, hurt), each cell covering a
# 0.30 m square of the face, centred 0.93 m up (u = 0.5 + x/0.30, v = 0.5 + (z - 0.93)/0.30).
# Drawn 4x larger and shrunk for smooth edges. Usage: python3 face.py out.png
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
S = 2048                      # one cell at 4x
M2P = S / 0.30                # metres to pixels
def P(x, z): return ((0.5 + x / 0.30) * S, (0.5 - (z - 0.93) / 0.30) * S)
INK, BROW, MOUTH = (38, 26, 40, 255), (40, 38, 72, 255), (128, 48, 52, 255)
EX, EZ, W, H = 0.058, 0.925, 0.062 * M2P, 0.072 * M2P

def arc(cx, cy, w, h, s, t0, t1, n=40):
    # points on a curve across the eye: t in [-1 (inner), 1 (outer)]; h > 0 bulges up
    return [(cx + s * t * w / 2, cy - h * (1 - t * t)) for t in np.linspace(t0, t1, n)]

def band(d, pts, w0, w1, col):
    # a stroke that tapers from w0 to w1 along pts
    n = len(pts)
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]; w = w0 + (w1 - w0) * i / (n - 1)
        d.line([a, b], fill=col, width=max(1, int(w)))
        d.ellipse([a[0] - w / 2, a[1] - w / 2, a[0] + w / 2, a[1] + w / 2], fill=col)

def eye_open(img, cx, cy, s):
    # the opening: a tall rounded oval, cut across the top by the heavy lid curve
    lid = [(cx + s * t * W * 0.56, cy - H * 0.44 * (1 - t * t) ** 0.7 - H * 0.06 * (t + 1) / 2 + H * 0.02) for t in np.linspace(-1, 1, 40)]
    ex, ey, rx, ry = cx, cy + H * 0.04, W * 0.5, H * 0.47
    mask = Image.new('L', img.size, 0); md = ImageDraw.Draw(mask)
    md.ellipse([ex - rx, ey - ry, ex + rx, ey + ry], fill=255)
    md.polygon(lid + [(lid[-1][0], 0), (lid[0][0], 0)], fill=0)
    layer = Image.new('RGBA', img.size, (255, 255, 255, 255))
    # the iris: a tall oval, dark blue at the top to bright sky blue at the bottom, with a dark rim
    ix, iy, iw, ih = cx + s * W * 0.02, cy + H * 0.04, W * 0.82, H * 0.9
    yy, xx = np.mgrid[0:img.size[1], 0:img.size[0]]
    inside = ((xx - ix) / (iw / 2)) ** 2 + ((yy - iy) / (ih / 2)) ** 2
    g = np.clip((yy - (iy - ih / 2)) / ih, 0, 1)[..., None]
    c0, c1, c2 = np.array([24, 40, 104]), np.array([44, 98, 206]), np.array([118, 196, 255])
    col = np.where(g < 0.55, c0 + (c1 - c0) * (g / 0.55), c1 + (c2 - c1) * ((g - 0.55) / 0.45))
    col = np.where(((inside > 0.8) & (inside <= 1))[..., None], np.array([20, 30, 76]), col)
    a = (inside <= 1).astype(np.uint8) * 255
    layer.alpha_composite(Image.fromarray(np.dstack([col.astype(np.uint8), a]), 'RGBA'))
    d = ImageDraw.Draw(layer)
    # pupil, a glow along the bottom, two highlights
    d.ellipse([ix - W * 0.16, iy - H * 0.26, ix + W * 0.16, iy + H * 0.10], fill=(14, 20, 52, 255))
    d.chord([ix - iw * 0.3, iy + ih * 0.16, ix + iw * 0.3, iy + ih * 0.42], 10, 170, fill=(160, 222, 255, 255))
    d.ellipse([ix - W * 0.30, iy - H * 0.34, ix - W * 0.04, iy - H * 0.10], fill=(255, 255, 255, 255))
    d.ellipse([ix + W * 0.10, iy + H * 0.12, ix + W * 0.21, iy + H * 0.23], fill=(255, 255, 255, 255))
    layer.putalpha(mask)
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    # the heavy upper lid with a flick at the outer corner, a short lower lash on the outside
    band(d, lid, H * 0.07, H * 0.13, INK)
    ox, oy = lid[-1]
    d.polygon([(ox - s * W * 0.08, oy - H * 0.07), (ox + s * W * 0.18, oy - H * 0.13), (ox + s * W * 0.01, oy + H * 0.07)], fill=INK)
    band(d, [(ex + s * rx * math.cos(t), ey + ry * math.sin(t)) for t in np.linspace(0.3, 1.15, 16)], H * 0.045, H * 0.016, INK)

def eye_closed(img, cx, cy, s, shape):
    d = ImageDraw.Draw(img)
    if shape == 'blink':   # a soft downward curve
        band(d, arc(cx, cy + H * 0.12, W * 1.04, -H * 0.12, s, -1, 1), H * 0.06, H * 0.1, INK)
    elif shape == 'happy':  # ^
        band(d, arc(cx, cy + H * 0.1, W * 0.96, H * 0.3, s, -1, 1), H * 0.08, H * 0.08, INK)
    else:                  # > <
        p = [(cx + s * W * 0.42, cy - H * 0.22), (cx - s * W * 0.34, cy + H * 0.04), (cx + s * W * 0.42, cy + H * 0.3)]
        band(d, p, H * 0.08, H * 0.08, INK)

def cell(kind):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    # blush: soft pink under the outer half of each eye
    blush = Image.new('RGBA', (S, S), (0, 0, 0, 0)); bd = ImageDraw.Draw(blush)
    for s in (-1, 1):
        cx, cy = P(s * (EX + 0.008), EZ - 0.04)
        bd.ellipse([cx - W * 0.42, cy - H * 0.12, cx + W * 0.42, cy + H * 0.12], fill=(255, 128, 140, 110))
    img.alpha_composite(blush.filter(ImageFilter.GaussianBlur(S * 0.012)))
    d = ImageDraw.Draw(img)
    for s in (-1, 1):
        cx, cy = P(s * EX, EZ)
        # brows: short thin arcs (mostly under the fringe)
        band(d, arc(cx + s * W * 0.04, cy - H * 0.86, W * 0.72, H * 0.08, s, -1, 0.9, 20), H * 0.03, H * 0.045, BROW)
        if kind == 'open': eye_open(img, cx, cy, s)
        else: eye_closed(img, cx, cy, s, kind)
    d = ImageDraw.Draw(img)
    mx, my = P(0, 0.856)
    if kind == 'happy':     # an open smile
        d.chord([mx - 0.016 * M2P, my - 0.010 * M2P, mx + 0.016 * M2P, my + 0.016 * M2P], 0, 180, fill=(150, 44, 56, 255))
        d.chord([mx - 0.009 * M2P, my + 0.004 * M2P, mx + 0.009 * M2P, my + 0.015 * M2P], 180, 360, fill=(240, 120, 128, 255))
    elif kind == 'hurt':    # a small open "o"
        d.ellipse([mx - 0.006 * M2P, my - 0.004 * M2P, mx + 0.006 * M2P, my + 0.008 * M2P], fill=(150, 44, 56, 255))
    else:                   # a small calm smile
        band(d, [(mx - 0.011 * M2P + t * 0.022 * M2P, my + 0.004 * M2P * math.sin(math.pi * t)) for t in np.linspace(0, 1, 16)], S * 0.006, S * 0.006, MOUTH)
    return img.resize((S // 4, S // 4), Image.LANCZOS)

atlas = Image.new('RGBA', (S // 2, S // 2), (0, 0, 0, 0))
for i, k in enumerate(['open', 'blink', 'happy', 'hurt']):
    atlas.paste(cell(k), ((i % 2) * S // 4, (i // 2) * S // 4))
atlas.save(sys.argv[1]); print('face atlas', atlas.size)
