"""Pearlshell Grotto caves: the walls and the old floor of every `style: "cave"` room, made in Blender.

Run headless:  blender -b --python scripts/blender/grotto-cave.py
Reads the rooms through scripts/grotto-cave-input.mjs (it runs node), which gives each cave floor's
outline from data/dungeons/shell-grotto.json and, every 0.4 m along it, the outward normal and
whether the hero walks on past that point (an opening) or the floor ends there (a wall).
Writes public/models/grotto/grotto-cave.glb: for each cave floor `<id>`, three objects in world metres
  cavefloor_<id>  old flagstones: irregular, worn, cracked, sunken, tilted, many missing over dirt
  cavewall_<id>   the rock face around it, smooth-shaded: tall at the back (away from the game
                  camera) with flowstone ribs, bulges and an overhanging lip, low at the front so the
                  camera sees in, a niche behind each shell gate
  caverock_<id>   faceted boulders crusting the tops and the low front rim, stalactites under the
                  lip, rubble along the foot
Ambient occlusion is baked (Cycles) and multiplied into the vertex colours; light is not baked, so
the game's lamps light it. The scene's extras carry `source`, the hash of the map data it was built
from: tests/core/dungeon.test.js fails when the map changes and this file was not rebuilt.
"""
import bpy, bmesh, json, math, os, random, subprocess
from mathutils import Vector, noise
from mathutils.kdtree import KDTree

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'grotto', 'grotto-cave.glb')
DATA = json.loads(subprocess.run(['node', os.path.join(ROOT, 'scripts', 'grotto-cave-input.mjs')], check=True, capture_output=True, text=True, cwd=ROOT).stdout)

bpy.ops.wm.read_factory_settings(use_empty=True)
noise.seed_set(7)


def W(x, y, z):
    """Game (x right, y up, z toward the camera) to Blender (z up); the glTF export turns it back."""
    return Vector((x, -z, y))


def lin(c):
    return tuple(max(0.0, v) ** 2.2 for v in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mul(a, k):
    return tuple(v * k for v in a)


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def fbm(x, y, seed=0, octaves=3):
    s, amp, f = 0.0, 0.5, 1.0
    for _ in range(octaves):
        s += amp * noise.noise(Vector((x * f, y * f, seed * 13.7 + f)))
        amp *= 0.5
        f *= 2.03
    return s * 1.6  # about -1..1


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def new_object(name, bm, colours):
    """colours: one sRGB tuple per vertex, in the order the vertices were made. Colours live on
    the vertices (a faceted piece gives every face its own corners): the glTF exporter mixes up
    per-corner colours on many-sided faces, so the faces are also cut into triangles here."""
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material('rock'))
    layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(colours):
        layer.data[i].color = (*lin(c), 1.0)
    me.color_attributes.active_color = layer
    return ob


def newell(pts):
    n = Vector((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return n


class Builder:
    """Faceted pieces: every face has its own corners, each with a colour, in one bmesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.cols = []

    def verts(self, pts, cols):
        """Corners shared by several faces (a stone's top and its rim)."""
        self.cols += cols
        return [self.bm.verts.new(p) for p in pts]

    def join(self, vs, toward=None):
        if toward is not None and newell([v.co for v in vs]).dot(toward) < 0:
            vs = vs[::-1]
        try:
            self.bm.faces.new(vs)
        except ValueError:
            pass

    def face(self, pts, cols, toward=None):
        if toward is not None and newell(pts).dot(toward) < 0:
            pts, cols = pts[::-1], cols[::-1]
        vs = [self.bm.verts.new(p) for p in pts]
        self.cols += cols  # one per vertex, whether or not the face can be made
        try:
            self.bm.faces.new(vs)
        except ValueError:
            pass

    def rock(self, rng, centre, size, base, flat=0.6, sink=0.25):
        """A faceted stone: a hull of random points, flattened, sunk a little into the floor."""
        bm = bmesh.new()
        for _ in range(rng.randint(14, 20)):
            a, z = rng.uniform(0, math.tau), rng.uniform(-1, 1)
            r = math.sqrt(1 - z * z)
            bm.verts.new((math.cos(a) * r * size[0] * rng.uniform(0.75, 1.1), math.sin(a) * r * size[1] * rng.uniform(0.75, 1.1), z * size[2] * flat))
        bmesh.ops.convex_hull(bm, input=bm.verts)
        rot = rng.uniform(0, math.tau)
        cr, sr = math.cos(rot), math.sin(rot)
        for f in bm.faces:
            pts = []
            for v in f.verts:
                x, y, z = v.co
                pts.append(Vector((centre.x + x * cr - y * sr, centre.y + x * sr + y * cr, centre.z + z + size[2] * flat * (1 - sink))))
            up = max(0.0, f.normal.z)
            tone = mul(base, 0.72 + 0.4 * up)
            self.face(pts, [tone] * len(pts))
        bm.free()


# ---------------------------------------------------------------- polygons (x, z) in metres


def area2(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def centroid(p):
    return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))


def clip(poly, a, b, c):
    """Keep the part of a convex polygon where a*x + b*z <= c."""
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        dp, dq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if dp <= 0:
            out.append(p)
        if (dp < 0) != (dq < 0) and dp != dq:
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def simplify(poly, tol):
    """Drop corners closer than tol to the last kept one (power-diagram cells have tiny edges)."""
    out = [poly[0]]
    for q in poly[1:]:
        if math.hypot(q[0] - out[-1][0], q[1] - out[-1][1]) >= tol:
            out.append(q)
    if len(out) > 3 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < tol:
        out.pop()
    return out


def scaled(poly, d):
    """Shrunk toward the centre by about d (always a clean polygon, never folded)."""
    cx, cz = centroid(poly)
    r = sum(math.hypot(x - cx, z - cz) for x, z in poly) / len(poly)
    k = max(0.2, 1 - d / max(r, 1e-6))
    return [(cx + (x - cx) * k, cz + (z - cz) * k) for x, z in poly]


def inset(poly, d):
    """A convex counter-clockwise polygon moved in by d on every side; where a short side would
    vanish (and the outline fold over itself) it is shrunk toward its centre instead."""
    poly = simplify(poly, max(0.06, 2.5 * d))
    if len(poly) < 3:
        return None
    lines = []
    for i in range(len(poly)):
        (ax, az), (bx, bz) = poly[i], poly[(i + 1) % len(poly)]
        l = math.hypot(bx - ax, bz - az)
        if l < 1e-6:
            continue
        nx, nz = -(bz - az) / l, (bx - ax) / l  # inward (left of the edge)
        lines.append(((ax + nx * d, az + nz * d), (bx - ax, bz - az)))
    out = []
    for i in range(len(lines)):
        (p, r), (q, s) = lines[i - 1], lines[i]
        den = r[0] * s[1] - r[1] * s[0]
        if abs(den) < 1e-9:
            out.append(q)
            continue
        t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den
        out.append((p[0] + r[0] * t, p[1] + r[1] * t))
    if len(out) != len(lines):
        return None
    # every side must keep its direction, or the outline folded
    for i in range(len(out)):
        a, b = out[i - 1], out[i]
        if (b[0] - a[0]) * lines[i - 1][1][0] + (b[1] - a[1]) * lines[i - 1][1][1] <= 0:
            out = scaled(poly, d)
            break
    return out if len(out) >= 3 and area2(out) > 0.01 else None


def chamfer(poly, c, chip=-1, chip_c=0.0):
    """Worn corners: each corner cut back by c metres (the chipped one by chip_c)."""
    out = []
    n = len(poly)
    for i in range(n):
        v, p, q = poly[i], poly[i - 1], poly[(i + 1) % n]
        k = chip_c if i == chip else c
        for a in (p, q):
            l = math.hypot(a[0] - v[0], a[1] - v[1])
            t = min(k, l * 0.42) / l if l > 1e-6 else 0
            out.append((v[0] + (a[0] - v[0]) * t, v[1] + (a[1] - v[1]) * t))
    return out


# ---------------------------------------------------------------- the floor

UP = Vector((0, 0, 1))
TONES = [(0.62, 0.57, 0.49), (0.55, 0.53, 0.49), (0.58, 0.52, 0.44), (0.50, 0.47, 0.42)]
DIRT = (0.34, 0.28, 0.22)
MOSS = (0.31, 0.37, 0.27)
ROCK = (0.50, 0.44, 0.37)


def build_floor(f, wall_kd, rng):
    y = f['y']
    outer = f['rings'][0]
    edge = [p for ring in f['edges'] for p in ring]
    all_kd = KDTree(len(edge))
    for i, p in enumerate(edge):
        all_kd.insert((p['x'], p['z'], 0), i)
    all_kd.balance()
    def inside(x, z):
        # on the floor's side of the nearest outline point (the outline is smooth, its normals point out)
        _, i, _ = all_kd.find((x, z, 0))
        p = edge[i]
        return (x - p['x']) * p['nx'] + (z - p['z']) * p['nz'] < 0
    edge_d = lambda x, z: wall_kd.find((x, z, 0))[2]
    wallness = lambda x, z: smooth(1 - (edge_d(x, z) - 0.4) / 4.0)
    xs, zs = [p[0] for p in outer], [p[1] for p in outer]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)

    # seeds: big slabs first, then the ordinary stones, then small ones in the gaps
    grid, seeds, G = {}, [], 0.5
    def near(x, z, rad):
        gx, gz = int(x // G), int(z // G)
        k = int(rad // G) + 1
        for i in range(gx - k, gx + k + 1):
            for j in range(gz - k, gz + k + 1):
                yield from grid.get((i, j), ())
    for lo, hi, tries in ((1.15, 1.5, 1500), (0.72, 0.92, 40000), (0.42, 0.58, 30000)):
        for _ in range(tries):
            x, z, r = rng.uniform(x0, x1), rng.uniform(z0, z1), rng.uniform(lo, hi)
            if not inside(x, z) or edge_d(x, z) < 0.25:
                continue
            if any((x - s[0]) ** 2 + (z - s[1]) ** 2 < (0.5 * (r + s[2])) ** 2 for s in near(x, z, 1.6)):
                continue
            s = (x, z, r)
            seeds.append(s)
            grid.setdefault((int(x // G), int(z // G)), []).append(s)

    b = Builder()
    stones = 0
    bare = []  # dirt where a stone is gone: pebbles go there
    for (px, pz, pr) in seeds:
        # the stone's cell: a power diagram, so big slabs get big cells
        h = min(1.5 * pr, 1.8)
        cell = [(px - h, pz - h), (px + h, pz - h), (px + h, pz + h), (px - h, pz + h)]
        wi = (pr / 2) ** 2
        # every seed that could own part of the starting square (or cells overlap)
        for (qx, qz, qr) in near(px, pz, 2.9 * h):
            if (qx, qz) == (px, pz):
                continue
            wj = (qr / 2) ** 2
            cell = clip(cell, 2 * (qx - px), 2 * (qz - pz), qx * qx + qz * qz - px * px - pz * pz - wj + wi)
            if len(cell) < 3:
                break
        if len(cell) < 3 or area2(cell) < 0.05:
            continue
        cx, cz = centroid(cell)
        if not all(inside(x, z) for x, z in cell):
            # at the wall: pulled in until it fits, or left as dirt
            cell = [(cx + (x - cx) * 0.75, cz + (z - cz) * 0.75) for x, z in cell]
            if not all(inside(x, z) for x, z in cell):
                bare.append((cx, cz, 0.5))
                continue
        w = wallness(cx, cz)
        clump = smooth((fbm(cx / 5.0, cz / 5.0, 3) - 0.05) / 0.45)
        if rng.random() < 0.05 + 0.4 * w ** 1.5 + 0.55 * clump:
            bare.append((cx, cz, math.sqrt(area2(cell)) * 0.5))
            if rng.random() < 0.35:  # a broken shard of it is left, sunk in the dirt
                k = rng.randrange(len(cell))
                ax, az = cell[k]
                s = rng.uniform(0.3, 0.5)
                shard = [(ax + (x - ax) * s, az + (z - az) * s) for x, z in cell]
                stone(b, rng, shard, y, w, sunk=True)
            continue
        gap = rng.uniform(0.035, 0.07) + 0.06 * w
        poly = inset(cell, gap)
        if not poly:
            continue
        if rng.random() < 0.18 + 0.3 * w:
            # cracked across: two pieces of one stone, the crack open to the dirt, one half sunk a little
            a = rng.uniform(0, math.pi)
            ca, sa = math.cos(a), math.sin(a)
            c = ca * cx + sa * cz
            look = settle(rng, cx, cz, y, w, False)
            for k, piece in enumerate((clip(poly, ca, sa, c - 0.045), clip(poly, -ca, -sa, -c - 0.045))):
                if len(piece) >= 3 and area2(piece) > 0.03:
                    stone(b, rng, piece, y, w, look=(*look[:2], look[2] - 0.018 * k, *look[3:]))
        else:
            stone(b, rng, poly, y, w)
        stones += 1

    # loose stones on the bare dirt
    for (x, z, r) in bare:
        for _ in range(rng.randint(2, 5)):
            a, d = rng.uniform(0, math.tau), rng.uniform(0, r)
            s = rng.uniform(0.06, 0.16)
            b.rock(rng, W(x + math.cos(a) * d, y, z + math.sin(a) * d), (s * 1.2, s, s), ROCK, flat=0.5, sink=0.4)
        if rng.random() < 0.25:
            s = rng.uniform(0.2, 0.34)
            b.rock(rng, W(x, y, z), (s * 1.3, s, s), mul(ROCK, 0.95), flat=0.5, sink=0.5)
    print(f['id'], len(seeds), 'cells', stones, 'stones', len(bare), 'bare')
    return new_object(f'cavefloor_{f["id"]}', b.bm, b.cols)


def settle(rng, cx, cz, y, w, sunk):
    """How a stone lies (tilt, height, about its centre) and its colour."""
    tilt = rng.uniform(0.0, 0.06 if sunk else 0.035)
    ta = rng.uniform(0, math.tau)
    h0 = (rng.uniform(-0.01, 0.03) if sunk else rng.uniform(0.045, 0.085)) - 0.025 * w
    tone = TONES[int((fbm(cx / 2.2, cz / 2.2, 5) + 1) * 2) % len(TONES)]
    tone = mul(tone, rng.uniform(0.88, 1.08))
    grime = min(0.7, 0.5 * w + 0.35 * max(0.0, fbm(cx / 3.0, cz / 3.0, 9)) + (0.2 if sunk else 0))
    tone = mix(tone, DIRT, grime * 0.6)
    if w > 0.15 and fbm(cx / 2.5, cz / 2.5, 11) > 0.35:
        tone = mix(tone, MOSS, 0.35)
    return (math.cos(ta) * tilt, math.sin(ta) * tilt, h0, cx, cz, tone)


def stone(b, rng, poly, y, w, sunk=False, look=None):
    """One flagstone: a worn top over a sloped rim that goes down into the dirt."""
    if area2(poly) < 0:
        poly = poly[::-1]
    poly = simplify(poly, 0.04)
    if len(poly) < 3:
        return
    chip = rng.randrange(len(poly)) if rng.random() < 0.4 else -1
    rim = chamfer(poly, rng.uniform(0.05, 0.12), chip, rng.uniform(0.18, 0.3))
    top = scaled(rim, rng.uniform(0.035, 0.06))
    cx, cz = centroid(rim)
    # settled: tilted a little, some sunk to the dirt (the halves of a cracked stone share it)
    gx, gz, h0, ox, oz, tone = look or settle(rng, cx, cz, y, w, sunk)
    ht = lambda x, z: y + h0 + gx * (x - ox) + gz * (z - oz)
    def tint(x, z, k):
        # the rim's foot a touch different; the top is one colour, or its triangles would show
        # as creases across the stone
        return mul(tone, k + (0.04 * fbm(x * 2.1, z * 2.1, 13) if k < 1 else 0))
    # the top and the rim share the top's corners (the game shades each face flat)
    up = b.verts([W(x, ht(x, z), z) for x, z in top], [tint(x, z, 1.0) for x, z in top])
    down = b.verts([W(x, y - 0.03, z) for x, z in rim], [tint(x, z, 0.62) for x, z in rim])
    b.join(up, UP)
    n = len(top)
    for i in range(n):
        # the rim between the top and the dirt; rim and top have the same corner count
        a, c = rim[i], rim[(i + 1) % n]
        out = W((a[0] + c[0]) / 2 - cx, 0, (a[1] + c[1]) / 2 - cz)
        b.join([down[i], down[(i + 1) % n], up[(i + 1) % n], up[i]], out)


# ---------------------------------------------------------------- the walls

FACE = (0.60, 0.52, 0.43)    # the warm rock of the inner face
CRUST = (0.52, 0.46, 0.40)   # the darker rock on top and on the front rim (warm brown-grey, as the concept)
FOOT = (0.36, 0.30, 0.25)
DRIP = (0.66, 0.60, 0.51)
ROW = 0.5                    # metres between rows of the wall surface


def walled(f):
    """Which outline points get wall: a cave room is walled wherever the hero cannot walk on; a
    room with `walls` only where it meets the void (its drops to water or a lower floor keep their
    ledges)."""
    return (lambda p: not p['open']) if f.get('paving') else (lambda p: p['void'])


def build_walls(f, gates, rng):
    """Two objects: the smooth rock face (`cavewall_`) and the faceted boulders, stalactites and
    rubble on and around it (`caverock_`). The rooms without paving get a coarser wall (they are
    many times longer than the entrance)."""
    y = f['y']
    face, rocks = Strip(), Builder()
    wall_at = walled(f)
    for ri, ring in enumerate(f['edges']):
        n = len(ring)
        if n < 4:
            continue
        opened = [not wall_at(p) for p in ring]
        if all(opened):
            continue
        # runs of wall between the openings (a ring with no opening is one closed run)
        if not any(opened):
            runs = [(list(range(n)), True)]
        else:
            start = next(i for i in range(n) if opened[i] and not opened[(i + 1) % n]) + 1
            runs, cur = [], []
            for k in range(n):
                i = (start + k) % n
                if opened[i]:
                    if cur:
                        runs.append((cur, False))
                    cur = []
                else:
                    cur.append(i)
            if cur:
                runs.append((cur, False))
        coarse = not f.get('paving')
        for idx, closed in runs:
            if coarse:
                idx = idx[::3] if closed or len(idx) < 4 else idx[:-1:3] + [idx[-1]]
            if len(idx) >= 3:
                # a hole in a floor is a rock island in the room: an outcrop, not a cave wall
                tallest = 2.4 if ri > 0 else (5.0 if coarse else 8.5)
                wall_run(face, rocks, rng, [ring[i] for i in idx], closed, y, gates, f['step'] * (3 if coarse else 1), coarse, tallest)
    return [new_object(f'cavewall_{f["id"]}', face.bm, face.cols), new_object(f'caverock_{f["id"]}', rocks.bm, rocks.cols)]


class Strip:
    """A smooth surface on a grid of shared corners, a colour per corner."""

    def __init__(self):
        self.bm = bmesh.new()
        self.cols = []

    def vert(self, co, colour):
        self.cols.append(colour)
        return self.bm.verts.new(co)

    def quad(self, vs):
        try:
            self.bm.faces.new(vs).smooth = True
        except ValueError:
            pass


def profile_u(t, ov):
    """How far the inner face stands back from the floor's edge at height t (0 foot, 1 top):
    leaning back as it rises, bulging, then an overhanging lip on the tall walls."""
    keys = ((0.0, -0.08), (0.1, 0.1), (0.3, 0.32), (0.46, 0.46), (0.6, 0.55), (0.72, 0.45),
            (0.82, 0.12 - ov * 0.55), (0.89, -ov), (0.95, 0.1 - ov * 0.5), (1.0, 0.45))
    for (t0, u0), (t1, u1) in zip(keys, keys[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            k = k * k * (3 - 2 * k)
            return u0 + (u1 - u0) * k
    return keys[-1][1]


def relief(s, h, H, seed):
    """The rock's shape on the face: broad bulges and vertical flowstone ribs, the ribs strongest
    high up where the water ran down from the overhang."""
    big = 0.55 * fbm(s / 4.5, h / 6.0, seed)
    period = 1.15 + 0.35 * fbm(s / 6.0, 0.4, seed + 1)
    rib = abs(math.sin(math.pi * (s / period + 0.25 * fbm(s / 3.0, h / 9.0, seed + 2))))
    rib_k = 0.08 + 0.2 * smooth((h / max(H, 1e-3) - 0.15) / 0.5)
    return (big - rib_k * rib) * min(1.0, 0.35 + H / 4.0) * smooth(h / 0.5)


def wall_run(surface, extras, rng, pts, closed, y, gates, step, coarse=False, tallest=8.5):
    m = len(pts)
    length = (m - 1) * step
    # each outline point: how tall the wall is there, its niche and overhang
    info = []
    for i, p in enumerate(pts):
        s = i * step
        back = smooth((-p['nz'] + 0.25) / 0.95)
        if p['drop']:
            back = 0.0
        if coarse and p.get('divider'):
            back = min(back, 0.12)  # a ridge between two rooms, low so the camera sees past it
        low = 0.8 if coarse else 1.4
        H = low + (tallest - low) * back + fbm(s / 7.0, 0.5, 1) * (0.3 + 1.6 * back) * tallest / 8.5
        if not closed:
            end = min(s, length - s)
            H = 0.9 + (H - 0.9) * smooth(end / 3.0)
        recess = 0.0
        for g in gates:
            # a niche behind a shell gate, taller than the arch
            d = math.hypot(p['x'] - g['at'][0], p['z'] - g['at'][1])
            if d < 4.2:
                k = 1 - (d / 4.2) ** 2
                recess = max(recess, 2.2 * k)
                H = max(H, 7.0 * smooth(k * 1.6) + H * (1 - smooth(k * 1.6)))
        info.append((p['x'], p['z'], p['nx'], p['nz'], s, back, H, recess, 0.9 * back * (1 - min(1.0, recess))))
    # columns every half outline step, rows every ROW metres up the tallest part of this run
    colsrc = []
    sub = 1 if coarse else 2  # columns per outline step
    for i in range(m if closed else m - 1):
        a, c = info[i], info[(i + 1) % m]
        for k in range(sub):
            t = k / sub
            v = [a[j] + (c[j] - a[j]) * t for j in range(9)]
            if closed and i == m - 1:
                v[4] = a[4] + step * t
            l = math.hypot(v[2], v[3]) or 1
            v[2], v[3] = v[2] / l, v[3] / l
            colsrc.append(v)
    if not closed:
        colsrc.append(list(info[-1]))
    rows_in = max(4, int(math.ceil(max(v[6] for v in colsrc) / (ROW * (2.4 if coarse else 1)))))
    grid = []
    for x0, z0, nx, nz, s, back, H, recess, ov in colsrc:
        col = []
        # under the floor, then up the face, then over the crust and down the outside into the dark
        col.append((-0.3, -0.45, 0))
        for j in range(rows_in + 1):
            t = j / rows_in
            h = t * H
            u = profile_u(t, ov) + recess + relief(s, h, H, 2)
            col.append((u, h, 1))
        crest = 0.3 + 0.35 * fbm(s / 1.7, 3.0, 4)
        col += [(1.3 + recess * 0.6 + 0.3 * fbm(s / 2.2, 1, 5), H + crest, 2), (2.4 + recess * 0.6, H + 0.15 + 0.2 * fbm(s / 2.0, 2, 5), 2),
                (3.2 + recess * 0.6, H * 0.85, 2), (3.6, -4.0, 2)]
        pts3 = []
        for u, h, kind in col:
            pts3.append((W(x0 + nx * u, y + h, z0 + nz * u), kind, h, s, H))
        grid.append(pts3)

    def colour(kind, h, s, H):
        if kind == 0:
            return FOOT
        if kind == 2:
            return mul(CRUST, 0.9 + 0.3 * max(0.0, fbm(s / 1.3, h, 7)))
        streak = 0.84 + 0.16 * fbm(s / 0.6, h / 4.0, 6)
        # the rock is laid down in strata: bands of lighter and darker stone that wander a little
        band = abs(math.sin(h * 2.4 + 0.9 * fbm(s / 5.0, h / 3.0, 8)))
        streak *= 0.86 + 0.2 * smooth((band - 0.35) / 0.4)
        c = mix(FOOT, FACE, smooth((h - 0.15) / 1.4))
        c = mix(c, CRUST, smooth((h / max(H, 1e-3) - 0.85) / 0.15) * 0.6)
        return mul(c, streak)

    ncol, nrow = len(grid), len(grid[0])
    verts = [[surface.vert(q[0], colour(q[1], q[2], q[3], q[4])) for q in col] for col in grid]
    # one winding for the whole strip: the one whose inner face looks into the room
    k = ncol // 2
    probe = [grid[k][3][0], grid[(k + 1) % ncol][3][0], grid[(k + 1) % ncol][4][0], grid[k][4][0]]
    flip = newell(probe).dot(W(-colsrc[k][2], 0, -colsrc[k][3])) < 0
    for i in range(ncol if closed else ncol - 1):
        a, c = verts[i], verts[(i + 1) % ncol]
        for r in range(nrow - 1):
            quad = [a[r], c[r], c[r + 1], a[r + 1]]
            surface.quad(quad[::-1] if flip else quad)
    if not closed:
        for k in (0, ncol - 1):
            # a boulder hides the cut end
            x0, z0, nx, nz = colsrc[k][:4]
            # in the walled rooms the ends meet a passage: a smaller stone, set back off the way
            sz, u = (rng.uniform(0.45, 0.65), 0.9) if coarse else (rng.uniform(0.9, 1.2), 0.5)
            extras.rock(rng, W(x0 + nx * u, y + 0.2, z0 + nz * u), (sz * 1.2, sz * 1.1, sz * 1.1), mul(CRUST, 1.1), flat=0.85, sink=0.25)

    # stalactites under the overhang, rubble along the foot, a crust of boulders on the low rim
    for i, (x0, z0, nx, nz, s, back, H, recess, ov) in enumerate(info):
        if back > 0.45 and rng.random() < 0.3 * back:
            u = profile_u(0.89, ov) + recess + relief(s, 0.89 * H, H, 2) + rng.uniform(0.05, 0.3)
            stalactite(extras, rng, W(x0 + nx * u, y + 0.89 * H + 0.15, z0 + nz * u), rng.uniform(0.5, 1.8) * back, rng.uniform(0.14, 0.3))
        if back > 0.35 and rng.random() < 0.1:
            u = profile_u(0.72, ov) + recess + relief(s, 0.72 * H, H, 2) - 0.05
            stalactite(extras, rng, W(x0 + nx * u, y + 0.72 * H, z0 + nz * u), rng.uniform(0.3, 0.7), rng.uniform(0.1, 0.18))
        if rng.random() < 0.3 + 0.25 * back:
            # small enough that the hero walking along the wall does not wade through it
            u = rng.uniform(-0.5, 0.05)
            sz = rng.uniform(0.14, 0.3) * (1 + 0.4 * back)
            extras.rock(rng, W(x0 + nx * u, y, z0 + nz * u), (sz * 1.25, sz, sz), mul(ROCK, rng.uniform(0.85, 1.1)), flat=0.7, sink=0.3)
        if back < 0.35 and rng.random() < (0.3 if coarse else 0.55):
            # the low front rim is a crust of piled boulders, as in the concept (smaller in the
            # walled rooms, set back from the edge, so they do not stand in front of the way)
            u = rng.uniform(0.4, 1.8) if coarse else rng.uniform(0.0, 1.6)
            sz = rng.uniform(0.35, 0.8) * (1.2 - back) * (0.6 if coarse else 1.0)
            extras.rock(rng, W(x0 + nx * u, y + H * rng.uniform(0.55, 0.95), z0 + nz * u), (sz * 1.25, sz * 1.15, sz), mul(CRUST, rng.uniform(0.95, 1.3)), flat=0.85, sink=0.3)
        elif rng.random() < 0.3:
            # and the top of the tall walls too
            u = rng.uniform(0.6, 2.4) + recess * 0.6
            sz = rng.uniform(0.7, 1.4)
            extras.rock(rng, W(x0 + nx * u, y + H + 0.1, z0 + nz * u), (sz * 1.3, sz * 1.1, sz), mul(CRUST, rng.uniform(0.95, 1.25)), flat=0.7, sink=0.4)


def stalactite(b, rng, top, length, radius):
    sides = 5
    a0 = rng.uniform(0, math.tau)
    bend = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0)) * length
    rings = []
    for k, (t, rr) in enumerate(((0.0, 1.0), (0.45, 0.6), (0.8, 0.28))):
        c = top + Vector((0, 0, -length * t)) + bend * t * t
        rings.append([c + Vector((math.cos(a0 + j * math.tau / sides) * radius * rr, math.sin(a0 + j * math.tau / sides) * radius * rr, 0)) for j in range(sides)])
    tip = top + Vector((0, 0, -length)) + bend
    for k in range(len(rings) - 1):
        for j in range(sides):
            a, c, d, e = rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j]
            tone = mix(FACE, DRIP, (k + 0.5) / len(rings))
            b.face([a, e, d, c], [tone] * 4)
    for j in range(sides):
        a, c = rings[-1][j], rings[-1][(j + 1) % sides]
        b.face([a, tip, c], [DRIP, mul(DRIP, 1.1), DRIP])


# ---------------------------------------------------------------- build, bake, export

rng = random.Random(4417)
objects = []
for f in DATA['floors']:
    f['step'] = DATA['step']
    wall_at = walled(f)
    edges = [p for ring in f['edges'] for p in ring if wall_at(p)]
    if f.get('paving'):
        kd = KDTree(len(edges))
        for i, p in enumerate(edges):
            kd.insert((p['x'], p['z'], 0), i)
        kd.balance()
        objects.append(build_floor(f, kd, rng))
    if edges:
        objects += [ob for ob in build_walls(f, DATA['gates'], rng) if ob.data.polygons]

# ambient occlusion (Cycles), multiplied into the colours: dark gaps between the stones, dark
# hollows under the overhangs, the floor darker along the foot of the walls
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.world = bpy.data.worlds.new('cave')
scene.world.light_settings.distance = 1.6
for ob in objects:
    me = ob.data
    col = me.color_attributes['Col']
    ao = me.color_attributes.new('ao', 'FLOAT_COLOR', col.domain)
    me.color_attributes.active_color = ao
    for o in objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    occ = [ao.data[i].color[0] for i in range(len(ao.data))]
    if ob.name.startswith('cavefloor_'):
        # a stone's top takes one shade: one corner by a higher neighbour would otherwise darken
        # it along a triangle's diagonal (the triangles of one top share their corners)
        tops = {}
        for poly in me.polygons:
            if poly.normal.z > 0.97:
                for v in poly.vertices:
                    tops.setdefault(v, set()).update(poly.vertices)
        seen = set()
        for v, group in tops.items():
            if v in seen:
                continue
            # the whole connected top
            stack, part = [v], set()
            while stack:
                q = stack.pop()
                if q in part:
                    continue
                part.add(q)
                stack += [w for w in tops.get(q, ()) if w not in part]
            seen |= part
            k = sum(occ[i] for i in part) / len(part)
            for i in part:
                occ[i] = k
    for i in range(len(col.data)):
        k = occ[i]
        c = col.data[i].color
        col.data[i].color = (c[0] * (0.32 + 0.68 * k), c[1] * (0.32 + 0.68 * k), c[2] * (0.33 + 0.67 * k), 1.0)
    me.color_attributes.remove(me.color_attributes['ao'])
    me.color_attributes.active_color = me.color_attributes['Col']

scene['source'] = DATA['hash']
# no normals: the game gives the paving and rocks a normal per facet and smooths the rock face
# itself (src/render/grotto/cave.js), which also lets a stone's top and rim share their corners
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_vertex_color='ACTIVE', export_normals=False, export_apply=True, export_yup=True, export_extras=True)
print('wrote', OUT, {o.name: len(o.data.polygons) for o in objects}, 'source', DATA['hash'])
