// Thunder Lance (the spell archer's lightning skill, 2026-10-31). Its own look, apart from the mage's
// lightning (Thunderstorm's bolts from a ball in the sky, Chain Spark's hops from target to target): it is
// an arrow. Through the draw, sparks crackle round the arrow's head at the bow. On the rules' first
// 'lineStrike' a lance of lightning shoots the whole lane at once - a straight white-hot shaft with a
// spearhead glint racing to its far end, two of Chain Spark's angular bolts (zig, few kinks, re-jagged
// 15 times a second) wound round it - then fades, leaving the lane charged: a faint line on the ground
// with small arcs crackling along it, faster as the after-shock nears. On the second 'lineStrike'
// (after: true) the lane snaps again at once at knee height, harder, and what it stuns gets the stun
// stars (MaceFx, from 'stunned'). Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf } from './fx-common.js';
import { CRACKLE_FS, BOLT_GLOW_FS, Rng, zig } from './chain-fx.js';

const LOOK = lookOf('lightning'), WHITE = [1, 1, 1];
const LANCE = 0.28, LANCE_FADE = 0.12;        // the lance holds, then fades
const SNAP = 0.22;                             // the after-shock's bolts
const FLASHES = 5;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.45 ? mix(vT, vec3(1.0), 0.85) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.2)*0.65; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const R = new Rng(), R2 = new Rng();
let sw = 0, swk = null;
const smooth = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
// the lance (x 0 at the bow .. 1 at its head): a soft rounded tail, a long pointed spearhead (owner: its
// head and tail were cut square)
const lanceW = (x) => sw * Math.sqrt(smooth(0, 0.08, x)) * (x > 0.86 ? Math.pow((1 - x) / 0.14, 0.8) : 1);
const lanceGlowW = (x) => sw * 3.2 * Math.sqrt(smooth(0, 0.1, x)) * (x > 0.8 ? Math.pow((1 - x) / 0.2, 0.6) : 1);
const softW = (x) => sw * 3.2 * Math.sqrt(smooth(0, 0.06, x) * smooth(1, 0.94, x));
const LINE = 28;
const boltW = (x, k) => sw * swk[k] * Math.min(1, x * 8, (1 - x) * 8), boltGlowW = (x, k) => sw * 2.6 * (0.5 + 0.5 * swk[k]);
const tipW = (x) => sw * Math.sin(Math.PI * x);

export class LanceFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 2400, CRACKLE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.beam = new Ribbon(scene, camera, 200, CORE_FS, THREE.NormalBlending);
    this.halo = new Ribbon(scene, camera, 200, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8; this.beam.mesh.renderOrder = 9; this.halo.mesh.renderOrder = 7;
    // glints (owner: no ragged bursts): a clean four-point star with a soft round glow, camera-facing
    this.glints = Array.from({ length: FLASHES }, () => ({ t: 9, p: new THREE.Vector3(), size: 1 })); this.glintI = 0;
    this.right = new THREE.Vector3(); this.upV = new THREE.Vector3();
    this.charge = null;                                   // { t, total, x, z, angle }
    this.lanes = [];                                      // { t, x, z, dx, dz, range, after, snapT }
    this.free = Array.from({ length: 4 }, () => ({ t: 9, x: 0, z: 0, dx: 0, dz: 1, range: 12, snapT: -1, seed: 0 }));
    this.sparks = []; this.sparkFree = Array.from({ length: 80 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, life: 1 }));
    this.rnd = mulberry32(91); this.t = 0;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.pts = []; this.ws = []; this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.line = Array.from({ length: LINE }, () => new THREE.Vector3());
    this.twitches = Array.from({ length: 12 }, () => ({ id: 0, t: 9, dur: 0.15, seed: 0 })); this.twitchI = 0;
    this.locate = null; // set by the director: id -> a monster's centre {x, y, z} or null
  }
  // LINE points from a to b (a straight strip that can taper)
  fill(a, b) { for (let i = 0; i < LINE; i++) this.line[i].copy(a).lerp(b, i / (LINE - 1)); return this.line; }
  flash(x, y, z, size) { const f = this.glints[this.glintI++ % FLASHES]; f.t = 0; f.size = size * 0.45; f.p.set(x, y, z); }
  spark(x, y, z, n, speed = 4) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const s = this.sparkFree.pop(); if (!s) return;
      const a = r() * 6.283, up = r();
      s.p.set(x, y, z); s.v.set(Math.cos(a) * speed * (0.4 + r()), 1 + up * 3, Math.sin(a) * speed * (0.4 + r())); s.t = 0; s.life = 0.18 + r() * 0.2;
      this.sparks.push(s);
    }
  }
  // castStart: sparks crackle round the arrow's head through the draw
  windup(x, z, angle, total) { this.charge = { t: 0, total, x, z, angle }; }
  // the rules' 'lineStrike' of thunder_lance: x, z the hero, angle the aim, range the lane
  strike(e) {
    this.charge = null;
    const dx = Math.sin(e.angle), dz = Math.cos(e.angle);
    if (e.after) {
      // the after-shock: find the lane it repeats (else start one)
      let l = this.lanes.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
      if (!l) { l = this.free.pop(); if (!l) return; Object.assign(l, { t: LANCE + LANCE_FADE, x: e.x, z: e.z, dx, dz, range: e.range }); this.lanes.push(l); }
      l.snapT = 0;
      for (let i = 0; i < 6; i++) { const u = (i + this.rnd()) / 6; this.spark(e.x + dx * e.range * u, 0.3, e.z + dz * e.range * u, 3, 3); }
      return;
    }
    const l = this.free.pop() || this.lanes.shift(); if (!l) return;
    Object.assign(l, { t: 0, x: e.x, z: e.z, dx, dz, range: e.range, snapT: -1, seed: Math.floor(this.rnd() * 1000) });
    this.lanes.push(l);
    this.flash(e.x + dx * 0.8, 1.15, e.z + dz * 0.8, 1.5);                 // the loose at the bow
    this.flash(e.x + dx * e.range, 1.0, e.z + dz * e.range, 1.6);          // the spearhead at the far end
    this.spark(e.x + dx * e.range, 1.0, e.z + dz * e.range, 8, 4);
  }
  // shock's twitch (the rules' 'twitch' and 'shocked'): a few short arcs crackle over the body for a moment
  twitch(id, dur = 0.15) {
    const q = this.twitches.find((x) => x.t >= x.dur) || this.twitches[this.twitchI++ % this.twitches.length];
    q.id = id; q.t = 0; q.dur = Math.max(0.12, dur + 0.05); q.seed = Math.floor(this.rnd() * 999);
  }
  // a struck target: a sharp burst of sparks off it
  hit(c) { this.spark(c.x, c.y, c.z, 5, 3.5); }
  bolt(a, b, seed, amp, segs, w, alpha) {
    zig(a, b, R, seed, amp, segs, this.pts, this.ws);
    sw = w; swk = this.ws;
    this.glow.strip(this.pts, boltGlowW, alpha, LOOK.glow);
    this.core.strip(this.pts, boltW, alpha, LOOK.edge);
  }
  update(dt) {
    this.t += dt;
    const flick = Math.floor(this.t * 15), two = this.two, A = this.a, B = this.b;
    this.core.begin(); this.glow.begin(); this.beam.begin(); this.halo.begin();
    // the draw: little arcs round the arrow's head at the bow
    const c = this.charge;
    if (c) {
      c.t += dt;
      const k = Math.min(1, c.t / Math.max(0.05, c.total)), hx = c.x + Math.sin(c.angle) * 0.75, hz = c.z + Math.cos(c.angle) * 0.75, r = R2.seed(flick * 13 + 5);
      const n = 1 + Math.floor(k * 3);
      for (let i = 0; i < n; i++) {
        const a1 = r.next() * 6.283, a2 = a1 + 1 + r.next() * 2, rad = 0.12 + 0.18 * k;
        A.set(hx + Math.cos(a1) * rad, 1.25 + Math.sin(a1) * rad, hz + Math.cos(a1) * rad * 0.3);
        B.set(hx + Math.cos(a2) * rad, 1.25 + Math.sin(a2) * rad, hz + Math.cos(a2) * rad * 0.3);
        this.bolt(A, B, flick * 31 + i, 0.35, 3, 0.025, 0.9);
      }
      if (c.t > c.total + 0.3) this.charge = null;
    }
    let w = 0;
    for (const l of this.lanes) {
      l.t += dt;
      const sx = l.x + l.dx * 0.8, sz = l.z + l.dz * 0.8, ex = l.x + l.dx * l.range, ez = l.z + l.dz * l.range;
      // the lance: a straight white-hot shaft, its head racing to the end, two bolts wound round it
      if (l.t < LANCE + LANCE_FADE) {
        const fade = l.t < LANCE ? 1 : 1 - (l.t - LANCE) / LANCE_FADE, reach = Math.min(1, l.t / 0.07);
        A.set(sx, 1.1, sz); B.set(sx + (ex - sx) * reach, 1.0, sz + (ez - sz) * reach);
        const pts = this.fill(A, B);
        sw = 0.16 * fade; this.halo.strip(pts, lanceGlowW, fade, LOOK.glow);
        sw = 0.15 * (0.6 + 0.4 * fade); this.beam.strip(pts, lanceW, fade, LOOK.edge);
        for (let i = 0; i < 2; i++) this.bolt(A, B, l.seed * 17 + flick * 7 + i * 101, 0.02, 14, 0.05, fade);
      }
      // the charged lane: a faint line on the ground and small arcs crackling along it, faster as the
      // after-shock nears
      const charged = l.snapT < 0 && l.t > 0.12 && l.t < 0.75;
      if (charged || (l.snapT >= 0 && l.snapT < SNAP)) {
        const glowK = l.snapT >= 0 ? 1 - l.snapT / SNAP : Math.min(1, (l.t - 0.12) / 0.15);
        sw = 0.06; this.halo.strip(this.fill(A.set(sx, 0.05, sz), B.set(ex, 0.05, ez)), softW, 0.45 * glowK, LOOK.glow);
        if (charged) {
          const r = R2.seed(l.seed * 7 + flick), n = 1 + Math.floor(Math.min(1, (l.t - 0.12) / 0.33) * 3);
          for (let i = 0; i < n; i++) {
            const u = r.next(), len = 0.4 + r.next() * 0.6, side = (r.next() - 0.5) * 0.5;
            A.set(sx + (ex - sx) * u - l.dz * side, 0.08, sz + (ez - sz) * u + l.dx * side);
            B.set(A.x + l.dx * len + (r.next() - 0.5) * 0.3, 0.1 + r.next() * 0.3, A.z + l.dz * len + (r.next() - 0.5) * 0.3);
            this.bolt(A, B, l.seed + flick * 11 + i * 7, 0.3, 3, 0.025, 0.9);
          }
        }
      }
      // the after-shock: the whole lane snaps again at knee height, harder
      if (l.snapT >= 0) {
        l.snapT += dt;
        if (l.snapT < SNAP) {
          const fade = l.snapT < SNAP * 0.6 ? 1 : 1 - (l.snapT - SNAP * 0.6) / (SNAP * 0.4);
          A.set(sx, 0.35, sz); B.set(ex, 0.35, ez);
          for (let i = 0; i < 2; i++) this.bolt(A, B, l.seed * 23 + flick * 5 + i * 59, 0.026, 16, 0.07, fade);
        }
      }
      if (l.t < 0.9 || (l.snapT >= 0 && l.snapT < SNAP)) this.lanes[w++] = l; else { l.snapT = -1; this.free.push(l); }
    }
    this.lanes.length = w;
    // twitches: two or three short arcs jumping over the body
    for (const q of this.twitches) {
      if (q.t >= q.dur) continue;
      q.t += dt;
      const c = this.locate?.(q.id); if (!c) { q.t = q.dur; continue; }
      const r = R2.seed(q.seed + flick * 3), fade = 1 - q.t / q.dur;
      for (let i = 0; i < 3; i++) {
        const a1 = r.next() * 6.283, a2 = a1 + 1.2 + r.next() * 1.5, h1 = (r.next() - 0.5) * 0.9, h2 = (r.next() - 0.5) * 0.9;
        A.set(c.x + Math.cos(a1) * 0.45, c.y + h1, c.z + Math.sin(a1) * 0.45);
        B.set(c.x + Math.cos(a2) * 0.45, c.y + h2, c.z + Math.sin(a2) * 0.45);
        this.bolt(A, B, q.seed * 7 + flick * 13 + i, 0.3, 4, 0.03, fade);
      }
    }
    // sparks
    let sw2 = 0;
    for (const s of this.sparks) {
      s.t += dt; const u = s.t / s.life;
      if (u >= 1) { this.sparkFree.push(s); continue; }
      s.v.y -= 12 * dt; s.p.addScaledVector(s.v, dt);
      this.three[0].copy(s.p).addScaledVector(s.v, -0.03); this.three[1].copy(s.p).lerp(this.three[0], 0.5); this.three[2].copy(s.p);
      sw = 0.03 * (1 - u); this.beam.strip(this.three, tipW, 1, LOOK.spark);
      this.sparks[sw2++] = s;
    }
    this.sparks.length = sw2;
    // glints: a four-point star that pops and shrinks in 0.18 s, over a soft glow
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion); this.upV.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    for (const f of this.glints) {
      if (f.t >= 0.18) continue;
      f.t += dt; const u = Math.min(1, f.t / 0.18), s = f.size * (u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75 * 0.85);
      for (const ax of [this.right, this.upV]) {
        const len = ax === this.upV ? 1.35 : 1;
        two[0].copy(f.p).addScaledVector(ax, -s * len); two[1].copy(f.p).addScaledVector(ax, s * len);
        sw = s * 0.3; this.halo.strip(two, tipW, (1 - u) * 0.9, LOOK.glow);
        sw = s * 0.16; this.beam.strip(two, tipW, 1 - u * 0.5, WHITE);
      }
    }
    this.core.end(); this.glow.end(); this.beam.end(); this.halo.end();
  }
  clear() {
    this.charge = null;
    for (const q of this.twitches) q.t = 9;
    for (const l of this.lanes) { l.snapT = -1; this.free.push(l); } this.lanes.length = 0;
    for (const s of this.sparks) this.sparkFree.push(s); this.sparks.length = 0;
    for (const f of this.glints) f.t = 9;
  }
  get busy() { return this.lanes.length > 0 || this.sparks.length > 0 || !!this.charge || this.twitches.some((q) => q.t < q.dur); }
}
