// ---------- layout: traced from the concept's screen and sized by the camera ----------
// (u, v) are fractions of the 1672x941 Singing Conch Coast concept. Every element is authored as
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
const PL = M(3.6);   // the plaza and the ruins
const T1 = M(3.6);   // the rock ridge between the path and the plaza, at its highest
const T2B = M(3.3), T2 = M(5.1);   // the high tier on the ridge's left: its foot and its top
const inFrame = (u, v) => u > -0.08 && u < 1.08 && v > -0.06 && v < 1.06;
// ground mesh bounds (metres)
const GX0 = -30 * K, GX1 = 30 * K, GZ0 = -44 * K, GZ1 = 10 * K;
function noise2(x, z) { return Math.sin(x * 0.7 + Math.sin(z * 0.53)) * 0.5 + Math.sin(z * 0.9 + x * 0.21) * 0.5; }

// Raised ground: closed outlines. 'b' points sit at a cliff foot (on the tier below), 't' points on
// the top off screen, 'n' points at the foot of a grassy bank (`soft` metres wide, no rock). A
// cliff's top edge sits `lean` metres back from its foot, as the concept's faces step back.
const TERRACES = [
  {top:M(3.6),base:0,ledge:true,soft:M(2),lean:M(.55),ghost:true,pts:[[-.3,.54,'b'],[.0,.57,'b'],[.075,.63,'b'],[.13,.63,'b'],[.185,.57,'b'],[.18,.515,'b'],[.12,.45,'b'],[.17,.37,'n'],[.22,.25,'n'],[.28,.14,'n'],[.2,-.3,'t'],[-.3,-.3,'t']]},
  {top:M(4.4),base:0,ledge:true,soft:M(2.5),lean:M(.6),pts:[[.29,.31,'b'],[.38,.29,'b'],[.46,.275,'b'],[.55,.275,'b'],[.65,.29,'b'],[.76,.31,'b'],[.83,.30,'b'],[.82,.27,'n'],[.77,.06,'n'],[.7,-.35,'t'],[.3,-.35,'t']]},
  {top:M(3.7),base:0,ledge:true,soft:M(2),lean:M(.65),pts:[[1.3,.88,'b'],[1.06,.84,'b'],[.99,.76,'b'],[.95,.68,'b'],[.93,.57,'b'],[.91,.49,'b'],[.91,.40,'b'],[.88,.31,'n'],[.88,.12,'n'],[1.3,-.3,'t']]},
  {top:M(5.4),base:M(2),ledge:true,soft:M(2),lean:M(.6),pts:[[.27,.18,'b'],[.37,.21,'b'],[.44,.20,'b'],[.53,.22,'b'],[.62,.20,'b'],[.66,.12,'n'],[.58,-.3,'t'],[.26,-.3,'t']]},
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
let GHOST_ON=false;
// within reach of a flattened terrace (its outline, cliff faces and banks)
const inGhost=(x,z)=>TERRACES.some(T=>{if(!T.ghost)return false;const d=polyAt(T,x,z);return d!==null&&d<M(2.6);});
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
// One curved ribbon drives ground height, paving, vegetation and collision.
// Width and height are interpolated along that same centerline.
const STAIR_ROWS=[
  [.465,.245,.295,0],[.415,.215,.265,.06],
  [.365,.175,.225,.25],[.315,.170,.220,.28],
  [.265,.190,.240,.52],[.215,.215,.265,.55],
  [.160,.255,.305,.78],[.100,.290,.340,1]
];
const ST=(()=>{
  const anchors=STAIR_ROWS.map(([v,u0,u1,f])=>{const y=PL*f,[x,z]=P((u0+u1)/2,v,y);return{x,z,y,w:wide(u0,u1,v,y)};});
  const curve=new THREE.CatmullRomCurve3(anchors.map(p=>new V3(p.x,p.y,p.z)),false,'centripetal');
  const n=48,rows=[];let length=0;
  for(let i=0;i<n;i++){
    const t=i/(n-1),p=curve.getPoint(t),idx=t*(anchors.length-1),j=Math.min(anchors.length-2,Math.floor(idx)),f=idx-j;
    const d=curve.getTangent(t),len=Math.hypot(d.x,d.z),ux=d.x/len,uz=d.z/len;
    if(i)length+=Math.hypot(p.x-rows[i-1].x,p.z-rows[i-1].z);
    rows.push({x:p.x,z:p.z,y:p.y,w:anchors[j].w+(anchors[j+1].w-anchors[j].w)*f,ux,uz,nx:uz,nz:-ux,s:length});
  }
  const a=rows[0],b=rows[n-1];return{rows,n,len:length,half:rows.reduce((s,r)=>s+r.w,0)/n/2,bank:M(1.0),top:PL,x0:a.x,z0:a.z,x1:b.x,z1:b.z,ux:a.ux,uz:a.uz};
})();
function stairsAt(x,z){
  let best=Infinity,result=null;
  for(let i=0;i<ST.n-1;i++){
    const A=ST.rows[i],B=ST.rows[i+1],dx=B.x-A.x,dz=B.z-A.z,l2=dx*dx+dz*dz;
    let t=((x-A.x)*dx+(z-A.z)*dz)/l2;
    t=Math.max(i===0?-.75:0,Math.min(i===ST.n-2?1.75:1,t));
    const qx=A.x+dx*t,qz=A.z+dz*t,d=Math.hypot(x-qx,z-qz);
    if(d<best){best=d;const f=THREE.MathUtils.clamp(t,0,1),s=A.s+(B.s-A.s)*t;result={a:s/ST.len,s:d,y:A.y+(B.y-A.y)*f,half:(A.w+(B.w-A.w)*f)/2};}
  }
  result.inside=result.a>-.025&&result.a<1.035&&result.s<result.half+.10;
  return result;
}

// dirt: paths as [u, v, half width as a screen fraction, plane], and the plaza as an outline
const TRAILS = [
 [[.205,.545,.025,0],[.29,.50,.03,0],[.39,.46,.03,0],[.47,.43,.025,0]],
 [[.92,.20,.018,PL],[.92,.11,.018,PL],[.90,.02,.018,PL]],
 [[.21,.16,.018,PL],[.27,.09,.018,PL],[.34,.03,.018,PL]],
].map(pl => pl.map(([u, v, hu, h]) => { const [x, z] = P(u, v, h); return new V3(x, wide(u - hu, u + hu, v, h) / 2, z); }))
  // a smooth curve through the authored points (width rides along in y), sampled every 1.2 m
  .map(pl => { const c = new THREE.CatmullRomCurve3(pl, false, 'centripetal'); return c.getSpacedPoints(Math.ceil(c.getLength() / 1.2)).map(p => ({ x: p.x, z: p.z, w: p.y })); });
const poly = (pts, h) => {
  const q = pts.map(([u, v]) => { const [x, z] = P(u, v, h); return { x, z }; }), xs = q.map(p => p.x), zs = q.map(p => p.z);
  return { pts: q, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};
// the plaza: a ring of dirt round the stone circle, traced from the concept; grass in the middle
const PLAZA=poly([[-.2,.53],[.15,.52],[.28,.40],[.43,.32],[.8,.35],[.91,.62],[.94,.92],[-.2,.85]],0);
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
const trailEdge = (x,z) => {const st=stairsAt(x,z);return Math.min(trailAt(x,z)+edgeWob(x,z),st.a>-.02&&st.a<1.035?st.s-st.half:Infinity);};
// patches of leaf shade on the ground, under the concept's trees: [u, v, radius in concept metres, plane]
const SHADE = [[0.07, 0.32, 3.0, PL], [0.32, 0.27, 3.0, PL], [0.72, 0.24, 2.6, PL], [0.95, 0.5, 3.0, PL], [0.9, 0.8, 2.4, 0], [0.2, 0.85, 2.4, 0], [0.45, 0.24, 1.8, PL], [0.12, 0.6, 2.2, T1]]
  .map(([u, v, r, h]) => { const [x, z] = P(u, v, h); return { x, z, r: M(r) }; });
const shadeAt = (x, z) => SHADE.reduce((m, s) => Math.max(m, 1 - smooth(s.r * 0.45, s.r, Math.hypot(x - s.x, z - s.z))), 0);

const SHORE_POINTS=[[-.2,.46],[0,.55],[.13,.65],[.27,.71],[.46,.80],[.64,.81],[.82,.85],[1.2,.87]].map(([u,v])=>P(u,v));
function zShore(x){
 for(let i=1;i<SHORE_POINTS.length;i++)if(x<SHORE_POINTS[i][0]){const a=SHORE_POINTS[i-1],b=SHORE_POINTS[i],t=Math.max(0,(x-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t+.16*Math.sin(x*.7);}
 return SHORE_POINTS.at(-1)[1]+.16*Math.sin(x*.7);
}
const SHORE_GLSL='float zShoreG(float x){'+SHORE_POINTS.slice(1).map((b,i)=>{const a=SHORE_POINTS[i];return `if(x<${b[0].toFixed(5)})return mix(${a[1].toFixed(5)},${b[1].toFixed(5)},clamp((x-(${a[0].toFixed(5)}))/${(b[0]-a[0]).toFixed(5)},0.,1.))+.16*sin(x*.7);`;}).join('')+`return ${SHORE_POINTS.at(-1)[1].toFixed(5)}+.16*sin(x*.7);}`;
// the shape of the land: height and how much of it is a raised top
function field(x, z) {
  let y = 0, top = 0, rock = 0;
  for (const T of TERRACES) {
    if (T.ghost && GHOST_ON) continue;
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
  const st=stairsAt(x,z);
  if(st.a>-.04&&st.a<1.06&&st.s<st.half+ST.bank){
    const k=smooth(st.half-.05,st.half+ST.bank,st.s);
    y=st.y+(y-st.y)*k;
    if(st.inside)rock=0;
  }
  return { y, top, rock };
}
function height(x, z) {
  const f = field(x, z);
  const sand=f.y + 0.05 * noise2(x*.6,z*.6)+.08*f.top*noise2(x*.4+7,z*.4);
  return sand-Math.min(M(2),Math.max(0,z-zShore(x))*.35);
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
    p.setY(i, f.y + 0.05 * noise2(x * 0.6, z * 0.6) + 0.08 * f.top * noise2(x * 0.4 + 7, z * 0.4) - f.rock * M(2.5) - Math.min(M(2),Math.max(0,z-zShore(x))*.35));
    rock[i]=f.rock;
    const st = stairsAt(x, z);
    const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));
    td[i] = d;
    const trail = Math.max(1 - smooth(-0.5, 0.5, d),1-f.top);
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
  float tr=max(1.-smoothstep(-.3,.3,dd),vColor.y);
  tr=max(tr,step(.8,vnoise(q*1.1+21.))*(1.-smoothstep(.1,.8,dd))*.9);
  tr*=1.-step(.76,vnoise(q*1.6+11.))*smoothstep(-2.,-.5,dd);
  wgt.x=1.-tr; wgt.y=tr;
  // the trail: packed orange dirt with darker trodden patches, worn paler middle and small pebbles
  vec3 trail=mix(${L('#e7bb75')},${L('#f3d394')},smoothstep(.3,.7,n1));
  trail=mix(trail,${L('#d9b475')},smoothstep(.6,.8,fbm(q*.8+5.))*.4);
  trail=mix(trail,${L('#f7dda2')},(1.-smoothstep(-3.,-1.,vD))*smoothstep(.45,.7,fbm(q*.5+2.))*.35);
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
  const onStairs = q => stairsAt(q.x, q.z).s < stairsAt(q.x,q.z).half + ST.bank + M(.7) && stairsAt(q.x, q.z).a > -0.35 && stairsAt(q.x, q.z).a < 1.65;   // hillside and the continuous court landing
  const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);
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
// The approved forest cliff, shared by every ruins-derived scene: the rock face
// split into columns by cracks, each column two planes meeting at a ridge, a
// rounded edge and a flat stone cap running back into the grass, moss creeping
// down, and plants on the lip and at the foot. One light mesh; it replaces the
// earlier fractured face. Sizes follow the forest's, scaled by K. It draws from
// its own seed, so the approved stream, layout and colliders are unchanged.
// A rounded field stone: the shared stone hull with its corners welded and
// smooth-shaded, so it reads as weathered rock rather than cut crystal, with
// moss on its upward faces and the usual same-hue outline.
function fieldStone(x,y,z,w,h,d,{ry=0,rz=0,moss=.3,base=pick(ruinPalette),chamfer=.5}={}){
  let g=stoneGeometry(w,h,d,{chamfer,extra:30,jitter:.1,base});
  g.deleteAttribute('color');g.deleteAttribute('normal');g=mergeVertices(g,1e-4);g.computeVertexNormals();
  const c=new THREE.Color(),b=new THREE.Color(base),m=new THREE.Color(pick(MOSS)),pos=g.attributes.position,nor=g.attributes.normal,col=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){const ny=nor.getY(i);c.copy(b).multiplyScalar(.9+.1*ny).lerp(m,moss*smooth(.5,.9,ny));col.set([c.r,c.g,c.b],i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g=g.toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().compose(new V3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry,rz)),new V3(1,1,1)));
  stoneParts.push(g);
  const o=g.clone();o.deleteAttribute('color');const ctr=new V3(x,y+h/2,z),s=1+.06/Math.min(w,h,d)*1.6;
  o.translate(-ctr.x,-ctr.y,-ctr.z);o.scale(s,s,s);o.translate(ctr.x,ctr.y,ctr.z);stoneLines.push(o);
}
// Low terrace faces marked `stones` (the meadow's field walls) are dry-stone:
// rounded stones laid along the face in one to three courses, each course set
// back up the slope, moss on the top course and plants along the crown.
function stoneFace(T,S,length,U){
  for(let s=R(0,.3)*U;s<length;){
    const w=(T.blocks?R(1.6,2.4):R(1.1,1.8))*U,q=S[Math.max(0,S.findIndex(p=>p.s>=s+w/2))]||S[S.length-1];s+=w*R(.92,1.02);
    const rise=q.top-q.base;if(rise<.2*U)continue;
    const n=Math.max(1,Math.min(3,Math.round(rise/(.95*U)))),ry=Math.atan2(-q.nx,-q.nz);
    for(let r=0;r<n;r++){
      const f=r/n,d=R(.9,1.2)*U,o=.15*U-T.lean*f-d/2+R(-.06,.06)*U,h=rise/n*R(1.02,1.15)+(r===0?.3:0);
      fieldStone(q.x+q.nx*o,q.base+rise*f-(r===0?.3:.05),q.z+q.nz*o,w*R(.82,.98),h,d,{moss:r===n-1?.5:.12,ry:ry+R(-.1,.1),rz:R(-.05,.05),chamfer:T.blocks?.3:.5});
    }
    if(rand()<.4)addBush(q.x-q.nx*R(.3,.9)*U,q.top-.1,q.z-q.nz*R(.3,.9)*U,R(.35,.6)*U,{sy:.58,tint:R(-.2,.2)});
    // block walls (the windmill's and the rose garden's) carry plants spilling over their crown, as in their concepts
    if(T.blocks&&rand()<.45)addBush(q.x+q.nx*.1*U,q.top-.25*U,q.z+q.nz*.1*U,R(.3,.5)*U,{sy:.75,tint:R(-.1,.25)});
  }
}
function columnCliffs(){
  const U=K/2.4,pos=[],col=[],tmpA=new V3(),tmpB=new V3(),nn=new V3();
  const quad=(a,b,c,d,out,color)=>{
    for(const v of[a,b,c,d]){const st=stairsAt(v.x,v.z);if(st.inside||st.s<st.half+.35)v.y=Math.min(v.y,st.y-.12);}
    tmpA.subVectors(b,a);tmpB.subVectors(c,a);nn.crossVectors(tmpA,tmpB);
    const vs=nn.dot(out)>=0?[a,b,c,a,c,d]:[a,c,b,a,d,c];
    for(const v of vs){pos.push(v.x,v.y,v.z);col.push(color.r,color.g,color.b);}
  };
  const stone=STONE.map(h=>new THREE.Color(h)),moss=MOSS.map(h=>new THREE.Color(h)),F=[0,.32,.66,1],shade=new THREE.Color();
  for(const T of TERRACES){
    if(!T.ledge||T.masonry)continue;
    for(const run of cliffRuns(T)){
      const R0=run.pts.map(q=>({x:q.x,z:q.z}));
      if(R0.length<2)continue;
      if(run.closed)R0.push(R0[0]);
      const S=[];
      for(let i=0;i<R0.length-1;i++){
        const a=R0[i],b=R0[i+1],k=Math.max(1,Math.round(Math.hypot(b.x-a.x,b.z-a.z)/(.55*U)));
        for(let j=0;j<k;j++)S.push({x:a.x+(b.x-a.x)*j/k,z:a.z+(b.z-a.z)*j/k});
      }
      S.push({...R0[R0.length-1]});
      let acc=0;
      S.forEach((q,i)=>{
        const a=S[Math.max(0,i-1)],b=S[Math.min(S.length-1,i+1)],tx=b.x-a.x,tz=b.z-a.z,l=Math.hypot(tx,tz)||1;
        q.nx=tz/l;q.nz=-tx/l;
        if(polyAt(T,q.x+q.nx*.8,q.z+q.nz*.8)<0){q.nx=-q.nx;q.nz=-q.nz;}
        if(i)acc+=Math.hypot(q.x-S[i-1].x,q.z-S[i-1].z);q.s=acc;
        q.base=Math.min(height(q.x+q.nx*1.6,q.z+q.nz*1.6),height(q.x+q.nx*2.6,q.z+q.nz*2.6))-.35;
        q.top=Math.min(T.topAt?T.topAt(q.x):T.top,height(q.x-q.nx*(T.lean+.4),q.z-q.nz*(T.lean+.4))+.08);
      });
      if(T.stones){stoneFace(T,S,acc,U);continue;}
      const cols=[];let i0=0;
      while(i0<S.length-1){
        const w=(rand()<.22?R(2.6,4.2):R(1.1,2.2))*U;let i1=i0+1;
        while(i1<S.length-1&&S[i1].s-S[i0].s<w)i1++;
        cols.push({i0,i1,s0:S[i0].s,s1:S[i1].s,off:R(-.1,.55)*U,slope:R(-.12,.12),ridge:R(.15,.5)*U,peak:R(.3,.7),rise:R(.05,.45)*U,cap:R(.9,1.6)*U,moss:R(0,1),rows:F.map(()=>R(-.25,.25)*U),lean:R(-.2,.35)*U,c:pick(stone).clone().multiplyScalar(R(.82,.92)),mid:(S[i0].s+S[i1].s)/2});
        i0=i1;
      }
      const top=(C,q)=>q.top+C.rise;
      // A point on block course r of a column at height fraction f. Each course
      // has its own setback, so the courses read as stacked blocks with seams.
      const vtx=(C,i,r,f=F[r])=>{
        const q=S[i],u=(q.s-C.s0)/Math.max(.01,C.s1-C.s0),c=Math.min(r,F.length-2);
        const ridge=C.ridge*(u<C.peak?u/C.peak:(1-u)/(1-C.peak));
        const o=.15*U+C.off+C.slope*(q.s-C.mid)+ridge+C.rows[c]+(c===0?.25*U:0)-(T.lean+C.lean)*f;
        return new V3(q.x+q.nx*o,q.base+(top(C,q)-q.base)*f+(f===1?.04*U*noise2(q.x*2.1,q.z*2.1):0),q.z+q.nz*o);
      };
      // A dark rock backing behind the columns, so cracks and short columns show
      // shadowed stone rather than the grass slope behind them.
      for(let i=0;i<S.length-1;i++){
        const a=S[i],b=S[i+1],out=new V3((a.nx+b.nx)/2,0,(a.nz+b.nz)/2),o=-.3*U;
        const p=(q,f)=>new V3(q.x+q.nx*(o-T.lean*f),q.base+(q.top-q.base)*f,q.z+q.nz*(o-T.lean*f));
        if(a.top-a.base<.06*K&&b.top-b.base<.06*K)continue;
        quad(p(a,0),p(b,0),p(b,1),p(a,1),out,shade.copy(stone[0]).multiplyScalar(.42));
      }
      cols.forEach((C,ci)=>{
        for(let i=C.i0;i<C.i1;i++){
          const out=new V3((S[i].nx+S[i+1].nx)/2,0,(S[i].nz+S[i+1].nz)/2);
          if(top(C,S[i])-S[i].base<.06*K)continue;
          for(let r=0;r<F.length-1;r++){
            shade.copy(C.c).multiplyScalar(r===0?.9:1+R(-.03,.03));
            if(r===F.length-2&&(i-C.i0)%3!==0&&rand()<.5)shade.lerp(pick(moss),R(.12,.3));
            quad(vtx(C,i,r,F[r]),vtx(C,i+1,r,F[r]),vtx(C,i+1,r,F[r+1]),vtx(C,i,r,F[r+1]),out,shade);
            // the seam to the next course: a narrow ledge or undercut in shadow, mossy in places
            if(r<F.length-2){shade.copy(C.c).multiplyScalar(.6);if(rand()<.3)shade.lerp(pick(moss),.4);quad(vtx(C,i,r,F[r+1]),vtx(C,i+1,r,F[r+1]),vtx(C,i+1,r+1,F[r+1]),vtx(C,i,r+1,F[r+1]),new V3(0,1,0),shade);}
          }
          const t0=vtx(C,i,F.length-1),t1=vtx(C,i+1,F.length-1);
          const edge=k=>{const q=S[k],o=vtx(C,k,F.length-1);return new V3(o.x-q.nx*.22*U,o.y+.14*U,o.z-q.nz*.22*U);};
          const e0=edge(i),e1=edge(i+1);
          const back=k=>{const q=S[k];return new V3(q.x-q.nx*C.cap,top(C,q)+.14*U+R(-.04,.04),q.z-q.nz*C.cap);};
          const b0=back(i),b1=back(i+1);
          const mossy=noise2(S[i].x*.9+4,S[i].z*.9)*.5+.5<.35+C.moss*.4;
          shade.copy(C.c).multiplyScalar(1.04);if(mossy)shade.lerp(pick(moss),R(.5,.75));
          quad(t0,t1,e1,e0,out,shade.clone().multiplyScalar(.97));
          quad(e0,e1,b1,b0,new V3(0,1,0),shade);
          quad(b0,b1,new V3(b1.x,b1.y-.45*U,b1.z),new V3(b0.x,b0.y-.45*U,b0.z),new V3(-out.x,0,-out.z),shade.copy(C.c).multiplyScalar(.8));
        }
        if(!run.closed)for(const k of(ci===0?[C.i0]:[]).concat(ci===cols.length-1?[C.i1]:[])){
          const q=S[k],side=new V3(q.nz,0,-q.nx).multiplyScalar(k===C.i0?-1:1);
          for(let r=0;r<F.length-1;r++){
            const a0=vtx(C,k,r,F[r]),a1=vtx(C,k,r,F[r+1]);
            quad(a0,a1,new V3(q.x-q.nx*C.cap,a1.y,q.z-q.nz*C.cap),new V3(q.x-q.nx*C.cap,a0.y,q.z-q.nz*C.cap),side,shade.copy(C.c).multiplyScalar(.75));
          }
        }
        const D=cols[ci+1];
        if(D){
          const out=new V3(S[C.i1].nz,0,-S[C.i1].nx);
          for(let r=0;r<F.length-1;r++)quad(vtx(C,C.i1,r,F[r]),vtx(D,C.i1,r,F[r]),vtx(D,C.i1,r,F[r+1]),vtx(C,C.i1,r,F[r+1]),out,shade.copy(C.c).multiplyScalar(.55));
        }
        // grass on the lip and in the cracks, bushes on top and at the foot (fewer than the forest: lighter)
        const q=S[Math.round((C.i0+C.i1)/2)];
        for(let g=C.i0;g<=C.i1;g+=2){const a=S[g],b=C.cap+R(.05,.9)*U;grassItems.push({x:a.x-a.nx*b+R(-.3,.3),y:a.top+.02,z:a.z-a.nz*b+R(-.3,.3),s:R(1.0,1.5),ry:R(0,6.28),k:R(.9,1.1)});}
        if(D){const v=vtx(C,C.i1,1,F[1]);grassItems.push({x:v.x+S[C.i1].nx*.1,y:v.y-.2,z:v.z+S[C.i1].nz*.1,s:R(.8,1.2),ry:R(0,6.28),k:.9});}
        addBush(q.x-q.nx*(C.cap*.6+R(0,.6)*U),q.top-.15,q.z-q.nz*(C.cap*.6+R(0,.6)*U),R(.5,.9)*U,{sy:.62,tint:R(-.4,.3)});
        if(rand()<.5)addBush(q.x-q.nx*(C.cap+R(.3,1.0)*U),q.top-.25,q.z-q.nz*(C.cap+R(.3,1.0)*U),R(.45,.8)*U,{sy:.55,tint:R(-.4,.3)});
        if(rand()<.25){const x=q.x+q.nx*R(1.4,2.2)*U,z=q.z+q.nz*R(1.4,2.2)*U;if(trailEdge(x,z)>.6*U)addBush(x,height(x,z)-.05,z,R(.5,.85)*U,{sy:.75,tint:-.6});}
      });
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,masonryMaterial());mesh.customDepthMaterial=masonryDepth;mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function buildCliffs(){
  const pos=[],col=[], stone=ruinPalette.map(c=>new THREE.Color(c).multiplyScalar(.72));
  // The old fractured face is no longer drawn; its outline is still walked for
  // the seeded draws and the plants it places (see the end of this function).
  const face=()=>{};
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
        const row=[0,.24,.56,.81,1], n=Math.max(1,Math.ceil(l/(.62*K)));
        for(let k=0;k<n;k++){
          const s0=length+l*k/n,s1=length+l*(k+1)/n;
          const profile=(t,s,r)=>{
            const x=a.x+dx*t,z=a.z+dz*t,peak=(T.topAt?T.topAt(x):T.top);
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
          if((Math.floor(s0/(.62*K))+i)%3===0){
            const r=1+(i%3),v=profile((k+.5)/n,(s0+s1)/2,r);
            const rr=.32*K;
            addBush(v.x+out.x*.1,v.y-.25,v.z+out.z*.1,rr,{sy:.48,tint:R(-.5,.2)});
            grassItems.push({x:v.x,y:v.y,z:v.z,s:R(.6,1),ry:R(0,6.28),k:.92});
          }
          if(k===0 && i%4===0){
            const v=profile(.5,(s0+s1)/2,4),x=v.x-out.x*1.0*K,z=v.z-out.z*1.0*K;
            addBush(x,height(x,z)-.1,z,.55*K,{sy:.55,tint:-.2});
          }
        }
        length+=l;
      }
    }
  }
  // The fractured face above is still traced for its seeded draws and the plants
  // it places; the forest-style columns are drawn in its place.
  const keep=seed;seed=6151;const mesh=columnCliffs();seed=keep;
  // the flattened headland's faces are not kept
  const cp=mesh.geometry.getAttribute('position').array,cc=mesh.geometry.getAttribute('color').array,kp=[],kc=[];
  for(let i=0;i<cp.length;i+=9){if(inGhost((cp[i]+cp[i+3]+cp[i+6])/3,(cp[i+2]+cp[i+5]+cp[i+8])/3))continue;for(let k=0;k<9;k++){kp.push(cp[i+k]);kc.push(cc[i+k]);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(kp,3));g.setAttribute('color',new THREE.Float32BufferAttribute(kc,3));g.computeVertexNormals();mesh.geometry.dispose();mesh.geometry=g;
  return mesh;
}
function masonryMaterial(){
  // The beach and forest stone material itself (no extra shader variant).
  return paint({vertexColors:true,shade:[.36,.34,.44],mid:[.64,.62,.67],band:[-.34,.24]});
}
function buildLedges(){
  // Fitted courses turn with the ribbon. Broad landings between flights use
  // the same heightfield; no lateral gaps or slabs crossing the banks.
  ST.rows.forEach((r,i)=>{
    const A=ST.rows[Math.max(0,i-1)],B=ST.rows[Math.min(ST.n-1,i+1)];
    const depth=Math.hypot(B.x-A.x,B.z-A.z)/(i===0||i===ST.n-1?1:2)+.035;
    // Landings stay paved so adjoining flights always have a visible connection.
    const count=Math.max(4,Math.round(r.w/(.44*K))),w=r.w/count;
    for(let j=0;j<count;j++){
      const edge=j===0||j===count-1,offset=-r.w/2+(j+.5)*w;
      const x=r.x+r.nx*offset,z=r.z+r.nz*offset;
      const chip=edge?.90:.965,ry=Math.atan2(r.ux,r.uz);
      block(x,height(x,z)-.065,z,w*chip,.12,depth*.97,ry,.06,{ink:.004*K,base:pick(['#bdb8b6','#c9c4c0','#b4afb0','#c4beb9'])});
    }
  });
  buildPathBanks();
}
function buildPathBanks(){
  const ps=[],cs=[];
  const triangle=(a,b,c,color)=>{
    if(new V3().subVectors(b,a).cross(new V3().subVectors(c,a)).y<0)[b,c]=[c,b];
    for(const p of[a,b,c]){ps.push(p.x,p.y,p.z);cs.push(color.r,color.g,color.b);}
  };
  for(let i=0;i<ST.n-1;i++)for(const side of[-1,1]){
    const A=ST.rows[i],B=ST.rows[i+1];
    const at=(r,t)=>{const d=side*(r.w/2+.035+ST.bank*t),x=r.x+r.nx*d,z=r.z+r.nz*d;return new V3(x,height(x,z)+.045,z);};
    if(Math.max(Math.abs(at(A,0).y-at(A,1).y),Math.abs(at(B,0).y-at(B,1).y))<M(.28))continue;
    for(let j=0;j<3;j++){
      const a=at(A,j/3),b=at(B,j/3),c=at(B,(j+1)/3),d=at(A,(j+1)/3);
      const color=new THREE.Color(['#c2bdb9','#cbc6c2','#b5b0b0'][(i+j)%3]);
      triangle(a,b,c,color);triangle(a,c,d,color);
    }
  }
  if(ps.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.computeVertexNormals();stoneParts.push(g);}
}
