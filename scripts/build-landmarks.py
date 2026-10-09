"""Author editable Blender landmarks and export compact GLBs. Blender 4.3+.
Run: blender -b --python scripts/build-landmarks.py -- cliff_shrine
Game axes are X right, Y up, Z forward; Blender sources use Z up.
Sources retain named parts, editable curves and bevel modifiers. Export copies
are evaluated and joined by material / moving pivot, never the source objects.
"""
import bpy, math, sys, os, json
from mathutils import Vector, Matrix, Euler
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets/blender/landmarks')
EXPORT = os.path.join(ROOT, 'public/models/landmarks')
os.makedirs(SOURCE, exist_ok=True); os.makedirs(EXPORT, exist_ok=True)
PI = math.pi
C = Matrix(((1,0,0),(0,0,-1),(0,1,0)))
def point(p): return C @ Vector(p)
def linear(v): return v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4
MATS = {}
def material(hexcode, glow=None):
    key=(hexcode,glow)
    if key in MATS: return MATS[key]
    mat=bpy.data.materials.new('Pigment_'+hexcode[1:]);mat.use_nodes=True
    rgb=tuple(linear(int(hexcode[i:i+2],16)/255) for i in (1,3,5))
    mat.diffuse_color=(*rgb,1)
    node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*rgb,1);node.inputs['Roughness'].default_value=.85
    if glow:
        e=tuple(linear(int(glow[i:i+2],16)/255) for i in (1,3,5))
        node.inputs['Emission Color'].default_value=(*e,1);node.inputs['Emission Strength'].default_value=.45
    MATS[key]=mat;return mat
def finish(obj,name,col,rot=(0,0,0),bevel=0,glow=None,parent=None):
    obj.name=name;obj.data.materials.append(material(col,glow))
    obj.rotation_euler=(C @ Euler(rot,'XYZ').to_matrix() @ C.transposed()).to_euler()
    if bevel:
        mod=obj.modifiers.new('Soft crafted edges','BEVEL');mod.width=bevel;mod.segments=1
        mod=obj.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    if parent:obj.parent=parent
    return obj
def box(name,col,size,at,rot=(0,0,0),bevel=.035,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=point(at));obj=bpy.context.object
    obj.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,col,rot,bevel,parent=parent)
def cylinder(name,col,r1,r2,h,at,n=16,rot=(0,0,0),bevel=.025,parent=None):
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r2,radius2=r1,depth=h,location=point(at));return finish(bpy.context.object,name,col,rot,bevel,parent=parent)
def sphere(name,col,at,size=(1,1,1),r=1,glow=None,segments=16,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=r,location=point(at));obj=bpy.context.object;obj.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in obj.data.polygons:f.use_smooth=True
    return finish(obj,name,col,glow=glow)
def mesh(name,col,verts,faces,glow=None,bevel=0):
    data=bpy.data.meshes.new(name);data.from_pydata([point(v) for v in verts],[],faces);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return finish(obj,name,col,bevel=bevel,glow=glow)
def curve(name,col,points,r=.05,glow=None):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=3;data.bevel_depth=r;data.bevel_resolution=1
    s=data.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for b,p in zip(s.bezier_points,points):b.co=point(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(material(col,glow));return obj
def beam(name,col,points,width,depth):
    verts=[]
    for x,y,z in points:verts.extend([(x,y-width/2,z-depth/2),(x,y+width/2,z-depth/2),(x,y+width/2,z+depth/2),(x,y-width/2,z+depth/2)])
    faces=[(3,2,1,0)]
    for i in range(len(points)-1):
        for j in range(4):a=4*i+j;b=4*i+(j+1)%4;faces.append((a,b,b+4,a+4))
    j=4*(len(points)-1);faces.append((j,j+1,j+2,j+3))
    return mesh(name,col,verts,faces,bevel=.025)

def roof(name,col,radius,base,height,n=6):
    # Concave eaves and a slender cap read clearly from the 3/4 game camera.
    rings=[(radius,base),(radius*.91,base+.12),(radius*.59,base+height*.35),(radius*.22,base+height*.78),(.035,base+height)]
    verts=[(math.sin(2*PI*i/n+PI/n)*r,y,math.cos(2*PI*i/n+PI/n)*r) for r,y in rings for i in range(n)]
    faces=[tuple(reversed(range(n)))]
    for k in range(len(rings)-1):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces.append(tuple(range((len(rings)-1)*n,len(rings)*n)))
    return mesh(name,col,verts,faces)
def leaf(name,col,start,end,width=.2):
    a=Vector(start);b=Vector(end);d=b-a;side=d.cross(Vector((0,1,0))).normalized()*width
    middle=a+d*.48;rise=Vector((0,width*.35,0))
    verts=[tuple(a),tuple(middle+side),tuple(b),tuple(middle-side),tuple(middle+rise)]
    obj=mesh(name,col,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)])
    return obj
def crescent(name,col,at,r=1,tube=.13,turn=0,glow=None):
    pts=[]
    for i in range(22):
        a=(-PI*.68)+i/21*PI*1.36+turn;pts.append((at[0]+math.cos(a)*r,at[1]+math.sin(a)*r,at[2]))
    obj=curve(name,col,pts,tube,glow);obj.data.resolution_u=2;return obj
def ring(name,col,at,r=.8,tube=.04,plane='ground',glow=None):
    pts=[]
    for i in range(13):
        a=2*PI*i/12;pts.append((at[0]+math.sin(a)*r,at[1]+(math.cos(a)*r if plane=='vertical' else 0),at[2]+(math.cos(a)*r if plane=='ground' else 0)))
    obj=curve(name,col,pts,tube,glow);obj.data.resolution_u=2;return obj
def flower(name,at,r=.16,col='#dd6a7d'):
    rock(name+' centre','#e9bc66',at,(r*.3,r*.18,r*.3))
    for i in range(5):
        a=i*2*PI/5;rock(name+' broad faceted petal',col,(at[0]+math.sin(a)*r*.5,at[1],at[2]+math.cos(a)*r*.5),(r*.6,r*.25,r*.6),a)

def tapered_curve(name,col,points,radii,glow=None):
    obj=curve(name,col,points,1,glow)
    for p,r in zip(obj.data.splines[0].bezier_points,radii):p.radius=r
    return obj

def rock(name,col,at,size,turn=0,subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions,radius=1,location=point(at))
    obj=bpy.context.object;obj.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,col,rot=(0,turn,0))

def orient_parts(parts,turn):
    rotation=(C @ Euler((0,turn,0),'XYZ').to_matrix() @ C.transposed()).to_4x4()
    bpy.context.view_layer.update()
    for obj in parts:obj.matrix_world=rotation @ obj.matrix_world

def crystal(name,base,height,radius,lean,turn=0):
    # Continuous asymmetric prism: no disconnected cone perched on a shaft.
    x,y,z=base;n=6;verts=[]
    for t,rad in [(0,.78),(.22,1),(.73,.76)]:
        for i in range(n):
            a=turn+i*PI/3;verts.append((x+lean[0]*t+math.sin(a)*radius*rad,y+height*t,z+lean[1]*t+math.cos(a)*radius*rad))
    verts.append((x+lean[0]+radius*.2,y+height,z+lean[1]-radius*.13))
    faces=[tuple(reversed(range(n)))];colors=[0]
    for k in range(2):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n));colors.append([0,1,2,1,0,2][i])
    for i in range(n):faces.append((12+i,12+(i+1)%n,18));colors.append([1,3,2,1,0,3][i])
    obj=mesh(name,'#197c9b',verts,faces)
    for col in ['#309dbc','#67d9e4','#a1edf0']:obj.data.materials.append(material(col))
    for face,index in zip(obj.data.polygons,colors):face.material_index=index
    return obj

def giant_conch():
    shell='#f1ddb8';ridge='#bf966a';pink='#db7485';inner='#853c61'
    start=set(bpy.data.objects)
    # Rounded whorls swell towards the aperture, rather than linear cone rings.
    profile=[(-2.5,.03),(-2.25,.28),(-1.96,.42),(-1.72,.39),(-1.48,.77),(-1.12,.96),(-.82,.92),(-.48,1.43),(.08,1.68),(.6,1.55),(1.0,1.18)]
    n=24;verts=[]
    for z,r in profile:
        for i in range(n):a=2*PI*i/n;verts.append((math.sin(a)*r,1.5+math.cos(a)*r*.88,z))
    faces=[tuple(reversed(range(n)))]
    for k in range(len(profile)-1):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    body=mesh('Bulging cream shell whorls',shell,verts,faces)
    for f in body.data.polygons:f.use_smooth=True
    pts=[]
    for i in range(65):
        t=i/64;z=-2.36+t*3.28;a=t*PI*5.5;r=.2+1.46*math.sin(t*PI*.64)
        pts.append((math.sin(a)*r,1.5+math.cos(a)*r*.88,z))
    curve('Continuous spiral growth shoulder',ridge,pts,.095).data.resolution_u=1
    # Mouth tilts upwards so its flared pink interior is legible from game height.
    center=Vector((0,1.38,1.22));normal=Vector((0,.52,.854));up=Vector((0,.854,-.52));right=Vector((1,0,0))
    verts=[]
    for rx,ry,depth in [(1.46,1.46,.11),(1.19,1.22,.24),(.89,.94,-.32),(.45,.48,-.65)]:
        for i in range(n):
            a=i*2*PI/n;flare=1+.1*math.sin(a*3+.4)
            verts.append(tuple(center+right*(math.sin(a)*rx*flare)+up*(math.cos(a)*ry)+normal*depth))
    faces=[]
    for k in range(3):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces.append(tuple(range(3*n,4*n)))
    mouth=mesh('Flared rosy aperture and recessed throat',pink,verts,faces)
    mouth.data.materials.append(material(inner));mouth.data.materials.append(material('#f2a3ab'))
    for f in mouth.data.polygons:f.material_index=2 if f.index<n else 0 if f.index<2*n else 1;f.use_smooth=True
    lip=[tuple(center+right*(math.sin(i*2*PI/n)*1.46*(1+.1*math.sin(i*2*PI/n*3+.4)))+up*(math.cos(i*2*PI/n)*1.46)+normal*.1) for i in range(n+1)]
    curve('Thick cream rolled aperture edge',shell,lip,.14).data.resolution_u=1
    for i,(x,y,z,tx,ty,tz) in enumerate([(-1.36,2.0,.12,-2.12,2.36,.01),(-.79,2.64,-.55,-1.17,3.46,-.69),(.52,2.84,-.35,.79,3.61,-.56),(1.4,1.84,-.02,2.16,2.12,-.3)]):
        tapered_curve('Broad shoulder spine '+str(i),shell,[(x,y,z),((x+tx)/2,(y+ty)/2,(z+tz)/2),(tx,ty,tz)],[.22,.16,.012])
    # Landmark placement/rotation remain data-owned; the artist-facing aperture
    # counter-rotates inside this source to expose both mouth and spiral at the
    # established south approach, rather than hiding the coil behind the mouth.
    orient_parts(set(bpy.data.objects)-start,-1.5)
    for x,z in [(1.9,.7),(-1.8,.8)]:rock('Tide-smoothed grounding stone','#b9b79b',(x,.1,z),(.5,.22,.43),x)

def watchtower():
    wood='#9b7148';dark='#584631';roofcol='#476d4d'
    for x in [-1.2,1.2]:
        for z in [-1.2,1.2]:
            beam('Ranger splayed leg',wood,[(x*1.13,0,z*1.13),(x,5.8,z)],.34,.34)
            box('Lookout roof post',dark,(.15,1.7,.15),(x,6.75,z))
    for z in [-1.2,1.2]:
        for s in [-1,1]:beam('Structural cross brace',dark,[(s*1.28,1.3,z),(-s*1.2,4.7,z)],.2,.2)
    box('Watch platform',wood,(3.3,.22,3.3),(0,5.75,0))
    for s in [-1,1]:
        box('Lookout railing',dark,(3.3,.12,.12),(0,6.6,s*1.56));box('Lookout railing',dark,(.12,.12,3.3),(s*1.56,6.6,0))
    roof('Swept ranger roof',roofcol,2.55,7.4,1.8,4)
    cylinder('Roof finial','#c6a657',0,.13,.45,(0,9.35,0),8,bevel=0)
    for s in [-.34,.34]:beam('Ladder side',wood,[(s,0,2.2),(s,5.76,1.65)],.1,.1)
    for i in range(10):y=.35+i*.54;box('Ladder rung',dark,(.82,.08,.1),(0,y,2.2-y*.095),bevel=.012)
    cylinder('Pennant mast',dark,.045,.045,1,(0,9.55,0),8,bevel=0)
    mesh('Gold forked ranger pennant','#d7b15c',[(0,9.95,0),(.9,9.83,.03),(.67,9.57,.02),(.9,9.33,.04),(0,9.47,0)],[(0,1,2,3,4)])
    box('Lookout lantern',dark,(.32,.48,.32),(-1.2,2,1.5));box('Lantern light','#edd49a',(.22,.3,.22),(-1.2,2,1.53),bevel=.015)

    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:obj.matrix_world=Matrix.Diagonal((1,1,.68,1)) @ obj.matrix_world

def garden_gazebo():
    ivory='#eddfbc';rose='#b9516d';wood='#805132';leafcol='#375f39'
    cylinder('Rose pavilion footing','#b5ae92',2.94,3,.28,(0,.14,0),6,rot=(0,PI/6,0))
    cylinder('Pavilion inset cream floor',ivory,2.75,2.78,.08,(0,.32,0),6,rot=(0,PI/6,0))
    for i in range(6):
        a=i*PI/3;x=math.sin(a)*2.4;z=math.cos(a)*2.4
        cylinder('Substantial cream pavilion column',ivory,.2,.24,2.65,(x,1.68,z),8)
        cylinder('Column stone foot',ivory,.32,.35,.23,(x,.49,z),8)
        cylinder('Column carved capital',ivory,.35,.26,.24,(x,2.93,z),8)
        # Two adjacent front bays remain open; substantial rose groups frame
        # only three corners rather than fine noise around every column.
        if i not in [0,5]:
            b=a+PI/6;box('Low cream garden rail',ivory,(2.2,.16,.18),(math.sin(b)*2.08,1.04,math.cos(b)*2.08),rot=(0,b+PI/2,0))
        if i in [1,3,5]:
            tapered_curve('Broad climbing rose vine',leafcol,[(x,.4,z),(x+.2,1.3,z+.16),(x-.2,2.1,z+.18),(x,3.16,z)],[.11,.1,.08,.06])
            for k in range(3):
                y=1.1+k*.72;rock('Grouped rose foliage',leafcol,(x-.15,y,z+.13),(.47,.32,.39),k,2)
                # A camera-facing rose spray remains visible below the eaves;
                # the world placement itself keeps its authored rotation.
                forward=Vector((-math.sin(2.32),0,math.cos(2.32)))
                for dx,dy in [(-.23,0),(.23,.16)]:
                    at=Vector((x+dx,y+dy,z))+forward*.55
                    flower('Approach-visible broad rose spray',tuple(at),.36,'#d96b87')
    # Six pitched panels and structural radial ribs share the same silhouette.
    verts=[(math.sin(i*PI/3)*3.25,3.12,math.cos(i*PI/3)*3.25) for i in range(6)]+[(0,4.85,0)]
    mesh('Six pitched rose roof facets',rose,verts,[(i,(i+1)%6,6) for i in range(6)])
    for i in range(6):
        a=i*PI/3;b=(i+1)*PI/3;p=(math.sin(a)*3.25,3.16,math.cos(a)*3.25);q=(math.sin(b)*3.25,3.16,math.cos(b)*3.25)
        beam('Cream radial roof rib',ivory,[p,(p[0]*.5,4.05,p[2]*.5),(0,4.91,0)],.14,.17)
        beam('Substantial cream eaves',ivory,[p,q],.2,.22)
    cylinder('Pavilion gold finial','#cba65d',0,.16,.4,(0,5.06,0),10,bevel=0)
    box('Garden bench seat',wood,(1.65,.14,.46),(0,.73,-1.5))
    for x in [-.65,.65]:box('Bench foot',wood,(.13,.55,.4),(x,.38,-1.5))

def windmill():
    stone='#b2ac98';cream='#e4d7b8';roofcol='#9f503e';wood='#725337'
    cylinder('Windmill stone shoe',stone,1.96,2.08,.6,(0,.3,0),20)
    cylinder('Plaster tapered tower',cream,1.32,1.8,5.12,(0,3.1,0),24)
    for y,r in [(1.1,1.74),(5.7,1.4)]:cylinder('Masonry cornice',stone,r,r,.14,(0,y,0),24)
    roof('Mill swept roof',roofcol,1.76,5.77,1.65,16)
    box('Oak mill door',wood,(.86,1.48,.12),(0,1.12,1.79))
    box('Door lintel',stone,(1.1,.14,.22),(0,1.93,1.78))
    for y,a in [(3.4,.6),(4.5,-.7)]:
        box('Mill window frame',wood,(.5,.66,.1),(math.sin(a)*1.55,y,math.cos(a)*1.55),rot=(0,a,0))
        box('Deep blue mill window','#486778',(.35,.5,.11),(math.sin(a)*1.6,y,math.cos(a)*1.6),rot=(0,a,0))
    pivot=bpy.data.objects.new('landmark-spinner',None);bpy.context.collection.objects.link(pivot);pivot.location=point((0,5.28,2.2))
    # Parenting preserves world transform, then the exporter recreates the local pivot.
    moving=[]
    moving.append(cylinder('Sail brass hub','#ba9a58',.24,.24,.3,(0,5.28,2.2),12,rot=(PI/2,0,0)))
    for i in range(4):
        a=i*PI/2+PI/4;si=math.sin(a);co=math.cos(a)
        moving.append(box('Oak sail spar',wood,(.13,3.65,.11),(si*1.85,5.28+co*1.85,2.21),rot=(0,0,-a)))
        moving.append(box('Linen sail','#e6dbbd',(.77,2.65,.045),(si*2.22+co*.42,5.28+co*2.22-si*.42,2.26),rot=(0,0,-a),bevel=0))
        for k in range(4):d=1.1+k*.65;moving.append(box('Sail batten',wood,(.8,.04,.07),(si*d+co*.42,5.28+co*d-si*.42,2.29),rot=(0,0,-a),bevel=0))
    bpy.context.view_layer.update()
    for obj in moving:
        world=obj.matrix_world.copy();obj.parent=pivot;obj.matrix_world=world
    for x,z in [(1.15,2.02),(1.55,1.7)]:sphere('Miller flour sack',cream,(x,.22,z),(.7,1,.65),r=.32)

def farm_well():
    stone='#aba58e';wood='#826041';roofcol='#a65b45';hay='#ceac56'
    for i in range(12):
        a=i*PI/6;box('Well dressed stone block',stone,(.47,.78,.26),(math.sin(a)*.94,.39,math.cos(a)*.94),rot=(0,a,0),bevel=.06)
    ring('Well stone coping','#c7c0ac',(0,.88,0),.97,.12)
    cylinder('Recessed well water','#3c6675',.76,.76,.03,(0,.55,0),24,bevel=0)
    for x in [-.94,.94]:box('Well timber post',wood,(.18,2.1,.18),(x,1.47,0))
    cylinder('Well winding spindle',wood,.1,.1,2.25,(0,2.14,0),12,rot=(0,0,PI/2))
    curve('Well bucket rope','#c4ad78',[(.15,2.14,0),(.15,1.7,0),(.15,1.18,0)],.025)
    cylinder('Well bucket','#66594c',.19,.14,.31,(.15,1.07,0),12)
    for s in [-1,1]:box('Well pitched roof',roofcol,(2.6,.11,1.13),(0,2.81,s*.42),rot=(s*.55,0,0),bevel=.035)
    beam('Well ridge cap',wood,[(-1.35,3.12,0),(0,3.16,0),(1.35,3.12,0)],.12,.14)
    cylinder('Scarecrow pole',wood,.07,.07,2.35,(3.2,1.18,-1),8)
    beam('Scarecrow outstretched arms',wood,[(2.35,1.8,-1),(4.05,1.8,-1)],.11,.11)
    box('Weathered scarecrow tunic','#ab4f3e',(.7,.78,.25),(3.2,1.67,-1),rot=(0,0,-.08))
    sphere('Scarecrow straw head','#ccb68a',(3.2,2.2,-1),r=.22)
    cylinder('Scarecrow hat',hay,0,.4,.3,(3.2,2.5,-1),12);cylinder('Hat brim',hay,.46,.46,.045,(3.2,2.36,-1),16,bevel=0)
    for x,z,r in [(-3,-1.6,.94),(-1.9,-2.6,.55)]:
        cylinder('Harvest haystack',hay,.8*r,r,1.2*r,(x,.6*r,z),14);cylinder('Haystack peaked cap',hay,0,.84*r,.84*r,(x,1.62*r,z),14)
        for i in range(5):a=i*2*PI/5;curve('Hay binding','#94713d',[(x+math.sin(a)*r,.1,z+math.cos(a)*r),(x+math.sin(a)*r*.82,1.05*r,z+math.cos(a)*r*.82),(x,2.02*r,z)],.018)

def bell_tower():
    wood='#755033';stone='#a49f8b';red='#a7483d';brass='#c59143'
    box('Frontier bell stone footing',stone,(2.55,.45,2.55),(0,.22,0),bevel=.1)
    for x in [-1,1]:
        for z in [-1,1]:
            box('Substantial bell timber upright',wood,(.32,3.9,.32),(x,2.35,z))
            box('Stone post shoe',stone,(.5,.5,.5),(x,.53,z),bevel=.06)
    for y in [1.1,4.28]:
        for side in [-1,1]:
            box('Bell timber collar',wood,(2.5,.24,.26),(0,y,side));box('Bell timber collar',wood,(.26,.24,2.5),(side,y,0))
    for side in [-1,1]:
        for z in [-1,1]:beam('Bell frame knee brace',wood,[(side,3.25,z),(side*.42,4.25,z)],.24,.24)
        box('Pitched red bell roof',red,(3.55,.15,1.82),(0,4.7,side*.7),rot=(side*.48,0,0),bevel=.04)
    box('Bell roof ridge',wood,(3.65,.18,.2),(0,5.11,0))
    n=20;rings=[(1.0,2.55),(.83,2.73),(.53,3.19),(.36,3.62),(.3,3.9)];verts=[]
    for r,y in rings:
        for i in range(n):a=i*2*PI/n;verts.append((math.sin(a)*r,y,math.cos(a)*r))
    faces=[]
    for k in range(4):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    obj=mesh('Large flared bronze frontier bell',brass,verts,faces);mod=obj.modifiers.new('Cast bell wall','SOLIDIFY');mod.thickness=.08
    ring('Broad bronze bell lip',brass,(0,2.57,0),.99,.085)
    cylinder('Bell crown hanger',wood,.11,.11,.45,(0,4.02,0),8)
    tapered_curve('Bell clapper stem','#3f3831',[(0,3.6,0),(0,2.8,0),(0,2.41,0)],[.055,.06,.07])
    sphere('Heavy bronze clapper',brass,(0,2.4,0),r=.18,segments=12,rings=6)
    curve('Bell ringing rope','#d6bc80',[(.16,3.7,.4),(.33,2.7,.6),(.42,.63,.72)],.055)

def elder_mosstree():
    bark='#79583d';shade='#513c2e';moss='#698b49'
    # Restore the original ancient-tree scale: broad 2.3-unit trunk, a crown
    # around 14 units high, and substantial buttresses spreading 5 units.
    n=18;verts=[]
    for y,r,cx,cz in [(-.2,2.38,0,0),(1.1,2.22,-.17,-.08),(2.8,2.0,.12,-.16),(4.7,1.81,-.24,-.15),(6.8,1.46,.08,-.23),(8.8,1.12,.38,-.12),(9.65,.83,.33,-.15)]:
        for i in range(n):
            a=i*2*PI/n;rr=r*(1+.075*math.sin(i*2.1+y*.55))
            verts.append((cx+math.sin(a)*rr,y,cz+math.cos(a)*rr))
    faces=[]
    for k in range(6):
        for i in range(n):
            if k<2 and (i<2 or i>=16):continue
            a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    obj=mesh('Vast asymmetric ancient hollow trunk',bark,verts,faces)
    obj.data.materials.append(material(shade))
    for f in obj.data.polygons:f.material_index=1 if f.index%9==0 else 0
    sphere('Deep ancient-tree hollow',shade,(0,1.32,.92),(1.04,1.47,.6),segments=12,rings=6)
    for side in [-1,1]:
        tapered_curve('Massive hollow jamb',bark,[(side*1.27,-.1,1.93),(side*1.17,1.65,1.81),(side*.79,2.85,1.6),(.05,3.3,1.42)],[.63,.54,.44,.42])
    for i,(angle,length) in enumerate([(.3,5.35),(1.22,4.75),(2.02,5.0),(2.99,5.5),(3.82,4.85),(4.7,5.25),(5.52,5.1)]):
        u=Vector((math.sin(angle),0,math.cos(angle)));side=Vector((math.cos(angle),0,-math.sin(angle)))
        profile=[(1.27,2.75,.7),(2.32,1.4,.67),(3.65,.58,.48),(length,.025,.13)]
        vs=[]
        for d,y,w in profile:
            for sign,top in [(-1,False),(-1,True),(1,True),(1,False)]:
                vs.append(tuple(u*d+side*(sign*w)+Vector((0,y if top else -.04,0))))
        fs=[(3,2,1,0)]
        for k in range(3):
            for j in range(4):a=k*4+j;b=k*4+(j+1)%4;fs.append((a,b,b+4,a+4))
        fs.append((12,13,14,15));root=mesh('Broad grounded buttress root '+str(i),bark,vs,fs,bevel=.07)
        root.data.materials.append(material(shade))
        for f in root.data.polygons:f.material_index=1 if f.index%4==0 else 0
        tapered_curve('Buttress rounded spine',bark,[tuple(u*1.33+Vector((0,2.66,0))),tuple(u*2.35+Vector((0,1.5,0))),tuple(u*3.8+Vector((0,.63,0))),tuple(u*length+Vector((0,.08,0)))],[.43,.34,.19,.035])
        if i in [1,3,5]:tapered_curve('Broad root moss mantle',moss,[tuple(u*1.48+Vector((0,2.37,0))),tuple(u*2.7+Vector((0,1.15,0))),tuple(u*4.0+Vector((0,.42,0)))],[.22,.2,.05])
    branches=[(-3.45,10.27,-.55),(3.4,10.63,-.74),(-1.67,11.9,-2.9),(1.73,11.88,1.01)]
    for i,(x,y,z) in enumerate(branches):
        tapered_curve('Ancient massive crown fork '+str(i),bark,[(.03,6.55,-.15),(x*.44,8.9,z*.45),(x,y,z)],[.91,.6,.19])
    # Exact accepted forest leaf atlas, packed in the editable Blender source.
    # The compact GLB uses authored UVs and a named surface; runtime borrows
    # the existing game's cached atlas, without a second texture load.
    image=bpy.data.images.load(os.path.join(SOURCE,'textures/elder-accepted-leaf.png'),check_existing=True);image.pack()
    foliage=bpy.data.materials.new('Foliage_accepted_leaf_atlas');foliage.use_nodes=True
    node=foliage.node_tree.nodes.get('Principled BSDF');node.inputs['Roughness'].default_value=.95
    texture=foliage.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
    paint=foliage.node_tree.nodes.new('ShaderNodeVertexColor');paint.layer_name='AcceptedFoliageColor'
    foliage.node_tree.links.new(paint.outputs['Color'],node.inputs['Base Color']);foliage.node_tree.links.new(texture.outputs['Alpha'],node.inputs['Alpha'])
    foliage.surface_render_method='DITHERED';foliage.use_transparency_overlap=False
    clusters=[(-3.9,10.9,-.7,3.9), (3.5,11.2,-1.1,4.0),(-1.75,12.7,-2.45,3.7),(1.7,12.45,.45,3.7),(-4.55,10.05,.68,2.9),(4.38,10.03,.5,3.0),(-.6,11.7,2.4,3.5),(1.3,11.5,-3.4,3.2)]
    rotation=Euler((0,-.21,0),'XYZ').to_matrix()
    dark=Vector(tuple(linear(int('#315e45'[i:i+2],16)/255) for i in (1,3,5)))
    mid=Vector(tuple(linear(int('#649347'[i:i+2],16)/255) for i in (1,3,5)))
    light=Vector(tuple(linear(int('#a4bf65'[i:i+2],16)/255) for i in (1,3,5)))
    sun=Vector((-.5,1,.25)).normalized()
    def tone(height,normal):
        t=max(0,min(1,(height+.45)/1.3));t=t*t*(3-2*t)
        lit=max(0,min(1,normal.dot(sun)*.26+t*.5+.1))
        return dark.lerp(mid,min(1,lit*1.9)).lerp(light,max(0,(lit-.53)*1.9))
    for ci,(cx,cy,cz,size) in enumerate(clusters):
        for i in range(8):
            a=i*2.39996+ci*1.67;spread=math.sqrt(i/8)*size*.45
            center=Vector((cx+math.cos(a)*spread,cy+math.sin(i*1.7)*.48,cz+math.sin(a)*spread*.72));width=size*(.78+.11*math.sin(i*1.3+ci));height=width*(.9+.08*math.cos(i))
            normal=rotation@Vector((math.cos(a)*.6,.65,math.sin(a)*.6)).normalized()
            right=Vector((0,1,0)).cross(normal).normalized();up=normal.cross(right).normalized()
            roll=math.sin(i*1.9+ci)*.62;oldright=right.copy();right=right*math.cos(roll)+up*math.sin(roll);up=up*math.cos(roll)-oldright*math.sin(roll)
            vs=[];uvs=[];colors=[];tile=(i+ci)%4
            for v in range(3):
                for u in range(3):
                    x=u-1;y=v-1;vs.append(tuple(center+right*(x*width*.5)+up*(y*height*.5)+normal*(width*.12*(1-x*x)*(1-y*y))))
                    uvs.append(((tile%2+u/2)/2,(tile//2+v/2)/2))
                    localheight=(center.y-cy)/size+y*.45+(ci%3)*.1
                    col=tone(localheight,normal).lerp(tone((center.y-cy)/size,normal),.22)
                    colors.append((*col,1))
            fs=[]
            for v in range(2):
                for u in range(2):a=v*3+u;fs.append((a,a+1,a+4,a+3))
            obj=mesh('Editable anime crown spray '+str(ci)+'-'+str(i),'#ffffff',vs,fs);obj.data.materials.clear();obj.data.materials.append(foliage)
            uv=obj.data.uv_layers.new(name='AcceptedLeafUV');paint=obj.data.color_attributes.new(name='AcceptedFoliageColor',type='FLOAT_COLOR',domain='CORNER')
            for face in obj.data.polygons:
                for loop in face.loop_indices:
                    vi=obj.data.loops[loop].vertex_index
                    obj.data.uv_layers['AcceptedLeafUV'].data[loop].uv=uvs[vi]
                    obj.data.color_attributes['AcceptedFoliageColor'].data[loop].color=colors[vi]
    # One cyan focal point sits in the readable hollow, not scattered sparks.
    sphere('Cyan ancient heartwood','#65d3c8',(0,1.08,1.89),(.34,.61,.18),glow='#288c8c',segments=12,rings=6)
    for x,y,z,r in [(-1.73,1.37,1.57,.54),(-1.85,1.92,1.15,.37),(1.92,.82,1.31,.47)]:sphere('Ancient broad shelf fungus','#ccaa70',(x,y,z),(1,.2,.76),r=r,segments=12,rings=4)


def bramble_arch():
    bark='#5d3d2d';leafcol='#315b37'
    for side in [-1,1]:
        tapered_curve('Wild twisting bramble bough',bark,[(side*2.6,-.1,0),(side*2.53,1.42,.23),(side*2.1,2.92,-.1),(side*1.2,3.65,.16),(0,4.06,.03)],[.53,.43,.35,.29,.18])
        tapered_curve('Bramble wrapping branch','#805b37',[(side*2.85,.2,.3),(side*2.33,1.67,.36),(side*2.1,2.8,.17),(side*.7,3.97,.35)],[.28,.22,.17,.1])
        for i in range(3):tapered_curve('Grounded bramble toe',bark,[(side*2.6,.66,0),(side*(2.8+i*.18),.23,.55),(side*(3+i*.2),.04,.85+i*.14)],[.22,.15,.03])
    for i in range(11):
        a=i*PI/10;x=-math.cos(a)*2.6;y=math.sin(a)*3.9
        rock('Broad wild bramble foliage',leafcol if i%2 else '#5b853f',(x,y+.2,.03),(.62,.45,.52),a,2)
        if i in [1,3,7,9]:
            tapered_curve('Large silhouette thorn','#b49b6c',[(x,y,.32),(x+(-.36 if x<0 else .36),y+.45,.46)],[.16,.005])
            for dx,dz in [(-.15,.24),(.17,.32)]:sphere('Wild rose hip','#b55860',(x+dx,y+.12,dz),r=.16,segments=8,rings=4)

def luminous_shard(name,bottom,shoulder,tip,radius,turn=0):
    # Fresh double-ended diamond topology restores the original crystal identity.
    # Broad sloped facets run from the waist to the tip; no cylindrical shaft.
    verts=[bottom]
    for i in range(4):
        a=turn+i*PI/2;verts.append((shoulder[0]+math.sin(a)*radius,shoulder[1],shoulder[2]+math.cos(a)*radius))
    verts.append(tip)
    faces=[(0,1+(i+1)%4,1+i) for i in range(4)]+[(1+i,1+(i+1)%4,5) for i in range(4)]
    obj=mesh(name,'#7ee3ee',verts,faces,glow='#51cbdc')
    obj.data.materials.append(material('#acf5f5','#60d7de'));obj.data.materials.append(material('#398eb6','#165771'))
    for mat in list(obj.data.materials)[:2]:
        mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1;mat['landmarkEmission']=1
    for i,f in enumerate(obj.data.polygons):f.material_index=[0,1,2,0,1,0,2,0][i]
    if name=='Dominant luminous diamond heart':
        # Broad inset luminous facets form the heart, surrounded by the blue
        # crystal shell. They are geometry, not a light or a bloom dependency.
        for i in range(4):
            a=Vector(verts[1+i]);b=Vector(verts[1+(i+1)%4]);t=Vector(tip);center=(a+b+t)/3
            normal=(b-a).cross(t-a).normalized()
            pts=[tuple(center+(p-center)*.72+normal*.012) for p in [a,b,t]]
            core=mesh('Broad luminous crystal heart facet '+str(i),'#91f9ef',pts,[(0,1,2)],glow='#5cddd5')
            core.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1
            core.data.materials[0]['landmarkEmission']=1
    return obj

def glimmer_spire():
    stone='#8c958a';moss='#658953'
    rock('Wetland crystal stone mound',stone,(0,.25,0),(1.86,.7,1.73),.4,2)
    rock('Moss-covered crystal socket',moss,(.3,.52,.1),(1.52,.38,1.39),.9,2)
    # Author the cluster around a dominant double-ended heart crystal. Branches
    # rise from the same socket; they no longer slash across it like long swords.
    inv=Euler((0,-1.61,0),'XYZ').to_matrix()
    def local(p):return tuple(inv@Vector(p))
    luminous_shard('Dominant luminous diamond heart',local((0,.53,0)),local((-.03,3.29,0)),local((.16,6.62,-.09)),.92,.45)
    for i,(base,middle,tip,radius) in enumerate([
        ((-.55,.55,.05),(-1.03,1.9,.1),(-2.14,4.2,.15),.5),
        ((.48,.51,-.1),(1.04,2.12,-.12),(2.0,4.75,-.05),.48),
        ((.24,.62,-.62),(.44,1.53,-.91),(.82,3.55,-1.24),.34),
        ((-.23,.57,.61),(-.48,1.46,.81),(-.89,2.94,1.1),.36)]):
        luminous_shard('Unequal rising luminous cluster branch '+str(i),local(base),local(middle),local(tip),radius,.24+i*.38)
    for i,(x,z) in enumerate([(2.1,1),(-1.9,1.4),(.6,-2.2)]):
        rock('Satellite crystal grounding stone',stone,(x,.16,z),(.55,.32,.5),i,2)
        luminous_shard('Small wetland satellite diamond '+str(i),(x,.22,z),(x,.85,z),(x+.12,1.53,z+.08),.26,i*.5)
    for i in range(4):
        a=i*PI/2+PI/4;x=math.sin(a)*2.6;z=math.cos(a)*2.6
        box('Weathered crystal ward stone','#afb9aa',(.4,.82,.28),(x,.34,z),rot=(0,a,.04),bevel=.07)
        for side in [-1,1]:
            px=x+math.sin(a)*side*.155;pz=z+math.cos(a)*side*.155
            box('Broad cyan ward inlay','#99e1eb',(.14,.36,.025),(px,.48,pz),rot=(0,a,0),bevel=.015)


def sea_arch():
    # Uneven polygonal cross-sections form one eroded coastal rock window.
    # Broad strata faces replace the rejected uniformly round stone tube.
    n=13;m=8;verts=[]
    for i in range(n):
        a=i*PI/(n-1);x=-math.cos(a)*3.3;y=math.sin(a)*4.45-.24
        normal=Vector((-math.cos(a),math.sin(a),0));width=1.02+.14*math.sin(i*1.9)
        for j in range(m):
            b=j*2*PI/m;at=Vector((x,y,0))+normal*(math.cos(b)*width)+Vector((0,0,math.sin(b)*(1.03+.12*math.sin(i))))
            verts.append(tuple(at))
    faces=[tuple(reversed(range(m)))];indices=[1]
    for k in range(n-1):
        for j in range(m):a=k*m+j;b=k*m+(j+1)%m;faces.append((a,b,b+m,a+m));indices.append(1 if j in [3,4,5] else 2 if k%4==0 else 0)
    faces.append(tuple(range((n-1)*m,n*m)));indices.append(1)
    obj=mesh('Eroded asymmetric coastal stone window','#c7b58d',verts,faces)
    for col in ['#8c9486','#aa9777']:obj.data.materials.append(material(col))
    for f,index in zip(obj.data.polygons,indices):f.material_index=index
    for side in [-1,1]:
        rock('Coastal weathered rock footing','#8c9486',(side*3.3,.18,0),(1.32,.64,1.3),side*.4,2)
        rock('Broken coastal strata slab','#c7b58d',(side*3.61,.8,.7),(.78,.63,.46),side*.6)
    for x,z in [(-3.7,.65),(3.6,.7)]:
        for i in range(3):leaf('Broad coastal sea grass','#4d8065',(x,.4,z),(x+(i-1)*.3,1.28-i*.15,z+.18),.2)

def sundial():
    stone='#c8bea3';edge='#969785';brass='#bc9750'
    cylinder('Sundial foot',edge,2.1,2.25,.25,(0,.12,0),32)
    cylinder('Sundial carved dial',stone,2,2.05,.16,(0,.33,0),32)
    ring('Hour chapter ring',brass,(0,.43,0),1.78,.035)
    for i in range(12):
        a=i*PI/6;box('Hour marker',brass if i%3==0 else edge,(.11,.055,.34),(math.sin(a)*1.77,.45,math.cos(a)*1.77),rot=(0,a,0),bevel=.008)
    verts=[(-.09,.44,-.75),(-.09,2.2,-.75),(-.09,.44,.98),(.09,.44,-.75),(.09,2.2,-.75),(.09,.44,.98)]
    mesh('Bronze triangular gnomon',brass,verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],bevel=.025)
    sphere('Gnomon sun ornament','#dbc077',(0,2.2,-.75),r=.15)

def crag_beacon():
    for i,(x,y,z,rx,ry,rz) in enumerate([(0,.65,0,1.65,.82,1.45),(-.12,1.66,.02,1.3,.83,1.15),(.12,2.57,-.06,1,.8,.94)]):
        rock('Rugged beacon crag course '+str(i),['#767d77','#a49f88','#8d9485'][i%3],(x,y,z),(rx,ry,rz),i*.37,2)
    iron='#424951';cylinder('Broad iron beacon brazier',iron,1.17,.74,.56,(0,3.28,0),12)
    ring('Iron brazier rim',iron,(0,3.59,0),1.15,.13)
    # Sculpted static tongues have broad planes, tapering tips and a warm core.
    # No new particles, lights, postprocessing or per-frame animation.
    for i,(x,z,h,r,lean,col,glow) in enumerate([(0,0,2.0,.72,(.4,-.1),'#e46e31','#b34a20'),(-.48,.08,1.34,.4,(-.28,.04),'#e46e31','#b34a20'),(.52,-.15,1.55,.37,(.24,.1),'#e46e31','#b34a20'),(0,.4,1.13,.39,(.17,.04),'#efc258','#c79137')]):
        obj=tapered_curve('Broad swept flame tongue '+str(i),col,[(x,3.53,z),(x*.8,3.53+h*.43,z),(x+lean[0],3.53+h,z+lean[1])],[r,r*.75,.008],glow)
        obj.data.bevel_resolution=0

def solid_crescent(name,col,at,r=1,depth=.16,glow=None):
    # An extruded, tapering lunar sculpture. The offset inner arc forms the
    # silhouette; it is not a circular tube with the ends chopped off.
    d=.38*r;inner=.85*r;x=(r*r-inner*inner+d*d)/(2*d);y=math.sqrt(r*r-x*x)
    outer_angle=math.atan2(y,x);inner_angle=math.atan2(y,x-d);outline=[]
    for i in range(25):
        a=outer_angle+i/24*(2*PI-2*outer_angle);outline.append((math.cos(a)*r,math.sin(a)*r))
    for i in range(1,24):
        a=-inner_angle-i/24*(2*PI-2*inner_angle);outline.append((d+math.cos(a)*inner,math.sin(a)*inner))
    n=len(outline);verts=[(at[0]+x,at[1]+y,at[2]+z) for z in [-depth/2,depth/2] for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,col,verts,faces,glow=glow)

def moonstone():
    rock('Moonstone weathered foundation','#727f83',(0,.18,0),(1.12,.37,1.04),.5,2)
    outline=[(-.76,.2),(.72,.2),(.65,2.93),(.17,3.67),(-.14,3.42),(-.48,3.85),(-.74,2.91)]
    n=len(outline);verts=[(x,y,z) for z in [-.42,.42] for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=mesh('Broken lunar ritual tablet','#a8c1c5',verts,faces,bevel=.06);obj.data.materials.append(material('#627c8b'))
    for f in obj.data.polygons:f.material_index=1 if f.index>1 else 0
    for side in [-1,1]:
        solid_crescent('Broad moonstone lunar inlay','#58bacb',(0,2.45,side*.49),.56,.025,glow='#3d8297')
        mesh('Standing stone lower incised chevron','#627c8b',[(-.28,.63,side*.49),(0,.46,side*.5),(.28,.63,side*.49),(0,.79,side*.5)],[(0,1,2,3)])
    for x,z in [(-.8,.74),(.8,.73)]:
        cylinder('Moonstone votive basin','#bdc9c3',.22,.14,.19,(x,.24,z),8)
        sphere('Quiet lunar votive','#7ed4dc',(x,.4,z),(.7,1,.7),r=.13,glow='#418997',segments=8,rings=4)

def moon_altar():
    shadow='#707d95';stone='#adbaca';silver='#d2dedb'
    cylinder('Lunar ritual lower dais',shadow,1.6,1.76,.25,(0,.125,0),12)
    cylinder('Lunar ritual second step',stone,1.35,1.45,.2,(0,.35,0),12)
    cylinder('Lunar ritual upper platform',shadow,1.1,1.21,.16,(0,.53,0),12)
    ring('Ritual engraved chapter circle','#62aabe',(0,.625,0),.96,.055)
    for i in range(6):
        a=i*PI/3;box('Broad altar chapter mark',silver,(.12,.055,.32),(math.sin(a)*1.13,.61,math.cos(a)*1.13),rot=(0,a,0),bevel=0)
    box('Moon sculpture stone plinth',stone,(.62,.58,.63),(-.35,.85,0),bevel=.06)
    solid_crescent('Solid tapering rising moon',silver,(-.1,2.15,0),1.16,.24)
    sphere('Suspended lunar pearl','#80d4e0',(.38,2.16,.02),r=.29,glow='#458a9f',segments=16,rings=8)
    for side in [-1,1]:box('Lunar approach step',stone,(.78,.1,.4),(side*.55,.05,1.8),rot=(0,side*.22,0))

def fiddlehead_ferns():
    stem='#2c543d';young='#a5c76c';green='#4f8c45'
    for i,(x,z,h,angle) in enumerate([(0,0,3.55,-1.78),(1.7,.8,2.25,-1.35),(-1.5,1.1,2.8,-2.15)]):
        # Curl plane counter-rotates against world placement, with alternating
        # angles so the open heads survive the approach and side views.
        u=Vector((math.cos(angle),0,-math.sin(angle)));base=Vector((x,0,z));radius=.72 if i==0 else .58
        neck=[tuple(base),tuple(base+u*.1+Vector((0,h*.42,0))),tuple(base+Vector((0,h-.7,0)))]
        tapered_curve('Stout dark crozier stalk '+str(i),stem,neck,[.26,.24,.22])
        center=base+u*radius+Vector((0,h-.7,0));pts=[]
        for k in range(28):
            t=k/27;a=PI-t*PI*1.72;r=radius*(1-t*.75)
            pts.append(tuple(center+u*(math.cos(a)*r)+Vector((0,math.sin(a)*r,0))))
        tapered_curve('Large open light fiddlehead '+str(i),young,pts,[.22-(k/27)*.07 for k in range(28)]).data.resolution_u=2
        for j in range(3):
            y=.6+j*.49;side=-1 if j%2 else 1
            leaf('Grouped young crozier frond',green,tuple(base+Vector((0,y,0))),tuple(base+u*(side*.73)+Vector((0,y+.25,.18))),.28)
    for i in range(6):
        a=i*PI/3;u=Vector((math.sin(a),0,math.cos(a)));side=Vector((math.cos(a),0,-math.sin(a)));length=2.65
        tapered_curve('Mature dark fern rachis',stem,[(0,.1,0),tuple(u*1.25+Vector((0,1.0,0))),tuple(u*length+Vector((0,.5,0)))],[.1,.085,.028])
        for k in range(4):
            t=.28+k*.16;at=u*(length*t)+Vector((0,.35+.56*math.sin(t*PI),0));w=.84*(1-t*.55)
            for s in [-1,1]:leaf('Broad overlapping mature pinnae',green if i%2 else '#73a553',tuple(at),tuple(at+side*(s*w)+u*.25+Vector((0,.17,0))),.29)
        leaf('Broad fern terminal leaflet',young,tuple(u*2.13+Vector((0,.74,0))),tuple(u*2.9+Vector((0,.57,0))),.3)

def moon_mirror():
    stone='#8f9cae';silver='#ccd8d6';dark='#4e5974'
    box('Moth mirror foundation',dark,(1.75,.28,.9),(0,.14,0),bevel=.08)
    box('Moth mirror carved pedestal',stone,(1.15,.45,.6),(0,.51,0),bevel=.06)
    ring('Substantial lunar mirror bezel',silver,(0,1.87,0),1.17,.18,'vertical')
    cylinder('Deep lunar glass',dark,1.07,1.07,.09,(0,1.87,0),24,rot=(PI/2,0,0),bevel=0)
    for side in [-1,1]:
        # Static colored reflection planes are deliberately inexpensive.
        z=side*.063
        mesh('Blue reflected sky facet','#64a8bc',[(-.91,1.5,z),(-.7,2.4,z),(.2,2.9,z),(.83,2.4,z),(.37,1.96,z)],[(0,1,2,3,4)])
        mesh('Pale reflected moon facet','#a6d3dc',[(-.91,1.5,z),(.37,1.96,z),(.83,2.4,z),(.91,1.6,z),(.18,.86,z),(-.58,1.02,z)],[(0,1,2,3,4,5)])
        curve('Mirror broad lunar glint',silver,[(-.55,1.23,z*1.25),(-.18,1.9,z*1.25),(.29,2.5,z*1.25)],.065)
    for side in [-1,1]:
        cylinder('Moth mirror side support',stone,.15,.21,1.65,(side*1.09,1.13,0),8)
        outline=[(0,3.04),(.35,3.73),(1.24,3.54),(1.56,3.09),(.95,2.93),(.39,3.22)]
        n=len(outline);verts=[(side*x,y,z) for z in [-.13,.13] for x,y in outline]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh('Broad carved lunar moth wing',silver,verts,faces)
        for z in [-.15,.15]:mesh('Blue moth wing inset','#64a8bc',[(side*.35,3.35,z),(side*.54,3.56,z),(side*1.11,3.39,z),(side*.83,3.13,z)],[(0,1,2,3)])
    sphere('Lunar moth thorax',dark,(0,3.2,0),(.7,1.65,.6),r=.19,segments=12,rings=6)
    for side in [-1,1]:curve('Moth curved antenna',stone,[(0,3.39,0),(side*.23,3.75,0),(side*.44,3.68,0)],.055)

def root_arch():
    bark='#775036';dark='#49352c';moss='#42664a'
    tapered_curve('Ancient sweeping root gateway',bark,[(-3.4,-.1,0),(-3.35,1.63,.2),(-2.21,3.36,-.15),(-.75,4.03,.04),(1.27,3.87,-.09),(2.64,2.6,.14),(3.4,.4,0)],[.94,.71,.61,.52,.55,.64,.93])
    tapered_curve('Root gate ancient upper fork',dark,[(-3.45,1.9,-.24),(-2.85,3.18,-.36),(-1.73,4.21,-.4),(.3,4.41,-.19),(1.84,3.63,-.12)],[.39,.37,.31,.22,.035])
    for side in [-1,1]:
        rock('Massive root gate footing',bark,(side*3.4,.63,0),(1.04,1.0,1.02),side*.3,2)
        for i in range(3):
            tapered_curve('Grounded moonroot sweeping toe',dark,[(side*3.4,1.17,0),(side*(3.5+i*.16),.31,.5+i*.18),(side*(3.8+i*.25),.04,.95+i*.24)],[.3,.22,.04])
        tapered_curve('Broad mossed vascular root',moss,[(side*3.38,.8,.72),(side*2.72,2.8,.55),(side*1.29,3.76,.37)],[.18,.15,.03])
    for x,z,r in [(-1.2,2.4,.8),(1.9,-2.1,.7),(-2.4,-2.5,.56)]:
        rock('Root warren earth mound','#8f7554',(x,.13,z),(r*1.2,r*.69,r),.3,2)
        # Recess and rim tilt towards the game camera, rather than burying a
        # tiny dark disc underneath the mound's front lip.
        center=Vector((x,.41,z+r*.92));up=Vector((0,.84,-.54));normal=Vector((0,.54,.84));verts=[]
        for i in range(20):
            a=i*2*PI/20;verts.append(tuple(center+Vector((math.sin(a)*r*.52,0,0))+up*(math.cos(a)*r*.42)+normal*.04))
        mesh('Deep readable root warren entrance',dark,verts,[tuple(range(20))])
        pts=[]
        for i in range(17):a=-PI/2+i*PI/16;pts.append(tuple(center+Vector((math.sin(a)*r*.57,0,0))+up*(math.cos(a)*r*.51)))
        tapered_curve('Earthen burrow arch rim','#8f7554',pts,[r*.12]*17)
    for x,z in [(-3.38,.94),(3.15,.78)]:
        for i in range(2):
            cylinder('Lunar mushroom stem','#b5cab5',.06,.075,.38,(x+i*.22,.33,z),8,bevel=0)
            sphere('Broad lunar mushroom cap','#72bcb0',(x+i*.22,.54,z),(.38,.12,.3),glow='#396b67',segments=12,rings=4)

def cliff_shrine():
    red='#bc4438';ink='#403438';gold='#d6a74f';stone='#b9b8ad'
    for s in [-1,1]:
        cylinder('Shrine stone shoe',ink,.34,.35,.34,(s*1.8,.17,0))
        cylinder('Vermilion tapered column',red,.23,.28,4.4,(s*1.8,2.4,0),20)
        cylinder('Column brass collar',gold,.26,.26,.12,(s*1.8,.58,0))
        box('Column capital',red,(.7,.18,.6),(s*1.8,4.23,0))
        x=s*3;z=1.4
        cylinder('Lantern foot',stone,.42,.46,.22,(x,.11,z),8)
        cylinder('Lantern stem',stone,.13,.19,.92,(x,.7,z),8)
        box('Lantern plinth',stone,(.62,.12,.62),(x,1.24,z))
        box('Lantern warm core','#f8dc96',(.38,.36,.38),(x,1.48,z),bevel=.025)
        for dx in [-.22,.22]:
            for dz in [-.22,.22]:box('Lantern corner mullion',ink,(.05,.4,.05),(x+dx,1.48,z+dz),bevel=.01)
        cylinder('Lantern roof',stone,0,.56,.45,(x,1.91,z),4,rot=(0,PI/4,0))
        sphere('Lantern finial',gold,(x,2.2,z),r=.08)
    beam('Curved crown',ink,[(-3.25,4.91,0),(-2.7,4.75,0),(-1.8,4.62,0),(0,4.53,0),(1.8,4.62,0),(2.7,4.75,0),(3.25,4.91,0)],.23,.67)
    beam('Red crown apron',red,[(-2.75,4.52,0),(-1.8,4.38,0),(0,4.3,0),(1.8,4.38,0),(2.75,4.52,0)],.29,.46)
    box('Tie beam',red,(4.7,.25,.33),(0,3.52,0))
    box('Inscription frame',ink,(.73,1.04,.16),(0,3.98,.28))
    box('Gold tablet',gold,(.53,.78,.04),(0,3.98,.39),bevel=.02)
    curve('Tablet crescent',ink,[(.12,4.19,.423),(-.12,4.19,.423),(-.16,4.0,.423),(.1,3.86,.423)],.035)
    curve('Sacred rope','#d8bf83',[(-1.76,3.16,.26),(-.9,2.93,.3),(0,2.87,.31),(.9,2.93,.3),(1.76,3.16,.26)],.07)
    for x in [-1.05,-.35,.35,1.05]:
        verts=[(x-.085,2.92,.33),(x+.085,2.92,.33),(x+.14,2.69,.33),(x+.02,2.59,.33),(x+.1,2.39,.33),(x-.07,2.36,.33),(x-.17,2.64,.33),(x-.045,2.75,.33)]
        obj=mesh('Folded paper streamer','#f7f1e5',verts,[tuple(range(8))]);mod=obj.modifiers.new('Paper thickness','SOLIDIFY');mod.thickness=.014
    for s in [-1,1]:
        curve('Rope tail','#d8bf83',[(s*1.66,3.18,.26),(s*1.6,2.84,.26),(s*1.62,2.53,.26)],.04)

BUILDERS={name:globals()[name] for name in ['cliff_shrine','giant_conch','watchtower','garden_gazebo','windmill','farm_well','bell_tower','elder_mosstree','bramble_arch','glimmer_spire','sea_arch','sundial','crag_beacon','moonstone','moon_altar','fiddlehead_ferns','moon_mirror','root_arch']}
def export(kind):
    bpy.context.preferences.filepaths.save_version=0
    # Hidden source parts from the preceding export are not selected by Blender's
    # delete operator. Clear datablocks so each source/export contains ONE kind.
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    MATS.clear();BUILDERS[kind]()
    scene=bpy.context.scene;scene['landmark_kind']=kind;scene['game_axes']='X right / Y up / Z forward';scene['export_notes']='Evaluated meshes joined per material and animation pivot. Elder source packs the accepted leaf atlas; game export borrows its cached atlas. Core colliders and placement remain authoritative.'
    scene.world.color=(.18,.22,.26)
    # Keep the editable parts in the source; use evaluated copies in a disposable export collection.
    originals=list(scene.objects);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'),compress=True)
    deps=bpy.context.evaluated_depsgraph_get();groups=defaultdict(list)
    for obj in originals:
        if obj.type not in {'MESH','CURVE'}:continue
        data=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps)
        copy=bpy.data.objects.new(obj.name+'_export',data);scene.collection.objects.link(copy);copy.matrix_world=obj.matrix_world.copy()
        if obj.data.materials[0].name=='Foliage_accepted_leaf_atlas':
            placeholder=material('#ffffff');placeholder.name='Foliage_accepted_leaf_atlas_export'
            if not placeholder.node_tree.nodes.get('AcceptedFoliagePaint'):
                paint=placeholder.node_tree.nodes.new('ShaderNodeVertexColor');paint.name='AcceptedFoliagePaint';paint.layer_name='AcceptedFoliageColor';placeholder.node_tree.links.new(paint.outputs['Color'],placeholder.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
            data.materials.clear();data.materials.append(placeholder)
        else:
            for uv in list(data.uv_layers):data.uv_layers.remove(uv)
        groups[(data.materials[0].name,obj.parent.name if obj.parent else '')].append(copy)
    for obj in originals:obj.hide_set(True);obj.hide_render=True
    joined=[];pivots={}
    for (mat,pivot),objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
        obj.name=(pivot+'_' if pivot else '')+mat;joined.append(obj)
        if pivot:
            if pivot not in pivots:
                source=next(o for o in originals if o.name==pivot);matrix=source.matrix_world.copy();source.name='source-'+pivot
                p=bpy.data.objects.new(pivot,None);scene.collection.objects.link(p);p.matrix_world=matrix;pivots[pivot]=p
            world=obj.matrix_world.copy();obj.parent=pivots[pivot];obj.matrix_world=world
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined:obj.select_set(True)
    for obj in pivots.values():obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(EXPORT,kind+'.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_animations=False,export_extras=True)
    return {'kind':kind,'source':f'assets/blender/landmarks/{kind}.blend','file':f'public/models/landmarks/{kind}.glb','bytes':os.path.getsize(os.path.join(EXPORT,kind+'.glb')),'triangles':sum(len(o.data.loop_triangles) or sum(len(f.vertices)-2 for f in o.data.polygons) for o in joined),'materialGroups':sum(len({f.material_index for f in o.data.polygons}) for o in joined)}
if __name__=='__main__':
    kinds=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(BUILDERS)
    results=[export(kind) for kind in kinds]
    previous={}
    manifest_path=os.path.join(EXPORT,'manifest.json')
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:previous={row['kind']:row for row in json.load(f)['landmarks']}
    previous.update({row['kind']:row for row in results})
    with open(manifest_path,'w') as f:json.dump({'version':1,'blender':'4.3.2','landmarks':[previous[k] for k in BUILDERS if k in previous]},f,indent=2)
    print('LANDMARK_EXPORTS',json.dumps(results))
