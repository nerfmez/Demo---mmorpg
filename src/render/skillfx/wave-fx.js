// Spell Wave (a spellblade's sword skill: a downward cut that sends an upright blade of arcane light out
// 10 m, cutting through everything on its narrow line), held to the owner's bar (.claude/skills/skill-vfx),
// in the bench's light-and-ribbon language with an arcane blue-violet. Owner: it must not repeat Flame Wave
// Slash's wide horizontal crescent, so it stands upright. The cut itself is the bench's slash crescent
// stood on its edge in the same colours (the director starts it on the cast, the hero plays the downward
// chop); this draws the wave it sends:
//  - the wave: a tall crescent of light standing upright and bulging forward (thick in the middle, sharp
//    at its tips), riding the rules' projectile, with two fading afterimages behind it, speed lines off its
//    tips and rune sparks shed as it flies; the line it cuts stays hanging in the air a moment;
//  - each hit: a bright upright cut mark slashed down the target with a small burst;
//  - the end of its reach: the wave thins and flies apart.
// The game's generic orb is not drawn for it (OWN_PROJECTILES). One ribbon pair and pooled sparks.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, taperW, taperGlowW, drawSparks, spark } from './light-kit.js';

export const WAVE_PALETTE = { hot: [0.95, 0.97, 1.0], body: [0.55, 0.65, 1.0], glow: [0.4, 0.3, 1.0] };
const LOOK = { edge: [0.82, 0.9, 1.0], glow: [0.38, 0.32, 1.0] };
const ARC = 17, GHOSTS = 2, CUTS = 6, SPARKS = 60, Y = 1.0;
const SPAN = 0.85, RAD = 1.3, DIE = 0.3, CUT = 0.3, HANG = 0.45, MID = 1.15;
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
    this.id = null; this.live = false; this.t = 0; this.die = 9; this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.x = 0; this.z = 0; this.dx = 0; this.dz = 1; this.sx = 0; this.sz = 0; this.r = 0.9;
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
    q.t = 0; q.x = c.x; q.y = c.y; q.z = c.z; q.a = (r() - 0.5) * 0.4; // the cut's lean off upright
    for (let i = 0; i < 8; i++) { const a = r() * 6.283, s = 2 + r() * 3; this.p.set(c.x, c.y, c.z); this.v.set(Math.sin(a) * s + this.dx * 3, 0.5 + r() * 2, Math.cos(a) * s + this.dz * 3); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.25 + r() * 0.2, 0.04, LOOK); }
  }
  // one crescent standing upright at (x, z), bulging forward along (dx, dz): radius rad, half-span span
  // (radians, up and down from its middle at MID), w its thickness, al its light
  crescent(x, z, dx, dz, rad, span, w, al) {
    const cx = x - dx * rad, cz = z - dz * rad;
    for (let i = 0; i < ARC; i++) {
      const a = ((i / (ARC - 1)) - 0.5) * 2 * span, c = Math.cos(a) * rad;
      this.arc[i].set(cx + dx * c, MID + Math.sin(a) * rad, cz + dz * c);
    }
    W.v = w; this.glow.strip(this.arc, taperGlowW, 0.8 * al, LOOK.glow); this.core.strip(this.arc, taperW, al, LOOK.edge);
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const r = this.rnd, three = this.three;
    if (this.live || this.die < DIE + HANG) {
      this.t += dt; if (!this.live) this.die += dt;
      const k = this.live ? 1 : Math.max(0, 1 - this.die / DIE), grow = out2(Math.min(1, this.t / 0.12)), rad = RAD * (0.6 + 0.4 * grow) * (1 + 0.3 * (1 - k));
      const travelled = Math.hypot(this.x - this.sx, this.z - this.sz);
      // the line it cut, hanging in the air behind it
      const hk = this.live ? 1 : Math.max(0, 1 - this.die / (DIE + HANG));
      this.two[0].set(this.sx, MID, this.sz); this.two[1].set(this.x, MID, this.z);
      W.v = 0.05 * hk; this.glow.strip(this.two, lineGlowW, 0.6 * hk, LOOK.glow); this.core.strip(this.two, lineW, 0.8 * hk, LOOK.edge);
      if (k > 0) {
        // afterimages, then the wave itself
        for (let g = GHOSTS; g >= 1; g--) {
          const back = Math.min(travelled, g * 0.6);
          this.crescent(this.x - this.dx * back, this.z - this.dz * back, this.dx, this.dz, rad * (1 - 0.08 * g), SPAN, 0.3 * k, 0.4 * k / g);
        }
        this.crescent(this.x, this.z, this.dx, this.dz, rad, SPAN * (1 + 0.15 * (1 - k)), 0.55 * k, k);
        // speed lines off its top and bottom tips
        const cx = this.x - this.dx * rad, cz = this.z - this.dz * rad;
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          const a = sgn * SPAN * 0.92, c = Math.cos(a) * rad, ty = MID + Math.sin(a) * rad;
          three[2].set(cx + this.dx * c, ty, cz + this.dz * c); three[0].set(cx + this.dx * (c - 1.4), ty, cz + this.dz * (c - 1.4)); three[1].copy(three[0]).lerp(three[2], 0.5);
          W.v = 0.06 * k; this.glow.strip(three, taperGlowW, 0.6 * k, LOOK.glow); this.core.strip(three, taperW, 0.8 * k, LOOK.edge);
        }
        // rune sparks shed off the wave
        if (this.live && r() < 0.7) {
          const a = (r() - 0.5) * 2 * SPAN, c = Math.cos(a) * rad;
          this.p.set(cx + this.dx * c, MID + Math.sin(a) * rad, cz + this.dz * c); this.v.set(-this.dx * 3 + (r() - 0.5), 0.3 + r() * 0.6, -this.dz * 3 + (r() - 0.5));
          spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.035, LOOK);
        }
      }
    }
    // the cut marks: an upright stroke slashed down the target, and a thin one beside it
    for (const q of this.cuts) {
      if (q.t >= CUT) continue;
      q.t += dt; const k = q.t / CUT, grow = out2(Math.min(1, k * 4));
      for (let s = 0; s < 2; s++) {
        const len = (s ? 0.6 : 1.0) * grow, lean = q.a + (s ? 0.25 : 0), ox = this.dz * (s ? 0.18 : 0), oz = -this.dx * (s ? 0.18 : 0);
        three[0].set(q.x + ox - this.dz * lean * len, q.y + len, q.z + oz + this.dx * lean * len);
        three[2].set(q.x + ox + this.dz * lean * len, q.y - len, q.z + oz - this.dx * lean * len); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = (s ? 0.07 : 0.14) * (1 - k * 0.7); this.glow.strip(three, taperGlowW, 0.9 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, three, 3);
    this.core.end(); this.glow.end();
  }
  clear() { this.id = null; this.live = false; this.die = 9; for (const q of this.cuts) q.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.live || this.die < DIE + HANG || this.cuts.some((q) => q.t < CUT) || this.sparks.length > 0; }
}
