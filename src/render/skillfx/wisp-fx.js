// The marsh wisp's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first: a
// will-o'-the-wisp is a ghost light over a bog - marsh gas (methane, phosphine) welling up and catching fire by itself -
// that in folklore leads travellers astray into the water and scatters when they come near. Cold blue flame round a
// gold heart (its crystal); danger zones in the warm warning colour at their true size.
// - Lost lights (core projectiles wisp_orb, weaving): each a blue flame with a white heart, trailing a ribbon of light
//   along the path it weaves, wisps of flame shed behind; on a hit a blue burst (core impact).
// - Marsh gas (areas marsh_gas, marked by vfx.js): through the wind-up bubbles rise at every spot; each catches in
//   turn (core burst): a column of blue fire leaping up, a flash, a ring.
// - Bog lure (area bog_pool, drawn by vfx.js as a mire): through the wind-up the bog is ringed and its fill grows to
//   the end; lights dance over it; lured (core lure, the hero's lure status), threads of light run from the hero to
//   the bog and little lights circle the hero's head.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, tailW, tailGlowW } from './light-kit.js';
import { lightSprite, glowTexture } from './light-kit.js';

const ORBS = 6, HIST = 14;
const BLUE = { edge: [0.55, 0.85, 1], glow: [0.15, 0.45, 1] }, WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const STAR = { core: [1, 1, 1], glow: [0.35, 0.75, 1] }, RING = new THREE.Color(0x9fe6ff);
const _v = new THREE.Vector3();

export class WispFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const tex = glowTexture('lightning');
    this.orbs = Array.from({ length: ORBS }, () => {
      const halo = lightSprite(scene, tex, true, 10), heart = lightSprite(scene, tex, true, 11);
      halo.material.color.setRGB(0.12, 0.45, 1); heart.material.color.setRGB(0.75, 0.95, 1);
      halo.visible = heart.visible = false;
      return { id: -1, halo, heart, pts: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0, seen: false };
    });
    this.ring = Array.from({ length: 41 }, () => new THREE.Vector3());
    this.thread = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.bubbleT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** A lost light's hit (core impact of wisp_orb). */
  impact(e) {
    const y = this.gy(e.x, e.z) + 1.0;
    this.monster.burstStar?.(e.x, y, e.z, 0.6, STAR, 0x9fe6ff, 0xffffff);
    this.monster.call?.ring(e.x, y, e.z, 0.7, RING, 0.3);
    if (this.fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 2.5; this.fx.add(e.x, y, e.z, Math.sin(a) * v, 1 + Math.random() * 2, Math.cos(a) * v, { color: i % 3 ? 0x6fd0ff : 0xffffff, size: 0.16, sizeEnd: 0.03, life: 0.45, drag: 2 }); }
  }
  /** A spot of marsh gas catching fire (core burst of marsh_gas): a column of blue fire. */
  ignite(e) {
    const y = this.gy(e.x, e.z);
    this.monster.burstStar?.(e.x, y + 0.6, e.z, 0.7, STAR, 0x6fc8ff, 0xffffff);
    this.monster.call?.ring(e.x, y + 0.08, e.z, e.radius, RING, 0.35);
    if (this.fx) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, r = Math.random() * e.radius * 0.6; this.fx.add(e.x + Math.sin(a) * r, y + 0.2, e.z + Math.cos(a) * r, Math.sin(a) * 0.6, 4 + Math.random() * 3, Math.cos(a) * 0.6, { color: i % 3 ? 0x5fb8ff : 0xdff6ff, size: 0.32, sizeEnd: 0.05, life: 0.55, drag: 1.6 }); }
    this.monster.onShake?.(0.05, 0.06);
  }

  /** The marsh wisp's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'marsh_wisp') return false;
    if (e.type === 'wispOrbs') { this.monster.burstStar?.(m.x, this.gy(m.x, m.z) + 1.2, m.z, 0.5, STAR, 0x9fe6ff, 0xffffff); return true; }
    if (e.type === 'lure') { this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 0.1, e.z, 2.2, RING, 0.5); return true; }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    // the lost lights
    for (const O of this.orbs) O.seen = false;
    for (const pr of g.projectiles) {
      if (pr.kind !== 'wisp_orb') continue;
      let O = this.orbs.find((q) => q.id === pr.id);
      if (!O) { O = this.orbs.find((q) => q.id === -1 || !g.projectiles.some((p) => p.id === q.id)); if (!O) continue; O.id = pr.id; O.n = 0; }
      O.seen = true;
      const y = this.gy(pr.x, pr.z) + 1.0 + Math.sin(this.time * 9 + pr.id) * 0.06;
      O.halo.position.set(pr.x, y, pr.z); O.halo.scale.setScalar(1.7 + 0.2 * Math.sin(this.time * 17 + pr.id)); O.halo.material.opacity = 0.95; O.halo.visible = true;
      O.heart.position.set(pr.x, y, pr.z); O.heart.scale.setScalar(0.38); O.heart.material.opacity = 1; O.heart.visible = true;
      // its weaving path as a ribbon of light behind it
      if (O.n === 0) for (const p of O.pts) p.set(pr.x, y, pr.z);
      for (let j = 0; j < HIST - 1; j++) O.pts[j].copy(O.pts[j + 1]);
      O.pts[HIST - 1].set(pr.x, y, pr.z); O.n++;
      RW.v = 0.32; this.glow.strip(O.pts, tailGlowW, 0.9, BLUE.glow); this.core.strip(O.pts, tailW, 0.8, BLUE.edge);
      if (this.fx && Math.random() < 0.8) this.fx.add(pr.x, y, pr.z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, { color: Math.random() < 0.5 ? 0x5fb8ff : 0xbfeaff, size: 0.2, sizeEnd: 0.03, life: 0.4, drag: 1.5 });
    }
    for (const O of this.orbs) if (!O.seen) { O.id = -1; O.halo.visible = O.heart.visible = false; }
    // the marsh gas bubbling up through the wind-up; the bog ringed, its lights dancing
    const bubble = (this.bubbleT -= dt) <= 0;
    if (bubble) this.bubbleT = 0.05;
    for (const a of g.areas) {
      if (a.kind === 'marsh_gas' && a.t < a.delay && bubble && this.fx) {
        const ang = Math.random() * 6.283, r = Math.random() * a.radius * 0.7, x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
        this.fx.add(x, this.gy(x, z) + 0.08, z, 0, 0.6 + Math.random() * 0.6, 0, { color: Math.random() < 0.6 ? 0xdff6ff : 0x7fcfff, size: 0.1 + 0.08 * (a.t / a.delay), sizeEnd: 0.16, life: 0.5, drag: 1 });
      }
      if (a.kind === 'bog_pool' && a.t >= a.delay && bubble && this.fx && Math.random() < 0.5) {
        const ang = Math.random() * 6.283, r = Math.random() * a.radius, x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
        this.fx.add(x, this.gy(x, z) + 0.5 + Math.random() * 0.8, z, Math.sin(this.time * 3 + r) * 0.4, 0.3, Math.cos(this.time * 3 + r) * 0.4, { color: 0x9fe6ff, size: 0.18, sizeEnd: 0.05, life: 0.9, drag: 1 });
      }
    }
    for (const m of g.monsters) {
      if (m.type !== 'marsh_wisp' || m.dead || m.state !== 'windup' || m.windup?.name !== 'bog_lure') continue;
      // the bog to come: a warning ring at its true size, its fill growing to the end of the wind-up
      const atk = m.def.attacks.bog_lure, k = Math.min(1, m.stateT / m.windup.total), x = m.windup.tx, z = m.windup.tz, y = this.gy(x, z) + 0.06;
      for (const [R, w, o] of [[atk.radius, 0.08, 0.9], [atk.radius * k, 0.05, 0.6]]) {
        for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(x + Math.sin(a) * R, y, z + Math.cos(a) * R); }
        RW.v = w; this.glow.strip(this.ring, lineGlowW, 0.4 * o, WARN.glow); this.core.strip(this.ring, lineW, o, WARN.edge);
      }
      if (bubble && this.fx) { const a = Math.random() * 6.283, r = Math.random() * atk.radius; this.fx.add(x + Math.sin(a) * r, y + 0.3, z + Math.cos(a) * r, 0, 0.8, 0, { color: 0x9fe6ff, size: 0.14, sizeEnd: 0.04, life: 0.7, drag: 1 }); }
    }
    // lured: threads of light from the hero to the bog, little lights circling the hero's head
    const p = g.player, L = p && !p.dead && p.statuses?.lure;
    if (L) {
      const y0 = this.gy(p.x, p.z) + 1.1, y1 = this.gy(L.x, L.z) + 0.3;
      for (let s = 0; s < 2; s++) {
        for (let j = 0; j < this.thread.length; j++) {
          const u = j / (this.thread.length - 1), wob = Math.sin(u * 6 + this.time * 8 + s * 3) * 0.25 * Math.sin(u * Math.PI), dx = L.x - p.x, dz = L.z - p.z, d = Math.hypot(dx, dz) || 1;
          this.thread[j].set(p.x + dx * u + (dz / d) * wob, y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 0.4, p.z + dz * u - (dx / d) * wob);
        }
        RW.v = 0.06; this.glow.strip(this.thread, lineGlowW, 0.5, BLUE.glow); this.core.strip(this.thread, lineW, 0.7, BLUE.edge);
      }
      if (bubble && this.fx) for (let i = 0; i < 2; i++) { const a = this.time * 5 + i * Math.PI; this.fx.add(p.x + Math.sin(a) * 0.4, y0 + 0.9, p.z + Math.cos(a) * 0.4, 0, 0.3, 0, { color: 0xbfeaff, size: 0.14, sizeEnd: 0.04, life: 0.4, drag: 1 }); }
    }
    this.core.end(); this.glow.end();
  }
}
