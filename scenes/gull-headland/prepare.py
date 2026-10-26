"""Derive the Gull Headland ground/cliffs from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Gull Headland concept (gull-headland)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(3.0);\n// The sea lies below the headland cliffs on the right: its surface and the floor beneath it.\nconst SEA_Y = -M(2.3), SEA_FLOOR = -M(3.0);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the land: everything but the sea; the headland ends right behind the gate (owner: the gate stands at the cliff's edge)
 {top:0,base:SEA_FLOOR,ledge:true,soft:M(1.5),lean:M(.35),pts:[[-.5,1.5,'t'],[-.5,-.6,'t'],[.47,-.6,'t'],[0.49,0.0,'n',PL],[0.52,0.1,'n',PL],[0.56,0.155,'n',PL],[0.61,0.172,'n',PL],[0.66,0.175,'n',PL],[0.71,0.168,'n',PL],[0.77,0.155,'n',PL],[0.83,0.17,'n',PL],[0.87,0.22,'n',PL],[0.9,0.33,'n',PL],[0.895,0.45,'n',PL],[.875,.58,'n',M(1.5)],[.885,.68,'b',M(1.5)],[.93,.74,'b',M(1.5)],[1.0,.78,'b',M(1.5)],[1.5,.82,'b',M(1.5)],[1.5,1.5,'t']]},
 // the headland top: the gate court; a rock face toward the middle tier (cut by the curbed stair) and a sea cliff behind
 {top:PL,base:M(1.5),ledge:true,soft:M(1.3),lean:M(.35),pts:[[.13,.31,'n'],[.20,.33,'n'],[.27,.345,'b'],[.33,.355,'b'],[.385,.365,'b'],[.44,.385,'b'],[.52,.395,'b'],[.585,.40,'b'],[.645,.405,'b'],[.69,.425,'b'],[.745,.44,'b'],[.80,.455,'b'],[.85,.455,'b'],[0.895,0.45,'b',PL],[0.9,0.33,'b',PL],[0.87,0.22,'b',PL],[0.83,0.17,'b',PL],[0.77,0.155,'b',PL],[0.71,0.168,'b',PL],[0.66,0.175,'b',PL],[0.61,0.172,'b',PL],[0.56,0.155,'b',PL],[0.52,0.1,'b',PL],[0.49,0.0,'b',PL],[.47,-.6,'t'],[.16,-.6,'t'],[.15,.10,'n'],[.135,.22,'n']]},
 // the high ground at the top left, above the west path
 {top:M(4.2),base:0,ledge:true,soft:M(1.2),lean:M(.35),pts:[[-.3,.30,'b'],[.0,.30,'b'],[.05,.31,'b'],[.09,.27,'b'],[.11,.19,'b'],[.115,.10,'b'],[.12,.02,'b'],[.14,-.6,'t'],[-.3,-.6,'t']]},
 // the middle tier the path climbs onto, a rock face at its front
 {top:M(1.5),base:0,ledge:true,soft:M(1.2),lean:M(.32),pts:[[-.3,.665,'b'],[.0,.645,'b'],[.06,.625,'b'],[.12,.605,'b'],[.19,.625,'b'],[.25,.66,'b'],[.29,.715,'b'],[.33,.775,'b'],[.375,.79,'b'],[.42,.76,'n'],[.455,.735,'n'],[.60,.73,'n'],[.64,.735,'b'],[.70,.745,'b'],[.76,.76,'b'],[.81,.775,'b'],[.86,.73,'b'],[.875,.58,'n'],[.90,.45,'t'],[.88,.20,'t'],[.30,.20,'t'],[-.3,.22,'t']]},
 // the rock outcrop between the west path and the curbed stair
 {top:M(2.3),base:M(1.5),ledge:true,soft:M(1.0),lean:M(.3),pts:[[.395,.585,'b'],[.43,.615,'b'],[.48,.625,'b'],[.53,.62,'b'],[.575,.60,'b'],[.60,.555,'b'],[.585,.50,'n'],[.52,.47,'n'],[.45,.465,'n'],[.40,.50,'b']]}
''' +w[b:]
w=w.replace('  let y = 0, top = 0, rock = 0;','  let y = SEA_FLOOR, top = 0, rock = 0;',1)
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the packed earth of the gate court round the stone circle
const PLAZA=poly([[.42,.245],[.48,.30],[.57,.345],[.67,.345],[.76,.31],[.80,.25],[.76,.205],[.70,.20],[.62,.205],[.55,.205],[.47,.215]],PL);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('  // The authored court');b=w.index('  return { y, top, rock };',a)
w=w[:a]+'''  const court=polyAt(PLAZA,x,z);
  if(court!==null&&court<0){y=PL;top=1;rock=0;}
  const st=stairsAt(x,z);
  if(st.a>-.03&&st.a<1.04&&st.s<st.half+ST.bank){
    const k=smooth(st.half-.06,st.half+ST.bank,st.s);
    y=st.y+(y-st.y)*k;
    if(st.inside)rock=0;
  }
''' +w[b:]
w=w.replace('const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);','const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};')
# Rock faces stand everywhere but across the stair itself.
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const onStair=q=>{const st=stairsAt(q.x,q.z);return st.route===\'stair\'&&st.s<st.half+M(.6)&&st.a>-.02&&st.a<1.02;};\n  const wall=i=>p[i].wall&&!onStair(p[i])&&!onStair(p[(i+1)%n]);')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
needle='''    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
replacement='''    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
w=w.replace(needle,replacement)
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='headland-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# No ravines between the terraces (fill.js); routes ride the filled ground.
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n'+(here/'coast.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
w=w.replace("  const court=polyAt(PLAZA,x,z);\n  if(court!==null&&court<0){y=PL;top=1;rock=0;}","  const fill=fillAt(x,z);if(fill>y+.01){y=fill;rock=0;}\n  const court=polyAt(PLAZA,x,z);\n  if(court!==null&&court<0){y=PL;top=1;rock=0;}",1)
w=w.replace("    y=st.y+(y-st.y)*k;","    const ry=Math.max(st.y,fillAt(x,z));y=ry+(y-ry)*k;",1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['SEA_FLOOR','fillAt','seaDist','HEADLAND_PORTS',"route==='stair'"]:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
