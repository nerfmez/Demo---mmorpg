// Spell Wave (a spellblade's sword skill: a cut that sends a wide wave of arcane blade out 10 m), held to
// the owner's bar (.claude/skills/skill-vfx), in the bench's light-and-ribbon language with an arcane
// blue-violet. The cut itself is the bench's slash crescent in the same colours (the director starts it on
// the cast, the hero plays the sword's cut); this draws the wave it sends:
//  - the wave: a wide crescent of light bulging forward (thick in the middle, sharp at its tips, a little
//    tilted like the cut), riding the rules' projectile, with two fading afterimages behind it, speed
//    lines off its tips and rune sparks shed as it flies;
//  - each hit: a bright cut mark slashed across the target (two crossing strokes) with a small burst;
//  - the end of its reach: the wave thins and flies apart.
// The game's generic orb is not drawn for it (OWN_PROJECTILES). One ribbon pair and pooled sparks.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, taperW, taperGlowW, drawSparks, spark } from './light-kit.js';

export const WAVE_PALETTE = { hot: [0.95, 0.97, 1.0], body: [0.55, 0.65, 1.0], glow: [0.4, 0.3, 1.0] };
const LOOK = { edge: [0.82, 0.9, 1.0], glow: [0.38, 0.32, 1.0] };
const ARC = 17, GHOSTS = 2, CUTS = 6, SPARKS = 60, Y = 1.0;
const SPAN = 1.0, RAD = 1.5, DIE = 0.3, CUT = 0.3;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class WaveFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(67); this.time = 0;
    this.core = new Ribbon(scene, camera, 2000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.arc = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.id = null; this.live = false; this.t = 0; this.die = 9; this.x = 0; this.z = 0; this.dx = 0; this.dz = 1; this.sx = 0; this.sz = 0; this.r = 0.9;
    this.cuts = Array.from({ length: CUTS }, () => ({ t: 9, x: 0, y: 1, z: 0, a: 0 })); this.cutI = 0;
  }
  syncProjectiles(projectiles, kind) {
    let seen = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      const sp = Math.hypot(pr.vx, pr.vz) || 1;
      if (pr.id !== this.id) { this.id = pr.id; this.t = 0; this.sx = pr.x; this.sz = pr.z; this.r = pr.radius || 0.9; }
      seen = true; this.live = true; this.x = pr.x; this.z = pr.z; this.dx = pr.vx / sp; this.dz = pr.vz / sp;
    }
    if (!seen && this.live) { this.live = false; this.die = 0; }
  }
  // a struck target: a cut mark across it
  hit(c) {
    const q = this.cuts[this.cutI++ % CUTS], r = this.rnd;
    q.t = 0; q.x = c.x; q.y = c.y; q.z = c.z; q.a = Math.atan2(this.dx, this.dz) + Math.PI / 2 + (r() - 0.5) * 0.5;
    for (let i = 0; i < 8; i++) { const a = r() * 6.283, s = 2 + r() * 3; this.p.set(c.x, c.y, c.z); this.v.set(Math.sin(a) * s + this.dx * 3, 0.5 + r() * 2, Math.cos(a) * s + this.dz * 3); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.25 + r() * 0.2, 0.04, LOOK); }
  }
  // one crescent bulging forward from (x, z) along (dx, dz): radius rad, half-span span (radians), w its
  // thickness, al its light, tilt its roll (the outer edge lifted on one side)
  crescent(x, z, dx, dz, rad, span, w, al, tilt) {
    const base = Math.atan2(dx, dz), cx = x - dx * rad, cz = z - dz * rad;
    for (let i = 0; i < ARC; i++) {
      const u = i / (ARC - 1), a = base + (u - 0.5) * 2 * span;
      this.arc[i].set(cx + Math.sin(a) * rad, Y + (u - 0.5) * tilt, cz + Math.cos(a) * rad);
    }
    W.v = w; this.glow.strip(this.arc, taperGlowW, 0.8 * al, LOOK.glow); this.core.strip(this.arc, taperW, al, LOOK.edge);
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const r = this.rnd, three = this.three;
    if (this.live || this.die < DIE) {
      this.t += dt; if (!this.live) this.die += dt;
      const k = this.live ? 1 : 1 - this.die / DIE, grow = out2(Math.min(1, this.t / 0.12)), rad = RAD * (0.6 + 0.4 * grow) * (this.r / 0.9) * (1 + 0.4 * (1 - k));
      const travelled = Math.hypot(this.x - this.sx, this.z - this.sz);
      // afterimages, then the wave itself
      for (let g = GHOSTS; g >= 1; g--) {
        const back = Math.min(travelled, g * 0.7);
        this.crescent(this.x - this.dx * back, this.z - this.dz * back, this.dx, this.dz, rad * (1 - 0.08 * g), SPAN, 0.35 * k, 0.4 * k / g, 0.6);
      }
      this.crescent(this.x, this.z, this.dx, this.dz, rad, SPAN * (1 + 0.15 * (1 - k)), 0.65 * k, k, 0.6);
      // speed lines off its tips
      const base = Math.atan2(this.dx, this.dz), cx = this.x - this.dx * rad, cz = this.z - this.dz * rad;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const a = base + sgn * SPAN * 0.92, tx = cx + Math.sin(a) * rad, tz = cz + Math.cos(a) * rad;
        three[2].set(tx, Y + sgn * 0.22, tz); three[0].set(tx - this.dx * 1.4, Y + sgn * 0.22, tz - this.dz * 1.4); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.06 * k; this.glow.strip(three, taperGlowW, 0.6 * k, LOOK.glow); this.core.strip(three, taperW, 0.8 * k, LOOK.edge);
      }
      // rune sparks shed off the wave
      if (this.live && r() < 0.7) {
        const a = base + (r() - 0.5) * 2 * SPAN;
        this.p.set(cx + Math.sin(a) * rad, Y + (r() - 0.5) * 0.4, cz + Math.cos(a) * rad); this.v.set(-this.dx * 3 + (r() - 0.5), 0.6 + r(), -this.dz * 3 + (r() - 0.5));
        spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.035, LOOK);
      }
    }
    // the cut marks: two strokes slashed across the target, crossing
    for (const q of this.cuts) {
      if (q.t >= CUT) continue;
      q.t += dt; const k = q.t / CUT, grow = out2(Math.min(1, k * 4));
      for (let s = -1; s <= 1; s += 2) {
        const a = q.a + s * 0.5, len = 0.9 * grow, ca = Math.sin(a), sa = Math.cos(a);
        three[0].set(q.x - ca * len, q.y - s * 0.35 * grow, q.z - sa * len); three[2].set(q.x + ca * len, q.y + s * 0.35 * grow, q.z + sa * len); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.14 * (1 - k * 0.7); this.glow.strip(three, taperGlowW, 0.9 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, three, 3);
    this.core.end(); this.glow.end();
  }
  clear() { this.id = null; this.live = false; this.die = 9; for (const q of this.cuts) q.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.live || this.die < DIE || this.cuts.some((q) => q.t < CUT) || this.sparks.length > 0; }
}
