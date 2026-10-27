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
const K = 2.4;   // world scale: the concept's layout, K times bigger, seen from K times farther (more room, same frame)
const M = v => v * K;   // concept metres to world metres
const PL = M(1.0);   // the plaza and the ruins
const T1 = M(3.6);   // the rock ridge between the path and the plaza, at its highest
// Trace the owner's descending orange silhouette, from the left shoulder to
// the low right-hand end. The same profile drives both terrain and stone.
const ridgeTop = (() => {
  const samples = [[.12,.70,.52],[.25,.758,.566],[.40,.76,.608],[.55,.708,.65],[.565,.70,.655]]
    .map(([u,foot,top])=>{const[x,z]=P(u,foot);return{x,y:Math.max(PL+.12,tall(x,z,0,top))};});
  return x=>{
    if(x<=samples[0].x)return samples[0].y;
    for(let i=1;i<samples.length;i++)if(x<=samples[i].x){
      const a=samples[i-1],b=samples[i],t=(x-a.x)/(b.x-a.x);
      return a.y+(b.y-a.y)*t;
    }
    return samples[samples.length-1].y;
  };
})();
const T2B = M(3.3), T2 = M(5.1);   // the high tier on the ridge's left: its foot and its top
const inFrame = (u, v) => u > -0.08 && u < 1.08 && v > -0.06 && v < 1.06;
// ground mesh bounds (metres)
const GX0 = -30 * K, GX1 = 30 * K, GZ0 = -44 * K, GZ1 = 10 * K;
function noise2(x, z) { return Math.sin(x * 0.7 + Math.sin(z * 0.53)) * 0.5 + Math.sin(z * 0.9 + x * 0.21) * 0.5; }

// Raised ground: closed outlines. 'b' points sit at a cliff foot (on the tier below), 't' points on
// the top off screen, 'n' points at the foot of a grassy bank (`soft` metres wide, no rock). A
// cliff's top edge sits `lean` metres back from its foot, as the concept's faces step back.
const TERRACES = [
  // the plaza level: everything behind the ridge; its front on the right is the row of blocks
  { top: PL, base: 0, ledge: false, soft: M(3), lean: 0, pts: [[-0.3, 0.6, 'n'], [0.0, 0.62, 'n'], [0.3, 0.66, 'n'], [0.5, 0.64, 'n'], [0.57, 0.6, 'n'], [0.615, 0.5, 'n'], [0.7, 0.485, 'n'],
    [0.78, 0.475, 'n'], [0.86, 0.525, 'n'], [0.92, 0.585, 'n'], [0.97, 0.655, 'n'], [1.3, 0.67, 'n'], [1.3, -0.5, 't'], [-0.3, -0.5, 't']] },
  // the ridge: rock toward the path, a grassy back sloping down to the plaza
  { top: T1, topAt: ridgeTop, base: 0, ledge: true, soft: M(3), lean: M(0.6), pts: [[-0.3, 0.665, 'b'], [0.0, 0.68, 'b'], [0.06, 0.688, 'b'], [0.12, 0.7, 'b'], [0.18, 0.728, 'b'], [0.24, 0.755, 'b'], [0.3, 0.77, 'b'],
    [0.38, 0.768, 'b'], [0.44, 0.745, 'b'], [0.5, 0.722, 'b'], [0.545, 0.71, 'b'], [0.565, 0.7, 'b'],
    [0.6, 0.64, 'n'], [0.6, 0.56, 'n', PL], [0.52, 0.5, 'n', PL], [0.42, 0.48, 'n', PL], [0.34, 0.44, 'n', PL], [0.3, 0.4, 'n', PL], [0.15, 0.38, 'n', PL], [0.0, 0.39, 'n', PL], [-0.3, 0.4, 'n', PL]] },
  // the high tier on the ridge's left
  { top: T2, base: T2B, ledge: true, soft: M(2.5), lean: M(0.8), pts: [[0.11, 0.47, 'n'], [0.125, 0.56, 'b'], [0.18, 0.565, 'b'], [0.23, 0.56, 'b'], [0.285, 0.56, 'b'], [0.31, 0.52, 'n'], [0.3, 0.46, 'n'], [0.2, 0.44, 'n']] },
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
const STAIR_ROWS = [[0.69, 0.757, 0.875], [0.66, 0.748, 0.865], [0.62, 0.725, 0.835], [0.58, 0.69, 0.802], [0.54, 0.672, 0.78], [0.5, 0.647, 0.745], [0.46, 0.598, 0.705]];
const ST = (() => {
  const n = 22, rows = [], lerp = (a, b, t) => a + (b - a) * t;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n * (STAIR_ROWS.length - 1), k = Math.min(STAIR_ROWS.length - 2, Math.floor(f)), t = f - k, A = STAIR_ROWS[k], B = STAIR_ROWS[k + 1];
    const v = lerp(A[0], B[0], t), u0 = lerp(A[1], B[1], t), u1 = lerp(A[2], B[2], t), y = PL * (i + 1) / n;
    const [x, z] = P((u0 + u1) / 2, v, y); rows.push({ x, z, y, w: wide(u0, u1, v, y) });
  }
  const a = rows[0], b = rows[n - 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  return { rows, x0: a.x, z0: a.z, x1: b.x, z1: b.z, ux: dx / len, uz: dz / len, len, half: rows.reduce((m, r) => m + r.w, 0) / n / 2, bank: M(2), n, top: PL };
})();
function stairsAt(x, z) {
  const rx = x - ST.x0, rz = z - ST.z0, a = (rx * ST.ux + rz * ST.uz) / ST.len, s = Math.abs(-rx * ST.uz + rz * ST.ux);
  // Continue the level landing beyond the last slab into the court. Stopping
  // the cut at the last row left a steep heightfield lip across the exit.
  return { a, s, inside: a > -0.02 && a < 1.42 && s < ST.half + 0.25 };
}
// dirt: paths as [u, v, half width as a screen fraction, plane], and the plaza as an outline
const TRAILS = [
  // the hero's path, traced from the concept's dirt: wide at the bottom, curving right to the stair
  [[0.535, 1.06, 0.085, 0], [0.535, 0.98, 0.085, 0], [0.5, 0.92, 0.08, 0], [0.56, 0.86, 0.115, 0], [0.635, 0.82, 0.11, 0], [0.72, 0.78, 0.09, 0], [0.79, 0.74, 0.08, 0], [0.816, 0.7, 0.06, 0]],
  // through the arch, and the narrow path off to the left behind the high tier
  [[0.6, 0.28, 0.012, PL], [0.605, 0.24, 0.01, PL], [0.61, 0.12, 0.01, PL], [0.61, 0.0, 0.01, PL]],
  [[0.243, 0.26, 0.012, PL], [0.17, 0.28, 0.015, PL], [0.15, 0.3, 0.02, PL], [0.12, 0.32, 0.02, PL], [0.08, 0.34, 0.016, PL], [-0.05, 0.37, 0.02, PL]],
].map(pl => pl.map(([u, v, hu, h]) => { const [x, z] = P(u, v, h); return new V3(x, wide(u - hu, u + hu, v, h) / 2, z); }))
  // a smooth curve through the authored points (width rides along in y), sampled every 1.2 m
  .map(pl => { const c = new THREE.CatmullRomCurve3(pl, false, 'centripetal'); return c.getSpacedPoints(Math.ceil(c.getLength() / 1.2)).map(p => ({ x: p.x, z: p.z, w: p.y })); });
const poly = (pts, h) => {
  const q = pts.map(([u, v]) => { const [x, z] = P(u, v, h); return { x, z }; }), xs = q.map(p => p.x), zs = q.map(p => p.z);
  return { pts: q, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};
// the plaza: a ring of dirt round the stone circle, traced from the concept; grass in the middle
const PLAZA = poly([[0.33, 0.36], [0.345, 0.32], [0.38, 0.296], [0.43, 0.278], [0.5, 0.27], [0.545, 0.258], [0.6, 0.25], [0.64, 0.272], [0.7, 0.298], [0.745, 0.32], [0.752, 0.345],
  [0.733, 0.37], [0.72, 0.395], [0.7, 0.43], [0.69, 0.45], [0.705, 0.462], [0.598, 0.462], [0.575, 0.455], [0.53, 0.455], [0.44, 0.447], [0.4, 0.425], [0.385, 0.4], [0.35, 0.382]], PL);
const PLAZA_HOLE = poly([[0.465, 0.335], [0.49, 0.305], [0.54, 0.295], [0.6, 0.302], [0.625, 0.33], [0.6, 0.37], [0.54, 0.385], [0.49, 0.37]], PL);
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
const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);
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
  // The authored court is a real level standing surface, including its grassy
  // centre. Blend its outside shoulder instead of leaving the old bank beneath
  // the circle and the ends of the approach.
  const courtDistance = polyAt(PLAZA, x, z);
  if (courtDistance !== null) y = Math.max(y, PL * (1 - smooth(-0.2, 2.8, courtDistance)));
  const st = stairsAt(x, z);
  // the stair lies on a hillside: the ground either side slopes down with it, no cliff beside it
  if (st.a > -0.35 && st.a < 1.62 && st.s < ST.half + ST.bank) {
    const sy = ST.top * Math.max(0, Math.min(1, st.a));
    const k = Math.max(smooth(ST.half + 0.3, ST.half + ST.bank, st.s), smooth(1.42, 1.62, st.a));
    y = sy + (y - sy) * k;
    if (st.inside) y = sy;
  }
  // Keep the open stair corridor and its banks outside the hidden backing.
  if(st.a>-.35&&st.a<1.65&&st.s<ST.half+ST.bank-1)rock=0;
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
    const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));
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
  vec3 trail=mix(${L('#e0ab63')},${L('#efc27b')},smoothstep(.3,.7,n1));
  trail=mix(trail,${L('#cc8f4c')},smoothstep(.6,.8,fbm(q*.8+5.))*.4);
  trail=mix(trail,${L('#f2c886')},(1.-smoothstep(-3.,-1.,vD))*smoothstep(.45,.7,fbm(q*.5+2.))*.35);
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
  const onStairs = q => stairsAt(q.x, q.z).s < ST.half + ST.bank - 1 && stairsAt(q.x, q.z).a > -0.35 && stairsAt(q.x, q.z).a < 1.65;   // hillside and the continuous court landing
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
        const row=[0,.29,.59,.83,1], n=Math.max(1,Math.ceil(l/(.62*K)));
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
  const keep=seed;seed=6151;const mesh=columnCliffs();seed=keep;return mesh;
}
function masonryMaterial(){
  // The beach and forest stone material itself (no extra shader variant).
  return paint({vertexColors:true,shade:[.36,.34,.44],mid:[.64,.62,.67],band:[-.34,.24]});
}
function buildLedges(){
  // Almost flush paving follows the walk surface. Narrow exposed risers replace
  // the old thick floating staircase; grass and gaps break up the outer edges.
  ST.rows.forEach((r,i)=>{
    const next=ST.rows[Math.min(ST.n-1,i+1)],prev=ST.rows[Math.max(0,i-1)];
    const d=Math.max(.45,Math.hypot(next.x-prev.x,next.z-prev.z)/(i===0||i===ST.n-1?1:2));
    const n=Math.max(3,Math.round(r.w/(.58*K))),w=r.w/n,offset=i%2?w*.4:0;
    for(let j=0;j<n;j++){
      const lx=-r.w/2+w*(j+.5)+offset;
      if(lx>r.w/2-.1 || (j===0&&i%4===0) || (i%7===2&&j===n-1))continue;
      const x=r.x+lx,z=r.z+R(-.07,.07)*K;
      block(x+R(-.025,.025)*K,height(x,z)-.10,z,w*R(.85,.98),.15,d*R(.75,.94),R(-.045,.045),.12,{ink:.007*K,base:pick(['#c2bdb9','#cbc6c2','#b9b4b1'])});
    }
  });
}
function PG(u,v){
  // Find the visible terrain along this screen ray, including the new slope.
  let hi=T2+M(2),lo=hi;
  for(;lo>0;lo-=.5){const q=P(u,v,lo);if(lo<=height(...q))break;hi=lo;}
  lo=Math.max(0,lo);
  for(let i=0;i<14;i++){const h=(lo+hi)/2,q=P(u,v,h);if(h>height(...q))hi=h;else lo=h;}
  const q=P(u,v,(lo+hi)/2);return[q[0],q[1],height(...q)];
}
function screenBox(u0,u1,vFoot,vTop,level=PL){
  const[x,z]=P((u0+u1)/2,vFoot,level);
  return{x,z,g:level,w:wide(u0,u1,vFoot,level),h:tall(x,z,level,vTop)};
}
function ivy(x,y,z,len){
  // Little overlapping sprays, two hanging lengths rather than a giant bush.
  for(let i=0;i<len/(.30*K);i++){
    const t=i/(len/(.30*K));
    addBush(x+Math.sin(i*1.7)*.08*K,y-t*len,z+.05,.21*K*(1-.48*t),{sy:.95,tint:-.35});
  }
}
function overgrow(x,z,g,w,h,d){
  if(rand()<.7)ivy(x+R(-.32,.32)*w,g+h,z+d/2+.06,h*R(.35,.7));
  if(rand()<.6)addBush(x+R(-.3,.3)*w,g+h-.18,z,.35*K,{sy:.35,tint:.1});
  if(rand()<.6)addBush(x+R(-.5,.5)*w,g-.05,z+d/2+.25*K,.45*K,{sy:.65,tint:-.4});
}
function box(u0,u1,vf,vt,{d=.8,tilt=.04,moss=.25}={}){
  const[x,z0,g]=PG((u0+u1)/2,vf),w=wide(u0,u1,vf,g),h=tall(x,z0,g,vt),dd=w*d,z=z0-dd/2;
  block(x,g-.08,z,w,h,dd,R(-.15,.15),moss,{natural:true,rx:R(-tilt,tilt),rz:R(-tilt,tilt)});
  solidBox(x,z,w,dd);if(rand()<.35)overgrow(x,z,g,w,h,dd);
}
function pillar(u0,u1,vf,vt,{cap=true}={}){
  const b=screenBox(u0,u1,vf,vt),z=b.z-b.w*.47,ry=R(-.035,.035),foot=.18*b.w,capH=cap?.16*b.w:0;
  block(b.x,b.g-.1,z,b.w,foot+.1,b.w,ry,.12);
  const n=Math.max(3,Math.round((b.h-foot-capH)/(.62*K))),h=(b.h-foot-capH)/n;
  for(let i=0;i<n;i++)block(b.x+R(-.025,.025)*K,b.g+foot+i*h,z,b.w*.75,h-.018*K,b.w*.76,ry,.10);
  if(cap)block(b.x,b.g+b.h-capH,z,b.w*1.1,capH,b.w*1.08,ry,.22);
  solidBox(b.x,z,b.w,b.w,ry);overgrow(b.x,z,b.g,b.w,b.h,b.w);
}
function wall(u0,u1,vf,vt,depth=.85){
  const b=screenBox(u0,u1,vf,vt),d=depth*K,z=b.z-d/2,n=Math.max(2,Math.round(b.h/(.70*K))),rh=b.h/n;
  for(let row=0;row<n;row++){
    let x=b.x-b.w/2, end=b.x+b.w/2;
    while(x<end-.1){
      const w=Math.min(end-x, R(.7,1.15)*K*(row%2?1.05:1));
      const rel=(x+w/2-b.x)/b.w;
      // Authored erosion silhouette; intact lower courses bond across joints.
      const cut=row===n-1 && (Math.sin(rel*10+u0*20)>.15);
      if(!cut)block(x+w/2,b.g+row*rh,z,w-.018*K,rh-.018*K,d,0,row===n-1?.35:.12);
      x+=w;
    }
  }
  solidBox(b.x,z,b.w,d);overgrow(b.x,z,b.g,b.w,b.h,d);
}
// True fitted wedge stones: the intrados is an uninterrupted open semicircle.
// Each stone is extruded with a small bevel; rectangular rotated blocks would
// intrude into the opening and reproduce the rejected jagged portal.
function archway(u0,u1,vf,vt,ou0,ou1,vOpen,depth=1.05){
  const b=screenBox(u0,u1,vf,vt),d=depth*K,z=b.z-d/2;
  const r0=wide(ou0,ou1,vf,PL)/2,openH=tall(b.x,b.z,PL,vOpen),ring=.57*K,pierH=Math.max(1.0*K,openH-r0),yc=PL+pierH,pw=(b.w-2*r0)/2;
  for(const side of [-1,1]){
    const x=b.x+side*(r0+pw/2),n=Math.max(3,Math.round(pierH/(.68*K))),h=pierH/n;
    for(let i=0;i<n;i++){
      // Alternating header faces make each support visibly bonded masonry.
      block(x,b.g+i*h,z,pw*(i===0?1.06:1),h-.016*K,d*(i%2?.99:1.04),0,.12);
    }
    block(x,yc-.10*K,z,pw*1.10,.20*K,d*1.12,0,.2);
    solidBox(x,z,pw,d);
    ivy(x+side*pw*.25,yc+ring,z+d/2+.04,pierH*.6);
  }
  const n=13;
  for(let i=0;i<n;i++){
    const gap=.007,a=i*Math.PI/n+gap,b0=(i+1)*Math.PI/n-gap,r1=r0+ring*(i===6?1.16:1);
    const sh=new THREE.Shape();
    sh.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);
    for(let j=1;j<=3;j++){const t=a+(b0-a)*j/3;sh.lineTo(Math.cos(t)*r0,Math.sin(t)*r0);}
    for(let j=3;j>=0;j--){const t=a+(b0-a)*j/3;sh.lineTo(Math.cos(t)*r1,Math.sin(t)*r1);}
    sh.closePath();
    let g=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:true,bevelThickness:.025*K,bevelSize:.025*K,bevelSegments:1,steps:1,curveSegments:1});
    if(g.index)g=g.toNonIndexed();
    g.translate(0,0,-d/2);const p=g.attributes.position,c=[],base=new THREE.Color(pick(ruinPalette));
    for(let j=0;j<p.count;j++)c.push(base.r,base.g,base.b);
    g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    collectStone(g,b.x,yc,z,0,0,0,.014*K);
  }
  // Broken shoulders extend beyond the arch without filling its opening.
  for(const side of [-1,1]){
    const x=b.x+side*(r0+pw/2),h=Math.max(.35*K,b.h-pierH-ring*.5);
    for(let i=0;i<2;i++)block(x,yc+i*h/2,z,pw*.90,h/2-.02*K,d,0,.2);
  }
}
// Dedicated wear on the court marker: a broken crown, broad shallow facets,
// and a branched fracture that follows the surface instead of floating above it.
function wornMarkerGeometry(w,h,d){
  // Reuse the masonry's original random draws so the rest of the scene stays put.
  const source=ruinGeometry(w,h,d,.24,null,true),sp=source.attributes.position,sc=source.attributes.color;
  const pos=[],colors=[];
  const tri=(a,b,c,tone)=>{for(const v of[a,b,c]){pos.push(v.x,v.y,v.z);colors.push(tone.r,tone.g,tone.b);}};
  const weather=v=>{
    const nx=v.x/w,ny=v.y/h,nz=v.z/d,upper=smooth(.48,.98,ny);
    v.y-=upper*h*(.17*smooth(-.12,.42,-nx)+.065*smooth(-.2,.5,nz));
    v.x+=w*.035*Math.sin(ny*3.6+nz*2.2)*smooth(0,.35,ny);
    v.z+=d*.035*Math.sin(nx*4.8+ny*2.1)*smooth(0,.3,ny);
    return v;
  };
  // The first 192 vertices are the solid block; replace the old hairline decal.
  for(let i=0;i<Math.min(192,sp.count);i+=3){
    const a=weather(new V3().fromBufferAttribute(sp,i)),b=weather(new V3().fromBufferAttribute(sp,i+1)),c=weather(new V3().fromBufferAttribute(sp,i+2));
    const tone=new THREE.Color().fromBufferAttribute(sc,i),normal=new V3().subVectors(b,a).cross(new V3().subVectors(c,a)).normalize();
    if(Math.abs(normal.y)<.65&&Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y)>h*.4){
      const centre=a.clone().add(b).add(c).multiplyScalar(1/3).addScaledVector(normal,-Math.min(w,d)*.035);
      tri(a,b,centre,tone.clone().multiplyScalar(.97));
      tri(b,c,centre,tone.clone().multiplyScalar(1.035));
      tri(c,a,centre,tone.clone().multiplyScalar(.91));
    }else tri(a,b,c,tone);
  }
  const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));body.computeVertexNormals();
  const probeMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),probe=new THREE.Mesh(body,probeMaterial),ray=new THREE.Raycaster();probe.updateMatrixWorld();
  const surface=(x,y)=>{
    ray.set(new V3(x,y,d*2),new V3(0,0,-1));
    const hit=ray.intersectObject(probe,false)[0];
    return hit?hit.point.clone().add(new V3(0,0,.012*w)):null;
  };
  const fracture=(path,width,tone,shift=0)=>{
    for(let i=0;i<path.length-1;i++)for(let j=0;j<8;j++){
      const a=path[i],b=path[i+1],t0=j/8,t1=(j+1)/8;
      const x0=(a[0]+(b[0]-a[0])*t0)*w+shift,y0=(a[1]+(b[1]-a[1])*t0)*h;
      const x1=(a[0]+(b[0]-a[0])*t1)*w+shift,y1=(a[1]+(b[1]-a[1])*t1)*h;
      const q=[surface(x0-width/2,y0),surface(x1-width/2,y1),surface(x1+width/2,y1),surface(x0+width/2,y0)];
      if(q.every(Boolean)){tri(q[0],q[1],q[2],tone);tri(q[0],q[2],q[3],tone);}
    }
  };
  const paths=[[[-.10,.85],[-.18,.68],[-.055,.51],[-.12,.27]],[[-.055,.51],[.13,.40],[.23,.41]]];
  for(const path of paths){
    fracture(path,w*.012,new THREE.Color('#d9cfb9'),w*.018);
    fracture(path,w*.021,new THREE.Color('#797767'));
  }
  source.dispose();body.dispose();probeMaterial.dispose();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function stoneRing(){
  const[cx]=P(.555,.325,PL),rx=wide(.47,.64,.325,PL)/2,zf=P(.555,.38,PL)[1],zb=P(.555,.27,PL)[1],rz=(zf-zb)/2,zc=(zf+zb)/2;
  for(const[k,n]of[[.95,25],[.73,18]])for(let i=0;i<n;i++){
    if(i===8||i===17)continue;
    const a=i/n*Math.PI*2,x=cx+Math.cos(a)*rx*k,z=zc+Math.sin(a)*rz*k;
    block(x,height(x,z)-.07,z,Math.PI*2*rx*k/n*.92,.20*K,.42*K,Math.atan2(-Math.cos(a),-Math.sin(a)),.1,{ink:.012*K});
  }
  // Worn, low central marker. Its silhouette is broken rather than a perfect box.
  const[x,z]=P(.555,.341,PL),w=wide(.535,.575,.341,PL),h=tall(x,z,PL,.263);
  collectStone(wornMarkerGeometry(w*.9,h,w*.72),x,PL-.05,z-w*.35,.04,0,0,.012*K);solidBox(x,z-w*.35,w*.9,w*.72);
  for(const[u0,u1,vf,vt]of[[.47,.49,.331,.300],[.605,.623,.307,.280],[.625,.643,.36,.332],[.493,.51,.373,.347]])box(u0,u1,vf,vt,{moss:.1});
}
const ROCKS=[[.82,.89,.86,.745],[.745,.82,1,.88],[.27,.335,.8,.7],[.14,.215,.99,.86],[.06,.1,1,.95],[.26,.3,.87,.82],[.31,.365,.88,.82],[.49,.53,.745,.67],[.52,.555,.735,.69],[.92,.95,.93,.90]];
function buildRocks(){
  for(const[u0,u1,vf,vt]of ROCKS){
    const[x,z0]=P((u0+u1)/2,vf),g=height(x,z0),w=wide(u0,u1,vf,g),h=tall(x,z0,g,vt),d=w*.8,z=z0-d/2;
    // The approved scene's rounded faceted rocks, with broken companion chips.
    addStone(x,g-.13,z,w,h,d,{chamfer:.27,extra:14,jitter:.07,moss:.22,noLine:true});
    solidBox(x,z,w*.86,d*.85);
    for(let i=0;i<2;i++){
      const xx=x+R(-.7,.7)*w,zz=z+R(.35,.7)*d,ww=w*R(.14,.26);
      if(trailEdge(xx,zz)<-.2)continue;
      addStone(xx,height(xx,zz)-.08,zz,ww,ww*.65,ww*.8,{chamfer:.25,extra:8,moss:.15,noLine:true});
    }
  }
}

// ---------- roots and the arching trunk: tapered tubes along curves, bark-shaded, inked ----------
const woodParts = [], woodInk = [];
function tube(points, r0, r1, { sides = 8, seg = 3, ink = 0.04, rf = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const N = Math.max(4, Math.ceil(curve.getLength() * seg)), frames = curve.computeFrenetFrames(N, false);
  const sun = new V3(-.6, .55, .55).normalize();
  const light = new THREE.Color(FOL.trunk.light), mid = new THREE.Color(FOL.trunk.mid), shadow = new THREE.Color(FOL.trunk.shadow);
  const build = (extra) => {
    const pos = [], nor = [], col = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = curve.getPointAt(t), r = (rf ? rf(t) : r0 + (r1 - r0) * Math.pow(t, 0.8)) + extra;
      for (let k = 0; k <= sides; k++) {
        const a = k / sides * Math.PI * 2, nv = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
        pos.push(c.x + nv.x * r, c.y + nv.y * r, c.z + nv.z * r); nor.push(nv.x, nv.y, nv.z);
        const lit = nv.dot(sun) * 0.7 + 0.25, tone = lit > .3 ? mid.clone().lerp(light, smooth(.3, .9, lit)) : shadow.clone().lerp(mid, smooth(-.6, .3, lit));
        col.push(tone.r, tone.g, tone.b);
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < sides; k++) { const a = i * (sides + 1) + k, b = a + sides + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    return g.toNonIndexed();
  };
  woodParts.push(build(0)); woodInk.push(build(ink));
}
// a root that lies along the ground from (x, z): it rises out of the trunk's flare, then follows the
// ground half sunk into it, wandering a little; at a cliff it bends over the lip and runs down the
// rock face to the foot before carrying on. r0 is its radius at the trunk.
function groundRoot(x, z, y0, ux, uz, len, r0, wig = 0.45) {
  const nx = -uz, nz = ux, ph = R(0, 6.28), pts = [new V3(x, y0, z)];
  let d = 0.5, prev = height(x, z), ox = 0, oz = 0;
  while (d <= len) {
    const w = Math.sin(d * 0.85 + ph) * wig * Math.min(1, d / 1.5);
    const qx = x + ux * d + nx * w + ox, qz = z + uz * d + nz * w + oz, h = height(qx, qz), r = r0 * (1 - 0.8 * d / len);
    if (prev - h > 0.8) {
      // over the lip and down the face (the face stands up to about a metre out from its outline)
      const lx = qx - ux * 0.5, lz = qz - uz * 0.5, foot = height(qx + ux * 2.2, qz + uz * 2.2);
      pts.push(new V3(lx + ux * 0.3, prev + r * 0.5, lz + uz * 0.3), new V3(lx + ux * 1.15, prev - 0.35, lz + uz * 1.15),
        new V3(lx + ux * 1.35, (prev + foot) / 2, lz + uz * 1.35), new V3(lx + ux * 1.6, foot + r * 0.8, lz + uz * 1.6));
      ox += ux * 1.6; oz += uz * 1.6; prev = foot; d += 1.1; continue;
    }
    pts.push(new V3(qx, h + r * 0.35 + (d < 1.2 ? (1.2 - d) * 0.4 : 0), qz));
    prev = h; d += 0.5;
  }
  if (pts.length < 3) return;
  tube(pts, 0, 0, { sides: 7, seg: 4, rf: t => r0 * (1 - 0.82 * t) * (1 + 0.12 * Math.sin(t * 23 + ph)) + 0.03 });
}
// roots from a tree toward points on the low ground; they cross its top and drape its cliff
function drapeRoots(tx, tz, top, targets, s = 1) {
  for (const [u, v, rr = 1] of targets) {
    const [fx, fz] = P(u, v, 0), dx = fx - tx, dz = fz - tz, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    groundRoot(tx + ux * 0.25 * s, tz + uz * 0.25 * s, top + 0.7 * s, ux, uz, Math.min(d + 1.5, 9 * s), 0.3 * s * rr);
    // a thinner root beside it
    if (rr > 0.85) { const a = R(-0.5, 0.5), c = Math.cos(a), sn = Math.sin(a); groundRoot(tx + ux * 0.3 * s, tz + uz * 0.3 * s, top + 0.4 * s, ux * c - uz * sn, ux * sn + uz * c, Math.min(d * 0.6, 5 * s), 0.14 * s, 0.7); }
  }
}

// ---------- ferns: arching fronds of paired leaflets ----------
function fernTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  c.lineWidth = 5; c.beginPath(); c.moveTo(64, 512); c.quadraticCurveTo(62, 260, 64, 6); c.stroke();
  for (let y = 480; y > 20; y -= 17) {
    const t = 1 - y / 512, len = 58 * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.5) * (0.4 + 0.6 * Math.min(1, t * 4));
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(64 + s * len * 0.5, y - 6, len * 0.5, 6, s * 0.35, 0, Math.PI * 2); c.fill(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fernGeometry() {
  const parts = [], dark = new THREE.Color('#2f6b2c'), light = new THREE.Color('#8fc743');
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + (i % 2) * 0.2, len = 1.05 + (i % 3) * 0.15, g = new THREE.PlaneGeometry(0.36, len, 1, 4);
    g.translate(0, len / 2, 0);
    const p = g.attributes.position, col = [];
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = y / len;
      // arch outward and droop toward the tip
      p.setZ(k, Math.sin(t * 1.4) * len * 0.75); p.setY(k, y * 0.75 - t * t * len * 0.38);
      const cc = dark.clone().lerp(light, t); col.push(cc.r, cc.g, cc.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.rotateY(a); g.deleteAttribute('normal');
    parts.push(g);
  }
  const g = mergeGeometries(parts); const nn = []; for (let i = 0; i < g.attributes.position.count; i++) nn.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); return g;
}

// ---------- cherry petals: fallen on the island and the trails below it, and drifting down ----------
const PETALS = { fall: null, n: 0, data: null, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new V3(), sc: new V3(1, 1, 1) };
function buildPetals(trees) {
  const root = new THREE.Group();
  if (!trees.length) return root;
  const geo = new THREE.CircleGeometry(0.075, 5); geo.scale(1, 0.62, 1);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const t = trees[0], R0 = 3.4 * t.s, ground = [];
  for (let i = 0; i < 2600; i++) {
    const a = R(0, 6.28), r = R0 * Math.sqrt(rand()) * 1.25, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r * 0.9 + R0 * 0.15;
    ground.push({ x, y: height(x, z) + 0.03, z, ry: R(0, 6.28), c: pick(SAKURA.petal) });
  }
  const g = new THREE.InstancedMesh(geo, mat, ground.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  ground.forEach((p, i) => { q.setFromEuler(new THREE.Euler(-Math.PI / 2 + R(-0.3, 0.3), 0, p.ry)); m.compose(new V3(p.x, p.y, p.z), q, new V3(1, 1, 1)); g.setMatrixAt(i, m); g.setColorAt(i, c.set(p.c)); });
  root.add(g);
  // petals in the air: each falls from the crown with a flutter and starts again at the top
  const n = 90, fall = new THREE.InstancedMesh(geo, mat, n), data = [];
  for (let i = 0; i < n; i++) { data.push({ x: t.x + R(-R0, R0), z: t.z + R(-R0, R0) * 0.8, top: t.y + 3.2 * t.s * (t.h || 1), ph: R(0, 1), sp: R(0.06, 0.11), w: R(0.6, 1.4) }); fall.setColorAt(i, c.set(pick(SAKURA.petal))); }
  Object.assign(PETALS, { fall, n, data }); root.add(fall);
  return root;
}
function updatePetals(time) {
  if (!PETALS.fall) return;
  const P0 = PETALS;
  for (let i = 0; i < P0.n; i++) {
    const d = P0.data[i], k = (time * d.sp + d.ph) % 1, ground = height(d.x, d.z);
    P0.p.set(d.x + Math.sin(time * d.w + i) * 0.8 + k * 2.2, d.top + (ground - d.top) * k, d.z + Math.cos(time * d.w * 0.7 + i) * 0.6);
    P0.q.setFromEuler(P0.e.set(time * d.w * 2 + i, time * d.w + i * 0.3, 0));
    P0.m.compose(P0.p, P0.q, P0.sc); P0.fall.setMatrixAt(i, P0.m);
  }
  P0.fall.instanceMatrix.needsUpdate = true;
}

// ---------- ambience: motes in the light, butterflies over the flowers ----------
const AMB = { flies: [], motes: null };
function buildAmbience() {
  const root = new THREE.Group();
  const N = 160, pos = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([R(-20, 20) * K, R(0.4, 5.5), R(-24, 6) * K], i * 3); ph[i] = R(0, 6.28); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: timeU, uScale: { value: 1 } },
    vertexShader: `attribute float aPhase; uniform float uTime, uScale; varying float vA;
      void main(){ vec3 p=position; p.x=mod(p.x+uTime*.25+sin(uTime*.3+aPhase)*.6+20.,40.)-20.; p.y+=sin(uTime*.5+aPhase*2.)*.35; p.z+=cos(uTime*.4+aPhase)*.4;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.5,uScale*.09/-mv.z*(.7+.3*sin(aPhase*3.)));
        vA=.35+.65*pow(max(0.,sin(uTime*1.3+aPhase*5.)),3.); }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=(1.-smoothstep(.0,.5,d))*vA; gl_FragColor=vec4(vec3(1.,.96,.8)*a*.8,a); }`,
  });
  AMB.motes = moteMat; root.add(new THREE.Points(g, moteMat));
  const flyGeo = side => { const geo = new THREE.PlaneGeometry(0.16, 0.13); geo.translate(side * 0.08, 0, 0); geo.rotateX(-Math.PI / 2); return geo; };
  for (const [u, v] of [[0.2, 0.68], [0.62, 0.56], [0.9, 0.62], [0.08, 0.36], [0.4, 0.92], [0.7, 0.75]]) {
    const m = new THREE.MeshBasicMaterial({ color: pick(['#fff3a8', '#ffffff', '#ffd25a', '#bfe7ff']), side: THREE.DoubleSide });
    const f = new THREE.Group(); const wings = [-1, 1].map(s => { const w = new THREE.Mesh(flyGeo(s), m); f.add(w); return w; });
    const [x, z] = P(u, v); f.scale.setScalar(1.4); root.add(f);
    AMB.flies.push({ f, wings, x, z, ph: R(0, 6.28), base: height(x, z) });
  }
  return root;
}
function updateAmbience(t) {
  for (const k of AMB.flies) {
    const a = t * 0.5 + k.ph;
    k.f.position.set(k.x + Math.sin(a * 1.3) * 1.4 + Math.sin(a * 3.1) * 0.3, k.base + 0.7 + Math.sin(a * 2.3) * 0.3, k.z + Math.cos(a * 0.9) * 1.0);
    k.f.rotation.y = a * 1.3;
    const flap = Math.sin(t * 22 + k.ph) * 1.1;
    k.wings[0].rotation.z = flap; k.wings[1].rotation.z = -flap;
  }
  if (AMB.motes) AMB.motes.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

// this scene's colours, measured from the concept: olive-yellow light, deep blue-green shade
FOL.leaf = ['#2f6a55', '#56913f', '#a6c247']; FOL.shrub = ['#2c6150', '#468040', '#94b545'];
FOL.trunk = { light: '#c49c76', mid: '#9d7b5d', shadow: '#6f5749', line: '#4a372e' };
// the cherry in the middle: pale blossom with rose shade, dark grey-brown bark
const SAKURA = { bloom: ['#b35583', '#ec92b4', '#ffd0df'], trunk: { light: '#9a7f78', mid: '#75605c', shadow: '#54443f', line: '#3d302d' }, petal: ['#ffc4d6', '#f7a9c2', '#ffe4ec'] };
STONE.splice(0, STONE.length, ...ruinPalette);
MOSS.splice(0, MOSS.length, '#a7c63f', '#93b23a', '#b5c94c');
// ---------- assemble ----------
const crownOnly = [];   // crowns without a trunk (none here)
function build() {
  { const [x, z] = P(0.5, 0.905); HERO.x = x; HERO.z = z; HERO.face = Math.PI - 0.25; }
  scene.add(buildGround());
  buildLedges();
  scene.add(buildCliffs());
  buildRocks();
  // the ruins, left to right along the back, as the concept has them
  archway(0.145, 0.2, 0.245, 0.12, 0.16, 0.185, 0.17, 1.0);
  wall(0.07, 0.1, 0.245, 0.17);
  pillar(0.21, 0.25, 0.31, 0.085);
  wall(0.265, 0.31, 0.245, 0.085);
  wall(0.31, 0.44, 0.21, 0.095);
  wall(0.45, 0.54, 0.2, 0.01, 1.4);
  archway(0.527, 0.667, 0.245, 0.018, 0.57, 0.623, 0.11);
  wall(0.67, 0.76, 0.255, 0.15);
  pillar(0.77, 0.82, 0.265, 0.03);
  wall(0.82, 0.85, 0.265, 0.15);
  pillar(0.86, 0.925, 0.38, 0.13);
  stoneRing();
  // loose blocks: beside the stair, the row right of it, about the plaza, on the high tier's edge
  for (const b of [[0.5, 0.57, 0.67, 0.645], [0.57, 0.61, 0.54, 0.45], [0.63, 0.67, 0.6, 0.55], [0.68, 0.71, 0.63, 0.58], [0.63, 0.67, 0.7, 0.66],
    [0.76, 0.79, 0.49, 0.45], [0.8, 0.84, 0.54, 0.48], [0.84, 0.88, 0.54, 0.49], [0.88, 0.92, 0.6, 0.56], [0.92, 0.96, 0.66, 0.61],
    [0.75, 0.8, 0.41, 0.36], [0.79, 0.85, 0.39, 0.32], [0.355, 0.395, 0.255, 0.2], [0.495, 0.53, 0.245, 0.18],
    [0.25, 0.31, 0.445, 0.375], [0.32, 0.365, 0.47, 0.43], [0.145, 0.18, 0.38, 0.31], [0.265, 0.31, 0.31, 0.245]]) box(...b);
  // trees: [trunk u, foot v, crown u0, u1, crown bottom v, variant]; size and trunk from the screen
  const TREES = [[0.07, 0.3, -0.02, 0.17, 0.17, 3], [0.32, 0.245, 0.23, 0.43, 0.04, 5], [0.72, 0.2, 0.63, 0.82, 0.03, 9], [0.985, 0.62, 0.89, 1.1, 0.3, 5],
    [0.445, 0.12, 0.39, 0.51, -0.01, 9], [0.88, 0.14, 0.8, 0.98, 0.0, 3], [0.16, 0.12, 0.08, 0.26, -0.02, 9], [0.69, 0.08, 0.63, 0.78, -0.04, 5], [0.0, 0.14, -0.1, 0.1, -0.01, 5]];
  const trunkAt = [];
  for (const [u, vf, c0, c1, vc, seed] of TREES) {
    const [x, z, g] = PG(u, vf), s = wide(c0, c1, vf, g) / 5.7, hb = tall(x, z, g, vc);
    broadleaf(x, z, s, seed); treeItems[treeItems.length - 1].h = Math.max(0.35, (hb + 0.5 * s) / (3.5 * s));
    COLLIDERS.push({ x, z, r: 0.42 * s }); trunkAt.push([x, z, 1.2 * s]);
    if (u < .4 || u > .9) drapeRoots(x, z, g, [[u-.035,vf+.045,.6],[u+.035,vf+.045,.6]], s*.65);
  }
  // bush masses: [u, v, half width as a screen fraction, count, size range in concept metres]
  const BUSHES = [[0.12, 0.86, 0.13, 16, [0.9, 1.5]], [0.27, 0.96, 0.07, 6, [0.8, 1.2]], [0.04, 0.73, 0.05, 5, [0.8, 1.2]], [0.165, 0.64, 0.035, 4, [0.8, 1.1]],
    [0.42, 0.5, 0.06, 6, [0.7, 1.1]], [0.55, 0.6, 0.04, 4, [0.6, 0.9]], [0.24, 0.5, 0.05, 4, [0.6, 0.9]], [0.05, 0.42, 0.07, 8, [0.9, 1.3]], [0.13, 0.33, 0.04, 3, [0.7, 1.0]],
    [0.9, 0.45, 0.08, 7, [0.9, 1.3]], [0.8, 0.43, 0.04, 3, [0.6, 1.0]], [0.94, 0.76, 0.07, 7, [1.0, 1.5]], [0.97, 0.93, 0.06, 6, [1.0, 1.6]], [0.68, 0.53, 0.03, 2, [0.6, 0.8]],
    [0.12, 0.25, 0.05, 3, [0.7, 1.0]], [0.4, 0.22, 0.04, 3, [0.6, 0.9]], [0.75, 0.27, 0.04, 3, [0.6, 0.9]], [0.84, 0.3, 0.03, 2, [0.6, 0.9]], [0.05, 0.16, 0.06, 4, [0.9, 1.3]], [0.93, 0.18, 0.05, 4, [0.9, 1.3]]];
  for (const [u, v, hu, n, [s0, s1]] of BUSHES) {
    const [cx, cz, g] = PG(u, v), rad = wide(u - hu, u + hu, v, g) / 2;
    for (let k = 0; k < n; k++) {
      const a = R(0, 6.28), r = Math.sqrt(rand()) * rad, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.7;
      if (trailEdge(x, z) < 0.2 || stairsAt(x, z).inside || trunkAt.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr) || COLLIDERS.some(c => c.box ? Math.abs(x-c.x)<c.w/2+.3 && Math.abs(z-c.z)<c.d/2+.3 : Math.hypot(x-c.x,z-c.z)<c.r)) continue;
      addBush(x, height(x, z) - 0.1, z, M(R(s0, s1)) * 0.78, { sy: 0.72, tint: R(-2.0, -0.2) });
    }
  }
  // grass clumps and flowers, in patches, leaving the dirt bare
  for (let i = 0; i < 34000; i++) {
    const x = R(GX0 + 4, GX1 - 4), z = R(-30 * K, GZ1);
    const tr = trailEdge(x, z);
    if (tr < -0.2 || stairsAt(x, z).inside) continue;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.29) * 2.0) * Math.sin(z * 0.41 - x * 0.13);
    if (rand() > (tr < 0.6 ? 0.55 : 0.25 + patch * 0.75)) continue;
    const y = height(x, z);
    if (Math.abs(height(x + 0.4, z) - y) > 0.35 || Math.abs(height(x, z + 0.4) - y) > 0.35) continue;   // not on the rock faces
    grassItems.push({ x, y: y - 0.03, z, s: R(0.75, 1.15), ry: R(0, 6.28), k: 0.82 + 0.3 * patch + R(-0.05, 0.05) });
    if (rand() < (tr < 1.2 ? 0.45 : 0.22) * (0.5 + patch)) for (let k = 0; k < 3; k++) flowerItems.push({ x: x + R(-0.5, 0.5), y: y - 0.02, z: z + R(-0.5, 0.5), s: R(0.9, 1.3), ry: R(0, 6.28), c: rand() < 0.75 ? '#f6d43a' : '#fff8e6' });
  }
  // ferns at the edges of the path
  const fernItems = [];
  for (const [u, v, s] of [[0.22, 0.79, 1.5], [0.4, 0.88, 1.4], [0.68, 0.9, 1.2], [0.9, 0.7, 1.4], [0.6, 0.73, 1.1], [0.97, 0.66, 1.2], [0.33, 0.94, 1.1]]) {
    const [x, z] = P(u, v, 0); fernItems.push({ x, y: height(x, z) - 0.05, z, s: s * K / 1.6, ry: R(0, 6.28), k: R(0.9, 1.05) });
  }

  // merged stones + outline shells
  const stones = new THREE.Mesh(mergeGeometries(stoneParts), masonryMaterial());
  stones.customDepthMaterial = masonryDepth;
  stones.castShadow = stones.receiveShadow = true;
  scene.add(stones, new THREE.Mesh(mergeGeometries(stoneLines), outlineMat('#686858')));
  // roots and the arch, with an ink outline
  if (woodParts.length) {
  const wood = new THREE.Mesh(mergeGeometries(woodParts), paint({ vertexColors: true, shade: [0.62, 0.62, 0.7], mid: [0.62, 0.62, 0.7], band: [-5, -5] }));
  wood.castShadow = wood.receiveShadow = true; scene.add(wood);
  scene.add(new THREE.Mesh(mergeGeometries(woodInk), outlineMat(FOL.trunk.line)));
  }
  // Clear plants from the marked exposed face; retain the surrounding canopy
  // and the vegetation above the stone shoulder.
  for(const items of [shrubItems,grassItems,flowerItems]){
    for(let i=items.length-1;i>=0;i--){
      const p=new V3(items[i].x,items[i].y,items[i].z).project(camera),u=(p.x+1)/2,v=(1-p.y)/2;
      if(u>.12&&u<.265&&v>.47&&v<.69)items.splice(i,1);
    }
  }
  const placeAll = (mesh, items, scale) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(new V3(0, 1, 0), it.ry);
      m.compose(new V3(it.x, it.y, it.z), q, scale(it));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.c ? c.set(it.c) : c.setRGB(it.k, it.k, it.k * 0.97));
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  };
  const sway = (amp, base) => ({ sway: [amp, base] });
  const leafMat = shrub => paint({ vertexColors: true, map: branchletTexture(shrub), alphaTest: 0.45, side: THREE.DoubleSide, shade: [0.6, 0.7, 0.72], mid: [0.6, 0.7, 0.72], band: [-5, -5], ...sway(shrub ? 0.02 : 0.016, shrub ? 0 : 1.2) });
  const leafDepth = shrub => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: branchletTexture(shrub), alphaTest: 0.45 });
  const trunkMat = paint({ vertexColors: true, side: THREE.DoubleSide, shade: [0.62, 0.62, 0.7], mid: [0.62, 0.62, 0.7], band: [-5, -5] });
  const addTrunks = (geo, items, line) => {
    if (!items.length) return;
    const t = placeAll(new THREE.InstancedMesh(geo, trunkMat, items.length), items, it => new V3(it.s, it.s * (it.h || 1), it.s));
    t.castShadow = t.receiveShadow = true; scene.add(t);
    scene.add(placeAll(new THREE.InstancedMesh(geo, outlineMat(line), items.length), items, it => new V3(it.s * 1.06, it.s * (it.h || 1) * 1.01, it.s * 1.06)));
  };
  const green = treeItems.filter(t => !t.sakura), sakura = treeItems.filter(t => t.sakura);
  addTrunks(animeTrunk(), green, FOL.trunk.line);
  // the cherry: the game's own trunk and crown, in cherry bark and blossom colours
  const keep = { leaf: FOL.leaf, trunk: FOL.trunk };
  FOL.trunk = SAKURA.trunk; addTrunks(animeTrunk(), sakura, SAKURA.trunk.line);
  FOL.leaf = SAKURA.bloom;
  const bloom = animeFoliage(9, false);
  Object.assign(FOL, keep);
  if (sakura.length) {
    const c = placeAll(new THREE.InstancedMesh(bloom, leafMat(false), sakura.length), sakura.map(t => ({ ...t, y: t.y + 3.5 * t.s * (t.h || 1) })), it => new V3(3.0 * it.s, 2.0 * it.s, 2.7 * it.s));
    c.customDepthMaterial = leafDepth(false); c.castShadow = c.receiveShadow = true; scene.add(c);
  }
  [3, 5, 9].forEach((seed, v) => {
    const items = [...green.filter(t => t.v === v).map(t => ({ ...t, y: t.y + 3.5 * t.s * (t.h || 1) })), ...crownOnly.filter(c => c.v === v)];
    if (!items.length) return;
    const crown = placeAll(new THREE.InstancedMesh(animeFoliage(seed, false), leafMat(false), items.length), items, it => new V3(3.0 * it.s, 2.0 * it.s, 2.7 * it.s));
    crown.customDepthMaterial = leafDepth(false); crown.castShadow = crown.receiveShadow = true; scene.add(crown);
  });
  [11, 13, 19].forEach((seed, v) => {
    const items = shrubItems.filter(t => t.v === v);
    if (!items.length) return;
    const mesh = placeAll(new THREE.InstancedMesh(animeFoliage(seed, true), leafMat(true), items.length), items, it => new V3(it.sx, it.sy, it.sz));
    mesh.customDepthMaterial = leafDepth(true); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  });
  const grass = placeAll(new THREE.InstancedMesh(meadowGrass(), paint({ vertexColors: true, side: THREE.DoubleSide, shade: [0.6, 0.72, 0.68], mid: [0.6, 0.72, 0.68], band: [-5, -5], ...sway(0.15, 0) }), grassItems.length), grassItems, it => new V3(it.s, it.s, it.s));
  grass.receiveShadow = true; scene.add(grass);
  const flowers = placeAll(new THREE.InstancedMesh(wildflower(), paint({ vertexColors: true, side: THREE.DoubleSide, shade: [0.7, 0.72, 0.74], mid: [0.7, 0.72, 0.74], band: [-5, -5], ...sway(0.12, 0) }), flowerItems.length), flowerItems, it => new V3(it.s, it.s, it.s));
  flowers.receiveShadow = true; scene.add(flowers);
  const ferns = placeAll(new THREE.InstancedMesh(fernGeometry(), paint({ vertexColors: true, map: fernTexture(), alphaTest: 0.4, side: THREE.DoubleSide, shade: [0.55, 0.68, 0.66], mid: [0.55, 0.68, 0.66], band: [-5, -5], ...sway(0.05, 0) }), fernItems.length), fernItems, it => new V3(it.s, it.s, it.s));
  ferns.receiveShadow = true; scene.add(ferns);
  scene.add(buildHero());
  loadHeroModel().catch(e => console.error('hero model', e));
  scene.add(buildAmbience());
  scene.add(buildPetals(sakura));
  setStatus();
}

function resize() {
  fitStage();
  const r = stage.getBoundingClientRect();
  renderer.setSize(Math.round(r.width), Math.round(r.height), false);
  camera.aspect = ASPECT; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
function setStatus() {
  const msg = 'แตะพื้นในภาพ 3D เพื่อเดิน';
  if (msg !== lastStatus) { status.textContent = msg; lastStatus = msg; }
}
build();
resize();
const caster = new THREE.Raycaster();
function groundAt(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  caster.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  const o = caster.ray.origin, d = caster.ray.direction, p = new V3();
  for (let s = 1; s < CAM.dist + 150; s += 0.45) {
    p.copy(o).addScaledVector(d, s);
    if (p.y < height(p.x, p.z)) {
      let lo = s - 0.45, hi = s;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; p.copy(o).addScaledVector(d, mid); if (p.y < height(p.x, p.z)) hi = mid; else lo = mid; }
      return p.clone();
    }
  }
  return null;
}
stage.addEventListener('pointerdown', e => {
  const r = stage.getBoundingClientRect();
  if ((e.clientX - r.left) / r.width * 100 > +wipe.value) return;   // the reference side is a picture
  const p = groundAt(e.clientX, e.clientY);
  if (p) { HERO.tx = p.x; HERO.tz = p.z; }
});
function walkTo(x, z) { HERO.tx = x; HERO.tz = z; }
const clock = new THREE.Clock();
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// resolution follows the frame time: below 50 fps it drops a step, above 70 fps it climbs back
let perfAcc = 0, perfFrames = 0, frameNo = 0;
function adapt(raw) {
  if (window.__noAdapt) return;
  perfAcc += raw; perfFrames++;
  if (perfAcc < 1) return;
  const ms = perfAcc / perfFrames * 1000; perfAcc = perfFrames = 0;
  const next = ms > 20 ? Math.max(0.75, pixelRatio - 0.25) : ms < 14 ? Math.min(MAX_PR, pixelRatio + 0.25) : pixelRatio;
  if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
}
function frame() {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = window.__reviewTime ?? clock.elapsedTime;
  adapt(raw);
  if (frameNo++ % 2 === 0) renderer.shadowMap.needsUpdate = true;
  timeU.value = reduce ? 0 : t;
  updateHero(dt, t);
  updateAmbience(t);
  updatePetals(timeU.value);
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__scene = { lockPR: v => { pixelRatio = v; renderer.setPixelRatio(v); resize(); window.__noAdapt = true; }, scene, camera, renderer, CAM, placeCamera, HERO, walkTo, P, height, blocked, updateHero, colliders: COLLIDERS, stairsAt, time: () => timeU.value, ready: true };
