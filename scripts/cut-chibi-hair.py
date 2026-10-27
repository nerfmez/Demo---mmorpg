# Cut the hair out of a textured Meshy head along the painted hairline. Per texel the texture is
# skin (peach: r-b >= skinRB) or hair; dark texels (lines, marks, the hair tie) take the class of
# the texels around them. Triangles across the line are subdivided until they are a few texels
# wide, then split exactly on the 0.5 iso-line of the blurred skin field; the skin side goes.
import bpy, bmesh, sys, json, numpy as np
from mathutils import Vector
src, out, C = sys.argv[-3], sys.argv[-2], json.loads(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
g = [o for o in bpy.data.objects if o.type == 'MESH'][0]
g.data.transform(g.matrix_world); g.matrix_world.identity()
img = [n for n in g.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3] * 255  # row 0 = v 0
r, b = px[..., 0], px[..., 2]; mx = px.max(-1)
skin = ((r - b) >= C.get('skinRB', 33)) & (mx > 120)
known = (mx >= C.get('dark', 110)) & (px.min(-1) < C.get('white', 256))  # lines and white rims take their neighbours' class
val = skin.astype(np.float32) * known; kn = known.astype(np.float32)

def box(a, k=1):
    s = a.copy()
    for ax in (0, 1):
        t = s.copy()
        for d in range(1, k + 1): t += np.roll(s, d, ax) + np.roll(s, -d, ax)
        s = t
    return s

# fill dark texels from their neighbours
for _ in range(C.get('fillIters', 40)):
    if kn.min() > 0: break
    bv, bk = box(val), box(kn)
    hole = (kn == 0) & (bk > 0)
    val[hole] = bv[hole] / bk[hole]; kn[hole] = 1
F = box(val, C.get('blur', 1)) / (2 * C.get('blur', 1) + 1) ** 2  # skin field 0..1

def sample(uv):
    x = (uv.x % 1) * W - 0.5; y = (uv.y % 1) * H - 0.5
    x0 = int(np.floor(x)); y0 = int(np.floor(y)); fx = x - x0; fy = y - y0
    x0 %= W; y0 %= H; x1 = (x0 + 1) % W; y1 = (y0 + 1) % H
    return (F[y0, x0] * (1 - fx) * (1 - fy) + F[y0, x1] * fx * (1 - fy) + F[y1, x0] * (1 - fx) * fy + F[y1, x1] * fx * fy) - C.get('iso', 0.5)

bm = bmesh.new(); bm.from_mesh(g.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)  # glTF splits seam vertices
bmesh.ops.triangulate(bm, faces=bm.faces[:])
uvl = bm.loops.layers.uv.active

def mixed(f):
    us = [l[uvl].uv.copy() for l in f.loops]
    pts = us + [(us[0] + us[1]) / 2, (us[1] + us[2]) / 2, (us[2] + us[0]) / 2, (us[0] + us[1] + us[2]) / 3]
    pts += [(2 * us[i] + us[(i + 1) % 3] + us[(i + 2) % 3]) / 4 for i in range(3)]
    s = [sample(p) for p in pts]
    return min(s) < 0 < max(s)

minPx = C.get('minPx', 3)
for lvl in range(C.get('levels', 5)):
    edges = set()
    for f in bm.faces:
        if not mixed(f): continue
        for e in f.edges:
            ls = [l for l in e.link_loops if l.face == f][0]
            if (ls[uvl].uv - ls.link_loop_next[uvl].uv).length * max(W, H) > minPx: edges.add(e)
    if not edges: break
    bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=False)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    print('level', lvl, 'split', len(edges), 'tris', len(bm.faces))

# vertex values: the mean over its corners (a seam vertex has several UVs)
def vval(v):
    s = [sample(l[uvl].uv) for l in v.link_loops]
    return sum(s) / len(s) if s else 0
sv = {v: vval(v) for v in bm.verts}
eps = 1e-4
for v in sv:
    if abs(sv[v]) < eps: sv[v] = eps
cut, pct = [], {}
for e in bm.edges:
    a, c = sv[e.verts[0]], sv[e.verts[1]]
    if (a < 0) != (c < 0):
        t = a / (a - c)
        if 0.02 < t < 0.98: cut.append(e); pct[e] = t
        else: sv[e.verts[0] if t <= 0.02 else e.verts[1]] = 0
new = bmesh.ops.subdivide_edges(bm, edges=cut, cuts=1, edge_percents=pct, use_grid_fill=False)
for v in new['geom_inner']:
    if isinstance(v, bmesh.types.BMVert): sv[v] = 0
bmesh.ops.triangulate(bm, faces=bm.faces[:])
# a face is skin when its vertices lean to skin (the cut vertices are 0); fall back to its centre
drop = []
for f in bm.faces:
    s = [sv.get(v, 0) for v in f.verts]
    m = sum(s)
    if abs(m) < 1e-6: m = sample(sum((l[uvl].uv for l in f.loops), Vector((0, 0))) / 3)
    if (m > 0) != bool(C.get('invert')): drop.append(f)
# holes: a small patch of skin colour inside the hair (a highlight Meshy painted peach) stays hair,
# repainted below; the face, neck and ears are large patches
holeUV = []
if C.get('holeArea') and not C.get('invert'):
    def comps_of(faces):
        fset, seen, out = set(faces), set(), []
        for f in faces:
            if f in seen: continue
            comp, todo = [f], [f]; seen.add(f)
            while todo:
                t = todo.pop()
                for e in t.edges:
                    for o in e.link_faces:
                        if o in fset and o not in seen: seen.add(o); comp.append(o); todo.append(o)
            out.append(comp)
        return out
    dset = set(drop)
    # the main hair: pieces of hair colour of real size (painted eyes and the like are small)
    main = set(f for c in comps_of([f for f in bm.faces if f not in dset]) if sum(x.calc_area() for x in c) >= C.get('mainArea', 0.05) for f in c)
    restore = set()
    for comp in comps_of(drop):
        if sum(x.calc_area() for x in comp) >= C['holeArea']: continue
        cs = set(comp)
        rim = {o for f in comp for e in f.edges for o in e.link_faces if o not in cs}
        if rim and rim <= main: restore |= cs  # a hole: hair all round it
    holeUV = [[(l[uvl].uv.x % 1, l[uvl].uv.y % 1) for l in f.loops] for f in restore]
    drop = [f for f in drop if f not in restore]
    print('holes kept', len(restore))
    if C.get('holesOnly'):  # debug: the kept holes alone
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in restore], context='FACES'); bm.to_mesh(g.data); bm.free()
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_materials='NONE'); sys.exit()
# boxes whose faces go whatever their colour ([x0, x1, y0, y1, z0, z1]: painted eyes, a collar)
for b in C.get('dropBoxes', []):
    drop += [f for f in bm.faces if f not in set(drop) and (lambda c: b[0] < c.x < b[1] and b[2] < c.y < b[3] and b[4] < c.z < b[5])(f.calc_center_median())]
bmesh.ops.delete(bm, geom=list(set(drop)), context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
if C.get('invert'):  # the cut-away skin, for the check render
    bm.to_mesh(g.data); bm.free()
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_materials='NONE'); sys.exit()
# small loose pieces (skin specks' rims, stray hair crumbs on the neck) go
bm.faces.ensure_lookup_table()
seen, comps = set(), []
for f in bm.faces:
    if f in seen: continue
    comp, todo = [f], [f]; seen.add(f)
    while todo:
        t = todo.pop()
        for e in t.edges:
            for o in e.link_faces:
                if o not in seen: seen.add(o); comp.append(o); todo.append(o)
    comps.append(comp)
area = lambda c: sum(f.calc_area() for f in c)
def bright(c):  # mean texture brightness over a piece (marks on the neck are dark)
    us = [sum((l[uvl].uv for l in f.loops), Vector((0, 0))) / 3 for f in c[::max(1, len(c) // 200)]]
    return float(np.mean([F2[int((u.y % 1) * H) % H, int((u.x % 1) * W) % W] for u in us]))
F2 = mx
for c in sorted(comps, key=area, reverse=True)[:30]:
    zc = np.mean([f.calc_center_median().z for f in c])
    print('piece area %.4f z %.2f bright %.0f n %d' % (area(c), zc, bright(c), len(c)))
small = [f for c in comps if area(c) < C.get('minArea', 0.002) or (area(c) < C.get('darkArea', 0.05) and bright(c) < C.get('darkPiece', 150)) for f in c]
# whole pieces inside a `dropPieces` box ([x0, x1, y0, y1, z0, z1]: a painted mouth, a collar)
for c in comps:
    P = np.array([tuple(v.co) for f in c for v in f.verts]); lo, hi = P.min(0), P.max(0)
    if any(b[0] <= lo[0] and hi[0] <= b[1] and b[2] <= lo[1] and hi[1] <= b[3] and b[4] <= lo[2] and hi[2] <= b[5] for b in C.get('dropPieces', [])): small += c
print('pieces', len(comps), 'small', sum(1 for c in comps if area(c) < C.get('minArea', 0.002)))
bmesh.ops.delete(bm, geom=list(set(small)), context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
for zb in C.get('dropBelow', []):  # [z, x0, x1, y0, y1]: a box under z whose faces go
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (lambda c: c.z < zb[0] and zb[1] < c.x < zb[2] and zb[3] < c.y < zb[4])(f.calc_center_median())], context='FACES')
print('tris', len(bm.faces))
bm.to_mesh(g.data); bm.free()
# decimate: the cut's fine hairline triangles brought back to the character budget (`tris`)
if C.get('tris'):
    n = len(g.data.polygons)
    if n > C['tris']:
        mod = g.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = C['tris'] / n; mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = g; bpy.ops.object.modifier_apply(modifier='dec')
    print('decimated', n, '->', len(g.data.polygons))
# repaint: near-black texels (Meshy's stray shadow blots, sharp black in the toon shade) take the
# hair colour around them, except under the faces above `keepDarkAbove` (the hair tie)
if 'repaint' in C:
    from PIL import Image as PI, ImageDraw
    keep = PI.new('L', (W, H), 0); dr = ImageDraw.Draw(keep)
    bm2 = bmesh.new(); bm2.from_mesh(g.data); uv2 = bm2.loops.layers.uv.active
    dk = mx < C['repaint']
    def tex(f):
        u = sum((l[uv2].uv for l in f.loops), f.loops[0][uv2].uv * 0) / len(f.loops)
        return mx[int((u.y % 1) * H) % H, int((u.x % 1) * W) % W]
    for f in bm2.faces:  # the tie's own (dark) faces seed it, and it spreads over the dark texels joined to them
        if f.calc_center_median().z > C.get('keepDarkAbove', 9) and tex(f) < C['repaint']:
            dr.polygon([((l[uv2].uv.x % 1) * W, (l[uv2].uv.y % 1) * H) for l in f.loops], fill=255)
    keep = (np.array(keep) > 0) & dk
    for _ in range(40):
        grown = keep | np.roll(keep, 1, 0) | np.roll(keep, -1, 0) | np.roll(keep, 1, 1) | np.roll(keep, -1, 1)
        grown &= dk
        if (grown == keep).all(): break
        keep = grown
    bad = (mx < C['repaint']) & ~keep
    if holeUV:  # the kept holes' skin-coloured texels take the hair round them
        hm = PI.new('L', (W, H), 0); hd = ImageDraw.Draw(hm)
        for poly in holeUV: hd.polygon([(u * W, v * H) for u, v in poly], fill=255)
        bad |= (np.array(hm.filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(5))) > 0) & skin
    for _ in range(C.get('rimPx', 4)):  # the blot's grey rim goes with it
        bad = bad | ((np.roll(bad, 1, 0) | np.roll(bad, -1, 0) | np.roll(bad, 1, 1) | np.roll(bad, -1, 1)) & (mx < C.get('rim', 150)) & ~keep)
    col = px * (~bad)[..., None]; kn2 = (~bad).astype(np.float32)
    for _ in range(60):
        if kn2.min() > 0: break
        bk = box(kn2); hole = (kn2 == 0) & (bk > 0)
        for ch in range(3): col[..., ch][hole] = box(col[..., ch])[hole] / bk[hole]
        kn2[hole] = 1
    print('repainted', int(bad.sum()))
    out_px = np.ones((H, W, 4), np.float32); out_px[..., :3] = col / 255
    im2 = bpy.data.images.new('hairtex', W, H); im2.pixels = out_px.ravel()
    im2.file_format = 'JPEG'
    [n for n in g.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image = im2
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_image_format='JPEG', export_jpeg_quality=92)
