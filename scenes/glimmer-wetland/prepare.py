"""Derive the Glimmer Wetland ground, its banks and pools from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Glimmer Wetland concept (glimmer-wetland, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(1.1);\n// The pools lie a little below the paths: their surface and their floor.\nconst SEA_Y = -M(.35), SEA_FLOOR = -M(1.0);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the mossy rock the great willow stands on, between the small pool and the middle one
 {top:PL,base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[.375,.245,'b'],[.43,.232,'b'],[.50,.24,'b'],[.555,.25,'b'],[.575,.18,'n'],[.565,.08,'n'],[.53,-.4,'t'],[.37,-.4,'t'],[.36,.05,'n'],[.375,.13,'n']]},
 // the crystal's rock, a block of stone with the crystal on its top
 {top:M(1.4),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.655,.175,'b'],[.70,.205,'b'],[.76,.215,'b'],[.81,.20,'b'],[.835,.13,'n'],[.825,.02,'n'],[.80,-.4,'t'],[.66,-.4,'t'],[.645,.08,'n']]},
 // willow banks at the top left and top right and on the right
 {top:M(.9),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[-.3,.34,'t'],[.03,.335,'b'],[.09,.315,'b'],[.12,.26,'n'],[.125,.10,'n'],[.12,-.4,'t'],[-.3,-.4,'t']]},
 {top:M(.9),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[.845,.245,'b'],[.90,.265,'b'],[.97,.265,'b'],[1.3,.26,'t'],[1.3,-.4,'t'],[.85,-.4,'t'],[.835,.12,'n']]},
 {top:M(.8),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[1.3,.96,'t'],[.93,.93,'b'],[.885,.83,'b'],[.89,.71,'b'],[.92,.625,'b'],[.98,.59,'n'],[1.3,.58,'t']]},
 // the low rock rise at the front left
 {top:M(.8),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[-.3,1.1,'t'],[.18,1.06,'n'],[.24,.95,'b'],[.205,.85,'b'],[.13,.76,'b'],[.05,.71,'b'],[-.3,.69,'t']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the open earth where the path forks, below the pools
const PLAZA=poly([[.43,.625],[.48,.58],[.58,.575],[.635,.62],[.655,.72],[.62,.85],[.585,1.0],[.42,1.0],[.385,.85],[.39,.72]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.08, 0.20, 3.4, M(.9)], [0.44, 0.17, 3.6, PL], [0.90, 0.16, 3.0, M(.9)], [0.95, 0.62, 3.6, M(.8)], [0.60, 0.92, 2.6, 0], [0.10, 0.86, 2.4, M(.8)], [0.30, 0.30, 2.0, 0]]'+w[b:]
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
  // the pools: a short bank down to their floor
  const pin=pondIn(x,z);
  if(pin>-M(.2)){const k=smooth(-M(.2),M(.5),pin);y=y+(SEA_FLOOR-y)*k;rock*=1-k;top*=1-k;}
''' +w[b:]
w=w.replace('const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);','const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};')
# Rock faces stand everywhere but across a path.
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const onStair=q=>{const st=stairsAt(q.x,q.z);return st.s<st.half+M(.6)&&st.a>-.02&&st.a<1.02;};\n  const wall=i=>p[i].wall&&!onStair(p[i])&&!onStair(p[(i+1)%n]);')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='wetland-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The Greenhollow Frontier keeps the warm sunny yellow-green of its concept: the ruins' own grass and
# path colours, unchanged. No ravines between the banks (fill.js); the pools are cut after the fill.
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n'+(here/'pools.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['SEA_FLOOR','fillAt','pondIn','WETLAND_PORTS']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
