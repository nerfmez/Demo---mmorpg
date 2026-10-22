// ---------- layout: authored in concept pixels and projected onto the ground ----------
// (u, v) are fractions of the 1672x941 concept. A point is projected onto the plane y = h, so
// every trail, ledge, tree and rock lands where the concept has it.
placeCamera(); camera.updateMatrixWorld();
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function P(u, v, y = 0) {
  _ndc.set(u * 2 - 1, 1 - v * 2); _ray.setFromCamera(_ndc, camera);
  const o = _ray.ray.origin, d = _ray.ray.direction, t = (y - o.y) / d.y;
  return [o.x + d.x * t, o.z + d.z * t];
}
const K = 2.4;   // the owner asked for more room in the same frame: the camera stands K x farther back
const TS = K / 1.8 * 1.25;   // trees grow with the room, and a quarter bigger again (owner's ask)
const inFrame = (u, v) => u > -0.08 && u < 1.08 && v > -0.06 && v < 1.06;
// ground mesh bounds (metres)
const GX0 = -30 * K, GX1 = 30 * K, GZ0 = -44 * K, GZ1 = 10 * K;
function noise2(x, z) { return Math.sin(x * 0.7 + Math.sin(z * 0.53)) * 0.5 + Math.sin(z * 0.9 + x * 0.21) * 0.5; }

// Raised ground: closed outlines. 'b' points sit on the low ground at the foot of a ledge, 't'
// points on the top (back edges, off screen). Edges between two 'b' points in the frame are
// stone walls. The two front banks are low grassy rises under the big rocks, without walls.
const TERRACES = [
  { top: 3.3, ledge: true, pts: [[-0.3, 0.49, 'b'], [0.03, 0.49, 'b'], [0.09, 0.495, 'b'], [0.135, 0.47, 'b'], [0.165, 0.41, 'b'], [0.19, 0.35, 'b'], [0.215, 0.29, 'b'], [0.232, 0.225, 'b'], [0.24, 0.175, 'b'], [0.225, 0.1, 't'], [0.2, -0.5, 't'], [-0.5, -0.5, 't']] },
  // the island: a raised round in the middle with walls all round and the trail passing behind it
  { top: 3.7, ledge: true, pts: [[0.45, 0.2, 'b'], [0.44, 0.235, 'b'], [0.47, 0.275, 'b'], [0.435, 0.33, 'b'], [0.405, 0.39, 'b'], [0.42, 0.455, 'b'], [0.47, 0.5, 'b'], [0.53, 0.505, 'b'], [0.585, 0.495, 'b'], [0.63, 0.47, 'b'], [0.665, 0.42, 'b'], [0.69, 0.36, 'b'], [0.705, 0.3, 'b'], [0.712, 0.23, 'b'], [0.7, 0.19, 'b'], [0.65, 0.17, 'b'], [0.58, 0.16, 'b'], [0.51, 0.17, 'b']] },
  // the level the stairs climb to, behind the left terrace
  { top: 3.3, ledge: false, pts: [[0.2, 0.1, 't'], [0.32, 0.1, 't'], [0.33, -0.5, 't'], [0.18, -0.5, 't']] },
  { top: 3.4, ledge: true, pts: [[1.5, 0.5, 'b'], [0.985, 0.475, 'b'], [0.94, 0.43, 'b'], [0.92, 0.36, 'b'], [0.915, 0.29, 'b'], [0.925, 0.22, 'b'], [0.94, 0.15, 'b'], [0.955, 0.08, 'b'], [0.97, 0.0, 't'], [1.0, -0.5, 't'], [1.6, -0.5, 't']] },
  { top: 0.8, ledge: false, pts: [[-0.3, 0.6, 'b'], [0.05, 0.6, 'b'], [0.13, 0.645, 'b'], [0.2, 0.71, 'b'], [0.235, 0.8, 'b'], [0.25, 0.95, 'b'], [0.26, 1.3, 'b'], [-0.3, 1.3, 'b']] },
  { top: 0.7, ledge: false, pts: [[1.3, 0.58, 'b'], [0.95, 0.6, 'b'], [0.885, 0.68, 'b'], [0.845, 0.8, 'b'], [0.77, 0.865, 'b'], [0.71, 0.95, 'b'], [0.69, 1.3, 'b'], [1.3, 1.3, 'b']] },
].map(T => {
  const pts = T.pts.map(([u, v, k]) => { const [x, z] = P(u, v, k === 't' ? T.top : 0); return { x, z, wall: k === 'b' && inFrame(u, v), u, v }; });
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
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}
// stone stairs from the left trail up to the back level
const ST = (() => {
  const [x0, z0] = P(0.297, 0.215, 0), [x1, z1] = P(0.257, 0.1, 3.3), dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  return { x0, z0, x1, z1, ux: dx / len, uz: dz / len, len, half: 1.7, n: Math.round(len / 0.8), top: 3.3 };
})();
function stairsAt(x, z) {
  const rx = x - ST.x0, rz = z - ST.z0, a = (rx * ST.ux + rz * ST.uz) / ST.len, s = Math.abs(-rx * ST.uz + rz * ST.ux);
  return { a, s, inside: a > -0.02 && a < 1.02 && s < ST.half + 0.25 };
}
// trails: polylines of [u, v, half width m, plane height]
const TRAILS = [
  [[0.52, 1.25, 2.3], [0.515, 0.92, 2.2], [0.5, 0.76, 2.2], [0.455, 0.64, 1.9], [0.37, 0.555, 2.0], [0.295, 0.475, 2.2], [0.325, 0.385, 1.6], [0.385, 0.315, 1.3], [0.35, 0.245, 1.15], [0.3, 0.21, 1.05]],
  [[0.5, 0.76, 2.0], [0.6, 0.665, 1.9], [0.7, 0.585, 2.2], [0.785, 0.505, 2.4], [0.815, 0.42, 2.3], [0.82, 0.33, 1.6], [0.838, 0.25, 1.35], [0.865, 0.17, 1.15], [0.885, 0.08, 1.05], [0.9, -0.2, 1.0], [0.92, -0.5, 1.0]],
  // the trail round the back of the island, from the foot of the stairs to the right trail
  [[0.3, 0.21, 1.05], [0.37, 0.15, 1.1], [0.44, 0.125, 1.15], [0.52, 0.115, 1.2], [0.6, 0.115, 1.2], [0.68, 0.13, 1.15], [0.745, 0.17, 1.1], [0.8, 0.22, 1.15], [0.838, 0.25, 1.35]],
  [[0.257, 0.1, 1.0, 3.3], [0.272, 0.03, 1.0, 3.3], [0.3, -0.25, 1.0, 3.3], [0.31, -0.5, 1.0, 3.3]],
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
const SHADE = [[0.27, 0.46, 4.2], [0.36, 0.37, 2.6], [0.44, 0.63, 2.6], [0.54, 0.93, 3.2], [0.63, 0.83, 2.6], [0.8, 0.47, 3.2], [0.85, 0.37, 2.6], [0.2, 0.6, 3.2], [0.74, 0.6, 2.2], [0.86, 0.24, 2.0], [0.33, 0.24, 2.0]]
  .map(([u, v, r]) => { const [x, z] = P(u, v); return { x, z, r: r * K }; });
const shadeAt = (x, z) => SHADE.reduce((m, s) => Math.max(m, 1 - smooth(s.r * 0.45, s.r, Math.hypot(x - s.x, z - s.z))), 0);

// the shape of the land: height and how much of it is a raised top
function field(x, z) {
  let y = 0, top = 0;
  for (const T of TERRACES) {
    const d = polyAt(T, x, z);
    if (d === null) continue;
    const w = 1 - smooth(-0.9, 0.25, d);
    if (w > 0) { y = Math.max(y, T.top * w); if (T.ledge || T.top > 2) top = Math.max(top, w); }
  }
  const st = stairsAt(x, z);
  if (st.inside) y = ST.top * Math.max(0, Math.min(1, st.a));
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
    vertexColors: true, shade: [0.62, 0.5, 0.42], mid: [0.84, 0.74, 0.64], band: [-0.2, 0.18],
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
  vec3 trail=mix(${L('#dda461')},${L('#ecba72')},smoothstep(.3,.7,n1));
  trail=mix(trail,${L('#cc8f4c')},smoothstep(.6,.8,fbm(q*.8+5.))*.4);
  trail=mix(trail,${L('#f2c886')},(1.-smoothstep(-3.,-1.,vD))*smoothstep(.45,.7,fbm(q*.5+2.))*.35);
  trail*=.97+.05*n3;
  vec2 pc=fract(q*2.6)-.5; float peb=step(.9,hash12(floor(q*2.6)))*(1.-smoothstep(.1,.16,length(pc)));
  trail=mix(trail,mix(${L('#a99a86')},${L('#d8cfc0')},step(0.,pc.y)),peb*.85);
  // grass: bright yellow-green, darker mottles and pale specks
  vec3 grass=mix(${L('#86a836')},${L('#a6bc3b')},smoothstep(.32,.7,n1));
  grass=mix(grass,${L('#5a8536')},smoothstep(.56,.78,n2)*.55);
  grass=mix(grass,${L('#cdd65a')},step(.965,hash12(floor(q*9.)))*.7);
  // a ragged grass edge spilling over the dirt
  float tuft=step(.5,vnoise(q*5.))*(1.-smoothstep(-.9,-.1,dd))*smoothstep(-1.6,-.6,dd);
  vec3 col=mix(trail,grass,clamp(wgt.x+tuft*.6,0.,1.));
  // the steep faces behind the stones
  float steep=1.-smoothstep(.45,.75,normalize(vWN).y);
  col=mix(col,${L('#5b5246')},steep*.85);
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

// ---------- stone ledges along the terrace walls: tall upright blocks with mossy tops ----------
const COLLIDERS = [];
function buildLedges() {
  const blk = { chamfer: 0.12, jitter: 0.14, extra: 7 };
  for (const T of TERRACES) {
    if (!T.ledge) continue;
    const p = T.pts;
    for (let e = 0; e < p.length; e++) {
      const a = p[e], b = p[(e + 1) % p.length];
      if (!a.wall || !b.wall) continue;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len;
      let nx = tz, nz = -tx;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (polyAt(T, mx + nx * 0.6, mz + nz * 0.6) < 0) { nx = -nx; nz = -nz; }   // n points off the terrace
      const ry = Math.atan2(-tz, tx);
      if (len < 7 && rand() < 0.35) {
        // a whole run as one slab: a single face of rock instead of separate blocks
        const px = mx + nx * 0.3, pz = mz + nz * 0.3;
        if (!(stairsAt(px, pz).s < ST.half + 0.5 && stairsAt(px, pz).a > -0.2 && stairsAt(px, pz).a < 1.2)) {
          const base = height(px + nx * 1.2, pz + nz * 1.2), top = T.top + R(-0.3, 0.35);
          addStone(px, base - 0.15, pz, len + 0.35, top - base + 0.15, R(1.5, 2.0), { chamfer: 0.08, jitter: 0.06, extra: 14, ry: ry + R(-0.05, 0.05), rx: R(-0.04, 0.04), moss: 0.55 });
          if (rand() < 0.7) addBush(px - nx * R(0.6, 1.2), top - 0.3, pz - nz * R(0.6, 1.2), R(0.4, 0.7), { sy: 0.5, tint: 0.2 });
          continue;
        }
      }
      let s = R(0, 0.4);
      while (s < len) {
        const w = R(1.2, 2.0), c = s + w / 2;
        s += w * R(0.86, 1.0);
        if (c > len + 0.3) break;
        const jut = rand() < 0.15 ? R(0.25, 0.6) : R(-0.1, 0.15);
        const px = a.x + tx * c + nx * (0.25 + jut), pz = a.z + tz * c + nz * (0.25 + jut);
        if (stairsAt(px, pz).s < ST.half + 0.5 && stairsAt(px, pz).a > -0.2 && stairsAt(px, pz).a < 1.2) continue;
        if (rand() < 0.07) continue;   // a gap, where a block has gone
        const base = height(px + nx * 1.2, pz + nz * 1.2), top = T.top + R(-0.5, 0.42);
        addStone(px, base - 0.15, pz, w, top - base + 0.15, R(1.4, 1.9), { ...blk, ry: ry + R(-0.16, 0.16), rx: R(-0.06, 0.06), rz: R(-0.07, 0.07), moss: 0.6 });
        // a grassy lip and bushes over the top, some spilling across the stones
        if (rand() < 0.5) addBush(px - nx * R(0.6, 1.2) + R(-0.3, 0.3), top - 0.3, pz - nz * R(0.6, 1.2), R(0.35, 0.6), { sy: 0.5, tint: 0.2 });
        if (rand() < 0.18) addBush(px - nx * R(1.4, 2.8), top - 0.15, pz - nz * R(1.4, 2.8), R(0.6, 1.0), { sy: 0.7, tint: -1 });
        // at the foot: bushes and stones that broke away
        if (rand() < 0.16) addBush(px + nx * R(0.9, 1.6), base - 0.05, pz + nz * R(0.9, 1.6), R(0.5, 0.85), { sy: 0.75, tint: -1 });
        if (rand() < 0.14) { const r = R(0.35, 0.75); addStone(px + nx * R(1.1, 2.2), base - 0.06, pz + nz * R(1.1, 2.2), r, r * R(0.6, 0.85), r, { ...blk, ry: R(-0.6, 0.6), moss: 0.3 }); }
      }
    }
  }
  // the stairs: six worn slabs, and a block standing on each side at the top
  for (let i = 0; i < ST.n; i++) {
    const a = (i + 0.5) / ST.n, x = ST.x0 + ST.ux * ST.len * a, z = ST.z0 + ST.uz * ST.len * a, y = ST.top * i / ST.n;
    addStone(x, y - 0.1, z, ST.half * 2 * R(0.94, 1.02), ST.top / ST.n + 0.12, ST.len / ST.n * 1.25, { chamfer: 0.2, jitter: 0.08, extra: 4, ry: Math.atan2(ST.ux, ST.uz) + R(-0.06, 0.06), moss: 0.25, base: '#b7a48b' });
  }
  for (const side of [-1, 1]) {
    const x = ST.x0 + ST.ux * ST.len * 0.4 - ST.uz * side * (ST.half + 0.6), z = ST.z0 + ST.uz * ST.len * 0.4 + ST.ux * side * (ST.half + 0.6);
    addStone(x, height(x, z) - 0.6, z, 1.3, 3.5, 1.4, { ...blk, ry: Math.atan2(ST.ux, ST.uz), moss: 0.5 });
  }
}
// loose rocks: [u, v, size m]; the big ones on the front banks frame the view
const ROCKS = [[0.1, 0.79, 2.7], [0.035, 0.655, 1.7], [0.155, 0.905, 2.0], [0.24, 0.695, 1.1], [0.29, 0.855, 1.0], [0.36, 0.845, 1.15], [0.4, 0.875, 0.8], [0.25, 0.74, 0.55],
  [0.555, 0.555, 1.05], [0.47, 0.497, 0.6], [0.62, 0.6, 0.95], [0.665, 0.59, 1.1], [0.61, 0.625, 0.5], [0.7, 0.505, 0.6], [0.585, 0.485, 0.55], [0.43, 0.735, 0.32], [0.27, 0.745, 0.42], [0.72, 0.36, 0.7],
  [0.79, 0.93, 2.5], [0.965, 0.72, 2.3], [0.875, 0.855, 1.2], [0.91, 0.5, 0.75], [0.73, 0.865, 0.45], [0.47, 0.79, 0.25], [0.6, 0.71, 0.3], [0.33, 0.62, 0.3], [0.81, 0.62, 0.35]];
function buildRocks() {
  const round = { chamfer: 0.45, extra: 26, jitter: 0.07 };
  for (const [u, v, s] of ROCKS) {
    const [x, z] = P(u, v, s > 1.5 ? 0.6 : 0);
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
// roots from a tree on a raised top, over the lip of its ledge and down onto the low ground
function drapeRoots(tx, tz, top, targets, s = 1) {
  for (const [u, v, rr = 1] of targets) {
    const [fx, fz] = P(u, v, 0), dx = fx - tx, dz = fz - tz, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
    let e = 0.6; while (e < d && height(tx + ux * e, tz + uz * e) > top - 0.35) e += 0.2;
    if (e > 4.5 * s) continue;   // the ledge is too far: no root crawls across the whole terrace
    const lip = e - 0.25, sway = R(-0.4, 0.4);
    const pts = [
      new V3(tx + ux * 0.2, top + 0.35, tz + uz * 0.2),
      new V3(tx + ux * lip * 0.5 - uz * sway * 0.4, top + 0.2, tz + uz * lip * 0.5 + ux * sway * 0.4),
      new V3(tx + ux * lip - uz * sway, top + 0.08, tz + uz * lip + ux * sway),
      new V3(tx + ux * (lip + 0.55) - uz * sway, top * 0.55, tz + uz * (lip + 0.55) + ux * sway),
      new V3(tx + ux * (lip + 1.2) - uz * sway * 0.6, height(tx + ux * (lip + 1.2), tz + uz * (lip + 1.2)) + 0.05, tz + uz * (lip + 1.2) + ux * sway * 0.6),
    ];
    tube(pts, 0.3 * s * rr, 0.05, { sides: 7 });
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

// ---------- crowns and shrubs as the concept paints them: many small leaf puffs ----------
// Each puff is a cluster of cards carrying small lobed leaves; a puff is lit on its own (bright
// upper-left, deep teal underneath) and a dark core fills the gaps, so a crown reads as a heap
// of leaf clumps instead of one smooth blob.
const clumpMaps = new Map();
function clumpTexture(shrub = false) {
  if (clumpMaps.has(shrub)) return clumpMaps.get(shrub);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const c = cv.getContext('2d'), rng = mkRng(shrub ? 77 : 41);
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * 256 + 128, oy = Math.floor(tile / 2) * 256 + 128;
    // a rosette of lobed leaves pointing out from the middle, the biggest at the back
    const n = shrub ? 6 + (tile % 2) : 9 + tile;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rng.range(-0.25, 0.25), len = shrub ? rng.range(78, 104) : rng.range(52, 86), wid = len * rng.range(0.42, 0.55);
      c.save(); c.translate(ox + Math.cos(a) * rng.range(14, 30), oy + Math.sin(a) * rng.range(14, 30)); c.rotate(a);
      const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#b8b8b8'); g.addColorStop(0.55, '#f2f2f2'); g.addColorStop(1, '#ffffff');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0);
      // three lobes a side with small notches between, a pointed tip
      for (const side of [-1, 1]) {
        const pts = [];
        for (let k = 1; k <= 3; k++) { const t = k / 4; pts.push([len * (t - 0.06), side * wid * 0.5 * Math.sin(t * Math.PI) * 1.15], [len * (t + 0.04), side * wid * 0.5 * Math.sin(t * Math.PI) * 0.72]); }
        if (side < 0) { for (const [x, y] of pts) c.lineTo(x, y); c.lineTo(len, 0); }
        else for (const [x, y] of pts.reverse()) c.lineTo(x, y);
      }
      c.closePath(); c.fill(); c.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  clumpMaps.set(shrub, t); return t;
}
function clumpFoliage(seed = 3, shrub = false) {
  const rng = mkRng(seed * 13 + (shrub ? 5 : 1)), p = [], n = [], c = [], uv = [];
  const [dark, mid, light] = (shrub ? FOL.shrub : FOL.leaf).map(h => new THREE.Color(h));
  const deep = dark.clone().multiplyScalar(0.72), sunDir = new V3(-0.55, 0.8, 0.25).normalize();
  // the crown's envelope (unit space, as the game's crowns): a dome for trees, a mound for shrubs
  const E = shrub ? { x: 0.62, y: 0.45, z: 0.48, cy: 0.42, puffs: 8, r: [0.24, 0.34], cards: 8, lift: 0.16 } : { x: 0.9, y: 0.55, z: 0.75, cy: 0.3, puffs: 28, r: [0.24, 0.36], cards: 13, lift: -0.05 };
  const puffs = [];
  for (let i = 0; i < E.puffs; i++) {
    // spread over the envelope's surface, a few inside; none on the flat underside
    const u = rng.range(0, Math.PI * 2), v = Math.acos(rng.range(-0.35, 1)), k = i < 3 ? 0.45 : rng.range(0.75, 1.0);
    puffs.push({ c: new V3(Math.sin(v) * Math.cos(u) * E.x * k, E.cy + Math.cos(v) * E.y * k, Math.sin(v) * Math.sin(u) * E.z * k), r: rng.range(...E.r) });
  }
  const col = new THREE.Color(), tmp = new V3();
  const card = (centre, normal, size, roll, tile, tone) => {
    const across = new V3().crossVectors(new V3(0, 1, 0), normal); if (across.lengthSq() < 1e-3) across.set(1, 0, 0); else across.normalize();
    const along = new V3().crossVectors(normal, across).normalize();
    const x = across.clone().multiplyScalar(Math.cos(roll)).addScaledVector(along, Math.sin(roll)), y = along.clone().multiplyScalar(Math.cos(roll)).addScaledVector(across, -Math.sin(roll));
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      const v = centre.clone().addScaledVector(x, a * size * 0.5).addScaledVector(y, b * size * 0.5).addScaledVector(normal, size * 0.12 * (1 - Math.abs(a * b)));
      p.push(v.x, v.y, v.z); n.push(normal.x, normal.y, normal.z); c.push(tone.r, tone.g, tone.b);
      uv.push(((tile % 2) + (a + 1) * 0.5) * 0.5, (Math.floor(tile / 2) + (b + 1) * 0.5) * 0.5);
    }
  };
  // the dark core: big cards round the middle, so gaps between the puffs show shade, not sky
  for (let i = 0; i < 10; i++) {
    const a = i * 2.39996, nrm = new V3(Math.cos(a), rng.range(-0.2, 0.5), Math.sin(a)).normalize();
    card(new V3(nrm.x * E.x * 0.45, E.cy + nrm.y * E.y * 0.35, nrm.z * E.z * 0.45), nrm, E.x * 0.85, rng.range(-1, 1), i % 4, deep);
  }
  for (const P0 of puffs) {
    const ph = THREE.MathUtils.clamp((P0.c.y - E.cy + E.y) / (2 * E.y), 0, 1), jit = rng.range(-0.06, 0.06);
    for (let i = 0; i < E.cards; i++) {
      const a = i * 2.39996 + rng.range(-0.3, 0.3), up = rng.range(-0.25, 1);
      const nrm = new V3(Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up)).normalize();
      const centre = P0.c.clone().addScaledVector(nrm, P0.r * rng.range(0.55, 0.95));
      // lit by the puff's own roundness and its height in the crown: three hard steps
      const lit = nrm.dot(sunDir) * 0.5 + ph * 0.45 + jit + 0.12 + E.lift;
      if (lit > 0.62) col.copy(light); else if (lit > 0.3) col.copy(mid); else col.copy(dark);
      col.multiplyScalar(rng.range(0.94, 1.05));
      card(centre, tmp.copy(nrm).lerp(new V3(0, 1, 0), 0.35).normalize(), P0.r * rng.range(1.45, 1.9), rng.range(-3, 3), (i + puffs.indexOf(P0)) % 4, col);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [key, array, size] of [['position', p, 3], ['normal', n, 3], ['color', c, 3], ['uv', uv, 2]]) g.setAttribute(key, new THREE.Float32BufferAttribute(array, size));
  g.computeBoundingSphere(); return g;
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
FOL.leaf = ['#1d4a3e', '#4d873d', '#a2bf45']; FOL.shrub = ['#1a4236', '#3b7338', '#8cae40'];
FOL.trunk = { light: '#c49c76', mid: '#9d7b5d', shadow: '#6f5749', line: '#4a372e' };
STONE.splice(0, STONE.length, '#cdb9a6', '#c2b3a3', '#d2c2b0', '#b9ab9c', '#c8b8a6', '#bcae9f');
MOSS.splice(0, MOSS.length, '#a7c63f', '#93b23a', '#b5c94c');
// ---------- assemble ----------
const crownOnly = [];   // crowns without a trunk (on the arching tree)
function build() {
  scene.add(buildGround());
  buildLedges();
  buildRocks();
  // trees: [u, v, scale, crown variant]; their base height comes from the ground
  // trees: [u, v, scale, crown variant, trunk stretch]; tall trunks, so the crowns sit high and
  // the trunks and roots stay in view as in the concept
  // (crown heights measured against the concept: the island tree's crown reaches down to v = 0.2)
  const TREES = [[0.075, 0.2, 1.5, 3, 0.7], [0.565, 0.31, 1.55, 9, 0.62], [0.02, 0.06, 1.35, 9, 0.75], [0.19, 0.06, 1.3, 5, 0.72], [0.4, 0.04, 1.3, 5, 0.75], [0.645, 0.07, 1.35, 3, 0.75],
    [0.8, 0.03, 1.25, 9, 0.75], [0.975, 0.08, 1.45, 5, 0.75], [0.1, -0.04, 1.4, 3, 0.75], [0.3, -0.05, 1.3, 9, 0.75], [0.52, -0.06, 1.35, 5, 0.75], [0.72, -0.05, 1.35, 3, 0.75], [0.9, -0.05, 1.4, 9, 0.75], [0.0, -0.02, 1.4, 5, 0.75], [0.24, 0.02, 1.3, 3, 0.75], [0.48, 0.0, 1.35, 9, 0.75], [0.6, -0.02, 1.3, 5, 0.75], [0.86, 0.0, 1.3, 3, 0.75], [0.36, 0.06, 1.25, 3, 0.7], [0.12, 0.08, 1.3, 5, 0.7]];
  const trunkAt = [];
  for (let [u, v, s, seed, h] of TREES) {
    s *= 1.35 * TS; h *= 1.3;   // forest giants: the farther camera shows them smaller
    if (v < 0.25) h *= 0.62;   // the back row: lower trunks keep the bigger crowns in the top of the frame
    let [x, z] = P(u, v, 0);
    if (trailAt(x, z) < 1.2 * s) continue;   // keep the trails open
    const top = height(x, z) > 1 ? height(x, z) : 0;
    if (top > 1) [x, z] = P(u, v, top);
    broadleaf(x, z, s, seed); treeItems[treeItems.length - 1].h = h;
    COLLIDERS.push({ x, z, r: 0.6 * s }); trunkAt.push([x, z, 1.4 * s]);
  }
  // roots draped over the ledges: the left tree and the big tree on the island
  { const [x, z] = P(0.075, 0.2, 3.3); drapeRoots(x, z, 3.3, [[0.03, 0.47, 1.1], [0.12, 0.47, 0.9], [0.17, 0.38], [0.205, 0.31, 0.8], [0.0, 0.35, 0.8]], 1.3 * TS); }
  { const [x, z] = P(0.565, 0.31, 3.7); drapeRoots(x, z, 3.7, [[0.6, 0.5, 1.2], [0.645, 0.47, 1.1], [0.675, 0.43], [0.52, 0.52, 0.8], [0.48, 0.5, 0.7], [0.69, 0.38, 0.8]], 1.4 * TS); }
  // the arching tree: a thick trunk rising from the right terrace, leaning over the trail and
  // rooting again on the island, with a crown above the arch
  {
    const [ax, az] = P(0.975, 0.335, 3.4), [bx, bz] = P(0.93, 0.25, 0), [cx, cz] = P(0.86, 0.26, 0), [dx2, dz2] = P(0.78, 0.29, 0), [ex, ez] = P(0.715, 0.27, 3.7);
    const a = TS, core = new THREE.CatmullRomCurve3([new V3(ax, 3.2, az), new V3(bx, 6.6, bz), new V3(cx, 8.0, cz), new V3(dx2, 7.4, dz2), new V3(ex + 0.5, 5.4, ez), new V3(ex, 3.55, ez)], false, 'centripetal');
    const M = 32, fr = core.computeFrenetFrames(M, false);
    // one thick trunk, swelling into buttresses at both feet, with ropy roots wound round it and half
    // sunk into it, so the bark reads as twisted cords rather than separate pipes
    const coreR = t => a * (0.36 + 0.45 * Math.pow(Math.abs(2 * t - 1), 6));
    tube(core.getSpacedPoints(24), 0, 0, { sides: 11, rf: coreR });
    for (let k = 0; k < 6; k++) {
      const th0 = k / 6 * Math.PI * 2, twist = 9 + k * 0.4, rb = [0.27, 0.22, 0.19, 0.25, 0.17, 0.21][k] * a, pts = [];
      for (let i = 0; i <= 22; i++) {
        const t = 0.02 + 0.96 * i / 22, f = Math.round(t * M), c = core.getPointAt(t), th = th0 + twist * t + Math.sin(t * 13 + k) * 0.2;
        const off = coreR(t) * 0.95;
        pts.push(c.clone().addScaledVector(fr.normals[f], Math.cos(th) * off).addScaledVector(fr.binormals[f], Math.sin(th) * off));
      }
      tube(pts, 0, 0, { sides: 7, rf: t => rb * (0.75 + 0.5 * Math.pow(Math.abs(2 * t - 1), 2)) });
    }
    // buttress roots at each foot: thick, bowing out and down, thinning into the ground
    for (const end of [0, 1]) {
      const foot = core.getPointAt(end), inner = core.getPointAt(end ? 0.9 : 0.1), back = foot.clone().sub(inner).setY(0).normalize();
      for (let k = 0; k < 6; k++) {
        const dir = back.clone().applyAxisAngle(new V3(0, 1, 0), -1.9 + k * 0.76 + R(-0.2, 0.2)), reach = R(1.6, 2.8) * a;
        const s0 = foot.clone().addScaledVector(dir, coreR(end) * 0.6); s0.y += 0.15 * a;
        const g = foot.clone().addScaledVector(dir, reach); g.y = height(g.x, g.z) - 0.1;
        const m = foot.clone().addScaledVector(dir, reach * 0.4); m.y = foot.y * 0.6 + g.y * 0.4 + 0.25 * a;
        tube([inner.clone().lerp(foot, 0.6), s0, m, g], 0, 0, { sides: 7, rf: t => a * (0.34 - 0.27 * t) });
      }
    }
    // a few thin shoots from the crown of the arch with leaves at their tips, and leaves along the top
    for (const t of [0.3, 0.45, 0.58, 0.72]) {
      const c = core.getPointAt(t), tip = c.clone().add(new V3(R(-1.6, 1.6), R(1.2, 2.2), R(-1.6, 0.6)).multiplyScalar(a));
      tube([c, c.clone().lerp(tip, 0.5).add(new V3(0, 0.4 * a, 0)), tip], 0, 0, { sides: 6, rf: t => (0.13 - 0.09 * t) * a });
      addBush(tip.x, tip.y - 0.6 * a, tip.z, R(0.7, 1.0) * a, { sy: 0.6, tint: R(-0.6, 0.2) });
    }
    for (let t = 0.2; t <= 0.82; t += 0.09) { const c = core.getPointAt(t); addBush(c.x + R(-0.4, 0.4), c.y + 0.25 * a, c.z + R(-0.6, 0.2), R(0.45, 0.75) * a, { sy: 0.5, tint: R(-0.8, 0.3) }); }
    for (const [px, py, pz, s] of [[cx + 0.6, 8.4 * a, cz - 3.2 * a, 1.2 * a], [bx + 1.6, 7.6 * a, bz - 3.0 * a, 1.1 * a]]) crownOnly.push({ x: px, y: py, z: pz, s, ry: R(0, 6.28), v: 1, k: R(0.94, 1.04) });
    COLLIDERS.push({ x: ax, z: az, r: 1.0 }, { x: ex, z: ez, r: 0.9 });
  }
  // bush masses: [u, v, radius m, count, size range] on the low ground and the tops
  const BUSHES = [[0.2, 0.585, 2.2, 6, [0.9, 1.5]], [0.06, 0.535, 1.6, 2, [0.7, 1.0]], [0.375, 0.42, 1.4, 4, [0.8, 1.2]], [0.645, 0.43, 1.6, 4, [0.7, 1.2]],
    [0.93, 0.56, 2.6, 7, [0.9, 1.6]], [0.97, 0.66, 2.0, 4, [1.0, 1.6]], [0.66, 0.95, 2.0, 4, [0.9, 1.4]], [0.3, 0.63, 1.2, 3, [0.6, 1.0]], [0.62, 0.575, 1.1, 2, [0.5, 0.8]],
    [0.8, 0.37, 1.0, 2, [0.5, 0.8]], [0.12, 0.3, 2.4, 5, [0.8, 1.2]], [0.47, 0.18, 2.4, 6, [0.8, 1.3]], [0.62, 0.3, 2.0, 4, [0.8, 1.2]], [0.05, 0.36, 2.0, 4, [0.8, 1.2]], [0.97, 0.38, 2.0, 4, [0.8, 1.2]], [0.62, 0.13, 2.5, 5, [0.8, 1.3]], [0.4, 0.06, 2.5, 5, [0.8, 1.3]],
    [0.98, 0.25, 2.5, 6, [0.9, 1.5]], [0.17, 0.12, 2.0, 4, [0.8, 1.3]], [0.88, 0.05, 2.0, 4, [0.8, 1.2]], [0.04, 0.12, 2.0, 4, [0.8, 1.3]], [0.76, 0.08, 1.5, 3, [0.7, 1.1]]];
  for (const [u, v, rad, n, [s0, s1]] of BUSHES) {
    const [x0, z0] = P(u, v, 0); let [cx, cz] = [x0, z0];
    const top = height(x0, z0); if (top > 1) [cx, cz] = P(u, v, top);
    for (let k = 0; k < n * K * K; k++) {
      const a = R(0, 6.28), r = Math.sqrt(rand()) * rad * K, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (trailEdge(x, z) < 0.2 || trunkAt.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr)) continue;
      addBush(x, height(x, z) - 0.1, z, R(s0, s1) * 0.78, { sy: 0.72, tint: R(-1.4, 0) });
    }
  }
  // foreground leaves at the bottom corners, close to the lens and darker
  for (const [u, v, y, r] of [[0.03, 0.98, 2.6, 2.4], [0.11, 1.02, 2.2, 2.0], [0.97, 0.97, 2.4, 2.3], [0.9, 1.02, 2.0, 1.8], [-0.01, 0.82, 2.2, 1.8]]) {
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
    if (rand() < (tr < 1.2 ? 0.3 : 0.12)) flowerItems.push({ x: x + R(-0.4, 0.4), y: y - 0.02, z: z + R(-0.4, 0.4), s: R(0.8, 1.15), ry: R(0, 6.28), c: rand() < 0.62 ? '#f6d43a' : '#fff8e6' });
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
  for (const [u, v, s] of [[0.13, 0.665, 1.5], [0.205, 0.93, 1.6], [0.255, 0.6, 1.2], [0.9, 0.745, 1.4], [0.735, 0.84, 1.1], [0.085, 0.57, 1.2], [0.95, 0.52, 1.2], [0.33, 0.95, 1.1]]) {
    const [x, z] = P(u, v, 0); fernItems.push({ x, y: height(x, z) - 0.05, z, s, ry: R(0, 6.28), k: R(0.9, 1.05) });
  }

  // merged stones + outline shells
  const stones = new THREE.Mesh(mergeGeometries(stoneParts), paint({ vertexColors: true, shade: [0.36, 0.34, 0.44], mid: [0.64, 0.62, 0.67], band: [-0.34, 0.24] }));
  stones.castShadow = stones.receiveShadow = true;
  scene.add(stones, new THREE.Mesh(mergeGeometries(stoneLines), outlineMat('#4c4852')));
  // roots and the arch, with an ink outline
  const wood = new THREE.Mesh(mergeGeometries(woodParts), paint({ vertexColors: true, shade: [0.62, 0.62, 0.7], mid: [0.62, 0.62, 0.7], band: [-5, -5] }));
  wood.castShadow = wood.receiveShadow = true; scene.add(wood);
  scene.add(new THREE.Mesh(mergeGeometries(woodInk), outlineMat(FOL.trunk.line)));
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
  const leafMat = shrub => paint({ vertexColors: true, map: clumpTexture(shrub), alphaTest: 0.45, side: THREE.DoubleSide, shade: [0.6, 0.7, 0.72], mid: [0.6, 0.7, 0.72], band: [-5, -5], ...sway(shrub ? 0.02 : 0.016, shrub ? 0 : 1.2) });
  const leafDepth = shrub => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: clumpTexture(shrub), alphaTest: 0.45 });
  const trunkGeo = animeTrunk();
  const trunks = placeAll(new THREE.InstancedMesh(trunkGeo, paint({ vertexColors: true, side: THREE.DoubleSide, shade: [0.62, 0.62, 0.7], mid: [0.62, 0.62, 0.7], band: [-5, -5] }), treeItems.length), treeItems, it => new V3(it.s, it.s * (it.h || 1), it.s));
  trunks.castShadow = trunks.receiveShadow = true; scene.add(trunks);
  scene.add(placeAll(new THREE.InstancedMesh(trunkGeo, outlineMat(FOL.trunk.line), treeItems.length), treeItems, it => new V3(it.s * 1.06, it.s * (it.h || 1) * 1.01, it.s * 1.06)));
  [3, 5, 9].forEach((seed, v) => {
    const items = [...treeItems.filter(t => t.v === v).map(t => ({ ...t, y: t.y + 3.5 * t.s * (t.h || 1) })), ...crownOnly.filter(c => c.v === v)];
    if (!items.length) return;
    const crown = placeAll(new THREE.InstancedMesh(clumpFoliage(seed, false), leafMat(false), items.length), items, it => new V3(3.0 * it.s, 2.0 * it.s, 2.7 * it.s));
    crown.customDepthMaterial = leafDepth(false); crown.castShadow = crown.receiveShadow = true; scene.add(crown);
  });
  [11, 13, 19].forEach((seed, v) => {
    const items = shrubItems.filter(t => t.v === v);
    if (!items.length) return;
    const mesh = placeAll(new THREE.InstancedMesh(clumpFoliage(seed, true), leafMat(true), items.length), items, it => new V3(it.sx, it.sy, it.sz));
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
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__scene = { lockPR: v => { pixelRatio = v; renderer.setPixelRatio(v); resize(); window.__noAdapt = true; }, scene, camera, renderer, CAM, placeCamera, HERO, walkTo, P, height, ready: true };
