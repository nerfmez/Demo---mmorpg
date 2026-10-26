// Blizzard, built from the approved set so it matches the old skills (owner, 2026-10-26). The zone
// opens with Frost Nova's own ice (FrostFx: the same frosted floor, white rim and sharp crystals),
// sized to the hit radius, held for the zone's whole duration and melting as usual at its end
// (skill-fx.js starts it). This module draws the snow over it.
// Over it the wind drives snow in the same solid cel style: short white streaks circling the centre
// at a few heights, and flakes falling through them (normal blending, no soft glow). Cosmetic only.
// Research (docs/VFX-REFERENCE.md, 2026-10-26): Guild Wars 2's Blizzard pairs the storm with a ring of
// jutting ice; snow moving with the storm sells it.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';

const SLOTS = 2, STREAKS = 36, FLAKES = 46;
const SNOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.8) discard; gl_FragColor=vec4(d<0.45 ? vec3(1.0) : vT, vA); }`;
let stripW = 0;
const streakW = (x) => stripW * Math.sin(Math.PI * x), flakeW = () => stripW;
const ICE_EDGE = [0.62, 0.84, 0.96];

export class BlizzardFx {
  constructor(scene, camera, vfx) {
    this.scene = scene; this.vfx = vfx;
    this.snow = new Ribbon(scene, camera, 1600, SNOW_FS, THREE.NormalBlending);
    this.snow.mesh.renderOrder = 8;
    this.rnd = mulberry32(47);
    this.slots = Array.from({ length: SLOTS }, () => ({
      live: false, t: 0, dur: 5, x: 0, z: 0, radius: 3,
      streaks: Array.from({ length: STREAKS }, () => ({ a: 0, r: 0, h: 0, w: 0, len: 0 })),
      flakes: Array.from({ length: FLAKES }, () => ({ x: 0, z: 0, ph: 0, sp: 0 })),
    }));
    this.pts = Array.from({ length: 4 }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
  }
  // core 'area' event: the zone lasts e.duration
  begin(e) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], r = this.rnd;
    Object.assign(s, { live: true, t: 0, dur: e.duration || 5, x: e.x, z: e.z, radius: e.radius });
    for (const q of s.streaks) { q.a = r() * 6.283; q.r = (0.2 + 0.8 * Math.sqrt(r())) * e.radius; q.h = 0.3 + r() * 1.9; q.w = (1.8 + r() * 1.6) / Math.max(0.7, q.r * 0.6); q.len = 0.4 + r() * 0.4; }
    for (const f of s.flakes) { const a = r() * 6.283, d = Math.sqrt(r()) * e.radius; f.x = Math.cos(a) * d; f.z = Math.sin(a) * d; f.ph = r(); f.sp = 0.55 + r() * 0.5; }
  }
  update(dt) {
    this.snow.begin();
    const pts = this.pts, two = this.two;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const left = s.dur - s.t;
      if (s.t >= s.dur) { s.live = false; continue; }
      const fade = Math.min(1, s.t / 0.3) * Math.min(1, left / 0.35);
      for (const q of s.streaks) {
        q.a += q.w * dt;
        const span = q.len / Math.max(0.3, q.r);
        for (let i = 0; i < 4; i++) { const a = q.a - span * (1 - i / 3); pts[i].set(s.x + Math.cos(a) * q.r, q.h + 0.1 * Math.sin(q.a * 2 + q.r) + i * 0.03, s.z + Math.sin(a) * q.r); }
        stripW = 0.06; this.snow.strip(pts, streakW, 0.95 * fade, ICE_EDGE);
      }
      for (const f of s.flakes) {
        const k = (s.t * f.sp + f.ph) % 1, a = s.t * 1.1 + f.ph * 6.283, y = 2.6 * (1 - k);
        two[0].set(s.x + f.x + Math.cos(a) * 0.3, y + 0.08, s.z + f.z + Math.sin(a) * 0.3); two[1].set(two[0].x + 0.06, y, two[0].z);
        stripW = 0.09; this.snow.strip(two, flakeW, fade * Math.min(1, k * 6) * Math.min(1, (1 - k) * 6), ICE_EDGE);
      }
    }
    this.snow.end();
  }
  clear() { for (const s of this.slots) s.live = false; }
  get busy() { return this.slots.some((s) => s.live); }
}
