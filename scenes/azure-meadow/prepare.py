"""Derive the meadow terrain from the retained cliff/road pipeline."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(.25);')
w=w.replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 {top:PL,base:0,ledge:false,masonry:true,soft:M(.9),lean:M(.16),pts:[[.405,.425,'b'],[.46,.46,'b'],[.55,.475,'b'],[.64,.465,'b'],[.72,.43,'b'],[.755,.39,'n'],[.735,.32,'n'],[.66,.295,'n'],[.54,.28,'n'],[.44,.305,'n'],[.39,.36,'b']]},
 {top:M(.38),base:0,ledge:true,soft:M(.7),lean:M(.18),pts:[[-.3,.73,'t'],[.09,.70,'b'],[.18,.68,'b'],[.25,.60,'b'],[.245,.51,'n'],[.20,.43,'n'],[.08,.40,'n'],[-.3,.40,'t']]},
 {top:M(1.30),base:M(.30),ledge:true,soft:M(.9),lean:M(.20),pts:[[-.3,.44,'t'],[.05,.43,'b'],[.13,.39,'b'],[.18,.34,'b'],[.18,.26,'n'],[.13,.18,'n'],[-.3,.14,'t']]},
 {top:M(2.4),base:M(1.0),ledge:true,soft:M(1.1),lean:M(.25),pts:[[-.3,.18,'t'],[.13,.18,'b'],[.23,.21,'b'],[.32,.225,'b'],[.38,.20,'n'],[.42,.11,'n'],[.42,-.3,'t'],[-.3,-.3,'t']]},
 {top:PL,base:M(.15),ledge:true,soft:M(.75),lean:M(.18),pts:[[.42,.16,'b'],[.52,.19,'b'],[.67,.19,'b'],[.77,.18,'n'],[.84,.12,'n'],[1.2,-.3,'t'],[.40,-.3,'t']]},
 {top:M(.85),base:0,ledge:true,soft:M(.8),lean:M(.22),pts:[[.77,.88,'b'],[.87,.86,'b'],[.94,.79,'b'],[.98,.65,'b'],[1.2,.57,'t'],[1.2,1.2,'t'],[.8,1.2,'t']]},
 {top:M(.46),base:0,ledge:true,soft:M(.8),lean:M(.14),pts:[[.91,.39,'b'],[.94,.35,'n'],[1.2,.3,'t'],[1.2,.63,'t'],[.97,.55,'b'],[.93,.48,'b']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''const PLAZA=poly([[.46,.36],[.52,.33],[.61,.34],[.635,.38],[.61,.415],[.53,.43],[.47,.405]],PL);
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
# Clamp rock facets beneath the road surface at each actual crossing. The
# terrain ribbon owns its visible floor; its side walls remain in place.
needle='''    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
replacement='''    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));'''
w=w.replace(needle,replacement)
w=w.replace('if(!T.ledge)continue;','if(!T.ledge||T.masonry)continue;')
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='meadow-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
# Accurate local road normals avoid a stone-coloured crease where a narrow
# earthen ramp shares coarse terrain triangles with its retaining bank.
w=w.replace('  const box = new THREE.Vector4(GX0, GZ0, W, D);','''  const roadNormals=g.attributes.normal;
  for(let i=0;i<n;i++){const x=p.getX(i),z=p.getZ(i);if(!stairsAt(x,z).inside)continue;const v=new V3(height(x-.2,z)-height(x+.2,z),.4,height(x,z-.2)-height(x,z+.2)).normalize();roadNormals.setXYZ(i,v.x,v.y,v.z);}
  const box = new THREE.Vector4(GX0, GZ0, W, D);''')
# Fewer lip shrubs; leave readable areas of stone between plant clusters.
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
(here/'world.js').write_text(w.rstrip()+'\n')
