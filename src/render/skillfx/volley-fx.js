// Rapid Volley (bows: five arrows loosed 0.12 s apart along the facing), held to the owner's bar
// (.claude/skills/skill-vfx), in the bench's light-and-ribbon language with a cool wind tint. The arrows
// themselves are the game's arrow meshes (vfx.js); this adds:
//  - on each loose: a flick at the bow (a few short speed lines thrown forward and a small ring of
//    pushed air), so the five shots read as a rhythm;
//  - in flight: a long thin streak of wind behind each arrow, thinning toward its tail;
//  - on each hit: a sharp burst (short rays thrown on along the shot, a small ring) on the target.
// Positions come from the rules' projectiles and 'hit' events. One ribbon pair: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, taperW, taperGlowW, circlePoints } from './light-kit.js';

const LOOK = { edge: [0.9, 1.0, 1.0], glow: [0.25, 0.8, 0.95] };
const SHOTS = 6, HIST = 12, FLICKS = 6, BURSTS = 6, LINES = 4, RAYS = 6, RING = 17;
const FADE = 0.15, FLICK = 0.16, BURST = 0.22, Y = 1.45;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class VolleyFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(29);
    this.core = new Ribbon(scene, camera, 1500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.shots = Array.from({ length: SHOTS }, () => ({ id: null, live: false, n: 0, fade: 1, hist: Array.from({ length: HIST }, () => new THREE.Vector3()), view: [] }));
    const fx = () => ({ t: 9, x: 0, z: 0, dx: 0, dz: 1, y: Y, size: 1, a: Array.from({ length: Math.max(LINES, RAYS) }, () => ({ o: 0, s: 0, len: 1, ang: 0 })) });
    this.flicks = Array.from({ length: FLICKS }, fx); this.flickI = 0;
    this.bursts = Array.from({ length: BURSTS }, fx); this.burstI = 0;
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.onLoose = null; // (index) the director replays the bow's shot for each arrow after the first
  }
  // the rules' live projectiles: a new rapid_volley arrow flicks at the bow; every one leaves a streak
  syncProjectiles(projectiles, kind) {
    for (const s of this.shots) s.live = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      let s = null, free = null;
      for (const q of this.shots) { if (q.id === pr.id) s = q; else if (q.id === null && !free) free = q; }
      if (!s) {
        if (!free) continue;
        s = free; s.id = pr.id; s.n = 0; s.fade = 1;
        const sp = Math.hypot(pr.vx, pr.vz) || 1;
        this.flick(pr.x, pr.z, pr.vx / sp, pr.vz / sp);
        this.onLoose?.();
      }
      s.live = true;
      for (let i = HIST - 1; i > 0; i--) s.hist[i].copy(s.hist[i - 1]);
      s.hist[0].set(pr.x, Y, pr.z); s.n = Math.min(HIST, s.n + 1);
    }
    for (const s of this.shots) if (!s.live && s.id !== null && s.fade >= 1) s.fade = 0; // gone: its streak fades
  }
  flick(x, z, dx, dz) {
    const f = this.flicks[this.flickI++ % FLICKS], r = this.rnd;
    f.t = 0; f.x = x; f.z = z; f.dx = dx; f.dz = dz;
    for (let i = 0; i < LINES; i++) { const l = f.a[i]; l.s = (i - (LINES - 1) / 2) * 0.16 + (r() - 0.5) * 0.05; l.o = r() * 0.2; l.len = 1.0 + r() * 0.7; }
  }
  // a struck target's centre; (dx, dz) the shot's direction
  hit(c, dx, dz) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd, l0 = Math.hypot(dx, dz) || 1;
    b.t = 0; b.x = c.x; b.z = c.z; b.y = c.y; b.dx = dx / l0; b.dz = dz / l0;
    const base = Math.atan2(b.dx, b.dz);
    for (let i = 0; i < RAYS; i++) { const q = b.a[i]; q.ang = i < 3 ? base + (r() - 0.5) * 0.9 : r() * 6.283; q.len = i < 3 ? 1.3 + r() * 0.6 : 0.5 + r() * 0.4; }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const three = this.three;
    // the streaks behind the arrows (fading out once the arrow is gone)
    for (const s of this.shots) {
      if (s.id === null) continue;
      if (!s.live) { s.fade += dt / FADE; if (s.fade >= 1) { s.id = null; continue; } }
      if (s.n < 2) continue;
      const view = s.view; view.length = 0;
      for (let i = s.n - 1; i >= 0; i--) view.push(s.hist[i]); // tail first, head last
      const al = s.live ? 1 : 1 - s.fade;
      W.v = 0.12; this.glow.strip(view, tailGlowW, 0.75 * al, LOOK.glow); this.core.strip(view, tailW, al, LOOK.edge);
    }
    // the flicks at the bow: short lines thrown forward, a small ring of air
    for (const f of this.flicks) {
      if (f.t >= FLICK) continue;
      f.t += dt; const k = f.t / FLICK, px = f.dz, pz = -f.dx;
      for (let i = 0; i < LINES; i++) {
        const l = f.a[i], d0 = 0.4 + l.o + 1.6 * out2(k), d1 = d0 + l.len * (1 - k);
        three[0].set(f.x + f.dx * d0 + px * l.s, Y + l.s * 0.3, f.z + f.dz * d0 + pz * l.s);
        three[2].set(f.x + f.dx * d1 + px * l.s, Y + l.s * 0.3, f.z + f.dz * d1 + pz * l.s);
        three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.09 * (1 - k); this.glow.strip(three, taperGlowW, 0.7 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
      // the ring: round the shot's line, just ahead of the bow, seen as an ellipse from above
      circlePoints(this.ring, f.x + f.dx * (0.6 + 0.5 * k), f.z + f.dz * (0.6 + 0.5 * k), 0.15 + 0.5 * out2(k), Y);
      W.v = 0.07 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.5 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 0.8 * (1 - k), LOOK.edge);
    }
    // the hit bursts: sharp rays (the longest thrown on along the shot) and a small ring
    for (const b of this.bursts) {
      if (b.t >= BURST) continue;
      b.t += dt; const k = b.t / BURST;
      for (let i = 0; i < RAYS; i++) {
        const q = b.a[i], sx = Math.sin(q.ang), sz = Math.cos(q.ang), d0 = 0.1 + q.len * 0.5 * k, d1 = 0.2 + q.len * out2(Math.min(1, k * 2.5));
        three[0].set(b.x + sx * d0, b.y, b.z + sz * d0); three[2].set(b.x + sx * d1, b.y, b.z + sz * d1); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.12 * (1 - k); this.glow.strip(three, taperGlowW, 0.8 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
      circlePoints(this.ring, b.x, b.z, 0.2 + 0.7 * out2(k), b.y);
      W.v = 0.08 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.6 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 0.9 * (1 - k), LOOK.edge);
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const s of this.shots) { s.id = null; s.live = false; }
    for (const f of this.flicks) f.t = 9; for (const b of this.bursts) b.t = 9;
  }
  get busy() { return this.shots.some((s) => s.id !== null) || this.flicks.some((f) => f.t < FLICK) || this.bursts.some((b) => b.t < BURST); }
}
