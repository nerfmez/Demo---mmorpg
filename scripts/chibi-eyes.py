#!/usr/bin/env python3
"""Enlarge the painted eyes in the chibi body texture (characters.hero_chibi), in place.

The sheet's chibi has bigger eyes than the Meshy retexture painted. Each eye is the non-skin
region connected to the iris around a texture pixel; it is cleared to the skin colour and pasted
back scaled about that pixel. The JPEG is re-encoded once at the same quality as prep-chibi.py.

  python3 scripts/chibi-eyes.py public/models/hero_chibi.glb --eye 747 649 --eye 789 821 --scale 1.3
"""
import argparse
import importlib.util
import io
import os
from collections import deque

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('prep_chibi', os.path.join(os.path.dirname(__file__), 'prep-chibi.py'))
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def enlarge(img, eyes, scale, radius=60):
    a = np.asarray(img.convert('RGB')).astype(float)
    out = a.copy()
    cx, cy = eyes[0]
    skin = np.median(a[cy - 40:cy + 40, cx - 90:cx - 50].reshape(-1, 3), 0)
    other = np.abs(a - skin).sum(2) > 60
    for cx, cy in eyes:
        x0, y0, size = cx - radius, cy - radius, 2 * radius
        mask = np.zeros((size, size), bool)
        todo = deque([(cy - y0, cx - x0)])
        mask[todo[0]] = True
        while todo:
            y, x = todo.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    Y, X = y + dy, x + dx
                    if 0 <= Y < size and 0 <= X < size and not mask[Y, X] and other[y0 + Y, x0 + X]:
                        mask[Y, X] = True
                        todo.append((Y, X))
        grown = mask.copy()  # one pixel more, so the anti-aliased rim is cleared too
        grown[1:] |= mask[:-1]; grown[:-1] |= mask[1:]; grown[:, 1:] |= mask[:, :-1]; grown[:, :-1] |= mask[:, 1:]
        patch = a[y0:y0 + size, x0:x0 + size].copy()
        out[y0:y0 + size, x0:x0 + size][grown] = skin
        s = int(size * scale)
        p = np.asarray(Image.fromarray(patch.astype(np.uint8)).resize((s, s), Image.LANCZOS)).astype(float)
        m = np.asarray(Image.fromarray((grown * 255).astype(np.uint8)).resize((s, s), Image.BILINEAR))[..., None] / 255.0
        ox, oy = cx - s // 2, cy - s // 2
        out[oy:oy + s, ox:ox + s] = out[oy:oy + s, ox:ox + s] * (1 - m) + p * m
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('--eye', type=int, nargs=2, action='append', required=True, help='texture pixel x y at the iris')
    ap.add_argument('--scale', type=float, default=1.3)
    ap.add_argument('--quality', type=int, default=88)
    a = ap.parse_args()
    j, bin_ = prep.read_glb(a.glb)
    views = j['bufferViews']
    chunks = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    img = j['images'][0]
    im = enlarge(Image.open(io.BytesIO(chunks[img['bufferView']])), a.eye, a.scale)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=a.quality, optimize=True)
    chunks[img['bufferView']] = buf.getvalue()
    prep.write_glb(a.glb, j, chunks)


if __name__ == '__main__':
    main()
