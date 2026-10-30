"""Skill crystal sizes (docs/SKILL-GROWTH-TH.md, phase 2b): the medium and large crystal icons are drawn
from the supplied small crystal (public/assets/icons/material/skill_crystal.png) - recoloured and grouped
into a cluster, so the three sizes read as one family. Run: python3 scripts/make-crystal-icons.py"""
import colorsys
from PIL import Image

SRC = 'public/assets/icons/material/skill_crystal.png'
OUT = 'public/assets/crystal/'

def recolour(im, hue_shift, sat=1.0, light=1.0):
    px = im.load()
    out = im.copy(); po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s > 0.15:  # the dark outline and white glints keep their colour
                h = (h + hue_shift) % 1; s = min(1, s * sat); l = min(1, l * light)
            r, g, b = colorsys.hls_to_rgb(h, l, s)
            po[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    return out

def cluster(base, parts):
    """parts: (scale, angle, dx, dy, mirror) back to front; the last one is the main crystal."""
    canvas = Image.new('RGBA', base.size)
    for scale, angle, dx, dy, mirror in parts:
        p = base.transpose(Image.FLIP_LEFT_RIGHT) if mirror else base
        p = p.rotate(angle, resample=Image.BICUBIC, expand=False)
        p = p.resize((round(p.width * scale), round(p.height * scale)), Image.LANCZOS)
        x = (canvas.width - p.width) // 2 + dx; y = (canvas.height - p.height) // 2 + dy
        canvas.alpha_composite(p, (x, y))
    return canvas

base = Image.open(SRC).convert('RGBA')
medium = recolour(base, 0.07, 1.05, 0.95)   # cyan -> blue
large = recolour(base, 0.24, 1.0, 0.95)     # cyan -> violet
cluster(medium, [(0.58, 28, -100, 74, True), (0.82, -6, 36, -10, False)]).save(OUT + 'skill_crystal_m.png', optimize=True)
cluster(large, [(0.52, 34, -112, 84, True), (0.54, -40, 112, 90, False), (0.8, -4, 0, -26, False)]).save(OUT + 'skill_crystal_l.png', optimize=True)
