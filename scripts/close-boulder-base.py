# The warden's boulder form (assets/meshy/monsters/crag_titan/ball_meshy.glb): Meshy modelled it
# sitting on the ground, so its base was flat and open with gravel round it. This keeps the ball and
# its horn, closes and rounds the base, and paints it the ball's stone colour; then run
# scripts/prep-monster-glb.py on the result (--tris 1600).
#   PYTHONPATH=<bpy dir> python3 scripts/close-boulder-base.py -- <ball_meshy.glb> <out.glb>
import bpy, bmesh, sys
from mathutils import Vector
src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
# pieces, largest first: keep the ball and its horn
seen=set(); parts=[]
for f in bm.faces:
    if f in seen: continue
    comp=[f]; todo=[f]; seen.add(f)
    while todo:
        t=todo.pop()
        for e in t.edges:
            for o in e.link_faces:
                if o not in seen: seen.add(o); comp.append(o); todo.append(o)
    parts.append(comp)
parts.sort(key=len, reverse=True)
drop=[f for c in parts[2:] for f in c]
bmesh.ops.delete(bm, geom=drop, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
# the underside Meshy left open on the ground: close it
open_edges=[e for e in bm.edges if e.is_boundary]
print('open edges', len(open_edges))
before=set(bm.faces)
res=bmesh.ops.holes_fill(bm, edges=open_edges, sides=0)
new=[f for f in bm.faces if f not in before]
bmesh.ops.triangulate(bm, faces=new)
new=[f for f in bm.faces if f not in before]
# give the flat cap inner points, so it can curve with the rest of the ball
for _ in range(2):
    bmesh.ops.subdivide_edges(bm, edges=list({e for f in new for e in f.edges if not e.is_boundary and all(g not in before for g in e.link_faces)}), cuts=1, use_grid_fill=True)
    new=[f for f in bm.faces if f not in before]
    bmesh.ops.triangulate(bm, faces=new)
    new=[f for f in bm.faces if f not in before]
# new faces take the UV of the nearest old face's corner (stone colour round the rim)
uv=bm.loops.layers.uv.active
old=[f for f in bm.faces if f in before]
rim={}
for f in new:
    c=f.calc_center_median()
    best=min((o for o in old for e in o.edges if any(v in f.verts for v in e.verts)), key=lambda o:(o.calc_center_median()-c).length, default=None)
    if best is None: best=min(old, key=lambda o:(o.calc_center_median()-c).length)
    u=best.loops[0][uv].uv.copy()
    for l in f.loops: l[uv].uv=u
print('filled faces', len(new))
# the base Meshy flattened on the ground: round it out, so the boulder rolls as a ball
ballv={v for f in parts[0] if f.is_valid for v in f.verts} | {v for f in new for v in f.verts}
import statistics
xs=[v.co.x for v in ballv]; ys=[v.co.y for v in ballv]; zs=[v.co.z for v in ballv]
c=Vector(((max(xs)+min(xs))/2,(max(ys)+min(ys))/2,0))
R=statistics.median([ (v.co-Vector((c.x,c.y,0))).length for v in ballv if v.co.z>max(zs)-0.35*(max(xs)-min(xs)) ]) if False else (max(xs)-min(xs)+max(ys)-min(ys))/4
c.z=max(zs)-R
zmin=min(zs); ground={v for v in ballv if v.co.z < zmin + 0.13*(max(zs)-zmin)}
for v in ballv:
    d=v.co-c
    if d.z<0:
        k=min(1,(-d.z/(R*0.55))**1.5)
        tgt=c+d.normalized()*R*(0.97+0.03*(1-k))
        v.co=v.co.lerp(tgt,k)
print('ball R',round(R,3),'centre',tuple(round(x,3) for x in c))
bm.normal_update(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# the base never showed in Meshy's picture (gravel round it, then the cap): its texels are painted
# the plain stone colour of the ball, a little darker, so the rolling boulder is stone all round
import numpy as np
img=next(n.image for m in ob.data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)
def tri_mask(f):
    pts=[(l[uv].uv.x%1*W, l[uv].uv.y%1*H) for l in f.loops]
    (x0,y0),(x1,y1),(x2,y2)=pts[:3]
    bx0,bx1=int(max(0,min(x0,x1,x2)-2)),int(min(W,max(x0,x1,x2)+3)); by0,by1=int(max(0,min(y0,y1,y2)-2)),int(min(H,max(y0,y1,y2)+3))
    yy,xx=np.mgrid[by0:by1,bx0:bx1]+0.5
    d=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
    if abs(d)<1e-9: return None
    a=((y1-y2)*(xx-x2)+(x2-x1)*(yy-y2))/d; b=((y2-y0)*(xx-x2)+(x0-x2)*(yy-y2))/d
    return by0,by1,bx0,bx1,(a>-0.1)&(b>-0.1)&(1-a-b>-0.1)
base=[f for f in bm.faces if all(v in ballv for v in f.verts) and (f not in before or all(v in ground for v in f.verts))]
top=[f for f in bm.faces if f in before and f.calc_center_median().z > c.z]
samples=[]
for f in top[::3]:
    r=tri_mask(f)
    if r: y0,y1,x0,x1,m=r; samples.append(px[y0:y1,x0:x1,:3][m])
stone=np.median(np.concatenate(samples),axis=0)*0.72
rng=np.random.default_rng(3)
for f in base:
    r=tri_mask(f)
    if not r: continue
    y0,y1,x0,x1,m=r
    blk=px[y0:y1,x0:x1,:3]; blk[m]=stone*(0.92+0.16*rng.random((int(m.sum()),1)))
img.pixels=px.ravel().tolist()
print('base faces painted', len(base), 'stone', stone.round(3))
bm.to_mesh(ob.data); bm.free()
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92, export_animations=False, export_yup=True)
