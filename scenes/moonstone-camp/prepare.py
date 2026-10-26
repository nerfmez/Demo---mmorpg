"""Derive the Moonstone Camp ground and rock terraces from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Moonstone Camp concept (moonstone-camp)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(2.0);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the wooded rock terrace behind the camp, its faces over the tents
 {top:PL,base:0,ledge:true,soft:M(1.2),lean:M(.32),pts:[[.215,.36,'n'],[.255,.30,'b'],[.31,.245,'b'],[.37,.215,'b'],[.43,.20,'b'],[.49,.205,'b'],[.55,.215,'b'],[.61,.235,'b'],[.67,.26,'b'],[.725,.29,'b'],[.765,.30,'n'],[.79,.21,'n'],[.81,.06,'n'],[.82,-.4,'t'],[.27,-.4,'t'],[.25,.08,'n'],[.225,.20,'n']]},
 // the high wooded ground on the right, above the north-east stair
 {top:M(1.7),base:0,ledge:true,soft:M(1.2),lean:M(.32),pts:[[1.3,.55,'t'],[.93,.52,'n'],[.90,.45,'n'],[.92,.36,'b'],[.94,.26,'b'],[.92,.16,'n'],[.90,.05,'n'],[.90,-.4,'t'],[1.3,-.4,'t']]},
 // the block mound on the left of the clearing
 {top:M(1.3),base:0,ledge:true,soft:M(.9),lean:M(.28),pts:[[.18,.47,'b'],[.24,.445,'b'],[.29,.47,'b'],[.305,.54,'b'],[.27,.585,'n'],[.20,.59,'n'],[.16,.54,'n']]},
 // the rock shelves framing the front corners
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,1.05,'t'],[.93,1.0,'n'],[.80,.97,'n'],[.745,.87,'b'],[.76,.77,'b'],[.84,.69,'b'],[.92,.635,'b'],[1.0,.61,'b'],[1.3,.6,'t']]},
 {top:M(1.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.0,'t'],[.13,.98,'n'],[.175,.86,'b'],[.14,.77,'b'],[.06,.725,'b'],[-.3,.71,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the camp's packed earth: the clearing and the ground round the fire before the tents
const PLAZA=poly([[.31,.44],[.30,.37],[.33,.31],[.42,.29],[.52,.30],[.60,.31],[.66,.36],[.70,.43],[.77,.48],[.78,.58],[.72,.68],[.65,.78],[.58,.87],[.44,.87],[.36,.78],[.32,.66],[.30,.55]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.08, 0.30, 3.0, 0], [0.50, 0.10, 3.2, PL], [0.70, 0.15, 3.0, PL], [0.93, 0.15, 3.0, M(1.7)], [0.90, 0.85, 2.6, M(1.4)], [0.10, 0.85, 2.6, M(1.2)], [0.62, 0.62, 1.8, 0], [0.30, 0.70, 1.8, 0]]'+w[b:]
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='camp-cliffs';mesh.customDepthMaterial")
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
for must in['fillAt','CAMP_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
