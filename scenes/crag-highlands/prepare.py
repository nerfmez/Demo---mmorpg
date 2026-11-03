"""Derive the Crag Highlands ground, its crags and the shrine shelf from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Crag Highlands concept (crag-highlands, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(2.2);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the shrine's high shelf at the back, its columned rock face over the east path, the stair cut through it
 {top:PL,base:0,ledge:true,soft:M(1.2),lean:M(.3),pts:[[.44,.12,'n'],[.47,.225,'b'],[.53,.26,'b'],[.60,.29,'b'],[.70,.31,'b'],[.78,.32,'b'],[.86,.33,'b'],[.92,.32,'n'],[.95,-.4,'t'],[.44,-.4,'t']]},
 // the left crag: tall columns over the clearing, its far side along the gully path
 {top:M(2.8),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[-.3,.545,'n',0],[.0,.545,'b'],[.07,.515,'b'],[.13,.49,'b'],[.165,.42,'b'],[.21,.37,'b'],[.27,.345,'b'],[.33,.31,'b'],[.37,.255,'b'],[.33,.18,'b'],[.28,.10,'b'],[.24,.02,'b'],[.22,-.4,'t'],[-.3,-.4,'t']]},
 // the low rock step between the left crag and the clearing
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[.20,.475,'b'],[.27,.48,'b'],[.34,.485,'b'],[.42,.475,'b'],[.47,.445,'b'],[.48,.40,'n'],[.42,.355,'n'],[.33,.35,'n'],[.24,.38,'n']]},
 // the right crag with its birch, above the east path
 {top:M(2.4),base:0,ledge:true,soft:M(1.1),lean:M(.3),pts:[[.90,.32,'n'],[.885,.40,'b'],[.92,.47,'b'],[.97,.515,'b'],[1.3,.54,'t'],[1.3,-.4,'t'],[.95,-.4,'t']]},
 // the crags at the front corners
 {top:M(2.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.1,'t'],[.13,1.06,'n'],[.15,.93,'b'],[.11,.79,'b'],[.06,.69,'b'],[-.01,.635,'b'],[-.3,.64,'n',0]]},
 {top:M(1.8),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.68,1.12,'t'],[.70,.94,'b'],[.73,.83,'b'],[.80,.79,'b'],[.88,.80,'b'],[.95,.85,'n'],[1.3,.88,'t'],[1.3,1.12,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the earth of the clearing among the crags
const PLAZA=poly([[.42,.62],[.48,.565],[.56,.545],[.63,.555],[.665,.62],[.635,.72],[.60,.85],[.57,1.0],[.44,1.0],[.42,.86],[.40,.72]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.06, 0.22, 3.6, M(2.8)], [0.42, 0.12, 3.0, PL], [0.94, 0.38, 3.0, M(2.4)], [0.62, 0.62, 3.6, 0], [0.44, 0.70, 3.0, 0], [0.30, 0.86, 2.6, 0], [0.80, 0.60, 2.4, 0], [0.20, 0.55, 2.4, 0]]'+w[b:]
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='crag-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The Greenhollow Frontier keeps the warm sunny yellow-green of its concept: the ruins' own grass and
# path colours, unchanged.
# No ravines between the terraces (fill.js).
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['fillAt','CRAG_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
