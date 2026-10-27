// Blink Draw (the spellblade's dash cut: a short wind-up, a 7 m dash along the aim, the lane it
// crossed cut a beat after the hero arrives), in the bench's light-and-ribbon language with Spell Wave's
// arcane blue-violet (an element mod recolours it). Motion principles from the Cartoon FX sword trails
// and hit sparks (docs/VFX-REFERENCE.md): a narrow taper, a fast leading edge, the cut shorter-lived than
// the trail, directional shards after the contact. Original geometry; nothing copied.
// Round 2 (owner: "stiff and plain"): the anime iaido beats, each with its own layer -
//  - wind-up: a sheath of light closes along the blade, rune motes drift into the hilt, focus lines on
//    the ground rush in to the hero's feet, and a glint flares on the blade just before the draw;
//  - the draw: a ring and kicked sparks where the hero leaves (and the body's afterimages);
//  - dash: three speed streaks from where the hero left to where it is; they hang on through the breath
//    after it arrives, giving way from where it left;
//  - arrival: a small glint at the blade, then the breath (the rules' cutDelay);
//  - the cut: one white-hot line runs down the lane, holds a beat, then parts in two and gives way;
//    two thinner cut lines cross it at a slant, a trace on the ground, the sheath breaks into shards at
//    the hero, and on each monster in the lane an X of cuts with a glint.
// Round 4 (owner: keep that look, make it good enough; round 3's hits are out): every line is a blade -
// many points, sharp at both ends and fullest just behind its leading end, a faint shimmer along it -
// and is drawn by a fast leading edge and gives way from its tail, never popping in or out as a bar.
// One ribbon pair, a few pooled sprites and sparks; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, mulberry32, place } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, drawSparks, spark, circlePoints, flareTexture, lightSprite } from './light-kit.js';

const LOOKS = {
  arcane: { edge: [0.84, 0.88, 1.0], glow: [0.48, 0.36, 1.0] },
  fire: { edge: [1.0, 0.78, 0.4], glow: [1.0, 0.42, 0.1] },
  cold: { edge: [0.85, 0.96, 1.0], glow: [0.35, 0.72, 1.0] },
  lightning: { edge: [0.8, 0.92, 1.0], glow: [0.3, 0.6, 1.0] },
  poison: { edge: [0.8, 1.0, 0.55], glow: [0.32, 0.8, 0.15] },
};
const SPRITE_EL = { fire: 'fire', cold: 'cold', lightning: 'lightning' }; // light-kit tints; the rest use arcane
const lookOf = (el) => LOOKS[el] || LOOKS.arcane;
const SPARKS = 120, MOTES = 40, CUTS = 8, FLASHES = 8, FOCUS = 10, RING = 24;
const HOLD = 0.14, PART = 0.3, CUT_T = 0.32, LINE_Y = 1.0, STREAK_HANG = 0.3, RING_T = 0.3, GLINT_T = 0.12;
const STREAKS = [[0, 1.0], [0.3, 0.7], [-0.26, 1.32]]; // side offset, height
const SLANTS = [[0.12, 0.05], [-0.1, 0.11]]; // the crossing cut lines: tilt (rad about the lane), delay
const out2 = (k) => 1 - (1 - k) * (1 - k);
const N = 16; // points along a blade line
// a blade line's width: sharp at both ends, fullest just behind its leading end (x = 1), a faint
// shimmer along it (NW.s, NW.ph)
const NW = { v: 0, s: 0, ph: 0 };
const needleW = (x) => NW.v * Math.pow(Math.sin(Math.PI * x), 0.6) * (0.5 + 0.5 * x) * (1 + NW.s * Math.sin(x * 31 + NW.ph));
const needleGlowW = (x) => needleW(x) * 2.8;

export class DrawFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(83); this.time = 0;
    this.core = new Ribbon(scene, camera, 2400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.line = Array.from({ length: N }, () => new THREE.Vector3());
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.motes = []; this.free = [];
    this.look = LOOKS.arcane; this.el = 'arcane';
    this.textures = {}; // per element, made once
    this.glint = lightSprite(scene, this.tex('arcane'), true, 12);
    this.flashes = Array.from({ length: FLASHES }, () => ({ sp: lightSprite(scene, this.tex('arcane'), true, 11), t: 9, x: 0, y: 1, z: 0, size: 1, spin: 0 })); this.flashI = 0;
    this.sheath = { t: 9, total: 0.35 };
    this.focus = Array.from({ length: FOCUS }, () => ({ a: 0, r0: 3, len: 0.8 }));
    this.start = { t: 9, x: 0, z: 0 };
    this.run = { live: false, hang: 9, x: 0, z: 0, ex: 0, ez: 0, dx: 0, dz: 1 };
    this.lane = { t: 9, x: 0, z: 0, ex: 0, ez: 0, dx: 0, dz: 1 };
    this.cuts = Array.from({ length: CUTS }, () => ({ t: 9, delay: 0, x: 0, y: 1, z: 0, dx: 0, dz: 1, lean: 0.6 })); this.cutI = 0;
  }
  tex(el) { return this.textures[el] ||= flareTexture(SPRITE_EL[el] || 'arcane'); }
  setElement(el) {
    if (this.el === el) return;
    this.el = el; this.look = lookOf(el);
    this.glint.material.map = this.tex(el);
    for (const f of this.flashes) f.sp.material.map = this.tex(el);
  }
  flash(x, y, z, size) { const f = this.flashes[this.flashI++ % FLASHES]; f.t = 0; f.x = x; f.y = y; f.z = z; f.size = size; f.spin = this.rnd() * 3; }
  /**
   * A blade line from a to b (ground-relative), drawn between `from` and `to` (0..1 along it: a
   * leading edge drawing it in, a tail giving way), w its width, al its light, wave a small rise and
   * fall along it, glowK the halo's share.
   */
  needle(ax, ay, az, bx, by, bz, from, to, w, al, wave = 0, glowK = 1) {
    if (to - from < 0.02 || al <= 0) return;
    for (let i = 0; i < N; i++) {
      const u = from + (to - from) * (i / (N - 1));
      this.line[i].set(ax + (bx - ax) * u, ay + (by - ay) * u + wave * Math.sin(u * 9 + this.time * 30) * Math.sin(Math.PI * u), az + (bz - az) * u);
    }
    NW.v = w; NW.s = 0.18; NW.ph = this.time * 40;
    this.glow.strip(this.line, needleGlowW, glowK * al, this.look.glow); this.core.strip(this.line, needleW, al, this.look.edge);
  }
  windup(total, element) {
    this.setElement(element || 'arcane'); this.sheath.t = 0; this.sheath.total = Math.max(0.1, total);
    for (const f of this.focus) { f.a = this.rnd() * 6.283; f.r0 = 2.6 + this.rnd() * 1.4; f.len = 0.5 + this.rnd() * 0.6; }
  }
  // the rules' 'dashStrike': the hero leaves (x, z) along angle
  dash(e) {
    this.setElement(e.element || 'arcane'); this.sheath.t = 9;
    const R = this.run, r = this.rnd; R.live = true; R.hang = 0; R.x = R.ex = e.x; R.z = R.ez = e.z; R.dx = Math.sin(e.angle); R.dz = Math.cos(e.angle);
    this.start.t = 0; this.start.x = e.x; this.start.z = e.z;
    for (let i = 0; i < 10; i++) { // kicked back off the ground where it left
      const a = (r() - 0.5) * 1.6, s = 2 + r() * 3;
      this.p.set(e.x, 0.15, e.z); this.v.set(-R.dx * s * Math.cos(a) + R.dz * s * Math.sin(a), 0.8 + r() * 1.8, -R.dz * s * Math.cos(a) - R.dx * s * Math.sin(a));
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.05, this.look);
    }
  }
  // the rules' 'dashArrive': a small flash at the blade, then the breath before the cut
  arrive(x, z, angle) { this.run.live = false; this.flash(x + Math.sin(angle) * 0.7, 0.6, z + Math.cos(angle) * 0.7, 0.7); }
  // the rules' 'lineStrike' (the cut, after the breath): x, z where the dash began, angle, range the distance it went
  strike(e) {
    const L = this.lane, r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle);
    L.t = 0; L.x = e.x; L.z = e.z; L.dx = dx; L.dz = dz; L.ex = e.x + dx * e.range; L.ez = e.z + dz * e.range;
    this.run.live = false; this.run.hang = Math.max(this.run.hang, STREAK_HANG - 0.05);
    this.flash(L.ex, 0.9, L.ez, 1.6);
    // the sheath breaks at the hero's hip: shards thrown forward and out
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.283, s = 2 + r() * 4;
      this.p.set(L.ex - dz * 0.25, 0.9, L.ez + dx * 0.25); this.v.set(Math.sin(a) * s + dx * 2.5, 1 + r() * 3, Math.cos(a) * s + dz * 2.5);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.32 + r() * 0.25, 0.05, this.look);
    }
  }
  // a monster in the lane: an X of cuts across it with a flash, a hair after the lane falls apart
  hit(c) {
    const q = this.cuts[this.cutI++ % CUTS], r = this.rnd, L = this.lane;
    q.t = 0; q.delay = 0.02 + r() * 0.05; q.x = c.x; q.y = c.y; q.z = c.z; q.dx = L.dx; q.dz = L.dz; q.lean = 0.55 + r() * 0.2;
    this.flash(c.x, c.y, c.z, 1.3);
    for (let i = 0; i < 8; i++) { const a = r() * 6.283, s = 1.5 + r() * 3; this.p.set(c.x, c.y, c.z); this.v.set(Math.sin(a) * s + L.dx * 4, 0.6 + r() * 2.4, Math.cos(a) * s + L.dz * 4); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.25 + r() * 0.2, 0.06, this.look); }
  }
  // a line of light along `three` (set by the caller), w its width, al its light
  stroke(fn, gfn, w, al, glowK = 0.9) { W.v = w; this.glow.strip(this.three, gfn, glowK * al, this.look.glow); this.core.strip(this.three, fn, al, this.look.edge); }
  // p: the hero (x, z), base/tip: the blade's hilt-side and tip points this frame (ground-relative)
  update(dt, p, base, tip) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const r = this.rnd, three = this.three, LOOK = this.look;
    // ---- wind-up: the sheath along the blade, motes into the hilt, focus lines rushing in, the glint ----
    const S = this.sheath;
    this.glint.visible = false;
    if (S.t < S.total + 0.05) {
      S.t += dt; const k = Math.min(1, S.t / S.total), shut = out2(k), pulse = 0.85 + 0.15 * Math.sin(S.t * 40);
      three[0].copy(base); three[2].copy(base).lerp(tip, 0.15 + 0.85 * shut); three[1].copy(three[0]).lerp(three[2], 0.5);
      this.stroke(lineW, lineGlowW, (0.09 + 0.08 * k) * pulse, 0.6 + 0.4 * k, 1.2);
      for (let n = 0; n < 2; n++) if (r() < 0.8) {
        this.p.copy(base).lerp(tip, r()); this.p.x += (r() - 0.5) * 0.7; this.p.y += (r() - 0.3) * 0.6; this.p.z += (r() - 0.5) * 0.7;
        this.v.copy(base).sub(this.p).multiplyScalar(3.5);
        spark(this.motes, this.free, MOTES, this.p, this.v, 0.22 + r() * 0.1, 0.045, LOOK);
      }
      // focus lines on the ground, rushing in to the feet (anime speed lines), fading as they arrive
      const fk = Math.min(1, k * 1.15), fa = Math.sin(Math.PI * Math.min(1, k * 1.1));
      for (const f of this.focus) {
        const rr = f.r0 * (1 - 0.75 * out2(fk)), ca = Math.cos(f.a), sa = Math.sin(f.a);
        three[0].set(p.x + ca * (rr + f.len), 0.05, p.z + sa * (rr + f.len)); three[2].set(p.x + ca * rr, 0.05, p.z + sa * rr); three[1].copy(three[0]).lerp(three[2], 0.6);
        this.stroke(tailW, tailGlowW, 0.05, 0.75 * fa);
      }
      // the glint on the blade, just before the draw
      const gk = (S.t - (S.total - GLINT_T)) / GLINT_T;
      if (gk > 0 && gk < 1) {
        this.glint.visible = true; place(this.glint, tip.x, tip.y, tip.z);
        this.glint.scale.setScalar(1.1 * Math.sin(Math.PI * gk) + 0.15); this.glint.material.rotation = gk * 1.2; this.glint.material.opacity = 1;
      }
    }
    // ---- the draw: a ring opening where the hero left ----
    const T = this.start;
    if (T.t < RING_T) {
      T.t += dt; const k = T.t / RING_T;
      circlePoints(this.ring, T.x, T.z, 0.4 + 1.6 * out2(k), 0.06);
      W.v = 0.07 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.9 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 1 - k, LOOK.edge);
    }
    // ---- the dash's streaks: from where it left to the hero, thick at the hero; they hang through the breath ----
    const R = this.run;
    if (R.live) { R.ex = p.x; R.ez = p.z; } else R.hang += dt;
    if (R.live || R.hang < STREAK_HANG) {
      // they give way from where the hero left toward where it stands
      const k = R.live ? 1 : 1 - R.hang / STREAK_HANG, from = R.live ? 0 : out2(R.hang / STREAK_HANG);
      for (const [side, y] of STREAKS) {
        this.needle(R.x + R.dz * side, y, R.z - R.dx * side, R.ex + R.dz * side * 0.4, y, R.ez - R.dx * side * 0.4, from, 1, side ? 0.07 : 0.13, k, side ? 0.03 : 0.05, 1.1);
      }
    }
    // ---- the cut: a white-hot line runs down the lane, holds, then parts in two and gives way; two slanted
    //      cuts cross it; a trace on the ground ----
    const L = this.lane;
    if (L.t < HOLD + PART + 0.12) {
      L.t += dt;
      const draw = out2(Math.min(1, L.t / 0.06)), part = Math.max(0, (L.t - HOLD) / PART), k = Math.max(0, 1 - part * part), gap = 0.16 * out2(Math.min(1, part));
      if (part < 1) {
        const from = 0.75 * out2(part), to = draw * (1 - 0.15 * part);
        for (let s = part > 0 ? -1 : 0; s <= (part > 0 ? 1 : 0); s += 2) {
          this.needle(L.x, LINE_Y + s * gap, L.z, L.ex, LINE_Y + s * gap, L.ez, from, to, (part > 0 ? 0.1 : 0.19) * (1 - 0.5 * part), k, 0.02, 1.15);
        }
        this.needle(L.x, 0.06, L.z, L.ex, 0.06, L.ez, from, to, 0.11, 0.6 * k);
      }
      for (const [tilt, delay] of SLANTS) {
        const u = (L.t - delay) / 0.3; if (u <= 0 || u >= 1) continue;
        const half = 0.5 * Math.hypot(L.ex - L.x, L.ez - L.z), cx = (L.x + L.ex) / 2, cz = (L.z + L.ez) / 2, rise = Math.tan(tilt) * half;
        this.needle(cx - L.dx * half, LINE_Y - rise, cz - L.dz * half, cx + L.dx * half, LINE_Y + rise, cz + L.dz * half, out2(Math.max(0, (u - 0.35) / 0.65)), out2(Math.min(1, u * 5)), 0.08, 1 - u * u);
      }
      if (part > 0 && k > 0 && r() < 0.9) {
        const u = r(); this.p.set(L.x + (L.ex - L.x) * u, LINE_Y, L.z + (L.ez - L.z) * u); this.v.set((r() - 0.5) * 2 + L.dx * 1.5, 0.8 + r() * 1.5, (r() - 0.5) * 2 + L.dz * 1.5);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.035, LOOK);
      }
    }
    // ---- an X of cuts on each monster struck: each stroke drawn by a fast leading edge, the second a hair
    //      after the first, then giving way from its tail ----
    for (const q of this.cuts) {
      if (q.t >= q.delay + CUT_T) continue;
      q.t += dt; if (q.t < q.delay) continue;
      for (let s = 0; s < 2; s++) {
        const u = q.t - q.delay - s * 0.05; if (u <= 0) continue;
        const to = out2(Math.min(1, u / 0.05)), from = out2(Math.max(0, (u - 0.1) / 0.2)), len = 1.25, lean = (s ? -1 : 1) * q.lean;
        this.needle(q.x + q.dz * len, q.y + lean * len, q.z - q.dx * len, q.x - q.dz * len, q.y - lean * len, q.z + q.dx * len, from, to, s ? 0.15 : 0.21, 1 - from, 0, 1.2);
      }
    }
    // ---- flashes ----
    for (const f of this.flashes) {
      if (f.t >= 0.18) { f.sp.visible = false; continue; }
      f.t += dt; const k = f.t / 0.18;
      f.sp.visible = true; place(f.sp, f.x, f.y, f.z); f.sp.scale.setScalar(f.size * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.15))); f.sp.material.rotation = f.spin + k * 0.8; f.sp.material.opacity = 1 - k * k;
    }
    drawSparks(this.motes, this.free, dt, this.core, this.glow, three, 0);
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, three, 10);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.sheath.t = 9; this.start.t = 9; this.run.live = false; this.run.hang = 9; this.lane.t = 9; this.glint.visible = false;
    for (const q of this.cuts) q.t = 9;
    for (const f of this.flashes) { f.t = 9; f.sp.visible = false; }
    for (const q of this.sparks) this.free.push(q); for (const q of this.motes) this.free.push(q);
    this.sparks.length = 0; this.motes.length = 0;
  }
  get busy() { return this.run.live || this.lane.t < HOLD + PART + 0.12 || this.sparks.length > 0 || this.motes.length > 0; }
}
