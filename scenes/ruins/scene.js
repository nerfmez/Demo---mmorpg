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
// the ridge is lower at its left end, as the concept draws it (about 3 m there, 4 m mid-way)
const ridgeTop = (() => { const xl = P(0.08, 0.68, 0)[0], xc = P(0.3, 0.77, 0)[0]; return x => M(3.0) + (T1 - M(3.0)) * smooth(xl, xc, x); })();
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
  const n = 12, rows = [], lerp = (a, b, t) => a + (b - a) * t;
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
  return { a, s, inside: a > -0.02 && a < 1.02 && s < ST.half + 0.25 };
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
  let y = 0, top = 0;
  for (const T of TERRACES) {
    const d = polyAt(T, x, z);
    if (d === null) continue;
    // a cliff rises over its lean; elsewhere the edge is a grassy bank `soft` metres wide
    const w = polyAt.wall && T.ledge ? 1 - smooth(-0.35 - T.lean, 0.05, d) : 1 - smooth(-T.soft, 0.25, d);
    const b = T.base || 0;
    if (w > 0) { y = Math.max(y, b + ((T.topAt ? T.topAt(x) : T.top) - b) * w); top = Math.max(top, w); }
  }
  const st = stairsAt(x, z);
  // the stair lies on a hillside: the ground either side slopes down with it, no cliff beside it
  if (st.a > -0.35 && st.a < 1.1 && st.s < ST.half + ST.bank) {
    const sy = ST.top * Math.max(0, Math.min(1, st.a));
    const k = Math.max(smooth(ST.half + 0.3, ST.half + ST.bank, st.s), smooth(1.0, 1.1, st.a));
    if (y > sy) y = sy + (y - sy) * k;
    if (st.inside) y = sy;
  }
  return { y, top };
}
function height(x, z) {
  const f = field(x, z);
  return f.y + 0.05 * noise2(x * 0.6, z * 0.6) + 0.08 * f.top * noise2(x * 0.4 + 7, z * 0.4);
}

// ---------- ground: grass, the dirt trails and leaf shade, one painted mesh ----------
const GROUND_BAKE = { value: null };
function buildGround() {
  const W = GX1 - GX0, D = GZ1 - GZ0;
  const g = new THREE.PlaneGeometry(W, D, Math.round(W * 2.5), Math.round(D * 2.5));
  g.rotateX(-Math.PI / 2); g.translate((GX0 + GX1) / 2, 0, (GZ0 + GZ1) / 2);
  const p = g.attributes.position, n = p.count, w = new Float32Array(n * 3), td = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, height(x, z));
    const st = stairsAt(x, z);
    const d = st.inside ? -3 : Math.max(-4, Math.min(4, trailEdge(x, z)));
    td[i] = d;
    const trail = 1 - smooth(-0.5, 0.5, d);
    w[i * 3] = 1 - trail; w[i * 3 + 1] = trail; w[i * 3 + 2] = shadeAt(x, z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(w, 3)); g.setAttribute('trailD', new THREE.BufferAttribute(td, 1));
  g.computeVertexNormals();
  const box = new THREE.Vector4(GX0, GZ0, W, D);
  const mat = paint({
    vertexColors: true, shade: [0.5, 0.42, 0.4], mid: [0.8, 0.7, 0.62], band: [-0.2, 0.18],
    uniforms: { uBake: GROUND_BAKE, uBakeBox: { value: box } },
    extraFrag: 'uniform sampler2D uBake; uniform vec4 uBakeBox;',
    albedo: /* glsl */`
  vec3 a=texture2D(uBake,(vW.xz-uBakeBox.xy)/uBakeBox.zw).rgb; diffuseColor.rgb=a*a;
  float gw=vColor.x;
  gShade=mix(uShade,vec3(.3,.46,.46),gw); gMid=mix(uMid,vec3(.64,.78,.68),gw);`,
  });
  // bake: draw the ground once, flat, into a 2048 texture with the full painted-colour shader
  const rt = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: false });
  rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
  const bakeMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uBox: { value: box } },
    vertexShader: `attribute vec3 color; attribute float trailD; uniform vec4 uBox; varying vec3 vW, vWN, vColor; varying float vD;
      void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; vWN=normalize(mat3(modelMatrix)*normal); vColor=color; vD=trailD;
        gl_Position=vec4((vW.xz-uBox.xy)/uBox.zw*2.-1.,0.,1.); }`,
    fragmentShader: `varying vec3 vW, vWN, vColor; varying float vD;
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
  col=mix(col,${L('#9a958d')},steep*.85);
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
// flat facets (its own lean, set and ragged top), so the cliff reads as one cracked rock wall, not
// stones set in a row. A grassy lip rolls over the top.
const COLLIDERS = [];
function cliffRuns(T) {
  const p = T.pts, n = p.length;
  const onStairs = q => stairsAt(q.x, q.z).s < ST.half + ST.bank - 1 && stairsAt(q.x, q.z).a > -0.35 && stairsAt(q.x, q.z).a < 1.05;   // the hillside by the stair
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
function buildCliffs() {
  const pos = [], col = [], tmpA = new V3(), tmpB = new V3(), nn = new V3();
  const quad = (a, b, c, d, out, color) => {
    tmpA.subVectors(b, a); tmpB.subVectors(c, a); nn.crossVectors(tmpA, tmpB);
    const vs = nn.dot(out) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const v of vs) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); }
  };
  const stone = STONE.map(h => new THREE.Color(h)), moss = MOSS.map(h => new THREE.Color(h));
  const F = [0, 0.32, 0.66, 1];   // the face's facet rows, as fractions of its height
  for (const T of TERRACES) {
    if (!T.ledge) continue;
    for (const run of cliffRuns(T)) {
      const R0 = run.pts.map(q => ({ x: q.x, z: q.z }));
      if (R0.length < 2) continue;
      if (run.closed) R0.push(R0[0]);
      // every 0.4 m along the run, so each column gets several facets
      const S = [];
      for (let i = 0; i < R0.length - 1; i++) {
        const a = R0[i], b = R0[i + 1], k = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
        for (let j = 0; j < k; j++) S.push({ x: a.x + (b.x - a.x) * j / k, z: a.z + (b.z - a.z) * j / k });
      }
      S.push({ ...R0[R0.length - 1] });
      // outward normals and arc length
      let acc = 0;
      S.forEach((q, i) => {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        q.nx = tz / l; q.nz = -tx / l;
        if (polyAt(T, q.x + q.nx * 0.8, q.z + q.nz * 0.8) < 0) { q.nx = -q.nx; q.nz = -q.nz; }
        if (i) acc += Math.hypot(q.x - S[i - 1].x, q.z - S[i - 1].z); q.s = acc;
        q.base = Math.min(height(q.x + q.nx * 1.0, q.z + q.nz * 1.0), height(q.x + q.nx * 2.0, q.z + q.nz * 2.0)) - 0.35;
      });
      // columns between cracks
      const cols = []; let i0 = 0;
      while (i0 < S.length - 1) {
        const w = M(rand() < 0.22 ? R(1.8, 2.6) : R(0.9, 1.5)); let i1 = i0 + 1;
        while (i1 < S.length - 1 && S[i1].s - S[i0].s < w) i1++;
        cols.push({ i0, i1, s0: S[i0].s, s1: S[i1].s, off: M(R(-0.1, 0.5)), slope: R(-0.15, 0.15), ridge: M(R(0.12, 0.35)), peak: R(0.3, 0.7), top: (T.topAt ? T.topAt(S[i0].x) : T.top) + M(rand() < 0.35 ? R(0.2, 0.55) : R(-0.1, 0.15)), cap: M(R(0.4, 0.7)), moss: R(0, 1), rows: F.map(() => M(R(-0.1, 0.1))), lean: T.lean + M(R(-0.1, 0.15)), c: pick(stone).clone().multiplyScalar(R(0.95, 1.05)), mid: (S[i0].s + S[i1].s) / 2 });
        i0 = i1;
      }
      const vtx = (C, i, r) => {
        const q = S[i], f = F[r], u = (q.s - C.s0) / Math.max(0.01, C.s1 - C.s0);
        // a ridge down each column: two flat planes meeting at an edge, one lit and one in shade
        const ridge = C.ridge * (u < C.peak ? u / C.peak : (1 - u) / (1 - C.peak));
        const o = 0.15 + C.off + C.slope * (q.s - C.mid) + ridge + C.rows[r] + (r === 0 ? 0.25 : 0) - C.lean * f;
        return new V3(q.x + q.nx * o, q.base + (C.top - q.base) * f + (r === F.length - 1 ? 0.04 * noise2(q.x * 2.1, q.z * 2.1) : 0), q.z + q.nz * o);
      };
      const shade = new THREE.Color();
      cols.forEach((C, ci) => {
        for (let i = C.i0; i < C.i1; i++) {
          const out = new V3((S[i].nx + S[i + 1].nx) / 2, 0, (S[i].nz + S[i + 1].nz) / 2);
          for (let r = 0; r < F.length - 1; r++) {
            shade.copy(C.c).multiplyScalar(r === 0 ? 0.9 : 1 + R(-0.03, 0.03));
            if (r === F.length - 2 && (i - C.i0) % 3 !== 0 && rand() < 0.5) shade.lerp(pick(moss), R(0.35, 0.6));   // moss creeping down from the top
            quad(vtx(C, i, r), vtx(C, i + 1, r), vtx(C, i + 1, r + 1), vtx(C, i, r + 1), out, shade);
          }
          // the top of the rock: a rounded edge, then a flat stone cap running back into the grass,
          // mossy in patches, and an inner face down to the ground behind it
          const t0 = vtx(C, i, F.length - 1), t1 = vtx(C, i + 1, F.length - 1);
          const edge = (k, inset, up) => { const q = S[k], o = vtx(C, k, F.length - 1); return new V3(o.x - q.nx * inset, o.y + up, o.z - q.nz * inset); };
          const e0 = edge(i, 0.22, 0.14), e1 = edge(i + 1, 0.22, 0.14);
          const back = (k, dy) => { const q = S[k]; return new V3(q.x - q.nx * C.cap, C.top + 0.14 + dy, q.z - q.nz * C.cap); };
          const b0 = back(i, R(-0.04, 0.04)), b1 = back(i + 1, R(-0.04, 0.04));
          const mossy = noise2(S[i].x * 0.9 + 4, S[i].z * 0.9) * 0.5 + 0.5 < 0.35 + C.moss * 0.4;
          shade.copy(C.c).multiplyScalar(1.04); if (mossy) shade.lerp(pick(moss), R(0.5, 0.75));
          quad(t0, t1, e1, e0, out, shade.clone().multiplyScalar(0.97));
          quad(e0, e1, b1, b0, new V3(0, 1, 0), shade);
          quad(b0, b1, new V3(b1.x, height(b1.x, b1.z) - 0.3, b1.z), new V3(b0.x, height(b0.x, b0.z) - 0.3, b0.z), new V3(-out.x, 0, -out.z), shade.copy(C.c).multiplyScalar(0.8));
        }
        // the open ends of a run: a side face from the rock face back to the cap
        if (!run.closed) for (const k of (ci === 0 ? [C.i0] : []).concat(ci === cols.length - 1 ? [C.i1] : [])) {
          const q = S[k], side = new V3(q.nz, 0, -q.nx).multiplyScalar(k === C.i0 ? -1 : 1);
          for (let r = 0; r < F.length - 1; r++) {
            const a0 = vtx(C, k, r), a1 = vtx(C, k, r + 1);
            quad(a0, a1, new V3(q.x - q.nx * C.cap, a1.y, q.z - q.nz * C.cap), new V3(q.x - q.nx * C.cap, a0.y, q.z - q.nz * C.cap), side, shade.copy(C.c).multiplyScalar(0.9));
          }
          // bushes heaped against the open end, so it does not read as a cut
          for (let b = 0; b < 4; b++) addBush(q.x + side.x * R(0.4, 1.6) - q.nx * R(-0.5, 1.5), height(q.x + side.x * 1.2, q.z + side.z * 1.2) - 0.1 + b * 0.5, q.z + side.z * R(0.4, 1.6) - q.nz * R(-0.5, 1.5), R(0.8, 1.3), { sy: 0.8, tint: R(-0.8, 0) });
        }
        // the crack to the next column: a narrow face joining their two edges, in shadow
        const D = cols[ci + 1];
        if (D) {
          const out = new V3(S[C.i1].nz, 0, -S[C.i1].nx);
          for (let r = 0; r < F.length - 1; r++) quad(vtx(C, C.i1, r), vtx(D, C.i1, r), vtx(D, C.i1, r + 1), vtx(C, C.i1, r + 1), out, shade.copy(C.c).multiplyScalar(0.55));
        }
        // life on the cliff: grass over the lip and hanging down, tufts in the crack, bushes on top and at the foot
        const q = S[Math.round((C.i0 + C.i1) / 2)];
        for (let g = C.i0; g <= C.i1; g++) {
          const a = S[g];
          // grass behind the cap, a few tufts on it
          for (let k = 0; k < 3; k++) { const b = C.cap + R(0.05, 0.9); grassItems.push({ x: a.x - a.nx * b + R(-0.3, 0.3), y: height(a.x - a.nx * b, a.z - a.nz * b) + 0.02, z: a.z - a.nz * b + R(-0.3, 0.3), s: R(1.0, 1.5), ry: R(0, 6.28), k: R(0.9, 1.1) }); }
          if (rand() < 0.18) { const b = R(0.4, C.cap - 0.1); grassItems.push({ x: a.x - a.nx * b, y: C.top + 0.12, z: a.z - a.nz * b, s: R(0.7, 1.0), ry: R(0, 6.28), k: 1 }); }
        }
        if (D) for (let k = 0; k < 2; k++) { const v = vtx(C, C.i1, 1 + k); grassItems.push({ x: v.x + S[C.i1].nx * 0.1, y: v.y - 0.2, z: v.z + S[C.i1].nz * 0.1, s: R(0.8, 1.2), ry: R(0, 6.28), k: 0.9 }); }
        if (rand() < 0.4) addBush(q.x - q.nx * (C.cap + R(0.3, 1.0)), C.top - M(0.15) - 0.25, q.z - q.nz * R(0.6, 1.4), R(0.45, 0.8), { sy: 0.55, tint: R(-0.4, 0.3) });
        if (rand() < 0.2) addBush(q.x + q.nx * R(1.0, 1.8), q.base + 0.3, q.z + q.nz * R(1.0, 1.8), R(0.5, 0.85), { sy: 0.75, tint: -0.6 });
        if (rand() < 0.12) { const r = R(0.35, 0.75), x = q.x + q.nx * R(1.2, 2.4), z = q.z + q.nz * R(1.2, 2.4); addStone(x, height(x, z) - 0.06, z, r, r * R(0.6, 0.85), r, { chamfer: 0.12, jitter: 0.14, extra: 7, ry: R(-0.6, 0.6), moss: 0.3 }); }
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, paint({ vertexColors: true, shade: [0.36, 0.34, 0.44], mid: [0.64, 0.62, 0.67], band: [-0.34, 0.24] }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function buildLedges() {
  // the ramp: rows of sandy paving slabs, two or three side by side, each row a low step
  ST.rows.forEach((r, i) => {
    const next = ST.rows[Math.min(ST.n - 1, i + 1)], prev = ST.rows[Math.max(0, i - 1)], d = Math.max(0.5, Math.abs(prev.z - next.z) / (i === 0 || i === ST.n - 1 ? 1 : 2) * 1.15);
    const k = Math.max(2, Math.round(r.w / M(1.1))), w = r.w / k, sh = i % 2 ? w * 0.5 : 0;
    for (let j = 0; j < k + (i % 2); j++) {
      const lx = -r.w / 2 + w * (j + 0.5) - sh;
      if (Math.abs(lx) > r.w / 2 - w * 0.25 || rand() < 0.03) continue;
      const x = r.x + lx, g = Math.min(height(x, r.z), r.y) - 0.35;
      addStone(x, g, r.z, w * R(0.95, 1.0), r.y - g, d, { chamfer: 0.16, jitter: 0.04, extra: 4, ry: R(-0.03, 0.03), moss: 0.06, base: pick(['#e2c78f', '#d8bb81', '#e9d3a2']) });
    }
  });
}

// ---------- the ruins: big worn blocks, some walls and pillars single slabs, broken and mossy ----------
// Each piece is authored as its screen box in the concept: [u0, u1] across, its foot at vFoot, its
// top at vTop. It stands on whichever level is under it; its width and height come from the camera.
function PG(u, v) {
  for (const h of [T2, T1, M(3.0), PL]) { const q = P(u, v, h); if (Math.abs(height(q[0], q[1]) - h) < 0.5) return [q[0], q[1], h]; }
  const q = P(u, v, 0); return [q[0], q[1], height(q[0], q[1])];
}
// z is the front face: a piece `d` deep stands centred at z - d / 2, so its front foot and its top
// front edge are the ones the concept shows
function screenBox(u0, u1, vFoot, vTop) {
  const [x, z, g] = PG((u0 + u1) / 2, vFoot);
  return { x, z, g, w: wide(u0, u1, vFoot, g), h: tall(x, z, g, vTop) };
}
const blockStyle = { chamfer: 0.1, jitter: 0.05, extra: 5 };
function block(x, y, z, w, h, d, ry = 0, moss = 0.35, o = {}) {
  // never a sliver: a thin block's outline shell would be scaled up into a dark sheet
  addStone(x, y, z, Math.max(w, 0.35), Math.max(h, 0.35), Math.max(d, 0.35), { ...blockStyle, ry, moss, ...o });
}
// ivy hanging down a face from y0: a strand of small leaf clumps, thinning as it falls
function ivy(x, y0, z, len) {
  const n = Math.max(2, Math.round(len / M(0.4)));
  for (let i = 0; i < n; i++) { const t = i / n; addBush(x + R(-0.15, 0.15) * K, y0 - t * len, z, M(0.3 - 0.12 * t), { sy: 0.9, tint: R(-0.7, 0.2) }); }
}
// overgrowth round a piece: leaves on top, ivy down the front, bushes at the foot
function overgrow(x, z, g, w, h, d) {
  if (rand() < 0.65) addBush(x + R(-0.25, 0.25) * w, g + h - 0.1, z, M(R(0.3, 0.5)), { sy: 0.45, tint: 0.2 });
  if (rand() < 0.55) ivy(x + R(-0.35, 0.35) * w, g + h, z + d / 2 + 0.1, h * R(0.35, 0.8));
  for (let k = 0; k < 2; k++) if (rand() < 0.75) addBush(x + R(-0.6, 0.6) * w, g - 0.1, z + d / 2 + M(R(0.2, 0.6)), M(R(0.4, 0.7)), { sy: 0.7, tint: R(-0.8, 0) });
}
// a single block, as the concept's loose and fallen ones
function box(u0, u1, vFoot, vTop, { d = 0.9, tilt = 0.06, moss = 0.5 } = {}) {
  const b = screenBox(u0, u1, vFoot, vTop); b.z -= b.w * d / 2;
  block(b.x, b.g - 0.15, b.z, b.w, b.h + 0.15, b.w * d, R(-0.2, 0.2), moss, { rx: R(-tilt, tilt), rz: R(-tilt, tilt) });
  if (rand() < 0.5) addBush(b.x, b.g + b.h - 0.05, b.z, M(0.3), { sy: 0.4, tint: 0.2 });
  COLLIDERS.push({ x: b.x, z: b.z, r: b.w * 0.6 });
}
// a column on a plinth: one shaft or two or three long drums, capped or broken off
function pillar(u0, u1, vFoot, vTop, { cap = true } = {}) {
  const b = screenBox(u0, u1, vFoot, vTop), w = b.w * 0.82, ry = R(-0.15, 0.15); b.z -= b.w / 2;
  const capH = cap ? b.h * 0.1 : 0, plinth = b.h * 0.1;
  block(b.x, b.g - 0.2, b.z, b.w, plinth + 0.2, b.w, ry, 0.6);
  let y = b.g + plinth;
  const shaft = b.h - plinth - capH;
  if (rand() < 0.45) block(b.x, y, b.z, w, shaft, w, ry, 0.3);
  else { const n = rand() < 0.5 ? 2 : 3; for (let i = 0; i < n; i++) { block(b.x + R(-0.05, 0.05), y, b.z, w * R(0.96, 1.02), shaft / n, w * R(0.96, 1.02), ry + R(-0.05, 0.05), 0.3); y += shaft / n; } }
  y = b.g + plinth + shaft;
  if (cap) block(b.x, y - 0.05, b.z, b.w * 1.05, capH + 0.05, b.w * 1.05, ry, 0.75);
  overgrow(b.x, b.z, b.g, b.w, b.h, b.w);
  COLLIDERS.push({ x: b.x, z: b.z, r: b.w * 0.6 });
}
// a wall facing the camera: big blocks in a few courses, a third of it single slabs, its top ragged
function wall(u0, u1, vFoot, vTop, depth = 1.1) {
  const b = screenBox(u0, u1, vFoot, vTop), d = M(depth), x0 = b.x - b.w / 2; b.z -= d / 2;
  for (let s = 0; s < b.w - 0.1;) {
    const w = Math.min(M(R(1.0, 1.9)), b.w - s), x = x0 + s + w / 2, top = b.h * (0.6 + 0.4 * rand());
    const mono = rand() < 0.35;
    for (let y = b.g - 0.2, c = 0; y < b.g + top - 0.05; c++) {
      const h = mono ? b.g + top - y : Math.min(M(R(0.8, 1.4)), b.g + top - y);
      block(x + (c % 2 ? R(-0.2, 0.2) * K : 0), y, b.z, w * R(0.94, 1.0), h, d * R(0.94, 1.04), R(-0.03, 0.03), y + h > b.g + top - 0.2 ? 0.65 : 0.18);
      y += h;
    }
    overgrow(x, b.z, b.g, w, top, d);
    COLLIDERS.push({ x, z: b.z, r: Math.max(w, d) * 0.55 });
    s += w;
  }
}
// an arched gateway facing the camera: two piers, a ring of wedge stones, courses above
function archway(u0, u1, vFoot, vTop, ou0, ou1, vOpen, depth = 1.4) {
  const b = screenBox(u0, u1, vFoot, vTop), span = wide(ou0, ou1, vFoot, b.g), d = M(depth); b.z -= d / 2;
  const pierW = (b.w - span) / 2, openH = tall(b.x, b.z, b.g, vOpen), r0 = span / 2, pierH = Math.max(M(0.6), openH - r0), yc = b.g + pierH;
  const at = (lx, y, w, h, rz = 0, moss = 0.25) => block(b.x + lx, y, b.z, w, h, d, 0, moss, { rz });
  for (const side of [-1, 1]) {
    for (let y = b.g - 0.2; y < yc - 0.05;) { const h = Math.min(M(R(0.9, 1.4)), yc - y); at(side * (r0 + pierW / 2), y, pierW * R(0.97, 1.02), h); y += h; }
    COLLIDERS.push({ x: b.x + side * (r0 + pierW / 2), z: b.z, r: pierW * 0.7 });
    if (rand() < 0.7) ivy(b.x + side * (r0 + pierW * R(0.2, 0.8)), b.g + b.h * 0.9, b.z + d / 2 + 0.1, b.h * R(0.4, 0.8));
    addBush(b.x + side * (r0 + pierW), b.g, b.z + d / 2 + M(0.4), M(R(0.5, 0.8)), { sy: 0.7, tint: -0.4 });
  }
  const ring = Math.min(pierW * 0.9, M(0.7)), n = 9;
  for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI; at(Math.cos(th) * (r0 + ring / 2), yc + Math.sin(th) * (r0 + ring / 2) - ring / 2, Math.PI * (r0 + ring / 2) / n * 0.94, ring, th - Math.PI / 2, 0.35); }
  const half = b.w / 2;
  for (let y = yc, row = 0; y < b.g + b.h - 0.1; row++) {
    const h = Math.min(M(R(0.7, 1.0)), b.g + b.h - y);
    for (let lx = -half + (row % 2 ? M(0.4) : 0); lx < half - 0.2;) {
      const w = Math.min(M(R(0.9, 1.6)), half - lx), mx = lx + w / 2;
      if (Math.hypot(mx, y + h / 2 - yc) > r0 + ring * 0.9) at(mx, y, w, h, 0, y + h > b.g + b.h - M(0.8) ? 0.65 : 0.2);
      lx += w;
    }
    y += h;
  }
}
// the plaza: a ring of flat slabs round a standing stone
function stoneRing() {
  const [cx, cz] = P(0.555, 0.325, PL), rx = wide(0.47, 0.64, 0.325, PL) / 2, zf = P(0.555, 0.38, PL)[1], zb = P(0.555, 0.27, PL)[1], rz = (zf - zb) / 2, zc = (zf + zb) / 2;
  for (const [k, n] of [[0.95, 30], [0.72, 22]]) for (let i = 0; i < n; i++) {
    if (rand() < 0.08) continue;
    const a = i / n * Math.PI * 2 + R(-0.03, 0.03), x = cx + Math.cos(a) * rx * k, z = zc + Math.sin(a) * rz * k;
    block(x, height(x, z) - 0.14, z, Math.PI * 2 * rx * k / n * 0.9, 0.3, M(0.7), Math.atan2(-Math.cos(a), -Math.sin(a)) + R(-0.05, 0.05), 0.12, { chamfer: 0.16, base: pick(['#d6cfbf', '#cbc3b2', '#ddd6c6']) });
  }
  // the uprights about the ring, and the standing stone in it
  for (const [u0, u1, vf, vt] of [[0.47, 0.5, 0.33, 0.29], [0.6, 0.63, 0.31, 0.27], [0.62, 0.645, 0.36, 0.33], [0.49, 0.515, 0.37, 0.34]]) box(u0, u1, vf, vt);
  box(0.535, 0.575, 0.34, 0.25, { d: 0.8, tilt: 0.02 });
}
// loose rocks on the low ground: [u0, u1, vFoot, vTop], worn blocks
const ROCKS = [[0.82, 0.89, 0.86, 0.745], [0.745, 0.82, 1.0, 0.88], [0.27, 0.335, 0.8, 0.7], [0.14, 0.215, 0.99, 0.86], [0.06, 0.1, 1.0, 0.95],
  [0.26, 0.3, 0.87, 0.82], [0.31, 0.365, 0.88, 0.82], [0.49, 0.53, 0.745, 0.64], [0.52, 0.555, 0.735, 0.67], [0.6, 0.625, 0.79, 0.77], [0.92, 0.95, 0.93, 0.9]];
function buildRocks() {
  const round = { chamfer: 0.22, extra: 10, jitter: 0.08 };
  for (const [u0, u1, vf, vt] of ROCKS) {
    const [x, z0] = P((u0 + u1) / 2, vf, 0), g = height(x, z0), w = wide(u0, u1, vf, g), h = tall(x, z0, g, vt), d = w * R(0.75, 0.9), z = z0 - d / 2;
    addStone(x, g - 0.1, z, w, h + 0.1, d, { ...round, ry: R(-0.3, 0.3), moss: 0.4 });
    COLLIDERS.push({ x, z, r: w * 0.5 });
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
STONE.splice(0, STONE.length, '#dad3c1', '#d0c9b5', '#d7d0bc', '#c5bea9', '#cec7b2', '#e0d9c5');
MOSS.splice(0, MOSS.length, '#a7c63f', '#93b23a', '#b5c94c');
// ---------- assemble ----------
const crownOnly = [];   // crowns without a trunk (none here)
function build() {
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
  archway(0.527, 0.667, 0.245, 0.0, 0.57, 0.623, 0.11);
  wall(0.67, 0.76, 0.255, 0.15);
  pillar(0.77, 0.82, 0.265, 0.03);
  wall(0.82, 0.85, 0.265, 0.15);
  pillar(0.86, 0.925, 0.38, 0.1);
  stoneRing();
  // loose blocks: beside the stair, the row right of it, about the plaza, on the high tier's edge
  for (const b of [[0.5, 0.57, 0.54, 0.48], [0.57, 0.61, 0.54, 0.45], [0.63, 0.67, 0.6, 0.55], [0.68, 0.71, 0.63, 0.58], [0.63, 0.67, 0.7, 0.66],
    [0.76, 0.79, 0.49, 0.45], [0.8, 0.84, 0.54, 0.48], [0.84, 0.88, 0.54, 0.49], [0.88, 0.92, 0.6, 0.56], [0.92, 0.96, 0.66, 0.61],
    [0.75, 0.8, 0.41, 0.36], [0.79, 0.85, 0.39, 0.32], [0.355, 0.395, 0.255, 0.2], [0.495, 0.53, 0.245, 0.18],
    [0.25, 0.31, 0.445, 0.375], [0.32, 0.365, 0.47, 0.43], [0.145, 0.18, 0.38, 0.31], [0.265, 0.31, 0.31, 0.245]]) box(...b);
  // trees: [trunk u, foot v, crown u0, u1, crown bottom v, variant]; size and trunk from the screen
  const TREES = [[0.07, 0.3, -0.02, 0.17, 0.17, 3], [0.32, 0.245, 0.23, 0.43, 0.04, 5], [0.72, 0.2, 0.63, 0.82, 0.03, 9], [0.985, 0.62, 0.89, 1.1, 0.3, 5],
    [0.48, 0.12, 0.42, 0.56, -0.01, 9], [0.88, 0.14, 0.8, 0.98, 0.0, 3], [0.16, 0.12, 0.08, 0.26, -0.02, 9], [0.62, 0.08, 0.55, 0.7, -0.04, 5], [0.0, 0.14, -0.1, 0.1, -0.01, 5]];
  const trunkAt = [];
  for (const [u, vf, c0, c1, vc, seed] of TREES) {
    const [x, z, g] = PG(u, vf), s = wide(c0, c1, vf, g) / 5.7, hb = tall(x, z, g, vc);
    broadleaf(x, z, s, seed); treeItems[treeItems.length - 1].h = Math.max(0.35, (hb + 0.5 * s) / (3.5 * s));
    COLLIDERS.push({ x, z, r: 0.5 * s }); trunkAt.push([x, z, 1.2 * s]);
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
      if (trailEdge(x, z) < 0.2 || stairsAt(x, z).inside || trunkAt.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr) || COLLIDERS.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
      addBush(x, height(x, z) - 0.1, z, M(R(s0, s1)) * 0.78, { sy: 0.72, tint: R(-2.0, -0.2) });
    }
  }
  // grass clumps and flowers, in patches, leaving the dirt bare
  for (let i = 0; i < 44000; i++) {
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
  const stones = new THREE.Mesh(mergeGeometries(stoneParts), paint({ vertexColors: true, shade: [0.36, 0.34, 0.44], mid: [0.64, 0.62, 0.67], band: [-0.34, 0.24] }));
  stones.castShadow = stones.receiveShadow = true;
  scene.add(stones, new THREE.Mesh(mergeGeometries(stoneLines), outlineMat('#4c4852')));
  // roots and the arch, with an ink outline
  if (woodParts.length) {
  const wood = new THREE.Mesh(mergeGeometries(woodParts), paint({ vertexColors: true, shade: [0.62, 0.62, 0.7], mid: [0.62, 0.62, 0.7], band: [-5, -5] }));
  wood.castShadow = wood.receiveShadow = true; scene.add(wood);
  scene.add(new THREE.Mesh(mergeGeometries(woodInk), outlineMat(FOL.trunk.line)));
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
  for (let s = 1; s < 120; s += 0.3) {
    p.copy(o).addScaledVector(d, s);
    if (p.y < height(p.x, p.z)) {
      let lo = s - 0.3, hi = s;
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
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
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
window.__scene = { lockPR: v => { pixelRatio = v; renderer.setPixelRatio(v); resize(); window.__noAdapt = true; }, scene, camera, renderer, CAM, placeCamera, HERO, walkTo, P, height, ready: true };
