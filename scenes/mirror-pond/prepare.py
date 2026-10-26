"""Derive the Mirror Pond ground, rim and pond from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Mirror Pond concept (mirror-pond)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.2);\n// The pond lies a little below the paths: its surface and its floor.\nconst SEA_Y = -M(.45), SEA_FLOOR = -M(1.25);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the high ground behind the pond: the moon gate's court; its rock rim drops straight into the water,
 // grassy banks elsewhere down to the paths
 {top:PL,base:SEA_FLOOR,ledge:true,soft:M(1.2),lean:M(.3),pts:[[-.3,.48,'t'],[.06,.44,'n',0],[.11,.365,'n',0],[.125,.295,'n',0],[.18,.245,'n',0],[.245,.248,'n',0],[.285,.268,'b',SEA_Y],[.325,.252,'b',SEA_Y],[.39,.243,'b',SEA_Y],[.43,.25,'b',SEA_Y],[.47,.27,'b',SEA_Y],[.52,.286,'b',SEA_Y],[.56,.296,'b',SEA_Y],[.60,.306,'b',SEA_Y],[.655,.328,'b',SEA_Y],[.70,.354,'b',SEA_Y],[.737,.372,'n',0],[.778,.335,'n',0],[.795,.26,'n',0],[.812,.16,'n',0],[.835,.06,'n',0],[.85,-.4,'t'],[-.3,-.4,'t']]},
 // the high wooded bank on the right, its rock face toward the plaza
 {top:M(1.8),base:0,ledge:true,soft:M(1.2),lean:M(.32),pts:[[1.3,.80,'t'],[.94,.765,'b'],[.885,.70,'b'],[.866,.625,'b'],[.875,.56,'n'],[.895,.46,'n'],[.90,.36,'n'],[.895,.26,'n'],[.905,.16,'n'],[.93,.05,'n'],[.95,-.4,'t'],[1.3,-.4,'t']]},
 // the low mossy rise at the front left, rock toward the path
 {top:M(1.0),base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[-.3,.95,'t'],[.04,.92,'n'],[.12,.86,'n'],[.165,.78,'n'],[.155,.70,'b'],[.10,.64,'b'],[.03,.60,'b'],[-.3,.58,'t']]},
 // and a lower one at the front right
 {top:M(.8),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[1.3,1.05,'t'],[.97,.99,'n'],[.90,.91,'n'],[.885,.85,'n'],[.93,.80,'n'],[1.3,.82,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the open packed earth in front of the pond
const PLAZA=poly([[.33,.60],[.42,.572],[.50,.578],[.58,.578],[.70,.588],[.78,.625],[.76,.72],[.66,.80],[.56,.86],[.44,.85],[.36,.78],[.31,.68]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.30, 0.20, 3.0, PL], [0.62, 0.14, 3.2, PL], [0.06, 0.25, 3.0, PL], [0.95, 0.28, 3.0, M(1.8)], [0.92, 0.85, 2.4, 0], [0.12, 0.84, 2.4, M(1)], [0.40, 0.66, 1.6, 0], [0.70, 0.72, 1.8, 0]]'+w[b:]
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
  // the pond: a steep bank down to its floor, except under the rim's rock face and the stair
  const pin=pondIn(x,z);
  if(pin>-M(.2)&&top<.6&&!(st.inside&&st.route==='stair')){const k=smooth(-M(.2),M(.55),pin);y=y+(SEA_FLOOR-y)*k;rock*=1-k;}
''' +w[b:]
w=w.replace('const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);','const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};')
# Rock faces stand everywhere but across the rim stair itself.
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const onStair=q=>{const st=stairsAt(q.x,q.z);return st.route===\'stair\'&&st.s<st.half+M(.6)&&st.a>-.02&&st.a<1.02;};\n  const wall=i=>p[i].wall&&!onStair(p[i])&&!onStair(p[(i+1)%n]);')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
needle='''    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
replacement='''    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
w=w.replace(needle,replacement)
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='pond-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# Moonroot's own colours (owner, 26 October 2026: the region concept's teal tone): cool sage-teal
# grass and pale sandy paths.
for a_,b_ in[("'#e0ab63'","'#d6b27a'"),("'#efc27b'","'#e6c891'"),("'#cc8f4c'","'#bf9a66'"),("'#f2c886'","'#ecd3a2'"),("'#90ad38'","'#6fa64e'"),("'#b3c540'","'#98c25a'"),("'#5a8536'","'#3c7a5a'"),("'#cdd65a'","'#b6dc80'")]:
 assert a_ in w,a_;w=w.replace(a_,b_)
# No ravines between the terraces (fill.js); the pond is cut after the fill.
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n'+(here/'pond.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['SEA_FLOOR','fillAt','pondIn','POND_PORTS',"route==='stair'"]:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
