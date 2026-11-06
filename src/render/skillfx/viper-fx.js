// The reed viper's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A snake's, not a
// fanged mammal's (owner, 2026-11-06: the jaw of light read as "a fanged animal's bite"): venom green and reed gold,
// danger zones in the warm warning colour at their true size.
// - Strike (core viperStrike): two small fang punctures of light where it bit, a spurt of venom drops and a tight
//   green ring; dust where its body pushed off. Between its two strikes the lane of the next is lit, filling to it.
// - Constrict (core coilDash, coilGrab, coilFree, coilEnd): dust off its belly as it rushes in; caught, green-gold
//   rings tighten round its prey on every squeeze; torn free, a burst of dust and reed leaves.
// - Tail lash (core tailLash, tailCut, tell sector): its leaf-blade tail leaves a crescent of gold-green light round its
//   back, leaves scatter off it; a cut on what it catches.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, taperW, taperGlowW } from './light-kit.js';

const ARC = 25;
const LEAF = { edge: [1, 0.95, 0.55], glow: [0.45, 0.85, 0.2] }, FANG = { edge: [1, 1, 0.92], glow: [0.55, 0.95, 0.3] }, SQUEEZE = { edge: [0.9, 1, 0.6], glow: [0.4, 0.8, 0.2] };
const VENOM = { core: [0.95, 1, 0.8], glow: [0.5, 0.95, 0.25] }, MIST = new THREE.Color(0xa8e04a);
const CUT_HALO = new THREE.Color('#9be36a'), CUT_RIM = new THREE.Color('#fff8c8');
const _v = new THREE.Vector3();

export class ViperFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1200, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.arcPts = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.ring = Array.from({ length: 33 }, () => new THREE.Vector3());
    this.line = Array.from({ length: 4 }, () => new THREE.Vector3());
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.lane = { band: new THREE.Mesh(lane, mat(0xff7a3a, 0.22)), fill: new THREE.Mesh(lane, mat(0xffa060, 0.4)) };
    for (const m of [this.lane.band, this.lane.fill]) { m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); }
    this.fangs = Array.from({ length: 4 }, () => ({ t: 9, x: 0, y: 0, z: 0, a: 0 }));
    this.fangI = 0;
    this.lashes = Array.from({ length: 2 }, () => ({ t: 9, x: 0, z: 0, a: 0, arc: 4, R: 3 }));
    this.lashI = 0;
    this.squeezes = Array.from({ length: 3 }, () => ({ t: 9, x: 0, z: 0 }));
    this.sqI = 0;
    this.holds = new Map(); // id -> time to its next squeeze ring
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  leaves(x, y, z, n, sp) {
    if (this.fx) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.5 + Math.random()); this.fx.add(x, y, z, Math.sin(a) * v, 1.5 + Math.random() * 2, Math.cos(a) * v, { color: i % 2 ? 0x9ab84a : 0xd8c860, size: 0.13, sizeEnd: 0.06, life: 0.7, gravity: 6, drag: 1.5 }); }
  }

  /** The reed viper's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'reed_viper') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'viperStrike': {
        const y0 = this.gy(e.x0, e.z0);
        for (let i = 0; i < 5; i++) { const a = e.angle + Math.PI + (Math.random() - 0.5) * 2; this.monster.call?.dust(e.x0, y0 + 0.12, e.z0, Math.sin(a) * 1.6, 0.4, Math.cos(a) * 1.6, 0.6, 0.4); }
        if (e.at) {
          // two fang punctures of light, a spurt of venom, a tight green ring
          const yy = this.gy(e.at[0], e.at[1]) + 0.65;
          Object.assign(this.fangs[this.fangI++ % this.fangs.length], { t: 0, x: e.at[0], y: yy, z: e.at[1], a: e.angle });
          this.monster.burstStar?.(e.at[0], yy, e.at[1], 0.38, VENOM, 0xb6ec4a, 0xeaffb0);
          this.monster.call?.ring(e.at[0], yy, e.at[1], 0.55, MIST, 0.25);
          if (this.fx) for (let i = 0; i < 14; i++) { const a = e.angle + (Math.random() - 0.5) * 1.8, v = 1.5 + Math.random() * 3; this.fx.add(e.at[0], yy, e.at[1], Math.sin(a) * v, 1 + Math.random() * 2.5, Math.cos(a) * v, { color: i % 3 ? 0xa8e04a : 0xeaffb0, size: 0.12, sizeEnd: 0.04, life: 0.5, gravity: 9, drag: 0.8 }); }
          this.monster.onShake?.(0.06, 0.06);
        }
        return true;
      }
      case 'coilDash': for (let i = 0; i < 8; i++) { const a = e.angle + Math.PI + (Math.random() - 0.5) * 1.6; this.monster.call?.dust(e.x, y + 0.12, e.z, Math.sin(a) * 2.5, 0.5, Math.cos(a) * 2.5, 0.8, 0.45); } return true;
      case 'coilGrab': {
        for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.5, y + 0.15, e.z + Math.cos(a) * 0.5, Math.sin(a) * 1.8, 0.5, Math.cos(a) * 1.8, 0.7, 0.45); }
        this.holds.set(e.id, 0);
        this.monster.onShake?.(0.08, 0.1);
        return true;
      }
      case 'coilFree': case 'coilEnd':
        this.holds.delete(e.id);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.6, y + 0.2, e.z + Math.cos(a) * 0.6, Math.sin(a) * 2.6, 0.6, Math.cos(a) * 2.6, 0.8, 0.5); }
        if (e.type === 'coilFree') this.leaves(e.x, y + 0.6, e.z, 10, 3);
        return true;
      case 'tailLash': {
        Object.assign(this.lashes[this.lashI++ % this.lashes.length], { t: 0, x: e.x, z: e.z, a: e.angle, arc: (e.arc * Math.PI) / 180, R: e.range });
        this.leaves(e.x + Math.sin(e.angle) * e.range * 0.8, y + 0.4, e.z + Math.cos(e.angle) * e.range * 0.8, 8, 3);
        this.monster.onShake?.(0.06, 0.08);
        return true;
      }
      case 'tailCut': {
        const yy = y + 0.6;
        this.monster.companion?.axes();
        _v.set(e.x, yy, e.z);
        this.monster.companion?.rake(_v, 1, 2, 0.45, 0.8, 0.16, CUT_HALO, CUT_RIM, 0.02);
        this.monster.burstStar?.(e.x, yy, e.z, 0.5, VENOM, 0xd8f080, 0xffffff);
        return true;
      }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let laneOn = false;
    for (const m of g.monsters) {
      if (m.type !== 'reed_viper' || m.dead) continue;
      // between its strikes: the next strike's lane lit, filling to it
      if (m.fangs && !laneOn) {
        laneOn = true;
        const atk = m.def.attacks[m.fangs.name], k = Math.min(1, m.fangs.t / atk.gap), y = this.gy(m.x, m.z) + 0.06;
        this.laneMesh(this.lane.band, m.x, y, m.z, m.fangs.angle, atk.width, atk.range, 0.2);
        this.laneMesh(this.lane.fill, m.x, y + 0.005, m.z, m.fangs.angle, atk.width, atk.range * k, 0.4);
      }
      // wound round its prey: a ring tightens on every squeeze; the rush throws dust off its belly
      if (m.coil?.phase === 'hold' && this.holds.has(m.id)) {
        const next = this.holds.get(m.id) - dt;
        if (next <= 0) { Object.assign(this.squeezes[this.sqI++ % this.squeezes.length], { t: 0, x: m.x, z: m.z }); this.holds.set(m.id, m.def.attacks.constrict.tick); }
        else this.holds.set(m.id, next);
      }
      if (m.coil?.phase === 'dash' && Math.random() < 0.7) this.monster.call?.dust(m.x, this.gy(m.x, m.z) + 0.1, m.z, -Math.sin(m.facing) * 2, 0.4, -Math.cos(m.facing) * 2, 0.7, 0.4);
    }
    if (!laneOn) this.lane.band.visible = this.lane.fill.visible = false;
    this.drawFangs(dt); this.drawLashes(dt); this.drawSqueezes(dt);
    this.core.end(); this.glow.end();
  }
  laneMesh(mesh, x, y, z, a, w, len, o) {
    mesh.position.set(x, y, z); mesh.rotation.set(0, a, 0); mesh.scale.set(w, 1, Math.max(0.01, len));
    mesh.material.opacity = o; mesh.visible = true;
  }

  // two short fang punctures, side by side, struck downward and fading
  drawFangs(dt) {
    for (const F of this.fangs) {
      if (F.t >= 0.4) continue;
      F.t += dt;
      const grow = Math.min(1, F.t / 0.05), fade = F.t > 0.15 ? 1 - (F.t - 0.15) / 0.25 : 1, sx = Math.cos(F.a), sz = -Math.sin(F.a);
      for (const o of FANG_OFF) {
        for (let j = 0; j < 4; j++) { const u = j / 3; this.line[j].set(F.x + sx * o, F.y + 0.22 - 0.3 * u * grow, F.z + sz * o); }
        RW.v = 0.07 * fade; this.glow.strip(this.line, taperGlowW, 0.7 * fade, FANG.glow); this.core.strip(this.line, taperW, fade, FANG.edge);
      }
    }
  }

  // the tail's crescent of light round its back, swept from one side to the other
  drawLashes(dt) {
    for (const L of this.lashes) {
      if (L.t >= 0.4) continue;
      L.t += dt;
      const sweep = Math.min(1, L.t / 0.12), fade = L.t > 0.14 ? 1 - (L.t - 0.14) / 0.26 : 1, y = this.gy(L.x, L.z) + 0.35;
      for (let j = 0; j < ARC; j++) {
        const u = j / (ARC - 1), a = L.a + (u - 0.5) * L.arc * sweep, r = L.R * (0.85 + 0.15 * Math.sin(u * Math.PI));
        this.arcPts[j].set(L.x + Math.sin(a) * r, y + Math.sin(u * Math.PI) * 0.15, L.z + Math.cos(a) * r);
      }
      RW.v = 0.3 * fade; this.glow.strip(this.arcPts, taperGlowW, 0.7 * fade, LEAF.glow); this.core.strip(this.arcPts, taperW, 0.95 * fade, LEAF.edge);
    }
  }

  // a ring tightening round the squeezed prey
  drawSqueezes(dt) {
    for (const Q of this.squeezes) {
      if (Q.t >= 0.35) continue;
      Q.t += dt;
      const k = Q.t / 0.35, r = 1.1 - 0.55 * k, fade = 1 - k, n = this.ring.length, y = this.gy(Q.x, Q.z) + 0.7;
      for (let j = 0; j < n; j++) { const a = (j / (n - 1)) * Math.PI * 2; this.ring[j].set(Q.x + Math.sin(a) * r, y, Q.z + Math.cos(a) * r); }
      RW.v = 0.09 * fade; this.glow.strip(this.ring, lineGlowW, 0.6 * fade, SQUEEZE.glow); this.core.strip(this.ring, lineW, 0.9 * fade, SQUEEZE.edge);
    }
  }
}
// the two fangs' sideways offsets (m)
const FANG_OFF = [-0.09, 0.09];
