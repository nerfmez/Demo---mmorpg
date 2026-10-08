"""Cut the owner's Moonroot Grove concept sheets into game icons. Requires Pillow and numpy.

Run from the repository root: python3 scripts/split-moonroot-art.py
Sources (assets/moonroot/*.jpg) are the owner-supplied concept sheets, kept as delivered.
Outputs (deterministic, 256 x 256 RGBA):
  - atlas portraits: public/assets/icons/monster/<id>.png, public/assets/icons/region/moonroot-grove-v1/<zone>.png
  - item art: public/assets/moonroot/{material,gear}/<id>.png (drawn inside the authored SVG frame)
and records every crop with hashes in assets/moonroot/manifest.json, plus the portrait cells in the
atlas manifests (assets/atlas-monsters/manifest.json, assets/atlas-regions/manifest.json).
The paper background is removed by a flood fill from the crop border over light, unsaturated
pixels, so line art keeps its own outline. Region crops get a soft painted-edge vignette.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets/moonroot'
SHEETS = {
    'mole': 'rootdigger_mole_concept.jpg', 'hare': 'fern_ear_hare_concept.jpg', 'moth': 'mirrorwing_moth_concept.jpg',
    'grove': 'moonroot_grove_concept.jpg', 'accessories': 'moonroot_accessories_concept.jpg',
}
# kind, id, sheet, crop box (left, top, right, bottom) in source pixels
CUTS = [
    ('monster', 'rootdigger_mole', 'mole', (10, 130, 1030, 950), {'erase': [(880, 130, 1030, 440)]}),  # the side view's snout
    ('monster', 'fern_ear_hare', 'hare', (40, 64, 700, 720), {'fade': 60}),
    ('monster', 'mirrorwing_moth', 'moth', (20, 70, 1100, 900)),
    ('material', 'rootdigger_claw', 'mole', (1030, 590, 1490, 1000)),
    ('material', 'fern_ear_tuft', 'hare', (1100, 690, 1340, 1000)),
    ('material', 'mirror_scale', 'moth', (1230, 700, 1410, 990)),
    ('gear', 'fernstep_charm', 'accessories', (280, 62, 700, 570)),
    ('gear', 'mirrorwing_pendant', 'accessories', (960, 58, 1230, 560)),
    ('gear', 'burrowguard_brooch', 'accessories', (270, 560, 730, 970)),
    ('gear', 'grove_union_ring', 'accessories', (890, 560, 1250, 990), {'holes': True}),  # paper seen through the band
    ('region', 'settlement', 'grove', (395, 150, 715, 470)),
    ('region', 'mirror_pond', 'grove', (850, 120, 1350, 620)),
    ('region', 'stone_ring', 'grove', (1690, 70, 2160, 540)),
    ('region', 'fern_rise', 'grove', (1400, 300, 1810, 710)),
    ('region', 'root_warren', 'grove', (40, 300, 460, 720)),
]
MAP = 'moonroot-grove-v1'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cut_out(crop, holes=False, fade=0):
    """Remove the light paper background connected to the crop border."""
    rgb = np.asarray(crop.convert('RGB')).astype(np.int16)
    hi, lo = rgb.max(axis=2), rgb.min(axis=2)
    paper = (lo > 176) & (hi - lo < 30)  # light and nearly grey: paper and soft drop shadows
    mask = Image.fromarray(np.where(paper, 255, 0).astype(np.uint8)).copy()  # a writable copy: floodfill edits in place
    w, h = mask.size
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if mask.getpixel((x, y)) == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if mask.getpixel((x, y)) == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    if holes:  # large enclosed paper areas are background too (inside a ring); small ones are highlights
        px = mask.load()
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                if px[x, y] != 255:
                    continue
                ImageDraw.floodfill(mask, (x, y), 100)
                area = int((np.asarray(mask) == 100).sum())
                ImageDraw.floodfill(mask, (x, y), 128 if area > 2500 else 60)
    background = np.asarray(mask) == 128
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    if fade:  # the figure runs past the crop: let it fade out instead of ending on a straight cut
        yy, xx = np.mgrid[0:h, 0:w]
        edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
        alpha = Image.fromarray((np.asarray(alpha) * np.clip(edge / fade, 0, 1)).astype(np.uint8))
    out = crop.convert('RGBA')
    out.putalpha(alpha)
    return out


def vignette(crop, seed):
    """A soft painted edge: an uneven rounded blob, fully clear at the corners."""
    w, h = crop.size
    yy, xx = np.mgrid[0:h, 0:w]
    nx, ny = (xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2)
    ang = np.arctan2(ny, nx)
    wobble = 0.06 * np.sin(ang * 5 + seed) + 0.04 * np.sin(ang * 9 + seed * 2.3) + 0.03 * np.sin(ang * 14 + seed * 0.7)
    r = np.sqrt(nx ** 2 + ny ** 2) / (0.9 + wobble)
    alpha = np.clip((1 - r) / 0.12, 0, 1) * 255
    out = crop.convert('RGBA')
    out.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    return out


def fit(cut, size):
    bbox = cut.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    cut = cut.crop(bbox)
    cut.thumbnail((size, size), Image.Resampling.LANCZOS)
    icon = Image.new('RGBA', (256, 256))
    icon.alpha_composite(cut, ((256 - cut.width) // 2, (256 - cut.height) // 2))
    # no colour hidden under fully clear pixels
    px = np.asarray(icon).copy()
    px[px[:, :, 3] == 0] = 0
    return Image.fromarray(px), list(bbox)


def main():
    sources = {k: Image.open(SRC / v).convert('RGB') for k, v in SHEETS.items()}
    record = {'version': 1, 'generator': 'scripts/split-moonroot-art.py', 'source': 'owner-supplied concept sheets',
              'sheets': {k: {'path': f'assets/moonroot/{v}', 'sha256': sha(SRC / v), 'dimensions': list(sources[k].size)} for k, v in SHEETS.items()},
              'cuts': []}
    for n, (kind, id, sheet, box, *extra) in enumerate(CUTS):
        opts = extra[0] if extra else {}
        crop = sources[sheet].crop(box)
        for ex in opts.get('erase', []):  # another drawing on the same sheet reaching into the crop
            ImageDraw.Draw(crop).rectangle([ex[0] - box[0], ex[1] - box[1], ex[2] - box[0], ex[3] - box[1]], fill=(251, 250, 245))
        if kind == 'region':
            icon, bbox = fit(vignette(crop, n * 1.7 + 0.4), 244)
            dest = ROOT / f'public/assets/icons/region/{MAP}/{id}.png'
        else:
            icon, bbox = fit(cut_out(crop, opts.get('holes', False), opts.get('fade', 0)), 232 if kind == 'monster' else 220)
            dest = ROOT / (f'public/assets/icons/monster/{id}.png' if kind == 'monster' else f'public/assets/moonroot/{kind}/{id}.png')
        dest.parent.mkdir(parents=True, exist_ok=True)
        icon.save(dest, optimize=True)
        alpha = list(icon.getextrema()[3])
        assert alpha[0] == 0 and alpha[1] > 240, (id, alpha)
        record['cuts'].append({'kind': kind, 'id': id, 'sheet': sheet, 'crop': list(box), 'content_bounds': bbox,
                               'path': str(dest.relative_to(ROOT)), 'sha256': sha(dest), 'dimensions': [256, 256], 'alpha_extrema': alpha})
    (SRC / 'manifest.json').write_text(json.dumps(record, indent=2) + '\n')
    # atlas manifests: one sheet entry per source, cells carry the portrait identity the atlas test checks
    for folder, kind in (('atlas-monsters', 'monster'), ('atlas-regions', 'region')):
        path = ROOT / f'assets/{folder}/manifest.json'
        manifest = json.loads(path.read_text())
        manifest['sheets'] = [s for s in manifest['sheets'] if not s['path'].startswith('assets/moonroot/')]
        by_sheet = {}
        for c in record['cuts']:
            if c['kind'] != kind:
                continue
            cell = {'id': c['id'], 'path': c['path'], 'source_bounds': c['crop'], 'sha256': c['sha256'], 'dimensions': [256, 256], 'alpha_extrema': c['alpha_extrema']}
            if kind == 'region':
                cell = {'kind': 'region', 'map': MAP, **cell}
            by_sheet.setdefault(c['sheet'], []).append(cell)
        for sheet, cells in by_sheet.items():
            manifest['sheets'].append({'path': record['sheets'][sheet]['path'], 'sha256': record['sheets'][sheet]['sha256'], 'source': 'owner concept (Moonroot Grove)', 'cells': cells})
        path.write_text(json.dumps(manifest, indent=2) + '\n')
    # review sheet (labels belong to the review only)
    review = Image.new('RGB', (256 * 5, 256 * 3), '#3c3c50')
    for n, c in enumerate(record['cuts']):
        review.paste(Image.open(ROOT / c['path']), ((n % 5) * 256, (n // 5) * 256), Image.open(ROOT / c['path']))
    review.save(SRC / 'cuts-review.jpg', quality=85)
    print('\n'.join(f"{c['kind']:8} {c['id']:20} {c['path']}" for c in record['cuts']))


if __name__ == '__main__':
    main()
