// Cross Cut (daggers: two quick cuts in front, 0.14 s apart), held to the owner's bar
// (.claude/skills/skill-vfx). The two cuts are the bench's slash crescents with fixed, opposite steep
// tilts (SlashFx, tilt option), so together they draw an X. On the second cut the X itself flares in
// the air in front of the hero: two crossing strokes of light (a white core in a blue glow) that flash,
// hold a beat, then split apart along their arms and fade, sparks thrown off the crossing point; each
// struck monster gets a small X glint on its body. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, drawSparks, spark } from './light-kit.js';

const MARKS = 6, SPARKS = 120, LIFE = 0.5, GLINT = 0.3, SEG = 7;
// a half arm: full width at the crossing, a sharp point at the tip
const armW = (x) => W.v * Math.pow(1 - x, 0.6), armGlowW = (x) => armW(x) * 2.6;
const LOOK = { edge: [0.82, 0.93, 1.0], glow: [0.3, 0.55, 1.0] };

export class CrossFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(57); this.time = 0;
    this.core = new Ribbon(scene, camera, 1200, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    // drawn over the bodies in front (the X hangs in the air between the hero and its targets)
    this.core.mesh.renderOrder = 12; this.glow.mesh.renderOrder = 11; this.core.mesh.material.depthTest = false; this.glow.mesh.material.depthTest = false;
    this.marks = Array.from({ length: MARKS }, () => ({ t: 9, at: 0, size: 1, c: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), big: false }));
    this.markI = 0; this.sparks = []; this.free = [];
    this.light = addLight(scene, new THREE.PointLight('#cfe8ff', 0, 4, 2));
    this.arm = Array.from({ length: SEG }, () => new THREE.Vector3()); this.q = new THREE.Vector3(); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
  }
  mark(x, y, z, size, delay, big) {
    const m = this.marks[this.markI++ % MARKS];
    m.c.set(x, y, z); m.t = -delay; m.size = size; m.big = big;
  }
  // castStart: the X in front of the hero lands with the second cut (in seconds from now)
  cross(x, z, angle, range, at) {
    const d = range * 0.45;
    this.mark(x + Math.sin(angle) * d, 1.25, z + Math.cos(angle) * d, range * 0.9, at, true);
  }
  // a struck monster: a small X glint on its body
  hit(c) { this.mark(c.x, c.y, c.z, 0.55, 0, false); }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const cam = this.camera, right = this.p.setFromMatrixColumn(cam.matrixWorld, 0), up = this.v.setFromMatrixColumn(cam.matrixWorld, 1);
    let light = 0;
    for (const m of this.marks) {
      const life = m.big ? LIFE : GLINT;
      if (m.t >= life) continue;
      const was = m.t; m.t += dt;
      if (m.t < 0) continue;
      if (was < 0 && m.big) { const r = this.rnd; for (let i = 0; i < 18; i++) { const a = r() * 6.283, sp = 2 + r() * 4; this.three[2].set(Math.cos(a) * sp, 1 + r() * 3, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, m.c, this.three[2], 0.15 + r() * 0.2, 0.03, LOOK); } }
      const u = m.t / life;
      // the arms: drawn in, held, then split apart along themselves and thinned
      const draw = Math.min(1, m.t / 0.05), split = Math.max(0, (u - 0.45) / 0.55), fade = 1 - split * split;
      for (const [sx, sy] of [[1, 1], [1, -1]]) {
        for (const half of [-1, 1]) {
          const gap = split * 0.35 * m.size, a = m.size * 0.5 * draw;
          // each half arm from near the centre (plus the gap) out to the tip
          const q = this.q.copy(m.c).addScaledVector(right, sx * half * gap * 0.7).addScaledVector(up, sy * half * gap * 0.7);
          for (let k = 0; k < SEG; k++) { const f = (k / (SEG - 1)) * a * 0.7; this.arm[k].copy(q).addScaledVector(right, sx * half * f).addScaledVector(up, sy * half * f); }
          W.v = (m.big ? 0.22 : 0.08) * (1 - 0.6 * split);
          this.glow.strip(this.arm, armGlowW, fade, LOOK.glow); this.core.strip(this.arm, armW, fade, LOOK.edge);
        }
      }
      if (m.big) light = Math.max(light, 4 * (1 - u));
      if (m.big && m.t < 0.06) { this.light.position.copy(m.c); }
    }
    this.light.intensity = light;
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 10);
    this.core.end(); this.glow.end();
  }
  clear() { for (const m of this.marks) m.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; this.light.intensity = 0; }
  get busy() { return this.marks.some((m) => m.t < (m.big ? LIFE : GLINT)) || this.sparks.length > 0; }
}
