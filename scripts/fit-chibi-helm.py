# Cut the headwear out of a generated dressed chibi (scripts/fit-chibi-outfit.py's models) for the
# chibi hero: everything above the set's neck cut except the face (the skin reached from the cheek,
# and the eyes and brows left as small islands), so the helm, hood or circlet comes with the hair
# the sheet draws under it. It is moved onto the Travel model's head (by the eyes), the frame
# the hero's own hair (characters.hero_chibi_hair) is fitted in, so the game places it the same way.
#   PYTHONPATH=<bpy dir> python3 scripts/fit-chibi-helm.py -- assets/meshy/outfits/<set>.json <helm id>
import bpy, bmesh, json, sys, numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

C = json.load(open(sys.argv[-2]))
HELM = sys.argv[-1]
REF = json.load(open('assets/meshy/outfits/travel.json'))


def load(src, scale=None, lift=None):
    """the generated model in the fit script's frame: feet on the ground, arm axis at 0.838"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    g = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    g.data.transform(g.matrix_world); g.matrix_world = Matrix.Identity(4)
    if scale is None:
        R = np.array([tuple(v.co) for v in g.data.vertices])
        band = R[np.abs(np.abs(R[:, 0]) - 0.85 * np.abs(R[:, 0]).max()) < 0.02]
        scale = 0.838 / ((band[:, 2].min() + band[:, 2].max()) / 2 - R[:, 2].min())
        lift = -R[:, 2].min() * scale
    g.data.transform(Matrix.Translation((0, 0, lift)) @ Matrix.Scale(scale, 4))
    return g


def head(g, neck):
    """(bmesh of the headwear, (left eye, right eye) middles) above the neck plane"""
    img = [n for n in g.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image
    w, h = img.size; px = np.array(img.pixels[:]).reshape(h, w, 4)[:, :, :3] * 255
    bm = bmesh.new(); bm.from_mesh(g.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    # a hood's drape hangs down behind the neck (`drape`: how far below the neck cut, behind `drapeY`)
    dr = C.get('drape', 0) if g is not ref else 0
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, neck - dr), plane_no=(0, 0, 1))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < neck - dr or
                               (f.calc_center_median().z < neck and f.calc_center_median().y < C.get('drapeY', 0))], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active

    def colour(f):
        u = sum(l[uvl].uv.x for l in f.loops) / 3; v = sum(l[uvl].uv.y for l in f.loops) / 3
        return px[int(np.clip((v % 1) * h, 0, h - 1)), int(np.clip((u % 1) * w, 0, w - 1))]
    cols = {f: colour(f) for f in bm.faces}

    def blue(f):  # an eye's colour anywhere on the triangle (its middle or near a corner)
        uv = [(l[uvl].uv.x, l[uvl].uv.y) for l in f.loops]
        for wts in ((1 / 3, 1 / 3, 1 / 3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6)):
            u = sum(a * b[0] for a, b in zip(wts, uv)); v = sum(a * b[1] for a, b in zip(wts, uv))
            c = px[int(np.clip((v % 1) * h, 0, h - 1)), int(np.clip((u % 1) * w, 0, w - 1))]
            if c[2] - c[0] > C.get('eyeBlue', 30) and c[2] >= c[1]: return True
        return False
    # the eyes: blue, on the front of the face; their middles place the head
    eye = [f for f in bm.faces if f.normal.y < -0.3 and abs(f.calc_center_median().x) < 0.09
           and neck + 0.03 < f.calc_center_median().z < neck + 0.2 and blue(f)]
    # the eyes are the frontmost blue (a hood's lining or a collar sits further back)
    front = min((f.calc_center_median().y for f in eye), default=0)
    eye = [f for f in eye if f.calc_center_median().y < front + 0.03]
    ec = {sd: np.mean([tuple(f.calc_center_median()) for f in eye if (f.calc_center_median().x > 0) == sd], axis=0) for sd in (True, False)}
    # eyes too pale to find by colour (grey) are given (`eyes`: left and right middles, x > 0 first)
    if C.get('eyes') and g is not ref: ec = {True: np.array(C['eyes'][0], float), False: np.array(C['eyes'][1], float)}
    if any(np.isnan(v).any() for v in ec.values()): raise SystemExit('no eyes')
    # the face: the skin colour at the cheek under an eye, flooded across faces of that colour
    tree = BVHTree.FromBMesh(bm)
    hit = None
    for dz in (0.035, 0.045, 0.025, 0.055):
        for e in ec.values():
            loc, n, i, d = tree.ray_cast(Vector((e[0], -1, e[2] - dz)), Vector((0, 1, 0)))
            if i is not None:
                c = cols[bm.faces[i]]
                if c[0] > 180 and 20 < c[0] - c[2] < 110: hit = bm.faces[i]; break
        if hit: break
    if hit is None: raise SystemExit('no skin at the cheek: eyes %s' % [np.round(e, 3).tolist() for e in ec.values()])
    skin = cols[hit]
    near = lambda c: np.abs(c - skin).max() < C.get('skinTol', 26)
    face, todo = {hit}, [hit]
    while todo:
        t = todo.pop()
        for e in t.edges:
            for o in e.link_faces:
                if o not in face and near(cols[o]): face.add(o); todo.append(o)
    eyes = (ec[True], ec[False])
    # and whatever lies on the front of the face between the chin and the brows (shaded skin the
    # flood stopped at, the eyes, fringe tips over them): the chibi's own face is drawn there
    mid = (ec[True] + ec[False]) / 2; half = abs(ec[True][0] - ec[False][0]) / 2 + 0.045
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.x - mid[0]) < half and mid[2] - 0.08 < c.z < mid[2] + 0.03 and c.y < mid[1] + 0.03: face.add(f)
    # and the bare neck below the face (the chibi's own neck is there), and the tops of shoulder
    # pieces out to the sides (the armour has them; the helm turns with the head)
    face.update(f for f in bm.faces if f.calc_center_median().z < mid[2] - 0.07 and np.abs(cols[f] - skin).max() < 40)
    face.update(f for f in bm.faces if f.calc_center_median().z < mid[2] - 0.09 and abs(f.calc_center_median().x) > 0.11
                and not (dr and f.calc_center_median().y > C.get('drapeY', 0)))
    if dr and C.get('drapeFur'):
        # of what hangs below the neck the coat's green (and its dark lining) goes: the armour draws them
        face.update(f for f in bm.faces if f.calc_center_median().z < neck and
                    (cols[f][1] > cols[f][0] + 15 and cols[f][1] > cols[f][2] + 15 or cols[f].max() < 60))
    if 'chinCut' in C:
        # and the collar or scarf under the chin, in front of the neck (`chinCut` below the eyes, in
        # front of `chinBack` behind them): the armour has its own, and this one, turning with the
        # head, would tear off it; a hood's drape behind the neck stays
        face.update(f for f in bm.faces if f.calc_center_median().z < mid[2] - C['chinCut']
                    and f.calc_center_median().y < mid[1] + C.get('chinBack', 0.2)
                    and not (dr and f.calc_center_median().y > C.get('drapeY', 0)))
    if C.get('helmNoHair', True):
        # and the generated model's own hair (the game draws the hero's hair under the helm): its
        # colour is read off the fringe on the forehead (the frontmost faces just above the eyes);
        # faces of about that colour go when the helm covers them (a ray out from the head's middle
        # through them meets it again) or when they hang in the face's opening; a brim or trim of
        # that colour on the outside stays
        fr = [f for f in bm.faces if f not in face and abs(f.calc_center_median().x - mid[0]) < 0.04
              and mid[2] + 0.025 < f.calc_center_median().z < mid[2] + 0.07]
        fr = sorted(fr, key=lambda f: f.calc_center_median().y)[:6]
        hc = np.median([cols[f] for f in fr], 0) if fr else None
        if hc is not None and hc.max() - hc.min() < 40 and hc.min() > 120:
            tol = C.get('hairTol', 45)
            tree = BVHTree.FromBMesh(bm)
            ctr = Vector((mid[0], mid[1] + 0.1, mid[2] + 0.02))  # the head's middle, behind the eyes
            hair = set()
            for f in bm.faces:
                if f in face or np.abs(cols[f] - hc).max() >= tol: continue
                c = f.calc_center_median(); d = (c - ctr).normalized()
                opening = abs(c.x - mid[0]) < half + 0.02 and c.z < mid[2] + 0.1 and c.y < mid[1] + 0.06
                loc, n, i, dist = tree.ray_cast(c + d * 0.004, d, 0.3)
                if opening or (i is not None and bm.faces[i] is not f): hair.add(f)
            print('hair colour', np.round(hc), 'faces', len(hair))
            face.update(hair)
    bmesh.ops.delete(bm, geom=list(face), context='FACES')
    # what is left on the face (eyes, brows, mouth) is small islands: keep the large pieces, and
    # any piece well above the eyes (`keepAbove` over them: a leaf on a hood's crown is small pieces)
    top = (ec[True][2] + ec[False][2]) / 2 + C.get('keepAbove', 1)
    seen, keep = set(), set()
    for f in bm.faces:
        if f in seen: continue
        comp, todo = [f], [f]; seen.add(f)
        while todo:
            t = todo.pop()
            for e in t.edges:
                for o in e.link_faces:
                    if o not in seen: seen.add(o); comp.append(o); todo.append(o)
        if len(comp) >= C.get('minPiece', 40) or min(g.calc_center_median().z for g in comp) > top: keep.update(comp)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    if C.get('fillHoles') and g is not ref:
        # small holes the cuts above left in the helm above the cheeks (`fillHoles`: at most this many
        # edges round; the face's opening and the neck are far larger): the hero's dark hair showed
        # through them. Each patch takes the texture of the faces round it (its corners' own UVs).
        bound = [e for e in bm.edges if e.is_boundary]
        par = {}
        def find(a):
            while par.setdefault(a, a) != a: a = par[a]
            return a
        for e in bound: par[find(e.verts[0])] = find(e.verts[1])
        loops = {}
        for e in bound: loops.setdefault(find(e.verts[0]), []).append(e)
        for es in loops.values():
            vs = {v for e in es for v in e.verts}
            if len(es) > C['fillHoles'] or np.mean([v.co.z for v in vs]) < mid[2] - 0.08: continue
            uv0 = {v: next(l[uvl].uv.copy() for l in v.link_loops) for v in vs}
            # the loop's corners in order round it, fanned from the first (holes_fill leaves some
            # small loops open)
            ring, prev = [es[0].verts[0]], None
            while len(ring) < len(es):
                nxt = [e.other_vert(ring[-1]) for e in es if ring[-1] in e.verts and e.other_vert(ring[-1]) is not prev and e.other_vert(ring[-1]) not in ring]
                if not nxt: break
                prev = ring[-1]; ring.append(nxt[0])
            if len(ring) != len(es): continue
            tris = []
            for k in range(1, len(ring) - 1):
                try: tris.append(bm.faces.new((ring[0], ring[k], ring[k + 1])))
                except ValueError: pass
            for f in tris: f.normal_update()
            for f in tris:
                for l in f.loops: l[uvl].uv = uv0[l.vert]
            # wound as the faces round them (holes_fill picks either way; a patch facing in is
            # drawn as the helm's inside, a dark wedge)
            for f in tris:
                nb = [o for e in f.edges for o in e.link_faces if o not in tris]
                if nb and sum(o.normal.dot(f.normal) for o in nb) < 0: f.normal_flip()
            print('filled a hole of', len(es), 'edges at', np.round(np.mean([tuple(v.co) for v in vs], 0), 3), 'new faces', len(tris))
        bm.normal_update()
    return bm, eyes, img



def surface(src):
    """a model's triangles as a ray-cast tree that outlives the scene (load() clears it)"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    vs, fs = [], []
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        n = len(vs); vs += [tuple(o.matrix_world @ v.co) for v in o.data.vertices]
        fs += [tuple(n + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(vs, fs), np.array(vs)


# the hero's own hair in this frame (the head the helm goes on: the game pulls the hair in under it)
hair, HV = surface('public/models/hero_chibi_hair.glb') if 'fitHead' in C else (None, None)
ref = load(REF['src'], REF['scale'], REF['lift'])
_, reyes, _ = head(ref, REF['neck'])
g = load(C['src'], C.get('scale'), C.get('lift'))
bm, eyes, img = head(g, C['neck'])
if C.get('drapeStretch'):
    # the drape reaches down onto this body's shoulders, which sit lower under the head than the
    # generated model's (`drapeStretch` × its length below the neck cut)
    for v in bm.verts:
        if v.co.z < C['neck']: v.co.z = C['neck'] - (C['neck'] - v.co.z) * C['drapeStretch']
# onto the Travel model's head: the same distance between the eyes, the same middle between them
k = float(np.clip(np.linalg.norm(reyes[0] - reyes[1]) / np.linalg.norm(eyes[0] - eyes[1]), 0.75, 1.1))
off = Vector((reyes[0] + reyes[1]) / 2 - k * (eyes[0] + eyes[1]) / 2)
bmesh.ops.transform(bm, matrix=Matrix.Translation(off) @ Matrix.Scale(k, 4), verts=bm.verts[:])
print(HELM, 'tris', len(bm.faces), 'scale %.3f' % k, 'move', np.round(off, 3), 'eyes', np.round(eyes[0], 3), np.round(eyes[1], 3))
if hair:
    # the eyes alone size a helm badly when the sheet's head is bigger or its eyes set closer than the
    # Travel model's: the helm is then scaled about the hair's middle so its inside lies on the hero's
    # hair (`fitHead`: its inside over the hair's outside, in the median over the crown, the sides
    # and the back; the face's opening is left out), as the sheet's helm sits on its head
    lo, hi = HV.min(0), HV.max(0)
    c = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] + 0.45 * (hi[2] - lo[2])))
    tree = BVHTree.FromBMesh(bm); r = []
    for el in range(0, 91, 10):
        for az in range(0, 360, 15):
            e, a = np.radians(el), np.radians(az)
            d = Vector((np.sin(a) * np.cos(e), -np.cos(a) * np.cos(e), np.sin(e)))
            if d.y < -0.45 and el < 45: continue  # the face's opening
            out = hair.ray_cast(c + d, -d)[0]; inn = tree.ray_cast(c, d)[0]
            if out is not None and inn is not None: r.append((inn - c).length / (out - c).length)
    s = float(np.clip(C['fitHead'] / np.median(r), 0.5, 1.5))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Scale(s, 4) @ Matrix.Translation(-c), verts=bm.verts[:])
    print('fit to the hair: inside/hair %.2f, scaled %.3f' % (np.median(r), s))
bm.to_mesh(g.data); bm.free()
for p in g.data.polygons: p.use_smooth = True
img.scale(C.get('tex', 2048), C.get('tex', 2048))
bpy.ops.object.select_all(action='DESELECT'); g.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'public/models/outfits/{HELM}.glb', use_selection=True, export_format='GLB',
                          export_image_format='JPEG', export_jpeg_quality=88, export_yup=True)
