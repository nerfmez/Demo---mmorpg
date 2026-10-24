// ---------- layout: traced from the concept's screen and sized by the camera ----------
// (u, v) are fractions of the 1672x941 concept (ruins-approach-40deg). Every element is authored as
// it appears on screen: where its foot is, how wide it is, where its top is. Its real size comes
// from the camera, so the silhouettes land where the concept has them at any world scale K.
// Read in 3D the concept is: the hero's path, a rock ridge (with a second tier on its left), and
// behind the ridge a plaza only a metre up, reached by a gently climbing paved ramp round the
// ridge's right end. (Its stair rows run straight across the screen, which only a gentle ramp
// allows; a plaza as high as the ridge would stand in front of it.)
placeCamera(); camera.updateMatrixWorld();
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _pv = new V3();
function P(u, v, y = 0) {
  _ndc.set(u * 2 - 1, 1 - v * 2); _ray.setFromCamera(_ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction, t = (y - o.y) / d.y;
  return [o.x + d.x * t, o.z + d.z * t];
}
const vOf = (x, y, z) => (1 - _pv.set(x, y, z).project(camera).y) / 2;
// the height of something standing at (x, base, z) whose top shows at screen v = vt
// (stepped up from the ground, then refined: a search from far above would pass behind the camera)
function tall(x, z, base, vt) {
  let m = 0; const step = 0.25;
  while (m < 40 * K && vOf(x, base + m + step, z) > vt) m += step;
  let lo = m, hi = m + step; for (let i = 0; i < 12; i++) { const c = (lo + hi) / 2; if (vOf(x, base + c, z) > vt) lo = c; else hi = c; }
  return (lo + hi) / 2;
}
// the width on the plane y between screen u0 and u1 at screen v
const wide = (u0, u1, v, y) => { const a = P(u0, v, y), b = P(u1, v, y); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
const K = 3.12;   // world scale: the concept's layout, K times bigger, seen from K times farther (more room, same frame)
const M = v => v * K;   // concept metres to world metres
const PL = M(2.3);   // the plaza and the ruins
const T1 = M(3.6);   // the rock ridge between the path and the plaza, at its highest
const T2B = M(3.3), T2 = M(5.1);   // the high tier on the ridge's left: its foot and its top
const inFrame = (u, v) => u > -0.08 && u < 1.08 && v > -0.06 && v < 1.06;
// ground mesh bounds (metres)
const GX0 = -30 * K, GX1 = 30 * K, GZ0 = -44 * K, GZ1 = 16 * K;
function noise2(x, z) { return Math.sin(x * 0.7 + Math.sin(z * 0.53)) * 0.5 + Math.sin(z * 0.9 + x * 0.21) * 0.5; }

// Raised ground: closed outlines. 'b' points sit at a cliff foot (on the tier below), 't' points on
// the top off screen, 'n' points at the foot of a grassy bank (`soft` metres wide, no rock). A
// cliff's top edge sits `lean` metres back from its foot, as the concept's faces step back.
const TERRACES=[
 {top:PL,base:M(.25),ledge:true,soft:M(1.2),lean:M(.32),pts:[[.255,.535,'b'],[.36,.57,'b'],[.48,.574,'b'],[.58,.55,'b'],[.67,.50,'b'],[.73,.45,'b'],[.76,.40,'n'],[.74,.33,'n'],[.64,.305,'n'],[.54,.32,'n'],[.44,.335,'n'],[.34,.37,'b'],[.275,.42,'b']]},
 {top:M(1.12),base:0,ledge:true,soft:M(1.0),lean:M(.27),pts:[[.41,.705,'b'],[.51,.74,'b'],[.64,.765,'b'],[.75,.71,'b'],[.80,.635,'b'],[.75,.59,'n'],[.66,.60,'n'],[.55,.65,'n'],[.46,.65,'n']]},
 {top:M(1.45),base:0,ledge:true,soft:M(1.3),lean:M(.33),pts:[[-.3,.78,'t'],[.05,.70,'b'],[.13,.69,'b'],[.19,.63,'b'],[.18,.58,'b'],[.12,.51,'n'],[.10,.38,'n'],[.13,.27,'n'],[.1,-.2,'t'],[-.3,-.2,'t']]},
 {top:M(2.9),base:M(1.4),ledge:true,soft:M(1.5),lean:M(.35),pts:[[-.3,.43,'t'],[.08,.43,'b'],[.155,.37,'b'],[.18,.29,'n'],[.23,.20,'n'],[.39,.23,'b'],[.52,.245,'b'],[.58,.22,'n'],[.58,-.3,'t'],[-.3,-.3,'t']]},
 {top:M(2.8),base:M(1.3),ledge:true,soft:M(1.3),lean:M(.32),pts:[[.68,.29,'b'],[.76,.30,'b'],[.83,.34,'b'],[.88,.385,'b'],[.94,.39,'n'],[1.2,.3,'t'],[1.2,-.3,'t'],[.66,-.3,'t']]},
 {top:M(1.1),base:0,ledge:true,soft:M(1.0),lean:M(.28),pts:[[.90,.70,'b'],[.98,.75,'b'],[1.2,.8,'t'],[1.2,.25,'t'],[.98,.35,'n'],[.95,.45,'n'],[.94,.57,'n']]}
].map(T => {
  let pts = T.pts.map(([u, v, k, h]) => { const [x, z] = P(u, v, h ?? (k === 't' ? T.top : T.base)); return { x, z, wall: k === 'b' && inFrame(u, v), u, v }; });
  // a smooth closed outline through the authored points, sampled about every 1.3 m; a sample's
  // wall flag says whether the stretch from it to the next one is cliff
  const n = pts.length, curve = new THREE.CatmullRomCurve3(pts.map(q => new V3(q.x, 0, q.z)), true, 'centripetal'), out = [];
  for (let j = 0; j < n; j++) {
    const a = pts[j], b = pts[(j + 1) % n], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.3));
    for (let k = 0; k < steps; k++) { const q = curve.getPoint((j + k / steps) / n); out.push({ x: q.x, z: q.z, wall: a.wall && b.wall }); }
  }
  pts = out;
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  return { ...T, pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
});
// signed distance to an outline: negative inside; polyAt.wall says whether the nearest edge is cliff
function polyAt(T, x, z) {
  if (x < T.minX - 3 || x > T.maxX + 3 || z < T.minZ - 3 || z > T.maxZ + 3) return null;
  const p = T.pts; let best = Infinity, inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j], b = p[i];
    if ((b.z > z) !== (a.z > z) && x < (a.x - b.x) * (z - b.z) / (a.z - b.z) + b.x) inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z, e2 = ex * ex + ez * ez;
    if (e2 < best) { best = e2; polyAt.wall = a.wall; }
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}
// the ramp: paving rows traced from the concept, [v, u0, u1] from its foot to its top
// Authoring coordinates follow the reference; all consumers use the same real
// XZ routes, heights and widths. Shared anchors are actual walking junctions.
const ROAD_NODES={
 arrival:[.50,.86,0,.094],
 fork:[.405,.77,0,.078],
 bend:[.80,.73,.30,.068],
 upper:[.80,.46,1.90,.061],
 upperFork:[.87,.525,1.42,.060]
};
const ROUTE_SPECS=[
 {id:'south',pts:[[.53,1.18,0,.100],[.54,1.055,0,.098],[.53,.955,0,.094],ROAD_NODES.arrival]},
 {id:'right',pts:[ROAD_NODES.arrival,[.64,.82,0,.080],ROAD_NODES.bend,[.86,.66,.63,.065],[.88,.59,1.00,.063],ROAD_NODES.upperFork,ROAD_NODES.upper,[.72,.42,2.20,.064],[.66,.409,2.30,.060],[.615,.412,2.30,.055]]},
 {id:'left',pts:[ROAD_NODES.arrival,ROAD_NODES.fork,[.31,.68,.10,.073],[.265,.615,.20,.066],[.225,.57,.45,.062],[.205,.525,.82,.061],[.195,.49,1.10,.060],[.18,.455,1.30,.059],[.175,.418,1.42,.058],[.185,.387,1.47,.057],[.205,.358,1.73,.057],[.225,.326,2.04,.058],[.238,.29,2.22,.052],[.247,.25,2.32,.050],[.245,.20,2.55,.049],[.23,.15,2.65,.049],[.205,.08,2.65,.050],[.20,-.12,2.65,.052]]},
 {id:'shortcut',pts:[ROAD_NODES.fork,[.44,.71,.15,.068],[.485,.666,.65,.061],[.55,.63,1.02,.059],[.63,.59,1.12,.059],[.71,.55,1.48,.060],[.765,.51,1.78,.061],ROAD_NODES.upper]},
 {id:'east',pts:[ROAD_NODES.bend,[.88,.69,.45,.071],[.96,.61,.55,.078],[1.045,.55,.62,.082],[1.16,.535,.70,.085]]},
 {id:'east-north',pts:[ROAD_NODES.upperFork,[.945,.505,1.45,.060],[.95,.425,1.75,.060],[.93,.35,2.22,.060],[.98,.25,2.80,.064],[1.02,.14,2.80,.068]]}
];
const ROAD_CELL=M(3);
const ROAD_GRID=new Map();
const ROUTES=ROUTE_SPECS.map(spec=>{
 const anchors=spec.pts.map(([u,v,h,w])=>{const y=M(h),[x,z]=P(u,v,y);return{x,z,y,w:wide(u-w/2,u+w/2,v,y)};});
 const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new V3(p.x,p.y,p.z)),false,'centripetal');
 const n=Math.max(28,Math.ceil(curve.getLength()/.72)),rows=[];let length=0;
 for(let i=0;i<n;i++){
  const t=i/(n-1),p=curve.getPoint(t),f=t*(anchors.length-1),j=Math.min(anchors.length-2,Math.floor(f)),k=f-j,d=curve.getTangent(t),len=Math.hypot(d.x,d.z),ux=d.x/len,uz=d.z/len;
  p.y=THREE.MathUtils.clamp(p.y,Math.min(anchors[j].y,anchors[j+1].y),Math.max(anchors[j].y,anchors[j+1].y));
  if(i)length+=Math.hypot(p.x-rows[i-1].x,p.z-rows[i-1].z);
  rows.push({x:p.x,y:p.y,z:p.z,w:anchors[j].w+(anchors[j+1].w-anchors[j].w)*k,ux,uz,nx:uz,nz:-ux,s:length,section:j});
 }
 const route={id:spec.id,rows,n,len:length,bank:M(.70),half:rows.reduce((s,r)=>s+r.w,0)/n/2};
 // Local lookup avoids scanning the whole road network per terrain vertex.
 for(let i=0;i<n-1;i++){
  const A=rows[i],B=rows[i+1],pad=Math.max(A.w,B.w)/2+M(1.7),segment={A,B,route};
  for(let ix=Math.floor((Math.min(A.x,B.x)-pad)/ROAD_CELL);ix<=Math.floor((Math.max(A.x,B.x)+pad)/ROAD_CELL);ix++)for(let iz=Math.floor((Math.min(A.z,B.z)-pad)/ROAD_CELL);iz<=Math.floor((Math.max(A.z,B.z)+pad)/ROAD_CELL);iz++){
   const key=ix+','+iz;if(!ROAD_GRID.has(key))ROAD_GRID.set(key,[]);ROAD_GRID.get(key).push(segment);
  }
 }
 return route;
});
const ROAD_JUNCTIONS=Object.entries(ROAD_NODES).map(([id,[u,v,h,w]])=>{const y=M(h),[x,z]=P(u,v,y);return{id,x,y,z,r:wide(u-w/2,u+w/2,v,y)*.48};});
const ST={...ROUTES.find(r=>r.id==='left'),top:M(2.65),bank:M(.70)};
function stairsAt(x,z){
 let result={a:-10,s:1e9,y:0,half:0,inside:false},best=1e9;
 const segments=ROAD_GRID.get(Math.floor(x/ROAD_CELL)+','+Math.floor(z/ROAD_CELL))||[];
 for(const{A,B,route}of segments){
  const dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz,t=THREE.MathUtils.clamp(((x-A.x)*dx+(z-A.z)*dz)/l2,0,1);
  const distance=Math.hypot(x-A.x-dx*t,z-A.z-dz*t),half=(A.w+(B.w-A.w)*t)/2,edge=distance-half;
  if(edge<best){best=edge;result={a:(A.s+(B.s-A.s)*t)/route.len,s:distance,y:A.y+(B.y-A.y)*t,half,route:route.id,inside:distance<half+.12};}
 }
 for(const j of ROAD_JUNCTIONS){
  const d=Math.hypot(x-j.x,z-j.z),blend=1-smooth(j.r*.42,j.r+M(.22),d);
  if(blend>0)result.y=THREE.MathUtils.lerp(result.y,j.y,blend);
 }
 return result;
}
// World-space handles for later game placement. Translate with the terrain.
const HILL_PORTS=[['south','south',0],['northwest','left',-1],['east','east',-1],['northeast','east-north',-1]].map(([id,routeId,index])=>{
 const route=ROUTES.find(r=>r.id===routeId),p=route.rows.at(index),sign=index===0?-1:1;
 return{id,route:routeId,x:p.x,y:p.y,z:p.z,width:p.w,dx:p.ux*sign,dz:p.uz*sign};
});

// dirt: paths as [u, v, half width as a screen fraction, plane], and the plaza as an outline
const TRAILS=[
].map(pl => pl.map(([u, v, hu, h]) => { const [x, z] = P(u, v, h); return new V3(x, wide(u - hu, u + hu, v, h) / 2, z); }))
  // a smooth curve through the authored points (width rides along in y), sampled every 1.2 m
  .map(pl => { const c = new THREE.CatmullRomCurve3(pl, false, 'centripetal'); return c.getSpacedPoints(Math.ceil(c.getLength() / 1.2)).map(p => ({ x: p.x, z: p.z, w: p.y })); });
const poly = (pts, h) => {
  const q = pts.map(([u, v]) => { const [x, z] = P(u, v, h); return { x, z }; }), xs = q.map(p => p.x), zs = q.map(p => p.z);
  return { pts: q, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};
// the plaza: a ring of dirt round the stone circle, traced from the concept; grass in the middle
const PLAZA=poly([[.49,.36],[.54,.33],[.64,.33],[.70,.365],[.70,.405],[.64,.425],[.55,.405],[.49,.385]],PL);
const PLAZA_HOLE=poly([[2,2],[2.1,2],[2.1,2.1]],0);
// distance from the dirt's edge: negative on the dirt
function trailAt(x, z) {
  const hole = polyAt(PLAZA_HOLE, x, z);
  let best = Math.max(polyAt(PLAZA, x, z) ?? Infinity, hole === null ? -Infinity : -hole);
  for (const pl of TRAILS) for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z) - (a.w + (b.w - a.w) * t);
    if (d < best) best = d;
  }
  return best;
}
// the trail edge wanders: a slow swell and a shorter wobble on top of the authored width
const edgeWob = (x, z) => 0.5 * noise2(x * 0.19 + 3.1, z * 0.23 - 1.7) + 0.25 * noise2(x * 0.51 - 2, z * 0.44 + 4);
const trailEdge=(x,z)=>{const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.025&&st.a<1.035?st.s-st.half:Infinity);};
// patches of leaf shade on the ground, under the concept's trees: [u, v, radius in concept metres, plane]
const SHADE = [[0.07, 0.32, 3.0, PL], [0.32, 0.27, 3.0, PL], [0.72, 0.24, 2.6, PL], [0.95, 0.5, 3.0, PL], [0.9, 0.8, 2.4, 0], [0.2, 0.85, 2.4, 0], [0.45, 0.24, 1.8, PL], [0.12, 0.6, 2.2, T1]]
  .map(([u, v, r, h]) => { const [x, z] = P(u, v, h); return { x, z, r: M(r) }; });
const shadeAt = (x, z) => SHADE.reduce((m, s) => Math.max(m, 1 - smooth(s.r * 0.45, s.r, Math.hypot(x - s.x, z - s.z))), 0);

// the shape of the land: height and how much of it is a raised top
function field(x, z) {
  let y = 0, top = 0, rock = 0;
  for (const T of TERRACES) {
    const d = polyAt(T, x, z);
    if (d === null) continue;
    // a cliff rises over its lean; elsewhere the edge is a grassy bank `soft` metres wide
    const cliff = polyAt.wall && T.ledge;
    const w = cliff ? 1 - smooth(-0.35 - T.lean, 0.05, d) : 1 - smooth(-T.soft, 0.25, d);
    // Cover the exposed backing of the cliff with stone, including its shallow
    // shelves. A slope-only mask left green triangular ground between panels.
    if(cliff)rock=Math.max(rock,smooth(-T.lean-1.1,-T.lean-.35,d)*(1-smooth(.05,.45,d)));
    const b = T.base || 0;
    if (w > 0) { y = Math.max(y, b + ((T.topAt ? T.topAt(x) : T.top) - b) * w); top = Math.max(top, w); }
  }
  const court=polyAt(PLAZA,x,z);
  if(court!==null&&court<0){y=PL;top=1;rock=0;}
  const st=stairsAt(x,z);
  if(st.a>-.03&&st.a<1.04&&st.s<st.half+ST.bank){
    const k=smooth(st.half-.06,st.half+ST.bank,st.s);
    y=st.y+(y-st.y)*k;
    if(st.inside)rock=0;
  }
  return { y, top, rock };
}
function height(x, z) {
  const f = field(x, z);
  return f.y + 0.05 * noise2(x * 0.6, z * 0.6) + 0.08 * f.top * noise2(x * 0.4 + 7, z * 0.4);
}

// ---------- ground: grass, the dirt trails and leaf shade, one painted mesh ----------
const GROUND_BAKE = { value: null };
function buildGround() {
  const W = GX1 - GX0, D = GZ1 - GZ0;
  const g = new THREE.PlaneGeometry(W, D, Math.round(W * 1.35), Math.round(D * 1.35));
  g.rotateX(-Math.PI / 2); g.translate((GX0 + GX1) / 2, 0, (GZ0 + GZ1) / 2);
  const p = g.attributes.position, n = p.count, w = new Float32Array(n * 3), td = new Float32Array(n), rock = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const f=field(x,z);
    // The detailed stone shell owns this surface. Sink its hidden heightfield
    // backing so coarse terrain triangles cannot poke through the rock face.
    p.setY(i, f.y + 0.05 * noise2(x * 0.6, z * 0.6) + 0.08 * f.top * noise2(x * 0.4 + 7, z * 0.4) - f.rock * M(2.5));
    rock[i]=f.rock;
    const st = stairsAt(x, z);
    const d = Math.max(-4, Math.min(4, trailEdge(x, z)));
    td[i] = d;
    const trail = 1 - smooth(-0.5, 0.5, d);
    w[i * 3] = 1 - trail; w[i * 3 + 1] = trail; w[i * 3 + 2] = shadeAt(x, z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(w, 3)); g.setAttribute('trailD', new THREE.BufferAttribute(td, 1));
  g.setAttribute('cliffRock',new THREE.BufferAttribute(rock,1));
  g.computeVertexNormals();
  const box = new THREE.Vector4(GX0, GZ0, W, D);
  const mat = paint({
    vertexColors: true, shade: [0.5, 0.42, 0.4], mid: [0.8, 0.7, 0.62], band: [-0.2, 0.18],
    uniforms: { uBake: GROUND_BAKE, uBakeBox: { value: box } },
    extraVert: 'attribute float cliffRock; varying float vCliffRock;',
    extraVertMain: 'vCliffRock=cliffRock;',
    extraFrag: 'uniform sampler2D uBake; uniform vec4 uBakeBox; varying float vCliffRock;',
    albedo: /* glsl */`
  vec3 a=texture2D(uBake,(vW.xz-uBakeBox.xy)/uBakeBox.zw).rgb; diffuseColor.rgb=a*a;
  float gw=vColor.x*(1.-max(vCliffRock,1.-smoothstep(.45,.75,normalize(vWN).y)));
  gShade=mix(uShade,vec3(.3,.46,.46),gw); gMid=mix(uMid,vec3(.64,.78,.68),gw);`,
  });
  // bake: draw the ground once, flat, into a 2048 texture with the full painted-colour shader
  const rt = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: false });
  rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
  const bakeMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uBox: { value: box } },
    vertexShader: `attribute vec3 color; attribute float trailD; attribute float cliffRock; uniform vec4 uBox; varying vec3 vW, vWN, vColor; varying float vD, vCliffRock;
      void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; vWN=normalize(mat3(modelMatrix)*normal); vColor=color; vD=trailD; vCliffRock=cliffRock;
        gl_Position=vec4((vW.xz-uBox.xy)/uBox.zw*2.-1.,0.,1.); }`,
    fragmentShader: `varying vec3 vW, vWN, vColor; varying float vD, vCliffRock;
      ${NOISE}
      void main(){
  vec3 wgt=vColor; vec2 q=vW.xz;
  float n1=fbm(q*.32), n2=vnoise(q*1.9+3.), n3=vnoise(q*6.5);
  // the trail edge: the baked distance broken up at a metre and a hand's width, a soft ragged
  // border; grass islands creep onto the dirt near the edge and bare patches into the grass
  float dd=vD+(vnoise(q*1.3+7.)-.5)*.5+(vnoise(q*4.2)-.5)*.25;
  float tr=1.-smoothstep(-.3,.3,dd);
  tr=max(tr,step(.8,vnoise(q*1.1+21.))*(1.-smoothstep(.1,.8,dd))*.9);
  tr*=1.-step(.76,vnoise(q*1.6+11.))*smoothstep(-2.,-.5,dd);
  wgt.x=1.-tr; wgt.y=tr;
  // the trail: packed orange dirt with darker trodden patches, worn paler middle and small pebbles
  vec3 trail=mix(${L('#d4ac70')},${L('#e4c28a')},smoothstep(.3,.7,n1));
  trail=mix(trail,${L('#b99765')},smoothstep(.6,.8,fbm(q*.8+5.))*.4);
  trail=mix(trail,${L('#ecd1a0')},(1.-smoothstep(-3.,-1.,vD))*smoothstep(.45,.7,fbm(q*.5+2.))*.35);
  trail*=.97+.05*n3;
  vec2 pc=fract(q*2.6)-.5; float peb=step(.9,hash12(floor(q*2.6)))*(1.-smoothstep(.1,.16,length(pc)));
  trail=mix(trail,mix(${L('#a99a86')},${L('#d8cfc0')},step(0.,pc.y)),peb*.85);
  // grass: bright yellow-green, darker mottles and pale specks
  vec3 grass=mix(${L('#90ad38')},${L('#b3c540')},smoothstep(.32,.7,n1));
  grass=mix(grass,${L('#5a8536')},smoothstep(.56,.78,n2)*.55);
  grass=mix(grass,${L('#cdd65a')},step(.965,hash12(floor(q*9.)))*.7);
  // a ragged grass edge spilling over the dirt
  float tuft=step(.5,vnoise(q*5.))*(1.-smoothstep(-.9,-.1,dd))*smoothstep(-1.6,-.6,dd);
  vec3 col=mix(trail,grass,clamp(wgt.x+tuft*.6,0.,1.));
  // the steep faces behind the stones
  float steep=1.-smoothstep(.45,.75,normalize(vWN).y);
  col=mix(col,${L('#9a958d')},max(steep,vCliffRock));
  // dappled leaf shade: cool green-blue on grass, warm brown on dirt
  float leaves=smoothstep(.47,.55,fbm(q*.62+vec2(3.,7.))+.14*vnoise(q*2.7));
  float dap=clamp(leaves*wgt.z*1.3,0.,1.);
  vec3 sh=mix(vec3(.42,.46,.68),vec3(.3,.38,.72),wgt.x);
  col*=mix(vec3(1.),sh,dap*.9);
  gl_FragColor=vec4(sqrt(clamp(col,0.,1.)),1.); }`,
  });
  const bakeScene = new THREE.Scene(), bakeMesh = new THREE.Mesh(g, bakeMat);
  bakeMesh.frustumCulled = false; bakeScene.add(bakeMesh);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(bakeScene, camera); renderer.setRenderTarget(prev);
  bakeMat.dispose();
  GROUND_BAKE.value = rt.texture;
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true;
  return mesh;
}

// ---------- the terrace cliffs: one continuous rock face, grass on its lip and in its cracks ----------
// The face follows the outline. It is split into columns by vertical cracks; each column is a few
// flat facets with shared section edges, so the cliff reads as one cracked rock wall, not
// stones set in a row. A grassy lip rolls over the top.
function cliffRuns(T) {
  const p = T.pts, n = p.length;
  const onStairs = q => stairsAt(q.x, q.z).s < stairsAt(q.x,q.z).half + ST.bank + M(.55) && stairsAt(q.x, q.z).a > -0.35 && stairsAt(q.x, q.z).a < 1.65;   // hillside and the continuous court landing
  const wall=i=>p[i].wall;
  const runs = [];
  if (p.every((_, i) => wall(i))) return [{ pts: p.slice(), closed: true }];
  let k = p.findIndex((_, i) => !wall(i));
  for (let c = 0; c < n; c++) {
    const i = (k + c) % n;
    if (!wall(i)) continue;
    if (!wall((i + n - 1) % n)) runs.push({ pts: [p[i]], closed: false });
    runs[runs.length - 1].pts.push(p[(i + 1) % n]);
  }
  return runs;
}
// All masonry shares the approved paint shader and the scene's stone palette.
// Chamfered eight-corner rings retain broad readable faces with chipped edges.
// The bevel is a world-space width, so low slabs never acquire swollen outlines.
// Same grey family as the approved arrival beach stones (five entries keep the seeded picks).
const ruinPalette = ['#cbc6c2', '#bfbab8', '#d2ccc6', '#b6b1b2', '#c7c1bc'];
// Offset the stone's shadow-depth pass by its own surface slope. A global light
// bias alone cannot remove the striped self-shadow on nearly edge-on facets.
const masonryDepth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:4});
function ruinGeometry(w, h, d, moss = 0.15, color = null, natural = false) {
  const bevel = Math.min(w, h, d) * (natural ? .14 : .065);
  const cut = Math.min(w, d) * (natural ? .21 : .10);
  const pos=[], colors=[], tone=new THREE.Color(color || pick(ruinPalette));
  const contour=(ww,dd,c)=>[[-ww/2+c,-dd/2],[ww/2-c,-dd/2],[ww/2,-dd/2+c],[ww/2,dd/2-c],[ww/2-c,dd/2],[-ww/2+c,dd/2],[-ww/2,dd/2-c],[-ww/2,-dd/2+c]];
  const rings=[0,bevel,h-bevel,h].map((y,j)=>contour(w-(j===0||j===3?bevel*1.2:0),d-(j===0||j===3?bevel*1.2:0),cut).map(([x,z],k)=>new V3(x+R(-1,1)*bevel*.30,y+(j===0?0:R(-1,1)*bevel*.22),z+R(-1,1)*bevel*.30)));
  const tri=(a,b,c,col)=>{for(const v of [a,b,c]){pos.push(v.x,v.y,v.z);colors.push(col.r,col.g,col.b);}};
  const face=(a,b,c,d,col)=>{tri(a,b,c,col);tri(a,c,d,col);};
  for(let j=0;j<3;j++) for(let k=0;k<8;k++){
    const n=(k+1)%8, c=tone.clone().multiplyScalar(j===0?.90:j===2?1.04:1+R(-.035,.035));
    face(rings[j][k],rings[j+1][k],rings[j+1][n],rings[j][n],c);
  }
  const top=tone.clone().multiplyScalar(1.03);
  // Broad stone tops, with partial moss, rather than giant green triangular caps.
  if(rand()<moss) top.lerp(new THREE.Color(pick(MOSS)),.62);
  for(let k=0;k<8;k++){
    tri(new V3(0,h,0),rings[3][(k+1)%8],rings[3][k],top);
    tri(new V3(0,0,0),rings[0][k],rings[0][(k+1)%8],tone);
  }
  // Hairline fractures branch from chipped block edges. They are geometry on
  // the front face, coloured in the same grey-green family, never black ink.
  if (h>.45*K && w>.35*K && rand()<.65) {
    const c=tone.clone().multiplyScalar(.56), zz=d/2+.006, half=w/2-cut;
    const x=R(-.65,.65)*half, y0=h-bevel*1.3, len=Math.min(h*.6,R(.3,.65)*K);
    const path=[[x,y0],[x-.10*K,y0-len*.35],[x+.08*K,y0-len*.65],[x-.04*K,y0-len]];
    for(let i=0;i<path.length-1;i++){
      const[a,b]=path[i],[a1,b1]=path[i+1],th=.008*K;
      face(new V3(a1-th*.5,b1,zz),new V3(a1+th*.5,b1,zz),new V3(a+th,b,zz),new V3(a-th,b,zz),c);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals(); return g;
}
function collectStone(g,x,y,z,ry=0,rx=0,rz=0,ink=.025){
  g.deleteAttribute('uv');
  const m=new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new V3(1,1,1));
  g.applyMatrix4(m); stoneParts.push(g);
  const shell=g.clone(), ps=shell.attributes.position, ns=shell.attributes.normal;
  shell.deleteAttribute('color');
  for(let i=0;i<ps.count;i++) ps.setXYZ(i,ps.getX(i)+ns.getX(i)*ink,ps.getY(i)+ns.getY(i)*ink,ps.getZ(i)+ns.getZ(i)*ink);
  stoneLines.push(shell);
}
function block(x,y,z,w,h,d,ry=0,moss=.2,o={}){
  collectStone(ruinGeometry(Math.max(.08,w),Math.max(.06,h),Math.max(.08,d),moss,o.base,o.natural),x,y,z,ry,o.rx||0,o.rz||0,o.ink??.023*K);
}
function solidBox(x,z,w,d,ry=0){ COLLIDERS.push({x,z,w,d,ry,box:true}); }

// A fractured outcrop. Its horizontal shelves and offset cracks continue around
// the ridge; it is one rock body with plants in its joints, not a fence of drums.
// The arrival beach's ledge: faceted grey blocks stacked in courses along the
// cliff face, mossy on top and outlined, with the fractured face left behind
// them as a dark backing. The blocks use their own seed, so the approved
// stream (and every rock, plant and collider placed after the cliffs) is kept.
function ledgeStones(T,a,b,out,l,seg){
  const keep=seed;seed=9173+seg*977+Math.round(Math.abs(a.x*13+a.z*7));
  const blk={chamfer:.12,jitter:.16,extra:7},dx=(b.x-a.x)/l,dz=(b.z-a.z)/l,ry=Math.atan2(-dz,dx);
  for(let s=R(0,.3)*K;s<l;){
    const w=R(.38,.72)*K,x=a.x+dx*(s+w/2),z=a.z+dz*(s+w/2);s+=w*.92;
    const st=stairsAt(x,z);if(st.inside||st.s<st.half+.35+w*.5)continue;
    const top=Math.min(T.topAt?T.topAt(x):T.top,height(x-out.x*(T.lean+.4),z-out.z*(T.lean+.4))+.08);
    const base=height(x+out.x*1.6,z+out.z*1.6)-.28,wall=top-base;
    if(wall<.22*K)continue;
    const n=Math.max(1,Math.round(wall/(.8*K))),ch=wall/n;
    for(let c=0;c<n;c++){
      const last=c===n-1,set=.18*K-T.lean*(c+.5)/n-c*.06*K;
      const sx=x+out.x*set+R(-.06,.06)*K,sz=z+out.z*set+R(-.06,.06)*K;
      addStone(sx,base+c*ch-.12,sz,w*R(.92,1.06),ch+(last?R(.05,.22)*K:.18),R(.42,.55)*K,{...blk,ry:ry+R(-.1,.1),moss:last?.6:.08});
    }
  }
  seed=keep;
}
function buildCliffs(){
  const pos=[],col=[], stone=ruinPalette.map(c=>new THREE.Color(c).multiplyScalar(.72));
  const face=(a,b,c,d,color,out)=>{
    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    const normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a));
    const vs=normal.dot(out)>0?[a,b,c,a,c,d]:[a,c,b,a,d,c];
    for(const p of vs){pos.push(p.x,p.y,p.z);col.push(color.r,color.g,color.b);}
  };
  for(const T of TERRACES){
    if(!T.ledge)continue;
    for(const run of cliffRuns(T)){
      const pts=run.pts; let length=0;
      // Every bend has one outward direction shared by both adjoining panels.
      // Per-panel normals used to pull their endpoints apart at curved corners.
      const edgeOut=pts.slice(0,-1).map((a,i)=>{
        const b=pts[i+1],n=new V3(b.z-a.z,0,a.x-b.x).normalize();
        if(polyAt(T,a.x+n.x*.7,a.z+n.z*.7)<0)n.negate();
        return n;
      });
      const jointOut=pts.map((p,i)=>{
        const before=edgeOut[Math.max(0,i-1)],after=edgeOut[Math.min(edgeOut.length-1,i)];
        return before.clone().add(after).normalize();
      });
      for(let i=0;i<pts.length-1;i++){
        const a=pts[i],b=pts[i+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz), out=new V3(dz/l,0,-dx/l);
        if(polyAt(T,a.x+out.x*.7,a.z+out.z*.7)<0)out.negate();
        const normalAt=t=>jointOut[i].clone().lerp(jointOut[i+1],t).normalize();
        const row=[0,.29,.59,.83,1], n=Math.max(1,Math.ceil(l/(.62*K)));
        for(let k=0;k<n;k++){
          const s0=length+l*k/n,s1=length+l*(k+1)/n;
          const profile=(t,s,r)=>{
            const x=a.x+dx*t,z=a.z+dz*t,peak=Math.min((T.topAt?T.topAt(x):T.top),height(x-normalAt(t).x*(T.lean+.4),z-normalAt(t).z*(T.lean+.4))+.08);
            const normal=normalAt(t);
            const base=height(x+normal.x*1.6,z+normal.z*1.6)-.28;
            const f=row[r], fault=(r===0||r===4?0:.18*K*Math.sin(s*.81+r*3.1));
            const step=(r===0?.42:r===1?.34:r===2?.16:r===3?-.05:-.13)*K;
            const fracture=.12*K*Math.sin(s/(1.05*K)*2.18+r*.83)+.06*K*Math.sin(s*1.8+r);
            const off=step+fracture-T.lean*f*.46;
            return new V3(x+normal.x*off,base+(peak-base)*f+fault+(r===4?.12*K*Math.sin(s*.72):0),z+normal.z*off);
          };
          for(let r=0;r<4;r++){
            const v0=profile(k/n,s0,r),v1=profile((k+1)/n,s1,r),v2=profile((k+1)/n,s1,r+1),v3=profile(k/n,s0,r+1);
            const c=stone[(Math.floor(s0/(1.3*K))+r*2)%stone.length].clone().multiplyScalar(r===0?.89:1+R(-.025,.025));
            if(r>0){
              const old0=v0.clone(),old1=v1.clone();
              // A shallow closed fold gives a stone seam without separating layers.
              v0.addScaledVector(normalAt(k/n),-.055*K);v1.addScaledVector(normalAt((k+1)/n),-.055*K);
              face(old0,old1,v1,v0,c.clone().multiplyScalar(1.05),new V3(0,1,0));
            }
            face(v0,v1,v2,v3,c,out);
            if(r>0){
              // Narrow grey-green seams sit on the face; they do not cut holes.
              const n0=normalAt(k/n),n1=normalAt((k+1)/n);
              const a0=v0.clone().addScaledVector(n0,.012),a1=v1.clone().addScaledVector(n1,.012);
              const b0=a0.clone().add(new V3(-n0.x*.04,-.022*K,-n0.z*.04)),b1=a1.clone().add(new V3(-n1.x*.04,-.022*K,-n1.z*.04));
              face(a0,a1,b1,b0,c.clone().multiplyScalar(.78),out);
            }
          }
          const a0=profile(k/n,s0,4),a1=profile((k+1)/n,s1,4),a2=a1.clone().addScaledVector(normalAt((k+1)/n),-.85*K),a3=a0.clone().addScaledVector(normalAt(k/n),-.85*K);
          a2.y=height(a2.x,a2.z)+.025;a3.y=height(a3.x,a3.z)+.025;
          face(a0,a1,a2,a3,stone[2].clone().lerp(new THREE.Color('#879650'),.25),new V3(0,1,0));
          if((Math.floor(s0/(.62*K))+i)%7===0){
            const r=1+(i%3),v=profile((k+.5)/n,(s0+s1)/2,r);
            const rr=.22*K;
            addBush(v.x+out.x*.1,v.y-.25,v.z+out.z*.1,rr,{sy:.48,tint:R(-.5,.2)});
            grassItems.push({x:v.x,y:v.y,z:v.z,s:R(.6,1),ry:R(0,6.28),k:.92});
          }
          if(k===0 && i%9===0){
            const v=profile(.5,(s0+s1)/2,4),x=v.x-out.x*1.0*K,z=v.z-out.z*1.0*K;
            addBush(x,height(x,z)-.1,z,.36*K,{sy:.50,tint:-.2});
          }
        }
        ledgeStones(T,a,b,out,l,i);
        length+=l;
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,masonryMaterial());mesh.name='hill-cliffs';mesh.customDepthMaterial=masonryDepth;mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function masonryMaterial(){
  // The beach and forest stone light: lavender shadow, cool half-tone.
  return paint({vertexColors:true,shade:[.34,.33,.42],mid:[.63,.61,.66],band:[-.34,.24],
    albedo:`
      float n=vnoise(vW.xz*1.4+vW.y*.23);
      float lichen=smoothstep(.64,.85,n);
      diffuseColor.rgb*=.94+.08*n;
      diffuseColor.rgb=mix(diffuseColor.rgb,${L('#879445')},lichen*.14);
    `});
}
function legacyLedges(){
 // The approved short flights. Only replayed for their seeded draws.
 // Short flights mark steeper portions; the shared ribbon continues underneath
 // the packed-earth landings and across every join.
 for(const route of ROUTES)route.rows.forEach((r,i)=>{
  const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)],dist=Math.hypot(B.x-A.x,B.z-A.z),grade=Math.abs(B.y-A.y)/Math.max(.1,dist);
  const f=i/(route.n-1);
  const flight=route.id==='left'?((r.section>=3&&r.section<=5)||(r.section>=9&&r.section<=10)):route.id==='shortcut'?r.section===1:route.id==='right'?((f>.60&&f<.65)||(f>.78&&f<.83)):false;
  if(!flight)return;
  const depth=dist/(i===0||i===route.n-1?1:2)+.03,n=Math.max(4,Math.round(r.w/(.48*K))),w=r.w/n;
  for(let j=0;j<n;j++){
   const offset=-r.w/2+(j+.5)*w,x=r.x+r.nx*offset,z=r.z+r.nz*offset;
   const jitter=(Math.sin(i*7.3+j*5.7))*.025*K;
   block(x,height(x,z)-.08+jitter*.25,z,w*(.92+.025*Math.sin(i+j)),.16,depth*.94,Math.atan2(r.ux,r.uz)+jitter*.10,.09,{ink:.003*K,base:pick(['#bdb69f','#d1c8b0','#c5bda5','#d9cfb6'])});
  }
  // Low, broken shoulders finish each flight, without narrowing its clear width.
  if(i%2===0)for(const side of[-1,1]){
   const off=side*(r.w/2+.21),x=r.x+r.nx*off,z=r.z+r.nz*off;
   block(x,height(x,z)-.14,z,.40,.27,depth*1.30,Math.atan2(r.ux,r.uz),.12,{ink:0,base:'#c3bda7'});
  }
 });
}
function buildLedges(){
 // Replay the approved flights' seeded draws so every later rock, tree and
 // collider keeps its place; their pieces are discarded and rebuilt below.
 const parts=stoneParts.length,lines=stoneLines.length;
 legacyLedges();stoneParts.length=parts;stoneLines.length=lines;
 const resume=seed;seed=7919;
 stoneStairs();
 seed=resume;
}
function stoneStairs(){
 // One continuous stair on every steep section: a course of grey stones every
 // STEP along the route, square to its smoothed direction. Each course is level,
 // so its front edge stands proud of the slope as a riser.
 const STEP=.42*K,STAIR=['#bdb8b6','#c9c4c0','#b4afb0','#c4beb9'];
 for(const route of ROUTES){
  const steep=new Map();
  route.rows.forEach((r,i)=>{
   const A=route.rows[Math.max(0,i-1)],B=route.rows[Math.min(route.n-1,i+1)];
   steep.set(r.section,Math.max(steep.get(r.section)||0,Math.abs(B.y-A.y)/Math.max(.1,Math.hypot(B.x-A.x,B.z-A.z))));
  });
  let next=-Infinity,course=0;
  route.rows.forEach((r,i)=>{
   if(!((route.id==='left'?((r.section>=3&&r.section<=5)||(r.section>=9&&r.section<=10)):route.id==='shortcut'?r.section===1:route.id==='right'&&r.section>=2&&r.section<=6)||steep.get(r.section)>=.2)||r.s<next)return;
   next=r.s+STEP;course++;
   const A=route.rows[Math.max(0,i-3)],B=route.rows[Math.min(route.n-1,i+3)],l=Math.hypot(B.x-A.x,B.z-A.z)||1;
   const ux=(B.x-A.x)/l,uz=(B.z-A.z)/l,nx=uz,nz=-ux,ry=Math.atan2(ux,uz);
   const n=Math.max(3,Math.round(r.w/(.62*K))),w=r.w/n;
   for(let j=0;j<n;j++){
    const off=-r.w/2+(j+.5)*w,x=r.x+nx*off,z=r.z+nz*off;
    block(x,height(x,z)-.12,z,w*R(.90,.97),.26,STEP*R(1.0,1.06),ry+R(-.03,.03),.04,{ink:.006*K,base:pick(STAIR)});
   }
   // Low, broken shoulders frame the flight without narrowing its clear width.
   if(course%2===0)for(const side of[-1,1]){
    const off=side*(r.w/2+.24),x=r.x+nx*off,z=r.z+nz*off;
    block(x,height(x,z)-.16,z,.46,.42+.10*Math.sin(i),STEP*1.25,ry,.14,{ink:.004*K,base:'#b9b4b1'});
   }
  });
 }
}
