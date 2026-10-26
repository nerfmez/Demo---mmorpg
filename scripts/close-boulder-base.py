# The warden's boulder form (assets/meshy/monsters/crag_titan/ball_meshy.glb), made ready for
# scripts/prep-monster-glb.py:
# - Meshy modelled it sitting in a pile of rubble: the loose stones round its foot are dropped (a
#   plate of the ball itself sits on the sphere and stays);
# - its stone is recoloured to the golem's (golem_meshy.glb): the two Meshy textures came out in
#   different greys, and the boulder must read as the same stones. Grey pixels take the golem's
#   stone mean and spread per channel; the lava (saturated) is left as it is.
#   PYTHONPATH=<bpy dir> python3 scripts/close-boulder-base.py -- <ball_meshy.glb> <golem_meshy.glb> <out.glb>
import bpy, bmesh, sys
import numpy as np
from mathutils import Vector
src, golem, dst = sys.argv[-3], sys.argv[-2], sys.argv[-1]


def stone_stats(img):
    W, H = img.size
    a = np.array(img.pixels[:]).reshape(H, W, 4)[:, :, :3]
    sat = a.max(-1) - a.min(-1)
    m = (sat < 40 / 255) & (a.mean(-1) > 25 / 255)
    return a, sat, m, a[m].mean(0), a[m].std(0)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=golem)
gimg = next(n.image for o in bpy.data.objects if o.type == 'MESH' for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
*_, gmean, gstd = stone_stats(gimg)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
seen = set(); parts = []
for f in bm.faces:
    if f in seen: continue
    comp = [f]; todo = [f]; seen.add(f)
    while todo:
        t = todo.pop()
        for e in t.edges:
            for o in e.link_faces:
                if o not in seen: seen.add(o); comp.append(o); todo.append(o)
    parts.append(comp)
parts.sort(key=len, reverse=True)
vs = {v for f in parts[0] for v in f.verts}
xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
c = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2)); R = (max(xs) - min(xs) + max(ys) - min(ys)) / 4
drop = []
for p in parts:
    pv = [v.co for f in p for v in f.verts]
    pc = sum(pv, Vector()) / len(pv)
    # rubble lies outside the sphere round its lower half (no point within it); a horn is up top
    if (pc.z - c.z) / R < -0.4 and min((v - c).length for v in pv) / R > 0.97: drop += p
bmesh.ops.delete(bm, geom=drop, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(ob.data); bm.free()
print('pieces', len(parts), 'rubble dropped', sum(1 for p in parts if p[0] in set(drop)))

img = next(n.image for m in ob.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
W, H = img.size
a, sat, m, bmean, bstd = stone_stats(img)
w = np.clip(1 - (sat - 40 / 255) / (40 / 255), 0, 1)[..., None]  # grey stone 1, lava 0
re = np.clip((a - bmean) / bstd * gstd + gmean, 0, 1)
px = np.array(img.pixels[:]).reshape(H, W, 4)
px[:, :, :3] = a * (1 - w) + re * w
img.pixels = px.ravel().tolist()
print('stone', (bmean * 255).round(1), '->', (gmean * 255).round(1))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92, export_animations=False, export_yup=True)
