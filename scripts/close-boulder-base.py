# The warden's boulder form (assets/meshy/monsters/crag_titan/ball_meshy.glb), made ready for
# scripts/prep-monster-glb.py:
# - Meshy modelled it sitting in a pile of rubble: the loose stones round its foot are dropped (a
#   plate of the ball itself sits on the sphere and stays);
# - its stone is recoloured to the golem's (golem_meshy.glb): the two Meshy textures came out in
#   different greys, and the boulder must read as the same stones. Grey pixels take the golem's
#   stone mean, with less of the patchy shading (even colour); the lava (saturated) is left as it is;
# - one horn, as on the sheet (Meshy gave it two);
# - the stones are pulled onto a sphere so it rolls as a ball (the horns keep their shape), with a
#   plain stone core inside, so the open base and the gaps between plates read as stone when it spins.
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
# a ball that rolls: every stone point is pulled most of the way onto the sphere (the plates keep a
# little relief), the horns (pieces reaching well past it) keep their shape and ride on it
horn = set()
for p in parts:
    if p[0] in set(drop) or not p[0].is_valid: continue
    if max((v.co - c).length for f in p for v in f.verts) > R * 1.18: horn |= {v for f in p for v in f.verts}
# the sheet's boulder has one horn; Meshy gave it two: the one on its left (-X) goes
hparts = [p for p in parts if p[0].is_valid and p[0] not in set(drop) and max((v.co - c).length for f in p for v in f.verts) > R * 1.18]
if len(hparts) > 1:
    gone = min(hparts, key=lambda p: sum(v.co.x for f in p for v in f.verts) / sum(len(f.verts) for f in p))
    gv = {v for f in gone for v in f.verts}
    horn -= gv
    bmesh.ops.delete(bm, geom=gone, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in gv if v.is_valid and not v.link_faces], context='VERTS')
    print('horns', len(hparts), '-> 1')
for v in bm.verts:
    if v in horn: continue
    d = v.co - c
    if d.length > 1e-6: v.co = c + d.normalized() * (R + (d.length - R) * 0.25)
# every stone face looks outward (pulled onto the sphere, some plate edges had turned over and drew
# their dark outline on the outside); the horns keep their own winding
bm.normal_update()
flip = [f for f in bm.faces if not any(v in horn for v in f.verts) and f.normal.dot(f.calc_center_median() - c) < 0]
bmesh.ops.reverse_faces(bm, faces=flip)
print('stone faces turned outward', len(flip))
# a solid stone core just inside the shell: Meshy left the base open and gaps between some plates, and
# spinning shows them; the core is textured from one plain stone texel, so they read as stone
uvl = bm.loops.layers.uv.active
img0 = next(n.image for m in ob.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
W0, H0 = img0.size; px0 = np.array(img0.pixels[:]).reshape(H0, W0, 4)
def texel(f):
    u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops); v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
    return px0[int(np.clip(v % 1 * H0, 0, H0 - 1)), int(np.clip(u % 1 * W0, 0, W0 - 1)), :3], (u, v)
plain = min((f for f in bm.faces if f.calc_area() > 0), key=lambda f: (lambda c: float(c.max() - c.min()) + abs(float(c.mean()) - 0.42))(texel(f)[0]))
stone_uv = texel(plain)[1]
core = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=R * 0.9)
for v in core['verts']: v.co += c
for f in {f for v in core['verts'] for f in v.link_faces}:
    for l in f.loops: l[uvl].uv = stone_uv
bmesh.ops.triangulate(bm, faces=[f for f in {f for v in core['verts'] for f in v.link_faces} if len(f.verts) > 3])
bm.to_mesh(ob.data); bm.free()
print('pieces', len(parts), 'rubble dropped', sum(1 for p in parts if p[0] in set(drop)))

img = next(n.image for m in ob.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
W, H = img.size
a, sat, m, bmean, bstd = stone_stats(img)
w = np.clip(1 - (sat - 40 / 255) / (40 / 255), 0, 1)[..., None]  # grey stone 1, lava 0
# an even stone colour: the golem's mean, the patchy shading Meshy painted kept at `even` of its spread
even = 0.45
re = np.clip((a - bmean) / bstd * gstd * even + gmean, 0, 1)
px = np.array(img.pixels[:]).reshape(H, W, 4)
px[:, :, :3] = a * (1 - w) + re * w
img.pixels = px.ravel().tolist()
print('stone', (bmean * 255).round(1), '->', (gmean * 255).round(1))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92, export_animations=False, export_yup=True)
