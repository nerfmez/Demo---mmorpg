#!/usr/bin/env python3
"""Keep only the hair of a Meshy head-with-hair GLB (characters.hero_chibi_hair).

The mesh is one primitive; the hair is its own connected piece. Pieces whose texture is mostly
grey (low saturation, or dark lines) are kept; the skin-coloured head is dropped. The texture is
resized to 1024 px.

  python3 scripts/prep-chibi-hair.py <meshy retextured.glb> public/models/hero_chibi_hair.glb
"""
import io
import json
import struct
import sys
import tempfile
from collections import defaultdict

from PIL import Image

def split(src, keepf):
    b=open(src,'rb').read();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);off=20+jl;bl=struct.unpack_from('<I',b,off)[0];bin_=b[off+8:off+8+bl]
    def acc(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];o=v.get('byteOffset',0)+a.get('byteOffset',0)
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']]
        sz=struct.calcsize(fmt);stride=v.get('byteStride',sz*n)
        return [struct.unpack_from('<'+fmt*n,bin_,o+k*stride) for k in range(a['count'])]
    p=j['meshes'][0]['primitives'][0];P=acc(p['attributes']['POSITION']);UV=acc(p['attributes']['TEXCOORD_0']);I=[t[0] for t in acc(p['indices'])]
    img=j['images'][0];v=j['bufferViews'][img['bufferView']];tex=Image.open(io.BytesIO(bin_[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB');W,H=tex.size
    def hairish(u,w):
        r,g,bb=tex.getpixel((min(W-1,int(u*W)%W),min(H-1,int(w*H)%H)))
        mx,mn=max(r,g,bb),min(r,g,bb)
        return (mx-mn)<28 or mx<110  # grey or dark line, skin is warm/saturated
    hv=[hairish(*uv) for uv in UV]
    # connected components by welded position
    key={};comp=list(range(len(P)))
    def f(x):
        while comp[x]!=x: comp[x]=comp[comp[x]];x=comp[x]
        return x
    def u(a,c): comp[f(a)]=f(c)
    for i,q in enumerate(P):
        k=tuple(round(c,5) for c in q)
        if k in key: u(i,key[k])
        else: key[k]=i
    tris=[I[k:k+3] for k in range(0,len(I),3)]
    for t in tris: u(t[0],t[1]);u(t[1],t[2])
    # per piece: triangle count, grey share, highest point; a hair piece is mostly grey and reaches
    # the upper half (a white collar is grey too but sits at the bottom)
    cs=defaultdict(lambda:[0,0,-1e9])
    ymid=(min(q[1] for q in P)+max(q[1] for q in P))/2
    for t in tris:
        r=f(t[0]);cs[r][0]+=1;cs[r][1]+=sum(hv[x] for x in t)/3;cs[r][2]=max(cs[r][2],*(P[x][1] for x in t))
    print('components',len(cs),sorted([(n,round(h/n,2),round(y,2)) for n,h,y in cs.values()],reverse=True)[:10])
    hair=lambda c:c[1]/c[0]>0.8 and c[2]>ymid
    keep=[t for t in tris if hair(cs[f(t[0])])] if len(cs)>1 else None
    if keep is None or len(keep)<len(tris)*0.2:
        keep=[t for t in tris if sum(hv[x] for x in t)>=2]
        print('by color',len(keep),'of',len(tris))
    else: print('by component',len(keep),'of',len(tris))
    json.dump({'keep':[x for t in keep for x in t]},open(keepf,'w'))
    

def write(src, keepf, dst):
    b=open(src,'rb').read();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);off=20+jl;bl=struct.unpack_from('<I',b,off)[0];bin_=b[off+8:off+8+bl]
    def raw(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];o=v.get('byteOffset',0)+a.get('byteOffset',0)
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H',5125:'I'}[a['componentType']]
        return [struct.unpack_from('<'+fmt*n,bin_,o+k*struct.calcsize(fmt)*n) for k in range(a['count'])]
    p=j['meshes'][0]['primitives'][0]
    keep=json.load(open(keepf))['keep'];used=sorted(set(keep));remap={o:n for n,o in enumerate(used)}
    attrs={k:raw(i) for k,i in p['attributes'].items()}
    img=j['images'][0];v=j['bufferViews'][img['bufferView']];tex=Image.open(io.BytesIO(bin_[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')
    if tex.width>1024: tex=tex.resize((1024,1024*tex.height//tex.width),Image.LANCZOS)
    tb=io.BytesIO();tex.save(tb,'JPEG',quality=88,optimize=True);tb=tb.getvalue()
    chunks=[];views=[];accs=[]
    def add(data,target=None):
        while sum(len(c) for c in chunks)%4: chunks.append(b'\0')
        o=sum(len(c) for c in chunks);chunks.append(data);vv={'buffer':0,'byteOffset':o,'byteLength':len(data)}
        if target: vv['target']=target
        views.append(vv);return len(views)-1
    newattrs={}
    for k,vals in attrs.items():
        sel=[vals[i] for i in used];n=len(sel[0]);data=b''.join(struct.pack('<'+'f'*n,*x) for x in sel)
        a={'bufferView':add(data,34962),'componentType':5126,'count':len(sel),'type':{2:'VEC2',3:'VEC3'}[n]}
        if k=='POSITION': a['min']=[min(x[c] for x in sel) for c in range(3)];a['max']=[max(x[c] for x in sel) for c in range(3)]
        accs.append(a);newattrs[k]=len(accs)-1
    idx=b''.join(struct.pack('<H',remap[i]) for i in keep)
    accs.append({'bufferView':add(idx,34963),'componentType':5123,'count':len(keep),'type':'SCALAR'});ii=len(accs)-1
    iv=add(tb)
    j2={'asset':{'version':'2.0','generator':'prep hair'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'hair'}],
     'meshes':[{'primitives':[{'attributes':newattrs,'indices':ii,'material':0}]}],'materials':[j['materials'][0]],'textures':[{'source':0,'sampler':0}],'samplers':[{}],
     'images':[{'bufferView':iv,'mimeType':'image/jpeg'}],'accessors':accs,'bufferViews':views}
    j2['materials'][0]['pbrMetallicRoughness']['baseColorTexture']={'index':0}
    data=b''.join(chunks)
    while len(data)%4: data+=b'\0'
    j2['buffers']=[{'byteLength':len(data)}];js=json.dumps(j2,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    open(dst,'wb').write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(data))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(data),0x004E4942)+data)
    print(len(keep)//3,'tris',len(used),'verts')
    

if __name__ == '__main__':
    with tempfile.NamedTemporaryFile(suffix='.json') as t:
        split(sys.argv[1], t.name)
        write(sys.argv[1], t.name, sys.argv[2])
