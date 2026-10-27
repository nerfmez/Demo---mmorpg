# Clean the Travel Tunic's painted neck and sleeve ends (public/models/outfits/travel_tunic.glb, made by
# scripts/fit-chibi-outfit.py from assets/meshy/outfits/travel.json). The generated paint there is a
# blur: the neck of the generated chibi and a dark smear inside the V, and the arm's skin on the cuffs.
# Every texel the neck and sleeve triangles use is placed in 3D (barycentric over its UV triangle)
# and repainted by where it lies: the standing collar round the neck even teal, the V opening even
# skin (the body's painted skin under the hero tint), the lapels' ragged teal smoothed in 3D, the cuff an even
# teal band and the sleeve inside it cream. Run after re-fitting the outfit:
#   python3 scripts/clean-travel-tunic.py public/models/outfits/travel_tunic.glb public/models/outfits/travel_tunic.glb
# Needs numpy and Pillow. Heights are in the fitted tunic's bind space (chibi metres, T-pose).
import sys, io, json, struct
import numpy as np
from PIL import Image, ImageDraw
class GLB:
    def __init__(s,f):
        d=open(f,'rb').read(); jl=struct.unpack('<I',d[12:16])[0]; s.j=json.loads(d[20:20+jl]); s.b=d[20+jl+8:]
    def acc(s,i):
        a=s.j['accessors'][i]; bv=s.j['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]; dt={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8}[a['componentType']]
        x=np.frombuffer(s.b,dt,a['count']*n,o); return x.reshape(-1,n) if n>1 else x
    def image(s,k=0):
        im=s.j['images'][k]; bv=s.j['bufferViews'][im['bufferView']]; o=bv.get('byteOffset',0)
        return Image.open(io.BytesIO(s.b[o:o+bv['byteLength']])).convert('RGB')

def write_glb(g, path, image_bytes, k=0, mime='image/jpeg'):
    """Write g with image k's bytes replaced (buffer views repacked, 4-byte aligned)."""
    import copy
    j=copy.deepcopy(g.j); ivb=j['images'][k]['bufferView']; j['images'][k]['mimeType']=mime
    out=bytearray()
    for i,bv in enumerate(j['bufferViews']):
        o=bv.get('byteOffset',0); data=image_bytes if i==ivb else g.b[o:o+bv['byteLength']]
        while len(out)%4: out.append(0)
        bv['byteOffset']=len(out); bv['byteLength']=len(data); out+=data
    while len(out)%4: out.append(0)
    j['buffers'][0]['byteLength']=len(out)
    js=json.dumps(j,separators=(',',':')).encode()
    while len(js)%4: js+=b' '
    total=12+8+len(js)+8+len(out)
    with open(path,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,total)); f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II',len(out),0x004E4942)); f.write(out)

def texel_positions(P, UV, I, tris, W, H):
    """Arrays (ys, xs, pos[n,3], tri[n]) for every texel centre inside the UV triangles `tris`."""
    Y=[];X=[];POS=[];T=[]
    for t in tris:
        uv=UV[I[t]]*[W,H]; p=P[I[t]]
        x0,y0=np.floor(uv.min(0)).astype(int); x1,y1=np.ceil(uv.max(0)).astype(int)
        xs,ys=np.meshgrid(np.arange(x0,x1+1),np.arange(y0,y1+1)); q=np.stack([xs.ravel()+0.5,ys.ravel()+0.5],1)
        a,b,c=uv; v0=b-a; v1=c-a; v2=q-a
        d=v0[0]*v1[1]-v1[0]*v0[1]
        if abs(d)<1e-9: continue
        l1=(v2[:,0]*v1[1]-v1[0]*v2[:,1])/d; l2=(v0[0]*v2[:,1]-v2[:,0]*v0[1])/d; l0=1-l1-l2
        e=-0.02  # a texel's width over the edge too (no seam of old paint at the triangle's border)
        ok=(l0>=e)&(l1>=e)&(l2>=e)&(q[:,0]>=0)&(q[:,1]>=0)&(q[:,0]<W)&(q[:,1]<H)
        L=np.stack([l0,l1,l2],1)[ok]; Y.append(np.floor(q[ok,1]).astype(int)); X.append(np.floor(q[ok,0]).astype(int)); POS.append(L@p); T.append(np.full(ok.sum(),t))
    return np.concatenate(Y),np.concatenate(X),np.concatenate(POS),np.concatenate(T)

g=GLB(sys.argv[1]); p=g.j['meshes'][0]['primitives'][0]
P=g.acc(p['attributes']['POSITION']); UV=g.acc(p['attributes']['TEXCOORD_0']); I=g.acc(p['indices']).reshape(-1,3)
img=np.asarray(g.image()).astype(float)/255.; H,W=img.shape[:2]
c=P[I].mean(1)
lum=lambda x: x@[0.299,0.587,0.114]
is_cream=lambda x: (x.min(-1)>0.72)&(x[...,0]-x[...,2]<0.16)
is_teal=lambda x: (x[...,1]-x[...,0]>0.1)
is_brown=lambda x: ((x[...,0]-x[...,2])>0.2)&(x.max(-1)<0.65)&(x[...,0]>x[...,1])
is_skin=lambda x: (x[...,0]>0.7)&(x[...,0]-x[...,2]>0.18)&(x[...,1]>x[...,2]+0.02)&(x[...,1]<0.88*x[...,0])
skin=np.array([254,237*0.9,212*0.8])/255.
out=img.copy()
def texels(sel):
    ys,xs,pos,tt=texel_positions(P,UV,I,np.where(sel)[0],W,H); return ys,xs,pos
# owners: a texel drawn by triangles of two regions keeps its paint
# neck and chest
ys,xs,pos=texels((c[:,1]>0.72)&(np.abs(c[:,0])<0.16))
col=img[ys,xs]; x,y,z=pos.T; zc=0.0069
teal_px=is_teal(col)&(y>0.76)
teal=np.median(col[teal_px],0); tl=np.median(lum(col[teal_px]))
shade=lambda v: np.clip(lum(v)/tl,0.85,1.1)[:,None]
ring=(y>0.835)&(np.hypot(x,z-zc)<0.08)
dy=y-0.7675; V=(z>zc)&(dy>0)&(np.abs(x+0.003)<np.minimum(0.4*dy,0.021))&~ring&~is_brown(col)
# the lapels: teal where most of the paint within LAPEL_BLUR in 3D is teal (or the dark smears
# inside it), else the shirt's cream: the painted shapes kept, their ragged edges made clean
LAPEL_BLUR, VOX = 0.006, 0.002
region=(y>0.74)&(np.abs(x)<0.16)&~V&~ring&~is_brown(col)&~((y<0.785)&(np.abs(x)<0.035))  # not the toggle
src_teal=(is_teal(col)|(lum(col)<0.5))&~is_brown(col)
lo=pos.min(0); vi=np.floor((pos-lo)/VOX).astype(int); dims=vi.max(0)+2
num=np.zeros(dims); den=np.zeros(dims)
np.add.at(num,tuple(vi.T),src_teal.astype(float)); np.add.at(den,tuple(vi.T),1.0)
def box(a, r):
    for ax in range(3):
        a=np.cumsum(np.pad(a,[(r+1,r) if k==ax else (0,0) for k in range(3)]),axis=ax)
        sl=lambda lo,hi: tuple(slice(lo,hi) if k==ax else slice(None) for k in range(3))
        a=a[sl(2*r+1,None)]-a[sl(0,-(2*r+1))]
    return a
rv=int(round(LAPEL_BLUR/VOX)); grid=box(num,rv)/np.maximum(box(den,rv),1e-9)
# read trilinearly at each texel and blended over a narrow band: a smooth edge, no voxel steps
f=(pos-lo)/VOX-0.5; i0=np.clip(np.floor(f).astype(int),0,dims-2); t=np.clip(f-i0,0,1); frac=0
for dx in (0,1):
    for dy_ in (0,1):
        for dz in (0,1):
            w_=(t[:,0] if dx else 1-t[:,0])*(t[:,1] if dy_ else 1-t[:,1])*(t[:,2] if dz else 1-t[:,2])
            frac=frac+w_*grid[i0[:,0]+dx,i0[:,1]+dy_,i0[:,2]+dz]
a=np.clip((frac-0.4)/0.2,0,1)[:,None]; a=a*a*(3-2*a)
cream0=np.median(col[region&is_cream(col)],0)
paint=region&((a[:,0]>0)|src_teal|~is_cream(col))
out[ys[ring],xs[ring]]=teal*shade(col[ring])
out[ys[paint],xs[paint]]=(cream0*(1-a)+teal*shade(col)*a)[paint]
out[ys[V],xs[V]]=skin
print('teal',np.round(teal*255),'ring',ring.sum(),'V',V.sum(),'lapels',paint.sum())
# sleeve ends: the arm's skin painted on the cuff
ys,xs,pos=texels((c[:,1]>0.68)&(np.abs(c[:,0])>0.14))
# the cuff an even teal band from where the generated paint turns teal (|x| 0.174 m in the T-pose),
# the sleeve inside it cream: its jagged teal strokes and the arm's skin gone
col=img[ys,xs]; ax=np.abs(pos[:,0])
cuff=ax>=0.174; out[ys[cuff],xs[cuff]]=teal*shade(col[cuff])
cloth=(ax>=0.15)&~cuff&~is_cream(col); cream=np.median(img[ys[(ax>0.13)&(ax<0.15)],xs[(ax>0.13)&(ax<0.15)]],0)
out[ys[cloth],xs[cloth]]=cream
print('cuff',cuff.sum(),'sleeve strokes',cloth.sum(),'cream',np.round(cream*255))
# bleed the new paint a few texels past its islands' borders (bilinear and mip samples reach there)
cov=Image.new('L',(W,H),0); d=ImageDraw.Draw(cov)
for t in range(len(I)): d.polygon([(u*W,v*H) for u,v in UV[I[t]]],fill=255)
free=np.asarray(cov)==0; painted=np.abs(out-img).sum(-1)>1e-6
for _ in range(4):
    for dy,dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
        src=np.roll(painted,(dy,dx),(0,1)); dst=free&~painted&src
        out[dst]=np.roll(out,(dy,dx),(0,1))[dst]; painted|=dst
b=io.BytesIO(); Image.fromarray((np.clip(out,0,1)*255).round().astype(np.uint8)).save(b,'JPEG',quality=80)  # about the source's own quality
write_glb(g,sys.argv[2],b.getvalue())
