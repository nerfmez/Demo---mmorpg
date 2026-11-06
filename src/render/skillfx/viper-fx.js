// The reed viper's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first: an
// ambush hunter that lies coiled and still for a long time, lures prey with the tip of its tail, folds its neck into
// an S and strikes extremely fast; disturbed, it swells up and hisses before it strikes. Venom green and reed gold,
// danger zones in the warm warning colour at their true size.
// - S-strike (core viperStrike): a jaw of light slams shut on what it bites (the companions' bite), a green star and
//   venom drops; dust and torn reed leaves where it shot from.
// - Reed ambush (core ambush): reeds rise round it as it sinks into its coil and it fades half out of sight; its
//   strike reach is ringed with reed blades swaying over a thin warning ring; its tail-tip leaf glints now and then
//   (the lure). Noticed (core ambushTrigger): its eyes flash, the ring flares and the lane to its prey is lit for the
//   beat before it strikes. Given up (core ambushEnd): the reeds sink away.
// - Puff and hiss (core hiss, tell sector): green breath leaks from its jaws while it swells, puffs ring its body;
//   the hiss throws a cone of venom mist that hangs as three bubbling clouds (areas hiss_mist, drawn like the
//   venom mire by vfx.js, with mist drifting off them here).
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, taperW, taperGlowW } from './light-kit.js';
import { BITE_SHUT } from './bite-fx.js';

const BLADES = 28, CAMO = 10;
const REED = { edge: [0.42, 0.68, 0.2], glow: [0.25, 0.55, 0.1] }, WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const VENOM = { core: [0.95, 1, 0.8], glow: [0.5, 0.95, 0.25] }, MIST = new THREE.Color(0xa8e04a);
const _v = new THREE.Vector3();

export class ViperFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    this.blade = Array.from({ length: 4 }, () => new THREE.Vector3());
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.lane = new THREE.Mesh(lane, mat(0xffa060, 0.5)); this.lane.visible = false; this.lane.renderOrder = 7; this.lane.frustumCulled = false; scene.add(this.lane);
    // per viper: its ambush (how far risen the reeds are), the moment it was noticed, the lane it will strike down
    this.state = new Map();
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  bonePos(id, bone, out) { const b = this.host.monsterRig?.(id)?.bones?.[bone]; if (!b) return null; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }
  st(id) { let S = this.state.get(id); if (!S) this.state.set(id, (S = { reeds: 0, flare: 0, trig: -1, angle: 0, faded: false, lureT: 0, mistT: 0 })); return S; }

  /** The reed viper's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'reed_viper') return false;
    const y = this.gy(e.x, e.z);
    if (e.type === 'viperStrike') {
      // where it shot from: dust and torn reed leaves
      const y0 = this.gy(e.x0, e.z0);
      for (let i = 0; i < 7; i++) { const a = e.angle + Math.PI + (Math.random() - 0.5) * 2; this.monster.call?.dust(e.x0, y0 + 0.15, e.z0, Math.sin(a) * 2.2, 0.5, Math.cos(a) * 2.2, 0.7, 0.45); }
      if (this.fx) for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283; this.fx.add(e.x0, y0 + 0.3, e.z0, Math.sin(a) * 2, 2 + Math.random() * 2, Math.cos(a) * 2, { color: i % 2 ? 0x9ab84a : 0xd8c860, size: 0.12, sizeEnd: 0.05, life: 0.6, gravity: 7, drag: 1.5 }); }
      if (e.at) {
        // the fangs: a jaw of light slams shut on it, a green star, venom drops
        const yy = this.gy(e.at[0], e.at[1]) + 0.7;
        this.monster.companion?.biteFx?.bite(e.at[0], yy, e.at[1], 0.55, Math.sin(e.angle) > 0 ? -0.18 : 0.18);
        this.monster.companion?.glint(e.at[0], yy, e.at[1], 0.7, BITE_SHUT);
        this.monster.burstStar?.(e.at[0], yy, e.at[1], 0.6, VENOM, 0xb6ec4a, 0xeaffb0);
        if (this.fx) for (let i = 0; i < 12; i++) { const a = e.angle + (Math.random() - 0.5) * 2.4, v = 1.5 + Math.random() * 2.5; this.fx.add(e.at[0], yy, e.at[1], Math.sin(a) * v, 1 + Math.random() * 2, Math.cos(a) * v, { color: i % 3 ? 0xa8e04a : 0xeaffb0, size: 0.13, sizeEnd: 0.04, life: 0.5, gravity: 9, drag: 0.8 }); }
        this.monster.onShake?.(0.08, 0.08);
      }
      const S = this.st(e.id); S.trig = -1;
      return true;
    }
    if (e.type === 'ambushTrigger') {
      const S = this.st(e.id); S.trig = 0; S.total = e.delay; S.angle = e.angle; S.flare = 1;
      if (this.bonePos(e.id, 'head', _v)) this.monster.companion?.glint(_v.x, _v.y + 0.05, _v.z, 1.0, 0);
      return true;
    }
    if (e.type === 'ambushEnd') {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.6, y + 0.15, e.z + Math.cos(a) * 0.6, Math.sin(a), 0.4, Math.cos(a), 0.6, 0.4); }
      return true;
    }
    if (e.type === 'hiss') {
      // the cone of venom mist thrown out, a ring of breath at its jaws
      const half = (e.arc * Math.PI) / 360;
      for (let i = 0; i < 18; i++) {
        const a = e.angle + (Math.random() * 2 - 1) * half, v = e.range * (1.2 + Math.random() * 1.2), d = 0.6;
        this.host.vfx?.dust.add(e.x + Math.sin(a) * d, y + 0.5 + Math.random() * 0.4, e.z + Math.cos(a) * d, Math.sin(a) * v, 0.3, Math.cos(a) * v, { color: i % 3 ? 0x8ac84a : 0xc8f08a, size: 0.7, sizeEnd: 1.8, life: 0.7, drag: 2.6, alpha: 0.55 });
      }
      if (this.bonePos(e.id, 'head', _v)) this.monster.call?.ring(_v.x, _v.y, _v.z, 1.1, MIST, 0.35);
      this.monster.onShake?.(0.06, 0.1);
      return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let laneOn = false;
    for (const m of g.monsters) {
      if (m.type !== 'reed_viper') continue;
      const S = this.st(m.id), rig = this.host.monsterRig?.(m.id);
      const hiding = !m.dead && (m.ambush || (m.state === 'windup' && m.windup?.name === 'ambush'));
      // the reeds rise as it sinks into its ambush, sink when it is over
      S.reeds = Math.max(0, Math.min(1, S.reeds + dt * (hiding ? 2.5 : -3)));
      S.flare = Math.max(0, S.flare - dt * 2.5);
      // half out of sight in the reeds (its own rig's materials: monster-views leaves them alone for a viper)
      if (rig) {
        const fade = 1 - 0.5 * S.reeds;
        if (fade < 0.999 || S.faded) { this.fade(rig.material, rig.hull, fade); if (rig.modelMaterial) this.fade(rig.modelMaterial, rig.modelHull, fade); S.faded = fade < 0.999; }
      }
      if (S.reeds > 0.01) this.drawAmbush(m, S);
      // the lure: its tail-tip leaf glints while it lies in wait
      if (m.ambush && m.ambush.trig < 0 && (S.lureT -= dt) <= 0) { S.lureT = 0.7; if (this.bonePos(m.id, 'seg8', _v)) this.monster.companion?.glint(_v.x, _v.y + 0.1, _v.z, 0.5, 0); }
      // noticed: the lane to its prey lit for the beat before it strikes
      if (m.ambush && m.ambush.trig >= 0 && !laneOn) {
        laneOn = true;
        const atk = m.def.attacks.ambush, k = Math.min(1, m.ambush.trig / atk.react), L = this.lane;
        L.position.set(m.x, this.gy(m.x, m.z) + 0.06, m.z); L.rotation.set(0, m.ambush.angle, 0); L.scale.set(atk.width, 1, (atk.radius + 0.6) * (0.3 + 0.7 * k));
        L.material.opacity = 0.35 + 0.4 * k; L.visible = true;
      }
      // the hiss building: green breath leaking from its jaws, puffs off its swelling body
      if (m.state === 'windup' && m.windup?.name === 'hiss' && (S.mistT -= dt) <= 0) {
        S.mistT = 0.06;
        if (this.bonePos(m.id, 'jaw', _v) && this.fx) this.fx.add(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, { color: 0xa8e04a, size: 0.2, sizeEnd: 0.5, life: 0.5, drag: 1.5, alpha: 0.7 });
        if (Math.random() < 0.15) this.monster.call?.ring(m.x, this.gy(m.x, m.z) + 0.3, m.z, 1.2, MIST, 0.3);
      }
    }
    if (!laneOn) this.lane.visible = false;
    // the mist hanging after a hiss: drifting off each cloud
    for (const a of g.areas) {
      if (a.kind !== 'hiss_mist' || a.t < a.delay || Math.random() > dt * 9) continue;
      const ang = Math.random() * 6.283, r = Math.random() * a.radius, x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
      this.host.vfx?.dust.add(x, this.gy(x, z) + 0.3 + Math.random() * 0.5, z, (Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3, { color: 0x9ad65a, size: 0.8, sizeEnd: 1.6, life: 1.1, drag: 1, alpha: 0.35 });
    }
    this.core.end(); this.glow.end();
  }

  // see-through, still writing depth (so its own outline, drawn behind it, never shows through it) and the outline
  // fading faster than the body
  fade(mat, hull, f) {
    const see = f < 0.999;
    if (mat.transparent !== see) { mat.transparent = see; mat.needsUpdate = true; if (hull) { hull.transparent = see; hull.needsUpdate = true; } }
    mat.depthWrite = true; mat.opacity = see ? f : 1;
    if (hull) { hull.depthWrite = !see; hull.opacity = see ? f ** 4 : 1; }
  }

  // its strike reach ringed with reed blades over a thin warning ring; reeds round its body
  drawAmbush(m, S) {
    const atk = m.def.attacks.ambush, R = atk.radius, q = S.reeds, y = this.gy(m.x, m.z) + 0.05, n = this.ring.length, flare = S.flare;
    for (let j = 0; j < n; j++) { const a = (j / (n - 1)) * Math.PI * 2; this.ring[j].set(m.x + Math.sin(a) * R, y, m.z + Math.cos(a) * R); }
    RW.v = (0.06 + 0.08 * flare) * q; this.glow.strip(this.ring, lineGlowW, (0.35 + 0.5 * flare) * q, WARN.glow); this.core.strip(this.ring, lineW, (0.7 + 0.3 * flare) * q, WARN.edge);
    for (let i = 0; i < BLADES + CAMO; i++) {
      const camo = i >= BLADES, a = camo ? (i - BLADES) * 2.4 + 0.3 : (i / BLADES) * Math.PI * 2 + (i % 2) * 0.05;
      const r = camo ? 0.5 + ((i * 7) % 5) * 0.12 : R + ((i % 3) - 1) * 0.12, x = m.x + Math.sin(a) * r, z = m.z + Math.cos(a) * r, gy = this.gy(x, z);
      const h = (camo ? 0.9 : 0.65 + ((i * 5) % 4) * 0.1) * q, sway = Math.sin(this.time * 2.2 + i * 1.7) * 0.12 + flare * 0.3 * Math.sin(a - (S.angle || 0));
      for (let j = 0; j < 4; j++) { const u = j / 3; this.blade[j].set(x + Math.sin(a) * sway * u * u, gy + h * u, z + Math.cos(a) * sway * u * u); }
      RW.v = 0.1 * q; this.glow.strip(this.blade, taperGlowW, 0.3 * q, REED.glow); this.core.strip(this.blade, taperW, 0.95 * q, REED.edge);
    }
  }
}
