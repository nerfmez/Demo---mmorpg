// Arcane Draw Cut (the spellblade's dash cut: a short wind-up, a 7 m dash along the aim, every monster in
// the lane cut on arrival), in the bench's light-and-ribbon language with Spell Wave's arcane blue-violet
// (an element mod recolours it). Motion principles from the Cartoon FX sword trails and hit sparks
// (docs/VFX-REFERENCE.md): a narrow taper, a fast leading edge, the cut shorter-lived than the trail,
// directional shards after the contact. Original geometry; nothing copied.
//  - wind-up: a sheath of light closes along the blade and rune motes drift into the hilt, brighter
//    toward the release (the owner's pick: the reference stance keeps the blade in hand, the light is
//    the sheath);
//  - dash: three thin speed streaks from where the hero left to where it is, thick at the hero;
//  - arrival: the lane is cut at once - one white-hot line along it that holds a beat, then parts in
//    two and fades, shedding sparks; the sheath breaks into shards at the hero; each monster in the
//    lane gets a long diagonal cut mark.
// One ribbon pair, pooled sparks, no allocation per frame.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, taperW, taperGlowW, tailW, tailGlowW, drawSparks, spark } from './light-kit.js';

const LOOKS = {
  arcane: { edge: [0.82, 0.9, 1.0], glow: [0.38, 0.32, 1.0] },
  fire: { edge: [1.0, 0.78, 0.4], glow: [1.0, 0.42, 0.1] },
  cold: { edge: [0.85, 0.96, 1.0], glow: [0.35, 0.72, 1.0] },
  lightning: { edge: [0.8, 0.92, 1.0], glow: [0.3, 0.6, 1.0] },
  poison: { edge: [0.8, 1.0, 0.55], glow: [0.32, 0.8, 0.15] },
};
const lookOf = (el) => LOOKS[el] || LOOKS.arcane;
const SPARKS = 90, MOTES = 40, CUTS = 8;
const HOLD = 0.16, PART = 0.3, CUT_T = 0.3, LINE_Y = 1.0, STREAK_FADE = 0.12;
const STREAKS = [[0, 1.0], [0.28, 0.72], [-0.24, 1.3]]; // side offset, height

export class DrawFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(83);
    this.core = new Ribbon(scene, camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.motes = []; this.free = [];
    this.look = LOOKS.arcane;
    // the wind-up (t of total), the dash streak, the lane's cut
    this.sheath = { t: 9, total: 0.35 };
    this.run = { live: false, fade: 9, x: 0, z: 0, ex: 0, ez: 0, dx: 0, dz: 1 };
    this.lane = { t: 9, x: 0, z: 0, ex: 0, ez: 0, dx: 0, dz: 1 };
    this.cuts = Array.from({ length: CUTS }, () => ({ t: 9, delay: 0, x: 0, y: 1, z: 0, dx: 0, dz: 1, lean: 0.6 })); this.cutI = 0;
  }
  windup(total, element) { this.look = lookOf(element); this.sheath.t = 0; this.sheath.total = Math.max(0.1, total); }
  // the rules' 'dashStrike': the hero leaves (x, z) along angle
  dash(e) {
    this.look = lookOf(e.element); this.sheath.t = 9;
    const R = this.run; R.live = true; R.fade = 0; R.x = R.ex = e.x; R.z = R.ez = e.z; R.dx = Math.sin(e.angle); R.dz = Math.cos(e.angle);
  }
  // the rules' 'lineStrike' on arrival: x, z where the dash began, angle, range the distance it went
  strike(e) {
    const L = this.lane, r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle);
    L.t = 0; L.x = e.x; L.z = e.z; L.dx = dx; L.dz = dz; L.ex = e.x + dx * e.range; L.ez = e.z + dz * e.range;
    this.run.live = false; this.run.fade = 0;
    // the sheath breaks at the hero's hip: shards thrown forward and out
    for (let i = 0; i < 12; i++) {
      const a = r() * 6.283, s = 2 + r() * 3.5;
      this.p.set(L.ex - dz * 0.25, 0.9, L.ez + dx * 0.25); this.v.set(Math.sin(a) * s + dx * 2.5, 1 + r() * 2.5, Math.cos(a) * s + dz * 2.5);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.25, 0.035, this.look);
    }
  }
  // a monster in the lane: a long diagonal cut across it, a hair after the lane flashes
  hit(c) {
    const q = this.cuts[this.cutI++ % CUTS], r = this.rnd, L = this.lane;
    q.t = 0; q.delay = 0.03 + r() * 0.05; q.x = c.x; q.y = c.y; q.z = c.z; q.dx = L.dx; q.dz = L.dz; q.lean = (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.2);
    for (let i = 0; i < 6; i++) { const a = r() * 6.283, s = 1.5 + r() * 2.5; this.p.set(c.x, c.y, c.z); this.v.set(Math.sin(a) * s + L.dx * 4, 0.6 + r() * 2, Math.cos(a) * s + L.dz * 4); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.22 + r() * 0.2, 0.06, this.look); }
  }
  // p: the hero (x, z), base/tip: the blade's hilt-side and tip points this frame (ground-relative)
  update(dt, p, base, tip) {
    this.core.begin(); this.glow.begin();
    const r = this.rnd, three = this.three, LOOK = this.look;
    // the sheath of light along the blade, closing from the hilt to the tip; motes drift into the hilt
    const S = this.sheath;
    if (S.t < S.total + 0.05) {
      S.t += dt; const k = Math.min(1, S.t / S.total), shut = 1 - (1 - k) * (1 - k), pulse = 0.85 + 0.15 * Math.sin(S.t * 40);
      three[0].copy(base); three[2].copy(base).lerp(tip, 0.15 + 0.85 * shut); three[1].copy(three[0]).lerp(three[2], 0.5);
      W.v = (0.09 + 0.08 * k) * pulse; this.glow.strip(three, lineGlowW, 0.7 + 0.3 * k, LOOK.glow); this.core.strip(three, lineW, 0.6 + 0.4 * k, LOOK.edge);
      for (let n = 0; n < 2; n++) if (r() < 0.8) {
        const u = r(), ox = (r() - 0.5) * 0.7, oy = (r() - 0.3) * 0.6, oz = (r() - 0.5) * 0.7;
        this.p.copy(base).lerp(tip, u); this.p.x += ox; this.p.y += oy; this.p.z += oz;
        this.v.copy(base).sub(this.p).multiplyScalar(3.5);
        spark(this.motes, this.free, MOTES, this.p, this.v, 0.22 + r() * 0.1, 0.045, LOOK);
      }
    }
    // the dash's streaks: from where it left to the hero, thick at the hero
    const R = this.run;
    if (R.live) { R.ex = p.x; R.ez = p.z; } else R.fade += dt;
    if (R.live || R.fade < STREAK_FADE) {
      const k = R.live ? 1 : 1 - R.fade / STREAK_FADE;
      for (const [side, y] of STREAKS) {
        three[0].set(R.x + R.dz * side, y, R.z - R.dx * side); three[2].set(R.ex + R.dz * side * 0.4, y, R.ez - R.dx * side * 0.4); three[1].copy(three[0]).lerp(three[2], 0.7);
        W.v = (side ? 0.08 : 0.15) * k; this.glow.strip(three, tailGlowW, k, LOOK.glow); this.core.strip(three, tailW, 0.9 * k, LOOK.edge);
      }
    }
    // the lane's cut: one white-hot line that holds a beat, then parts in two and fades, shedding sparks
    const L = this.lane;
    if (L.t < HOLD + PART) {
      L.t += dt;
      const part = Math.max(0, (L.t - HOLD) / PART), k = 1 - part, gap = 0.16 * (1 - (1 - part) * (1 - part));
      for (let s = part > 0 ? -1 : 0; s <= (part > 0 ? 1 : 0); s += 2) {
        three[0].set(L.x, LINE_Y + s * gap, L.z); three[2].set(L.ex, LINE_Y + s * gap, L.ez); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = (part > 0 ? 0.09 : 0.15) * k; this.glow.strip(three, taperGlowW, k, LOOK.glow); this.core.strip(three, taperW, k, LOOK.edge);
      }
      // its trace on the ground, so the lane reads from the high camera
      three[0].set(L.x, 0.06, L.z); three[2].set(L.ex, 0.06, L.ez); three[1].copy(three[0]).lerp(three[2], 0.5);
      W.v = 0.1 * k; this.glow.strip(three, taperGlowW, 0.6 * k, LOOK.glow); this.core.strip(three, taperW, 0.5 * k, LOOK.edge);
      if (part > 0 && r() < 0.8) {
        const u = r(); this.p.set(L.x + (L.ex - L.x) * u, LINE_Y, L.z + (L.ez - L.z) * u); this.v.set((r() - 0.5) * 2 + L.dx * 1.5, 0.8 + r() * 1.5, (r() - 0.5) * 2 + L.dz * 1.5);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.03, LOOK);
      }
    }
    // the cut marks: a long diagonal stroke across the target and a thin one beside it
    for (const q of this.cuts) {
      if (q.t >= q.delay + CUT_T) continue;
      q.t += dt; if (q.t < q.delay) continue;
      const k = (q.t - q.delay) / CUT_T, grow = Math.min(1, k * 5);
      for (let s = 0; s < 2; s++) {
        const len = (s ? 0.7 : 1.25) * grow, sx = q.dz * (s ? 0.16 : 0), sz = -q.dx * (s ? 0.16 : 0);
        // across the lane's side direction and down: the stroke a horizontal draw leaves, tilted
        three[0].set(q.x + sx + q.dz * len, q.y + q.lean * len, q.z + sz - q.dx * len);
        three[2].set(q.x + sx - q.dz * len, q.y - q.lean * len, q.z + sz + q.dx * len); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = (s ? 0.09 : 0.2) * (1 - k * 0.7); this.glow.strip(three, taperGlowW, 0.9 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
    }
    drawSparks(this.motes, this.free, dt, this.core, this.glow, three, 0);
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, three, 10);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.sheath.t = 9; this.run.live = false; this.run.fade = 9; this.lane.t = 9;
    for (const q of this.cuts) q.t = 9;
    for (const q of this.sparks) this.free.push(q); for (const q of this.motes) this.free.push(q);
    this.sparks.length = 0; this.motes.length = 0;
  }
  get busy() { return this.run.live || this.lane.t < HOLD + PART || this.sparks.length > 0 || this.motes.length > 0; }
}
