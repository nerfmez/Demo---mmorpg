"""Derive the Sunfall Coast ground, its rock tiers, the sea cliff and the beach from retained terrain; edit only this scene."""
from pathlib import Path
here=Path(__file__).resolve().parent
r=(here.parent/'ruins/scene.js').read_text();w=r[:r.index('function PG(')]
w=w.replace('concept (ruins-approach-40deg)','Sunfall Coast concept (sunfall-coast, Greenhollow Frontier)')
w=w.replace('const K = 2.4;','const K = 3.12;').replace('const PL = M(1.0);','const PL = M(3.9);\n// The sea lies east of the clearing, beyond a sand beach and under the rock arch: its surface and the floor beneath it.\nconst SEA_Y = -M(.7), SEA_FLOOR = -M(1.6), CLIFF = M(4.8);')
w=w.replace('GX1 = 30 * K','GX1 = 36 * K').replace('GZ1 = 10 * K','GZ1 = 16 * K')
a=w.index('// Trace the owner');b=w.index('const T2B',a);w=w[:a]+w[b:]
a=w.index('const TERRACES = [');b=w.index('].map(T => {',a)
w=w[:a]+'''const TERRACES=[
 // the land: everything but the sea. Under the arch the sea cliff stands in the water; below it the
 // ground runs down a sand beach into the sea (the soft edge)
 {top:0,base:SEA_FLOOR,ledge:true,soft:M(3),lean:M(.35),pts:[[-.5,1.5,'t'],[-.5,-.6,'t'],[.68,-.6,'t'],[.70,-.25,'n',SEA_Y],[.75,.05,'n',SEA_Y],[.81,.14,'n',SEA_Y],[.80,.22,'n',SEA_Y],[.75,.31,'n',SEA_Y],[.705,.42,'n',SEA_Y],
  [.665,.48,'n',SEA_FLOOR],[.672,.58,'n',SEA_FLOOR],[.69,.68,'n',SEA_FLOOR],[.715,.78,'n',SEA_FLOOR],[.75,.87,'n',SEA_FLOOR],[.80,.95,'n',SEA_FLOOR],[.88,1.03,'n',SEA_FLOOR],[1.0,1.08,'n',SEA_FLOOR],[1.5,1.15,'n',SEA_FLOOR],[1.5,1.5,'t']]},
 // the sea cliff: a tall mass of pale rock over the beach, the arch's landward end; it stands in the sea
 {top:CLIFF,base:SEA_FLOOR,ledge:true,soft:M(1.2),lean:M(.35),pts:[[.47,.10,'n',PL],[.50,.17,'b',M(2.2)],[.54,.22,'b',M(2.2)],[.59,.26,'b',M(2.2)],[.635,.30,'b',M(2.2)],[.665,.36,'b',0],[.68,.44,'b',0],[.705,.42,'b',SEA_Y],[.75,.31,'b',SEA_Y],[.80,.22,'b',SEA_Y],[.81,.14,'b',SEA_Y],[.75,.05,'b',SEA_Y],[.70,-.25,'b',SEA_Y],[.68,-.6,'t'],[.46,-.6,'t']]},
 // a bushy ledge stepping down from the sea cliff to the clearing, as the concept's
 {top:M(2.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[.47,.18,'n',PL],[.485,.27,'b'],[.51,.34,'b'],[.55,.395,'b'],[.60,.435,'b'],[.64,.455,'b'],[.665,.44,'n'],[.66,.33,'n',M(2.2)],[.60,.25,'n',M(2.2)],[.53,.20,'n',M(2.2)]]},
 // the top tier the stair climbs to, with the path north-west
 {top:PL,base:M(1.8),ledge:true,soft:M(1.2),lean:M(.35),pts:[[-.3,.29,'b'],[.04,.27,'b'],[.13,.255,'b'],[.22,.235,'b'],[.30,.215,'b'],[.36,.20,'b'],[.41,.185,'b'],[.46,.17,'n'],[.50,.10,'n'],[.50,-.6,'t'],[-.3,-.6,'t']]},
 // the middle tier: rock shelves between the clearing and the top tier
 {top:M(1.8),base:0,ledge:true,soft:M(1.0),lean:M(.32),pts:[[-.3,.505,'b'],[.05,.49,'b'],[.12,.47,'b'],[.20,.49,'b'],[.27,.49,'b'],[.33,.455,'b'],[.38,.42,'b'],[.43,.395,'b'],[.48,.35,'b'],[.50,.25,'n'],[.51,-.6,'t'],[-.3,-.6,'t']]},
 // the low rock terrace at the front left, a palm on it
 {top:M(1.2),base:0,ledge:true,soft:M(1.0),lean:M(.3),pts:[[-.3,1.1,'t'],[.22,1.08,'n'],[.27,.98,'b'],[.275,.86,'b'],[.245,.76,'b'],[.20,.685,'b'],[.13,.64,'b'],[.05,.625,'b'],[-.3,.615,'t']]}
''' +w[b:]
w=w.replace('  let y = 0, top = 0, rock = 0;','  let y = SEA_FLOOR, top = 0, rock = 0;',1)
a=w.index('const STAIR_ROWS =');b=w.index('// dirt: paths',a);w=w[:a]+(here/'routes.js').read_text()+'\n'+w[b:]
a=w.index('const TRAILS = [');b=w.index('].map(pl =>',a)
w=w[:a]+'''const TRAILS=[
''' +w[b:]
a=w.index('const PLAZA =');b=w.index('// distance from the dirt',a)
w=w[:a]+'''// the trodden earth of the clearing above the beach
const PLAZA=poly([[.30,.50],[.38,.455],[.46,.435],[.52,.445],[.57,.475],[.61,.52],[.625,.60],[.62,.70],[.60,.80],[.58,.90],[.555,1.0],[.40,1.0],[.37,.90],[.345,.80],[.31,.70],[.28,.60]],0);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
''' +w[b:]
a=w.index('const SHADE = [');b=w.index('\n',a)
w=w[:a]+'const SHADE = [[0.06, 0.15, 3.6, PL], [0.25, 0.04, 3.0, PL], [0.44, 0.03, 3.0, PL], [0.06, 0.40, 3.0, M(1.8)], [0.30, 0.36, 2.4, M(1.8)], [0.12, 0.80, 2.6, M(1.2)], [0.35, 0.70, 2.4, 0], [0.62, 0.95, 2.4, 0], [0.56, 0.24, 2.4, CLIFF]]'+w[b:]
a=w.index('  // The authored court');b=w.index('  return { y, top, rock };',a)
w=w[:a]+'''  const fill=fillAt(x,z);if(fill>y+.01){y=fill;rock=0;}
  const court=polyAt(PLAZA,x,z);
  if(court!==null&&court<0){y=Math.max(y,0);top=0;rock=0;}
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
w=w.replace('const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial',"const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='coast-cliffs';mesh.customDepthMaterial")
w=w.replace('const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));','const d = Math.max(-4, Math.min(4, trailEdge(x, z)));')
w=w.replace('%3===0','%7===0').replace('i%4===0','i%9===0')
w=w.replace('const rr=.32*K;','const rr=.22*K;').replace('z,.55*K,{sy:.55','z,.36*K,{sy:.50')
# The beach: pale sand from the waterline up to the clearing's earth, wet and darker where the wash reaches.
sand_at='''  vec3 col=mix(trail,grass,clamp(wgt.x+tuft*.6,0.,1.));'''
assert sand_at in w
w=w.replace(sand_at,sand_at+'''
  vec2 sq=seaQ(q);float sdist=sq.y-zShoreG(sq.x)+(vnoise(q*.45+5.)-.5)*3.2+(vnoise(q*1.7)-.5)*.8;
  float beach=smoothstep(-${M(2.5).toFixed(2)},-${M(1.8).toFixed(2)},sdist)*(1.-smoothstep(${M(.25).toFixed(2)},${M(.8).toFixed(2)},vW.y));
  vec3 sand=mix(${L('#e9c77f')},${L('#f2d898')},smoothstep(.3,.7,n1));
  sand=mix(sand,${L('#f7e3ae')},smoothstep(.6,.85,fbm(q*.45+4.))*.5);
  sand=mix(sand,${L('#d9b06a')},smoothstep(.62,.84,fbm(q*.9+11.))*.3);
  sand=mix(sand,${L('#cfa86b')},smoothstep(-${M(.9).toFixed(2)},-.2,sdist)*.5);
  col=mix(col,sand,beach);''',1)
# No ravines between the terraces (fill.js); routes ride the filled ground.
w=w.replace('// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',(here/'fill.js').read_text()+'\n'+(here/'coast.js').read_text()+'\n// the shape of the land: height and how much of it is a raised top\nfunction field(x, z) {',1)
a=w.index('function buildLedges(){');w=w[:a]+(here/'paving.js').read_text()+'\n'
for must in['SEA_FLOOR','fillAt','seaDist','COAST_PORTS','sdist']:assert must in w,must
(here/'world.js').write_text(w.rstrip()+'\n')
