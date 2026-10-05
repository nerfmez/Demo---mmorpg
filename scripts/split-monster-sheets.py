"""Deterministically split approved image_gen sheets. Requires Pillow, numpy, scipy.

Run from the repository root. Row/column identity lives in the retained manifest.
Alpha components, rather than hard cell cuts, preserve wings/tails crossing grid
lines. Only detached specks and near-zero alpha background noise are removed.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, find_objects, label

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets/atlas-monsters/manifest.json'
manifest = json.loads(MANIFEST.read_text())
portraits = []
for sheet in manifest['sheets']:
    source = ROOT / sheet['path']
    image = Image.open(source).convert('RGBA')
    pixels = np.array(image)
    alpha = pixels[:, :, 3]
    components, count = label(alpha > 8)
    boxes = find_objects(components)
    areas = np.bincount(components.ravel())
    large = [i for i in range(1, count + 1) if areas[i] > 20000]
    assert len(large) == 6, (source, len(large))
    seeds = np.zeros(alpha.shape, dtype=np.int16)
    by_cell = {}
    for i in large:
        yy, xx = np.where(components == i)
        cell = (int(np.mean(yy) // (image.height / 2)) + 1,
                int(np.mean(xx) // (image.width / 3)) + 1)
        assert cell not in by_cell, (source, cell)
        by_cell[cell] = i
        seeds[components == i] = i
    distances, nearest = distance_transform_edt(seeds == 0, return_indices=True)
    nearest_seed = seeds[tuple(nearest)]
    ownership = seeds.copy()
    # Attach detached leaves, rune stones and antialiased outline islands to
    # their nearest whole-body component, never to a neighbouring grid cell.
    for i, box in enumerate(boxes, 1):
        if i in large or box is None:
            continue
        mask = components[box] == i
        if areas[i] >= 20 or np.min(distances[box][mask]) < 6:
            candidates = nearest_seed[box][mask]
            owner = int(np.argmax(np.bincount(candidates)))
            # Sentinel's detached stones are intentionally nearer the adjacent
            # feline's tail than its own body. Its reserved cell owns all four.
            if source.name == 'source-sheet-3.png':
                yy, xx = np.where(mask)
                if xx.mean() + box[1].start > 1050 and yy.mean() + box[0].start > 530:
                    owner = by_cell[(2, 3)]
            ownership[box][mask] = owner
    sheet['dimensions'] = list(image.size)
    sheet['sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    for cell in sheet['cells']:
        owner = by_cell[(cell['row'], cell['column'])]
        mask = ownership == owner
        # Retain the original soft alpha immediately outside the contour.
        mask = mask | (binary_dilation(mask, iterations=2) & (nearest_seed == owner))
        isolated = pixels.copy()
        isolated[~mask] = 0
        isolated[isolated[:, :, 3] == 0] = 0  # no hidden RGB glow in previews
        cutout = Image.fromarray(isolated)
        bbox = cutout.getbbox()
        cutout = cutout.crop(bbox)
        cutout.thumbnail((232, 232), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', (256, 256))
        icon.alpha_composite(cutout, ((256-cutout.width)//2, (256-cutout.height)//2))
        dest = ROOT / ('public/assets/icons/monster/' + cell['id'] + '.png')
        icon.save(dest, optimize=True)
        cell.update({'source_bounds': list(bbox), 'path': str(dest.relative_to(ROOT)),
                     'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
                     'dimensions': [256, 256], 'alpha_extrema': list(icon.getextrema()[3])})
        assert cell['alpha_extrema'][0] == 0
        assert not icon.getchannel('A').crop((0, 0, 256, 10)).getbbox()
        portraits.append((cell['id'], icon))
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
# Review sheet: labels belong to the review only, never the runtime assets.
review = Image.new('RGB', (1080, ((len(portraits)+2)//3)*230), '#f6f0dc')
draw = ImageDraw.Draw(review)
for n, (id, icon) in enumerate(portraits):
    x, y = (n%3)*360, (n//3)*230
    big = icon.resize((170, 170), Image.Resampling.LANCZOS)
    review.paste(big, (x+12, y+8), big)
    small = icon.resize((50, 50), Image.Resampling.LANCZOS)
    review.paste(small, (x+205, y+65), small)
    draw.text((x+12, y+190), id, fill='#322d25')
review.save(ROOT / 'assets/atlas-monsters/portraits-review.png')
print('Exported', len(portraits), '256px RGBA portraits and labelled 50px review.')
