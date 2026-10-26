# Cut the hair out of the dressed Meshy chibi (textured) for characters.hero_chibi_hair: grey or
# dark-line triangles above the chin, the largest connected pieces only (eye whites and lines are
# small islands on the face). Prints the fixed fit box for data/models.json.
#   PYTHONPATH=<bpy dir> python3 scripts/fit-chibi-hair.py -- assets/meshy/outfits/travel_hair.json
import bpy, bmesh, sys, json, numpy as np
from mathutils import Matrix
C = json.load(open(sys.argv[-1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=C['src'])
gen = [o for o in bpy.data.objects if o.type == 'MESH'][0]
gen.data.transform(Matrix.Translation((0, 0, C['lift'])) @ Matrix.Scale(C['scale'], 4) @ gen.matrix_world)
gen.matrix_world = Matrix.Identity(4)
img = [n for n in gen.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image
w, h = img.size; px = np.array(img.pixels[:]).reshape(h, w, 4)[:, :, :3]
bm = bmesh.new(); bm.from_mesh(gen.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
uvl = bm.loops.layers.uv.active
def colour(f):
    u = sum(l[uvl].uv.x for l in f.loops) / 3; v = sum(l[uvl].uv.y for l in f.loops) / 3
    return px[int(np.clip((v % 1) * h, 0, h - 1)), int(np.clip((u % 1) * w, 0, w - 1))] * 255
hair = set()
for f in bm.faces:
    if f.calc_center_median().z < C['chin']: continue
    r, g, b = colour(f); mx, mn = max(r, g, b), min(r, g, b)
    if (mx - mn) < C.get('grey', 28) or mx < 110: hair.add(f)
# connected pieces through shared edges
seen, comps = set(), []
for f in hair:
    if f in seen: continue
    comp, todo = [], [f]; seen.add(f)
    while todo:
        t = todo.pop(); comp.append(t)
        for e in t.edges:
            for o in e.link_faces:
                if o in hair and o not in seen: seen.add(o); todo.append(o)
    comps.append(comp)
comps.sort(key=len, reverse=True)
print('pieces', [len(c) for c in comps[:12]])
keep = set(f for c in comps if len(c) >= C.get('minPiece', 40) for f in c)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
print('hair tris', len(bm.faces))
bm.to_mesh(gen.data); bm.free()
img.scale(C.get('tex', 1024), C.get('tex', 1024))
bpy.ops.object.select_all(action='DESELECT'); gen.select_set(True)
for p in gen.data.polygons: p.use_smooth = True
bpy.ops.export_scene.gltf(filepath=C['out'], use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True)
co = np.array([gen.matrix_world @ v.co for v in gen.data.vertices])
print('box (three, y-up)', [[co[:, 0].min(), co[:, 2].min(), -co[:, 1].max()], [co[:, 0].max(), co[:, 2].max(), -co[:, 1].min()]])
