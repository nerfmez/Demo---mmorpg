#!/usr/bin/env python3
"""Trace the Pearlshell Grotto's inside map from the owner's concept picture.

Reads data/dungeons/shell-grotto-trace.json (zones, stairs, props... in concept pixels), finds the
stone floor (warm, light, unsaturated) and the water (cyan) in the concept, cleans the masks, cuts
them by zone and writes polygon floors (with holes for rock islands) plus everything else, now in
metres, into data/dungeons/shell-grotto.json `inside`. The beach (`outside`) and the shared rules
are left as they are.

Usage: python3 scripts/grotto-trace.py [--debug out.png]   (needs numpy and opencv-python)
"""
import json, math, sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / 'data/dungeons/shell-grotto-trace.json').read_text())
OUT = ROOT / 'data/dungeons/shell-grotto.json'

img = cv2.imread(str(ROOT / CFG['image']))
H, W = img.shape[:2]
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
hue, sat, val = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
stone = ((val > 0.42) & (sat < 0.55) & ((hue < 60) | (hue > 330))).astype(np.uint8)
water = ((hue > 150) & (hue < 205) & (sat > 0.25) & (val > 0.38)).astype(np.uint8)

ell = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))


def fill_small_holes(mask, max_area):
    inv = (1 - mask).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    out = mask.copy()
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a <= max_area and x > 0 and y > 0 and x + w < W and y + h < H:
            out[lab == i] = 1
    return out


def drop_small(mask, min_area):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
    out = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i][4] >= min_area:
            out[lab == i] = 1
    return out


# the whole walkable shape: stone or water, props and specks closed over
walk = cv2.morphologyEx(stone | water, cv2.MORPH_CLOSE, ell(13))
walk = cv2.morphologyEx(walk, cv2.MORPH_OPEN, ell(7))
walk = fill_small_holes(walk, 6000)  # pillar shadows and the rune circle, not the rock islands
walk = drop_small(walk, 4000)
# raised stone inside the water zones (paths, platforms, pillar bases)
stone_c = cv2.morphologyEx(stone, cv2.MORPH_OPEN, ell(5))
stone_c = cv2.morphologyEx(stone_c, cv2.MORPH_CLOSE, ell(11))
stone_c = fill_small_holes(stone_c, 900) & walk
stone_c = drop_small(stone_c, 700)
# places the picture hides (under the coral tree): painted in by hand
for f in CFG.get('fill', []):
    poly = [np.array(f['poly'], np.int32)]
    cv2.fillPoly(walk, poly, 1)
    if f.get('stone'):
        cv2.fillPoly(stone_c, poly, 1)

# zone map: later zones win; the default zone is everything else
label = np.zeros((H, W), np.uint8)
zones = CFG['zones']
for i, z in enumerate(zones):
    if 'poly' in z:
        cv2.fillPoly(label, [np.array(z['poly'], np.int32)], i)
default = next(i for i, z in enumerate(zones) if z.get('default'))
if default:
    raise SystemExit('the default zone must come first')

ox, oy = CFG['origin']
sx, sz = CFG['scale'], CFG['zScale']
m = lambda p: [round((p[0] - ox) * sx, 2), round((p[1] - oy) * sz, 2)]
ml = lambda d: d * sx  # a pixel length across, in metres


def chaikin(pts, n=2):
    """Round a closed outline's corners (the traced pixels are jagged)."""
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [[a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]]
        pts = out
    return pts


def polygons(mask, min_area, min_hole):
    """Outer outlines with their holes, simplified, in metres."""
    cs, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(c) < min_area:
            continue
        outer = cv2.approxPolyDP(c, 2.6, True)[:, 0, :]
        holes = []
        k = hier[i][2]
        while k != -1:
            if cv2.contourArea(cs[k]) >= min_hole:
                h = cv2.approxPolyDP(cs[k], 2.6, True)[:, 0, :]
                if len(h) >= 3:
                    holes.append([m(p) for p in chaikin(h.tolist())])
            k = hier[k][0]
        if len(outer) >= 3:
            out.append(([m(p) for p in chaikin(outer.tolist())], holes))
    return out


floors = []
for i, z in enumerate(zones):
    # each zone reaches a few pixels past its edge, so two zones on one level overlap instead of
    # leaving a hairline of void between their outlines
    zm = cv2.dilate((label == i).astype(np.uint8), ell(7))
    area = zm & walk
    if z.get('round'):
        # a walled room: the rocks and props painted over the floor's edge would leave notches
        # and fingers in its walls, so the outline is rounded over them (`round` px across)
        r = z['round']
        area = cv2.morphologyEx(area, cv2.MORPH_CLOSE, ell(r)) & zm
        area = cv2.morphologyEx(area, cv2.MORPH_OPEN, ell(r // 2))
        area = fill_small_holes(area, 20000)
    wet = 'waterFloor' in z and not z.get('stoneOnly')
    base_kind = 'shallow' if wet else 'stone'
    for n, (pts, holes) in enumerate(polygons(area, 3000, 2500)):
        f = {'id': f"{z['id']}-{'water' if wet else 'floor'}-{n}", 'kind': base_kind, 'shape': 'poly', 'y': z['waterFloor'] if wet else z['y'], 'pts': pts}
        if holes:
            f['holes'] = holes
        if wet:
            f['waterY'] = z['waterY']
        if z.get('tone'):
            f['tone'] = z['tone']
        if z.get('style'):
            f['style'] = z['style']
        floors.append(f)
    if wet:
        for n, (pts, holes) in enumerate(polygons(zm & stone_c, 700, 900)):
            f = {'id': f"{z['id']}-stone-{n}", 'kind': 'stone', 'shape': 'poly', 'y': z['y'], 'pts': pts}
            if holes:
                f['holes'] = holes
            floors.append(f)

for s in CFG['stairs']:
    floors.append({'id': s['id'], 'kind': 'stone', 'shape': 'stairs', 'a': m(s['a']), 'b': m(s['b']), 'w': round(ml(s['w']), 2), 'y0': s['y0'], 'y1': s['y1']})


def facing(at, face):
    a, b = m(at), m(face)
    return round(math.atan2(b[0] - a[0], b[1] - a[1]), 3)


# a prop the picture shows at the very rim moves onto the traced floor (wall props stay in the wall)
walk_pts = np.argwhere(cv2.erode(walk, ell(9)) == 1)  # (y, x), a little inside the edge


def onto_floor(at):
    x, y = at
    if walk[min(H - 1, y), min(W - 1, x)] and cv2.erode(walk, ell(9))[min(H - 1, y), min(W - 1, x)]:
        return at
    d = (walk_pts[:, 0] - y) ** 2 + (walk_pts[:, 1] - x) ** 2
    k = int(np.argmin(d))
    return [int(walk_pts[k][1]), int(walk_pts[k][0])]


props = []
for p in CFG['props']:
    q = {k: v for k, v in p.items() if k not in ('at', 'face')}
    wall = p['type'] in ('shellGate', 'sealedArch')
    q['at'] = m(p['at'] if wall else onto_floor(p['at']))
    if 'face' in p:
        q['rot'] = facing(p['at'], p['face'])
    props.append(q)

falls = []
for w in CFG['waterfalls']:
    falls.append({'at': m(w['at']), 'facing': facing(w['at'], w['face']), 'w': w['w'], 'top': w['top'], 'bottom': w['bottom']})

xs = [p[0] for f in floors if f['shape'] == 'poly' for p in f['pts']]
zs = [p[1] for f in floors if f['shape'] == 'poly' for p in f['pts']]
data = json.loads(OUT.read_text())
inside = data['inside']
inside.update({
    'bounds': {'minX': math.floor(min(xs)) - 6, 'maxX': math.ceil(max(xs)) + 6, 'minZ': math.floor(min(zs)) - 6, 'maxZ': math.ceil(max(zs)) + 6},
    'spawn': m(CFG['spawn']),
    'spawnFacing': facing(CFG['spawn'], CFG['spawnFace']),
    'floors': floors,
    'regions': [{**r, 'at': m(r['at']), 'r': round(ml(r['r']), 1)} for r in CFG['regions']],
    'links': [{**l, 'at': m(l['at'])} for l in CFG['links']],
    'lights': [{**l, 'at': m(l['at'])} for l in CFG['lights']],
    'waterfalls': falls,
    'props': props,
})
inside['_doc'] = 'Generated by scripts/grotto-trace.py from data/dungeons/shell-grotto-trace.json and the concept picture; edit those, not this section.'
# the beach's door lands at the new spawn
for l in data['outside']['links']:
    if l['to'] == 'inside':
        l['spawn'] = inside['spawn']
        l['facing'] = inside['spawnFacing']


def compact(o, ind=0):
    """JSON with one floor/prop per line, so diffs stay readable."""
    sp = '  ' * ind
    if isinstance(o, dict):
        if ind >= 3 or all(not isinstance(v, (dict, list)) or (isinstance(v, list) and len(json.dumps(v)) < 60) for v in o.values()):
            return json.dumps(o, ensure_ascii=False)
        return '{\n' + ',\n'.join(f'{sp}  {json.dumps(k)}: {compact(v, ind + 1)}' for k, v in o.items()) + f'\n{sp}}}'
    if isinstance(o, list):
        if all(not isinstance(v, (dict, list)) for v in o) or ind >= 3:
            return json.dumps(o, ensure_ascii=False)
        return '[\n' + ',\n'.join(f'{sp}  {compact(v, ind + 1)}' for v in o) + f'\n{sp}]'
    return json.dumps(o, ensure_ascii=False)


OUT.write_text(compact(data) + '\n')
print(f"{len(floors)} floors, {len(props)} props, bounds {inside['bounds']}")

if '--debug' in sys.argv:
    vis = img.copy() // 3
    colours = [(80, 170, 230), (60, 140, 255), (120, 220, 255), (230, 200, 40), (230, 150, 60), (220, 120, 220), (255, 255, 255)]
    for i, z in enumerate(zones):
        vis[(label == i) & (walk == 1)] = colours[i % len(colours)]
    vis[(stone_c == 1) & (label > 2)] = (40, 220, 120)
    cv2.imwrite(sys.argv[sys.argv.index('--debug') + 1], vis)
