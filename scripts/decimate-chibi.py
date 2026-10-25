# Decimate a Meshy-rigged chibi GLB in Blender, keeping its skin (the decimate goes before the armature
# modifier), for the character triangle budget; then run scripts/prep-chibi.py on the result.
#   PYTHONPATH=<bpy dir> python3 scripts/decimate-chibi.py -- <rigged.glb> <out.glb> <triangles>
import bpy, sys
src, dst, target = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
m = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = m
d = m.modifiers.new('d', 'DECIMATE'); d.ratio = target / len(m.data.polygons)
# the armature modifier must stay after the decimate for export
bpy.ops.object.modifier_move_to_index(modifier='d', index=0)
bpy.ops.object.modifier_apply(modifier='d')
print('tris', len(m.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95, export_animations=False, export_yup=True)
