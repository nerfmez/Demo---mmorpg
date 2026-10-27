# where the concept and the render agree: for dirt and for stone, white = both, red = concept only, blue = render only
import sys
exec(open(__file__.replace('diffmap.py', 'segment.py')).read().split("a, b, outp")[0])
from PIL import Image
W, H = 300, 169
A = seg(sys.argv[3] if len(sys.argv) > 3 else __file__.replace('tools/diffmap.py', 'concepts/ruins-approach-40deg.jpg'), W, H).load()
B = seg(sys.argv[1], W, H).load()
out = Image.new('RGB', (W * 2 + 10, H), 'black'); o = out.load()
score = []
for k, (name, c) in enumerate([('dirt', (225, 150, 70)), ('stone', (150, 150, 160))]):
    # coarse: each 10x10 cell counts as the class if a third of it is
    cells = {}
    for y in range(H):
        for x in range(W):
            a, b = A[x, y] == c, B[x, y] == c
            o[x + k * (W + 10), y] = (255, 255, 255) if a and b else (230, 40, 40) if a else (40, 90, 240) if b else (0, 0, 0)
            cl = cells.setdefault((x // 10, y // 10), [0, 0, 0]); cl[0] += a; cl[1] += b; cl[2] += 1
    i = sum(1 for a, b, n in cells.values() if a > n / 3 and b > n / 3); u = sum(1 for a, b, n in cells.values() if a > n / 3 or b > n / 3)
    score.append(f'{name} coarse IoU {i / u:.2f}')
out = out.resize((out.width * 2, out.height * 2), Image.NEAREST); out.save(sys.argv[2])
print(', '.join(score))
