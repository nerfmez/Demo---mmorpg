// Power Draw, in the bench's light-and-ribbon language. While the bow is held drawn (the rules'
// chargeStart .. release), streaks of light are drawn in to the arrow tip, a soft round glow grows
// there and three arcs of light circle the arrow, widening with the charge; reaching full charge
// pings once (a burst and a ring) and the glow then pulses so a full draw reads at a glance. The
// released arrow is a streak of light whose thickness and wake grow with the charge; a strong
// shot leaves rings of pushed air at the bow and along its path. The impact is a clean burst: a
// round glow that pops, sharp rays of light (the longest thrown on along the shot) and a thin ring,
// all scaled by the charge. Positions come from the rules' projectiles and 'impact' events.
// Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, place, placeV } from './fx-common.js';

const SHOTS = 4, BURSTS = 6, RAYS = 12, RING_PTS = 17, ARC_PTS = 7, HIST = 7;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.95), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
const tailGlowW = (x) => stripW * (0.6 + 2.4 * x * x), tailCoreW = (x) => stripW * (0.2 + 0.8 * x * x * x);
const headW = (x) => stripW * 2.4 * Math.sin(Math.PI * x);
const flatW = () => stripW, flatGlowW = () => stripW * 2.4;
const rayW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), rayGlowW = (x) => rayW(x) * 2.6;
const arcW = (x) => stripW * Math.sin(Math.PI * x);
const sparkGlowW = () => stripW * 2.2, sparkCoreW = (x) => stripW * x * (1 - stripU * 0.6);

export class PowerFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 5000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    // soft round glows (one radial texture, tinted per element)
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const glowSprite = () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp); return sp; };
    this.halo = glowSprite(); this.hot = glowSprite();
    this.bursts = Array.from({ length: BURSTS }, () => ({ sp: glowSprite(), t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) }));
    this.burstI = 0;
    this.shots = Array.from({ length: SHOTS }, () => ({ id: null, live: false, ratio: 0, t: 0, n: 0, hist: Array.from({ length: HIST }, () => new THREE.Vector3()), ringAt: 0 }));
    this.charge = null; this.nextRatio = 0; this.look = lookOf('physical');
    this.rings = []; this.sparks = []; this.rnd = mulberry32(19); this.t = 0;
    this.pts = Array.from({ length: Math.max(HIST, RING_PTS) }, () => new THREE.Vector3()); this.sub = [];
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.head = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.ringAlive = (r) => r.life < r.max; this.sparkAlive = (s) => s.life < s.max;
  }
  setElement(element) {
    this.look = lookOf(element);
    const [r, g, b] = this.look.edge;
    for (const sp of [this.halo, this.hot, ...this.bursts.map((x) => x.sp)]) sp.material.color.setRGB(0.5 + r * 0.5, 0.5 + g * 0.5, 0.5 + b * 0.5);
  }
  // a clean burst: a round glow that pops and sharp rays, the longest thrown on along dir
  burst(pos, dir, size, life) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos);
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.5, (r() - 0.4) * 0.4, dir.z + (r() - 0.5) * 0.5).normalize(); ray.len = size * (1.1 + r() * 0.5); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.4 + r() * 0.35); }
    });
  }
  // the rules' chargeStart; ratio(): the live charge 0..1 while held
  beginCharge(total) { this.charge = { total, full: false, t: 0 }; }
  endCharge() { this.charge = null; }
  // released at this charge; the next charged_shot projectile carries it
  release(ratio) { this.nextRatio = ratio; this.charge = null; }
  // a ring of pushed air, perpendicular to dir, growing and fading
  ring(pos, dir, r0, r1, max) { if (this.rings.length < 24) this.rings.push({ p: pos.clone(), d: dir.clone(), r0, r1, life: 0, max }); }
  spark(p, v, max, w) { if (this.sparks.length < 300) this.sparks.push({ p: p.clone(), v, life: 0, max, w }); }
  syncProjectiles(projectiles, kind, dt) {
    for (const s of this.shots) s.live = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      let s = null, free = null;
      for (const x of this.shots) { if (x.id === pr.id) s = x; else if (x.id === null && !free) free = x; }
      if (!s) {
        if (!free) continue;
        s = free; Object.assign(s, { id: pr.id, ratio: this.nextRatio, t: 0, n: 0, ringAt: 1.2 });
        this.dir.set(pr.vx, 0, pr.vz).normalize();
        const at = this.three[0].set(pr.x, 1.45, pr.z);
        this.burst(at, this.dir, 0.35 + 0.5 * s.ratio, 0.16);
        if (s.ratio > 0.5) this.ring(at, this.dir, 0.15, 0.6 + 0.7 * s.ratio, 0.28);
      }
      s.live = true; s.t += dt;
      for (let i = HIST - 1; i > 0; i--) s.hist[i].copy(s.hist[i - 1]);
      s.hist[0].set(pr.x, 1.45, pr.z); s.n = Math.min(HIST, s.n + 1);
      // a strong shot keeps pushing rings of air off its path
      if (s.ratio > 0.75) {
        s.ringAt -= Math.hypot(pr.vx, pr.vz) * dt;
        if (s.ringAt <= 0) { s.ringAt = 2.2; this.dir.set(pr.vx, 0, pr.vz).normalize(); this.ring(s.hist[0], this.dir, 0.1, 0.45 * s.ratio, 0.22); }
      }
    }
    for (const s of this.shots) if (!s.live && s.id !== null) s.id = null;
  }
  impact(e, ratio) {
    const at = this.three[0].set(e.x, 1.2, e.z), r = this.rnd;
    this.dir.set(e.vx || 1, 0, e.vz || 0).normalize();
    this.burst(at, this.dir, 0.8 + 1.2 * ratio, 0.24 + 0.08 * ratio);
    this.ring(at, this.dir, 0.15, 0.5 + 0.9 * ratio, 0.25);
    const n = 3 + Math.round(6 * ratio);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, el = (r() - 0.2) * 1.2, sp = (2.5 + r() * 3) * (0.7 + ratio * 0.6);
      this.spark(at, new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1, Math.sin(a) * Math.cos(el) * sp), 0.2 + r() * 0.2, 0.025);
    }
  }
  update(dt, tip, ratio) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const look = this.look, three = this.three, head = this.head, r = this.rnd;
    // charge: streaks drawn in to the arrow, the glow growing; a ping at full
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      if (r() < dt * (25 + 45 * ratio)) {
        const a = r() * 6.283, el = (r() - 0.3) * 1.3, rad = 0.55 + 0.25 * ratio;
        const p = three[1].set(tip.x + Math.cos(a) * Math.cos(el) * rad, tip.y + Math.sin(el) * rad, tip.z + Math.sin(a) * Math.cos(el) * rad);
        this.spark(p, new THREE.Vector3((tip.x - p.x) * 6, (tip.y - p.y) * 6, (tip.z - p.z) * 6), 0.16, 0.03);
      }
      const pulse = ratio >= 1 ? 1 + Math.sin(this.t * 40) * 0.12 : 1;
      // a soft round glow at the arrow tip with a hot centre, swelling with the charge
      this.halo.visible = this.hot.visible = true;
      placeV(this.halo, tip); placeV(this.hot, tip);
      this.halo.scale.setScalar((0.25 + 0.85 * ratio) * pulse); this.hot.scale.setScalar((0.08 + 0.22 * ratio) * pulse);
      this.halo.material.opacity = 0.5 + 0.5 * ratio;
      // three arcs of light circling the arrow, widening and speeding up with the charge
      this.u.crossVectors(_fwd, this.up).normalize(); this.v.crossVectors(_fwd, this.u).normalize();
      const rad = 0.16 + 0.26 * ratio, spin = this.t * (5 + 9 * ratio), sub = this.sub;
      for (let k = 0; k < 3; k++) {
        sub.length = 0;
        for (let i = 0; i < ARC_PTS; i++) {
          const a = spin + k * 2.094 + (i / (ARC_PTS - 1)) * 1.1;
          this.pts[i].copy(tip).addScaledVector(_fwd, -0.15).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]);
        }
        stripW = (0.02 + 0.03 * ratio) * pulse;
        this.glow.strip(sub, arcW, 0.4 + 0.6 * ratio, look.glow); this.core.strip(sub, arcW, 0.3 + 0.7 * ratio, look.edge);
      }
      if (ratio >= 1 && !ch.full) { ch.full = true; this.burst(tip, _fwd, 0.6, 0.18); this.ring(tip, _fwd, 0.1, 0.6, 0.25); }
    } else this.halo.visible = this.hot.visible = false;
    // shots: a streak of light with a bright head; bigger with more charge
    for (const s of this.shots) {
      if (s.id === null || s.n < 2) continue;
      const sub = this.sub; sub.length = 0;
      for (let i = s.n - 1; i >= 0; i--) { this.pts[i].copy(s.hist[i]); sub.push(this.pts[i]); }
      stripW = 0.06 + 0.12 * s.ratio;
      this.glow.strip(sub, tailGlowW, 0.7 + 0.3 * s.ratio, look.glow); this.core.strip(sub, tailCoreW, 1, look.edge);
      this.dir.subVectors(s.hist[0], s.hist[1]).normalize();
      head[2].copy(s.hist[0]).addScaledVector(this.dir, 0.12); head[0].copy(s.hist[0]).addScaledVector(this.dir, -0.25); head[1].copy(head[0]).lerp(head[2], 0.5);
      stripW = 0.05 + 0.05 * s.ratio; this.core.strip(head, headW, 1, look.spark);
    }
    // rings of pushed air
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u));
      this.u.crossVectors(g.d, this.up).normalize(); this.v.crossVectors(g.d, this.u).normalize();
      const sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].copy(g.p).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]); }
      stripW = 0.05 * (1 - u * 0.6);
      this.glow.strip(sub, flatGlowW, 0.7 * (1 - u), look.glow); this.core.strip(sub, flatW, 1 - u, look.edge);
    }
    compact(this.rings, this.ringAlive);
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      // the glow pops and fades; the rays shoot out, then thin from the centre outward
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.8 + 1.2 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.07 * b.size * (1 - k * 0.6);
        this.glow.strip(three, rayGlowW, 0.8 * (1 - k), look.glow); this.core.strip(three, rayW, 1 - k * k, look.edge);
      }
    }
    for (const s of this.sparks) {
      s.life += dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt);
      const u = s.life / s.max;
      if (u >= 1) continue;
      three[0].copy(s.p).addScaledVector(s.v, -0.03); three[1].copy(s.p).lerp(three[0], 0.5); three[2].copy(s.p);
      stripW = s.w; stripU = u;
      this.glow.strip(three, sparkGlowW, 0.6 * (1 - u), look.glow); this.core.strip(three, sparkCoreW, 1 - u * u, look.spark);
    }
    compact(this.sparks, this.sparkAlive);
    this.core.end(); this.glow.end();
  }
  clear() { this.charge = null; this.rings.length = 0; this.sparks.length = 0; for (const s of this.shots) s.id = null; for (const b of this.bursts) { b.t = 9; b.sp.visible = false; } this.halo.visible = this.hot.visible = false; }
  get busy() { return !!this.charge || this.rings.length > 0 || this.sparks.length > 0 || this.shots.some((s) => s.id !== null); }
}

const _fwd = new THREE.Vector3(1, 0, 0);
export function setPowerFacing(facing) { _fwd.set(Math.sin(facing), 0, Math.cos(facing)); }
