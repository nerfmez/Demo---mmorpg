"""Derive the Greyfang Den ground, its rock mass and banks from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Greyfang Den concept (greyfang-den, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(2.4);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the wolf den: a tall mass of mossy rock at the back of the clearing, the cave in its face
 {top:M(5.6),base:0,ledge:true,soft:M(1.2),lean:M(.35),pts:[[.47,.20,'n'],[.49,.29,'b'],[.53,.325,'b'],[.60,.33,'b'],[.66,.325,'b'],[.71,.355,'b'],[.79,.37,'b'],[.855,.34,'b'],[.885,.27,'n'],[.90,.12,'n'],[.92,-.4,'t'],[.46,-.4,'t']]},
 // the left bank the stair climbs, with its path north-west
 {top:PL,base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,.48,'t'],[.04,.475,'b'],[.11,.45,'b'],[.20,.425,'b'],[.29,.40,'b'],[.37,.37,'b'],[.43,.33,'b'],[.455,.25,'n'],[.45,-.4,'t'],[-.3,-.4,'t']]},
 // rock and thicket banks at the front corners and on the right
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.05,'t'],[.10,1.04,'n'],[.21,.95,'b'],[.26,.84,'b'],[.24,.74,'b'],[.18,.67,'b'],[.09,.62,'b'],[.02,.60,'b'],[-.3,.59,'t']]},
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,1.08,'t'],[.72,1.05,'n'],[.68,.94,'b'],[.71,.82,'b'],[.79,.74,'b'],[.88,.71,'b'],[.97,.69,'b'],[1.3,.68,'t']]},
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,.55,'t'],[1.0,.545,'b'],[.955,.49,'b'],[.965,.42,'n'],[1.0,.37,'n'],[1.3,.36,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the trodden earth of the clearing before the den
const PLAZA=poly([[.32,.47],[.42,.40],[.52,.37],[.62,.36],[.68,.40],[.72,.465],[.80,.475],[.83,.52],[.73,.555],[.63,.62],[.52,.665],[.42,.63],[.34,.57]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.06, 0.22, 3.6, PL], [0.22, 0.04, 3.0, PL], [0.38, 0.12, 3.0, PL], [0.72, 0.04, 3.0, M(5.6)], [0.96, 0.25, 3.0, 0], [0.04, 0.48, 3.0, 0], [0.30, 0.62, 2.6, 0], [0.06, 0.88, 2.6, M(1.3)], [0.94, 0.90, 2.6, M(1.3)]]'+w[b:]
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
  // the den's tunnel: the cave path runs level into the rock mass (its roof is den.js's tunnel)
  if(st.route==='cave'&&st.s<st.half+M(.5)){const k=smooth(st.half-.1,st.half+M(.5),st.s);y=st.y+(y-st.y)*k;top*=k;rock=0;}
''' +w[b:]
w=w.replace('const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);','const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};')
# Rock faces stand everywhere but across a path.
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const onStair=q=>{const st=stairsAt(q.x,q.z);return st.s<st.half+M(.6)&&st.a>-.02&&st.a<1.02;};\n  const wall=i=>p[i].wall&&!onStair(p[i])&&!onStair(p[(i+1)%n]);')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
needle='''    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
replacement='''    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
w=w.replace(needle,replacement)
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='den-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The Greenhollow Frontier keeps the warm sunny yellow-green of its concept: the ruins' own grass and
# path colours, unchanged.
# No ravines between the terraces (fill.js).
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['fillAt','DEN_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
