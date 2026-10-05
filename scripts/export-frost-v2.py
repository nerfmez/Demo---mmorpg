"""Extract only approved FrostNova V2 effect meshes; no stage, actor or video.
Run: blender -b --disable-autoexec --python scripts/export-frost-v2.py -- SOURCE.blend
"""
import bpy,sys,json,hashlib
import numpy as np
from pathlib import Path
source=Path(sys.argv[sys.argv.index('--')+1]);root=Path(__file__).resolve().parents[1];out=root/'assets/vfx/frost-v2'
bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene
names=('Gathering frost fleck','Outward ice spear','Directional frost wake','Ice front fracture')
objects=sorted([o for o in s.objects if o.type=='MESH' and o.name.startswith(names)],key=lambda o:o.name)
assert len(objects)==61,len(objects)
# Duplicate triangle corners to retain each source face's hard colour.
corners=[]
for o in objects:
 o.data.calc_loop_triangles()
 for t in o.data.loop_triangles:
  for v in t.vertices:corners.append((o,v,t.material_index))
w=len(corners);positions=np.zeros((27,w,4),dtype=np.float16);colors=np.zeros_like(positions)
for row,f in enumerate(range(12,39)):
 s.frame_set(f)
 for j,(o,vi,mi) in enumerate(corners):
  p=o.matrix_world@o.data.vertices[vi].co
  positions[row,j]=[p.x,p.z,-p.y,1]
  m=o.data.materials[mi];bsdf=m.node_tree.nodes.get('Principled BSDF');base=bsdf.inputs['Base Color'].default_value[:3];em=bsdf.inputs['Emission Strength'].default_value
  colors[row,j]=[*(c*(.8+em*.35) for c in base),0 if o.hide_render else 1]
out.mkdir(parents=True,exist_ok=True);positions.tofile(out/'positions.bin');colors.tofile(out/'colors.bin')
meta={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_file':source.name,'objects':[o.name for o in objects],'vertices':w,'frames':27,'fps':30,'startFrame':12,'hitFrame':19,'radius':4.2}
(out/'clip.json').write_text(json.dumps(meta,indent=2)+'\n');print('EXPORTED',w,'vertices',27,'frames',positions.nbytes+colors.nbytes,'bytes')
