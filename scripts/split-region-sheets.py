"""Export image_gen location vignettes by explicit row/column and map/zone IDs.

Run from the repository root; requires Pillow, numpy, scipy. Keeps vignette alpha.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
from scipy.ndimage import label, find_objects, distance_transform_edt, binary_dilation

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'assets/atlas-regions/manifest.json'
manifest = json.loads(path.read_text())
exports = []
for sheet in manifest['sheets']:
    source = ROOT / sheet['path']
    image = Image.open(source).convert('RGBA')
    pixels = np.array(image)
    components, count = label(pixels[:, :, 3] > 8)
    areas = np.bincount(components.ravel())
    large = [i for i in range(1, count+1) if areas[i] > 20000]
    assert len(large) == len(sheet['cells']), (source, len(large))
    seeds = np.zeros(components.shape, dtype=np.int16)
    by_cell = {}
    for i in large:
        yy, xx = np.where(components == i)
        cell_key = (int(yy.mean() // (image.height/2))+1, int(xx.mean() // (image.width/3))+1)
        assert cell_key not in by_cell
        by_cell[cell_key] = i
        seeds[components == i] = i
    distances, indices = distance_transform_edt(seeds == 0, return_indices=True)
    nearest = seeds[tuple(indices)]
    ownership = seeds.copy()
    for i, box in enumerate(find_objects(components), 1):
        if i in large or box is None:
            continue
        mask = components[box] == i
        if areas[i] >= 20 or distances[box][mask].min() < 6:
            ownership[box][mask] = np.argmax(np.bincount(nearest[box][mask]))
    sheet['dimensions'] = list(image.size)
    sheet['sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    for cell in sheet['cells']:
        owner = by_cell[(cell['row'], cell['column'])]
        mask = ownership == owner
        mask |= binary_dilation(mask, iterations=2) & (nearest == owner)
        isolated = pixels.copy()
        isolated[~mask] = 0
        vignette = Image.fromarray(isolated)
        bbox = vignette.getbbox()
        assert bbox, cell
        vignette = vignette.crop(bbox)
        vignette.thumbnail((244, 244), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', (256, 256))
        icon.alpha_composite(vignette, ((256-vignette.width)//2, (256-vignette.height)//2))
        # Remove RGB in zero-alpha pixels for reliable standalone previews.
        icon_pixels = icon.load()
        for yy in range(256):
            for xx in range(256):
                if icon_pixels[xx, yy][3] == 0:
                    icon_pixels[xx, yy] = (0, 0, 0, 0)
        dest = ROOT / ('public/assets/icons/region/' + cell['map'] + '/' + cell['id'] + '.png')
        dest.parent.mkdir(parents=True, exist_ok=True)
        icon.save(dest, optimize=True)
        cell.update({'source_bounds': list(bbox), 'path': str(dest.relative_to(ROOT)),
                     'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
                     'dimensions': [256, 256], 'alpha_extrema': list(icon.getextrema()[3])})
        exports.append((cell['map'] + ':' + cell['id'], icon))
path.write_text(json.dumps(manifest, indent=2) + '\n')
review = Image.new('RGB', (1080, ((len(exports)+2)//3)*230), '#f6f0dc')
draw = ImageDraw.Draw(review)
for n, (id, icon) in enumerate(exports):
    x, y = (n%3)*360, (n//3)*230
    big = icon.resize((170, 170), Image.Resampling.LANCZOS)
    review.paste(big, (x+12, y+8), big)
    small = icon.resize((60, 60), Image.Resampling.LANCZOS)
    review.paste(small, (x+205, y+65), small)
    draw.text((x+12, y+190), id, fill='#322d25')
review.save(ROOT / 'assets/atlas-regions/regions-review.png')
print('Exported', len(exports), 'map-qualified RGBA location icons.')
