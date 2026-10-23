"""Derive the new hill's ground/cliffs from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(2.3);')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 {top:PL,base:M(.25),ledge:true,soft:M(1.2),lean:M(.32),pts:[[.255,.535,'b'],[.36,.57,'b'],[.48,.574,'b'],[.58,.55,'b'],[.67,.50,'b'],[.73,.45,'b'],[.76,.40,'n'],[.74,.33,'n'],[.64,.305,'n'],[.54,.32,'n'],[.44,.335,'n'],[.34,.37,'b'],[.275,.42,'b']]},
 {top:M(1.12),base:0,ledge:true,soft:M(1.0),lean:M(.27),pts:[[.41,.705,'b'],[.51,.74,'b'],[.64,.765,'b'],[.75,.71,'b'],[.80,.635,'b'],[.75,.59,'n'],[.66,.60,'n'],[.55,.65,'n'],[.46,.65,'n']]},
 {top:M(1.45),base:0,ledge:true,soft:M(1.3),lean:M(.33),pts:[[-.3,.78,'t'],[.05,.70,'b'],[.13,.69,'b'],[.19,.63,'b'],[.18,.58,'b'],[.12,.51,'n'],[.10,.38,'n'],[.13,.27,'n'],[.1,-.2,'t'],[-.3,-.2,'t']]},
 {top:M(2.9),base:M(1.4),ledge:true,soft:M(1.5),lean:M(.35),pts:[[-.3,.43,'t'],[.08,.43,'b'],[.155,.37,'b'],[.18,.29,'n'],[.23,.20,'n'],[.39,.23,'b'],[.52,.245,'b'],[.58,.22,'n'],[.58,-.3,'t'],[-.3,-.3,'t']]},
 {top:M(2.8),base:M(1.3),ledge:true,soft:M(1.3),lean:M(.32),pts:[[.68,.29,'b'],[.76,.30,'b'],[.83,.34,'b'],[.88,.385,'b'],[.94,.39,'n'],[1.2,.3,'t'],[1.2,-.3,'t'],[.66,-.3,'t']]},
 {top:M(1.1),base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[.90,.70,'b'],[.98,.75,'b'],[1.2,.8,'t'],[1.2,.25,'t'],[.98,.35,'n'],[.95,.45,'n'],[.94,.57,'n']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
 [[.24,.24,.025,M(2.6)],[.22,.18,.03,M(2.6)],[.18,.13,.04,M(2.6)]],
 [[.91,.43,.03,M(1.75)],[.91,.36,.03,M(1.9)],[.94,.29,.035,M(2.8)]]
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''const PLAZA=poly([[.49,.36],[.54,.33],[.64,.33],[.70,.365],[.70,.405],[.64,.425],[.55,.405],[.49,.385]],PL);
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
w=w.replace("'#e0ab63'","'#d4ac70'").replace("'#efc27b'","'#e4c28a'").replace("'#cc8f4c'","'#b99765'").replace("'#f2c886'","'#ecd1a0'")
w=w.replace('ST.half + ST.bank - 1','stairsAt(q.x,q.z).half + ST.bank + M(.55)')
w=w.replace('const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);','const wall=i=>p[i].wall;')
w=w.replace('peak=(T.topAt?T.topAt(x):T.top);','peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);')
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
(here/'world.js').write_text(w.rstrip()+'\n')
