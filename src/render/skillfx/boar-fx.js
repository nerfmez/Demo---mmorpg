// The tusk boar's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Rampage: the first leg's lane is the View's lane warning; each next leg's lane is warned here while it skids,
//   swinging with its aim and brightening as it locks; galloping it throws clods and dust behind it; each skid ploughs
//   up a spray of earth and a dust cloud.
// - Stampede: three lanes warned on the ground through its squeal (where the piglets will run, the gaps between them
//   safe); squeal rings burst from its head; the piglets are small boars (pooled rigs of the boar from the View) running
//   flat out down their lanes in a cloud of dust, gone in a puff at the end.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const LANES = 3;
const PIGLET = 0.42;
const _p = new THREE.Vector3(); // a piglet's size against the boar
const SQUEAL = new THREE.Color(0xfff0d0), LAND = new THREE.Color(0xd8c0a0);
const RUN = { moving: true, speed: 7.5, smoothSpeed: 7.5, speedFactor: 1, state: 'chase', windup: null, windupT: 0, windupTotal: 1, lookYaw: 0, turn: 0, vSide: 0, vFwd: 7.5, aggro: true, hurt: 0, actT: 0 };

export class BoarFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
    this.lanes = Array.from({ length: LANES * 2 + 1 }, () => { const m = new THREE.Mesh(lane, mat()); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });
    this.piglets = new Map(); // projectile id -> rig
    this.squealT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  lane(i, x, z, a, w, L, o) {
    const m = this.lanes[i];
    m.visible = true; m.position.set(x, this.gy(x, z) + 0.07, z); m.rotation.y = a; m.scale.set(w, 1, L); m.material.opacity = o;
  }

  /** A boar's own events; true when drawn here. */
  event(e) {
    if (e.type === 'skid') {
      // it ploughs to a stop: earth sprayed ahead and to the sides, a dust cloud
      const y = this.gy(e.x, e.z), fx = this.fx;
      for (let i = 0; i < 7; i++) { const a = e.angle + (Math.random() - 0.5) * 2.2, v = 1.5 + Math.random() * 1.5; this.monster.call?.dust(e.x + Math.sin(e.angle) * 0.6, y + 0.15, e.z + Math.cos(e.angle) * 0.6, Math.sin(a) * v, 0.5, Math.cos(a) * v, 0.8, 0.55); }
      if (fx) for (let i = 0; i < 12; i++) { const a = e.angle + (Math.random() - 0.5) * 1.6, v = 2 + Math.random() * 2; fx.add(e.x + Math.sin(e.angle) * 0.7, y + 0.2, e.z + Math.cos(e.angle) * 0.7, Math.sin(a) * v, 2 + Math.random() * 2, Math.cos(a) * v, { color: i % 2 ? 0x8a6a48 : 0x6a5038, size: 0.12, sizeEnd: 0.06, life: 0.6, gravity: 12, drag: 0.5 }); }
      this.monster.onShake?.(0.05, 0.08);
      return true;
    }
    if (e.type === 'rampageLeg') return true;
    if (e.type === 'toss') {
      // the scoop: earth and a crescent of dust thrown up where the tusks went under, a glint on the one flung
      const y = this.gy(e.x, e.z), fx = this.fx;
      if (fx) for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, v = 1 + Math.random() * 2; fx.add(e.x, y + 0.2, e.z, Math.sin(a) * v, 3 + Math.random() * 2, Math.cos(a) * v, { color: i % 2 ? 0x8a6a48 : 0x6a5038, size: 0.12, sizeEnd: 0.06, life: 0.6, gravity: 12, drag: 0.5 }); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.15, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.2, 0.8, Math.cos(a) * 1.2, 0.8, 0.5); }
      this.monster.companion?.glint(e.x, y + 1.2, e.z, 1.1, 0);
      this.monster.onShake?.(0.1, 0.1);
      return true;
    }
    if (e.type === 'tossLand') {
      // the landing: a thump of dust round where it came down
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.3, y + 0.12, e.z + Math.cos(a) * 0.3, Math.sin(a) * 1.8, 0.4, Math.cos(a) * 1.8, 0.8, 0.5); }
      this.monster.call?.ring(e.x, y + 0.06, e.z, 1.2, LAND, 0.35);
      this.monster.onShake?.(0.12, 0.1);
      return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    let n = 0;
    for (const m of g.monsters) {
      if (m.dead || m.type !== 'tusk_boar') continue;
      // the next leg's lane while it skids
      if (m.rampage?.phase === 'skid' && n < this.lanes.length) {
        const atk = m.def.attacks.rampage, k = Math.min(1, m.rampage.t / atk.skid);
        this.lane(n++, m.x, m.z, m.rampage.angle, atk.width, atk.speed * atk.run + m.r, k < 0.6 ? 0.15 + 0.15 * k : 0.4);
        if (Math.random() < 0.6) this.monster.call?.dust(m.x, this.gy(m.x, m.z) + 0.12, m.z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.7, 0.45);
      }
      // dust and clods off its hooves in the gallop
      if (m.rampage?.phase === 'run') {
        const y = this.gy(m.x, m.z), bx = -Math.sin(m.facing), bz = -Math.cos(m.facing);
        if (Math.random() < 0.8) this.monster.call?.dust(m.x + bx * 0.6, y + 0.15, m.z + bz * 0.6, bx * 1.2, 0.5, bz * 1.2, 0.8, 0.5);
        if (Math.random() < 0.5) this.fx?.add(m.x + bx * 0.5, y + 0.15, m.z + bz * 0.5, bx * 2 + (Math.random() - 0.5), 2 + Math.random(), bz * 2 + (Math.random() - 0.5), { color: 0x7a5a3c, size: 0.1, sizeEnd: 0.05, life: 0.5, gravity: 12, drag: 0.5 });
      }
      // the stampede's lanes through its squeal, and its squeal rings
      if (m.state === 'windup' && m.windup?.name === 'stampede') {
        const atk = m.def.attacks.stampede, k = Math.min(1, m.stateT / m.windup.total), a = m.windup.angle, px = Math.cos(a), pz = -Math.sin(a);
        const order = [-1, 1, 0, -2, 2];
        for (let i = 0; i < atk.count && n < this.lanes.length; i++) {
          const off = order[i % order.length] * atk.spacing;
          this.lane(n++, m.x + px * off, m.z + pz * off, a, 1.2, atk.range, 0.12 + 0.25 * k);
        }
        this.squealT -= dt;
        if (k > 0.35 && this.squealT <= 0) {
          this.squealT = 0.18;
          const r = this.host.monsterRig?.(m.id), h = r?.bones?.head;
          if (h) { h.updateWorldMatrix(true, false); _p.setFromMatrixPosition(h.matrixWorld); this.monster.call?.ring(_p.x, _p.y, _p.z, 0.9 + 0.6 * k, SQUEAL, 0.3); }
        }
      }
    }
    // what is left of each running piglet's lane, ahead of it
    for (const pr of g.projectiles) {
      if (pr.kind !== 'piglet' || n >= this.lanes.length) continue;
      const left = pr.range - pr.travelled;
      if (left > 0.3) this.lane(n++, pr.x, pr.z, Math.atan2(pr.vx, pr.vz), 1.2, left, 0.2);
    }
    for (let i = n; i < this.lanes.length; i++) this.lanes[i].visible = false;
    // piglets: a small boar rig on each piglet shot
    const seen = this.seen || (this.seen = new Set());
    seen.clear();
    for (const pr of g.projectiles) {
      if (pr.kind !== 'piglet') continue;
      seen.add(pr.id);
      let rig = this.piglets.get(pr.id);
      if (!rig && this.host.takeRig) {
        rig = this.host.takeRig('tusk_boar');
        rig.pigletScale = (rig.root.scale.x || 1) * PIGLET;
        this.host.scene.add(rig.root);
        this.piglets.set(pr.id, rig);
        this.monster.call?.dust(pr.x, this.gy(pr.x, pr.z) + 0.15, pr.z, 0, 0.6, 0, 0.8, 0.4);
      }
      if (!rig) continue;
      const y = this.gy(pr.x, pr.z);
      rig.root.position.set(pr.x, y, pr.z);
      rig.root.rotation.y = Math.atan2(pr.vx, pr.vz);
      rig.root.scale.setScalar(rig.pigletScale);
      rig.animate(rig, RUN, dt, this.time);
      if (Math.random() < 0.6) this.monster.call?.dust(pr.x - pr.vx * 0.06, y + 0.1, pr.z - pr.vz * 0.06, -pr.vx * 0.1, 0.4, -pr.vz * 0.1, 0.5, 0.4);
    }
    for (const [id, rig] of this.piglets) {
      if (seen.has(id)) continue;
      // gone at the end of its run: a puff of dust where it was
      const p = rig.root.position;
      this.monster.call?.dust(p.x, p.y + 0.2, p.z, 0, 0.6, 0, 0.9, 0.5);
      rig.root.scale.setScalar(rig.pigletScale / PIGLET);
      this.host.releaseRig?.(rig);
      this.piglets.delete(id);
    }
  }
}
