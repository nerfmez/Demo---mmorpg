// Shadow Kill (daggers: a step through the shadows to behind the target, then a heavy stab), held to
// the owner's bar (.claude/skills/skill-vfx). On the rules' 'shadowStep' event the hero vanishes in a
// spray of dark violet shards and a closing ground ring, a dark streak of light runs from where it was
// to where it appears, and shards gather in behind the target as it lands. The stab itself is Flank
// Thrust's hard burst in the blade job's violet (the director calls ThrustFx). Few ribbon strips and
// pooled shard sparks: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, taperW, taperGlowW, lineW, lineGlowW, circlePoints, drawSparks, spark } from './light-kit.js';

const LOOK = { edge: [0.72, 0.48, 1.0], glow: [0.55, 0.12, 1.0] };
const SPARKS = 90, RING = 25, PATH = 12;
const STREAK = 0.28, RING_LIFE = 0.3;

export class ShadowFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(37);
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.t = 9;
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.path = Array.from({ length: PATH }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.light = addLight(scene, new THREE.PointLight('#9a5cff', 0, 4, 2));
  }
  // the hero leaves (fx, fz) and appears at (x, z)
  step(fx, fz, x, z) {
    this.from.set(fx, 0, fz); this.to.set(x, 0, z); this.t = 0;
    const r = this.rnd;
    // vanish: shards spray up and out from where it stood
    for (let i = 0; i < 18; i++) {
      const a = r() * 6.283, sp = 2 + r() * 3;
      this.p.set(fx + Math.sin(a) * 0.3, 0.4 + r() * 1.1, fz + Math.cos(a) * 0.3);
      this.v.set(Math.sin(a) * sp, 1 + r() * 2.5, Math.cos(a) * sp);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.2 + r() * 0.2, 0.035, LOOK);
    }
    // appear: shards flying in toward where it lands
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.283, d = 1.2 + r() * 0.6;
      this.p.set(x + Math.sin(a) * d, 0.4 + r() * 1.2, z + Math.cos(a) * d);
      this.v.set(-Math.sin(a) * d * 6, (0.9 - this.p.y) * 4, -Math.cos(a) * d * 6);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.14 + r() * 0.06, 0.03, LOOK);
    }
    this.light.position.set(x, 1.1, z);
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    if (this.t < 1) {
      this.t += dt;
      // the closing ring where it vanished
      const u = Math.min(1, this.t / RING_LIFE);
      if (u < 1) {
        circlePoints(this.ring, this.from.x, this.from.z, 0.9 * (1 - u) + 0.15, 0.06);
        W.v = 0.1 * (1 - u);
        this.glow.strip(this.ring, lineGlowW, 0.8 * (1 - u), LOOK.glow);
        this.core.strip(this.ring, lineW, 1 - u, LOOK.edge);
      }
      // the streak from there to here: drawn at once, then thinning from its tail
      const s = this.t / STREAK;
      if (s < 1) {
        for (let i = 0; i < PATH; i++) {
          const q = i / (PATH - 1);
          this.path[i].lerpVectors(this.from, this.to, q);
          this.path[i].y = 0.9 + Math.sin(Math.PI * q) * 0.35; // a low arc over the target
        }
        W.v = 0.16 * (1 - s);
        this.glow.strip(this.path, taperGlowW, 0.9 * (1 - s), LOOK.glow);
        this.core.strip(this.path, taperW, 1 - s * s, LOOK.edge);
      }
      this.light.intensity = 3 * Math.max(0, 1 - this.t / 0.3);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 4);
    this.core.end(); this.glow.end();
  }
  clear() { this.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; this.light.intensity = 0; }
  get busy() { return this.t < 1 || this.sparks.length > 0; }
}
