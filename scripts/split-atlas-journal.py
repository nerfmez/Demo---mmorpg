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
MANIFEST = ROOT / 'assets/atlas-journal/manifest.json'
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
    # their nearest primary painted component, never to a neighbouring grid cell.
    for i, box in enumerate(boxes, 1):
        if i in large or box is None:
            continue
        mask = components[box] == i
        if areas[i] >= 20 or np.min(distances[box][mask]) < 6:
            candidates = nearest_seed[box][mask]
            owner = int(np.argmax(np.bincount(candidates)))
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
        size = 232 if cell['kind'] == 'monster' else 244
        cutout.thumbnail((size, size), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', (256, 256))
        icon.alpha_composite(cutout, ((256-cutout.width)//2, (256-cutout.height)//2))
        dest = ROOT / cell['path']
        icon.save(dest, optimize=True)
        cell.update({'source_bounds': list(bbox), 'path': str(dest.relative_to(ROOT)),
                     'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
                     'dimensions': [256, 256], 'alpha_extrema': list(icon.getextrema()[3])})
        assert cell['alpha_extrema'][0] == 0
        assert not icon.getchannel('A').crop((0, 0, 256, 6 if cell['kind'] == 'region' else 10)).getbbox()
        portraits.append((((cell['map']+':')if 'map'in cell else '')+cell['id'], icon))
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
review.save(ROOT / 'assets/atlas-journal/all-review.png')


# Publish the same deterministic records to the category manifests and previews.
r=ROOT
m=manifest
for kind,folder in [('monster','atlas-monsters'),('region','atlas-regions')]:
 cells=[c for s in m['sheets'] for c in s['cells']if c['kind']==kind];assert len(cells)==(18 if kind=='monster'else 17)
 cells.sort(key=lambda c: (c.get('map',''),c['id']))
 out=Image.new('RGB',(1080,((len(cells)+2)//3)*230),'#f6f0dc');d=ImageDraw.Draw(out)
 for n,c in enumerate(cells):
  x=n%3*360;y=n//3*230;im=Image.open(r/c['path']).convert('RGBA');big=im.resize((150,150),Image.Resampling.LANCZOS);out.paste(big,(x+12,y+8),big);small=im.resize((50,50),Image.Resampling.LANCZOS);out.paste(small,(x+190,y+55),small);dark=Image.new('RGB',(74,74),'#142322');dark.paste(small,(12,12),small);out.paste(dark,(x+263,y+43));d.text((x+12,y+174),c.get('map',''),fill='#322d25');d.text((x+12,y+194),c['id'],fill='#322d25')
 out.save(r/f'assets/atlas-journal/{kind}-review.png')
 p=r/f'assets/{folder}/manifest.json'
 a={k:v for k,v in m.items()if k!='sheets'};a['splitter']='scripts/split-atlas-journal.py';a['sheets']=[{**s,'cells':[c for c in s['cells']if c['kind']==kind]}for s in m['sheets']if any(c['kind']==kind for c in s['cells'])];p.write_text(json.dumps(a,indent=2)+'\n')

print('Exported', len(portraits), '256px RGBA Atlas icons and labelled previews.')
