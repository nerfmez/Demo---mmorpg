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
    sphere(name+' centre','#e9bc66',at,r=r*.3,segments=8,rings=4)
    for i in range(5):
        a=i*2*PI/5;sphere(name+' petal',col,(at[0]+math.sin(a)*r*.5,at[1],at[2]+math.cos(a)*r*.5),size=(1,.35,1),r=r*.6,segments=8,rings=4)

def giant_conch():
    shell='#e9d1ad';band='#d6a77f';lip='#ecaaa0';dark='#765750'
    # Open shell, with a thick rosy aperture rather than a painted sphere.
    profile=[(-2.9,.025),(-2.55,.22),(-2.0,.48),(-1.45,.77),(-.8,1.05),(-.15,1.32),(.45,1.5),(.9,1.38),(1.25,1.16)]
    verts=[];n=24
    for z,r in profile:
        for i in range(n):
            a=2*PI*i/n;verts.append((math.sin(a)*r,1.5+math.cos(a)*r,z))
    faces=[]
    for k in range(len(profile)-1):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    body=mesh('Sun bleached shell body',shell,verts,faces)
    for f in body.data.polygons:f.use_smooth=True
    for k,(z,r) in enumerate(profile[1:-2]):
        pts=[(math.sin(i*2*PI/24)*r,1.5+math.cos(i*2*PI/24)*r,z+.12*math.sin(i*2*PI/24)) for i in range(25)]
        obj=curve('Spiral growth ridge',band,pts,.055);obj.data.resolution_u=1
    ring('Rosy rolled aperture',lip,(0,1.5,1.27),1.15,.16,'vertical')
    ring('Inner shell rim',shell,(0,1.5,1.15),.96,.035,'vertical')
    cylinder('Recessed aperture',dark,.96,.92,.055,(0,1.5,.75),24,rot=(PI/2,0,0),bevel=0)
    for i in range(7):
        a=2*PI*i/7;r=1.35;cylinder('Shell shoulder spine',shell,.01,.14,.55,(math.sin(a)*r,1.5+math.cos(a)*r,.35),8,rot=(PI/2-a,0,0),bevel=0)
    for x,z in [(2.1,1.7),(-2.1,.6),(1.7,-1.8)]:sphere('Tide pebble','#c9bea3',(x,.07,z),size=(1.3,.3,1),r=.23)
    for i in range(5):a=i*2*PI/5;leaf('Starfish arm','#ce805d',(2.5,.06,1.6),(2.5+math.sin(a)*.6,.08,1.6+math.cos(a)*.6),.16)

def watchtower():
    wood='#9b7148';dark='#584631';roofcol='#476d4d'
    for x in [-1.2,1.2]:
        for z in [-1.2,1.2]:
            beam('Ranger splayed leg',wood,[(x*1.13,0,z*1.13),(x,5.8,z)],.24,.24)
            box('Lookout roof post',dark,(.15,1.7,.15),(x,6.75,z))
    for z in [-1.2,1.2]:
        for s in [-1,1]:beam('Structural cross brace',dark,[(s*1.28,1.3,z),(-s*1.2,4.7,z)],.13,.13)
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

def garden_gazebo():
    ivory='#e8e1cf';rose='#b96476';wood='#8c684c';leafcol='#476c42'
    cylinder('Rose pavilion footing','#bfb8a3',2.94,3,.25,(0,.125,0),6,rot=(0,PI/6,0))
    for i in range(6):
        a=i*PI/3;x=math.sin(a)*2.4;z=math.cos(a)*2.4
        cylinder('Pavilion column',ivory,.13,.15,2.65,(x,1.56,z),12)
        cylinder('Pavilion column capital',ivory,.21,.21,.16,(x,2.89,z),8)
        if i!=0:
            b=a+PI/6;box('Low garden rail',ivory,(2.26,.1,.1),(math.sin(b)*2.08,.98,math.cos(b)*2.08),rot=(0,b+PI/2,0))
        curve('Climbing rose vine',leafcol,[(x,.35,z),(x+.12,1,z+.1),(x-.1,1.8,z+.15),(x,2.7,z)],.04)
        for k in range(3):
            y=.7+k*.75;leaf('Rose foliage',leafcol,(x,y,z),(x+.4,y+.12,z+.2),.14)
            if i%2==0:flower('Garden rose',(x-.1,y+.28,z+.15),.16,rose)
    roof('Rose pavilion swept canopy',rose,3.32,3,2.12,6)
    cylinder('Pavilion gold finial','#cba65d',0,.14,.55,(0,5.38,0),10,bevel=0)
    ring('Eaves bead',ivory,(0,3.0,0),3.2,.06)
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
    wood='#795b3e';stone='#aaa793';red='#a45542';brass='#c6a15b'
    box('Bell tower stone foundation',stone,(2.55,.9,2.55),(0,.45,0),bevel=.1)
    for x in [-1,1]:
        for z in [-1,1]:box('Bell frame post',wood,(.24,5.1,.24),(x,3.42,z))
    for y in [1.45,4.25,5.96]:
        for s in [-1,1]:box('Bell frame collar',wood,(2.34,.16,.2),(0,y,s));box('Bell frame collar',wood,(.2,.16,2.34),(s,y,0))
    for s in [-1,1]:beam('Bell frame diagonal',wood,[(s*.9,1.45,1),(-s*.9,4.25,1)],.13,.13)
    roof('Bell tower swept roof',red,2.05,6.02,1.65,4)
    cylinder('Bronze finial',brass,0,.14,.58,(0,7.93,0),10)
    # Open lathed bell with a visible lip and dark clapper.
    rings=[(.6,4.55),(.49,4.7),(.35,5.12),(.3,5.5),(.17,5.67)];verts=[];n=24
    for r,y in rings:
        for i in range(n):a=i*2*PI/n;verts.append((math.sin(a)*r,y,math.cos(a)*r))
    faces=[]
    for k in range(4):
        for i in range(n):a=k*n+i;b=k*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    obj=mesh('Cast bronze open bell',brass,verts,faces);mod=obj.modifiers.new('Bell wall','SOLIDIFY');mod.thickness=.045
    ring('Bell rolled lip',brass,(0,4.55,0),.6,.06);sphere('Bell clapper','#5b4c37',(0,4.46,0),r=.1)
    box('Bell hanging crossbar',wood,(.2,.18,1.96),(0,5.87,0))

def elder_mosstree():
    bark='#70533b';moss='#4d7044';green='#557d46'
    curve('Gnarled elder trunk',bark,[(0,-.2,0),(-.2,1.4,.1),(.18,3.3,0),(-.12,5.8,-.1)],.82)
    for i,(x,z)in enumerate([(2.9,1.2),(-2.6,1.8),(.6,-3),(-1.8,-1.8)]):
        curve('Elder buttress root',bark,[(0,1.4,0),(x*.5,.3,z*.5),(x,.03,z)],.32)
        curve('Root moss ridge',moss,[(0,1.5,.12),(x*.5,.6,z*.5),(x,.3,z)],.065)
    for i in range(6):
        a=i*PI/3;tip=(math.sin(a)*3.2,6.3+(i%2)*.45,math.cos(a)*3.2)
        curve('Elder crown branch',bark,[(0,3.1,0),(tip[0]*.46,4.8,tip[2]*.46),tip],.23)
        for j in range(2):
            sphere('Layered elder crown',green if j==0 else '#6e914d',(tip[0]*.8,tip[1]+j*.6,tip[2]*.8),(1.6,.56,1.35),r=1.25)
    sphere('Elder central crown','#6e914d',(0,7.3,0),(1.7,.62,1.6),r=1.2)
    for i in range(4):
        a=i*PI/2;x=math.sin(a)*2.2;z=math.cos(a)*2.2;curve('Trailing elder moss','#7c9657',[(x,6.1,z),(x+.14,5.3,z),(x,4.35,z+.2)],.045)
    for x,z in [(-.8,.65),(.55,.8)]:cylinder('Trunk shelf fungus','#c09168',0,.34,.16,(x,1.25,z),10)

def bramble_arch():
    bark='#664d37';leafcol='#45623c';berry='#a95f69'
    for s in [-1,1]:curve('Twisted bramble arch',bark,[(s*2.6,-.2,0),(s*2.5,1.7,.14),(s*1.7,3.5,.1),(0,4.24,.08)],.32)
    for i in range(13):
        a=i*PI/12;x=-math.cos(a)*2.6;y=math.sin(a)*4.1
        for s in [-1,1]:leaf('Bramble spear foliage','#5b7d45',(x,y,s*.23),(x+.75*math.cos(a),y+.55,s*.75),.27)
        if i%3==0:
            cylinder('Bramble thorn','#ad9674',0,.065,.28,(x,y,.42),6,rot=(PI/2,0,0),bevel=0)
            sphere('Bramble berry',berry,(x,y+.15,.28),r=.11)
    for s in [-1,1]:curve('Bramble root',bark,[(s*2.6,.5,0),(s*3.1,.15,.6),(s*3.35,0,.9)],.12)

def glimmer_spire():
    dark='#5c596b';stone='#928ba1';blue='#74afb6';light='#b8d7d7'
    cylinder('Crystal bedrock',stone,.95,1.35,.45,(0,.22,0),7,rot=(0,.25,0))
    for x,z,h,r,rot in [(0,0,5.5,.95,.12),(2.1,1,1.7,.38,-.24),(-1.9,1.4,2.2,.46,.25)]:
        cylinder('Glimmer crystal shaft',blue,r*.78,r,h*.7,(x,h*.35+.2,z),6,rot=(0,.25,rot),bevel=0)
        cylinder('Glimmer crystal point',light,0,r*.79,h*.35,(x+math.sin(-rot)*h*.47,h*.875+.18,z),6,rot=(0,.25,rot),bevel=0)
        ring('Crystal grounding seam',dark,(x,.18,z),r*.9,.045)
    curve('Inlaid spire rune',light,[(-.14,1.2,.89),(.2,1.7,.86),(-.15,2.2,.82),(.17,2.7,.8)],.028)

def sea_arch():
    stone='#b7af98';shade='#8e998c'
    pts=[]
    for i in range(13):a=i*PI/12;pts.append((-math.cos(a)*3.3,math.sin(a)*4.55-.3,0))
    obj=curve('Weathered coastal arch',stone,pts,1.05)
    for i,p in enumerate(obj.data.splines[0].bezier_points):p.radius=[1.0,.98,.9,1.04,1.02,.88,1.02,1.09,.96,1.0,.88,1.04,1][i];p.tilt=.17*math.sin(i)
    for s in [-1,1]:sphere('Coastal arch foot',shade,(s*3.3,.2,0),(1.1,.6,1),r=1.2)
    for i in [1,3,6,9,11]:
        x,y,z=pts[i];curve('Coastal strata seam',shade,[(x-.15,y-.12,.99),(x+.03,y+.08,1.03),(x+.2,y+.12,.97)],.045)
    for x,z in [(-3.5,.6),(3.1,-.5)]:leaf('Arch sea grass','#658568',(x,.4,z),(x+.4,1.25,z+.2),.22)

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
    stone='#a49d8b';dark='#787e76';iron='#45494d'
    for k in range(6):
        r=1.63-k*.155;cylinder('Beacon masonry course',stone if k%2==0 else dark,r*.93,r,.7,(0,.35+k*.7,0),10,rot=(0,k*.17,0),bevel=.07)
    cylinder('Beacon iron fire bowl',iron,.84,.46,.6,(0,4.53,0),16)
    for i in range(5):
        a=i*2*PI/5;x=math.sin(a)*.32;z=math.cos(a)*.32
        obj=curve('Sculpted amber flame','#dc903f',[(x,4.65,z),(x*.7,5.2,z+.04),(x+.16,5.65+(i%2)*.22,z)],.15,'#c17725')
        for p,r in zip(obj.data.splines[0].bezier_points,[1,.8,.02]):p.radius=r
    obj=curve('Beacon flame core','#f5ce78',[(0,4.7,0),(-.1,5.4,.05),(.06,5.96,0)],.19,'#dfa350')
    for p,r in zip(obj.data.splines[0].bezier_points,[1,.8,.02]):p.radius=r
    cylinder('Beacon pennant mast','#74573b',.045,.06,2.8,(1.4,1.4,.7),8,bevel=0)
    mesh('Blue forked beacon pennant','#497488',[(1.4,2.7,.7),(1.4,2.63,1.55),(1.4,2.38,1.3),(1.4,2.13,1.55),(1.4,2.12,.7)],[(0,1,2,3,4)])

def moonstone():
    stone='#bccbd1';light='#d6e1dc';ink='#526f7d'
    cylinder('Moonstone bedrock','#939b99',1.03,1.13,.23,(0,.11,0),12)
    cylinder('Moonstone monolith',stone,.47,.72,3.25,(0,1.82,0),7,rot=(0,.18,-.04),bevel=.07)
    cylinder('Moonstone broken crest',light,0,.47,.62,(.07,3.72,0),7,rot=(0,.18,-.04),bevel=.025)
    for s in [-1,1]:crescent('Moonstone crescent inlay','#7faec4',(0,2.56,s*.61),.35,.055,PI,'#4c7387')
    for s in [-1,1]:curve('Monolith narrow incision',ink,[(s*.16,.65,.7),(s*.16,1.15,.67)],.025)
    for i in [0,2,4]:
        a=i*PI/3;x=math.sin(a)*.85;z=math.cos(a)*.85
        cylinder('Moonstone votive','#d5cba8',.055,.06,.18,(x,.32,z),8,bevel=0)
        sphere('Votive flame','#e8c779',(x,.45,z),(.5,1,.5),r=.055)

def moon_altar():
    stone='#c3c5cf';shadow='#888e9f';silver='#d6e1e7'
    cylinder('Altar foundation',shadow,1.6,1.76,.3,(0,.15,0),16)
    cylinder('Altar second tier',stone,1.3,1.42,.22,(0,.41,0),16)
    ring('Altar engraved circular band',silver,(0,.54,0),1.11,.035)
    box('Crescent plinth',stone,(.6,.66,.58),(0,.88,0),bevel=.06)
    crescent('Carved rising crescent',silver,(0,2.31,0),.98,.2,PI,'#59647e')
    sphere('Moon altar floating pearl','#d5e6ee',(-.22,2.3,.05),r=.23,glow='#7c9faf')
    for s in [-1,1]:box('Altar front step',shadow,(.78,.1,.4),(s*.55,.05,1.8),rot=(0,s*.22,0))

def fiddlehead_ferns():
    stem='#527d46';young='#89ad5b';green='#668f4b'
    for x,z,h in [(0,0,4.25),(1.7,.8,3.15),(-1.5,1.1,3.55)]:
        pts=[(x,0,z),(x-.15,h*.4,z),(x+.05,h*.8,z)]
        for i in range(25):
            a=i/24*PI*2.7;r=.69*(1-i/28);pts.append((x+.69+math.sin(a)*r,h+math.cos(a)*r,z))
        curve('Unfurling fern crozier',stem,pts[:7],.13)
        curve('Young curl crown',young,pts[6:],.14)
        for i in range(7):y=.5+i*h*.085;leaf('Crozier young leaflet',young,(x,y,z),(x+(-1 if i%2 else 1)*.27,y+.08,z+.16),.07)
    for i in range(7):
        a=i*2*PI/7;length=2.4;x=math.sin(a)*length;z=math.cos(a)*length
        curve('Fern mature frond stem',stem,[(0,.12,0),(x*.5,.7,z*.5),(x,.5,z)],.035)
        for k in range(6):
            t=.2+k*.12;w=.85*(1-t*.5)
            for s in [-1,1]:leaf('Pointed fern pinna',green,(x*t,.3+.4*math.sin(t*PI),z*t),(x*t+math.cos(a)*s*w,.5+.4*math.sin(t*PI),z*t-math.sin(a)*s*w),.19)

def moon_mirror():
    stone='#b7b8c7';dark='#747d90';glass='#91b9c9';silver='#d4dee1'
    box('Moon mirror low foundation',dark,(1.75,.28,.83),(0,.14,0),bevel=.06)
    box('Moon mirror pedestal',stone,(1.15,.43,.55),(0,.5,0),bevel=.04)
    ring('Moon mirror carved surround',stone,(0,2.06,0),1.24,.135,'vertical')
    cylinder('Opaque moon glass',glass,1.09,1.09,.06,(0,2.06,0),40,rot=(PI/2,0,0),bevel=0)
    for s in [-1,1]:
        cylinder('Mirror slender support',stone,.11,.14,1.56,(s*1.16,1.1,0),12)
        leaf('Carved lunar moth upper wing',silver,(0,3.22,.04),(s*.9,3.78,.04),.25)
        leaf('Carved lunar moth lower wing',silver,(0,3.22,.03),(s*.64,3.12,.03),.18)
    for s in [-1,1]:curve('Mirror diagonal glint','#d2e6e8',[(-.59,1.42,s*.052),(-.12,2.17,s*.052),(.4,2.9,s*.052)],.035)
    sphere('Moth body',dark,(0,3.37,.04),(.6,1.7,.5),r=.1)

def root_arch():
    bark='#78553a';dark='#4d3d2e';moss='#657d45'
    for radius,h,z,r in [(3.4,4.3,0,.69),(2.75,3.35,.75,.31)]:
        pts=[(-math.cos(i*PI/16)*radius,math.sin(i*PI/16)*h-.25,z+.19*math.sin(i*PI/5)) for i in range(17)]
        curve('Gnarled moonroot arch',bark if r>.5 else dark,pts,r)
        curve('Root arch longitudinal grain',dark,[(x,y+.2,zz+.55) for x,y,zz in pts],.045)
    for s in [-1,1]:
        for i in range(3):curve('Moonroot spreading toe',dark,[(s*3.4,.55,0),(s*(3.7+i*.18),.22,.3+i*.25),(s*(4+i*.28),0,.7+i*.4)],.12)
    for x,z,r in [(-1.2,2.4,.8),(1.9,-2.1,.7),(-2.4,-2.5,.56)]:
        sphere('Burrow earth mound','#8c7252',(x,0,z),(1.2,.5,1),r=r)
        sphere('Burrow recessed mouth',dark,(x,.2,z+r*.76),(.6,.5,.14),r=r*.6)
    for i in range(7):
        a=i*PI/6;x=-math.cos(a)*3.4;y=math.sin(a)*4.3+.45;leaf('Root arch moss blade',moss,(x,y,0),(x+.2,y+.3,.3),.16)
    for x,z in [(-1.7,.8),(1.8,.6),(.5,-1.7)]:
        cylinder('Moonroot mushroom stalk','#d3c6bb',.04,.05,.23,(x,.12,z),8,bevel=0)
        sphere('Moonroot mushroom cap','#9978a2',(x,.27,z),(1,.43,1),r=.17)

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
    scene=bpy.context.scene;scene['landmark_kind']=kind;scene['game_axes']='X right / Y up / Z forward';scene['export_notes']='No textures; evaluated meshes joined per material and animation pivot. Core colliders and placement remain authoritative.'
    scene.world.color=(.18,.22,.26)
    # Keep the editable parts in the source; use evaluated copies in a disposable export collection.
    originals=list(scene.objects);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'),compress=True)
    deps=bpy.context.evaluated_depsgraph_get();groups=defaultdict(list)
    for obj in originals:
        if obj.type not in {'MESH','CURVE'}:continue
        data=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps)
        copy=bpy.data.objects.new(obj.name+'_export',data);scene.collection.objects.link(copy);copy.matrix_world=obj.matrix_world.copy()
        groups[(obj.data.materials[0].name,obj.parent.name if obj.parent else '')].append(copy)
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
    bpy.ops.export_scene.gltf(filepath=os.path.join(EXPORT,kind+'.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=False,export_animations=False,export_extras=True)
    return {'kind':kind,'source':f'assets/blender/landmarks/{kind}.blend','file':f'public/models/landmarks/{kind}.glb','bytes':os.path.getsize(os.path.join(EXPORT,kind+'.glb')),'triangles':sum(len(o.data.loop_triangles) or sum(len(f.vertices)-2 for f in o.data.polygons) for o in joined),'materialGroups':len(joined)}
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
