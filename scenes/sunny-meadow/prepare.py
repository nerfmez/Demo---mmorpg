"""Derive the Sunny Meadow ground and its low rock shelves from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Sunny Meadow concept (sunny-meadow, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.2);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // low shelves of mossy rock between the paths (the meadow itself is level): front corners,
 // the island under the big oak, the right and left banks, and the back behind the dial
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.05,'t'],[.05,1.03,'n'],[.14,.93,'b'],[.19,.84,'b'],[.17,.75,'b'],[.11,.68,'b'],[.03,.655,'b'],[-.3,.645,'t']]},
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,1.08,'t'],[.80,1.05,'n'],[.73,.94,'b'],[.745,.82,'b'],[.80,.74,'b'],[.88,.685,'b'],[.97,.655,'b'],[1.3,.645,'t']]},
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,.61,'t'],[.99,.605,'b'],[.94,.56,'b'],[.93,.47,'b'],[.95,.38,'b'],[.975,.30,'n'],[1.0,.24,'n'],[1.3,.24,'t']]},
 {top:M(1.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,.45,'t'],[.04,.445,'b'],[.11,.42,'b'],[.14,.36,'b'],[.115,.29,'n'],[.05,.27,'n'],[-.3,.27,'t']]},
 {top:M(1.1),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.225,.27,'b'],[.26,.295,'b'],[.32,.285,'b'],[.335,.22,'n'],[.29,.17,'n'],[.23,.18,'n']]},
 {top:M(1.3),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[.58,.12,'b'],[.62,.165,'b'],[.70,.175,'b'],[.78,.165,'b'],[.85,.155,'b'],[.885,.10,'n'],[.86,-.4,'t'],[.60,-.4,'t'],[.565,.05,'n']]},
 {top:M(1.0),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.38,.12,'b'],[.43,.15,'b'],[.50,.135,'b'],[.52,.08,'n'],[.45,.04,'n'],[.39,.06,'n']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the packed earth apron in front of the dial, from the east path to the link west
const PLAZA=poly([[.37,.47],[.42,.43],[.50,.42],[.62,.44],[.74,.45],[.82,.49],[.845,.55],[.74,.565],[.62,.555],[.50,.545],[.42,.52]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.30, 0.47, 4.2, 0], [0.27, 0.16, 3.4, M(1.1)], [0.05, 0.14, 3.0, 0], [0.42, 0.06, 3.0, 0], [0.75, 0.06, 3.0, PL], [0.95, 0.18, 3.0, 0], [0.88, 0.42, 2.8, PL], [0.06, 0.88, 2.6, M(1.3)], [0.94, 0.90, 2.6, M(1.3)]]'+w[b:]
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='meadow-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The Greenhollow Frontier keeps the warm sunny yellow-green of its concept: the ruins' own grass and
# path colours, unchanged.
# No ravines between the terraces (fill.js).
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['fillAt','MEADOW_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
