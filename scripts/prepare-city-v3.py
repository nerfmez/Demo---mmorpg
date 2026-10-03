#!/usr/bin/env python3
"""Lossless approved GLB preparation and source-derived collision data; no layout edits."""
import json,struct,math,hashlib,copy,sys,re
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]);dest=root/'public/assets/city-v3';dest.mkdir(parents=True,exist_ok=True)
offset=np.array([72.32,.76,41.2]); manifest={'approvedBase':'V3 frontages; only AC_Home_Balcony_026 rotated east','offset':offset.tolist(),'files':[],'floors':[],'colliders':[],'entries':[],'docks':[],'placements':[],'fountain':{'x':62,'z':22,'r':5.05},'nativeCoastlinePreserved':True}
def read(p):
 b=p.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<I',b,8)[0]==len(b);n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);ln,typ=struct.unpack_from('<II',b,20+n);return g,b[28+n:28+n+ln]
def accessor(g,blob,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d=np.dtype(dt);start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',n*d.itemsize);return np.ndarray((a['count'],n),dtype=d,buffer=blob,offset=start,strides=(stride,d.itemsize)).copy()
def matrix(n):
 if 'matrix'in n:return np.array(n['matrix']).reshape(4,4).T
 x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]],dtype=float);m[:3,:3]=m[:3,:3]@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
# Ground outlines come from triangle boundary edges, retaining the approved coastline/floor exactly.
def boundary(v,indices):
 points={};edges={}
 for tri in indices.reshape(-1,3):
  keys=[tuple(np.round(v[int(i)][[0,2]],5))for i in tri]
  for p in keys:points[p]=p
  for a,b in zip(keys,keys[1:]+keys[:1]):
   k=tuple(sorted([a,b]));edges[k]=edges.get(k,0)+1
 adj={}
 for (a,b),n in edges.items():
  if n==1:adj.setdefault(a,[]).append(b);adj.setdefault(b,[]).append(a)
 loops=[]
 while adj:
  start=next(iter(adj));p=start;prev=None;loop=[]
  for _ in range(10000):
   loop.append(list(p));ns=adj.get(p,[])
   if not ns:break
   q=next((a for a in ns if a!=prev),ns[0]);adj[p].remove(q)
   if not adj[p]:del adj[p]
   if p in adj.get(q,[]):adj[q].remove(p)
   if q in adj and not adj[q]:del adj[q]
   prev,p=p,q
   if p==start:break
  if len(loop)>2:loops.append(loop)
 return loops
for f in sorted(source.glob('*.glb')):
 if f.name in ['00_Sea.glb','12_Trees.glb']:continue
 g,blob=read(f);original=copy.deepcopy(g);triangles=0
 # UV/tangent attributes are unused by the game's solid-colour toon materials. Remove only those buffers.
 used=set()
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   p['attributes']={k:v for k,v in p['attributes'].items()if k not in ['TEXCOORD_0','TEXCOORD_1','TANGENT']};used.update(p['attributes'].values());
   if 'indices'in p:used.add(p['indices'])
 ids=sorted(used);amap={a:i for i,a in enumerate(ids)};views=sorted({g['accessors'][a]['bufferView']for a in ids});vmap={a:i for i,a in enumerate(views)};newblob=bytearray();newviews=[]
 for a in views:
  v=copy.deepcopy(g['bufferViews'][a]);start=v.get('byteOffset',0);chunk=blob[start:start+v['byteLength']]
  while len(newblob)%4:newblob.append(0)
  v['byteOffset']=len(newblob);v['buffer']=0;newblob.extend(chunk);newviews.append(v)
 newacc=[]
 for a in ids:
  v=copy.deepcopy(g['accessors'][a]);v['bufferView']=vmap[v['bufferView']];newacc.append(v)
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   p['attributes']={k:amap[v]for k,v in p['attributes'].items()};
   if 'indices'in p:p['indices']=amap[p['indices']]
 g['accessors']=newacc;g['bufferViews']=newviews;g['buffers']=[{'byteLength':len(newblob)}]
 # Lossless checks for every retained position, normal, colour and triangle index.
 for mo,mn in zip(original['meshes'],g['meshes']):
  for po,pn in zip(mo['primitives'],mn['primitives']):
   for a,i in pn['attributes'].items():assert np.array_equal(accessor(original,blob,po['attributes'][a]),accessor(g,newblob,i))
   if 'indices'in pn:assert np.array_equal(accessor(original,blob,po['indices']),accessor(g,newblob,pn['indices']))
 assert original['nodes']==g['nodes']
 jb=json.dumps(g,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);newblob+=b'\0'*((-len(newblob))%4);out=struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(newblob))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(newblob),0x004e4942)+newblob;(dest/f.name).write_bytes(out)
 for no in original['nodes']:
  if 'mesh'not in no:continue
  name=no.get('name','');m=matrix(no);mesh=original['meshes'][no['mesh']];allv=[];body=[]
  for prim in mesh['primitives']:
   v=accessor(original,blob,prim['attributes']['POSITION']);allv.append(v);mat=original['materials'][prim.get('material',0)].get('name','');
   if re.search(r'Plaster|Warm_Limewash|Fired_Brick|lime plaster',mat,re.I):body.append(v)
   inds=accessor(original,blob,prim['indices']).flatten() if 'indices'in prim else np.arange(len(v));triangles+=len(inds)//3
   if f.name=='01_Ground.glb' and ('upper surface'in name or 'grassy top'in name):
    for loop in boundary(v,inds):
     vs=np.array([[x,v[0][1],z,1]for x,z in loop]);world=(m@vs.T).T[:,:3]+offset;manifest['floors'].append({'name':name,'height':round(float(world[:,1].mean()),5),'points':[[round(float(p[0]),5),round(float(p[2]),5)]for p in world]})
  v=np.concatenate(allv);world=(m@np.column_stack([v,np.ones(len(v))]).T).T[:,:3]+offset;lo=world.min(0);hi=world.max(0);manifest['placements'].append({'name':name,'file':f.name,'sourceMatrix':m.flatten().tolist(),'bounds':[lo.tolist(),hi.tolist()]})
  a=math.atan2(m[0,2],m[2,2]);sc=np.linalg.norm(m[:3,:3],axis=0)
  isbuilding=f.name in ['05_Residential.glb','06_Civic.glb','07_Warehouses.glb']or f.name=='08_Shipyard.glb' and ('hall'in name or 'slip'in name)
  if isbuilding and body:
   v=np.concatenate(body);l=v.min(0);h=v.max(0);c=(l+h)/2;pos=(m@np.array([c[0],0,c[2],1]))[:3]+offset;coll={'id':name,'x':float(pos[0]),'z':float(pos[2]),'hx':float((h[0]-l[0])*sc[0]/2),'hz':float((h[2]-l[2])*sc[2]/2),'angle':a,'type':'city_building'};manifest['colliders'].append(coll)
   # The authored front is local +Z. An approach point lies just past the porch, not inside the wall.
   entry=(m@np.array([0,0,max(h[2],v[:,2].max())+1.8,1]))[:3]+offset;manifest['entries'].append({'id':name,'x':float(entry[0]),'z':float(entry[2]),'front':[float(m[0,2]/sc[2]),float(m[2,2]/sc[2])]})
  elif f.name=='04_Walls.glb' and 'wall'in name.lower():
   l=v.min(0);h=v.max(0);c=(l+h)/2;pos=(m@np.r_[c,1])[:3]+offset;manifest['colliders'].append({'id':name,'x':float(pos[0]),'z':float(pos[2]),'hx':float((h[0]-l[0])*sc[0]/2),'hz':float((h[2]-l[2])*sc[2]/2),'angle':a,'type':'city_wall'})
  elif f.name=='04_Walls.glb' and name.startswith(('Perimeter bastion','Inland gate tower')):
   manifest['colliders'].append({'id':name,'x':float((lo[0]+hi[0])/2),'z':float((lo[2]+hi[2])/2),'r':float(min(hi[0]-lo[0],hi[2]-lo[2])/2),'type':'city_tower'})
  elif f.name=='10_Timber_Piers.glb' and name.startswith('Individual pier plank'):
   l=v.min(0);h=v.max(0);pos=(m@np.r_[(l+h)/2,1])[:3]+offset;manifest['docks'].append({'id':name,'x':float(pos[0]),'z':float(pos[2]),'hx':float((h[0]-l[0])*sc[0]/2+.006),'hz':float((h[2]-l[2])*sc[2]/2+.02),'angle':a,'height':float(hi[1]),'kind':'city_pier'})
  elif f.name=='11_Props.glb' and ('Open_Stall'in name or 'Bench'in name):
   l=v.min(0);h=v.max(0);pos=(m@np.r_[(l+h)/2,1])[:3]+offset;manifest['colliders'].append({'id':name,'x':float(pos[0]),'z':float(pos[2]),'hx':float((h[0]-l[0])*sc[0]/2*.88),'hz':float((h[2]-l[2])*sc[2]/2*.8),'angle':a,'type':'city_prop'})
 manifest['files'].append({'file':f.name,'url':'assets/city-v3/'+f.name,'sourceSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'sourceBytes':f.stat().st_size,'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'placedTriangles':triangles,'losslessGeometryAndTransformsVerified':True})
manifest['colliders'].append({'id':'approved-large-fountain','x':62,'z':22,'r':5.05,'type':'city_fountain'})
# Colliders may share a two-chunk facility root: deduplicate only identical body boxes.
seen=set();dedup=[]
for c in manifest['colliders']:
 key=tuple(round(c.get(k,0),4)for k in ['x','z','hx','hz','r','angle'])
 if key not in seen:dedup.append(c);seen.add(key)
manifest['colliders']=dedup
(root/'data/city-v3.json').write_text(json.dumps(manifest,indent=2)+'\n');print('prepared source-exact chunks',len(manifest['files']),'bytes',sum(a['bytes']for a in manifest['files']),'triangles',sum(a['placedTriangles']for a in manifest['files']),'floors',len(manifest['floors']),'colliders',len(dedup),'dock boards',len(manifest['docks']))
