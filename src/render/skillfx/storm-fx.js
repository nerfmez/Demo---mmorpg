// Blade Storm (daggers: four spins 0.3 s apart, hitting all round within the radius), held to the
// owner's bar (.claude/skills/skill-vfx). The spins themselves are the bench's slash crescents drawn
// round the whole circle in the blade job's violet (the director starts one per 'whirl' event, each a
// little higher, so the four stack like a whirlwind of blades); this adds the storm: a few wind streaks
// spiralling up round the hero through the spins, and on the last spin a burst of sparks flung outward,
// a flash of light and a short shake. Few strips in one ribbon pair, pooled sparks: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, tailW, tailGlowW, drawSparks, spark } from './light-kit.js';

const STREAKS = 6, SEG = 10, SPARKS = 90;
const LOOK = { edge: [0.97, 0.9, 1.0], glow: [0.56, 0.22, 1.0] };
const SPIN = -9; // rad/s, the way the hero turns (its spin channel runs negative)

export class StormFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(91);
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.streaks = Array.from({ length: STREAKS }, (_, i) => ({ a: (i / STREAKS) * Math.PI * 2, r: 0, y: 0, phase: i / STREAKS }));
    this.pts = Array.from({ length: SEG }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.v = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.light = addLight(scene, new THREE.PointLight('#c79bff', 0, 6, 2));
    this.t = 9; this.life = 0; this.radius = 3; this.flash = 0;
    this.onShake = null;
  }
  // castStart: the storm rises round the caster for `life` seconds (the cast and all its spins)
  start(x, z, radius, life) {
    this.c.set(x, 0, z); this.radius = radius; this.life = life; this.t = 0;
  }
  // the caster moves while it spins: the storm follows
  follow(x, z) { this.c.x = x; this.c.z = z; }
  // the last spin: sparks flung out round the circle, a flash, a short shake
  burst(x, z) {
    const r = this.rnd;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + r() * 0.2, sp = 7 + r() * 5;
      this.v.set(Math.sin(a) * sp, 1 + r() * 2.5, Math.cos(a) * sp);
      this.three[2].set(x + Math.sin(a) * 0.6, 0.9 + r() * 0.5, z + Math.cos(a) * 0.6);
      spark(this.sparks, this.free, SPARKS, this.three[2], this.v, 0.18 + r() * 0.16, 0.03, LOOK);
    }
    this.light.position.set(x, 1.2, z); this.flash = 1;
    this.onShake?.(0.25, 0.2);
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    if (this.t < this.life) {
      this.t += dt;
      const u = this.t / this.life, fade = Math.min(1, this.t / 0.15) * Math.min(1, (this.life - this.t) / 0.25);
      for (const s of this.streaks) {
        // each streak climbs a turn of the spiral, then starts again low: the wind keeps rising
        const k = (u * 2.2 + s.phase) % 1;
        const r0 = this.radius * (0.35 + 0.55 * k), y0 = 0.15 + 1.6 * k, a0 = s.a + this.t * SPIN;
        for (let i = 0; i < SEG; i++) {
          const q = i / (SEG - 1), a = a0 - q * 1.3 * Math.sign(SPIN); // the tail trails behind the turn
          this.pts[i].set(this.c.x + Math.sin(a) * r0, y0 - q * 0.25, this.c.z + Math.cos(a) * r0);
        }
        this.pts.reverse(); // head last: tailW widens toward the head
        W.v = 0.05 + 0.05 * Math.sin(Math.PI * k);
        const alpha = fade * Math.sin(Math.PI * k);
        this.glow.strip(this.pts, tailGlowW, alpha * 0.7, LOOK.glow);
        this.core.strip(this.pts, tailW, alpha, LOOK.edge);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.light.intensity = 6 * this.flash;
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 8);
    this.core.end(); this.glow.end();
  }
  clear() { this.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; this.flash = 0; this.light.intensity = 0; }
  get busy() { return this.t < this.life || this.sparks.length > 0; }
}
