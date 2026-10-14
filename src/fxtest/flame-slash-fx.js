// Flame Wave Slash (bench): the fusion of Slash and Firebolt.
// Charge: flame wisps spiral onto the blade, which heats from a faint orange line to a white-hot
// edge wrapped in licking flame, with embers rising off it as the charge fills.
// Release: (the slash crescent is drawn by SlashFx with a fire rim) a crescent of fire travels
// with the rules' projectile: a hot front edge, an orange body and red tongues streaming back,
// widening as it goes and burning away at the end of its range, shedding embers.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE } from './fx-common.js';

const HOT = [1.0, 0.85, 0.42], MID = [1.0, 0.52, 0.14], RED = [0.85, 0.22, 0.08];
const mixc = (a, b, k, o) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
const STRIP_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard; vec3 c = d < 0.42 ? mix(vT, vec3(1.0,0.97,0.85), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.2)*0.65; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const WAVE_FS = `varying vec2 vUv; uniform float uT; uniform float uLife; uniform float uSeed; ${NOISE}
  void main(){
    float s = vUv.x, v = vUv.y;                        // s along the crescent, v 0 back .. 1 front edge
    float ends = pow(sin(3.14159265 * s), 0.7);
    // tongues stream back from the front edge; noise scrolls backward as the wave moves
    float n = fbm(vec2(s * 7.0 + uSeed, v * 2.2 + uT * 5.0));
    float reach = ends * (0.7 + 0.5 * n) * (1.0 - uLife * 0.5);
    float back = 1.0 - reach;
    if (v < back) discard;
    float b = (v - back) / max(reach, 1e-3);          // 0 tongue tips .. 1 front edge
    // burn away at the end of the range
    if (fbm(vec2(s * 5.0 - uSeed, v * 3.0)) < uLife * 1.15 - 0.25 + (1.0 - b) * 0.35 * uLife) discard;
    vec3 c = vec3(0.85, 0.2, 0.07);
    c = mix(c, vec3(1.0, 0.5, 0.13), step(0.3, b));
    c = mix(c, vec3(1.0, 0.82, 0.38), step(0.62, b));
    c = mix(c, vec3(1.0, 0.97, 0.85), step(0.86, b) * step(b, 0.97));
    c = mix(c, vec3(0.5, 0.08, 0.04), step(0.97, b));  // thin same-hue edge line
    gl_FragColor = vec4(c, 1.0); }`;

function crescent(arc, r0, r1, segs = 64, rings = 8) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = -arc / 2 + u * arc;
    for (let j = 0; j <= rings; j++) { const v = j / rings, r = r0 + (r1 - r0) * v; pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, v); }
  }
  const row = rings + 1;
  for (let i = 0; i < segs; i++) for (let j = 0; j < rings; j++) { const a = i * row + j, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class FlameSlashFx {
  constructor(scene, camera) {
    this.scene = scene;
    this.core = new Ribbon(scene, camera, 5000, STRIP_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.light = new THREE.PointLight('#ff8a3a', 0, 2.5, 2); scene.add(this.light);
    // the travelling wave: radius R, the front edge sits on the projectile
    this.R = 1.6;
    this.waveGeo = crescent((105 * Math.PI) / 180, this.R - 1.5, this.R);
    this.waves = Array.from({ length: 3 }, (_, k) => {
      const m = new THREE.Mesh(this.waveGeo, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uLife: { value: 0 }, uSeed: { value: k * 9.1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: WAVE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 6; scene.add(m);
      return { m, id: null };
    });
    this.wisps = []; this.embers = []; this.charge = null; this.rnd = mulberry32(57); this.t = 0;
    this.col = [0, 0, 0]; this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }
  beginCharge(total) {
    this.charge = { t: 0, total };
    const r = this.rnd;
    for (let i = 0; i < 22; i++) {
      this.wisps.push({ along: 0.15 + r() * 0.85, th: r() * 6.283, el: (r() - 0.3) * 1.2, rad: 0.6 + r() * 0.5, spin: (r() < 0.5 ? -1 : 1) * (1 + r() * 0.8),
        delay: r() * total * 0.7, dur: 0.28 + r() * 0.2, t: 0, w: 0.09 * (0.7 + r() * 0.6), pts: Array.from({ length: 9 }, () => new THREE.Vector3()) });
    }
  }
  release() { this.charge = null; this.wisps = []; }
  cancel() { this.release(); }
  // base/tip: the blade this frame. projectiles: the rules' live projectiles (the wave is kind waveKind)
  update(dt, base, tip, projectiles, waveKind) {
    this.t += dt;
    const r = this.rnd;
    this.core.begin(); this.glow.begin();
    let light = 0;
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      const k = Math.min(1, ch.t / ch.total), heat = k * k * (3 - 2 * k);
      // the blade heats: a strip along the sword that widens and whitens, flickering
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push(this._a.copy(base).lerp(tip, i / 8).clone());
      const flick = 0.85 + 0.15 * Math.sin(this.t * 37) * Math.sin(this.t * 23);
      mixc(RED, HOT, heat, this.col);
      this.glow.strip(pts, (x) => (0.08 + 0.22 * heat) * Math.sin(Math.PI * (0.1 + 0.9 * x)) * flick, 0.25 + 0.4 * heat, RED);
      this.core.strip(pts, (x) => (0.03 + 0.1 * heat) * Math.sin(Math.PI * (0.05 + 0.95 * x)), 0.3 + 0.7 * heat, this.col);
      // flame tongues licking up off the blade once it is hot
      if (heat > 0.35 && r() < dt * 40 * heat) {
        const p = this._a.copy(base).lerp(tip, 0.2 + r() * 0.8);
        this.embers.push({ p: p.clone(), v: new THREE.Vector3((r() - 0.5) * 0.6, 1.2 + r() * 1.2, (r() - 0.5) * 0.6), age: 0, life: 0.25 + r() * 0.2, w: 0.05 + r() * 0.05 * heat, hist: [], tongue: true });
      }
      light = 0.3 + 1.2 * heat;
      this.light.position.copy(tip);
      // wisps spiral onto points along the blade
      for (const w of this.wisps) {
        w.t += dt;
        const e = (w.t - w.delay) / w.dur;
        if (e < 0) continue;
        if (e >= 1) { w.done = true; continue; }
        const target = this._b.copy(base).lerp(tip, w.along);
        const n = Math.max(2, Math.min(9, 1 + Math.ceil((e / 0.35) * 8)));
        for (let j = 0; j < n; j++) {
          const q = Math.max(0, e - (j / 8) * 0.35), ease = q * q * (3 - 2 * q);
          const rad = w.rad * (1 - ease), th = w.th + w.spin * ease, el = w.el * (1 - ease * 0.6);
          w.pts[j].set(target.x + Math.cos(th) * Math.cos(el) * rad, target.y + Math.sin(el) * rad * 0.8, target.z + Math.sin(th) * Math.cos(el) * rad);
        }
        if (n < 6) continue;
        const fade = Math.min(1, Math.max(0, (e - 0.12) / 0.25));
        const prof = (x) => Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * x)), 0.8) * (1 - 0.35 * x);
        mixc(MID, HOT, e, this.col);
        const seg = w.pts.slice(0, n);
        this.glow.strip(seg, (x) => w.w * 2.4 * prof(x), fade * 0.8, this.col);
        this.core.strip(seg, (x) => w.w * prof(x), fade, this.col);
      }
      this.wisps = this.wisps.filter((w) => !w.done);
      if (ch.t > ch.total + 0.1) this.release();
    }
    // the wave follows the rules' projectile
    const live = new Set();
    for (const pr of projectiles) {
      if (pr.kind !== waveKind) continue;
      live.add(pr.id);
      const w = this.waves.find((q) => q.id === pr.id) || this.waves.find((q) => q.id === null);
      if (!w) continue;
      w.id = pr.id;
      const life = Math.min(1, pr.travelled / pr.range), grow = 1 + 0.45 * life;
      const dx = Math.sin(pr.angle), dz = Math.cos(pr.angle);
      w.m.visible = true;
      w.m.scale.set(grow, 1, 0.9 + 0.3 * life);
      w.m.position.set(pr.x - dx * this.R, 0.85, pr.z - dz * this.R);
      w.m.rotation.set(0, pr.angle, 0);
      w.m.material.uniforms.uT.value = this.t; w.m.material.uniforms.uLife.value = Math.max(0, (life - 0.6) / 0.4);
      light = Math.max(light, 1.5 * (1 - life));
      if (light >= 1.5 * (1 - life)) this.light.position.set(pr.x, 1.2, pr.z);
      // embers shed off the back of the wave
      for (let i = 0; i < 2; i++) {
        const a = (r() - 0.5) * 1.6 * grow * 0.8, rr = this.R - 0.2 - r() * 0.6;
        const ca = Math.cos(a), sa = Math.sin(a);
        this.embers.push({ p: new THREE.Vector3(w.m.position.x + (dx * ca + dz * sa) * rr, 0.85 + (r() - 0.3) * 0.3, w.m.position.z + (dz * ca - dx * sa) * rr),
          v: new THREE.Vector3((r() - 0.5) * 1.2 - dx * 1.5, 0.6 + r() * 1.2, (r() - 0.5) * 1.2 - dz * 1.5), age: 0, life: 0.3 + r() * 0.3, w: 0.02 + r() * 0.015, hist: [] });
      }
    }
    for (const w of this.waves) if (w.id !== null && !live.has(w.id)) { w.id = null; w.m.visible = false; }
    this.light.intensity = light;
    // embers and tongues
    for (const m of this.embers) {
      m.age += dt; m.v.multiplyScalar(1 - 3 * dt); m.v.y += (m.tongue ? 1.5 : 0.8) * dt; m.p.addScaledVector(m.v, dt);
      m.hist.unshift(m.p.clone()); if (m.hist.length > 6) m.hist.pop();
    }
    this.embers = this.embers.filter((m) => m.age < m.life);
    for (const m of this.embers) {
      if (m.hist.length < 2) continue;
      const u = m.age / m.life;
      mixc(u < 0.4 ? HOT : MID, u < 0.4 ? MID : RED, u < 0.4 ? u / 0.4 : (u - 0.4) / 0.6, this.col);
      const a = 1 - u * u;
      this.glow.strip(m.hist, (x) => m.w * 2.6 * (1 - x * 0.6), a * 0.6, this.col);
      this.core.strip(m.hist, (x) => m.w * (1 - x) * (m.tongue ? 1.4 : 1), a, this.col);
    }
    this.core.end(); this.glow.end();
  }
  clear() { this.release(); this.embers = []; for (const w of this.waves) { w.id = null; w.m.visible = false; } this.light.intensity = 0; }
}
