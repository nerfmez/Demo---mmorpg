// Thunderstorm, held to the bar of the owner's best effects (2026-10-26: Chain Spark's lightning is
// "simple but right"; Firebolt and Flame Stream set the quality): Chain Spark's own angular bolts
// (zig, its crackling white core inside a blue glow, a thinner second bolt, forks, re-jagged 15 times
// a second) and its ragged flash, sized for a job skill (11 s cooldown). Rules in docs/VFX-REFERENCE.md.
//   Warning: the true area, a crisp edge and a plain fill growing to the first strike. High up the
//   sky near the top of the screen (in view under the game's camera) a storm eye wakes: a flickering
//   ragged flash with crackling tendrils round it and a cold light.
//   Each wave ('burst'): bolts leap from the eye down to the monsters in the circle (else to spots in
//   it), staggered; each lands in a ragged flash, flat tendrils crawling over the ground, bouncing
//   sparks and a scorch mark; struck monsters crackle with short arcs.
//   Last wave: a big bolt to the centre with more forks, a large flash and tendrils across the circle;
//   the eye bursts and goes out. No cloud: from the game camera it would hide the circle. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, lookOf, place, placeV, addLight, conformPlane, skyAbove, fxGround, NOISE } from './fx-common.js';
import { CRACKLE_FS, BOLT_GLOW_FS, Rng, zig, rewindPts, zDir, zPerp } from './chain-fx.js';
import { warnDisc } from './anime-kit.js';

const SLOTS = 2, BOLTS = 14, FLASHES = 12, LIGHTS = 3, SCORCH = 10, SPARKS = 320, EYE_H = 11;
const LEAD = 0.05, HOLD = 0.2, FADE = 0.1;
const R1 = new Rng(), R2 = new Rng(), R3 = new Rng();
const pts = [], ws = [], p2 = [], w2 = [], fp = [], fw = [];
let stW = 0, stHalo = 2.4, stWs = null, tdW = 0;
const endK = (x) => Math.min(1, x * 6, (1 - x) * 6);
const strokeGlowW = (x, k) => stW * stHalo * (0.5 + 0.5 * stWs[k]) * Math.max(0.3, endK(x));
const strokeCoreW = (x, k) => stW * stWs[k] * endK(x);
const tendrilGlowW = (x) => tdW * 2.2 * (1 - x * 0.7), tendrilCoreW = (x, k) => tdW * stWs[k] * Math.min(1, (1 - x) * 4);
const sparkPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
let sparkW = 0, sparkU = 0;
const sparkGlowW = () => sparkW * 2.2, sparkCoreW = (x) => sparkW * x * (1 - sparkU * 0.6);
// a scorch mark: patchy soot with a cooling blue-white centre
const SCORCH_VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const SCORCH_FS = `varying vec2 vP; uniform float uA; uniform float uHot; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vP), n = fbm(vP*2.6 + uSeed);
    float soot = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5)*0.5));
    if (soot < 0.05) discard;
    vec3 c = vec3(0.1, 0.1, 0.13);
    float hot = (1.0 - smoothstep(0.0, 0.35, r + (n - 0.5)*0.3)) * uHot;
    c = mix(c, vec3(0.75, 0.92, 1.0), hot);
    gl_FragColor = vec4(c, max(soot*0.55, hot)*uA); }`;

export class ThunderFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(31); this.time = 0;
    this.glow = new Ribbon(scene, camera, 9000, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.core = new Ribbon(scene, camera, 9000, CRACKLE_FS, THREE.NormalBlending);
    this.glow.mesh.renderOrder = 7; this.core.mesh.renderOrder = 8;
    this.look = { ...lookOf('lightning'), element: 'lightning' };
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => { const m = new THREE.Mesh(quad, flashMaterial(5.1 + k * 3.7)); tintFlash(m.material, 'lightning'); m.renderOrder = 9; m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
    this.lights = Array.from({ length: LIGHTS }, () => addLight(scene, new THREE.PointLight('#c8e8ff', 0, 6, 2)));
    this.scorch = Array.from({ length: SCORCH }, (_, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 6, 6), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uHot: { value: 0 }, uSeed: { value: k * 3.1 } }, vertexShader: SCORCH_VS, fragmentShader: SCORCH_FS, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return { m, t: 9, size: 1 };
    });
    this.scorchI = 0;
    this.slots = Array.from({ length: SLOTS }, () => ({ live: false, t: 0, end: 0, first: 9, x: 0, z: 0, radius: 3, waves: 0, struck: 0, pulse: 0, outAt: -1, eye: new THREE.Vector3(), warn: warnDisc(scene, 'lightning') }));
    this.bolts = Array.from({ length: BOLTS }, () => ({ live: false, t: 0, w: 0.17, seed: 0, big: false, landed: false, slot: null, a: new THREE.Vector3(), b: new THREE.Vector3(), hit: -1 }));
    this.arcs = []; // shocked monsters: { x, z, t }
    this.sparks = []; this.sparkFree = [];
    this.flashI = 0; this.lightI = 0;
    this.p = new THREE.Vector3(); this.q = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.perp = new THREE.Vector3();
  }
  // core 'area' of each wave: the storm over this circle (one slot for all its waves)
  begin(e) {
    let s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) {
      s = this.slots.find((q) => !q.live) || this.slots[0];
      Object.assign(s, { live: true, t: 0, end: 0, first: 9, x: e.x, z: e.z, radius: e.radius, waves: 0, struck: 0, pulse: 0, outAt: -1 });
      skyAbove(this.camera, e.x, e.z, EYE_H, -0.25, s.eye);
      const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
      place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
    }
    s.waves++; s.first = Math.min(s.first, s.t + e.delay); s.end = Math.max(s.end, s.t + e.delay + 0.7);
  }
  // core 'burst' of one wave. targets: [x, z] of the monsters inside the circle
  strike(e, targets = []) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.struck++; s.pulse = 1;
    const r = this.rnd, last = s.struck >= s.waves, n = last ? 4 : 3;
    for (let i = 0; i < n; i++) {
      let x, z;
      if (last && i === 0) { x = s.x; z = s.z; }
      else if (targets.length && (i < 2 || r() < 0.5)) { const t = targets[Math.floor(r() * targets.length)]; x = t[0]; z = t[1]; }
      else { const a = r() * 6.283, d = Math.sqrt(r()) * s.radius * 0.85; x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d; }
      this.bolt(s, x, z, i * 0.055, last && i === 0, targets.some((t) => Math.hypot(t[0] - x, t[1] - z) < 0.05));
    }
    if (last) s.outAt = s.t + 0.15;
  }
  bolt(s, x, z, delay, big, onTarget) {
    const b = this.bolts.find((q) => !q.live) || this.bolts[0], r = this.rnd;
    b.live = true; b.t = -delay; b.big = big; b.landed = false; b.slot = s; b.hit = onTarget ? 1 : 0;
    b.w = big ? 0.32 : 0.17 + r() * 0.04; b.seed = Math.floor(r() * 1e5);
    b.a.copy(s.eye).add(this.p.set((r() - 0.5) * 0.8, (r() - 0.5) * 0.5, (r() - 0.5) * 0.8));
    b.b.set(x, onTarget ? 1.0 : 0.05, z);
  }
  // the landing of a bolt: a ragged flash, ground tendrils (drawn while it lives), sparks, a scorch
  land(b) {
    const r = this.rnd, s = b.slot, n = b.big ? 40 : 14;
    for (let i = 0; i < n && this.sparks.length < SPARKS; i++) {
      const th = r() * 6.283, el = r() * 0.9 + 0.1, sp = (b.big ? 6 : 4) * (0.5 + r() * 0.8);
      const q = this.sparkFree.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
      q.p.set(b.b.x, 0.15, b.b.z); q.v.set(Math.cos(th) * Math.cos(el) * sp, Math.sin(el) * 1.1 * sp, Math.sin(th) * Math.cos(el) * sp);
      q.life = 0; q.max = 0.2 + r() * 0.25; q.w = 0.02 + r() * 0.02; this.sparks.push(q);
    }
    const sc = this.scorch[this.scorchI++ % SCORCH]; sc.t = 0; sc.size = b.big ? s.radius * 1.1 : 1.3;
    place(sc.m, b.b.x, 0.05, b.b.z); sc.m.scale.setScalar(sc.size); conformPlane(sc.m); sc.m.visible = true;
    if (b.hit) this.arcs.push({ x: b.b.x, z: b.b.z, t: 0 });
  }
  stroke(p, w, width, alpha, halo) {
    stW = width; stHalo = halo; stWs = w;
    this.glow.strip(p, strokeGlowW, alpha, this.look.glow);
    this.core.strip(p, strokeCoreW, alpha, this.look.edge);
  }
  tendrils(c, seed, n, len, w, alpha, flat) {
    const r = R3.seed(seed);
    for (let i = 0; i < n; i++) {
      const th = r.next() * 6.283, el = flat ? 0 : (r.next() - 0.3) * 1.4, Ln = len * (0.4 + r.next() * 0.8), steps = 4 + Math.floor(r.next() * 3);
      this.q.set(c.x + Math.cos(th) * Math.cos(el) * Ln, flat ? c.y : c.y + Math.sin(el) * Ln, c.z + Math.sin(th) * Math.cos(el) * Ln);
      zig(c, this.q, R2, seed * 7 + i * 31, 0.28, steps, fp, fw);
      fw[0] = 1.3; for (let j = 1; j < fw.length; j++) fw[j] *= 1 - j / fw.length;
      tdW = w; stWs = fw;
      this.glow.strip(fp, tendrilGlowW, alpha * 0.7, this.look.glow);
      this.core.strip(fp, tendrilCoreW, alpha, this.look.edge);
    }
  }
  useFlash(pos, scale, u, seed) {
    if (this.flashI >= FLASHES) return;
    const fl = this.flashes[this.flashI++];
    fl.visible = true; placeV(fl, pos); fl.quaternion.copy(this.camera.quaternion); fl.scale.setScalar(scale);
    fl.material.uniforms.uT.value = u; fl.material.uniforms.uSeed.value = seed;
  }
  useLight(pos, k) { if (this.lightI >= LIGHTS) return; const l = this.lights[this.lightI++]; place(l, pos.x, pos.y + 0.4, pos.z); l.intensity = k; }
  update(dt) {
    this.time += dt;
    const flick = Math.floor(this.time * 15);
    rewindPts(); this.glow.begin(); this.core.begin(); this.flashI = 0; this.lightI = 0;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt; s.pulse = Math.max(0, s.pulse - dt / 0.25);
      // the area: the fill grows to the first strike, then holds
      const open = Math.min(1, s.t / 0.15) * (1 - THREE.MathUtils.smoothstep(s.t, s.end - 0.3, s.end));
      const U = s.warn.material.uniforms; U.uOpen.value = open; U.uK.value = Math.min(1, s.t / Math.max(0.05, s.first)); U.uA.value = 0.85 + 0.15 * s.pulse;
      // the storm eye: wakes, flickers, crackles; bursts and goes out after the last strike
      const out = s.outAt >= 0 ? Math.max(0, 1 - (s.t - s.outAt) / 0.25) : 1, wake = Math.min(1, s.t / 0.35);
      if (out > 0) {
        const k = wake * out, burst = s.outAt >= 0 ? 1 + (1 - out) * 1.2 : 1;
        this.useFlash(s.eye, (0.9 + 0.5 * k + 0.6 * s.pulse) * burst * (flick % 2 ? 1 : 0.85), 0.1 + (flick % 3) * 0.08, 2.3 + flick * 1.37);
        this.tendrils(s.eye, 900 + flick, 3 + Math.floor(k * 3), 0.6 + 0.6 * k + 0.5 * s.pulse, 0.05, k, false);
        this.useLight(s.eye, 4 * k + 6 * s.pulse);
      }
      if (s.t >= s.end) { s.live = false; s.warn.visible = false; }
    }
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.t += dt;
      const age = b.t, hold = b.big ? HOLD + 0.1 : HOLD;
      if (age < 0) continue;
      if (age > hold + FADE) { b.live = false; continue; }
      const lead = Math.min(1, age / LEAD), fade = age > hold ? 1 - (age - hold) / FADE : 1;
      if (lead >= 1 && !b.landed) { b.landed = true; this.land(b); }
      const w = b.w * (age < 0.06 ? 1.4 : flick % 2 ? 1.0 : 0.8) * (0.4 + 0.6 * fade);
      const segs = Math.max(8, Math.round(b.a.distanceTo(b.b) * 1.6));
      zig(b.a, b.b, R1, b.seed * 100 + flick, 0.09, segs, pts, ws);
      this.dir.copy(zDir); this.perp.copy(zPerp);
      const cut = Math.max(2, Math.ceil(pts.length * lead));
      if (lead < 1) { pts.length = cut; ws.length = cut; }
      this.stroke(pts, ws, w, fade, 2.4);
      if (lead >= 1) {
        zig(b.a, b.b, R2, b.seed * 100 + flick + 777, 0.07, segs + 2, p2, w2);
        this.stroke(p2, w2, w * 0.4, 0.85 * fade, 3.0);
        const r = R1, nf = (b.big ? 4 : 2) + Math.floor(r.next() * 3);
        for (let f = 0; f < nf; f++) {
          const base = pts[1 + Math.floor(r.next() * (pts.length - 2))], Lf = (b.big ? 1.2 : 0.7) + r.next() * 1.2;
          this.q.copy(base).addScaledVector(this.dir, Lf * 0.5).addScaledVector(this.perp, (r.next() < 0.5 ? -1 : 1) * Lf * (0.5 + r.next() * 0.5));
          zig(base, this.q, R2, b.seed * 333 + flick * 5 + f, 0.25, 3 + Math.floor(r.next() * 3), fp, fw);
          for (let j = 0; j < fw.length; j++) fw[j] *= 1 - j / fw.length;
          this.stroke(fp, fw, w * 0.55, fade, 2.0);
        }
        // the landing: a ragged flash, a strobing light, tendrils crawling over the ground
        this.p.set(b.b.x, b.big ? 0.9 : 0.6, b.b.z);
        if (age < 0.16) this.useFlash(this.p, (b.big ? 3.6 : 1.7) * (1 + age * 2), age / 0.16, b.seed + flick);
        this.useLight(this.p, (b.big ? 14 : 7) * fade * (flick % 2 ? 1 : 0.6));
        this.p.set(b.b.x, 0.08, b.b.z);
        this.tendrils(this.p, b.seed + flick, b.big ? 9 : 4, b.big ? b.slot.radius * 0.9 : 1.1, b.big ? 0.06 : 0.04, fade, true);
      }
    }
    // shocked monsters: short crooked arcs hopping over the body (Chain Spark's shocked status)
    let w = 0;
    for (const h of this.arcs) {
      h.t += dt; if (h.t > 0.6) continue; this.arcs[w++] = h;
      const r = R3.seed(5000 + Math.floor(h.x * 31 + h.z * 17) + flick), n = h.t < 0.3 ? 2 : r.next() < 0.5 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const a1 = r.next() * 6.28, a2 = a1 + 0.7 + r.next() * 1.2;
        this.p.set(h.x + Math.cos(a1) * 0.4, 0.7 + r.next() * 1.0, h.z + Math.sin(a1) * 0.4);
        this.q.set(h.x + Math.cos(a2) * 0.4, 0.7 + r.next() * 1.0, h.z + Math.sin(a2) * 0.4);
        zig(this.p, this.q, R2, 7000 + flick * 3 + i, 0.35, 4, fp, fw);
        this.stroke(fp, fw, 0.035, 1, 2.0);
      }
    }
    this.arcs.length = w;
    // sparks: fly, bounce, die
    let k = 0;
    for (const q of this.sparks) {
      q.life += dt; q.v.y -= 14 * dt; q.v.multiplyScalar(1 - 3.2 * dt); q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.03) { q.p.y = 0.03; q.v.y *= -0.3; q.v.x *= 0.5; q.v.z *= 0.5; }
      if (q.life >= q.max) { this.sparkFree.push(q); continue; }
      this.sparks[k++] = q;
      const u = q.life / q.max;
      sparkPts[0].copy(q.p).addScaledVector(q.v, -0.03); sparkPts[1].copy(q.p).lerp(sparkPts[0], 0.5); sparkPts[2].copy(q.p);
      sparkW = q.w; sparkU = u;
      this.glow.strip(sparkPts, sparkGlowW, 0.6 * (1 - u), this.look.glow);
      this.core.strip(sparkPts, sparkCoreW, 1 - u * u, this.look.spark);
    }
    this.sparks.length = k;
    for (const sc of this.scorch) {
      if (!sc.m.visible) continue;
      sc.t += dt; const U = sc.m.material.uniforms;
      U.uHot.value = Math.max(0, 1 - sc.t / 0.5); U.uA.value = Math.max(0, Math.min(1, (2.4 - sc.t) / 0.8));
      if (sc.t > 2.4) sc.m.visible = false;
    }
    for (let i = this.flashI; i < FLASHES; i++) this.flashes[i].visible = false;
    for (let i = this.lightI; i < LIGHTS; i++) this.lights[i].intensity = 0;
    this.glow.end(); this.core.end();
  }
  clear() {
    for (const s of this.slots) { s.live = false; s.warn.visible = false; }
    for (const b of this.bolts) b.live = false;
    for (const sc of this.scorch) sc.m.visible = false;
    for (const q of this.sparks) this.sparkFree.push(q); this.sparks.length = 0; this.arcs.length = 0;
    for (const f of this.flashes) f.visible = false; for (const l of this.lights) l.intensity = 0;
  }
  get busy() { return this.slots.some((s) => s.live) || this.bolts.some((b) => b.live) || this.sparks.length > 0 || this.scorch.some((s) => s.m.visible); }
}
