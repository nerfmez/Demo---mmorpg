import bpy, math, json, os, random, sys
from mathutils import Vector
ROOT=os.environ.get('BOW_PROOF_DIR',os.path.dirname(os.path.abspath(__file__)))
SKILL=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'heavy_draw'
FPS=30
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.cycles.samples=16;sc.cycles.use_denoising=False
sc.render.resolution_x=1280;sc.render.resolution_y=800;sc.render.resolution_percentage=100
sc.display.render_aa='FXAA';sc.render.resolution_percentage=75;sc.render.fps=FPS;sc.frame_start=1;sc.frame_end=90;sc.world.color=(.3,.3,.3)
sc.view_settings.view_transform='Standard';sc.view_settings.look='Medium High Contrast'
sc.display.shading.light='FLAT';sc.display.shading.studiolight_rotate_z=.4;sc.display.shading.color_type='TEXTURE';sc.display.shading.show_shadows=True;sc.display.shading.show_cavity=True;sc.display.shading.cavity_type='BOTH';sc.display.shading.background_type='WORLD';sc.display.shading.show_specular_highlight=True;sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,SKILL+'-hero.glb'))
for o in list(bpy.context.scene.objects):
 o['provenance']='CURRENT MAIN HairSample hero / production bow / HumanoidAnimator baked 30Hz'
# Imported glTF Y-up -> Blender Z-up: game(x,y,z) -> Blender(x,-z,y).
def mat(name,color,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.75
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
wood=mat('Physical arrow • dark shaft',(.12,.065,.026));metal=mat('Physical arrow • steel tip',(.66,.74,.79));white=mat('Ivory speed stroke',(1,.88,.58),2);gold=mat('Heavy draw • amber',(1,.49,.09),2);pin=mat('Pin • sage edge',(.3,.85,.54),1.2)
floor=mat('Neutral game-scale sand',(.39,.44,.31));grid=mat('Subtle metre seams',(.26,.29,.22))
def mesh_obj(name,verts,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);sc.collection.objects.link(o);o.data.materials.append(material);return o

def cylinder_between(name,a,b,r,material):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material);return o

def key(o,t,loc=None,scale=None):
 f=1+t*FPS
 if loc is not None:o.location=loc;o.keyframe_insert('location',frame=f)
 if scale is not None:o.scale=scale;o.keyframe_insert('scale',frame=f)
 if o.animation_data:
  for fc in o.animation_data.action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'

def pulse(o,start,end,peak=1):
 key(o,0,scale=(0,0,0));key(o,start,scale=(0,0,0));key(o,start+.025,scale=(peak,peak,peak));key(o,end,scale=(0,0,0))
def stroke(name,a,b,width,material,start,end):
 o=cylinder_between(name,a,b,width,material);pulse(o,start,end);return o

def ring(name,center,radius,material,start,end,width=.02):
 vs=[];fs=[]
 for i in range(64):
  ang=2*math.pi*i/64
  for r in (radius-width,radius+width):vs.append((math.cos(ang)*r,math.sin(ang)*r,.0))
 for i in range(64):j=(i+1)%64;fs.append((2*i,2*j,2*j+1,2*i+1))
 o=mesh_obj(name,vs,fs,material);o.location=center;pulse(o,start,end);key(o,end-.04,scale=(1,1,1));return o

def arrow(name,start,end,t0,t1,material=white,trail=1):
 start,end=Vector(start),Vector(end);d=(end-start).normalized();root=bpy.data.objects.new(name,None);sc.collection.objects.link(root)
 shaft=cylinder_between(name+' wood',(0,0,-.46),(0,0,.2),.024,wood);shaft.parent=root
 bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.07,radius2=0,depth=.19,location=(0,0,.3));tip=bpy.context.object;tip.name=name+' steel';tip.data.materials.append(metal);tip.parent=root
 for rot in (0,math.pi/2):
  f=mesh_obj(name+' fletching',[(-.07,0,-.4),(.07,0,-.4),(0,0,-.18)],[(0,1,2)],material);f.rotation_euler.z=rot;f.parent=root
 # tapered speed wedge along flight, deliberately much thinner than area boundary
 tail=mesh_obj(name+' tapered flight',[(-.065,0,-.2),(.065,0,-.2),(0,0,-.2-trail)],[(0,1,2)],material);tail.parent=root
 root.rotation_euler=d.to_track_quat('Z','Y').to_euler()
 key(root,0,loc=start,scale=(0,0,0));key(root,max(0,t0-.001),loc=start,scale=(0,0,0));key(root,t0,loc=start,scale=(1,1,1));key(root,t1,loc=end,scale=(1,1,1));key(root,t1+.035,loc=end,scale=(0,0,0));return root

def contact(center,t,material,count=7):
 random.seed(int(t*1000))
 for i in range(count):
  ang=2*math.pi*i/count;d=Vector((math.cos(ang),math.sin(ang),.4));a=Vector(center)
  shard=cylinder_between('Short directional contact',a,a+d*.35,.025,material);pulse(shard,t,t+.17)
  # separate short flying chip, dies without a pool or decal
  chip=mesh_obj('Contact chip',[(-.035,-.025,0),(.035,-.025,0),(0,.07,0)],[(0,1,2)],metal)
  key(chip,0,scale=(0,0,0));key(chip,t,loc=a,scale=(0,0,0));key(chip,t+.025,loc=a+d*.12,scale=(1,1,1));key(chip,t+.22,loc=a+d*.5,scale=(0,0,0))

bpy.ops.mesh.primitive_plane_add(size=80);bpy.context.object.name='Game scale ground';bpy.context.object.data.materials.append(floor)
for x in range(0):
 cylinder_between('metre seam',(x,-10,.003),(x,10,.003),.004,grid)
 cylinder_between('metre seam',(-12,x,.003),(12,x,.003),.004,grid)
# Actual game training post geometry, contextual target only; hero and bow are exported game assets.
cylinder_between('Training target post',(-6,0,0),(-6,0,1.65),.075,wood)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.35,location=(-6,0,1.15));bpy.context.object.scale.z=1.6;bpy.context.object.data.materials.append(mat('Straw target',(.63,.48,.23)))
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.25,location=(-6,0,1.85));bpy.context.object.data.materials.append(mat('Straw target head',(.73,.59,.32)))
# Camera exact production offset, target height .8m, vertical FOV 36 degrees.
bpy.ops.object.camera_add(location=(0,-13.5,19.8));cam=bpy.context.object;cam.name='Production game camera • 36°';cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.sensor_fit='VERTICAL';cam.data.sensor_height=32;cam.data.lens=32/(2*math.tan(math.radians(36)/2));sc.camera=cam
bpy.ops.object.light_add(type='AREA',location=(0,-4,12));bpy.context.object.data.energy=1800;bpy.context.object.data.size=12
bpy.ops.object.light_add(type='SUN',location=(0,0,10));bpy.context.object.rotation_euler=(.4,-.5,-.3);bpy.context.object.data.energy=1.4
orig=json.load(open(os.path.join(ROOT,SKILL+'-timing.json')));cast=orig['cast'];p=orig['origins'][round(cast*30)];origin=Vector((p[0],-p[2],p[1]));target=Vector((-6,0,1.1))
# The bow release anchor uses production rig hand/weapon transform; export provenance is kept in timing JSON.
if SKILL=='heavy_draw':
 for i in range(4):
  a=origin+Vector((.1,.13*(i-1.5),.07*(i-1.5)));b=a+Vector((.42,.06*(i-1.5),.02))
  o=stroke('Brief tension stroke',a,b,.032,gold,.23+i*.035,cast+.03);key(o,cast-.03,scale=(1,1,1))
 for i in range(3):stroke('Bow origin release tick',origin,origin+Vector((-.35,.12*(i-1),.08*(i-1))),.027,white,cast,cast+.1)
 hit=cast+(origin-target).length/27;arrow('Heavy single arrow',origin,target,cast,hit,white,1.25);contact(target+Vector((.1,-.55,.1)),hit,gold)
elif SKILL=='arrow_rain':
 arrow('Upward bow signal',origin,origin+Vector((-.8,0,3)),cast,cast+.18,white,.7)
 ring('Chosen area • thin edge',(-6,0,.025),2.1,white,.05,1.32,.012)
 random.seed(731)
 for wave in range(3):
  hit=cast+.35+wave*.3
  for i in range(13):
   ang=2*math.pi*i/13+wave*.37;r=(.25+random.random()*.72)*2.05
   end=Vector((-6+r*math.cos(ang),r*math.sin(ang),.1));start=end+Vector((.35,0,3.6))
   arrow(f'Wave {wave+1} physical arrow {i+1}',start,end,hit-.23,hit,white,.7)
   contact(end,hit,gold,3)
else:
 hit=cast+(origin-target).length/24;arrow('Pin physical arrow',origin,target,cast,hit,pin,.85);contact(target+Vector((.1,-.55,.1)),hit,pin,5)
 ring('Root movement cue',(-6,0,.06),.52,pin,hit,hit+.9,.023)
 for i in range(3):
  a=2*math.pi*i/3;r=.58;pos=Vector((-6+math.cos(a)*r,math.sin(a)*r,.08));end=pos+Vector((-math.cos(a)*.2,-math.sin(a)*.2,.26))
  stroke('Restrained pin anchor',pos,end,.043,pin,hit,hit+.9)
sc['proof_status']='BLENDER DESIGN PROOF ONLY. Not integrated runtime. Gameplay remains aaad1b5.'
sc['camera_contract']='36 degree vertical FOV; offset game (0,19,13.5); target y .8; 1 Blender unit = 1 game metre'
sc['timing_contract']=json.dumps({'cast':cast,'duration':3,'fps':30,'rainContacts':[.65,.95,1.25],'rootDuration':.9})
sc.render.filepath=os.path.join(ROOT,SKILL,'frame_');os.makedirs(os.path.join(ROOT,SKILL),exist_ok=True)
sc.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,SKILL+'.blend'))
if '--render' in sys.argv:
 sc.frame_start=int(os.environ.get('BOW_PROOF_FRAME_START','1'));sc.frame_end=int(os.environ.get('BOW_PROOF_FRAME_END','90'));bpy.ops.render.render(animation=True)
else:
 sc.frame_set(21 if SKILL=='heavy_draw' else 29 if SKILL=='arrow_rain' else 17);sc.render.filepath=os.path.join(ROOT,SKILL+'-review.png');bpy.ops.render.render(write_still=True)
