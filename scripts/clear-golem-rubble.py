# The warden golem (assets/meshy/monsters/crag_titan/golem_meshy.glb) came with the sheet's rubble round
# its feet: flat loose stones on the ground and a few behind it. Skinned to the legs they followed the
# boss about, so they go: pieces on the ground whose top stays under `flat` of the height, and ground
# pieces further behind than `behind` (glTF -Z). The toes and feet stand taller and in front, and stay.
#   PYTHONPATH=<bpy dir> python3 scripts/clear-golem-rubble.py -- <golem_meshy.glb> <out.glb>
import bpy, bmesh, sys
from mathutils import Vector
src, dst = sys.argv[-2], sys.argv[-1]
flat, behind = 0.08, 0.4
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
zs = [v.co.z for v in bm.verts]; z0 = min(zs); H = max(zs) - z0
drop = []
for p in parts:
    pv = [v.co for f in p for v in f.verts]; pc = sum(pv, Vector()) / len(pv)
    top = (max(v.z for v in pv) - z0) / H
    if top < flat or ((pc.z - z0) / H < 0.12 and pc.y > behind): drop += p  # Blender +Y is glTF -Z (behind)
print('pieces', len(parts), 'rubble dropped', sum(1 for p in parts if p[0] in set(drop)))
bmesh.ops.delete(bm, geom=drop, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(ob.data); bm.free()
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92, export_animations=False, export_yup=True)
