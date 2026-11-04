// Bubbles of light (the eye clam's valve blast, docs/MONSTER-ATTACKS.md): see-through rings with a bright rim and a
// highlight (light-kit bubbleTexture, drawn live), thrown out, rising and wobbling, then popping into a few droplets.
// Cosmetic only; a fixed pool of sprites, no allocation per frame.
import * as THREE from 'three';
import { bubbleTexture, lightSprite } from './light-kit.js';

const N = 20;

export class BubbleFx {
  /** pop(x, y, z, size): called when a bubble bursts (the caller throws its droplets). */
  constructor(scene, pop = null) {
    this.pop = pop;
    this.b = Array.from({ length: N }, () => ({ s: lightSprite(scene, bubbleTexture(), true, 10), t: 9, life: 1, size: 0.3, ph: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.i = 0;
  }
  /** One bubble at (x, y, z) moving (vx, vy, vz), size its diameter (m), tint a colour hex, bursting after life s. */
  add(x, y, z, vx, vy, vz, size, life, tint = 0xbfeeff) {
    const q = this.b[this.i++ % N];
    q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.life = life; q.size = size; q.ph = Math.random() * 6.283;
    q.s.material.color.setHex(tint); q.s.visible = true;
  }
  update(dt) {
    for (const q of this.b) {
      if (q.t >= q.life) continue;
      q.t += dt;
      if (q.t >= q.life) { q.s.visible = false; this.pop?.(q.p.x, q.p.y, q.p.z, q.size); continue; }
      // thrown out, slowed by the water's drag, rising faster as it goes; a wobble side to side
      const k = Math.exp(-dt * 3.5);
      q.v.x *= k; q.v.z *= k; q.v.y = q.v.y * Math.exp(-dt * 1.5) + 2.2 * dt;
      q.p.addScaledVector(q.v, dt);
      const w = Math.sin(q.t * 9 + q.ph) * 0.04;
      q.s.position.set(q.p.x + w, q.p.y, q.p.z - w);
      // swells in, breathes, and in its last moment stretches before it pops
      const u = q.t / q.life, end = u > 0.85 ? (u - 0.85) / 0.15 : 0;
      q.s.scale.set(q.size * Math.min(1, q.t / 0.1) * (1 + 0.07 * Math.sin(q.t * 13 + q.ph) + 0.35 * end), q.size * Math.min(1, q.t / 0.1) * (1 - 0.06 * Math.sin(q.t * 13 + q.ph) + 0.2 * end), 1);
      q.s.material.opacity = 0.9 * (1 - end * 0.6);
    }
  }
  clear() { for (const q of this.b) { q.t = 9; q.s.visible = false; } }
}
