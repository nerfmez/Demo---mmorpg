"""Derive the Old Root Stone Ring ground and mound from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Old Root Stone Ring concept (old-root-stone-ring)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.6);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the mound of the stone ring: a rock face of mossy blocks over the plaza, a grassy flank down to
 // the right path, high wooded ground behind it where the old trees stand
 {top:PL,base:0,ledge:true,soft:M(2.8),lean:M(.3),pts:[[.30,.30,'n'],[.33,.38,'b'],[.36,.46,'b'],[.42,.52,'b'],[.48,.565,'b'],[.54,.58,'b'],[.60,.605,'b'],[.66,.62,'b'],[.71,.60,'n'],[.75,.53,'n'],[.79,.47,'n'],[.82,.40,'n'],[.84,.30,'n'],[.86,.18,'n'],[.88,.05,'n'],[.90,-.4,'t'],[.25,-.4,'t'],[.27,.05,'n'],[.28,.18,'n']]},
 // the rock shelves framing the front corners and the left bank
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.0,'t'],[.14,.98,'n'],[.21,.88,'b'],[.18,.79,'b'],[.10,.74,'b'],[.03,.70,'b'],[-.3,.69,'t']]},
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,1.05,'t'],[.92,1.0,'n'],[.81,.94,'n'],[.79,.84,'b'],[.84,.77,'b'],[.92,.74,'b'],[1.3,.72,'t']]},
 {top:M(1.2),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[-.3,.62,'t'],[.04,.62,'b'],[.10,.56,'b'],[.12,.48,'b'],[.11,.40,'n'],[.07,.30,'n'],[-.3,.30,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the packed earth of the plaza below the mound
const PLAZA=poly([[.30,.66],[.40,.62],[.50,.63],[.60,.655],[.70,.66],[.76,.72],[.72,.84],[.62,.92],[.50,.96],[.38,.92],[.30,.82]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.08, 0.25, 3.0, 0], [0.40, 0.10, 3.4, PL], [0.80, 0.10, 3.2, PL], [0.95, 0.40, 3.0, 0], [0.90, 0.85, 2.6, M(1.4)], [0.10, 0.85, 2.6, M(1.3)], [0.30, 0.70, 1.8, 0], [0.70, 0.70, 1.8, 0]]'+w[b:]
a=w.index('  // The authored court');b=w.index('  return { y, top, rock };',a)
w=w[:a]+'''  const fill=fillAt(x,z);if(fill>y+.01){y=fill;rock=0;}
  const court=polyAt(PLAZA,x,z);
  if(court!==null&&court<0){y=0;top=0;rock=0;}
  const st=stairsAt(x,z);
  if(st.a>-.03&&st.a<1.04&&st.s<st.half+ST.bank){
    const k=smooth(st.half-.06,st.half+ST.bank,st.s);
    const ry=Math.max(st.y,fillAt(x,z));y=ry+(y-ry)*k;
    if(st.inside)rock=0;
  }
''' +w[b:]
w=w.replace('const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);','const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};')
# Rock faces stand everywhere but across a path.
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const onStair=q=>{const st=stairsAt(q.x,q.z);return st.s<st.half+M(.6)&&st.a>-.02&&st.a<1.02;};\n  const wall=i=>p[i].wall&&!onStair(p[i])&&!onStair(p[(i+1)%n]);')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
needle='''    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
replacement='''    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
w=w.replace(needle,replacement)
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='ring-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# Moonroot's own colours (owner, 26 October 2026: the region concept's teal tone): cool sage-teal
# grass and pale sandy paths.
for a_,b_ in[("'#e0ab63'","'#d6b27a'"),("'#efc27b'","'#e6c891'"),("'#cc8f4c'","'#bf9a66'"),("'#f2c886'","'#ecd3a2'"),("'#90ad38'","'#6fa64e'"),("'#b3c540'","'#98c25a'"),("'#5a8536'","'#3c7a5a'"),("'#cdd65a'","'#b6dc80'")]:
 assert a_ in w,a_;w=w.replace(a_,b_)
# No ravines between the terraces (fill.js).
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['fillAt','RING_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
