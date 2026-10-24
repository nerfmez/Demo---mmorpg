// Frontline Split, in the bench's light-and-ribbon language. During the rules' 0.65 s wind-up the
// lane it will cut (range x width, turning with the aim) is drawn on the ground as a thin cel outline
// that fills from the hero outward, and light gathers along the raised blade. On 'lineStrike' the
// blade hits the ground with a shockwave ring, rays and sparks; a tall vertical crescent of light
// (tips up and down, bulging forward, white-hot front edge) flies down the lane; a cut line opens
// in the ground behind it, and the ground cracks open along the lane: a zigzag fissure with forked
// branches tearing open just behind the crescent, glowing hot at first and then left as a dark crack
// with rubble thrown up, which lingers and fades. As the crescent reaches each struck target a hard
// burst (a glow that pops, rays thrown on along the cut, a ring) goes off on it.
// Cosmetic only; sizes and timing come from the rules.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, place, placeV, conformPlane } from './fx-common.js';

const WAVE_T = 0.22, FADE = 0.5, CUTS = 8, RING_PTS = 21, BURSTS = 8, RAYS = 10;
// the ground crack: a main fissure and forked branches (fixed pools of points), held then faded
const MAIN_PTS = 22, BRANCHES = 9, BRANCH_PTS = 5, RUBBLE = 30, CRACK_HOLD = 1.8, CRACK_FADE = 0.7, CRACK_Y = 0.045;
const CRACK_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard; vec3 c = d > 0.55 ? vT*2.2 : vT; gl_FragColor=vec4(c, vA); }`;
const EARTH = [0.16, 0.11, 0.08], RUBBLE_COL = [0.42, 0.33, 0.24];
let crackW = 0;
const crackTaper = (x) => crackW * Math.min(1, x * 5, (1 - x) * 3 + 0.25), branchTaper = (x) => crackW * (1 - x * 0.85);

// the flying crescent: an arc of a ring in the local y-z plane (z = forward), s along it, v across
function crescentGeometry(R, arc, segs = 48, rings = 6) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = -arc / 2 + u * arc;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, r = R * (0.55 + 0.45 * v);
      pos.push(0, Math.sin(a) * r, Math.cos(a) * r); uv.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) {
    const a = i * (rings + 1) + j, b = a + rings + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
// thick in the middle, pointed at both ends, white-hot along the front (outer) edge, fading back
const CRESCENT_FS = `varying vec2 vUv; uniform float uFade; uniform vec3 uHot; uniform vec3 uBody; uniform float uGlow;
  void main(){
    float s = vUv.x, v = vUv.y;
    float w = pow(sin(3.14159265 * s), 0.9) * (1.0 - 0.6 * uFade);
    float inner = 1.0 - w;
    if (v < inner) discard;
    float b = (v - inner) / max(w, 1e-3);
    if (uGlow > 0.5) { float g = smoothstep(0.0, 0.8, b) * (1.0 - smoothstep(0.9, 1.0, b)); gl_FragColor = vec4(uBody * g * 0.55 * (1.0 - uFade), 1.0); return; }
    vec3 c = mix(uBody, uHot, smoothstep(0.45, 0.8, b));
    float line = step(0.44, abs(fract(b * 7.0) - 0.5)) * step(0.3, b);
    c = mix(c, uHot, line * 0.7);
    float a = smoothstep(0.0, 0.5, b) * (1.0 - smoothstep(0.97, 1.0, b)) * (1.0 - uFade * uFade);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a); }`;
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.96), 0.85) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the lane: a thin outline, a faint fill and a brighter band filling from the hero (y=0) to the end
const LANE_FS = `varying vec2 vP; uniform float uFill; uniform float uAlpha; uniform float uFlash; uniform vec3 uCol; uniform vec2 uSize;
  void main(){
    vec2 m = vec2(min(vP.x, uSize.x - vP.x), min(vP.y, uSize.y - vP.y)); // distance to each edge in metres
    float edge = min(m.x, m.y);
    float a = 0.08;
    if (vP.y < uFill * uSize.y) a = 0.2;
    if (edge < 0.04) a = 0.75;
    if (abs(vP.y - uFill * uSize.y) < 0.03 && uFill < 0.999) a = 0.9; // the leading edge of the fill
    a += uFlash * 0.45;
    gl_FragColor = vec4(mix(uCol, vec3(1.0), 0.3 + 0.5 * uFlash), a * uAlpha); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.6;
const taperW = (x) => stripW * Math.sin(Math.PI * x), taperGlowW = (x) => taperW(x) * 2.6;
const sparkGlowW = () => stripW * 2.2, sparkCoreW = (x) => stripW * x * (1 - stripU * 0.6);

export class SplitFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.laneMat = new THREE.ShaderMaterial({ uniforms: { uFill: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 }, uCol: { value: new THREE.Color() }, uSize: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 vP; uniform vec2 uSize; void main(){ vP=uv*uSize; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: LANE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // the lane plane stands in a group turned to the aim: its uv.y runs from the hero to the far end
    this.lane = new THREE.Group(); this.lane.visible = false; scene.add(this.lane);
    this.laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 20), this.laneMat);
    this.laneMesh.rotation.x = Math.PI / 2; this.laneMesh.renderOrder = 1; this.lane.add(this.laneMesh);
    // the flying crescent: a core (normal blend) and a soft additive glow behind it
    const geo = crescentGeometry(1.25, 2.6);
    const cmat = (glow) => new THREE.ShaderMaterial({ uniforms: { uFade: { value: 0 }, uHot: { value: new THREE.Color(1, 1, 0.97) }, uBody: { value: new THREE.Color() }, uGlow: { value: glow ? 1 : 0 } },
      vertexShader: VS, fragmentShader: CRESCENT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.wave = new THREE.Group(); this.wave.visible = false; scene.add(this.wave);
    this.waveCore = new THREE.Mesh(geo, cmat(false)); this.waveCore.renderOrder = 8;
    this.waveGlow = new THREE.Mesh(geo, cmat(true)); this.waveGlow.scale.set(1, 1.12, 1.12); this.waveGlow.renderOrder = 7;
    this.wave.add(this.waveGlow, this.waveCore);
    // hard bursts on struck targets and where the blade hits the ground
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    this.burstI = 0; this.rings = []; this.ringAlive = (r) => r.life < r.max;
    this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.onShake = null;
    this.wind = null; this.strikeAt = null; this.cuts = []; this.sparks = []; this.look = lookOf('physical'); this.rnd = mulberry32(61);
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.side = new THREE.Vector3();
    this.cutAlive = (c) => !c.done; this.sparkAlive = (s) => s.life < s.max;
    // the crack (dark fissure, drawn with normal blending) and its hot glow
    this.crackDark = new Ribbon(scene, camera, 1600, CRACK_FS, THREE.NormalBlending); this.crackDark.mesh.renderOrder = 2;
    this.crackGlow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending); this.crackGlow.mesh.renderOrder = 3;
    this.crack = { t: 9, x: 0, z: 0, range: 1, main: Array.from({ length: MAIN_PTS }, () => ({ p: new THREE.Vector3(), along: 0 })),
      branches: Array.from({ length: BRANCHES }, () => ({ at: 0, w: 0, pts: Array.from({ length: BRANCH_PTS }, () => new THREE.Vector3()) })) };
    this.rubble = Array.from({ length: RUBBLE }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 9, max: 1, delay: 0, len: 0.1, spin: 0, rate: 0 }));
    this.view = []; this.tip = new THREE.Vector3();
  }
  // castStart of the line cut: the wind-up lasts total; range and width from the skill
  windup(total, range, width, element) {
    this.look = lookOf(element);
    this.wind = { t: 0, total, range, width };
    this.strikeAt = null;
    this.laneMat.uniforms.uCol.value.setRGB(...this.look.edge);
    this.laneMat.uniforms.uSize.value.set(width, range);
    this.laneMesh.scale.set(width, range, 1); this.lane.visible = true;
  }
  placeLane(x, z, angle) {
    const w = this.wind || this.strikeAt; if (!w) return;
    place(this.lane, x + Math.sin(angle) * w.range / 2, 0.03, z + Math.cos(angle) * w.range / 2);
    this.lane.rotation.y = angle;
    conformPlane(this.laneMesh, 0.03);
  }
  // the rules' 'lineStrike'
  strike(e) {
    this.wind = null;
    this.strikeAt = { t: 0, x: e.x, z: e.z, angle: e.angle, range: e.range, width: e.width };
    this.look = lookOf(e.element);
    this.laneMesh.scale.set(e.width, e.range, 1); this.laneMat.uniforms.uSize.value.set(e.width, e.range);
    this.placeLane(e.x, e.z, e.angle);
    const r = this.rnd;
    this.dir.set(Math.sin(e.angle), 0, Math.cos(e.angle));
    const at = this.three[0].set(e.x + this.dir.x * 0.9, 0.1, e.z + this.dir.z * 0.9);
    this.burst(at, this.dir, 1.4, 0.3, true); // the blade hits the ground
    this.ring(at, this.up, 0.2, 2.2, 0.35, 0.09);
    this.wave.visible = true; this.wave.rotation.y = e.angle;
    this.waveCore.material.uniforms.uBody.value.setRGB(...this.look.edge); this.waveGlow.material.uniforms.uBody.value.setRGB(...this.look.glow);
    this.onShake?.(0.08, 0.22);
    this.openCrack(e);
    for (let i = 0; i < 14; i++) { // sparks thrown up off the cut line
      const d = 0.6 + r() * (e.range - 0.6), a = r() * 6.283;
      this.spark(e.x + Math.sin(e.angle) * d, e.z + Math.cos(e.angle) * d, Math.cos(a) * 1.5, 2 + r() * 2.5, Math.sin(a) * 1.5, (d / e.range) * WAVE_T);
    }
  }
  // lays out the crack along the lane: a zigzag main fissure and forks off it, plus rubble
  openCrack(e) {
    const C = this.crack, r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), sx = dz, sz = -dx;
    const start = 0.45, len = e.range * 1.05 - start;
    C.t = 0; C.x = e.x; C.z = e.z; C.range = e.range; C.dx = dx; C.dz = dz;
    let off = 0;
    C.main.forEach((m, i) => {
      const along = start + (i / (MAIN_PTS - 1)) * len;
      off = i === 0 ? 0 : Math.max(-0.3, Math.min(0.3, off * 0.4 + (i % 2 ? 1 : -1) * (0.06 + r() * 0.14)));
      m.along = along; m.p.set(e.x + dx * along + sx * off, CRACK_Y, e.z + dz * along + sz * off);
    });
    C.branches.forEach((b, k) => {
      const base = C.main[2 + Math.floor(r() * (MAIN_PTS - 4))], side = k % 2 ? 1 : -1, a = (0.45 + r() * 0.6) * side, L = 0.35 + r() * 0.8;
      const bx = dx * Math.cos(a) + sx * Math.sin(a), bz = dz * Math.cos(a) + sz * Math.sin(a);
      b.at = base.along; b.w = 0.035 + r() * 0.03;
      b.pts.forEach((q, j) => {
        const f = (j / (BRANCH_PTS - 1)) * L, wob = j && j < BRANCH_PTS - 1 ? (r() - 0.5) * 0.12 : 0;
        q.set(base.p.x + bx * f + sx * wob, CRACK_Y, base.p.z + bz * f + sz * wob);
      });
    });
    for (const q of this.rubble) { // chunks of ground thrown up as the crack passes
      const m = C.main[1 + Math.floor(r() * (MAIN_PTS - 2))], a = r() * 6.283, sp = 0.6 + r() * 1.6;
      q.p.copy(m.p); q.p.y = 0.06; q.v.set(Math.cos(a) * sp, 2.2 + r() * 2.6, Math.sin(a) * sp);
      q.delay = (m.along / C.range) * WAVE_T; q.life = -q.delay; q.max = 0.45 + r() * 0.35; q.len = 0.05 + r() * 0.07; q.spin = r() * 6.28; q.rate = (r() - 0.5) * 20;
    }
  }
  drawCrack(dt) {
    const C = this.crack, three = this.three;
    this.crackDark.begin(); this.crackGlow.begin();
    if (C.t < CRACK_HOLD + CRACK_FADE) {
      C.t += dt;
      const front = 0.5 + (C.range - 0.5) * Math.min(1, C.t / WAVE_T) + 0.4; // tears open just behind the crescent
      const fade = 1 - THREE.MathUtils.smoothstep(C.t, CRACK_HOLD, CRACK_HOLD + CRACK_FADE), hot = Math.max(0, 1 - C.t / 0.55);
      // main fissure, cut at the front with the last point slid along
      const v = this.view; v.length = 0;
      for (let i = 0; i < MAIN_PTS; i++) {
        const m = C.main[i];
        if (m.along <= front) { v.push(m.p); continue; }
        if (i > 0) { const a = C.main[i - 1], k = (front - a.along) / (m.along - a.along); v.push(this.tip.copy(a.p).lerp(m.p, k)); }
        break;
      }
      if (v.length > 1) {
        crackW = 0.11; this.crackDark.strip(v, crackTaper, 0.92 * fade, EARTH);
        if (hot > 0) { crackW = 0.2; this.crackGlow.strip(v, crackTaper, hot, this.look.glow); crackW = 0.07; this.crackGlow.strip(v, crackTaper, hot, this.look.edge); }
      }
      // forks grow out once the front has passed their base
      for (const b of C.branches) {
        const g = Math.min(1, (front - b.at) / 0.6); if (g <= 0) continue;
        v.length = 0;
        const n = 1 + g * (BRANCH_PTS - 1), whole = Math.floor(n);
        for (let j = 0; j < Math.min(BRANCH_PTS, whole); j++) v.push(b.pts[j]);
        if (whole < BRANCH_PTS) v.push(this.tip.copy(b.pts[whole - 1]).lerp(b.pts[whole], n - whole));
        if (v.length < 2) continue;
        crackW = b.w * 1.6; this.crackDark.strip(v, branchTaper, 0.9 * fade, EARTH);
        if (hot > 0) { crackW = b.w * 3; this.crackGlow.strip(v, branchTaper, hot * 0.9, this.look.glow); }
      }
    }
    for (const q of this.rubble) {
      if (q.life >= q.max) continue;
      q.life += dt; if (q.life < 0) continue;
      q.v.y -= 14 * dt; q.p.addScaledVector(q.v, dt); q.spin += q.rate * dt;
      if (q.p.y < 0.05) { q.p.y = 0.05; q.v.set(q.v.x * 0.3, Math.abs(q.v.y) * 0.25, q.v.z * 0.3); }
      const u = q.life / q.max, cx = Math.cos(q.spin) * q.len, cy = Math.sin(q.spin) * q.len;
      three[0].set(q.p.x - cx, q.p.y - cy, q.p.z); three[2].set(q.p.x + cx, q.p.y + cy, q.p.z); three[1].copy(three[0]).lerp(three[2], 0.5);
      crackW = 0.09 * (1 - u * 0.4); this.crackDark.strip(three, branchTaper, 1 - u * u, RUBBLE_COL);
    }
    this.crackDark.end(); this.crackGlow.end();
  }
  // a struck target: its burst goes off when the flying crescent reaches it
  cut(center) { if (this.cuts.length < CUTS) this.cuts.push({ c: center.clone(), done: false }); }
  // a hard burst: a glow that pops, rays (the longest thrown on along dir) and a ring
  burst(pos, dir, size, life, upward = false) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos);
    const [cr, cg, cb] = this.look.edge; b.sp.material.color.setRGB(0.5 + cr * 0.5, 0.5 + cg * 0.5, 0.5 + cb * 0.5);
    b.rays.forEach((ray, k) => {
      if (upward) { const a = r() * 6.283, el = 0.5 + r() * 0.9; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.6 + r() * 0.6); }
      else if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.6, (r() - 0.3) * 0.6, dir.z + (r() - 0.5) * 0.6).normalize(); ray.len = size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  ring(pos, normal, r0, r1, max, w) { if (this.rings.length < 16) this.rings.push({ p: pos.clone(), n: normal.clone(), r0, r1, life: 0, max, w }); }
  spark(x, z, vx, vy, vz, delay) { if (this.sparks.length < 200) this.sparks.push({ p: new THREE.Vector3(x, 0.08, z), v: new THREE.Vector3(vx, vy, vz), life: -delay, max: 0.3, w: 0.03 }); }
  update(dt, hero, facing, bladeBase, bladeTip) {
    this.core.begin(); this.glow.begin();
    const look = this.look, two = this.two, three = this.three, r = this.rnd;
    const W = this.wind;
    if (W) {
      W.t += dt;
      const u = Math.min(1, W.t / W.total);
      this.placeLane(hero.x, hero.z, facing);
      this.laneMat.uniforms.uFill.value = u * u * (3 - 2 * u); this.laneMat.uniforms.uAlpha.value = Math.min(1, W.t / 0.08); this.laneMat.uniforms.uFlash.value = 0;
      // light gathering along the raised blade
      two[0].copy(bladeBase); two[1].copy(bladeTip);
      stripW = 0.05 + 0.12 * u;
      this.glow.strip(two, lineGlowW, 0.3 + 0.7 * u, look.glow); this.core.strip(two, lineW, 0.2 + 0.6 * u, look.edge);
      if (r() < dt * 30 * u) {
        const k = r(), a = r() * 6.283;
        three[0].copy(bladeBase).lerp(bladeTip, k);
        const sx = three[0].x + Math.cos(a) * 0.45, sy = three[0].y + (r() - 0.5) * 0.6, sz = three[0].z + Math.sin(a) * 0.45;
        if (this.sparks.length < 200) this.sparks.push({ p: new THREE.Vector3(sx, sy, sz), v: new THREE.Vector3((three[0].x - sx) * 7, (three[0].y - sy) * 7, (three[0].z - sz) * 7), life: 0, max: 0.14, w: 0.02 });
      }
    }
    const S = this.strikeAt;
    if (S) {
      S.t += dt;
      const k = S.t / (WAVE_T + FADE);
      if (k >= 1) { this.strikeAt = null; this.cuts.length = 0; this.wave.visible = false; if (!this.wind) this.lane.visible = false; }
      else {
        this.laneMat.uniforms.uFill.value = 1; this.laneMat.uniforms.uFlash.value = Math.max(0, 1 - S.t / 0.2);
        this.laneMat.uniforms.uAlpha.value = 1 - THREE.MathUtils.smoothstep(S.t, WAVE_T, WAVE_T + FADE);
        this.dir.set(Math.sin(S.angle), 0, Math.cos(S.angle)); this.side.set(this.dir.z, 0, -this.dir.x);
        const front = Math.min(1, S.t / WAVE_T), d = 0.5 + (S.range - 0.5) * front;
        // the cut line opening in the ground behind the wave
        two[0].set(S.x + this.dir.x * 0.5, 0.04, S.z + this.dir.z * 0.5); two[1].set(S.x + this.dir.x * d, 0.04, S.z + this.dir.z * d);
        const fade = 1 - THREE.MathUtils.smoothstep(S.t, WAVE_T, WAVE_T + FADE);
        stripW = 0.12 * (0.4 + 0.6 * fade);
        this.glow.strip(two, lineGlowW, fade, look.glow); this.core.strip(two, lineW, fade, look.edge);
        // the vertical crescent flying down the lane, fading out past its end
        const fly = Math.min(1, S.t / WAVE_T), wf = S.t < WAVE_T ? 0 : Math.min(1, (S.t - WAVE_T) / 0.12);
        this.wave.visible = wf < 1;
        place(this.wave, S.x + this.dir.x * (0.2 + (S.range - 0.6) * fly - 0.9), 0.95, S.z + this.dir.z * (0.2 + (S.range - 0.6) * fly - 0.9));
        const sc = 0.85 + 0.25 * fly; this.wave.scale.set(sc, sc, sc);
        this.waveCore.material.uniforms.uFade.value = wf; this.waveGlow.material.uniforms.uFade.value = wf;
        // each struck target bursts as the crescent's front reaches it
        for (const c of this.cuts) {
          if (c.done) continue;
          const along = (c.c.x - S.x) * this.dir.x + (c.c.z - S.z) * this.dir.z;
          if (S.t >= Math.max(0, (along - 0.3) / (S.range - 0.6)) * WAVE_T) { c.done = true; this.burst(c.c, this.dir, 1.0, 0.28); this.ring(c.c, this.dir, 0.15, 0.9, 0.25, 0.05); this.onShake?.(0.04, 0.1); }
        }
      }
    }
    // bursts: the glow pops and fades; the rays shoot out, then thin from the centre outward
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), look.glow); this.core.strip(three, taperW, 1 - k * k, look.edge);
      }
    }
    // rings: thin circles of light expanding (on the ground, or around the cut direction)
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u));
      this.u.set(g.n.y, g.n.z, g.n.x).cross(g.n).normalize(); this.v.crossVectors(g.n, this.u).normalize();
      const sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].copy(g.p).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]); }
      stripW = g.w * (1 - u * 0.6);
      this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), look.glow); this.core.strip(sub, lineW, 1 - u, look.edge);
    }
    compact(this.rings, this.ringAlive);
    compact(this.cuts, this.cutAlive);
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life < 0) continue;
      s.v.y -= 10 * dt; s.p.addScaledVector(s.v, dt);
      const u = s.life / s.max;
      if (u >= 1) continue;
      three[0].copy(s.p).addScaledVector(s.v, -0.03); three[1].copy(s.p).lerp(three[0], 0.5); three[2].copy(s.p);
      stripW = s.w; stripU = u;
      this.glow.strip(three, sparkGlowW, 0.6 * (1 - u), look.glow); this.core.strip(three, sparkCoreW, 1 - u * u, look.spark);
    }
    compact(this.sparks, this.sparkAlive);
    this.core.end(); this.glow.end();
    this.drawCrack(dt);
  }
  clear() { this.crack.t = 9; for (const q of this.rubble) q.life = q.max; this.crackDark.begin(); this.crackDark.end(); this.crackGlow.begin(); this.crackGlow.end();
    this.wind = null; this.strikeAt = null; this.lane.visible = false; this.wave.visible = false; this.cuts.length = 0; this.sparks.length = 0; this.rings.length = 0; for (const b of this.bursts) { b.t = 9; b.sp.visible = false; } }
  get busy() { return !!this.wind || !!this.strikeAt || this.crack.t < CRACK_HOLD + CRACK_FADE || this.cuts.length > 0 || this.sparks.length > 0; }
}
