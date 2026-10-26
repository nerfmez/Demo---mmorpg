"""Derive the Coastal Ranger Forest ground/cliffs from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Coastal Ranger Forest concept (coastal-ranger-forest)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(2.6);\n// The sea lies below the cliffs at the back right: its surface and the floor beneath it.\nconst SEA_Y = -M(2.3), SEA_FLOOR = -M(3.0);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the land: everything but the sea at the back right; its coast is a rock face down to the water
 {top:0,base:SEA_FLOOR,ledge:true,soft:M(1.5),lean:M(.35),pts:[[-.5,1.5,'t'],[-.5,-.6,'t'],[.66,-.6,'t'],[.76,-.15,'n',PL],[.79,-.02,'n',PL],[.815,.06,'n',PL],[.83,.14,'n',PL],[.84,.22,'n',PL],[.835,.30,'n',PL],[.86,.38,'b',0],[.88,.43,'b',0],[.925,.47,'b',0],[1.0,.50,'b',0],[1.5,.52,'b',0],[1.5,1.5,'t']]},
 // the upper level: the watchtower's plateau on the left and the high bank behind the paths;
 // the stair climbs its front between them, and it ends at the sea cliffs on the right
 {top:PL,base:0,ledge:true,soft:M(1.3),lean:M(.35),pts:[[-.3,.475,'b'],[.0,.465,'b'],[.08,.45,'b'],[.14,.435,'b'],[.20,.425,'b'],[.27,.425,'b'],[.33,.41,'b'],[.37,.37,'b'],[.395,.32,'n'],[.43,.30,'n'],[.46,.335,'b'],[.52,.345,'b'],[.58,.36,'b'],[.64,.375,'b'],[.69,.395,'b'],[.74,.41,'b'],[.775,.39,'n'],[.80,.345,'n'],[.835,.30,'b',PL],[.84,.22,'b',PL],[.83,.14,'b',PL],[.815,.06,'b',PL],[.79,-.02,'b',PL],[.76,-.15,'b',PL],[.70,-.6,'t'],[-.3,-.6,'t']]},
 // the lower shelf under the watchtower plateau on the far left
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,.61,'b'],[.0,.585,'b'],[.09,.575,'b'],[.15,.57,'b'],[.21,.565,'b'],[.27,.55,'b'],[.31,.515,'b'],[.335,.47,'n'],[.33,.43,'n'],[.2,.40,'t'],[-.3,.40,'t']]},
 // the rock island the paths divide round
 {top:M(1.6),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.415,.565,'b'],[.43,.63,'b'],[.47,.675,'b'],[.53,.69,'b'],[.59,.68,'b'],[.65,.665,'b'],[.69,.625,'b'],[.70,.575,'b'],[.675,.53,'n'],[.61,.50,'n'],[.53,.49,'n'],[.46,.50,'n'],[.43,.525,'n']]},
 // the right bank with the big tree
 {top:M(1.6),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[1.3,.71,'b'],[.99,.68,'b'],[.93,.66,'b'],[.885,.62,'b'],[.87,.57,'b'],[.875,.525,'b'],[.90,.495,'n'],[.95,.48,'n'],[1.3,.47,'t']]},
 // the front-left and front-right rocks that frame the view
 {top:M(1.9),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,.665,'n'],[.06,.67,'n'],[.12,.71,'b'],[.19,.72,'b'],[.25,.735,'b'],[.28,.78,'b'],[.29,.86,'b'],[.30,.95,'b'],[.31,1.2,'b'],[-.3,1.2,'t']]},
 {top:M(1.6),base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[.55,1.2,'b'],[.57,.96,'b'],[.63,.915,'b'],[.72,.89,'b'],[.80,.86,'b'],[.87,.83,'b'],[.93,.80,'n'],[1.3,.78,'t'],[1.3,1.2,'t']]}
''' +w[b:]
w=w.replace('  let y = 0, top = 0, rock = 0;','  let y = SEA_FLOOR, top = 0, rock = 0;',1)
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the packed earth round the watchtower's feet and the top of the stair
const PLAZA=poly([[.21,.235],[.26,.25],[.33,.235],[.375,.21],[.39,.18],[.35,.16],[.29,.155],[.23,.17],[.205,.20]],PL);
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='ranger-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# No ravines between the terraces (fill.js); routes ride the filled ground.
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n'+(here/'coast.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
w=w.replace("  const court=polyAt(PLAZA,x,z);\n  if(court!==null&&court<0){y=PL;top=1;rock=0;}","  const fill=fillAt(x,z);if(fill>y+.01){y=fill;rock=0;}\n  const court=polyAt(PLAZA,x,z);\n  if(court!==null&&court<0){y=PL;top=1;rock=0;}",1)
w=w.replace("    y=st.y+(y-st.y)*k;","    const ry=Math.max(st.y,fillAt(x,z));y=ry+(y-ry)*k;",1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['SEA_FLOOR','fillAt','seaDist','RANGER_PORTS',"route==='stair'"]:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
