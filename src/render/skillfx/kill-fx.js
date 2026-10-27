// Killing Arrow (bows: a 0.55 s aim, then one heavy arrow out to 16 m; a 10 s cooldown), held to the
// owner's bar (.claude/skills/skill-vfx): a cooldown skill must be grander than a main skill, so it gets
// every beat, in a crimson-and-gold light.
//  - the aim (the cast): a thin sight line runs out from the bow along the shot to the target (or the
//    full reach) and brightens; light is drawn in to the arrow's tip where a glow grows inside a spinning
//    ring; a sigil of rings stands across the shot in front of the bow (a solid inner ring, a dashed one
//    turning one way, an outer one with ticks turning the other) and grows; a reticle (a ring and four
//    ticks) closes onto the locked target;
//  - the loose (the arrow appears): the arrow bursts through the sigil, which flies apart; two rings of
//    air burst across the shot at the bow, streaks are thrown back past the hero (the recoil), a glint
//    flares and the camera kicks;
//  - the flight: a thick blazing streak follows the arrow wrapped in two crimson spirals, shedding
//    sparks, and the line it cut stays hanging in the air behind it a moment, then thins away;
//  - the hit: a big burst on the target (a glint, long rays thrown on along the shot, two rings across
//    the shot, sparks) and a hard shake, and the force runs on through it: a beam of light pierces out
//    the far side with a ring of air further on.
// Positions come from the rules' castStart, projectiles and 'hit' events. One ribbon pair, two glint
// sprites and pooled sparks: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, taperW, taperGlowW, drawSparks, spark, flareTexture, lightSprite } from './light-kit.js';

const LOOK = { edge: [1.0, 0.9, 0.62], glow: [1.0, 0.2, 0.08] };
const HIST = 14, RING = 25, RAYS = 10, SPARKS = 70, TICKS = 4, Y = 1.0;
const HANG = 0.35, BLAST = 0.3, BURST = 0.4, SIG = 1.1, SIG_BURST = 0.3, PIERCE = 0.32, ARC = 9;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class KillFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(97); this.time = 0;
    this.core = new Ribbon(scene, camera, 2000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.tip = lightSprite(scene, flareTexture('fire'), true, 11);
    this.boom = lightSprite(scene, flareTexture('fire'), true, 11);
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.hist = Array.from({ length: HIST }, () => new THREE.Vector3()); this.view = [];
    this.spiral = Array.from({ length: HIST }, () => new THREE.Vector3()); this.arc = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.sig = 9; this.sigX = 0; this.sigZ = 0; this.sigK = 0; this.pierce = 9;
    this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.rays = Array.from({ length: RAYS }, () => ({ ang: 0, len: 1, up: 0 }));
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    // the aim
    this.aimT = 9; this.aimLife = 0.55; this.x = 0; this.z = 0; this.dx = 0; this.dz = 1; this.reach = 16; this.target = null; this.tx = 0; this.tz = 0;
    // the shot
    this.id = null; this.live = false; this.n = 0; this.sx = 0; this.sz = 0; this.hang = 9; this.blast = 9; this.burst = 9; this.bx = 0; this.by = Y; this.bz = 0; this.bdx = 0; this.bdz = 1;
    this.onShake = null;
  }
  // the cast: from (x, z) along angle; target {x, z} when one is locked in reach
  aim(x, z, angle, total, reach, target) {
    this.x = x; this.z = z; this.dx = Math.sin(angle); this.dz = Math.cos(angle); this.aimT = 0; this.aimLife = Math.max(0.2, total); this.reach = reach;
    this.target = target ? 1 : null; if (target) { this.tx = target.x; this.tz = target.z; }
    this.sigX = x + this.dx * SIG; this.sigZ = z + this.dz * SIG; this.sig = 9;
  }
  // the rules' projectiles: the killing arrow's loose and flight
  syncProjectiles(projectiles, kind) {
    let seen = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      const sp = Math.hypot(pr.vx, pr.vz) || 1;
      if (pr.id !== this.id) { // loosed
        this.id = pr.id; this.n = 0; this.sx = pr.x; this.sz = pr.z; this.dx = pr.vx / sp; this.dz = pr.vz / sp; this.blast = 0; this.aimT = 9; this.sig = 0; // the arrow bursts through the sigil
        this.onShake?.(0.12, 0.16);
      }
      seen = true; this.live = true;
      for (let i = HIST - 1; i > 0; i--) this.hist[i].copy(this.hist[i - 1]);
      this.hist[0].set(pr.x, pr.y ?? Y, pr.z); this.n = Math.min(HIST, this.n + 1);
    }
    if (!seen && this.live) { this.live = false; this.hang = 0; } // gone (a hit or the end of its reach): the cut line hangs
  }
  // a struck target's centre
  hit(c, dx, dz) {
    const r = this.rnd, l = Math.hypot(dx, dz) || 1;
    this.burst = 0; this.bx = c.x; this.by = c.y; this.bz = c.z; this.bdx = dx / l; this.bdz = dz / l;
    const base = Math.atan2(this.bdx, this.bdz);
    this.rays.forEach((q, i) => { q.ang = i < 4 ? base + (r() - 0.5) * 0.7 : r() * 6.283; q.len = i < 4 ? 2.6 + r() * 1.2 : 0.9 + r() * 0.7; q.up = (r() - 0.3) * 0.8; });
    for (let i = 0; i < 14; i++) {
      const a = base + (r() - 0.5) * 2.2, s = 4 + r() * 5;
      this.p.set(c.x, c.y, c.z); this.v.set(Math.sin(a) * s, 1 + r() * 3, Math.cos(a) * s);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.25, 0.05, LOOK);
    }
    this.pierce = 0;
    this.onShake?.(0.2, 0.22);
  }
  // an arc of a ring standing across the line (dx, dz) at (x, y, z): radius rr, from angle a0 to a1
  arcAcross(x, y, z, dx, dz, rr, a0, a1) {
    const px = dz, pz = -dx;
    for (let i = 0; i < ARC; i++) { const a = a0 + (a1 - a0) * (i / (ARC - 1)), c = Math.cos(a) * rr; this.arc[i].set(x + px * c, y + Math.sin(a) * rr, z + pz * c); }
    return this.arc;
  }
  // the sigil standing across the shot at its place, grown to g (1 = full), its light al
  sigil(g, al) {
    const x = this.sigX, z = this.sigZ, dx = this.dx, dz = this.dz, t = this.time;
    this.crossRing(x, Y, z, dx, dz, 0.32 * g);
    W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
    for (let i = 0; i < 6; i++) { // dashes turning one way
      const a = -t * 3 + (i / 6) * Math.PI * 2;
      this.arcAcross(x, Y, z, dx, dz, 0.6 * g, a, a + 0.65);
      W.v = 0.045; this.glow.strip(this.arc, lineGlowW, 0.5 * al, LOOK.glow); this.core.strip(this.arc, lineW, 0.9 * al, LOOK.edge);
    }
    this.crossRing(x, Y, z, dx, dz, 0.92 * g);
    W.v = 0.06; this.glow.strip(this.ring, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
    const px = dz, pz = -dx, two = this.two;
    for (let i = 0; i < 8; i++) { // ticks round the outer ring turning the other way
      const a = t * 2 + (i / 8) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      two[0].set(x + px * c * 0.98 * g, Y + sn * 0.98 * g, z + pz * c * 0.98 * g);
      two[1].set(x + px * c * 1.2 * g, Y + sn * 1.2 * g, z + pz * c * 1.2 * g);
      W.v = 0.06; this.glow.strip(two, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(two, lineW, al, LOOK.edge);
    }
  }
  // a ring standing across the line (dx, dz) at (x, y, z)
  crossRing(x, y, z, dx, dz, rr) {
    const px = dz, pz = -dx;
    for (let i = 0; i < RING; i++) { const a = (i / (RING - 1)) * Math.PI * 2, c = Math.cos(a) * rr; this.ring[i].set(x + px * c, y + Math.sin(a) * rr, z + pz * c); }
    return this.ring;
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three, two = this.two;
    // the aim
    if (this.aimT < this.aimLife) {
      this.aimT += dt;
      const k = Math.min(1, this.aimT / this.aimLife), x = this.x, z = this.z;
      const end = this.target ? Math.min(this.reach, Math.hypot(this.tx - x, this.tz - z)) : this.reach;
      // the sight line, running out then brightening, flickering a little
      two[0].set(x + this.dx * 0.7, Y, z + this.dz * 0.7);
      two[1].set(x + this.dx * (0.7 + (end - 0.7) * out2(Math.min(1, k * 2.5))), Y, z + this.dz * (0.7 + (end - 0.7) * out2(Math.min(1, k * 2.5))));
      W.v = 0.04 + 0.05 * k; const fl = 0.75 + 0.25 * Math.sin(this.time * 40);
      this.glow.strip(two, lineGlowW, 0.5 * k * fl, LOOK.glow); this.core.strip(two, lineW, (0.4 + 0.6 * k) * fl, LOOK.edge);
      // light drawn in to the tip, and the tip's glow growing
      const tx = x + this.dx * 0.7, tz = z + this.dz * 0.7;
      if (this.rnd() < 0.6) {
        const a = this.rnd() * 6.283, d = 1.2 + this.rnd() * 0.8, life = 0.18;
        this.p.set(tx + Math.sin(a) * d, Y + (this.rnd() - 0.5) * 1.2, tz + Math.cos(a) * d);
        this.v.set(tx - this.p.x, Y - this.p.y, tz - this.p.z).multiplyScalar(1 / life);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, life, 0.035, LOOK);
      }
      this.crossRing(tx, Y, tz, this.dx, this.dz, 0.2 + 0.05 * Math.sin(this.time * 25) + 0.1 * k); // the ring round the tip
      W.v = 0.04; this.glow.strip(this.ring, lineGlowW, 0.6 * k, LOOK.glow); this.core.strip(this.ring, lineW, 0.9 * k, LOOK.edge);
      this.sigK = out2(Math.min(1, k * 2)); this.sigil(this.sigK, Math.min(1, k * 3));
      this.tip.visible = true; this.tip.position.set(tx, Y, tz); this.tip.scale.setScalar(0.4 + 1.1 * k + 0.1 * Math.sin(this.time * 30)); this.tip.material.opacity = 0.5 + 0.5 * k;
      // the reticle closing onto the target: a ring and four ticks turning in
      if (this.target) {
        const rr = 1.6 - 1.0 * out2(k), al = Math.min(1, k * 4), cy = Y;
        for (let i = 0; i < RING; i++) { const a = (i / (RING - 1)) * Math.PI * 2; this.ring[i].set(this.tx + Math.sin(a) * rr, cy, this.tz + Math.cos(a) * rr); }
        W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
        for (let i = 0; i < TICKS; i++) {
          const a = (i / TICKS) * Math.PI * 2 + (1 - k) * 1.2;
          two[0].set(this.tx + Math.sin(a) * (rr + 0.15), cy, this.tz + Math.cos(a) * (rr + 0.15));
          two[1].set(this.tx + Math.sin(a) * (rr + 0.6), cy, this.tz + Math.cos(a) * (rr + 0.6));
          W.v = 0.07; this.glow.strip(two, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(two, lineW, al, LOOK.edge);
        }
      }
    } else this.tip.visible = false;
    // the sigil flying apart as the arrow bursts through it
    if (this.sig < SIG_BURST) { this.sig += dt; const k = this.sig / SIG_BURST; this.sigil(this.sigK * (1 + 1.4 * out2(k)), 1 - k * k); }
    // the loose: rings of air across the shot, recoil streaks, a glint
    if (this.blast < BLAST) {
      this.blast += dt;
      const k = this.blast / BLAST, x = this.sx, z = this.sz;
      for (let i = 0; i < 2; i++) {
        const kk = Math.max(0, k - i * 0.25) / (1 - i * 0.25); if (kk <= 0 || kk >= 1) continue;
        const d = 0.3 + (1.4 + i) * out2(kk);
        this.crossRing(x + this.dx * d, Y, z + this.dz * d, this.dx, this.dz, 0.3 + (0.9 - 0.3 * i) * out2(kk));
        W.v = (i ? 0.08 : 0.14) * (1 - kk); this.glow.strip(this.ring, lineGlowW, 0.8 * (1 - kk), LOOK.glow); this.core.strip(this.ring, lineW, 1 - kk * kk, LOOK.edge);
      }
      const px = this.dz, pz = -this.dx;
      for (let i = -2; i <= 2; i++) { // recoil: streaks thrown back past the hero
        const s = i * 0.22, d0 = -0.2 - 1.6 * out2(k), d1 = d0 - 1.0 * (1 - k);
        three[0].set(x + this.dx * d0 + px * s, Y + Math.abs(i) * 0.1, z + this.dz * d0 + pz * s);
        three[2].set(x + this.dx * d1 + px * s, Y + Math.abs(i) * 0.1, z + this.dz * d1 + pz * s);
        three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.07 * (1 - k); this.glow.strip(three, taperGlowW, 0.7 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k, LOOK.edge);
      }
      this.boom.visible = true; this.boom.position.set(x + this.dx * 0.5, Y, z + this.dz * 0.5); this.boom.scale.setScalar(3.2 * (0.6 + 0.4 * out2(Math.min(1, k * 4))) * (1 - 0.5 * k)); this.boom.material.opacity = 1 - k * k;
    }
    // the flight: a blazing streak behind the arrow, and the cut line hanging behind it
    if (this.live || this.hang < HANG) {
      if (!this.live) this.hang += dt;
      const al = this.live ? 1 : 1 - this.hang / HANG, head = this.hist[0];
      two[0].set(this.sx, Y, this.sz); two[1].set(head.x, Y, head.z);
      W.v = 0.08 * al; this.glow.strip(two, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(two, lineW, 0.85 * al, LOOK.edge);
      if (this.live && this.n > 1) {
        const view = this.view; view.length = 0;
        for (let i = this.n - 1; i >= 0; i--) view.push(this.hist[i]);
        W.v = 0.32; this.glow.strip(view, tailGlowW, 0.9, LOOK.glow); this.core.strip(view, tailW, 1, LOOK.edge);
        // two crimson spirals wound round it, widest at the head
        const px = this.dz, pz = -this.dx;
        for (let k = 0; k < 2; k++) {
          view.length = 0;
          for (let i = this.n - 1; i >= 0; i--) {
            const q = i / (HIST - 1), rr = 0.3 * (1 - 0.7 * q), ph = i * 0.9 - this.time * 26 + k * Math.PI, c = Math.cos(ph) * rr, h = this.hist[i];
            view.push(this.spiral[i].set(h.x + px * c, h.y + Math.sin(ph) * rr, h.z + pz * c));
          }
          W.v = 0.07; this.glow.strip(view, tailGlowW, 0.7, LOOK.glow); this.core.strip(view, tailW, 0.9, LOOK.edge);
        }
        // sparks shed off its path
        const r = this.rnd; this.p.copy(head); this.v.set((r() - 0.5) * 2 - this.dx * 2, 1 + r() * 1.5, (r() - 0.5) * 2 - this.dz * 2);
        spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.25 + r() * 0.15, 0.035, LOOK);
      }
    }
    // the hit
    if (this.burst < BURST) {
      this.burst += dt;
      const k = this.burst / BURST;
      for (const q of this.rays) {
        const sx = Math.sin(q.ang), sz = Math.cos(q.ang), d0 = 0.15 + q.len * 0.45 * k, d1 = 0.3 + q.len * out2(Math.min(1, k * 2.5));
        three[0].set(this.bx + sx * d0, this.by + q.up * d0, this.bz + sz * d0); three[2].set(this.bx + sx * d1, this.by + q.up * d1, this.bz + sz * d1); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.28 * (1 - k); this.glow.strip(three, taperGlowW, 0.9 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
      for (let i = 0; i < 2; i++) {
        const kk = Math.max(0, k - i * 0.15) / (1 - i * 0.15); if (kk <= 0 || kk >= 1) continue;
        this.crossRing(this.bx + this.bdx * 0.6 * kk, this.by, this.bz + this.bdz * 0.6 * kk, this.bdx, this.bdz, 0.4 + (1.8 - 0.5 * i) * out2(kk));
        W.v = 0.18 * (1 - kk); this.glow.strip(this.ring, lineGlowW, 0.8 * (1 - kk), LOOK.glow); this.core.strip(this.ring, lineW, 1 - kk * kk, LOOK.edge);
      }
      if (this.blast >= BLAST) { this.boom.visible = k < 0.6; this.boom.position.set(this.bx, this.by, this.bz); this.boom.scale.setScalar(4 * (0.5 + 0.5 * out2(Math.min(1, k * 5)))); this.boom.material.opacity = 1 - k / 0.6; }
    } else if (this.blast >= BLAST) this.boom.visible = false;
    // the force running on through the target: a beam out the far side, a ring of air further on
    if (this.pierce < PIERCE) {
      this.pierce += dt;
      const k = this.pierce / PIERCE, len = 0.5 + 4.5 * out2(Math.min(1, k * 3)), al = 1 - k * k;
      two[0].set(this.bx + this.bdx * 0.3, this.by, this.bz + this.bdz * 0.3); two[1].set(this.bx + this.bdx * len, this.by, this.bz + this.bdz * len);
      W.v = 0.16 * (1 - 0.5 * k); this.glow.strip(two, lineGlowW, 0.9 * al, LOOK.glow); this.core.strip(two, lineW, al, LOOK.edge);
      const d = 1.5 + 2.5 * out2(k);
      this.crossRing(this.bx + this.bdx * d, this.by, this.bz + this.bdz * d, this.bdx, this.bdz, 0.3 + 0.8 * out2(k));
      W.v = 0.1 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.7 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 9);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.aimT = 9; this.blast = 9; this.burst = 9; this.hang = 9; this.sig = 9; this.pierce = 9; this.live = false; this.id = null; this.tip.visible = false; this.boom.visible = false;
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.aimT < this.aimLife || this.live || this.hang < HANG || this.blast < BLAST || this.burst < BURST || this.sig < SIG_BURST || this.pierce < PIERCE || this.sparks.length > 0; }
}
