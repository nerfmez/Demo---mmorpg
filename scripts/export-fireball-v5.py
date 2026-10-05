import bpy,json,math,hashlib,pathlib,struct
# blender -b APPROVED.blend --disable-autoexec --python scripts/export-fireball-v5.py
assert hashlib.sha256(pathlib.Path(bpy.data.filepath).read_bytes()).hexdigest()=="4dbd8dd906f5b14a0996c07787b163d19ffd0c055826bd15b717ffb6c9cfdfc6", "Unverified V5 source"
repo=pathlib.Path(__file__).resolve().parents[1]
from mathutils import Vector
s=bpy.context.scene; C=Vector((3.61,-.45,1.14)); U=Vector((0,.676,.737)); N=Vector((0,-.737,.676));
objs=sorted([o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('V4 ')],key=lambda o:o.name)
# Fixed per-object topology triangulated at largest area; no arena objects.
entries=[];positions=[];colors=[];indices=[];offset=0
for o in objs:
 best=-1;frame=40
 for f in range(40,65):
  s.frame_set(f);ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();area=sum(p.area for p in me.polygons)
  if area>best:best=area;frame=f
  ev.to_mesh_clear()
 s.frame_set(frame);ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
 count=len(me.vertices);indices.extend([offset+i for t in me.loop_triangles for i in t.vertices]);entries.append((o,count));offset+=count;ev.to_mesh_clear()
for f in range(40,65):
 s.frame_set(f);deps=bpy.context.evaluated_depsgraph_get()
 for o,count in entries:
  ev=o.evaluated_get(deps);me=ev.to_mesh();ma=o.active_material;nodes=ma.node_tree.nodes
  emission=next(n for n in nodes if n.type=='EMISSION');color=emission.inputs[0].default_value[:3];power=emission.inputs[1].default_value
  mix=next(n for n in nodes if n.type=='MIX_SHADER');alpha=mix.inputs[0].default_value
  if o.hide_render:alpha=0
  radial=o.name=='V4 brief contact radiance'
  if radial:
   mul=next(n for n in nodes if n.type=='MATH');alpha=mul.inputs[1].default_value*(0 if o.hide_render else 1)
  for vi,v in enumerate(me.vertices):
   p=ev.matrix_world@v.co-C
   positions.extend([round(p.x,5),round(p.dot(U)/U.length_squared,5),round(p.dot(N)/N.length_squared,5),1])
   a=alpha
   if radial:
    radius=0.001 if vi//48==0 else (vi//48)/7
    a*=.23*(1-radius)**2
   colors.extend([round(c*power,5) for c in color]+[round(a,5)])
  ev.to_mesh_clear()
result={'source':'Azure_Fireball_V5.blend sha256 4dbd8dd906f5b14a0996c07787b163d19ffd0c055826bd15b717ffb6c9cfdfc6','fps':24,'firstFrame':40,'frames':25,'vertices':offset,'objects':[{'name':o.name,'vertices':n}for o,n in entries],'indices':indices,'positions':positions,'colors':colors}
(repo/'assets/vfx').mkdir(parents=True,exist_ok=True)
for key in ['positions','colors']:
 vals=result.pop(key)
 (repo/f'assets/vfx/fireball-v5-{key}.bin').write_bytes(struct.pack('<'+'e'*len(vals),*vals))
with open(repo/'data/fireball-v5-contact.json','w')as f:json.dump(result,f,separators=(',',':'))
print('CONTACT_EXPORT',offset,'vertices',len(indices)//3,'triangles',len(entries),'objects')
