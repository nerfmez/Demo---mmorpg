"""Reduce the owner's Meshy conch for the game (Blender's Python module, bpy).

  python reduce-conch.py <Meshy_AI_Mossy_Conch_Shell_*.glb> ../../public/models/accepted-scenes/singing-conch.glb 0.4

The source (15,786 triangles, four 2048 maps, 10 MB) welds its split
vertices, is collapse-decimated to 40% (6,313 triangles: 3,945 at 25% showed
facets in close view) and keeps only its base colour, scaled to 1024 JPEG.
The metal/roughness, normal and emission maps are not used by the toon shader.
"""
import bpy,sys
src,out,ratio=sys.argv[-3],sys.argv[-2],float(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=1e-5);bpy.ops.object.mode_set(mode='OBJECT')
m=obj.modifiers.new('reduce','DECIMATE');m.decimate_type='COLLAPSE';m.ratio=ratio;m.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier='reduce')
mat=obj.active_material;nt=mat.node_tree;bsdf=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
for name in ['Metallic','Roughness','Normal','Emission Color','Emission Strength']:
  inp=bsdf.inputs.get(name)
  if inp:
    for link in list(inp.links):nt.links.remove(link)
bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=1
if bsdf.inputs.get('Emission Strength'):bsdf.inputs['Emission Strength'].default_value=0
for n in list(nt.nodes):
  if n.type=='TEX_IMAGE' and not n.outputs['Color'].is_linked and not n.outputs['Alpha'].is_linked:nt.nodes.remove(n)
  elif n.type=='NORMAL_MAP':nt.nodes.remove(n)
for n in nt.nodes:
  if n.type=='TEX_IMAGE' and n.image and n.image.size[0]>1024:n.image.scale(1024,1024)
print('triangles',sum(len(p.vertices)-2 for p in obj.data.polygons))
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_yup=True,export_image_format='JPEG',export_jpeg_quality=85,export_normals=True,export_texcoords=True,export_materials='EXPORT',use_selection=True)
