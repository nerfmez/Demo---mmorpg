// ---------- layout: authored in concept pixels and projected onto the ground ----------
// (u, v) are fractions of the 1672x941 concept. A point is projected onto the plane y = h, so
// every trail, cliff, ruin, tree and rock lands where the concept has it (ruins-approach-40deg).
placeCamera(); camera.updateMatrixWorld();
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function P(u, v, y = 0) {
  _ndc.set(u * 2 - 1, 1 - v * 2); _ray.setFromCamera(_ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction, t = (y - o.y) / d.y;
  return [o.x + d.x * t, o.z + d.z * t];
}
const K = 2.4;   // the owner asked for more room in the same frame: the camera stands K x farther back
const TS = K / 1.8 * 1.25;   // trees grow with the room, and a quarter bigger again (owner's ask)
const HT = 1.45, H = v => v * HT;   // cliff heights: tall rock faces, as in the forest scene
const RS = K * 0.65;   // ruin scale: the concept's proportions, grown with the room, so the frame matches the concept
const UP = 5.0 * K;   // the high plateau on the left (its ruins and the path off to the left)
const inFrame = (u, v) => u > -0.08 && u < 1.08 && v > -0.06 && v < 1.06;
// ground mesh bounds (metres)
const GX0 = -30 * K, GX1 = 30 * K, GZ0 = -44 * K, GZ1 = 10 * K;
function noise2(x, z) { return Math.sin(x * 0.7 + Math.sin(z * 0.53)) * 0.5 + Math.sin(z * 0.9 + x * 0.21) * 0.5; }

// Raised ground in two tiers, as the concept layers it: a front rock tier along the hero's path,
// a grassy ledge on it, and on the left a second rock tier stepping up to the plaza level. 'b'
// points sit at a cliff foot (on the tier below), 't' points on the top off screen, 'n' points at
// the foot of a grassy bank (no cliff: a soft slope `soft` metres wide).
const H1 = UP * 0.5;   // the front tier's top: the plaza level, reached by the stair
const TERRACES = [
  { top: H1, base: 0, ledge: true, soft: 9, pts: [[-0.3, 0.66, 'b'], [0.0, 0.665, 'b'], [0.07, 0.69, 'b'], [0.14, 0.73, 'b'], [0.2, 0.775, 'b'], [0.3, 0.795, 'b'], [0.42, 0.785, 'b'],
    [0.5, 0.765, 'b'], [0.58, 0.735, 'b'], [0.65, 0.715, 'b'],
    [0.72, 0.705, 'n'], [0.86, 0.69, 'n'], [0.95, 0.67, 'n'], [1.3, 0.64, 'n'], [1.3, -0.5, 't'], [-0.3, -0.5, 't']] },
  // the high plateau: its rock face looks toward the hero; its side falls to the plaza as a grassy bank
  { top: UP, base: H1, ledge: true, soft: 7, pts: [[-0.1, -0.5, 't'], [0.05, 0.3, 'b'], [0.09, 0.42, 'b'], [0.14, 0.52, 'b'], [0.22, 0.575, 'b'], [0.31, 0.59, 'b'], [0.39, 0.575, 'b'], [0.43, 0.545, 'b'],
    [0.47, 0.49, 'n'], [0.45, 0.41, 'n'], [0.41, 0.34, 'n'], [0.37, 0.27, 'n'], [0.35, 0.2, 'n'], [0.33, 0.1, 't'], [0.33, -0.5, 't']] },
].map(T => {
  let pts = T.pts.map(([u, v, k]) => { const [x, z] = P(u, v, k === 't' ? T.top : T.base || 0); return { x, z, wall: k === 'b' && inFrame(u, v), u, v }; });
  if (T.ledge) {
    // a smooth closed outline through the authored points, sampled about every 1.3 m; a sample's
    // wall flag says whether the stretch from it to the next one is cliff
    const n = pts.length, curve = new THREE.CatmullRomCurve3(pts.map(q => new V3(q.x, 0, q.z)), true, 'centripetal'), out = [];
    for (let j = 0; j < n; j++) {
      const a = pts[j], b = pts[(j + 1) % n], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.3));
      for (let k = 0; k < steps; k++) { const q = curve.getPoint((j + k / steps) / n); out.push({ x: q.x, z: q.z, wall: a.wall && b.wall }); }
    }
    pts = out;
  }
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  return { ...T, pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
});
// signed distance to a terrace outline: negative inside
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
// the paved ramp from the front trail up to the plaza
const ST = (() => {
  const [x0, z0] = P(0.85, 0.7, 0), [x1, z1] = P(0.64, 0.455, H1), dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const [ax, az] = P(0.695, 0.56, H1 * 0.5), [bx, bz] = P(0.795, 0.56, H1 * 0.5);
  return { x0, z0, x1, z1, ux: dx / len, uz: dz / len, len, half: Math.hypot(bx - ax, bz - az) * 0.38, bank: 8, n: Math.round(H1 / 0.55), top: H1 };
})();
function stairsAt(x, z) {
  const rx = x - ST.x0, rz = z - ST.z0, a = (rx * ST.ux + rz * ST.uz) / ST.len, s = Math.abs(-rx * ST.uz + rz * ST.ux);
  return { a, s, inside: a > -0.02 && a < 1.02 && s < ST.half + 0.25 };
}
// trails: polylines of [u, v, half width m, plane height]
const TRAILS = [
  // the low ground: from the bottom of the frame to the ramp foot, a branch out to the right
  [[0.46, 1.25, 1.7], [0.48, 0.97, 1.7], [0.54, 0.9, 1.6], [0.63, 0.845, 1.6], [0.73, 0.79, 1.6], [0.81, 0.735, 1.6], [0.85, 0.705, 1.5]],
  // up top: the plaza round the stone ring, out through the arch, to the left and to the right
  // the plaza: a loop of dirt round the stone ring, out to the stair, through the arch and to the right
  [[0.36, 0.3, 1.5, H1], [0.42, 0.25, 1.5, H1], [0.53, 0.23, 1.5, H1], [0.65, 0.25, 1.5, H1], [0.7, 0.3, 1.5, H1], [0.66, 0.35, 1.6, H1], [0.53, 0.37, 1.6, H1], [0.41, 0.35, 1.5, H1], [0.36, 0.3, 1.5, H1]],
  [[0.64, 0.35, 1.8, H1], [0.645, 0.42, 1.6, H1], [0.645, 0.46, 1.6, H1]],
  [[0.6, 0.24, 1.3, H1], [0.61, 0.16, 1.1, H1], [0.62, 0.0, 1.0, H1], [0.63, -0.3, 1.0, H1]],
  [[0.69, 0.28, 1.1, H1], [0.78, 0.27, 1.0, H1], [0.88, 0.29, 0.95, H1], [1.1, 0.33, 0.9, H1]],
  // up on the plateau, off to the left
  [[0.3, 0.2, 0.9, UP], [0.2, 0.24, 0.9, UP], [0.1, 0.28, 0.9, UP], [-0.1, 0.33, 0.9, UP]],
].map(pl => pl.map(([u, v, w, h = 0]) => { const [x, z] = P(u, v, h); return new V3(x, w * K, z); }))
  // a smooth curve through the authored points (width rides along in y), sampled every 1.2 m
  .map(pl => { const c = new THREE.CatmullRomCurve3(pl, false, 'centripetal'); return c.getSpacedPoints(Math.ceil(c.getLength() / 1.2)).map(p => ({ x: p.x, z: p.z, w: p.y })); });
// distance from the trail edge: negative on the trail
function trailAt(x, z) {
  let best = Infinity;
  for (const pl of TRAILS) for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z) - (a.w + (b.w - a.w) * t);
    if (d < best) best = d;
  }
  return best;
}
// the trail edge wanders: a slow swell and a shorter wobble on top of the authored width
const edgeWob = (x, z) => 1.0 * noise2(x * 0.19 + 3.1, z * 0.23 - 1.7) + 0.45 * noise2(x * 0.51 - 2, z * 0.44 + 4);
const trailEdge = (x, z) => trailAt(x, z) + edgeWob(x, z);
// patches of leaf shade on the ground, where the concept's canopy darkens the trail
const SHADE = [[0.37, 0.2, 2.8], [0.5, 0.21, 2.2], [0.86, 0.25, 2.6], [0.14, 0.28, 2.6], [0.6, 0.62, 2.0], [0.28, 0.5, 2.2], [0.07, 0.33, 3.0], [0.33, 0.25, 2.4], [0.72, 0.2, 2.4], [0.97, 0.42, 2.6], [0.05, 0.6, 2.5], [0.95, 0.8, 2.4], [0.2, 0.88, 2.2], [0.45, 0.24, 1.8], [0.86, 0.3, 1.8]]
  .map(([u, v, r]) => { const [x, z] = P(u, v); return { x, z, r: r * K }; });
const shadeAt = (x, z) => SHADE.reduce((m, s) => Math.max(m, 1 - smooth(s.r * 0.45, s.r, Math.hypot(x - s.x, z - s.z))), 0);

// the shape of the land: height and how much of it is a raised top
function field(x, z) {
  let y = 0, top = 0;
  for (const T of TERRACES) {
    const d = polyAt(T, x, z);
    if (d === null) continue;
    // cliffs drop sharply; elsewhere the edge is a grassy bank `soft` metres wide
    const w = T.ledge && polyAt.wall ? 1 - smooth(-0.35, 0.05, d) : 1 - smooth(-(T.soft || 0.9), 0.25, d);
    const b = T.base || 0;
    if (w > 0) { y = Math.max(y, b + (T.top - b) * w); if (T.ledge || T.top > 2) top = Math.max(top, w); }
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
  float dd=vD+(vnoise(q*1.3+7.)-.5)*.9+(vnoise(q*4.2)-.5)*.35;
  float tr=1.-smoothstep(-.3,.3,dd);
  tr=max(tr,step(.74,vnoise(q*1.1+21.))*(1.-smoothstep(.2,1.5,dd))*.9);
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
        const w = (rand() < 0.22 ? R(2.6, 4.2) : R(1.1, 2.2)) * 1.5; let i1 = i0 + 1;
        while (i1 < S.length - 1 && S[i1].s - S[i0].s < w) i1++;
        cols.push({ i0, i1, s0: S[i0].s, s1: S[i1].s, off: R(-0.2, 1.4), slope: R(-0.15, 0.15), ridge: R(0.3, 0.9), peak: R(0.3, 0.7), top: T.top + (rand() < 0.35 ? R(0.6, 1.6) : R(-0.3, 0.4)), cap: R(0.9, 1.6), moss: R(0, 1), rows: F.map(() => R(-0.25, 0.25)), lean: R(-0.2, 0.35), c: pick(stone).clone().multiplyScalar(R(0.95, 1.05)), mid: (S[i0].s + S[i1].s) / 2 });
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
          quad(b0, b1, new V3(b1.x, T.top - 0.3, b1.z), new V3(b0.x, T.top - 0.3, b0.z), new V3(-out.x, 0, -out.z), shade.copy(C.c).multiplyScalar(0.8));
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
          for (let k = 0; k < 3; k++) { const b = C.cap + R(0.05, 0.9); grassItems.push({ x: a.x - a.nx * b + R(-0.3, 0.3), y: T.top + 0.02, z: a.z - a.nz * b + R(-0.3, 0.3), s: R(1.0, 1.5), ry: R(0, 6.28), k: R(0.9, 1.1) }); }
          if (rand() < 0.18) { const b = R(0.4, C.cap - 0.1); grassItems.push({ x: a.x - a.nx * b, y: C.top + 0.12, z: a.z - a.nz * b, s: R(0.7, 1.0), ry: R(0, 6.28), k: 1 }); }
        }
        if (D) for (let k = 0; k < 2; k++) { const v = vtx(C, C.i1, 1 + k); grassItems.push({ x: v.x + S[C.i1].nx * 0.1, y: v.y - 0.2, z: v.z + S[C.i1].nz * 0.1, s: R(0.8, 1.2), ry: R(0, 6.28), k: 0.9 }); }
        if (rand() < 0.4) addBush(q.x - q.nx * (C.cap + R(0.3, 1.0)), T.top - 0.25, q.z - q.nz * R(0.6, 1.4), R(0.45, 0.8), { sy: 0.55, tint: R(-0.4, 0.3) });
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
  const blk = { chamfer: 0.12, jitter: 0.14, extra: 7 };
  // the stair: rows of worn sandy slabs in a running bond, one step a row
  const across = Math.max(2, Math.round(ST.half * 2 / 2.3)), ry = Math.atan2(ST.ux, ST.uz), wd = ST.half * 2 / across;
  for (let i = 0; i < ST.n; i++) {
    const a = (i + 0.5) / ST.n;
    for (let k = 0; k <= across; k++) {
      const off = -ST.half + (k + (i % 2 ? 0 : 0.5)) * wd;
      if (Math.abs(off) > ST.half - wd * 0.3 || rand() < 0.05) continue;
      const x = ST.x0 + ST.ux * ST.len * a + ST.uz * off, z = ST.z0 + ST.uz * ST.len * a - ST.ux * off;
      addStone(x, ST.top * i / ST.n - 0.1, z, wd * R(0.95, 1.0), ST.top / ST.n + 0.14, ST.len / ST.n * 1.06, { chamfer: 0.18, jitter: 0.06, extra: 4, ry: ry + R(-0.05, 0.05), moss: 0.1, base: pick(['#ddd0ae', '#d2c4a0', '#e4d8b8']) });
    }
    // kerb stones along both edges, half sunk, some gone
    for (const side of [-1, 1]) {
      if (rand() < 0.15) continue;
      const px = ST.x0 + ST.ux * ST.len * a + ST.uz * side * (ST.half + 0.45), pz = ST.z0 + ST.uz * ST.len * a - ST.ux * side * (ST.half + 0.45);
      block(px, ST.top * i / ST.n - 0.2, pz, ST.len / ST.n * 1.04, ST.top / ST.n + R(0.45, 0.8), 0.85, ry + R(-0.05, 0.05), 0.4);
    }
  }
}

// ---------- the ruins: big worn blocks, some walls and pillars single slabs, broken and mossy ----------
// where a ruin stands: on the upper level if it is there, else on the low ground
function PG(u, v) {
  for (const h of [UP, H1]) { const q = P(u, v, h); if (Math.abs(height(q[0], q[1]) - h) < 0.6) return q; }
  return P(u, v, 0);
}
const blockStyle = { chamfer: 0.1, jitter: 0.05, extra: 5 };
function block(x, y, z, w, h, d, ry = 0, moss = 0.35, o = {}) {
  // never a sliver: a thin block's outline shell would be scaled up into a dark sheet
  addStone(x, y, z, Math.max(w, 0.35), Math.max(h, 0.35), Math.max(d, 0.35), { ...blockStyle, ry, moss, ...o });
}
// ivy hanging down a face from y0: a strand of small leaf clumps, thinning as it falls
function ivy(x, y0, z, nx, nz, len) {
  const n = Math.max(2, Math.round(len / (0.42 * RS)));
  for (let i = 0; i < n; i++) { const t = i / n; addBush(x + nx * 0.18 + R(-0.18, 0.18), y0 - t * len, z + nz * 0.18, (0.34 - 0.14 * t) * RS, { sy: 0.9, tint: R(-0.7, 0.2) }); }
}
// a column of drums on a plinth, capped or broken off
function pillar(u, v, hgt, w, { cap = true } = {}) {
  hgt *= RS; w *= RS;
  const [x, z] = PG(u, v), g = height(x, z), ry = R(-0.25, 0.25);
  block(x, g - 0.25, z, w * 1.3, 0.6 * RS + 0.25, w * 1.3, ry, 0.6);
  let y = g + 0.55 * RS;
  // a single shaft, or two or three long drums
  if (rand() < 0.45) { const h = hgt - 1.2 * RS; block(x, y, z, w, h, w, ry, 0.3); y += h - 0.02; }
  else while (y < g + hgt - 0.7 * RS) { const h = Math.min(R(1.6, 2.6) * RS, g + hgt - 0.5 * RS - y); block(x + R(-0.06, 0.06), y, z + R(-0.06, 0.06), w * R(0.95, 1.02), h, w * R(0.95, 1.02), ry + R(-0.05, 0.05), 0.3); y += h - 0.02; }
  if (cap) block(x, y, z, w * 1.35, 0.5 * RS, w * 1.35, ry, 0.75);
  else block(x + w * 0.15, y, z, w * 0.75, 0.6 * RS, w * 0.7, ry + 0.4, 0.7, { rz: 0.18 });
  if (rand() < 0.75) addBush(x + R(-0.3, 0.3), y + 0.3 * RS, z + R(-0.3, 0.3), 0.5 * RS, { sy: 0.45, tint: 0.2 });
  if (rand() < 0.6) ivy(x + R(-0.2, 0.2) * w, y + 0.2 * RS, z + w * 0.5, 0, 1, (y - g) * R(0.35, 0.8));
  for (let k = 0; k < 2; k++) addBush(x + R(-1, 1) * w, g - 0.1, z + w * R(0.6, 1.2), R(0.5, 0.8) * RS, { sy: 0.7, tint: R(-0.8, 0) });
  COLLIDERS.push({ x, z, r: w * 0.85 });
}
// a ruined wall along a polyline: courses of blocks in a running bond, its top broken and ragged
function wallRun(pts, hgt, depth, seedOff = 0) {
  hgt *= RS; depth *= RS;
  const Q = pts.map(([u, v]) => PG(u, v));
  for (let i = 0; i < Q.length - 1; i++) {
    const [ax, az] = Q[i], [bx, bz] = Q[i + 1], len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, ry = Math.atan2(-tz, tx);
    for (let s = 0; s < len - 0.2;) {
      const w = Math.min(R(1.5, 2.9) * RS, len - s + 0.15), c = s + w / 2, x = ax + tx * c, z = az + tz * c, g = height(x, z);
      const top = hgt * (0.35 + 0.65 * (0.5 + 0.5 * noise2(c * 0.3 + seedOff, i * 3.1 + seedOff)));
      // a third of the wall stands as single slabs, the rest in a few big courses
      const mono = rand() < 0.35;
      let course = 0;
      for (let y = g - 0.25; y < g + top;) {
        const h = mono ? g + top - y + 0.25 : Math.min(R(1.2, 2.2) * RS, g + top - y + 0.25), sh = course % 2 ? R(-0.4, 0.4) * RS : 0;
        if (!(course > 1 && rand() < 0.06)) block(x + tx * sh, y, z + tz * sh, w * R(0.92, 1.0), h, depth * R(0.92, 1.05), ry + R(-0.04, 0.04), y + h > g + top - 0.25 ? 0.65 : 0.18);
        y += h; course++;
      }
      // overgrown: moss and leaves on top, ivy down the face toward us, bushes at the foot
      let nx = tz, nz = -tx; if (nz < 0) { nx = -nx; nz = -nz; }
      if (rand() < 0.6) addBush(x, g + top - 0.1, z, R(0.4, 0.6) * RS, { sy: 0.45, tint: 0.2 });
      if (rand() < 0.5) ivy(x + tx * R(-0.4, 0.4) * w + nx * depth * 0.5, g + top, z + tz * R(-0.4, 0.4) * w + nz * depth * 0.5, nx, nz, top * R(0.4, 0.85));
      if (rand() < 0.75) addBush(x + nx * (depth * 0.5 + R(0.3, 0.9)) + tx * R(-0.5, 0.5) * w, g - 0.1, z + nz * (depth * 0.5 + R(0.3, 0.9)), R(0.55, 0.9) * RS, { sy: 0.7, tint: R(-0.8, 0) });
      COLLIDERS.push({ x, z, r: Math.max(w, depth) * 0.55 });
      s += w;
    }
  }
}
// an arched gateway facing the camera: piers, a ring of wedge stones and courses above
function archway(u, v, span, pierH, topH, pierW, depth, ry = 0) {
  [span, pierH, topH, pierW, depth] = [span, pierH, topH, pierW, depth].map(q => q * RS);
  const [cx, cz] = PG(u, v), g = height(cx, cz) - 0.2, c = Math.cos(ry), sn = Math.sin(ry);
  const at = (lx, y, w, h, rz = 0, moss = 0.25) => block(cx + lx * c, y, cz - lx * sn, w, h, depth, ry, moss, { rz });
  for (const side of [-1, 1]) {
    for (let y = g; y < g + pierH;) { const h = Math.min(R(1.4, 2.2) * RS, g + pierH - y); at(side * (span / 2 + pierW / 2), y, pierW * R(0.97, 1.02), h); y += h; }
    COLLIDERS.push({ x: cx + side * (span / 2 + pierW / 2) * c, z: cz - side * (span / 2 + pierW / 2) * sn, r: pierW * 0.7 });
    if (rand() < 0.7) ivy(cx + side * (span / 2 + pierW * R(0.2, 0.8)) * c, g + pierH + 0.6 * RS, cz - side * (span / 2 + pierW / 2) * sn + depth * 0.5, sn, c, pierH * R(0.5, 0.9));
    addBush(cx + side * (span / 2 + pierW) * c, g + 0.1, cz + depth * 0.5 + 0.6, R(0.6, 0.9) * RS, { sy: 0.7, tint: -0.4 });
  }
  const r0 = span / 2, ring = 0.9 * RS, n = 7, yc = g + pierH;
  for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI; at(Math.cos(th) * r0, yc + Math.sin(th) * r0, Math.PI * (r0 + ring / 2) / n * 0.94, ring, th - Math.PI / 2, 0.35); }
  const half = span / 2 + pierW;
  for (let y = yc, row = 0; y < g + topH; row++) {
    const h = R(1.1, 1.6) * RS;
    for (let lx = -half + (row % 2 ? 0.6 * RS : 0); lx < half - 0.2;) {
      const w = Math.min(R(1.4, 2.4) * RS, half - lx), mx = lx + w / 2;
      if (Math.hypot(mx, y + h / 2 - yc) > r0 + ring * 0.85 && !(y + h > g + topH - 1.4 * RS && rand() < 0.4)) at(mx, y, w, h, 0, y + h > g + topH - 1.2 * RS ? 0.65 : 0.2);
      lx += w;
    }
    y += h;
  }
}
// the plaza: a ring of flat slabs round a standing stone, with broken uprights about it
function plaza() {
  const [cx, cz] = P(0.53, 0.3, H1), [ex] = P(0.45, 0.3, H1), r = Math.abs(cx - ex);
  for (const [rr, n] of [[r * 0.92, 28], [r * 0.7, 20]]) for (let i = 0; i < n; i++) {
    if (rand() < 0.08) continue;
    const a = i / n * Math.PI * 2 + R(-0.03, 0.03), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.92;
    block(x, height(x, z) - 0.14, z, Math.PI * 2 * rr / n * 0.9, 0.26, 0.95 * RS, Math.atan2(-Math.cos(a), -Math.sin(a)) + R(-0.05, 0.05), 0.12, { chamfer: 0.16, base: pick(['#d6cfbf', '#cbc3b2', '#ddd6c6']) });
  }
  const [px, pz] = P(0.525, 0.275, H1), g = height(px, pz);
  block(px, g - 0.2, pz, 1.5 * RS, 2.5 * RS, 1.3 * RS, 0.15, 0.55);
  block(px + 0.1, g - 0.2 + 2.45 * RS, pz, 1.1 * RS, 0.5 * RS, 1.0 * RS, 0.5, 0.75);
  COLLIDERS.push({ x: px, z: pz, r: 1.1 * RS });
  for (const [a, h] of [[2.7, 1.4], [3.3, 0.8], [0.35, 1.1], [5.9, 0.7], [1.3, 0.6], [4.5, 1.2], [3.9, 0.6]]) {
    const x = cx + Math.cos(a) * r * 1.05, z = cz + Math.sin(a) * r * 0.97, w = R(0.7, 1.0) * RS;
    block(x, height(x, z) - 0.15, z, w, h * RS, w * R(0.8, 1.0), R(-0.4, 0.4), 0.5);
    COLLIDERS.push({ x, z, r: w * 0.7 });
  }
}
// loose rocks: [u, v, size m]; the big ones on the front banks frame the view
const ROCKS = [[0.17, 0.925, 1.9], [0.04, 0.97, 1.4], [0.31, 0.8, 1.3], [0.35, 0.865, 1.0], [0.42, 0.835, 0.5], [0.86, 0.835, 2.0], [0.8, 0.955, 1.6],
  [0.66, 0.735, 0.8], [0.56, 0.775, 0.7], [0.61, 0.81, 0.35], [0.93, 0.66, 0.6], [0.7, 0.9, 0.4], [0.26, 0.845, 0.4], [0.9, 0.9, 0.5]];
function buildRocks() {
  const round = { chamfer: 0.22, extra: 10, jitter: 0.08 };   // cut blocks, worn at the edges
  for (const [u, v, s] of ROCKS) {
    const [x, z] = P(u, v, 0);
    addStone(x, height(x, z) - s * 0.18, z, s * R(1.0, 1.25), s * R(0.62, 0.85), s * R(0.9, 1.1), { ...round, ry: R(0, 3), moss: s > 0.9 ? 0.45 : 0.2 });
    if (s > 0.7) COLLIDERS.push({ x, z, r: s * 0.55 });
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
  // the ruins on the upper level
  plaza();
  archway(0.605, 0.205, 3.4, 3.4, 7.4, 1.5, 1.6);
  wallRun([[0.44, 0.175], [0.535, 0.185]], 7.4, 1.7, 1);
  wallRun([[0.675, 0.205], [0.74, 0.215]], 5.0, 1.6, 2);
  archway(0.18, 0.205, 2.4, 2.8, 4.4, 1.1, 1.2);
  wallRun([[0.06, 0.215], [0.15, 0.205]], 3.6, 1.2, 3);
  wallRun([[0.265, 0.2], [0.32, 0.195]], 4.0, 1.2, 4);
  wallRun([[0.3, 0.145], [0.44, 0.15]], 4.6, 1.3, 5);
  wallRun([[0.33, 0.205], [0.42, 0.2]], 2.6, 1.1, 9);
  wallRun([[0.74, 0.215], [0.78, 0.225]], 3.6, 1.3, 10);
  wallRun([[0.87, 0.22], [0.95, 0.24]], 3.2, 1.2, 11);
  wallRun([[0.1, 0.33], [0.2, 0.345]], 1.6, 1.0, 12);
  wallRun([[0.27, 0.43], [0.34, 0.46], [0.42, 0.47]], 1.4, 1.0, 13);
  wallRun([[0.75, 0.255], [0.86, 0.285]], 2.2, 1.2, 6);
  wallRun([[0.94, 0.31], [1.06, 0.33]], 2.6, 1.2, 7);
  wallRun([[0.48, 0.55], [0.6, 0.54]], 1.8, 1.1, 8);
  // the row of blocks on the slope right of the stair
  wallRun([[0.77, 0.465], [0.84, 0.5], [0.9, 0.55], [0.95, 0.61]], 1.5, 1.1, 14);
  pillar(0.27, 0.32, 6.0, 1.3);
  pillar(0.795, 0.245, 7.0, 1.4);
  pillar(0.915, 0.34, 8.0, 2.2, { cap: false });
  pillar(0.86, 0.215, 4.6, 1.2, { cap: false });
  pillar(0.585, 0.53, 2.6, 1.2, { cap: false });
  pillar(0.65, 0.2, 5.4, 1.2);
  pillar(0.395, 0.15, 6.4, 1.3);
  // blocks that fell: about the ruins and on the low ground under the cliff
  for (const [u, v, s, up] of [[0.2, 0.33, 1.2, 1], [0.27, 0.32, 1.0, 1], [0.37, 0.27, 0.8, 1], [0.69, 0.27, 0.9, 1], [0.48, 0.24, 0.7, 1], [0.83, 0.3, 0.9, 1], [0.12, 0.3, 0.8, 1],
    [0.52, 0.53, 1.0, 1], [0.555, 0.52, 0.9, 1], [0.3, 0.52, 1.0, 1], [0.18, 0.5, 0.9, 1], [0.42, 0.5, 0.8, 1], [0.08, 0.55, 0.9, 1], [0.45, 0.82, 0.8, 0], [0.24, 0.8, 0.9, 0], [0.62, 0.74, 0.7, 0], [0.9, 0.66, 0.8, 0]]) {
    const [x, z] = up ? PG(u, v) : P(u, v, 0), w = s * RS;
    block(x, height(x, z) - 0.15, z, w * R(1.0, 1.3), w * R(0.7, 0.95), w * R(0.85, 1.05), R(0, 3), 0.5, { rx: R(-0.15, 0.15), rz: R(-0.15, 0.15) });
    COLLIDERS.push({ x, z, r: w * 0.7 });
  }
  // trees: [u, v, scale, crown variant, trunk stretch]; their base height comes from the ground
  const TREES = [[0.33, 0.215, 1.4, 5, 0.7], [0.72, 0.09, 1.4, 9, 0.7], [0.975, 0.36, 1.5, 5, 0.75], [0.9, 0.05, 1.3, 3, 0.7],
    [0.02, 0.05, 1.3, 9, 0.7], [0.15, 0.0, 1.3, 5, 0.7], [0.45, 0.02, 1.3, 3, 0.7], [0.55, -0.04, 1.3, 9, 0.7], [0.8, -0.02, 1.3, 5, 0.7], [1.0, 0.13, 1.3, 9, 0.7],
    [0.25, 0.05, 1.2, 9, 0.7], [0.66, 0.03, 1.2, 3, 0.7], [0.36, -0.03, 1.3, 5, 0.7], [0.1, -0.05, 1.3, 3, 0.7], [0.92, -0.06, 1.3, 9, 0.7],
    [1.02, 0.84, 1.4, 9, 0.55], [-0.02, 0.6, 1.3, 3, 0.6],
    // big trees standing among the ruins, trunks in view as in the concept
    [0.37, 0.11, 1.4, 5, 0.75, 1], [0.505, 0.12, 1.3, 3, 0.7, 1], [0.86, 0.15, 1.3, 9, 0.7, 1], [0.09, 0.2, 1.5, 3, 0.75, 1]];
  const trunkAt = [];
  for (let [u, v, s, seed, h, keep] of TREES) {
    s *= 1.35 * TS; h *= 1.3;
    if (v < 0.25 && !keep) h *= 0.62;   // the back row: lower trunks keep the bigger crowns in the top of the frame
    let [x, z] = P(u, v, 0);
    if (trailAt(x, z) < 1.2 * s) continue;   // keep the trails open
    const top = height(x, z) > 1 ? height(x, z) : 0;
    if (top > 1) [x, z] = P(u, v, top);
    if (COLLIDERS.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.8)) continue;   // not through the masonry
    broadleaf(x, z, s, seed); treeItems[treeItems.length - 1].h = h;
    COLLIDERS.push({ x, z, r: 0.6 * s }); trunkAt.push([x, z, 1.4 * s]);
  }
  // bush masses: [u, v, radius m, count, size range] on the low ground and the upper level
  const BUSHES = [[0.04, 0.46, 2.4, 6, [0.9, 1.5]], [0.15, 0.56, 2.0, 4, [0.8, 1.3]], [0.3, 0.6, 2.0, 4, [0.8, 1.2]], [0.45, 0.62, 1.8, 3, [0.7, 1.1]], [0.38, 0.43, 1.6, 3, [0.8, 1.2]], [0.2, 0.46, 1.6, 3, [0.7, 1.1]],
    [0.08, 0.82, 3.0, 8, [1.0, 1.6]], [0.15, 0.97, 2.5, 6, [0.9, 1.4]], [0.25, 0.9, 1.6, 3, [0.8, 1.2]], [0.3, 0.98, 1.6, 4, [0.8, 1.2]], [0.66, 0.97, 1.6, 4, [0.8, 1.2]], [0.75, 0.88, 1.4, 3, [0.7, 1.1]],
    [0.88, 0.46, 2.0, 4, [0.8, 1.3]], [0.97, 0.52, 2.0, 4, [0.8, 1.3]], [0.8, 0.39, 1.6, 3, [0.7, 1.1]], [0.93, 0.76, 2.4, 5, [0.9, 1.5]], [0.98, 0.92, 2.4, 5, [1.0, 1.6]], [0.72, 0.96, 1.4, 2, [0.7, 1.0]],
    [0.3, 0.23, 1.5, 3, [0.7, 1.1]], [0.7, 0.25, 1.2, 2, [0.6, 1.0]], [0.85, 0.27, 1.5, 3, [0.7, 1.1]], [0.12, 0.22, 1.5, 3, [0.7, 1.1]], [0.4, 0.22, 1.2, 2, [0.6, 1.0]], [0.95, 0.2, 2.0, 3, [0.8, 1.2]],
    [0.05, 0.12, 2.4, 5, [0.9, 1.4]], [0.38, 0.08, 2.2, 4, [0.9, 1.3]], [0.8, 0.1, 2.2, 4, [0.9, 1.3]],
    [0.33, 0.5, 2.2, 6, [0.8, 1.3]], [0.24, 0.56, 2.0, 5, [0.8, 1.2]], [0.5, 0.46, 1.6, 3, [0.7, 1.1]], [0.62, 0.52, 1.4, 3, [0.7, 1.1]], [0.42, 0.4, 1.4, 3, [0.7, 1.0]], [0.75, 0.42, 1.6, 4, [0.8, 1.2]]];
  for (const [u, v, rad, n, [s0, s1]] of BUSHES) {
    const [x0, z0] = P(u, v, 0); let [cx, cz] = [x0, z0];
    const top = height(x0, z0); if (top > 1) [cx, cz] = P(u, v, top);
    for (let k = 0; k < n * K * K; k++) {
      const a = R(0, 6.28), r = Math.sqrt(rand()) * rad * K, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (trailEdge(x, z) < 0.2 || stairsAt(x, z).inside || trunkAt.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr) || COLLIDERS.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
      addBush(x, height(x, z) - 0.1, z, R(s0, s1) * 0.78, { sy: 0.72, tint: R(-2.0, -0.2) });
    }
  }
  // foreground leaves at the bottom corners, close to the lens and darker
  for (const [u, v, y, r] of [[0.03, 0.98, 2.6, 2.4], [0.11, 1.02, 2.2, 2.0], [0.97, 0.97, 2.4, 2.3], [0.9, 1.02, 2.0, 1.8], [0.2, 1.03, 2.0, 1.8], [0.8, 1.03, 2.0, 1.7], [0.0, 0.85, 2.2, 2.0], [1.0, 0.75, 2.2, 2.0]]) {
    const [x, z] = P(u, v, y);
    addBush(x, y - 1.0, z, r * 0.85, { sy: 0.8, tint: -4.2 });
  }
  // grass clumps and flowers, in patches, leaving the trails bare
  for (let i = 0; i < 11000 * Math.min(K * K, 4); i++) {
    const x = R(GX0 + 4, GX1 - 4), z = R(-30 * K, GZ1);
    const tr = trailEdge(x, z);
    if (tr < -0.2 || stairsAt(x, z).inside) continue;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.29) * 2.0) * Math.sin(z * 0.41 - x * 0.13);
    if (rand() > (tr < 0.6 ? 0.55 : 0.25 + patch * 0.75)) continue;
    const y = height(x, z);
    if (Math.abs(height(x + 0.4, z) - y) > 0.35 || Math.abs(height(x, z + 0.4) - y) > 0.35) continue;   // not on the ledge faces
    grassItems.push({ x, y: y - 0.03, z, s: R(0.75, 1.15), ry: R(0, 6.28), k: 0.82 + 0.3 * patch + R(-0.05, 0.05) });
    if (rand() < (tr < 1.2 ? 0.45 : 0.22) * (0.5 + patch)) for (let k = 0; k < 3; k++) flowerItems.push({ x: x + R(-0.5, 0.5), y: y - 0.02, z: z + R(-0.5, 0.5), s: R(0.9, 1.3), ry: R(0, 6.28), c: rand() < 0.75 ? '#f6d43a' : '#fff8e6' });
  }
  for (const [u, v, sz] of ROCKS) {
    if (sz > 1.6) continue;
    const [x0, z0] = P(u, v, 0);
    for (let k = 0; k < 10; k++) {
      const a = R(0, 6.28), r = sz * 0.6 + R(0.1, 1.2), x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      if (trailAt(x, z) < 0) continue;
      flowerItems.push({ x, y: height(x, z) - 0.02, z, s: R(0.8, 1.1), ry: R(0, 6.28), c: rand() < 0.6 ? '#f2d03c' : '#fff8e6' });
    }
  }
  // ferns at the edges of the clearing
  const fernItems = [];
  for (const [u, v, s] of [[0.22, 0.79, 1.5], [0.12, 0.88, 1.6], [0.5, 0.8, 1.1], [0.9, 0.72, 1.4], [0.74, 0.84, 1.1], [0.97, 0.66, 1.2], [0.33, 0.94, 1.1]]) {
    const [x, z] = P(u, v, 0); fernItems.push({ x, y: height(x, z) - 0.05, z, s, ry: R(0, 6.28), k: R(0.9, 1.05) });
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
