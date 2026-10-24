# segment an image into dirt / stone / foliage / dark, as flat colour maps, and stack concept over render
import sys, colorsys
from PIL import Image, ImageFilter
def seg(path, W=600, H=338):
    im = Image.open(path).convert('RGB').resize((W, H)).filter(ImageFilter.MedianFilter(7))
    out = Image.new('RGB', (W, H))
    px, o = im.load(), out.load()
    for y in range(H):
        for x in range(W):
            r, g, b = [c / 255 for c in px[x, y]]
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            if v < 0.3: c = (30, 50, 40)                      # deep shade
            elif s < 0.2: c = (150, 150, 160)                 # stone
            elif 0.05 < h < 0.13 and s > 0.3: c = (225, 150, 70)   # dirt
            elif 0.13 <= h < 0.45: c = (70, 160, 60)          # foliage / grass
            else: c = (150, 150, 160) if s < 0.35 else (70, 160, 60)
            o[x, y] = c
    return out
a, b, outp = sys.argv[1:4]
A, B = seg(a), seg(b)
o = Image.new('RGB', (600, 686), 'black'); o.paste(A, (0, 0)); o.paste(B, (0, 348)); o.save(outp)
