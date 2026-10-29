#!/usr/bin/env python3
"""Trace the Pearlshell Grotto's inside map from the owner's concept picture.

Reads data/dungeons/shell-grotto-trace.json (zones, stairs, props... in concept pixels), finds the
stone floor (warm, light, unsaturated) and the water (cyan) in the concept, cleans the masks, cuts
them by zone and writes polygon floors (with holes for rock islands) plus everything else, now in
metres, into data/dungeons/shell-grotto.json `inside`. The beach (`outside`) and the shared rules
are left as they are.

Usage: python3 scripts/grotto-trace.py [--debug out.png]   (needs numpy and opencv-python)
"""
import json, math, subprocess, sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / 'data/dungeons/shell-grotto-trace.json').read_text())
OUT = ROOT / 'data/dungeons/shell-grotto.json'

img = cv2.imread(str(ROOT / CFG['image']))
H, W = img.shape[:2]


def smooth(a, b, x):
    t = np.clip((np.asarray(x, np.float64) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# the boss room (the throne room and its dais) is bigger than the concept draws it (owner, 29 Oct
# 2026): the picture and every point in it north of `grow.at` (the head of the throne steps) are
# stretched away from that point, `k` = [east, north]; the stretch fades out west of the room
# (`west`, px) and south of it (`south`), so the rooms around it keep their shape. The picture is
# padded so the stretched room fits; the origin moves with the padding, so metres do not change.
GROW = CFG.get('grow')
PAD_T = PAD_R = 0


def grow(x, y):
    """A concept pixel (or arrays of them) in the stretched picture, before padding."""
    if not GROW:
        return x, y
    (ax, ay), (kx, ky) = GROW['at'], GROW['k']
    sy = 1 - smooth(*GROW['south'], y)
    sxw = smooth(*GROW['west'], x)
    return x + (kx - 1) * np.maximum(0, x - ax) * sy, y - (ky - 1) * np.maximum(0, ay - y) * sxw


def grow_k(x, y):
    """How much the stretch widens things at (x, y): (across, down the picture)."""
    if not GROW:
        return 1, 1
    (ax, ay), (kx, ky) = GROW['at'], GROW['k']
    return (1 + (kx - 1) * float(x > ax) * float(1 - smooth(*GROW['south'], y)),
            1 + (ky - 1) * float(y < ay) * float(smooth(*GROW['west'], x)))


if GROW:
    gx, gy = grow(np.array([0, W]), np.array([0, 0]))
    PAD_T = int(math.ceil(max(0, -min(grow(np.array([W * 1.0]), np.array([0.0]))[1][0], 0)))) + 10
    PAD_R = int(math.ceil(max(0, float(gx.max()) - W))) + 10
    # each pixel of the new picture takes its colour from where the stretch brought it from
    HN, WN = H + PAD_T, W + PAD_R
    dx, dy = np.meshgrid(np.arange(WN, dtype=np.float64), np.arange(HN, dtype=np.float64) - PAD_T)
    sx_, sy_ = dx.copy(), dy.copy()
    for _ in range(12):
        fx, fy = grow(sx_, sy_)
        jx = 1 + (GROW['k'][0] - 1) * (sx_ > GROW['at'][0]) * (1 - smooth(*GROW['south'], sy_))
        jy = 1 + (GROW['k'][1] - 1) * (sy_ < GROW['at'][1]) * smooth(*GROW['west'], sx_)
        sx_ -= (fx - dx) / jx
        sy_ -= (fy - dy) / jy
    img = cv2.remap(img, sx_.astype(np.float32), sy_.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    H, W = img.shape[:2]

    def gp(q):
        x, y = grow(np.float64(q[0]), np.float64(q[1]))
        return [int(round(float(x))), int(round(float(y))) + PAD_T]

    def gpoly(pts):
        return [gp(q) for q in pts]

    for z in CFG['zones']:
        if 'poly' in z:
            z['poly'] = gpoly(z['poly'])
        for sh in z.get('stone', []):
            if 'ellipse' in sh:
                kx_, ky_ = grow_k(*sh['ellipse'])
                sh['r'] = [sh['r'][0] * kx_, sh['r'][1] * ky_]
                sh['ellipse'] = gp(sh['ellipse'])
            else:
                sh['poly'] = gpoly(sh['poly'])
    for f in CFG.get('fill', []):
        f['poly'] = gpoly(f['poly'])
    for st in CFG['stairs']:
        st['a'], st['b'] = gp(st['a']), gp(st['b'])
    CFG['spawn'], CFG['spawnFace'] = gp(CFG['spawn']), gp(CFG['spawnFace'])
    for r in CFG['regions']:
        kx_, ky_ = grow_k(*r['at'])
        r['r'] = r['r'] * math.sqrt(kx_ * ky_)
        r['at'] = gp(r['at'])
    for key in ('links', 'lights', 'waterfalls', 'props'):
        for e in CFG[key]:
            if 'face' in e:
                e['face'] = gp(e['face'])
            e['at'] = gp(e['at'])
    CFG['origin'] = [CFG['origin'][0], CFG['origin'][1] + PAD_T]
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
to_px = lambda q: [q[0] / sx + ox, q[1] / sz + oy]  # metres back to concept pixels
for s in CFG['stairs']:
    # laid out in metres (the picture's pixels are not square, so a cut made across them is
    # skewed and leaves a wedge of void beside a diagonal flight): the flight's rectangle a hair
    # wider than the stairs are written (stairs w/2 + 0.22 m a side, the cut 0.11 m), stopping
    # about a metre short of both ends, so the floors there still meet the flight
    A, B = m(s['a']), m(s['b'])
    l = math.hypot(B[0] - A[0], B[1] - A[1]) or 1
    ux, uz = (B[0] - A[0]) / l, (B[1] - A[1]) / l
    hw, e = ml(s['w']) / 2 + 0.11, 1.0
    quad = [(A[0] + ux * e - uz * hw, A[1] + uz * e + ux * hw), (B[0] - ux * e - uz * hw, B[1] - uz * e + ux * hw),
            (B[0] - ux * e + uz * hw, B[1] - uz * e - ux * hw), (A[0] + ux * e + uz * hw, A[1] + uz * e - ux * hw)]
    cv2.fillPoly(stair_cut, [np.array([to_px(q) for q in quad], np.int32)], 1)
# the floors themselves are cut to each flight later, in metres (the joints below); this mask only
# keeps the breaks away from the stairs
keep = np.ones_like(walk)

# the props the picture places (and the stair ends) stay on sound stone: no break within ~2.5 m
def clearance(stairs, base, per_scale):
    out = cv2.dilate(stair_cut, ell(stairs))
    for p in CFG['props']:
        if p['type'] != 'runeCircle':  # a pattern on the floor (or under the water), not a thing standing there
            cv2.circle(out, (int(p['at'][0]), int(p['at'][1])), int(base + per_scale * min(1.5, p.get('scale', 1))), 1, -1)
    return out


sound = clearance(45, 22, 10)
sound_middle = clearance(45, 16, 8)  # a hole stays clear of the props' feet, not of their reach
rubble = []

# the paving's joints (the floor texture's own layout, scripts/grotto-paving.mjs): old stone breaks
# along them, whole stones at a time, so a break is a stepped bite, not a smooth curve
PAVING = json.loads(subprocess.run(['node', str(ROOT / 'scripts/grotto-paving.mjs')], capture_output=True, text=True, check=True).stdout)
RES = 0.05  # metres per pixel of the grid the floors are broken on


def break_sites(raised, under, seed):
    """Where the old stone over the water has given way, in concept pixels: points on its edges
    toward the water (about one per 170 px of edge, 55 px apart) and now and then one in the middle
    of a wide platform. None near the props or the stairs."""
    rng = np.random.default_rng(seed)
    safe = cv2.erode(under, ell(9))
    edge = raised & (1 - cv2.erode(raised, ell(3)))
    wet = cv2.dilate(safe & (1 - raised), ell(5))
    cand = np.argwhere((edge == 1) & (wet == 1) & (sound == 0))
    rng.shuffle(cand)
    sites, want = [], max(2, int(edge.sum()) // 170)
    for y, x in cand:
        if len(sites) >= want * 2:  # some will not take (break_floors)
            break
        if any((x - q['px'][0]) ** 2 + (y - q['px'][1]) ** 2 < 55 ** 2 for q in sites):
            continue
        w = raised[max(0, y - 12):y + 13, max(0, x - 12):x + 13]
        ys, xs = np.nonzero(w)
        nx, ny = xs.mean() - min(12, x), ys.mean() - min(12, y)  # toward the stone
        ox, oz = -nx * sx, -ny * sz  # out of it, in metres
        l = math.hypot(ox, oz) or 1
        sites.append({'kind': 'edge', 'px': (int(x), int(y)), 'at': m([x, y]), 'out': (ox / l, oz / l)})
    inside = cv2.distanceTransform(raised, cv2.DIST_L2, 5)
    deep = np.argwhere((inside > 30) & (sound_middle == 0) & (safe == 1))
    rng.shuffle(deep)
    for y, x in deep[:40]:
        if not any((x - q['px'][0]) ** 2 + (y - q['px'][1]) ** 2 < 45 ** 2 for q in sites):
            a = rng.uniform(-math.pi, math.pi)
            sites.insert(0, {'kind': 'hole', 'px': (int(x), int(y)), 'at': m([x, y]), 'out': (math.sin(a), math.cos(a))})
            break
    return sites, want


def pavers_near(x, z, r):
    """The paving stones (x0, z0, x1, z1) within r of (x, z), in metres."""
    T, out = PAVING['tile'], []
    for tz in range(math.floor((z - r) / T), math.floor((z + r) / T) + 1):
        for row in PAVING['rows']:
            z0, z1 = tz * T + row['z0'], tz * T + row['z1']
            if z1 < z - r or z0 > z + r:
                continue
            for tx in range(math.floor((x - r) / T) - 1, math.floor((x + r) / T) + 1):
                for a, b in row['stones']:
                    x0, x1 = tx * T + a, tx * T + b
                    if x1 >= x - r and x0 <= x + r:
                        out.append((x0, z0, x1, z1))
    return out


def break_floors(polys, sites, want, water, seed):
    """Break the stone floors `polys` ([(pts, holes)] in metres) at `sites`: the paving stones
    round each one are gone, the farthest of them snapped across along a jagged line, so the edge
    steps along the joints. A break that would cut a floor in two, or reach past the water floor
    under it (`water`, same form), is not made. Each break adds a `rubble` prop listing its stones
    (x, z, w, d), which fell into the water. Returns the floors, now unrounded outlines."""
    rng = np.random.default_rng(seed)
    pts_all = [q for pts, _ in polys for q in pts]
    if not pts_all:
        return polys
    x0, z0 = min(q[0] for q in pts_all) - 1, min(q[1] for q in pts_all) - 1
    x1, z1 = max(q[0] for q in pts_all) + 1, max(q[1] for q in pts_all) + 1
    GW, GH = int((x1 - x0) / RES) + 1, int((z1 - z0) / RES) + 1
    g = lambda q: [round((q[0] - x0) / RES), round((q[1] - z0) / RES)]

    def raster(ps):
        out = np.zeros((GH, GW), np.uint8)
        for pts, holes in ps:
            cv2.fillPoly(out, [np.array([g(q) for q in pts], np.int32)], 1)
            for h in holes:
                cv2.fillPoly(out, [np.array([g(q) for q in h], np.int32)], 0)
        return out

    floor, safe = raster(polys), cv2.erode(raster(water), cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17)))
    clean = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))  # square: it keeps the joints' right angles

    def big_pieces(mask):
        n, lab, st, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
        return sum(1 for k in range(1, n) if st[k][4] * RES * RES >= 0.5)

    n0, made = big_pieces(floor), 0
    for site in sites:
        if made >= want + 1:
            break
        sx_, sz_ = site['at']
        hole = site['kind'] == 'hole'
        R = rng.uniform(0.9, 1.3) if hole else rng.uniform(1.2, 2.1)
        cut, stones = np.zeros_like(floor), []
        for (a0, b0, a1, b1) in pavers_near(sx_, sz_, R + 1.2):
            cx, cz = (a0 + a1) / 2, (b0 + b1) / 2
            d = math.hypot(cx - sx_, cz - sz_)
            if d > R * rng.uniform(0.55, 1.15):
                continue
            stone = np.zeros_like(floor)
            cv2.rectangle(stone, g((a0, b0)), g((a1, b1)), 1, -1)
            if not (stone & floor).any():
                continue
            w, dd = a1 - a0, b1 - b0
            if d > 0.5 * R and rng.random() < 0.45:
                # snapped across: only the part toward the break is gone, along a jagged line
                ux, uz = (sx_ - cx) / (d or 1), (sz_ - cz) / (d or 1)
                px_, pz_ = -uz, ux
                c = (cx + ux * rng.uniform(-0.15, 0.2) * max(w, dd), cz + uz * rng.uniform(-0.15, 0.2) * max(w, dd))
                L = max(w, dd)
                p0 = (c[0] + px_ * L + ux * rng.uniform(-0.12, 0.12), c[1] + pz_ * L + uz * rng.uniform(-0.12, 0.12))
                p1 = (c[0] + px_ * L * rng.uniform(-0.3, 0.3) + ux * rng.uniform(-0.15, 0.15), c[1] + pz_ * L * rng.uniform(-0.3, 0.3) + uz * rng.uniform(-0.15, 0.15))
                p2 = (c[0] - px_ * L + ux * rng.uniform(-0.12, 0.12), c[1] - pz_ * L + uz * rng.uniform(-0.12, 0.12))
                side = np.zeros_like(floor)
                cv2.fillPoly(side, [np.array([g(p0), g(p1), g(p2), g((p2[0] + ux * 3, p2[1] + uz * 3)), g((p0[0] + ux * 3, p0[1] + uz * 3))], np.int32)], 1)
                stone &= side
                k = 0.5
                stones.append([round(cx + ux * L * 0.25, 2), round(cz + uz * L * 0.25, 2), round(w * (k if abs(ux) > abs(uz) else 1), 2), round(dd * (1 if abs(ux) > abs(uz) else k), 2)])
            else:
                stones.append([round(cx, 2), round(cz, 2), round(w, 2), round(dd, 2)])
            cut |= stone
        cut &= safe
        trial = cv2.morphologyEx(floor & (1 - cut), cv2.MORPH_OPEN, clean)
        gone = int((floor & (1 - trial)).sum()) * RES * RES
        if gone < 0.6 or big_pieces(trial) != n0:
            continue
        floor = trial
        made += 1
        rubble.append({'type': 'rubble', 'at': [round(sx_, 2), round(sz_, 2)], 'rot': round(math.atan2(*site['out']), 3),
                       'scale': round(R / 1.4, 2), 'stones': stones})
    # back to outlines (crumbs of stone left on their own are dropped)
    cs, hier = cv2.findContours(floor, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    w_ = lambda c: [[round(x0 + (p[0] + 0.5) * RES, 2), round(z0 + (p[1] + 0.5) * RES, 2)] for p in cv2.approxPolyDP(c, 1.2, True)[:, 0, :].tolist()]
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for k, c in enumerate(cs):
        if hier[k][3] != -1 or cv2.contourArea(c) * RES * RES < 0.5:
            continue
        holes, j = [], hier[k][2]
        while j != -1:
            if cv2.contourArea(cs[j]) * RES * RES >= 0.3:
                holes.append(w_(cs[j]))
            j = hier[j][0]
        out.append((w_(c), holes))
    return out


# zones that `join` another are one open room with it (owner, 29 October 2026, the boss room:
# "walk on the water, take out the rocks in the way"): the rocks the picture paints between them
# and in their middle are closed over (`joinClose` px), so the room is one floor of stone and
# water; each zone keeps its own part of it
joined = {}
for i, z in enumerate(zones):
    if z.get('join'):
        j = next(k for k, o in enumerate(zones) if o['id'] == z['join'])
        zi, zj = (cv2.dilate((label == k).astype(np.uint8), ell(7)) for k in (i, j))
        u = cv2.morphologyEx((zi | zj) & walk, cv2.MORPH_CLOSE, ell(z['joinClose'])) & (zi | zj)
        u = fill_small_holes(u, 200000)
        joined[i], joined[j] = u & zi, u & zj


for i, z in enumerate(zones):
    # each zone reaches a few pixels past its edge, so two zones on one level overlap instead of
    # leaving a hairline of void between their outlines
    zm = cv2.dilate((label == i).astype(np.uint8), ell(7))
    area = joined.get(i, zm & walk)
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
        sites, want = break_sites(raised, area, 97 + i)
        water_here = [(f['pts'], f.get('holes', [])) for f in floors if f['id'].startswith(f"{z['id']}-water-")]
        for n, (pts, holes) in enumerate(break_floors(polygons(raised, 700, 900), sites, want, water_here, 97 + i)):
            f = {'id': f"{z['id']}-stone-{n}", 'kind': 'stone', 'shape': 'poly', 'y': z['y'], 'pts': pts}
            if holes:
                f['holes'] = holes
            floors.append(f)

# each flight runs the whole length the concept draws (its steps are deep, as the picture's are)
# and takes the tone of the room it climbs to
def tone_at(q):
    z = zones[int(label[min(H - 1, int(q[1])), min(W - 1, int(q[0]))])]
    return z.get('tone')


for s in CFG['stairs']:
    # a little wider than its cut (w/2 + 1 px a side), so no slit of void shows along its sides
    flight = {'id': s['id'], 'kind': 'stone', 'shape': 'stairs', 'a': m(s['a']), 'b': m(s['b']), 'w': round(ml(s['w'] + 4), 2), 'y0': s['y0'], 'y1': s['y1']}
    if tone_at(s['b']):
        flight['tone'] = tone_at(s['b'])
    floors.append(flight)


def metre_outlines(mask, x0, z0):
    """A mask on the RES grid with its corner at (x0, z0) back to [(pts, holes)] in metres,
    biggest first (crumbs under 0.5 m² dropped)."""
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    w_ = lambda c: [[round(x0 + (p[0] + 0.5) * RES, 2), round(z0 + (p[1] + 0.5) * RES, 2)] for p in cv2.approxPolyDP(c, 1.2, True)[:, 0, :].tolist()]
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for k, c in enumerate(cs):
        if hier[k][3] != -1 or cv2.contourArea(c) * RES * RES < 0.5:
            continue
        holes, j = [], hier[k][2]
        while j != -1:
            if cv2.contourArea(cs[j]) * RES * RES >= 0.3:
                holes.append(w_(cs[j]))
            j = hier[j][0]
        out.append((cv2.contourArea(c), w_(c), holes))
    return [(pts, holes) for _, pts, holes in sorted(out, key=lambda o: -o[0])]


def dist_to_poly(q, pts):
    if inside_pts(q, pts):
        return 0.0
    best = math.inf
    for i in range(len(pts)):
        (ax, az), (bx, bz) = pts[i], pts[(i + 1) % len(pts)]
        dx, dz = bx - ax, bz - az
        t = max(0, min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / ((dx * dx + dz * dz) or 1)))
        best = min(best, math.hypot(q[0] - ax - dx * t, q[1] - az - dz * t))
    return best


def inside_pts(q, pts):
    c = False
    for i in range(len(pts)):
        (ax, az), (bx, bz) = pts[i], pts[(i + 1) % len(pts)]
        if (az > q[1]) != (bz > q[1]) and q[0] < ax + (bx - ax) * (q[1] - az) / (bz - az):
            c = not c
    return c


# where a flight meets the floors, the joint is built, not overlapped. A flight stops at the edge
# of the floor it reaches (its ends are drawn back to that edge where the concept's line runs on
# into the floor, as long as the slope stays walkable), the floor at each end's level gets a square
# apron as wide as the flight (1.5 m deep), so it meets the steps along one straight line across
# them, and every floor is cut back to the flight's own sides, so none lies over it or leaves a slit
# beside it. Worked on the RES grid in metres, like the breaks.
APRON, MAX_SLOPE = 1.5, 0.28
for st in [f for f in floors if f['shape'] == 'stairs']:
    rise = abs(st['y1'] - st['y0'])
    ends = []
    for key, y_end in (('a', st['y0']), ('b', st['y1'])):
        cands = [f for f in floors if f['shape'] == 'poly' and f['kind'] == 'stone' and abs(f['y'] - y_end) < 0.05]
        best = min(cands, key=lambda f: dist_to_poly(st[key], f['pts']), default=None)
        ends.append(best if best is not None and dist_to_poly(st[key], best['pts']) < 4 else None)
    for (key, other), f_end in zip((('a', 'b'), ('b', 'a')), ends):
        if f_end is None:
            continue
        p, q = st[key], st[other]
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        ux, uz = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        t = 0.0
        while inside_pts((p[0] + ux * (t + 0.1), p[1] + uz * (t + 0.1)), f_end['pts']) and rise / (L - t - 0.1) <= MAX_SLOPE:
            t += 0.1
        st[key] = [round(p[0] + ux * t, 2), round(p[1] + uz * t, 2)]
    (ax, az), (bx, bz), h = st['a'], st['b'], st['w'] / 2
    L = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / L, (bz - az) / L
    rect = lambda t0, t1: [(ax + ux * t0 - uz * h, az + uz * t0 + ux * h), (ax + ux * t1 - uz * h, az + uz * t1 + ux * h),
                           (ax + ux * t1 + uz * h, az + uz * t1 - ux * h), (ax + ux * t0 + uz * h, az + uz * t0 - ux * h)]
    run = rect(0, L)
    # each apron reaches 5 cm under the flight's end, so the two meet (the flight is listed later and wins there)
    aprons = [(f_end, r) for f_end, r in zip(ends, (rect(-APRON, 0.05), rect(L - 0.05, L + APRON))) if f_end is not None]
    reach = [q for r in [run] + [r for _, r in aprons] for q in r]
    rx0, rz0 = min(q[0] for q in reach) - 0.5, min(q[1] for q in reach) - 0.5
    rx1, rz1 = max(q[0] for q in reach) + 0.5, max(q[1] for q in reach) + 0.5
    for f in [f for f in floors if f['shape'] == 'poly']:
        xs, zs = [q[0] for q in f['pts']], [q[1] for q in f['pts']]
        mine = [r for g_, r in aprons if g_ is f]
        if (max(xs) < rx0 or min(xs) > rx1 or max(zs) < rz0 or min(zs) > rz1) and not mine:
            continue
        x0, z0 = min(min(xs), rx0) - 1, min(min(zs), rz0) - 1
        x1, z1 = max(max(xs), rx1) + 1, max(max(zs), rz1) + 1
        GW, GH = int((x1 - x0) / RES) + 1, int((z1 - z0) / RES) + 1
        g = lambda q: [round((q[0] - x0) / RES), round((q[1] - z0) / RES)]
        fill = lambda mask, pts, v: cv2.fillPoly(mask, [np.array([g(q) for q in pts], np.int32)], v)
        mask = np.zeros((GH, GW), np.uint8)
        fill(mask, f['pts'], 1)
        for hole in f.get('holes', []):
            fill(mask, hole, 0)
        before = mask.copy()
        fill(mask, run, 0)
        for r in mine:
            fill(mask, r, 1)
        if (mask == before).all():
            continue
        pieces = metre_outlines(mask, x0, z0)
        if not pieces:
            floors.remove(f)
            continue
        f['pts'] = pieces[0][0]
        f.pop('holes', None)
        if pieces[0][1]:
            f['holes'] = pieces[0][1]
        # what the flight cut off: a real part of the floor stays its own floor, a sliver under 10 m² goes
        area = lambda P: abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2
        for k, (pts, holes) in enumerate(q for q in pieces[1:] if area(q[0]) >= 10):
            extra = {**f, 'id': f"{f['id']}-{k + 1}", 'pts': pts}
            extra.pop('holes', None)
            if holes:
                extra['holes'] = holes
            floors.insert(floors.index(f) + 1, extra)


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


# set in order, not scattered (owner, 29 October 2026: "arrange the assets that sit anywhere"):
# stairs count as floor here, so a stair mouth is never mistaken for an edge
def stair_px(f):
    a, b = px(f['a']), px(f['b'])
    dx, dy = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dy) or 1
    hx, hy = -dy / l * f['w'] / 2 / sx, dx / l * f['w'] / 2 / sz
    return np.array([[a[0] + hx, a[1] + hy], [b[0] + hx, b[1] + hy], [b[0] - hx, b[1] - hy], [a[0] - hx, a[1] - hy]], np.int32)


open_floor = final.copy()
stone = np.zeros_like(walk)
for f in floors:
    if f['shape'] == 'stairs':
        cv2.fillPoly(open_floor, [stair_px(f)], 1)
        cv2.fillPoly(stone, [stair_px(f)], 1)
    elif f['shape'] == 'poly' and f.get('kind') == 'stone':
        cv2.fillPoly(stone, [np.array([px(q) for q in f['pts']], np.int32)], 1)
        for h in f.get('holes', []):
            cv2.fillPoly(stone, [np.array([px(q) for q in h], np.int32)], 0)
to_wall = cv2.distanceTransform(open_floor, cv2.DIST_L2, 5)
to_rim = cv2.distanceTransform(stone, cv2.DIST_L2, 5)
# pillars line the stone's rim, a stone's width in from where it drops to water or the dark, as the
# concept rows them along its walkways and platforms (never out in the water)
rim_pts = np.argwhere((to_rim >= 7) & (to_rim <= 11))
# the loose furniture (chests, barrels, crates, candles, posts) stands back against the walls, in
# front of the corals at their foot, and faces into the room
wall_pts = np.argwhere((to_wall >= 15) & (to_wall <= 21))


def nearest(pts, at):
    d = (pts[:, 0] - at[1]) ** 2 + (pts[:, 1] - at[0]) ** 2
    k = int(np.argmin(d))
    return [int(pts[k][1]), int(pts[k][0])]


def onto_rim(at):
    x, y = at
    return at if stone[y, x] and 6 <= to_rim[y, x] <= 13 else nearest(rim_pts, at)


def against_wall(at):
    x, y = at
    return at if 13 <= to_wall[y, x] <= 23 else nearest(wall_pts, at)


def into_room(at):
    """A point a little way into the room from `at`: up the distance from the walls."""
    x, y = at
    gy, gx = np.gradient(to_wall[max(0, y - 6):y + 7, max(0, x - 6):x + 7].astype(np.float32))
    vx, vy = float(gx.mean()), float(gy.mean())
    l = math.hypot(vx, vy) or 1
    return [x + vx / l * 20, y + vy / l * 20]


PILLARS = ('pillar', 'pillarBroken')
FURNITURE = ('chest', 'barrel', 'crate', 'candles', 'post')
props = []
for p in CFG['props']:
    q = {k: v for k, v in p.items() if k not in ('at', 'face')}
    wall = p['type'] in ('shellGate', 'sealedArch')
    if wall:
        at = p['at']
    elif p['type'] in ('coral', 'crystal'):
        at = onto_edge(p['at'])
    elif p['type'] in PILLARS:
        at = onto_rim(p['at'])
    elif p['type'] in FURNITURE:
        at = against_wall(p['at'])
    else:
        at = onto_floor(p['at'])
    q['at'] = m(at)
    if p['type'] in FURNITURE:
        q['rot'] = facing(at, into_room(at))
    elif 'face' in p:
        q['rot'] = facing(p['at'], p['face'])
    props.append(q)
props += rubble


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


# the boss's arena (owner, 29 October 2026: "make the boss room's ground fit for a fight"): the
# arena floor (`arena.zone`, the raised dais) is cleared to one open, level stage. Every prop on it
# moves out along the line from the arena's middle to its rim, the pearl altar goes to the far
# side from the entry stair as the throne, and the boss stands in front of it facing the stair.
# The data records the stage (`inside.arena`: middle, clear radius, the boss's spot, the entry).
def edge_dist(q, rings):
    best = math.inf
    for ring in rings:
        for i in range(len(ring)):
            (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
            dx, dz = bx - ax, bz - az
            t = max(0, min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / ((dx * dx + dz * dz) or 1)))
            best = min(best, math.hypot(q[0] - ax - dx * t, q[1] - az - dz * t))
    return best


arena = None
A = CFG.get('arena')
if A:
    # the stage: the walkable floors of its zones together (the dais and the water round it)
    stage = [f for f in floors if f['shape'] == 'poly' and f['kind'] in ('stone', 'shallow') and any(f['id'].startswith(zn + '-') for zn in A['zones'])]
    seat = [f for f in stage if f['id'].startswith(A['zones'][0] + '-')]  # the throne stands on the first zone (the dais)
    xs = [q[0] for f in stage for q in f['pts']]
    zs = [q[1] for f in stage for q in f['pts']]
    G, gx0, gz0 = 0.25, min(xs) - 1, min(zs) - 1
    nx_, nz_ = int((max(xs) - gx0 + 1) / G) + 1, int((max(zs) - gz0 + 1) / G) + 1

    def grid_of(fl):
        m_ = np.zeros((nz_, nx_), np.uint8)
        for f in fl:
            cv2.fillPoly(m_, [np.array([[(q[0] - gx0) / G, (q[1] - gz0) / G] for q in f['pts']], np.int32)], 1)
            for h in f.get('holes', []):
                cv2.fillPoly(m_, [np.array([[(q[0] - gx0) / G, (q[1] - gz0) / G] for q in h], np.int32)], 0)
        return m_, cv2.distanceTransform(m_, cv2.DIST_L2, 5) * G

    st_m, st_d = grid_of(stage)
    se_m, se_d = grid_of(seat)
    cell = lambda q: (min(nz_ - 1, max(0, int((q[1] - gz0) / G))), min(nx_ - 1, max(0, int((q[0] - gx0) / G))))
    on_stage = lambda q: bool(st_m[cell(q)])
    edge = lambda q: float(st_d[cell(q)])
    on_seat = lambda q: bool(se_m[cell(q)])
    k = int(np.argmax(st_d))
    cz, cx = gz0 + (k // nx_) * G, gx0 + (k % nx_) * G
    R = float(st_d.flat[k])
    level_ = seat[0]['y']
    entry = min((f for f in floors if f['shape'] == 'stairs' and abs(max(f['y0'], f['y1']) - level_) < 0.5),
                key=lambda f: math.hypot((f['b'] if f['y1'] > f['y0'] else f['a'])[0] - cx, (f['b'] if f['y1'] > f['y0'] else f['a'])[1] - cz))
    ex, ez = entry['b'] if entry['y1'] > entry['y0'] else entry['a']
    dx, dz = cx - ex, cz - ez
    l = math.hypot(dx, dz) or 1
    dx, dz = dx / l, dz / l
    # the throne: on the dais, as far past the middle as leaves the altar clear of the dais's rim
    t = 0.0
    while on_seat((cx + dx * (t + 0.5), cz + dz * (t + 0.5))) and float(se_d[cell((cx + dx * (t + 0.5), cz + dz * (t + 0.5)))]) > A['thronePad']:
        t += 0.5
    throne = [round(cx + dx * t, 2), round(cz + dz * t, 2)]
    boss = [round(throne[0] - dx * A['bossAhead'], 2), round(throne[1] - dz * A['bossAhead'], 2)]
    for q in props:
        if q['type'] in ('rubble', 'runeCircle') or not on_stage(q['at']) or math.hypot(q['at'][0] - cx, q['at'][1] - cz) > R - 0.35:
            continue
        if q['type'] == 'bigPearl':
            q['at'] = throne
            q['rot'] = round(math.atan2(-dx, -dz), 3)
            continue
        # out along the line from the middle to the edge of the open circle, never onto the entry or the throne
        ax, az = q['at'][0] - cx, q['at'][1] - cz
        ang = math.atan2(az, ax) if math.hypot(ax, az) > 0.5 else 0.0
        for turn in (0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05):
            ux, uz = math.cos(ang + turn), math.sin(ang + turn)
            r = R - 0.3  # its body (up to ~1 m) stays outside the clear circle, its foot on the stage
            at = [round(cx + ux * r, 2), round(cz + uz * r, 2)]
            if math.hypot(at[0] - ex, at[1] - ez) > A['entryClear'] and math.hypot(at[0] - throne[0], at[1] - throne[1]) > A['entryClear']:
                break
        q['at'] = at
    # a worn ring in the paving marks the stage (no collider)
    props.append({'type': 'runeCircle', 'at': [round(cx, 2), round(cz, 2)], 'scale': A['ring']})
    arena = {'floor': seat[0]['id'], 'floors': [f['id'] for f in stage], 'at': [round(cx, 2), round(cz, 2)], 'r': round(R, 1), 'clear': round(R - A['rim'], 1),
             'boss': boss, 'bossFacing': round(math.atan2(-dx, -dz), 3), 'throne': throne, 'entry': [round(ex, 2), round(ez, 2)]}

# a waterfall pours from where the concept shows it, put on the real edge it pours over (and wider
# than the trace's widths, which were measured on the far smaller first map: 1.4x over a ledge,
# 1.8x down a wall):
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
        fall = {'kind': 'ledge', 'at': [round(x, 2), round(z, 2)], 'facing': round(math.atan2(nx, nz), 3), 'w': round(w['w'] * 1.4, 1), 'top': w['top'], 'bottom': w['bottom']}
    else:
        x, z, nx, nz, f = along_face(w, lambda f: level(f) is not None and abs(level(f) - w['bottom']) < 0.3)
        # the wall stands on the void side; the fall faces into the room
        fall = {'kind': 'wall', 'at': [round(x + nx * 0.35, 2), round(z + nz * 0.35, 2)], 'facing': round(math.atan2(-nx, -nz), 3), 'w': round(w['w'] * 1.8, 1), 'top': round(w['bottom'] + min(4.4, w['top'] - w['bottom']), 2), 'bottom': w['bottom']}
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
if arena:
    inside['arena'] = arena
    # the room's lamp hangs over the stage's middle and reaches its rim
    lamp = min(inside['lights'], key=lambda l: math.hypot(l['at'][0] - arena['at'][0], l['at'][1] - arena['at'][1]))
    lamp['at'] = arena['at']
    lamp['range'] = max(lamp['range'], round(arena['r'] * 2.6))
else:
    inside.pop('arena', None)
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
