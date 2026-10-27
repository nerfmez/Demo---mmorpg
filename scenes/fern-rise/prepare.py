"""Derive the Fern Rise ground and rises from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Fern Rise concept (fern-rise)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.6);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the fern rise: a mound of mossy rock in the middle, the giant fiddleheads on its top
 {top:PL,base:0,ledge:true,soft:M(1.6),lean:M(.3),pts:[[.37,.34,'n'],[.40,.40,'b'],[.42,.47,'b'],[.47,.52,'b'],[.53,.535,'b'],[.59,.53,'b'],[.64,.51,'b'],[.69,.48,'b'],[.71,.42,'n'],[.70,.33,'n'],[.66,.24,'n'],[.62,.12,'n'],[.60,-.4,'t'],[.40,-.4,'t'],[.38,.10,'n'],[.36,.24,'n']]},
 // the high wooded ground on the left, rock faces toward the left path
 {top:M(1.4),base:0,ledge:true,soft:M(1.4),lean:M(.32),pts:[[-.3,.62,'t'],[.02,.58,'b'],[.09,.53,'b'],[.13,.46,'b'],[.16,.38,'b'],[.20,.30,'n'],[.21,.20,'b'],[.19,.10,'b'],[.17,-.4,'t'],[-.3,-.4,'t']]},
 // and on the right, above the right path's stair
 {top:M(1.8),base:0,ledge:true,soft:M(1.4),lean:M(.32),pts:[[1.3,.72,'t'],[.97,.68,'b'],[.90,.64,'b'],[.86,.58,'n'],[.88,.50,'n'],[.92,.42,'b'],[.94,.33,'n'],[.90,.24,'n'],[.86,.15,'n'],[.86,-.4,'t'],[1.3,-.4,'t']]},
 // the rock shelves framing the front corners
 {top:M(1.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.0,'t'],[.14,.98,'n'],[.20,.90,'b'],[.17,.80,'b'],[.10,.72,'b'],[.02,.69,'b'],[-.3,.68,'t']]},
 {top:M(1.3),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,1.05,'t'],[.92,1.0,'n'],[.82,.96,'n'],[.80,.88,'b'],[.86,.80,'b'],[.94,.76,'b'],[1.3,.75,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the packed earth of the plaza below the mound
const PLAZA=poly([[.32,.64],[.40,.60],[.50,.60],[.62,.61],[.72,.64],[.78,.70],[.72,.82],[.62,.92],[.50,.96],[.38,.92],[.30,.80]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.06, 0.25, 3.0, M(1.4)], [0.40, 0.10, 3.2, PL], [0.95, 0.30, 3.2, M(1.8)], [0.30, 0.40, 2.2, 0], [0.90, 0.85, 2.6, M(1.3)], [0.10, 0.85, 2.6, M(1.2)], [0.36, 0.72, 1.8, 0], [0.66, 0.74, 1.8, 0]]'+w[b:]
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='fern-cliffs';mesh.customDepthMaterial")
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
for must in['fillAt','FERN_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
