"""Build the rose glade terraces and connected paths with retained game helpers."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(.85);')
w=w.replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 {top:PL,base:0,ledge:true,soft:M(.9),lean:M(.22),pts:[[.125,.345,'b'],[.20,.365,'b'],[.28,.375,'b'],[.34,.35,'b'],[.35,.30,'n'],[.32,.25,'n'],[.27,.215,'n'],[.19,.22,'n'],[.12,.26,'n']]},
 {top:M(.45),base:0,ledge:true,soft:M(.9),lean:M(.22),pts:[[.48,.44,'b'],[.55,.46,'b'],[.65,.46,'b'],[.735,.43,'b'],[.755,.37,'n'],[.71,.31,'n'],[.64,.28,'n'],[.55,.295,'n'],[.49,.34,'n']]},
 {top:M(1.15),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[.755,.36,'b'],[.82,.33,'b'],[.90,.32,'b'],[1.2,.31,'t'],[1.2,-.3,'t'],[.78,-.3,'t'],[.75,.22,'n']]},
 {top:M(1.05),base:M(.35),ledge:true,soft:M(1.2),lean:M(.24),pts:[[-.3,.27,'t'],[.08,.27,'b'],[.15,.22,'b'],[.20,.19,'b'],[.34,.20,'b'],[.43,.19,'b'],[.50,.16,'n'],[.54,-.3,'t'],[-.3,-.3,'t']]},
 {top:M(.60),base:0,ledge:true,soft:M(.9),lean:M(.22),pts:[[-.3,.59,'t'],[.05,.58,'b'],[.12,.55,'b'],[.16,.48,'b'],[.12,.405,'b'],[.06,.37,'n'],[-.3,.35,'t']]},
 {top:M(.50),base:0,ledge:true,soft:M(1.0),lean:M(.26),pts:[[-.3,1.2,'t'],[.28,1.2,'t'],[.33,.87,'b'],[.26,.80,'b'],[.17,.76,'b'],[.06,.73,'b'],[-.3,.78,'t']]},
 {top:M(.65),base:0,ledge:true,soft:M(1.0),lean:M(.24),pts:[[.73,1.2,'t'],[1.2,1.2,'t'],[1.2,.61,'t'],[.94,.62,'b'],[.88,.69,'b'],[.80,.77,'b'],[.75,.89,'b']]}
''' +w[b:]
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''const PLAZA=poly([[.18,.28],[.20,.24],[.28,.23],[.32,.26],[.31,.30],[.23,.32]],PL);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
i=w.index('// distance from the dirt')
w=w[:i]+'''const GARDEN_COURT=poly([[.30,.57],[.39,.515],[.57,.53],[.75,.54],[.80,.595],[.71,.66],[.56,.70],[.43,.67]],0);
const GARDEN_ISLAND=poly([[.455,.565],[.50,.552],[.56,.57],[.565,.60],[.535,.625],[.485,.63],[.45,.61]],0);
'''+w[i:]
w=w.replace('  for (const pl of TRAILS)', '  best=Math.min(best,Math.max(polyAt(GARDEN_COURT,x,z)??Infinity,-(polyAt(GARDEN_ISLAND,x,z)??Infinity)));\n  for (const pl of TRAILS)')
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='rose-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('  const f = field(x, z);\n  return f.y', '  const f = field(x, z);\n  if((polyAt(PAVILION_FLOOR,x,z)??1)<0)return PL;\n  return f.y')
w=w.replace('p.setY(i, f.y + 0.05', 'p.setY(i, (polyAt(PAVILION_FLOOR,x,z)??1)<0 ? PL-.10 : f.y + 0.05')
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
