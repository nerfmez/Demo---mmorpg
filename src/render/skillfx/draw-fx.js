// Arcane Draw Cut (the spellblade's dash cut: a short wind-up, a 7 m dash along the aim, the lane it
// crossed cut a beat after the hero arrives), in the bench's light-and-ribbon language with Spell Wave's
// arcane blue-violet (an element mod recolours it). Motion principles from the Cartoon FX sword trails
// and hit sparks (docs/VFX-REFERENCE.md): a narrow taper, a fast leading edge, the cut shorter-lived than
// the trail, a compact high-contrast contact read before its small fragments, directional shards.
// Original geometry; nothing copied.
// Round 3 (owner: no draw crescent; the white line along the path is stiff; the hits are weak):
//  - wind-up: a sheath of light closes along the blade, rune motes drift into the hilt, focus lines on
//    the ground rush in to the hero's feet, a glint flares on the blade just before the draw;
//  - the draw: a ring and kicked sparks where the hero leaves;
//  - dash: no ruler line - a short comet tail that wavers behind the body and a slipstream of short
//    speed dashes at many heights, each drifting back and fading on its own (and the director's violet
//    afterimages); on arrival the tail collapses into the hero;
//  - the cut: it runs down the lane from where the dash began, a ripple of quick curved cuts in the air,
//    and on each monster struck a big curved slash drawn by a fast leading edge with a thinner one beside
//    it (the slide), a ragged flash and shards sprayed along the cut; the sheath breaks into shards.
// One ribbon pair, a few pooled flashes and sprites; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, flashMaterial } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, taperW, taperGlowW, tailW, tailGlowW, drawSparks, spark, circlePoints, flareTexture, lightSprite } from './light-kit.js';

const LOOKS = {
  arcane: { edge: [0.84, 0.88, 1.0], glow: [0.48, 0.36, 1.0], flash: ['#ffffff', '#cbbcff', '#6a4cff'] },
  fire: { edge: [1.0, 0.78, 0.4], glow: [1.0, 0.42, 0.1], flash: ['#fff6d0', '#ffb040', '#d8401a'] },
  cold: { edge: [0.85, 0.96, 1.0], glow: [0.35, 0.72, 1.0], flash: ['#ffffff', '#c4ecff', '#6fb4e6'] },
  lightning: { edge: [0.8, 0.92, 1.0], glow: [0.3, 0.6, 1.0], flash: ['#ffffff', '#8ce0ff', '#4080ff'] },
  poison: { edge: [0.8, 1.0, 0.55], glow: [0.32, 0.8, 0.15], flash: ['#f6ffd8', '#b4ee52', '#4f9a1e'] },
};
const SPRITE_EL = { fire: 'fire', cold: 'cold', lightning: 'lightning' }; // light-kit tints; the rest use arcane
const lookOf = (el) => LOOKS[el] || LOOKS.arcane;
const SPARKS = 160, MOTES = 40, SLASHES = 24, RAGGED = 8, FOCUS = 10, RING = 24, DASHES = 28, TAIL = 5, ARC = 13;
const RING_T = 0.3, GLINT_T = 0.12, COLLAPSE = 0.2, RAG_T = 0.2;
const RIPPLE = 0.016; // seconds per metre the cut runs down the lane
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class DrawFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(83); this.camera = camera; this.time = 0;
    this.core = new Ribbon(scene, camera, 2400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.arc = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.tailPts = Array.from({ length: TAIL }, () => new THREE.Vector3());
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.a = new THREE.Vector3(); this.d = new THREE.Vector3();
    this.sparks = []; this.motes = []; this.free = [];
    this.look = LOOKS.arcane; this.el = 'arcane';
    this.textures = {}; // per element, made once
    this.glint = lightSprite(scene, this.tex('arcane'), true, 12);
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.ragged = Array.from({ length: RAGGED }, (_, k) => { const m = new THREE.Mesh(this.quad, flashMaterial(23 + k * 3.7)); m.visible = false; m.renderOrder = 10; m.frustumCulled = false; scene.add(m); return { m, t: 9, delay: 0, x: 0, y: 1, z: 0, size: 1, seed: 0 }; }); this.ragI = 0;
    this.el = null; this.setElement('arcane'); // the ragged flashes' colours
    this.sheath = { t: 9, total: 0.35 };
    this.focus = Array.from({ length: FOCUS }, () => ({ a: 0, r0: 3, len: 0.8 }));
    this.start = { t: 9, x: 0, z: 0 };
    this.lane = { x: 0, z: 0, dx: 0, dz: 1 }; // where the dash began and its heading (the cut runs from there)
    // the dash: its heading, the body's recent path (the comet tail), the tail's collapse after arrival
    this.run = { live: false, t: 0, collapse: 9, x: 0, z: 0, dx: 0, dz: 1, emit: 0 };
    this.trail = []; // recent body points, newest last (pooled vectors from tailPool)
    this.tailPool = Array.from({ length: TAIL }, () => new THREE.Vector3());
    this.dashes = Array.from({ length: DASHES }, () => ({ t: 9, life: 0.3, x: 0, y: 1, z: 0, len: 1, w: 0.05 })); this.dashI = 0;
    // curved slashes: the ripple down the lane and the big ones on monsters struck
    this.slashes = Array.from({ length: SLASHES }, () => ({ t: 9, delay: 0, x: 0, y: 1, z: 0, ax: 0, ay: 1, az: 0, dx: 0, dz: 1, rad: 0.9, span: 1.9, w: 0.1, al: 1, side: 0 })); this.slashI = 0;
  }
  tex(el) { return this.textures[el] ||= flareTexture(SPRITE_EL[el] || 'arcane'); }
  setElement(el) {
    if (this.el === el) return;
    this.el = el; this.look = lookOf(el);
    this.glint.material.map = this.tex(el);
    for (const g of this.ragged) { const u = g.m.material.uniforms, f = this.look.flash; u.uIn.value.set(f[0]); u.uMid.value.set(f[1]); u.uOut.value.set(f[2]); }
  }
  raggedAt(x, y, z, size, delay) { const g = this.ragged[this.ragI++ % RAGGED]; g.t = 0; g.delay = delay; g.x = x; g.y = y; g.z = z; g.size = size; g.seed = this.rnd() * 40; }
  /**
   * A curved slash at (x, y, z): its long axis tilted `tilt` from the across-lane horizontal toward up,
   * bulging forward along the lane (dx, dz); rad its radius, span its angle, w its width, al its light,
   * delay before it draws, side an offset across the lane (the slide's second line).
   */
  slashAt(x, y, z, dx, dz, tilt, rad, span, w, al, delay, side = 0) {
    const q = this.slashes[this.slashI++ % SLASHES], c = Math.cos(tilt), s = Math.sin(tilt);
    q.t = 0; q.delay = delay; q.x = x; q.y = y; q.z = z; q.dx = dx; q.dz = dz; q.ax = dz * c; q.ay = s; q.az = -dx * c;
    q.rad = rad; q.span = span; q.w = w; q.al = al; q.side = side;
  }
  windup(total, element) {
    this.setElement(element || 'arcane'); this.sheath.t = 0; this.sheath.total = Math.max(0.1, total);
    for (const f of this.focus) { f.a = this.rnd() * 6.283; f.r0 = 2.6 + this.rnd() * 1.4; f.len = 0.5 + this.rnd() * 0.6; }
  }
  // the rules' 'dashStrike': the hero leaves (x, z) along angle
  dash(e) {
    this.setElement(e.element || 'arcane'); this.sheath.t = 9;
    const R = this.run, r = this.rnd; R.live = true; R.t = 0; R.collapse = 9; R.emit = 0; R.x = e.x; R.z = e.z; R.dx = Math.sin(e.angle); R.dz = Math.cos(e.angle);
    this.trail.length = 0;
    const L = this.lane; L.x = e.x; L.z = e.z; L.dx = R.dx; L.dz = R.dz;
    this.start.t = 0; this.start.x = e.x; this.start.z = e.z;
    for (let i = 0; i < 10; i++) { // kicked back off the ground where it left
      const a = (r() - 0.5) * 1.6, s = 2 + r() * 3;
      this.p.set(e.x, 0.15, e.z); this.v.set(-R.dx * s * Math.cos(a) + R.dz * s * Math.sin(a), 0.8 + r() * 1.8, -R.dz * s * Math.cos(a) - R.dx * s * Math.sin(a));
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.05, this.look);
    }
  }
  // the rules' 'dashArrive': the tail collapses into the hero (then the breath before the cut)
  arrive() { this.run.live = false; this.run.collapse = 0; }
  // the rules' 'lineStrike' (the cut, after the breath): x, z where the dash began, angle, range the distance it went
  strike(e) {
    const r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), ex = e.x + dx * e.range, ez = e.z + dz * e.range;
    // the cut runs down the lane: quick curved cuts in the air, about one per 1.3 m
    for (let d = 0.8; d < e.range - 0.3; d += 1.1 + r() * 0.5) {
      const off = (r() - 0.5) * 0.9;
      this.slashAt(e.x + dx * d + dz * off, 0.7 + r() * 0.7, e.z + dz * d - dx * off, dx, dz, (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), 0.5 + r() * 0.25, 1.6, 0.07, 0.75, d * RIPPLE);
    }
    // the sheath breaks at the hero's hip: shards thrown forward and out
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.283, s = 2 + r() * 4;
      this.p.set(ex - dz * 0.25, 0.9, ez + dx * 0.25); this.v.set(Math.sin(a) * s + dx * 2.5, 1 + r() * 3, Math.cos(a) * s + dz * 2.5);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.32 + r() * 0.25, 0.05, this.look);
    }
  }
  // a monster in the lane: a big curved slash with its slide, a ragged flash and shards along the cut,
  // when the running cut reaches it
  hit(c) {
    const r = this.rnd, L = this.lane;
    const delay = Math.max(0, (c.x - L.x) * L.dx + (c.z - L.z) * L.dz) * RIPPLE, tilt = (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.25);
    this.slashAt(c.x, c.y, c.z, L.dx, L.dz, tilt, 1.0, 1.9, 0.2, 1, delay);
    this.slashAt(c.x, c.y, c.z, L.dx, L.dz, tilt, 0.85, 1.6, 0.08, 0.8, delay + 0.03, 0.22);
    this.raggedAt(c.x, c.y, c.z, 1.7, delay);
    // shards along the cut (both ways down its long axis) and a few thrown forward
    const c0 = Math.cos(tilt), s0 = Math.sin(tilt), ax = L.dz * c0, ay = s0, az = -L.dx * c0;
    for (let i = 0; i < 12; i++) {
      const sg = i % 2 ? 1 : -1, s = 3 + r() * 4;
      this.p.set(c.x, c.y, c.z); this.v.set(ax * s * sg + L.dx * (1 + r() * 2), ay * s * sg + 0.5 + r(), az * s * sg + L.dz * (1 + r() * 2));
      const n = this.sparks.length;
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.22 + r() * 0.2, 0.06, this.look);
      if (this.sparks.length > n) this.sparks[n].life = -delay; // waits for the running cut
    }
  }
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
      W.v = (0.09 + 0.08 * k) * pulse; this.glow.strip(three, lineGlowW, 1.2 * (0.6 + 0.4 * k), LOOK.glow); this.core.strip(three, lineW, 0.6 + 0.4 * k, LOOK.edge);
      for (let n = 0; n < 2; n++) if (r() < 0.8) {
        this.p.copy(base).lerp(tip, r()); this.p.x += (r() - 0.5) * 0.7; this.p.y += (r() - 0.3) * 0.6; this.p.z += (r() - 0.5) * 0.7;
        this.v.copy(base).sub(this.p).multiplyScalar(3.5);
        spark(this.motes, this.free, MOTES, this.p, this.v, 0.22 + r() * 0.1, 0.045, LOOK);
      }
      const fk = Math.min(1, k * 1.15), fa = Math.sin(Math.PI * Math.min(1, k * 1.1));
      for (const f of this.focus) {
        const rr = f.r0 * (1 - 0.75 * out2(fk)), ca = Math.cos(f.a), sa = Math.sin(f.a);
        three[0].set(p.x + ca * (rr + f.len), 0.05, p.z + sa * (rr + f.len)); three[2].set(p.x + ca * rr, 0.05, p.z + sa * rr); three[1].copy(three[0]).lerp(three[2], 0.6);
        W.v = 0.05; this.glow.strip(three, tailGlowW, 0.7 * fa, LOOK.glow); this.core.strip(three, tailW, 0.75 * fa, LOOK.edge);
      }
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
    // ---- the dash: the body's comet tail and a slipstream of short speed dashes ----
    const R = this.run;
    if (R.live) {
      R.t += dt;
      const tr = this.trail;
      if (tr.length === TAIL) { const v = tr.shift(); tr.push(v); } else tr.push(this.tailPool[tr.length]);
      tr[tr.length - 1].set(p.x, 1.0, p.z);
      R.emit += dt;
      while (R.emit > 0.009) { // a speed dash beside or behind the body, at its own height and length
        R.emit -= 0.009;
        const q = this.dashes[this.dashI++ % DASHES], side = (r() - 0.5) * 1.3, back = r() * 0.8;
        q.t = 0; q.life = 0.22 + r() * 0.22; q.len = 0.8 + r() * 1.4; q.w = 0.015 + r() * 0.025; q.y = 0.25 + r() * 1.35;
        q.x = p.x - R.dx * back + R.dz * side; q.z = p.z - R.dz * back - R.dx * side;
      }
    } else if (R.collapse < COLLAPSE) R.collapse += dt;
    // the comet tail: the body's last points, wavering, thick at the body; it collapses into it on arrival
    const tr = this.trail;
    if (tr.length > 2 && (R.live || R.collapse < COLLAPSE)) {
      const k = R.live ? 1 : 1 - R.collapse / COLLAPSE, n = tr.length, keep = Math.max(2, Math.round(n * k));
      for (let i = 0; i < TAIL; i++) {
        const src = tr[Math.min(n - 1, n - keep + Math.floor((i / (TAIL - 1)) * (keep - 1)))];
        this.tailPts[i].set(src.x, src.y + 0.14 * Math.sin(i * 0.9 + this.time * 26) * (1 - i / TAIL), src.z);
      }
      W.v = 0.1 * k; this.glow.strip(this.tailPts, tailGlowW, 1.1 * k, LOOK.glow); this.core.strip(this.tailPts, tailW, 0.5 * k, LOOK.edge);
    }
    for (const q of this.dashes) {
      if (q.t >= q.life) continue;
      q.t += dt; const u = q.t / q.life, k = 1 - u;
      // each drifts back off the body and shrinks from its tail
      const x0 = q.x - R.dx * 1.5 * q.t, z0 = q.z - R.dz * 1.5 * q.t, len = q.len * (1 - 0.6 * u);
      three[2].set(x0, q.y, z0); three[0].set(x0 - R.dx * len, q.y, z0 - R.dz * len); three[1].copy(three[0]).lerp(three[2], 0.65);
      W.v = q.w * k; this.glow.strip(three, tailGlowW, 0.9 * k, LOOK.glow); this.core.strip(three, tailW, 0.6 * k, LOOK.edge);
    }
    // ---- curved slashes: a fast leading edge draws each, then its tail retracts ----
    for (const q of this.slashes) {
      if (q.t >= q.delay + 0.32) continue;
      q.t += dt; const u = q.t - q.delay; if (u < 0) continue;
      const head = Math.min(1, u / 0.05), tail = Math.max(0, (u - 0.1) / 0.22); if (tail >= head) continue;
      const fade = 1 - tail * tail, ox = q.dz * q.side, oz = -q.dx * q.side;
      for (let i = 0; i < ARC; i++) {
        const f = tail + (head - tail) * (i / (ARC - 1)), ang = (f - 0.5) * q.span, sw = Math.sin(ang) * q.rad, bw = (Math.cos(ang) - Math.cos(q.span / 2)) * q.rad * 0.55;
        this.arc[i].set(q.x + ox + q.ax * sw + q.dx * bw, q.y + q.ay * sw, q.z + oz + q.az * sw + q.dz * bw);
      }
      W.v = q.w * (1 - 0.5 * tail); this.glow.strip(this.arc, taperGlowW, q.al * fade, LOOK.glow); this.core.strip(this.arc, taperW, q.al * fade, LOOK.edge);
    }
    // ---- ragged flashes on the monsters struck ----
    for (const g of this.ragged) {
      if (g.t >= g.delay + RAG_T) { g.m.visible = false; continue; }
      g.t += dt; const u = g.t - g.delay; if (u < 0) { g.m.visible = false; continue; }
      g.m.visible = true; place(g.m, g.x, g.y, g.z); g.m.quaternion.copy(this.camera.quaternion);
      g.m.scale.setScalar(g.size * (u < 0.03 ? 0.6 + u / 0.075 : 1));
      g.m.material.uniforms.uT.value = u / RAG_T; g.m.material.uniforms.uSeed.value = g.seed + Math.floor(u * 30);
    }
    drawSparks(this.motes, this.free, dt, this.core, this.glow, three, 0);
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, three, 10);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.sheath.t = 9; this.start.t = 9; this.run.live = false; this.run.collapse = 9; this.trail.length = 0; this.glint.visible = false;
    for (const q of this.dashes) q.t = 9; for (const q of this.slashes) q.t = 9;
    for (const g of this.ragged) { g.t = 9; g.m.visible = false; }
    for (const q of this.sparks) this.free.push(q); for (const q of this.motes) this.free.push(q);
    this.sparks.length = 0; this.motes.length = 0;
  }
  get busy() { return this.run.live || this.run.collapse < COLLAPSE || this.slashes.some((q) => q.t < q.delay + 0.32) || this.sparks.length > 0 || this.motes.length > 0; }
}
