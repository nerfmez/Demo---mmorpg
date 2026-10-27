// Party buff shouts (Rally, Frenzy Roar, Stand Firm, Hold the Line; Blessing of Light is skillfx/bless-fx.js; the other warcry buffs take their own look from LOOKS), held to the
// owner's bar (.claude/skills/skill-vfx), in the bench's light-and-ribbon language.
//  - rouse (the cast): embers spiral up round the hero, gathering speed (a roar: air drawn in to the mouth);
//  - the shout (the rules' 'buff'): a ring of light races out at waist height to the buff's true
//    radius (in the air: nothing on the ground) with an echo, shout lines burst out round the hero like
//    a manga roar, spirit streaks shoot up round the hero with a star glint, and over every body the buff
//    reached (the hero and allies in range) up-chevrons rise and fade: the anime "power up" mark (a guard
//    buff: a shield emblem pops up over each body and holds; a guardian's (wall): a ring of shields
//    snaps up round the hero one after another, a shield wall);
//  - a roar (Frenzy Roar, owner: it should look like its name) instead sends sound: smooth rings pulse out
//    one after another at head height to the true radius, a blast of arcs ")))" bursts ahead of the
//    mouth, and the camera rumbles;
//  - while it lasts: a few streaks of the same colour drift up off each buffed body (trail 'back': they
//    stream back from the way it faces, for a speed buff; 'orbit': they circle the body, for a guard).
// One ribbon pair, one glint sprite and pooled sparks: light on an iPad, and buffs run for many seconds.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, sparkW, sparkGlowW, circlePoints, drawSparks, spark, flareTexture, lightSprite } from './light-kit.js';

// per skill: core/glow colours; flare = the glint's tint; symbol 'up' = rising chevrons (more damage),
// 'shield' = a shield emblem (less damage taken); roar = sound waves instead of the shout; trail 'back' =
// the lasting streaks stream back from the facing, 'orbit' = they circle the body; wall = a ring of shields
// round the hero, double = the shield emblem drawn twice (one inside the other)
export const LOOKS = {
  rally: { edge: [1.0, 0.6, 0.22], glow: [1.0, 0.24, 0.06], symbol: 'up' },
  frenzy_roar: { edge: [1.0, 0.3, 0.32], glow: [1.0, 0.04, 0.12], roar: true, trail: 'back' },
  stand_firm: { edge: [0.62, 0.86, 1.0], glow: [0.12, 0.42, 1.0], flare: 'cold', symbol: 'shield', trail: 'orbit' },
  team_stand: { edge: [1.0, 0.88, 0.5], glow: [1.0, 0.55, 0.08], symbol: 'shield', double: true, wall: true, trail: 'orbit' },
};
const RING = 49, STREAKS = 10, STREAK_PTS = 6, SPARKS = 140, MARKS = 6, CHEV = 3, RAYS = 16, ARC = 13;
const RING_LIFE = 0.45, STREAK_LIFE = 0.55, MARK_LIFE = 1.0, AURA_EVERY = 0.16, RAY_LIFE = 0.3;
// a heater shield's outline (screen units: x right, y up), closed
const SHIELD = [[-1, 1], [-0.33, 1.08], [0.33, 1.08], [1, 1], [1, 0.25], [0.8, -0.35], [0.45, -0.8], [0, -1.15], [-0.45, -0.8], [-0.8, -0.35], [-1, 0.25], [-1, 1]];
const WALL = 8, WALL_R = 1.7, WALL_LIFE = 0.95;
const WAVES = 5, WAVE_EVERY = 0.09, WAVE_LIFE = 0.6, BLASTS = 5, BLAST_EVERY = 0.06, BLAST_LIFE = 0.42, MOUTH = 1.35;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class BuffFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(61);
    this.core = new Ribbon(scene, camera, 1500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.flare = lightSprite(scene, flareTexture('fire'), true, 11);
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.arc = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.shield = SHIELD.map(() => new THREE.Vector3());
    this.spts = Array.from({ length: STREAK_PTS }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.streaks = Array.from({ length: STREAKS }, () => ({ a: 0, r: 0.5, h: 2, delay: 0 }));
    this.rays = Array.from({ length: RAYS }, () => ({ a: 0, len: 1 }));
    this.marks = Array.from({ length: MARKS }, () => ({ x: 0, z: 0, t: 9 }));
    this.right = new THREE.Vector3(); this.up = new THREE.Vector3(); this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.look = LOOKS.rally; this.x = 0; this.z = 0; this.f = 0; this.radius = 8; this.t = 9; this.rT = 9; this.rLife = 0.3; this.aura = {};
    this.onShake = null;
  }
  // the cast: embers spiral up round the hero for `dur` seconds (a roar: air drawn in to the mouth)
  rouse(skill, x, z, dur) {
    this.look = LOOKS[skill] || LOOKS.rally; this.x = x; this.z = z; this.rT = 0; this.rLife = Math.max(0.15, dur);
    const r = this.rnd;
    if (this.look.roar) {
      for (let i = 0; i < 16; i++) {
        const a = r() * 6.283, d = 1.6 + r() * 0.8, life = this.rLife * (0.7 + r() * 0.3);
        this.p.set(x + Math.sin(a) * d, 0.6 + r() * 1.4, z + Math.cos(a) * d);
        this.v.set(x - this.p.x, MOUTH - this.p.y, z - this.p.z).multiplyScalar(0.9 / life);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, life, 0.05, this.look);
      }
      return;
    }
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.283, d = 0.6 + r() * 0.6;
      this.p.set(x + Math.sin(a) * d, 0.1 + r() * 0.4, z + Math.cos(a) * d);
      this.v.set(Math.cos(a) * 1.6 - Math.sin(a) * 0.8, 2.5 + r() * 2, -Math.sin(a) * 1.6 - Math.cos(a) * 0.8);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.25, 0.06, this.look);
      this.sparks[this.sparks.length - 1].life = -r() * this.rLife * 0.6;
    }
  }
  // the shout: bodies [{x, z, facing}] the buff reached (the hero first)
  shout(skill, x, z, radius, bodies) {
    this.look = LOOKS[skill] || LOOKS.rally; this.x = x; this.z = z; this.f = bodies[0]?.facing || 0; this.radius = radius || 1.5; this.t = 0;
    this.flare.material.map = flareTexture(this.look.flare || 'fire');
    const r = this.rnd;
    this.streaks.forEach((s, i) => { s.a = (i / STREAKS) * 6.283 + r() * 0.4; s.r = 0.35 + r() * 0.35; s.h = 2.2 + r() * 1.2; s.delay = r() * 0.08; });
    this.rays.forEach((q, i) => { q.a = (i / RAYS) * 6.283 + (r() - 0.5) * 0.25; q.len = 1.6 + r() * 1.4; });
    let k = 0;
    for (const b of bodies) { if (k >= MARKS) break; const m = this.marks[k++]; m.x = b.x; m.z = b.z; m.t = k === 1 ? 0 : -0.08 - 0.03 * k; }
    for (; k < MARKS; k++) this.marks[k].t = 9;
    if (this.look.roar) this.onShake?.(0.14, 0.45); // a roar rumbles
    else this.onShake?.(0.06, 0.12);
  }
  // the hero moves while the shout plays: its own marks follow
  follow(x, z) { this.x = x; this.z = z; this.marks[0].x = x; this.marks[0].z = z; }
  // the lasting glow of one buff: streaks off each body ({x, z, facing}) still holding it
  linger(skill, dt, bodies) {
    const look = LOOKS[skill], left = (this.aura[skill] || 0) + dt;
    if (left < AURA_EVERY) { this.aura[skill] = left; return; }
    this.aura[skill] = left - AURA_EVERY;
    const r = this.rnd;
    for (const b of bodies) for (let i = 0; i < 2; i++) {
      const a = r() * 6.283, f = b.facing || 0;
      this.p.set(b.x + Math.sin(a) * 0.4, 0.15 + r() * 0.9, b.z + Math.cos(a) * 0.4);
      if (look.trail === 'back') this.v.set(-Math.sin(f) * (4 + r() * 2), 0.3, -Math.cos(f) * (4 + r() * 2)); // trails streaming back
      else if (look.trail === 'orbit') this.v.set(Math.cos(a) * 3, 0.4, -Math.sin(a) * 3); // round the body
      else this.v.set(0, 3.5 + r() * 1.5, 0); // fast enough to draw a streak, not a dot
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.15, 0.07, look);
    }
  }
  // one camera-facing shield outline (this.right/up must be set) at p, `sc` metres across its half-width
  drawShield(p, sc, al, L, w = 0.13) {
    for (let i = 0; i < SHIELD.length; i++) this.shield[i].copy(p).addScaledVector(this.right, SHIELD[i][0] * sc).addScaledVector(this.up, SHIELD[i][1] * sc);
    W.v = w; this.glow.strip(this.shield, lineGlowW, 0.8 * al, L.glow); this.core.strip(this.shield, lineW, al, L.edge);
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const L = this.look, x = this.x, z = this.z;
    if (this.rT < this.rLife) this.rT += dt;
    if (this.t < 1.2 && L.roar) {
      this.t += dt;
      const t = this.t;
      // sound: rings pulsing out one after another at head height to the true radius
      for (let i = 0; i < WAVES; i++) {
        const k = (t - i * WAVE_EVERY) / WAVE_LIFE; if (k < 0 || k >= 1) continue;
        const rr = 0.5 + (this.radius - 0.5) * out2(k);
        circlePoints(this.ring, x, z, rr, MOUTH - 0.12 * i); // smooth rings (owner: no wavy lines)
        W.v = (i ? 0.13 : 0.22) * (1 - 0.7 * k); this.glow.strip(this.ring, lineGlowW, 0.9 * (1 - k), L.glow); this.core.strip(this.ring, lineW, (1 - k * k) * (i ? 0.8 : 1), L.edge);
      }
      // the blast ahead of the mouth: arcs ")))" racing out along the facing, widening
      for (let i = 0; i < BLASTS; i++) {
        const k = (t - i * BLAST_EVERY) / BLAST_LIFE; if (k < 0 || k >= 1) continue;
        const d = 0.5 + 4.2 * out2(k), span = 0.45 + 0.35 * k;
        for (let j = 0; j < ARC; j++) {
          const a = this.f + (j / (ARC - 1) - 0.5) * 2 * span;
          this.arc[j].set(x + Math.sin(a) * d, MOUTH, z + Math.cos(a) * d);
        }
        W.v = 0.45 * (1 - k); this.glow.strip(this.arc, sparkGlowW, 0.9 * (1 - k), L.glow); this.core.strip(this.arc, sparkW, 1 - k * k, L.edge);
      }
      this.flare.visible = false;
    } else if (this.t < 1.2) {
      this.t += dt;
      const t = this.t;
      // the ring racing out to the true radius, at waist height
      for (let i = 0; i < 2; i++) { // the shout and its echo
        const rk = (t - i * 0.1) / RING_LIFE;
        if (rk < 0 || rk >= 1) continue;
        const rr = 0.6 + (this.radius - 0.6) * out2(rk);
        circlePoints(this.ring, x, z, rr, 1.0 - 0.3 * i);
        W.v = (i ? 0.1 : 0.2) * (1 - 0.6 * rk); this.glow.strip(this.ring, lineGlowW, 0.9 * (1 - rk), L.glow); this.core.strip(this.ring, lineW, (i ? 0.7 : 1) * (1 - rk * rk), L.edge);
      }
      // shout lines bursting out round the hero (a manga roar)
      const yk = t / RAY_LIFE;
      if (yk < 1) for (const q of this.rays) {
        const d0 = 0.5 + q.len * 0.9 * out2(yk), d1 = d0 + q.len * (1 - yk) * 0.8;
        this.three[0].set(x + Math.sin(q.a) * d0, 1.0, z + Math.cos(q.a) * d0);
        this.three[2].set(x + Math.sin(q.a) * d1, 1.0, z + Math.cos(q.a) * d1);
        this.three[1].copy(this.three[0]).lerp(this.three[2], 0.5);
        W.v = 0.14 * (1 - yk); this.glow.strip(this.three, lineGlowW, 0.8 * (1 - yk), L.glow); this.core.strip(this.three, lineW, 1 - yk * yk, L.edge);
      }
      // spirit streaks shooting up round the hero
      for (const s of this.streaks) {
        const k = (t - s.delay) / STREAK_LIFE; if (k < 0 || k >= 1) continue;
        const head = s.h * out2(Math.min(1, k * 1.6)), len = 0.9 * (1 - k);
        for (let i = 0; i < STREAK_PTS; i++) { const q = i / (STREAK_PTS - 1), hy = head - len * (1 - q); this.spts[i].set(x + Math.sin(s.a) * s.r, 0.1 + Math.max(0, hy), z + Math.cos(s.a) * s.r); }
        W.v = 0.16; this.glow.strip(this.spts, tailGlowW, 0.8 * (1 - k), L.glow); this.core.strip(this.spts, tailW, 1 - k * k, L.edge);
      }
      // the star glint over the hero
      const fk = t / 0.35;
      this.flare.visible = fk < 1;
      if (this.flare.visible) { this.flare.position.set(x, 1.5, z); this.flare.scale.setScalar(2.4 * (0.5 + 0.5 * out2(Math.min(1, fk * 4))) * (1 - 0.4 * fk)); this.flare.material.opacity = 1 - fk * fk; }
    } else this.flare.visible = false;
    if (L.symbol) { this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion); this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion); }
    // a shield emblem over each body the buff reached: pops up (with an overshoot), holds, fades
    if (L.symbol === 'shield') for (const m of this.marks) {
      if (m.t >= MARK_LIFE) continue;
      m.t += dt; if (m.t < 0) continue;
      const k = m.t / MARK_LIFE, pop = Math.min(1, k * 6), sc = 0.42 * (pop < 1 ? pop * 1.15 : 1 + 0.15 * Math.max(0, 1 - (k - 1 / 6) * 8)), al = Math.min(1, k * 8) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      this.p.set(m.x, 2.3 + 0.3 * out2(k), m.z);
      this.drawShield(this.p, sc, al, L);
      if (L.double) this.drawShield(this.p, sc * 0.68, al, L, 0.09);
    }
    // a guardian's shield wall: shields snapping up round the hero one after another, held, then fading
    if (L.wall && this.t < 1.2) for (let j = 0; j < WALL; j++) {
      const k = (this.t - 0.03 * j) / WALL_LIFE; if (k < 0 || k >= 1) continue;
      const a = this.f + (j / WALL) * Math.PI * 2, pop = Math.min(1, k * 7), al = Math.min(1, k * 10) * (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
      this.p.set(x + Math.sin(a) * WALL_R, 0.9 + 0.25 * pop, z + Math.cos(a) * WALL_R);
      this.drawShield(this.p, 0.5 * (pop < 1 ? pop * 1.12 : 1), al, L, 0.11);
    }
    // the marks: chevrons rising over each body the buff reached, facing the camera
    if (L.symbol === 'up') {
      for (const m of this.marks) {
        if (m.t >= MARK_LIFE) continue;
        m.t += dt; if (m.t < 0) continue;
        const k = m.t / MARK_LIFE;
        for (let c = 0; c < CHEV; c++) {
          const ck = k * 1.25 - c * 0.12; if (ck < 0 || ck > 1) continue;
          const lift = 2.0 + 1.0 * out2(ck) + c * 0.42, al = Math.min(1, ck * 6) * (1 - ck * ck), w = 0.5;
          this.p.set(m.x, lift, m.z);
          this.three[0].copy(this.p).addScaledVector(this.right, -w).addScaledVector(this.up, -w * 0.7);
          this.three[1].copy(this.p);
          this.three[2].copy(this.p).addScaledVector(this.right, w).addScaledVector(this.up, -w * 0.7);
          W.v = 0.17; this.glow.strip(this.three, lineGlowW, 0.8 * al, L.glow); this.core.strip(this.three, lineW, al, L.edge);
        }
      }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, -1.5); // embers float up
    this.core.end(); this.glow.end();
  }
  clear() {
    this.t = 9; this.rT = 9; this.flare.visible = false; for (const m of this.marks) m.t = 9;
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.t < 1.2 || this.rT < this.rLife || this.sparks.length > 0 || this.marks.some((m) => m.t < MARK_LIFE); }
}
