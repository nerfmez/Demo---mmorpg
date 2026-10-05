"""Bake named effect geometry only from approved Blender sources.
No preview actors, floor, camera, or lights enter the game. Run in Blender with
-- SOURCE_ROOT. Fixed profiles below retain source identity and named selection.
"""
import bpy,sys,json,hashlib,math
import numpy as np
from pathlib import Path
root=Path(__file__).resolve().parents[1];src=Path(sys.argv[sys.argv.index('--')+1])
profiles=[
 ('stone-burst','blender-skill-batch03-no-cracks/stone_burst/stone_burst.blend',37,69,2.3,('Stone Burst pillar','Low drifting earth dust','Ejected earth chip','Ground contact blade')),
 ('leap','blender-skill-batch03-no-cracks/leap/leap.blend',25,49,2.2,('Low impact plate','Ejected earth chip','Ground contact blade')),
 ('lightning','blender-lightning/Azure-Verdict-Blender.blend',24,44,1,('Primary discharge pose','Tapered branch','Fine fork','Impact lance','Ground shock arc','Ballistic spark','Clinging residual arc')),
]
only=sys.argv[sys.argv.index('--')+2:];profiles=[p for p in profiles if not only or p[0] in only]
for name,path,start,end,radius,prefixes in profiles:
 source=src/path;bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;deps=bpy.context.evaluated_depsgraph_get()
 objects=sorted([o for o in s.objects if o.type in ('MESH','CURVE') and o.name.startswith(prefixes)],key=lambda o:o.name)
 s.frame_set(start);layout=[];count=0
 for o in objects:
  eo=o.evaluated_get(deps);me=eo.to_mesh();me.calc_loop_triangles();corners=[(v,t.material_index) for t in me.loop_triangles for v in t.vertices];layout.append((o,corners,count));count+=len(corners);eo.to_mesh_clear()
 width=min(2048,count);rows=math.ceil(count/width);frames=end-start+1
 positions=np.zeros((frames*rows,width,4),dtype=np.float16);colors=np.zeros_like(positions)
 for fi,f in enumerate(range(start,end+1)):
  s.frame_set(f);deps.update()
  for o,corners,offset in layout:
   eo=o.evaluated_get(deps);me=eo.to_mesh()
   for j,(vi,mi) in enumerate(corners):
    p=eo.matrix_world@me.vertices[vi].co;index=offset+j;row=fi*rows+index//width;col=index%width
    positions[row,col]=[p.x,p.z,-p.y,1]
    m=me.materials[mi];node=m.node_tree.nodes.get('Principled BSDF');em=m.node_tree.nodes.get('Emission')
    if node:base=node.inputs['Base Color'].default_value[:3];strength=node.inputs['Emission Strength'].default_value
    elif em:base=em.inputs['Color'].default_value[:3];strength=em.inputs['Strength'].default_value
    else:raise RuntimeError('Unsupported material '+m.name)
    colors[row,col]=[*(c*(.9+min(strength,3)*.4) for c in base),0 if o.hide_render else 1]
   eo.to_mesh_clear()
 out=root/'assets/vfx/approved'/name;out.mkdir(parents=True,exist_ok=True);positions.tofile(out/'positions.bin');colors.tofile(out/'colors.bin')
 meta={'source_file':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'objects':[o.name for o in objects],'vertices':count,'width':width,'rowsPerFrame':rows,'frames':frames,'fps':s.render.fps,'radius':radius,'startFrame':start,'endFrame':end}
 (out/'clip.json').write_text(json.dumps(meta,indent=2)+'\n');print('CLIP',name,count,'vertices',frames,'frames',positions.nbytes+colors.nbytes,'bytes',flush=True)
