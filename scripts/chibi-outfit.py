#!/usr/bin/env python3
"""Paint a Meshy retexture of the chibi body onto the chibi's own UVs (characters.hero_chibi outfits).

A Meshy retexture returns the same mesh scaled into -1..1 with new UVs. Each body triangle is found
in it by position and its new paint is copied into the base texture's layout, so the outfit texture
swaps in on the rigged body. Head triangles keep the base paint (the face).

  python3 scripts/chibi-outfit.py public/models/hero_chibi.glb <retextured.glb> <base_color.png> out.png
  then save as JPEG (quality 88) under public/models/ and list it in hero_chibi.outfits.
"""
import json,struct,io,sys,numpy as np
from PIL import Image
def load(p):
    b=open(p,'rb').read();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);bin_=b[20+jl+8:]
    pr=j['meshes'][0]['primitives'][0]
    def acc(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        dt={5126:np.float32,5123:np.uint16,5125:np.uint32,5121:np.uint8}[a['componentType']]
        x=np.frombuffer(bin_,dt,a['count']*n,v.get('byteOffset',0)+a.get('byteOffset',0));return x.reshape(-1,n) if n>1 else x
    out=dict(P=acc(pr['attributes']['POSITION']).astype(float),UV=acc(pr['attributes']['TEXCOORD_0']).astype(float),I=acc(pr['indices']).astype(int).reshape(-1,3))
    if 'JOINTS_0' in pr['attributes']:
        out['J']=acc(pr['attributes']['JOINTS_0']);out['W']=acc(pr['attributes']['WEIGHTS_0'])
        out['names']=[j['nodes'][k]['name'] for k in j['skins'][0]['joints']]
        img=j['images'][0];v=j['bufferViews'][img['bufferView']];out['tex']=Image.open(io.BytesIO(bin_[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')
    return out
src,new,newtex,dst=sys.argv[1:5]
A=load(src);B=load(new);T=np.asarray(Image.open(newtex).convert('RGB')).astype(float)
base=A['tex'];N=base.size[0];out=np.asarray(base).astype(float).copy();Th,Tw=T.shape[:2]
# B is A scaled into -1..1 (height 1.2 -> 2, centred)
sc=2.0/(A['P'][:,1].max()-A['P'][:,1].min());cy=(A['P'][:,1].max()+A['P'][:,1].min())/2
PA=(A['P']-[0,cy,0])*sc
key=lambda p:tuple(np.round(p,3))
tb={}
for t in B['I']:
    tb[tuple(sorted(key(B['P'][x]) for x in t))]=t
head=A['names'].index('Head');dom=A['J'][np.arange(len(A['J'])),A['W'].argmax(1)]
miss=0;painted=np.zeros((N,N),bool)
for t in A['I']:
    if any(dom[x]==head for x in t): continue   # keep the face and head paint
    k=tuple(sorted(key(PA[x]) for x in t))
    tB=tb.get(k)
    if tB is None: miss+=1;continue
    # order B's vertices to match A's
    bmap={key(B['P'][x]):x for x in tB};ob=[bmap[key(PA[x])] for x in t]
    ua=A['UV'][t]*N;ub=B['UV'][ob]*[Tw,Th]
    x0,y0=np.floor(ua.min(0)).astype(int)-1;x1,y1=np.ceil(ua.max(0)).astype(int)+1
    x0,y0=max(x0,0),max(y0,0);x1,y1=min(x1,N-1),min(y1,N-1)
    if x1<x0 or y1<y0: continue
    xs,ys=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    a,b_,c=ua;M=np.array([[b_[0]-a[0],c[0]-a[0]],[b_[1]-a[1],c[1]-a[1]]])
    if abs(np.linalg.det(M))<1e-9: continue
    Mi=np.linalg.inv(M);dx=xs-a[0];dy=ys-a[1]
    l1=Mi[0,0]*dx+Mi[0,1]*dy;l2=Mi[1,0]*dx+Mi[1,1]*dy;l0=1-l1-l2
    e=-1.5/max(1.0,np.abs(M).max())  # a pixel or so of margin so seams are covered
    inside=(l0>=e)&(l1>=e)&(l2>=e)
    if not inside.any(): continue
    sx=(l0*ub[0,0]+l1*ub[1,0]+l2*ub[2,0]);sy=(l0*ub[0,1]+l1*ub[1,1]+l2*ub[2,1])
    sx=np.clip(sx,0,Tw-1).astype(int);sy=np.clip(sy,0,Th-1).astype(int)
    yy,xx=np.nonzero(inside)
    out[y0+yy,x0+xx]=T[sy[inside],sx[inside]];painted[y0+yy,x0+xx]=True
print('triangles not found',miss,'pixels painted',int(painted.sum()))
Image.fromarray(out.clip(0,255).astype(np.uint8)).save(dst)
