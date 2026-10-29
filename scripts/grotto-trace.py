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


def shapes_mask(shapes):
    """Hand-drawn stone: polygons, and ellipses {c, r: [rx, ry]}, in concept pixels."""
    out = np.zeros_like(walk)
    for sh in shapes:
        if 'ellipse' in sh:
            (cx, cy), (rx, ry) = sh['ellipse'], sh['r']
            cv2.ellipse(out, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1, -1)
        else:
            cv2.fillPoly(out, [np.array(sh['poly'], np.int32)], 1)
    return out


# every flight of stairs is cut out of the floors it crosses: the floors meet it at its sides and
# ends instead of lying over it (which drew a ramp pasted onto a slab)
stair_cut = np.zeros_like(walk)
for s in CFG['stairs']:
    (ax, ay), (bx, by), w = s['a'], s['b'], s['w']
    l = math.hypot(bx - ax, by - ay) or 1
    ux, uy = (bx - ax) / l, (by - ay) / l
    hw, e = w / 2 + 1, 9  # the cut stops short of both ends, so the floors there still meet the flight
    quad = [[ax - uy * hw + ux * e, ay + ux * hw + uy * e], [bx - uy * hw - ux * e, by + ux * hw - uy * e],
            [bx + uy * hw - ux * e, by - ux * hw - uy * e], [ax + uy * hw + ux * e, ay - ux * hw + uy * e]]
    cv2.fillPoly(stair_cut, [np.array(quad, np.int32)], 1)
keep = (1 - stair_cut).astype(np.uint8)

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
    area = area & keep
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
        if z.get('walls'):
            f['walls'] = True  # its edges to the void get the modelled cave wall (grotto-cave.py)
        floors.append(f)
    if wet:
        raised = zm & stone_c
        if z.get('round'):
            # the walkways and platforms in the water, rounded the same way over the props painted on them
            r = max(9, z['round'] // 3) | 1
            raised = cv2.morphologyEx(raised, cv2.MORPH_CLOSE, ell(r)) & zm
            raised = cv2.morphologyEx(raised, cv2.MORPH_OPEN, ell(max(5, r // 2) | 1))
            raised = fill_small_holes(raised, 3000)
        if z.get('stone'):
            # where the picture's stone is too broken up by its ruins to trace, it is drawn by hand
            raised = shapes_mask(z['stone']) & zm
        raised = raised & keep
        for n, (pts, holes) in enumerate(polygons(raised, 700, 900)):
            f = {'id': f"{z['id']}-stone-{n}", 'kind': 'stone', 'shape': 'poly', 'y': z['y'], 'pts': pts}
            if holes:
                f['holes'] = holes
            floors.append(f)

for s in CFG['stairs']:
    floors.append({'id': s['id'], 'kind': 'stone', 'shape': 'stairs', 'a': m(s['a']), 'b': m(s['b']), 'w': round(ml(s['w']), 2), 'y0': s['y0'], 'y1': s['y1']})


def facing(at, face):
    a, b = m(at), m(face)
    return round(math.atan2(b[0] - a[0], b[1] - a[1]), 3)


# a prop the picture shows at the very rim moves onto the floor as written (wall props stay in the
# wall): the floors' own outlines, drawn back into pixels (small pieces of a zone are dropped)
final = np.zeros_like(walk)
px = lambda q: [round(q[0] / sx + ox), round(q[1] / sz + oy)]
for f in floors:
    if f['shape'] != 'poly':
        continue
    cv2.fillPoly(final, [np.array([px(q) for q in f['pts']], np.int32)], 1)
    for h in f.get('holes', []):
        cv2.fillPoly(final, [np.array([px(q) for q in h], np.int32)], 0)
inner = cv2.erode(final, ell(9))
walk_pts = np.argwhere(inner == 1)  # (y, x), a little inside the edge


# corals and crystals grow at the foot of the walls, as in the concept, never out in a walkway:
# the band of floor a few pixels in from the void
to_void = cv2.distanceTransform(final, cv2.DIST_L2, 5)
band_pts = np.argwhere((to_void >= 5) & (to_void <= 13))


def onto_edge(at):
    x, y = at
    if 0 <= y < H and 0 <= x < W and 0 < to_void[y, x] <= 16:
        return at
    d = (band_pts[:, 0] - y) ** 2 + (band_pts[:, 1] - x) ** 2
    k = int(np.argmin(d))
    return [int(band_pts[k][1]), int(band_pts[k][0])]


def onto_floor(at):
    x, y = at
    if inner[min(H - 1, y), min(W - 1, x)]:
        return at
    d = (walk_pts[:, 0] - y) ** 2 + (walk_pts[:, 1] - x) ** 2
    k = int(np.argmin(d))
    return [int(walk_pts[k][1]), int(walk_pts[k][0])]


props = []
for p in CFG['props']:
    q = {k: v for k, v in p.items() if k not in ('at', 'face')}
    wall = p['type'] in ('shellGate', 'sealedArch')
    q['at'] = m(p['at'] if wall else onto_edge(p['at']) if p['type'] in ('coral', 'crystal') else onto_floor(p['at']))
    if 'face' in p:
        q['rot'] = facing(p['at'], p['face'])
    props.append(q)

def level(f):
    return f.get('waterY', f['y']) if f['shape'] == 'poly' else None


def inside_poly(pts, x, z):
    return cv2.pointPolygonTest(np.array(pts, np.float32), (float(x), float(z)), False) > 0


def on_floor(x, z, f):
    return inside_poly(f['pts'], x, z) and not any(inside_poly(h, x, z) for h in f.get('holes', []))


def any_floor(x, z):
    return any(f['shape'] == 'poly' and on_floor(x, z, f) for f in floors)


def nearest_edge(at, test):
    """The nearest point on the outline of a floor that `test(floor)` picks, with its outward normal
    (away from that floor), as (x, z, nx, nz, floor)."""
    best = None
    for f in floors:
        if f['shape'] != 'poly' or not test(f):
            continue
        for ring in [f['pts'], *f.get('holes', [])]:
            for i in range(len(ring)):
                (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
                dx, dz = bx - ax, bz - az
                l2 = dx * dx + dz * dz or 1e-9
                t = max(0.0, min(1.0, ((at[0] - ax) * dx + (at[1] - az) * dz) / l2))
                x, z = ax + dx * t, az + dz * t
                d = (x - at[0]) ** 2 + (z - at[1]) ** 2
                if best is None or d < best[0]:
                    best = (d, x, z, f)
    _, x, z, f = best
    # outward, smoothed over the bend: away from the floor seen within 2.5 m all round
    sx = sz = 0.0
    for k in range(24):
        a = k / 24 * math.tau
        if on_floor(x + math.cos(a) * 2.5, z + math.sin(a) * 2.5, f):
            sx -= math.cos(a)
            sz -= math.sin(a)
    l = math.hypot(sx, sz) or 1
    return x, z, sx / l, sz / l, f


# a waterfall pours from where the concept shows it, put on the real edge it pours over:
# `ledge` falls go over the lip of the floor at their top level, into what lies below;
# `wall` falls run down the cave wall at the back of the floor at their bottom level, from near the
# wall's top (the modelled walls stand up to 5 m), into that floor's water
falls = []
def along_face(w, test):
    """Where the line through the fall, along the way the concept has it face, meets the edge of a
    floor `test` picks (the nearest crossing either way, within 15 m), else the nearest edge point."""
    at, face = m(w['at']), m(w['face'])
    dx, dz = face[0] - at[0], face[1] - at[1]
    l = math.hypot(dx, dz) or 1
    dx, dz = dx / l, dz / l
    on = lambda x, z: any(f['shape'] == 'poly' and test(f) and on_floor(x, z, f) for f in floors)
    start = on(*at)
    for k in range(1, 151):
        for sgn in (1, -1):
            x, z = at[0] + dx * sgn * k * 0.1, at[1] + dz * sgn * k * 0.1
            if on(x, z) != start:
                return nearest_edge([x, z], test)
    return nearest_edge(at, test)


for w in CFG['waterfalls']:
    ledge = any(level(f) is not None and abs(level(f) - w['top']) < 0.3 for f in floors)
    if ledge:
        x, z, nx, nz, f = along_face(w, lambda f: level(f) is not None and abs(level(f) - w['top']) < 0.3)
        fall = {'kind': 'ledge', 'at': [round(x, 2), round(z, 2)], 'facing': round(math.atan2(nx, nz), 3), 'w': w['w'], 'top': w['top'], 'bottom': w['bottom']}
    else:
        x, z, nx, nz, f = along_face(w, lambda f: level(f) is not None and abs(level(f) - w['bottom']) < 0.3)
        # the wall stands on the void side; the fall faces into the room
        fall = {'kind': 'wall', 'at': [round(x + nx * 0.35, 2), round(z + nz * 0.35, 2)], 'facing': round(math.atan2(-nx, -nz), 3), 'w': w['w'], 'top': round(w['bottom'] + min(4.4, w['top'] - w['bottom']), 2), 'bottom': w['bottom']}
    if any(math.hypot(fall['at'][0] - g['at'][0], fall['at'][1] - g['at'][1]) < 4 for g in falls):
        continue  # it landed on the same spot of wall as another: one fall there, not two
    falls.append(fall)

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
