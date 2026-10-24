// Flame Wave Slash (bench): its own look; none of Slash's or Firebolt's effects are reused except
// fire sparks.
// Charge: the sword itself heats, from dull red to glowing red-orange metal (its own materials
// are tinted, then cool back after the cut), with heat embers rising off the blade and a few
// flame wisps drawn onto it.
// Release: a clean half-moon of fire travels with the rules' projectile: a smooth front arc and
// a smooth inner arc meeting in two sharp points, fire flowing inside it in flat cel bands
// (white-hot front rim, yellow, orange, red), short tongues flicking off its back edge, a soft
// glow around it; it widens as it goes and burns away from the back at the end of its range.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE } from '../render/skillfx/fx-common.js';

const HOT = [1.0, 0.85, 0.42], MID = [1.0, 0.52, 0.14], RED = [0.85, 0.22, 0.08];
const mixc = (a, b, k, o) => { o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k; return o; };
const STRIP_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard; vec3 c = d < 0.42 ? mix(vT, vec3(1.0,0.97,0.85), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.2)*0.65; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// s: 0..1 along the arc; v: 0 inner (toward the caster) .. 1 front edge
const SHAPE = `uniform float uT; uniform float uLife; uniform float uSeed; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uLine; uniform vec3 uTongue; uniform vec3 uGlow; ${NOISE}
  float thick(float s){ return 0.62 * pow(sin(3.14159265 * clamp(s, 0.0, 1.0)), 0.75); }`;
const WAVE_FS = `varying vec2 vUv; ${SHAPE}
  void main(){
    float s = vUv.x, v = vUv.y;
    float t = thick(s);
    float inner = 1.0 - t;                            // the clean inner arc
    // short flame tongues flick off the back edge, flowing backward
    float tn = fbm(vec2(s * 10.0 + uSeed, uT * 6.0));
    float tongue = t * 0.45 * smoothstep(0.45, 0.8, tn);
    if (v < inner - tongue) discard;
    float b = (v - inner) / max(t, 1e-3);             // 0 inner arc .. 1 front arc (<0 in a tongue)
    // burn away from the back at the end of the range
    float burn = fbm(vec2(s * 6.0 - uSeed, v * 4.0));
    if (burn < uLife * 1.2 - 0.2 + (1.0 - clamp(b, 0.0, 1.0)) * 0.5 * uLife) discard;
    // fire flowing inside: bands bent by noise that scrolls back from the front
    float flow = fbm(vec2(s * 5.0 + uSeed * 0.3, b * 2.0 + uT * 4.0)) - 0.5;
    float h = clamp(b, 0.0, 1.0) + flow * 0.35;
    vec3 c = uC0;
    c = mix(c, uC1, step(0.28, h));
    c = mix(c, uC2, step(0.55, h));
    c = mix(c, uC3, step(0.8, h));
    if (b < 0.0) c = uTongue;                        // tongues
    // thin dark-red line along the front arc and the inner arc
    float aa = fwidth(b) * 1.5;
    c = mix(c, uLine, smoothstep(1.0 - 0.035 - aa, 1.0 - 0.035, b));
    c = mix(c, uLine * 1.2, (1.0 - smoothstep(0.0, 0.03 + aa, b)) * step(0.0, b) * 0.8);
    float alpha = (b < 0.0 ? 0.85 : 1.0) * (1.0 - smoothstep(0.995 - aa, 1.0, b));
    gl_FragColor = vec4(c, alpha); }`;
const WAVE_GLOW_FS = `varying vec2 vUv; ${SHAPE}
  void main(){
    float s = vUv.x, v = vUv.y, t = thick(s) * 1.35 + 0.05;
    float b = (v - (1.0 - t)) / max(t, 1e-3);
    if (b < 0.0) discard;
    float g = smoothstep(0.0, 0.7, b) * (1.0 - smoothstep(0.85, 1.0, b)) * (1.0 - uLife);
    gl_FragColor = vec4(uGlow * g * 0.55, 1.0); }`;

// the crescent's surface: arc `arc` around the origin, from radius r0 (inner) to r1 (front)
function crescent(arc, r0, r1, segs = 72, rings = 10) {
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
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// per element: wave bands (back to front), edge line, tongues, glow; blade heat (cool, dull, glow, peak); ember colours
const LOOKS = {
  fire: { bands: ['#c7290f', '#ff6b1a', '#ffb840', '#fff2c0'], line: '#731008', tongue: '#e64d14', glow: '#ff731f',
    blade: ['#2a0400', '#8a1a04', '#ff5a14', '#ffb060'], hot: HOT, mid: MID, red: RED },
  cold: { bands: ['#2f6fb8', '#6cb4ee', '#bfe6ff', '#ffffff'], line: '#163f73', tongue: '#7cc4f2', glow: '#6fbfff',
    blade: ['#03101f', '#1d4f80', '#7cc8ff', '#e6f6ff'], hot: [0.9, 0.97, 1.0], mid: [0.6, 0.85, 1.0], red: [0.3, 0.55, 0.9] },
};
const look = (el) => LOOKS[el] || LOOKS.fire;

export class FlameSlashFx {
  constructor(scene, camera) {
    this.scene = scene;
    this.core = new Ribbon(scene, camera, 4000, STRIP_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.light = new THREE.PointLight('#ff6a2a', 0, 2.5, 2); scene.add(this.light);
    this.R = 1.8; // the front edge sits on the projectile; the half-moon spans 150 degrees
    const geo = crescent((150 * Math.PI) / 180, this.R - 1.3, this.R);
    this.waves = Array.from({ length: 3 }, (_, k) => {
      const L = LOOKS.fire, col = (c) => ({ value: new THREE.Color(c) });
      const uniforms = { uT: { value: 0 }, uLife: { value: 0 }, uSeed: { value: k * 9.1 }, uC0: col(L.bands[0]), uC1: col(L.bands[1]), uC2: col(L.bands[2]), uC3: col(L.bands[3]), uLine: col(L.line), uTongue: col(L.tongue), uGlow: col(L.glow) };
      const fire = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: WAVE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      const halo = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: WAVE_GLOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.06); halo.position.y = -0.01;
      fire.renderOrder = 6; halo.renderOrder = 5;
      const g = new THREE.Group(); g.add(halo, fire); g.visible = false; scene.add(g);
      for (const m of [fire, halo]) m.frustumCulled = false;
      return { g, uniforms, id: null };
    });
    this.wisps = []; this.embers = []; this.charge = null; this.heat = 0; this.blade = null; this.rnd = mulberry32(57); this.t = 0;
    this.col = [0, 0, 0]; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Color();
  }
  setElement(element) {
    const L = look(element);
    this.look = L; this.bladeCols = L.blade.map((c) => new THREE.Color(c));
    for (const w of this.waves) {
      const u = w.uniforms;
      L.bands.forEach((c, i) => u['uC' + i].value.set(c));
      u.uLine.value.set(L.line); u.uTongue.value.set(L.tongue); u.uGlow.value.set(L.glow);
    }
    this.light.color.set(L.glow);
  }
  beginCharge(total, element = 'fire') {
    this.setElement(element);
    this.charge = { t: 0, total };
    const r = this.rnd;
    for (let i = 0; i < 12; i++) {
      this.wisps.push({ along: 0.2 + r() * 0.8, th: r() * 6.283, el: (r() - 0.3) * 1.2, rad: 0.55 + r() * 0.4, spin: (r() < 0.5 ? -1 : 1) * (1 + r() * 0.8),
        delay: r() * total * 0.7, dur: 0.3 + r() * 0.2, t: 0, w: 0.07 * (0.7 + r() * 0.6), pts: Array.from({ length: 9 }, () => new THREE.Vector3()) });
    }
  }
  release() { this.charge = null; this.wisps = []; }
  cancel() { this.release(); }
  // tint the sword's own materials (cloned once, restored when it has cooled)
  heatBlade(weapon, heat) {
    if (weapon !== this.blade?.weapon) { this.restoreBlade(); if (weapon && heat > 0) this.blade = { weapon, mats: [] }; }
    if (!this.blade) return;
    if (!this.blade.mats.length) {
      this.blade.weapon.traverse((o) => {
        if (!o.isMesh || !o.material?.emissive || o.material.side === THREE.BackSide) return;
        const orig = o.material, m = orig.clone(); o.material = m;
        this.blade.mats.push({ o, orig, m, color: orig.color.clone() });
      });
    }
    // dull red -> glowing red-orange -> a little brighter at full heat; the metal itself reddens too
    const [COOL, DULL, GLOW, WHITE] = this.bladeCols || LOOKS.fire.blade.map((c) => new THREE.Color(c));
    if (heat < 0.5) this._c.copy(COOL).lerp(DULL, heat / 0.5); else this._c.copy(DULL).lerp(GLOW, (heat - 0.5) / 0.5).lerp(WHITE, Math.max(0, heat - 0.85) / 0.15 * 0.5);
    const flick = 0.92 + 0.08 * Math.sin(this.t * 31);
    for (const b of this.blade.mats) {
      b.m.emissive.copy(this._c).multiplyScalar(flick);
      b.m.color.copy(b.color).lerp(GLOW, 0.5 * heat);
    }
    if (heat <= 0) this.restoreBlade();
  }
  restoreBlade() {
    if (!this.blade) return;
    for (const b of this.blade.mats) { b.o.material = b.orig; b.m.dispose(); }
    this.blade = null;
  }
  // weapon: the sword object; base/tip: the blade this frame; projectiles: the rules' live projectiles
  update(dt, weapon, base, tip, projectiles, waveKind) {
    this.t += dt;
    const r = this.rnd;
    this.core.begin(); this.glow.begin();
    let light = 0;
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      const k = Math.min(1, ch.t / ch.total);
      this.heat = k * k * (3 - 2 * k);
      if (ch.t > ch.total + 0.1) this.release();
    } else this.heat = Math.max(0, this.heat - dt / 0.8); // cools after the cut
    this.heatBlade(weapon, this.heat);
    if (this.heat > 0) {
      light = 0.2 + 1.2 * this.heat; this.light.position.copy(tip);
      // heat embers rising off the blade
      if (r() < dt * 30 * this.heat) {
        const p = this._a.copy(base).lerp(tip, 0.15 + r() * 0.85);
        this.embers.push({ p: p.clone(), v: new THREE.Vector3((r() - 0.5) * 0.5, 0.8 + r() * 1.0, (r() - 0.5) * 0.5), age: 0, life: 0.35 + r() * 0.3, w: 0.016 + r() * 0.012, hist: [] });
      }
    }
    // a few wisps drawn onto the blade during the charge
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
      mixc((this.look || LOOKS.fire).red, (this.look || LOOKS.fire).mid, e, this.col);
      const seg = w.pts.slice(0, n);
      this.glow.strip(seg, (x) => w.w * 2.2 * prof(x), fade * 0.7, this.col);
      this.core.strip(seg, (x) => w.w * prof(x), fade, this.col);
    }
    this.wisps = this.wisps.filter((w) => !w.done);
    // the half-moon follows the rules' projectile
    const live = new Set();
    for (const pr of projectiles) {
      if (pr.kind !== waveKind) continue;
      live.add(pr.id);
      const w = this.waves.find((q) => q.id === pr.id) || this.waves.find((q) => q.id === null);
      if (!w) continue;
      w.id = pr.id;
      const life = Math.min(1, pr.travelled / pr.range), grow = (1 + 0.35 * life) * (pr.waveScale || 1);
      const dx = Math.sin(pr.angle), dz = Math.cos(pr.angle);
      w.g.visible = true;
      w.g.scale.set(grow, 1, grow);
      w.g.position.set(pr.x - dx * this.R * grow, 0.9, pr.z - dz * this.R * grow);
      w.g.rotation.set(0, pr.angle, 0);
      w.uniforms.uT.value = this.t; w.uniforms.uSeed.value = pr.id * 3.7 % 50; w.uniforms.uLife.value = Math.max(0, (life - 0.65) / 0.35);
      light = Math.max(light, 1.5 * (1 - life));
      if (light >= 1.5 * (1 - life)) this.light.position.set(pr.x, 1.2, pr.z);
      // embers shed off the back of the wave
      for (let i = 0; i < 2; i++) {
        const a = (r() - 0.5) * 2.2, rr = (this.R - 0.4 - r() * 0.6) * grow, ca = Math.cos(a), sa = Math.sin(a);
        this.embers.push({ p: new THREE.Vector3(w.g.position.x + (dx * ca + dz * sa) * rr, 0.9 + (r() - 0.3) * 0.3, w.g.position.z + (dz * ca - dx * sa) * rr),
          v: new THREE.Vector3((r() - 0.5) * 1.2 - dx * 1.2, 0.5 + r() * 1.2, (r() - 0.5) * 1.2 - dz * 1.2), age: 0, life: 0.3 + r() * 0.3, w: 0.018 + r() * 0.012, hist: [] });
      }
    }
    for (const w of this.waves) if (w.id !== null && !live.has(w.id)) { w.id = null; w.g.visible = false; }
    this.light.intensity = light;
    for (const m of this.embers) {
      m.age += dt; m.v.multiplyScalar(1 - 3 * dt); m.v.y += 0.8 * dt; m.p.addScaledVector(m.v, dt);
      m.hist.unshift(m.p.clone()); if (m.hist.length > 6) m.hist.pop();
    }
    this.embers = this.embers.filter((m) => m.age < m.life);
    for (const m of this.embers) {
      if (m.hist.length < 2) continue;
      const u = m.age / m.life;
      const L = this.look || LOOKS.fire;
      mixc(u < 0.4 ? L.hot : L.mid, u < 0.4 ? L.mid : L.red, u < 0.4 ? u / 0.4 : (u - 0.4) / 0.6, this.col);
      const a = 1 - u * u;
      this.glow.strip(m.hist, (x) => m.w * 2.6 * (1 - x * 0.6), a * 0.6, this.col);
      this.core.strip(m.hist, (x) => m.w * (1 - x), a, this.col);
    }
    this.core.end(); this.glow.end();
  }
  clear() { this.release(); this.heat = 0; this.restoreBlade(); this.embers = []; for (const w of this.waves) { w.id = null; w.g.visible = false; } this.light.intensity = 0; }
}
