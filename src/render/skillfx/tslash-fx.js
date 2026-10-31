// Thunder Slash (ฟันสายฟ้า, spellblade): a cut of lightning that follows the blade, and the charge it leaves.
// Chain Spark's lightning (zig: few straight segments, hard kinks, a white crackling core in a blue glow,
// re-jagged 15 times a second), never pictures. Owner rules: lightning not messy (few bolts, low jag), no
// ragged bursts (clean glints), effects of a spellblade come off its sword.
//   wind-up (castStart): small arcs crackle along the blade;
//   the cut: a jagged arc of lightning swept with the blade over the rules' arc and reach (the way the blade
//     tip really travels), a thinner arc inside it, a soft glow band behind, two short forks off the edge;
//     it holds a beat and fades;
//   the charge (statuses.charged on each struck monster, 4 s or 4 shocks): a ring of small sparks circles
//     the body, one per shock left, and a short arc crackles over it now and then;
//   each shock (the rules' 'chargeShock' when a main skill hits it): a bolt drops from above through the
//     body into the ground, sparks and a glint (drawn by LanceFx's spark/glint pools), and a spark leaves
//     the ring.
// Cosmetic only; pooled ribbons, no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, lookOf } from './fx-common.js';
import { CRACKLE_FS, BOLT_GLOW_FS, Rng, zig } from './chain-fx.js';

const LOOK = lookOf('lightning');
const SWEEP = 0.09, HOLD = 0.12, FADE = 0.16, TILT = 0.25, ARC_PTS = 26, MARKS = 8, SHOCKS = 6;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.0)*0.5; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const DOT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard; vec3 c = d < 0.45 ? vec3(1.0) : vT; gl_FragColor=vec4(c, vA); }`;
const R = new Rng(), R2 = new Rng();
let sw = 0, swk = null;
const boltW = (x, k) => sw * swk[k] * Math.min(1, x * 8, (1 - x) * 8), boltGlowW = (x, k) => sw * 2.6 * (0.5 + 0.5 * swk[k]);
const bandW = (x) => sw * Math.pow(Math.sin(Math.PI * x), 0.7), dotW = (x) => sw * Math.sin(Math.PI * x);

export class ThunderSlashFx {
  constructor(scene, camera) {
    this.camera = camera; this.time = 0;
    this.core = new Ribbon(scene, camera, 2400, CRACKLE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.band = new Ribbon(scene, camera, 200, GLOW_FS, THREE.AdditiveBlending);
    this.dots = new Ribbon(scene, camera, 600, DOT_FS, THREE.NormalBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8; this.band.mesh.renderOrder = 7; this.dots.mesh.renderOrder = 9;
    this.pts = []; this.ws = []; this.arc = Array.from({ length: ARC_PTS }, () => new THREE.Vector3()); this.arcW = new Array(ARC_PTS).fill(1);
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3(); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.shocks = Array.from({ length: SHOCKS }, () => ({ t: 9, x: 0, y: 0, z: 0, seed: 0 })); this.shockI = 0;
    this.where = null; this.sweepAt = -1; this.contactAt = -1; this.igniteAt = -1; this.bladeUntil = -1; this.dir = 1;
    this.x = 0; this.z = 0; this.angle = 0; this.range = 3; this.arcRad = 2; this.spin = 0; this.tipAng = null; this.started = false;
    this.locate = null; // set by the director: id -> a monster's centre {x, y, z} or null
  }
  /** castStart: the blade crackles now; the cut's contact lands `total` s from now. where(): caster {x, z, angle}. */
  ignite(total, where, dir, range, arcDeg) {
    this.igniteAt = this.time; this.contactAt = this.time + total; this.sweepAt = this.contactAt - SWEEP * 0.5;
    this.bladeUntil = this.contactAt + 0.12; this.where = where; this.dir = dir || 1;
    this.range = range; this.arcRad = (arcDeg * Math.PI) / 180; this.started = false; this.spin = 0; this.tipAng = null;
  }
  start() {
    const at = this.where(); this.x = at.x; this.z = at.z; this.angle = at.angle; this.started = true;
    if (Math.abs(this.spin) > 2) this.dir = Math.sign(this.spin); // the way the blade really travels round the body
    this.seed = Math.floor(this.time * 997) % 1000;
  }
  /** A point on the cut (u 0..1 in sweep order, r its radius), rolled so it runs high to low. */
  arcPoint(u, r, out) {
    const k = this.dir > 0 ? u : 1 - u, la = (k - 0.5) * this.arcRad, a = this.angle + la;
    return out.set(this.x + Math.sin(a) * r, 0.9 + Math.sin(la) * r * Math.sin(TILT) * -this.dir, this.z + Math.cos(a) * r);
  }
  /** The rules' 'chargeShock': a bolt from above through the struck body. */
  shock(id) {
    const c = this.locate?.(id); if (!c) return null;
    const q = this.shocks[this.shockI++ % SHOCKS]; q.t = 0; q.x = c.x; q.y = c.y; q.z = c.z; q.seed = Math.floor(this.time * 331) % 997;
    return c;
  }
  bolt(a, b, seed, amp, segs, w, alpha) {
    zig(a, b, R, seed, amp, segs, this.pts, this.ws);
    sw = w; swk = this.ws;
    this.glow.strip(this.pts, boltGlowW, alpha, LOOK.glow);
    this.core.strip(this.pts, boltW, alpha, LOOK.edge);
  }
  // a jagged arc over the cut from u0 to u1 at radius r (re-jagged each flick), drawn as one crackling strip
  arcBolt(u0, u1, r, seed, jag, w, alpha) {
    const r2 = R2.seed(seed), n = ARC_PTS;
    for (let i = 0; i < n; i++) {
      const u = u0 + (u1 - u0) * (i / (n - 1)), kink = i % 3 === 0 && i > 0 && i < n - 1 ? (r2.next() - 0.5) * jag : 0;
      this.arcPoint(u, r + kink, this.arc[i]); this.arc[i].y += kink * 0.4; this.arcW[i] = 0.6 + r2.next() * 0.7;
    }
    sw = w; swk = this.arcW;
    this.glow.strip(this.arc, boltGlowW, alpha, LOOK.glow);
    this.core.strip(this.arc, boltW, alpha, LOOK.edge);
  }

  update(dt, base, tip, monsters) {
    this.time += dt;
    const flick = Math.floor(this.time * 15), A = this.a, B = this.b;
    this.core.begin(); this.glow.begin(); this.band.begin(); this.dots.begin();
    // wind-up: small arcs along the blade, more as the cut nears
    if (this.time < this.bladeUntil && base && tip) {
      if (!this.started && this.where && dt > 0) {
        const at = this.where(), ang = Math.atan2(tip.x - at.x, tip.z - at.z);
        if (this.tipAng !== null) { let d = ang - this.tipAng; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; this.spin += (d / dt - this.spin) * 0.5; }
        this.tipAng = ang;
      }
      const k = Math.min(1, (this.time - this.igniteAt) / Math.max(0.05, this.contactAt - this.igniteAt)), r = R2.seed(flick * 17 + 3);
      A.copy(base); B.copy(tip).sub(base).multiplyScalar(1.1).add(base);
      this.bolt(A, B, flick * 29 + 1, 0.12, 5, 0.035, 0.6 + 0.4 * k);
      for (let i = 0; i < 1 + Math.floor(k * 2); i++) {
        const s = 0.3 + r.next() * 0.7; A.copy(base).lerp(tip, s); B.copy(A).set(A.x + (r.next() - 0.5) * 0.5, A.y + (r.next() - 0.2) * 0.4, A.z + (r.next() - 0.5) * 0.5);
        this.bolt(A, B, flick * 7 + i * 3, 0.3, 3, 0.022, 0.9);
      }
    }
    // the cut
    if (this.sweepAt >= 0 && this.time >= this.sweepAt) {
      if (!this.started) this.start();
      const t = this.time - this.sweepAt, head = Math.min(1, t / SWEEP), after = t - SWEEP;
      const fade = after < HOLD ? 1 : Math.max(0, 1 - (after - HOLD) / FADE);
      if (fade > 0) {
        // the glow band behind: a soft crescent of light to the head
        for (let i = 0; i < ARC_PTS; i++) this.arcPoint(head * i / (ARC_PTS - 1), this.range * 0.82, this.arc[i]);
        sw = this.range * 0.32; this.band.strip(this.arc, bandW, 0.8 * fade, LOOK.glow);
        // the main arc at the reach, a thinner one inside it, starting a touch later
        this.arcBolt(0, head, this.range * 0.95, this.seed + flick * 11, 0.3, 0.09, fade);
        const h2 = Math.max(0, Math.min(1, (t - 0.03) / SWEEP));
        if (h2 > 0.05) this.arcBolt(0.08, h2 * 0.92, this.range * 0.68, this.seed + flick * 5 + 50, 0.22, 0.04, fade * 0.85);
        // two short forks off the outer edge once it is past them
        for (let f = 0; f < 2; f++) {
          const u = f ? 0.68 : 0.32; if (head < u) continue;
          this.arcPoint(u, this.range * 0.95, A); this.arcPoint(u + 0.06, this.range * 1.18, B); B.y += 0.15;
          this.bolt(A, B, this.seed + f * 37 + flick * 3, 0.35, 3, 0.035, fade);
        }
      } else this.sweepAt = -1;
    }
    // the charge: one spark per shock left circling each charged body, a crackle now and then
    let marks = 0;
    if (monsters) for (const m of monsters) {
      const ch = m.statuses?.charged; if (!ch || m.dead || ch.shocks <= 0 || marks >= MARKS) continue;
      const c = this.locate?.(m.id); if (!c) continue; marks++;
      const cx = c.x, cy = c.y, cz = c.z, rad = (m.r || 0.5) + 0.25, n = Math.min(6, ch.shocks), end = Math.min(1, ch.t / 0.4);
      for (let i = 0; i < n; i++) {
        const a = this.time * 3.2 + (i / n) * 6.283 + m.id;
        for (let j = 0; j < 3; j++) { const aa = a - j * 0.22; this.three[j].set(cx + Math.cos(aa) * rad, cy - 0.15 + Math.sin(aa * 2 + i) * 0.08, cz + Math.sin(aa) * rad); }
        sw = 0.42; this.band.strip(this.three, dotW, 0.9 * end, LOOK.glow);   // a little comet of light per shock left
        sw = 0.13; this.dots.strip(this.three, dotW, end, LOOK.edge);
      }
      if ((flick + m.id) % 6 === 0) { const r = R2.seed(flick * 13 + m.id); const a1 = r.next() * 6.283, a2 = a1 + 1 + r.next() * 1.5; A.set(cx + Math.cos(a1) * rad * 0.8, cy + (r.next() - 0.5) * 0.6, cz + Math.sin(a1) * rad * 0.8); B.set(cx + Math.cos(a2) * rad * 0.8, cy + (r.next() - 0.5) * 0.6, cz + Math.sin(a2) * rad * 0.8); this.bolt(A, B, flick * 5 + m.id, 0.3, 4, 0.03, 0.85 * end); }
    }
    // shocks: a bolt from above through the body into the ground, 0.16 s, with a fork
    for (const q of this.shocks) {
      if (q.t >= 0.16) continue;
      q.t += dt; const fade = 1 - q.t / 0.16;
      A.set(q.x + 0.3, q.y + 2.6, q.z + 0.7); B.set(q.x, 0.02, q.z);   // from above, leaning to the camera so its top stays on screen
      this.bolt(A, B, q.seed + flick * 9, 0.14, 7, 0.08, fade);
      A.set(q.x, q.y + 0.3, q.z); B.set(q.x + 0.6, 0.05, q.z + 0.4);
      this.bolt(A, B, q.seed + 5 + flick * 3, 0.3, 3, 0.035, fade);
    }
    this.core.end(); this.glow.end(); this.band.end(); this.dots.end();
  }
  clear() {
    this.sweepAt = -1; this.bladeUntil = -1; for (const q of this.shocks) q.t = 9;
    for (const r of [this.core, this.glow, this.band, this.dots]) { r.begin(); r.end(); }
  }
}
