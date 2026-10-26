// Thunderstorm, in the FX bench's light-and-ribbon language (owner, 2026-10-26: the effects made on
// the bench are the reference; Chain Spark's thin angular crackling bolts in particular) and sized for
// a job skill (11 s cooldown): it fills the hit area wave after wave and ends on a big strike.
//   Gather: a thin double ring of light marks the circle, a faint crackle running round it.
//   Each wave ('burst'): two thin angular bolts come down from the sky inside the circle, re-jagging
//   every few frames (crackle) with a fork, each landing in a ragged flash, a glow pop, a few rays
//   and spark streaks; the ring flares.
//   Last wave: one big bolt at the centre with a large flash, more rays, a shock ring and little stars.
// No cloud mesh: from the game camera a cloud overhead would hide the circle and the monsters'
// wind-ups. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, place, placeV } from './fx-common.js';
import { GLOW_FS, lightOf, glowTexture, starTexture, lightSprite, W, lineW, lineGlowW, taperW, taperGlowW, circlePoints, drawSparks, spark } from './light-kit.js';

const SLOTS = 2, BOLTS = 8, POPS = 8, FLASHES = 8, STARS = 8, SPARKS = 260, RING = 56, SKY_Y = 11, SKY_BACK = 3.5, LIFE = 0.24;
// Chain Spark's crackling core: a white centre with a ragged edge
const CRACKLE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  float h(float x){ return fract(sin(x*127.1)*43758.5453); }
  void main(){ float d=abs(vUv.y); float n = h(floor(vUv.x*60.0)) * 0.25;
    if(d > 0.92 - n) discard; vec3 c = d < 0.42 - n*0.5 ? vec3(1.0) : vT; gl_FragColor=vec4(c, vA); }`;
let boltW = 0;
const boltCoreW = (x) => boltW * Math.min(1, x * 8, (1 - x) * 3 + 0.3), boltGlowW = (x) => boltCoreW(x) * 3;

export class ThunderFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(31); this.time = 0; this.timers = []; this.sparks = []; this.free = [];
    this.core = new Ribbon(scene, camera, 5000, CRACKLE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.look = lightOf('lightning');
    this.slots = Array.from({ length: SLOTS }, () => ({ live: false, t: 0, end: 0, x: 0, z: 0, radius: 3, waves: 0, struck: 0, flare: 0, finalAt: -1 }));
    this.bolts = Array.from({ length: BOLTS }, () => ({ live: false, t: 0, w: 0.07, seed: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), main: Array.from({ length: 11 }, () => new THREE.Vector3()), fork: Array.from({ length: 5 }, () => new THREE.Vector3()) }));
    this.pops = Array.from({ length: POPS }, () => ({ sp: lightSprite(scene, glowTexture('lightning'), true, 9), t: 9, size: 1, p: new THREE.Vector3(), rays: Array.from({ length: 6 }, () => ({ d: new THREE.Vector3(), len: 1 })) }));
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => { const m = new THREE.Mesh(quad, flashMaterial(3 + k * 1.9)); tintFlash(m.material, 'lightning'); m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); return { m, t: 9, size: 1.4 }; });
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, starTexture('lightning'), false, 10), p: new THREE.Vector3(), t: 9 }));
    this.popI = 0; this.flashI = 0; this.starI = 0;
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3()); this.arc = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
  }
  // core 'area' of one wave: the first gathers the storm; each one counts a wave
  begin(e) {
    let s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) { s = this.slots.find((q) => !q.live) || this.slots[0]; Object.assign(s, { live: true, t: 0, end: 0, x: e.x, z: e.z, radius: e.radius, waves: 0, struck: 0, flare: 0, finalAt: -1 }); }
    s.waves++; s.end = Math.max(s.end, s.t + e.delay + 0.6);
  }
  bolt(s, x, z, w, big) {
    const b = this.bolts.find((q) => !q.live) || this.bolts[0], r = this.rnd;
    b.live = true; b.t = 0; b.w = w; b.seed = Math.floor(r() * 1e6);
    b.from.set(x + (r() - 0.5) * 2, SKY_Y, z - SKY_BACK + (r() - 0.5) * 1.5); b.to.set(x, 0.05, z);
    // the landing: a ragged flash, a glow pop with rays, sparks
    const f = this.flashes[this.flashI++ % FLASHES]; f.t = 0; f.size = big ? 3.4 : 1.6; place(f.m, x, 0.7, z);
    const pop = this.pops[this.popI++ % POPS]; pop.t = 0; pop.size = big ? s.radius * 1.4 : 1.8; pop.p.set(x, 0.5, z);
    pop.rays.forEach((ray) => { const a = r() * 6.283, el = 0.5 + r() * 0.9; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = (big ? 2.6 : 1.1) * (0.6 + r() * 0.6); });
    for (let i = 0; i < (big ? 36 : 14); i++) { const a = r() * 6.283, sp = 2 + r() * (big ? 6 : 3.5); this.p.set(x, 0.15, z); this.v.set(Math.cos(a) * sp, 1.5 + r() * 3, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.2 + r() * 0.2, 0.04, this.look); }
    if (big) for (let i = 0; i < STARS; i++) { const st = this.stars[this.starI++ % STARS], a = r() * 6.283, d = s.radius * (0.2 + r() * 0.6); st.t = -r() * 0.25; st.p.set(x + Math.cos(a) * d, 0.8 + r() * 1.5, z + Math.sin(a) * d); }
    s.flare = 1;
  }
  // core 'burst' of one wave
  strike(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.struck++;
    const r = this.rnd;
    if (s.struck >= s.waves) { this.bolt(s, s.x, s.z, 0.16, true); s.finalAt = s.t; return; }
    for (let n = 0; n < 2; n++) { const a = r() * 6.283, d = Math.sqrt(r()) * s.radius * 0.8; this.timers.push({ at: this.time + n * 0.07, s, x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d }); }
  }
  // re-jag a bolt's points from its seed (a new seed every few frames is the crackle)
  shape(b, seed) {
    let a = seed | 0; const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = b.main.length;
    for (let i = 0; i < n; i++) { const u = i / (n - 1), j = i === 0 || i === n - 1 ? 0 : (i % 2 ? 1 : -1) * (0.25 + 0.4 * r()) * Math.sin(Math.PI * Math.min(1, u * 1.15)); b.main[i].lerpVectors(b.from, b.to, u); b.main[i].x += j; b.main[i].z += (r() - 0.5) * 0.25; }
    const k = 4 + Math.floor(r() * 3), fa = r() * 6.283;
    for (let i = 0; i < b.fork.length; i++) { const u = i / (b.fork.length - 1); b.fork[i].copy(b.main[k]); b.fork[i].x += Math.cos(fa) * 1.6 * u + (i % 2 ? 0.2 : -0.2) * u; b.fork[i].y -= 1.8 * u; b.fork[i].z += Math.sin(fa) * 1.6 * u; }
  }
  update(dt) {
    this.time += dt;
    let w = 0; for (const q of this.timers) { if (this.time >= q.at) this.bolt(q.s, q.x, q.z, 0.08, false); else this.timers[w++] = q; } this.timers.length = w;
    this.core.begin(); this.glow.begin();
    const L = this.look;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt; s.flare = Math.max(0, s.flare - dt / 0.2);
      const open = Math.min(1, s.t / 0.15) * (1 - THREE.MathUtils.smoothstep(s.t, s.end - 0.3, s.end));
      circlePoints(this.ring, s.x, s.z, s.radius);
      W.v = 0.05 + 0.04 * s.flare; this.glow.strip(this.ring, lineGlowW, (0.6 + 0.4 * s.flare) * open, L.glow); this.core.strip(this.ring, lineW, open, L.edge);
      circlePoints(this.ring, s.x, s.z, s.radius * 0.62);
      W.v = 0.03; this.glow.strip(this.ring, lineGlowW, 0.5 * open, L.glow); this.core.strip(this.ring, lineW, 0.7 * open, L.edge);
      // a crackle running round the ring
      const a0 = s.t * 3.2; circlePoints(this.arc, s.x, s.z, s.radius, 0.08, a0, a0 + 0.55);
      for (let i = 1; i < this.arc.length - 1; i++) this.arc[i].y += (i % 2 ? 0.12 : -0.02);
      W.v = 0.035; this.glow.strip(this.arc, lineGlowW, open, L.glow); this.core.strip(this.arc, lineW, open, L.edge);
      if (s.finalAt >= 0) { const k = Math.min(1, (s.t - s.finalAt) / 0.4); if (k < 1) { circlePoints(this.ring, s.x, s.z, s.radius * 1.1 * (1 - Math.pow(1 - k, 2)) + 0.2, 0.06); W.v = 0.09 * (1 - k * 0.7); this.glow.strip(this.ring, lineGlowW, 1 - k, L.glow); this.core.strip(this.ring, lineW, 1 - k * k, L.edge); } }
      if (s.t >= s.end) s.live = false;
    }
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.t += dt; const k = b.t / LIFE;
      if (k >= 1) { b.live = false; continue; }
      this.shape(b, b.seed + Math.floor(b.t / 0.045)); // crackle
      const a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      boltW = b.w; this.glow.strip(b.main, boltGlowW, a, L.glow); this.core.strip(b.main, boltCoreW, a, L.edge);
      boltW = b.w * 0.6; this.glow.strip(b.fork, boltGlowW, a * 0.8, L.glow); this.core.strip(b.fork, boltCoreW, a, L.edge);
    }
    for (const f of this.flashes) {
      f.t += dt; const k = f.t / 0.2; f.m.visible = k < 1;
      if (f.m.visible) { f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(f.size * (1 + k * 0.8)); f.m.material.uniforms.uT.value = k; }
    }
    for (const pop of this.pops) {
      pop.t += dt; const k = pop.t / 0.3; pop.sp.visible = k < 1;
      if (!pop.sp.visible) continue;
      placeV(pop.sp, pop.p); pop.sp.scale.setScalar(pop.size * (0.8 + 0.6 * Math.sqrt(k))); pop.sp.material.opacity = 1 - k * k;
      for (const ray of pop.rays) { this.two[0].copy(pop.p).addScaledVector(ray.d, ray.len * 0.2 * k); this.two[1].copy(pop.p).addScaledVector(ray.d, ray.len * (0.4 + 0.6 * Math.sqrt(k))); W.v = 0.1 * (1 - k); this.glow.strip(this.two, taperGlowW, 1 - k, L.glow); this.core.strip(this.two, taperW, 1 - k * k, L.edge); }
    }
    for (const st of this.stars) {
      st.t += dt; const k = st.t / 0.45; st.sp.visible = k > 0 && k < 1;
      if (st.sp.visible) { placeV(st.sp, st.p); st.sp.scale.setScalar(0.45 * Math.sin(Math.PI * k)); st.sp.material.rotation = k * 2; }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 10);
    this.core.end(); this.glow.end();
  }
  clear() { this.timers.length = 0; for (const s of this.slots) s.live = false; for (const b of this.bolts) b.live = false; for (const f of this.flashes) { f.t = 9; f.m.visible = false; } for (const p of this.pops) { p.t = 9; p.sp.visible = false; } for (const st of this.stars) { st.t = 9; st.sp.visible = false; } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.timers.length > 0 || this.sparks.length > 0 || this.slots.some((s) => s.live) || this.bolts.some((b) => b.live); }
}
