"""Derive the Bramble Glade ground and its brambled rock shelves from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Bramble Glade concept (bramble-glade, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.2);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // rock shelves under the brambles: the island in the middle of the glade, the left bank with its
 // old trees, the high ground the north-west steps climb to, the right bank, and the back
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.40,.30,'n'],[.43,.40,'b'],[.48,.455,'b'],[.56,.465,'b'],[.63,.455,'b'],[.69,.43,'b'],[.71,.36,'n'],[.69,.27,'n'],[.62,.21,'n'],[.52,.20,'n'],[.44,.23,'n']]},
 {top:M(1.5),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,.49,'t'],[.04,.485,'b'],[.12,.46,'b'],[.19,.43,'b'],[.235,.37,'b'],[.23,.29,'n'],[.20,.20,'n'],[.21,.10,'n'],[.22,-.4,'t'],[-.3,-.4,'t']]},
 {top:M(1.0),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[.33,.20,'b'],[.37,.235,'b'],[.43,.215,'n'],[.48,.16,'n'],[.52,.08,'n'],[.55,-.4,'t'],[.34,-.4,'t'],[.33,.08,'n']]},
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,.62,'t'],[.97,.615,'b'],[.92,.57,'b'],[.905,.49,'b'],[.92,.42,'b'],[.96,.37,'n'],[1.3,.36,'t']]},
 {top:M(1.2),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[.58,.10,'n'],[.64,.15,'b'],[.71,.16,'b'],[.76,.12,'n'],[.77,-.4,'t'],[.57,-.4,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the open earth of the glade below the island, where the paths meet
const PLAZA=poly([[.40,.56],[.46,.50],[.56,.49],[.66,.50],[.76,.52],[.82,.58],[.78,.66],[.66,.68],[.54,.67],[.45,.63]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.08, 0.30, 3.6, M(1.5)], [0.22, 0.08, 3.0, 0], [0.56, 0.20, 3.4, M(1.3)], [0.38, 0.04, 3.0, M(1.0)], [0.66, 0.04, 3.0, M(1.2)], [0.90, 0.04, 3.0, 0], [0.97, 0.30, 2.8, 0], [0.06, 0.88, 2.6, 0], [0.94, 0.90, 2.6, 0]]'+w[b:]
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='glade-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The Greenhollow Frontier keeps the warm sunny yellow-green of its concept: the ruins' own grass and
# path colours, unchanged.
# No ravines between the terraces (fill.js).
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['fillAt','GLADE_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
