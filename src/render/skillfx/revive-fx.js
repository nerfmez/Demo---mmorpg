// Revive (the priest's guardian light, owner 2026-11-02; core: a buff with `revive`, reviveFrom). Research
// (web search, pages blocked; and the game's own holy kit, Blessing of Light and Holy Bell): a protection that
// waits is shown as a halo over the head while it lasts (MMO "guardian angel" / soulstone buffs), and the
// rising is a column of light with feathers of light going up. In the holy gold of Blessing and the Bell:
//   cast:   a ring of gold light runs out over the ground to the true radius, and light falls in thin strokes
//           round the hero;
//   wait:   a thin halo of gold turns slowly over the head of every body that carries the light (the hero and
//           the summons it reached), breathing; it fades over the light's last 3 s;
//   rising: when a lethal hit is caught: a star flash, a ring on the ground, strokes of gold light rising round
//           the body like a column, and a short shake; the halo is gone (the light is spent).
// Pooled, numbers in uniforms; one ribbon pair; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightSprite, starTexture } from './light-kit.js';

const GOLD = { core: [1.0, 0.8, 0.3], glow: [1.0, 0.62, 0.15] }, RING = new THREE.Color(1.0, 0.78, 0.35);
const HALO_N = 22, STREAKS = 40, FLASHES = 4;
const HEAD = { player: 1.5, spirit_wisp: 1.35, spirit_wolf: 1.35, spirit_alpha: 2.0, stone_guardian: 2.7, hunt_hound: 1.45, hunt_bear: 1.9, hunt_hawk: 2.6, pack_hound: 1.25 };
let sw = 0;
const lineW = () => sw, lineGlowW = () => sw * 2.6, streakW = (x) => sw * Math.sin(Math.PI * x), streakGlowW = (x) => sw * 2.4 * Math.sin(Math.PI * x);

export class ReviveFx {
  /** call: the CallFx whose ground rings these share. */
  constructor(scene, camera, call) {
    this.camera = camera; this.call = call; this.time = 0; this.onShake = null;
    this.core = new Ribbon(scene, camera, 800, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 800, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 11; this.glow.mesh.renderOrder = 10;
    this.halo = Array.from({ length: HALO_N }, () => new THREE.Vector3());
    this.streaks = Array.from({ length: STREAKS }, () => ({ t: 9, life: 0.6, x: 0, z: 0, y0: 0, v: 3, len: 0.5, w: 0.04, down: false }));
    this.si = 0;
    this.flashes = Array.from({ length: FLASHES }, () => ({ s: lightSprite(scene, starTexture('holy'), true, 13), t: 9, x: 0, y: 0, z: 0, size: 1.5 }));
    this.fi = 0;
    this.four = Array.from({ length: 5 }, () => new THREE.Vector3()); // a streak's points (a 2-point strip has no middle to be wide in)
  }
  streak(x, y0, z, v, len, life, w, delay = 0, down = false) { const q = this.streaks[this.si++ % STREAKS]; Object.assign(q, { t: -delay, life, x, z, y0, v, len, w, down }); }
  /** The rules' buff of Revive at (x, z) out to radius. */
  bestow(x, z, radius) {
    this.call.ring(x, 0.05, z, radius, RING, 0.6);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283, r = 0.5 + 0.4 * (i % 2); this.streak(x + Math.cos(a) * r, 3.4, z + Math.sin(a) * r, -4, 1.3, 0.7, 0.09, i * 0.03, true); }
  }
  /** The rules' revive of a body at (x, z) (type: 'player' or the ally's type). */
  rise(x, z, type) {
    const h = HEAD[type] || 1.6, f = this.flashes[this.fi++ % FLASHES];
    Object.assign(f, { t: 0, x, y: h * 0.55, z, size: 1.2 + h * 0.6 });
    this.call.ring(x, 0.05, z, 1.4 + h * 0.3, RING, 0.5);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283, r = 0.35 + 0.25 * ((i * 7) % 3) / 2; this.streak(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, 2.6 + 0.6 * (i % 3), 1.3, 0.8, 0.1, (i % 4) * 0.05); }
    this.onShake?.(0.12, 0.12);
  }
  /** bodies: [{x, z, type, t (the light's time left)}] that carry the light now. */
  update(dt, bodies) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    // the halos
    for (const b of bodies) {
      const h = HEAD[b.type] || 1.6, a = Math.min(1, b.t / 3) * (0.75 + 0.25 * Math.sin(this.time * 3 + b.x)), r = 0.3 + 0.08 * (h > 2 ? 1 : 0), rot = this.time * 0.8;
      const P = this.halo, n = P.length;
      for (let i = 0; i < n; i++) { const u = rot + (i / (n - 1)) * 6.2832; P[i].set(b.x + Math.cos(u) * r, h + 0.04 * Math.sin(u * 2 + this.time), b.z + Math.sin(u) * r * 0.9); }
      sw = 0.06; this.glow.strip(P, lineGlowW, 0.7 * a, GOLD.glow); this.core.strip(P, lineW, 0.9 * a, GOLD.core);
    }
    // the streaks of light (falling on the cast, rising on the revive)
    for (const q of this.streaks) {
      if (q.t >= q.life) continue;
      q.t += dt; if (q.t < 0) continue;
      const u = q.t / q.life, y = q.y0 + q.v * q.t;
      for (let i = 0; i < this.four.length; i++) this.four[i].set(q.x, y + (q.down ? 1 : -1) * q.len * (i / (this.four.length - 1)), q.z);
      sw = q.w; const a = Math.sin(Math.PI * u);
      this.glow.strip(this.four, streakGlowW, 0.7 * a, GOLD.glow); this.core.strip(this.four, streakW, a, GOLD.core);
    }
    this.core.end(); this.glow.end();
    for (const f of this.flashes) {
      if (f.t >= 0.4) { f.s.visible = false; continue; }
      f.t += dt; const u = f.t / 0.4; f.s.visible = true; f.s.position.set(f.x, f.y, f.z);
      f.s.scale.setScalar(f.size * Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.1))); f.s.material.rotation = u * 1.5; f.s.material.opacity = 1 - u * u;
    }
  }
  clear() { for (const q of this.streaks) q.t = 9; for (const f of this.flashes) { f.t = 9; f.s.visible = false; } }
}
