// The ironhorn ram's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first:
// bighorn rams rear on their hind legs and drop into a horn clash heard across a valley, back off for a run-up and
// charge head down, hook sideways with the curl of their horns. Iron horns: white-hot sparks and a ringing arc of
// steel light where they strike; dust off the hooves; danger zones are the game's own warnings (vfx.js tells).
// - Rearing clash (core monsterSwing of rear_clash): a crescent of steel light swept across the cone at its reach, a
//   burst of iron sparks and a star where the horns land, dust thrown forward, a heavy shake.
// - Run-up charge (core charge, clash): hooves scuff dust as it backs off and paws; dust streams off it as it runs;
//   its clash on what it struck is the biggest burst of sparks, a ring and a shake.
// - Horn hook (core hornHook): a crescent of steel light swept round the flank it hooks, sparks flung out that way.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, taperW, taperGlowW } from './light-kit.js';

const ARCS = 4, N = 21;
const STEEL = { edge: [1, 0.97, 0.88], glow: [1, 0.62, 0.25] }, STAR = { core: [1, 1, 0.92], glow: [1, 0.6, 0.2] };
const RING = new THREE.Color(0xffd8a0);

export class RamFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.arcs = Array.from({ length: ARCS }, () => ({ t: 9, x: 0, y: 0, z: 0, a0: 0, a1: 0, R: 2, w: 0.3 }));
    this.arcI = 0;
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.dustT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  sparks(x, y, z, a, spread, n, sp) {
    if (this.fx) for (let i = 0; i < n; i++) {
      const d = a + (Math.random() - 0.5) * spread, v = sp * (0.6 + Math.random());
      this.fx.add(x, y, z, Math.sin(d) * v, 1 + Math.random() * 3, Math.cos(d) * v, { color: i % 3 ? 0xffb050 : 0xfff4d0, size: 0.11, sizeEnd: 0.02, life: 0.45, gravity: 12, drag: 0.6 });
    }
  }
  sweep(x, y, z, a0, a1, R, w) { Object.assign(this.arcs[this.arcI++ % ARCS], { t: 0, x, y, z, a0, a1, R, w }); }

  /** The ram's horn strike (core monsterSwing of rear_clash); true when drawn here. */
  swing(e) {
    if (e.type !== 'ironhorn_ram') return false;
    const y = this.gy(e.x, e.z), half = ((e.arc || 110) * Math.PI) / 360;
    this.sweep(e.x, y + 0.5, e.z, e.angle - half, e.angle + half, e.range * 0.85, 0.32);
    const hx = e.x + Math.sin(e.angle) * e.range * 0.55, hz = e.z + Math.cos(e.angle) * e.range * 0.55;
    this.sparks(hx, y + 0.5, hz, e.angle, 1.6, 18, 4);
    this.monster.burstStar?.(hx, y + 0.6, hz, 0.6, STAR, 0xffc070, 0xffffff);
    for (let i = 0; i < 8; i++) { const a = e.angle + (Math.random() - 0.5) * 1.8; this.monster.call?.dust(hx, y + 0.12, hz, Math.sin(a) * 3, 0.5, Math.cos(a) * 3, 0.8, 0.5); }
    if (e.at) this.monster.burstStar?.(e.at[0], this.gy(e.at[0], e.at[1]) + 0.8, e.at[1], 0.45, STAR, 0xffc070, 0xffffff);
    this.monster.onShake?.(0.14, 0.14);
    return true;
  }

  /** The ram's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'ironhorn_ram') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'hornHook': {
        const half = ((e.arc || 140) * Math.PI) / 360, from = e.angle - e.side * half, to = e.angle + e.side * half;
        this.sweep(e.x, y + 0.6, e.z, from, to, e.range * 0.85, 0.28);
        const out = e.angle + e.side * 0.6;
        this.sparks(e.x + Math.sin(e.angle) * e.range * 0.6, y + 0.6, e.z + Math.cos(e.angle) * e.range * 0.6, out, 1.2, 12, 4);
        this.monster.onShake?.(0.08, 0.1);
        return true;
      }
      case 'clash': {
        const cx = (e.x + e.tx) / 2, cz = (e.z + e.tz) / 2, cy = this.gy(cx, cz);
        this.sparks(cx, cy + 0.7, cz, e.angle, 2.4, 26, 5);
        this.monster.burstStar?.(cx, cy + 0.8, cz, 0.85, STAR, 0xffc070, 0xffffff);
        this.monster.call?.ring(cx, cy + 0.8, cz, 1.6, RING, 0.35);
        this.sweep(e.x, cy + 0.7, e.z, e.angle - 0.9, e.angle + 0.9, 1.6, 0.36);
        for (let i = 0; i < 10; i++) { const a = e.angle + (Math.random() - 0.5) * 2.4; this.monster.call?.dust(cx, cy + 0.12, cz, Math.sin(a) * 3.2, 0.6, Math.cos(a) * 3.2, 0.9, 0.5); }
        this.monster.onShake?.(0.2, 0.18);
        return true;
      }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const puff = (this.dustT -= dt) <= 0;
    if (puff) this.dustT = 0.07;
    for (const m of g.monsters) {
      if (m.type !== 'ironhorn_ram' || m.dead || !puff) continue;
      const y = this.gy(m.x, m.z);
      // backing off and pawing: hooves scuff the dust; charging: dust streams off it
      if (m.backing || (m.state === 'windup' && m.windup?.name === 'run_charge' && Math.random() < 0.5)) {
        const a = m.facing + (Math.random() - 0.5) * 1.2;
        this.monster.call?.dust(m.x + Math.sin(a) * 0.6, y + 0.1, m.z + Math.cos(a) * 0.6, (Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8, 0.5, 0.4);
      }
      if (m.charge && m.windup?.name === 'run_charge') for (let i = 0; i < 2; i++) {
        const a = m.facing + Math.PI + (Math.random() - 0.5) * 1.2;
        this.monster.call?.dust(m.x - Math.sin(m.facing) * 0.6, y + 0.12, m.z - Math.cos(m.facing) * 0.6, Math.sin(a) * 2, 0.5, Math.cos(a) * 2, 0.7, 0.45);
      }
    }
    // the crescents of steel light: swept across in a blink, then thinning away
    for (const A of this.arcs) {
      if (A.t >= 0.35) continue;
      A.t += dt;
      const grow = Math.min(1, A.t / 0.08), fade = A.t < 0.1 ? 1 : Math.max(0, 1 - (A.t - 0.1) / 0.25), head = A.a0 + (A.a1 - A.a0) * grow;
      for (let j = 0; j < N; j++) { const u = j / (N - 1), a = A.a0 + (head - A.a0) * u, r = A.R * (0.85 + 0.15 * Math.sin(u * Math.PI)); this.pts[j].set(A.x + Math.sin(a) * r, A.y + 0.15 * Math.sin(u * Math.PI), A.z + Math.cos(a) * r); }
      RW.v = A.w * (1 + 0.3 * (1 - fade)); this.glow.strip(this.pts, taperGlowW, 0.7 * fade, STEEL.glow); this.core.strip(this.pts, taperW, fade, STEEL.edge);
    }
    this.core.end(); this.glow.end();
  }
}
