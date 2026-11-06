// The masked wolf's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Circling lunge (core m.lap): while it laps the hero a faint ring of its path glows round them and dust trails it;
//   crouched to lunge, its lane lights from it to the hero, brightest as it locks; the bite is three fang marks of
//   mask-red light on what it catches.
// - Shadow pincer (core pincer lanes, projectiles shadow_wolf): through the howl, howl rings at its head and two lanes
//   crossing where the hero stood; the shadow wolves are see-through violet copies of the wolf (pooled rigs from the
//   View) running flat out, a mist off them.
// - Drag bite (core m.drag): a glint as the jaws clamp; furrows of dust where the hero's heels drag; a puff when they
//   tear free or are tossed loose.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const MASK = new THREE.Color('#e0304a'), MASK_RIM = new THREE.Color('#fff0f0'), SHADOW = 0x8a6aff, HOWL = new THREE.Color(0xd8c8ff);
const RUN = { moving: true, speed: 11, smoothSpeed: 11, speedFactor: 1, state: 'chase', windup: null, windupT: 0, windupTotal: 1, lookYaw: 0, turn: 0, vSide: 0, vFwd: 11, aggro: true, hurt: 0, actT: 0 };
const _v = new THREE.Vector3();

export class WolfFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.lanes = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(lane, mat(0xff7a3a, 0.3)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });
    const ring = new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2); ring.userData.shared = true;
    this.lapRing = new THREE.Mesh(ring, mat(0xffa07a, 0.35)); this.lapRing.visible = false; this.lapRing.renderOrder = 7; this.lapRing.frustumCulled = false; scene.add(this.lapRing);
    this.shadows = new Map(); // projectile id -> rig
    this.howlT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  lane(i, x, z, a, w, L, o) {
    const m = this.lanes[i];
    m.visible = true; m.position.set(x, this.gy(x, z) + 0.07, z); m.rotation.y = a; m.scale.set(w, 1, L); m.material.opacity = o;
  }
  /** A see-through tint on a rig (its body and outline), or solid again at 1. */
  ghost(rig, a) {
    for (const [mat, hull] of [[rig.material, rig.hull], [rig.modelMaterial, rig.modelHull]]) {
      if (!mat) continue;
      const see = a < 0.99;
      if (mat.transparent !== see) { mat.transparent = see; mat.depthWrite = !see; mat.needsUpdate = true; if (hull) { hull.transparent = see; hull.depthWrite = !see; hull.needsUpdate = true; } }
      mat.opacity = see ? a : 1; if (hull) hull.opacity = see ? a * a : 1;
    }
    rig.material?.userData?.flash?.value.set(a < 0.99 ? 0.25 : 0, 0, a < 0.99 ? 0.9 : 0);
  }

  /** The wolf's bites (core monsterSwing of circle_lunge or drag); true when drawn here. */
  swing(e) {
    if (e.type !== 'thornback_wolf' || (e.name !== 'circle_lunge' && e.name !== 'drag')) return false;
    if (e.at) {
      this.monster.companion?.axes();
      _v.set(e.at[0], this.gy(e.at[0], e.at[1]) + 0.75, e.at[1]);
      this.monster.companion?.rake(_v, Math.sin(e.angle) > 0 ? 1 : -1, 3, 0.5, 0.9, 0.22, MASK, MASK_RIM, 0);
      this.monster.companion?.glint(_v.x, _v.y, _v.z, 0.8, 0.03);
      this.monster.onShake?.(0.06, 0.08);
    }
    return true;
  }
  /** The wolf's own events; true when drawn here. */
  event(e) {
    if (e.type === 'lunge' || e.type === 'lapAim') return true;
    if (e.type === 'dragStart') { this.monster.companion?.glint(e.x, this.gy(e.x, e.z) + 0.8, e.z, 1, 0); return true; }
    if (e.type === 'dragFree' || e.type === 'dragEnd') {
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.3, y + 0.12, e.z + Math.cos(a) * 0.3, Math.sin(a) * 1.4, 0.5, Math.cos(a) * 1.4, 0.7, 0.45); }
      if (e.type === 'dragFree') this.monster.companion?.glint(e.x, y + 1, e.z, 1, 0);
      return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    let n = 0, ring = false;
    const p = g.player;
    for (const m of g.monsters) {
      if (m.dead || m.type !== 'thornback_wolf') continue;
      const L = m.lap;
      if (L) {
        const atk = m.def.attacks[L.name];
        if (L.phase === 'run') {
          // its path round the hero, and dust off its paws
          ring = true; this.lapRing.visible = true; this.lapRing.position.set(p.x, this.gy(p.x, p.z) + 0.06, p.z); this.lapRing.scale.set(L.R, 1, L.R);
          this.lapRing.material.opacity = 0.2 + 0.1 * Math.sin(this.time * 10);
          if (Math.random() < 0.8) this.monster.call?.dust(m.x - Math.sin(m.facing) * 0.5, this.gy(m.x, m.z) + 0.12, m.z - Math.cos(m.facing) * 0.5, 0, 0.4, 0, 0.6, 0.4);
        } else if (L.phase === 'aim' && n < this.lanes.length) {
          const k = Math.min(1, L.t / atk.aim);
          this.lane(n++, m.x, m.z, L.angle, atk.width, atk.dash + m.r + 0.8, k < 0.6 ? 0.15 + 0.2 * k : 0.45);
        } else if (L.phase === 'dash' && Math.random() < 0.9) {
          this.fx?.add(m.x, this.gy(m.x, m.z) + 0.7, m.z, -Math.sin(L.angle) * 3, 0, -Math.cos(L.angle) * 3, { color: 0xffe0e0, size: 0.1, sizeEnd: 0.02, life: 0.25, drag: 2 });
        }
      }
      // the drag: dust furrowing under the hero's heels
      if (m.drag && Math.random() < 0.9) { const u = m.drag.unit; this.monster.call?.dust(u.x, this.gy(u.x, u.z) + 0.1, u.z, (Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5, 0.6, 0.4); }
      // the pincer's lanes through the howl, and its howl rings
      if (m.state === 'windup' && m.windup?.name === 'pincer') {
        const atk = m.def.attacks.pincer, k = Math.min(1, m.stateT / m.windup.total);
        for (const [x, z, a] of m.windup.lanes) if (n < this.lanes.length) this.lane(n++, x, z, a, 1.2, atk.range, 0.12 + 0.28 * k);
        this.howlT -= dt;
        if (this.howlT <= 0) {
          this.howlT = 0.22;
          const r = this.host.monsterRig?.(m.id), h = r?.bones?.head;
          if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.call?.ring(_v.x, _v.y, _v.z, 0.8 + 0.8 * k, HOWL, 0.35); }
        }
      }
    }
    if (!ring) this.lapRing.visible = false;
    for (let i = n; i < this.lanes.length; i++) this.lanes[i].visible = false;
    // shadow wolves
    const seen = this.seen || (this.seen = new Set()); seen.clear();
    for (const pr of g.projectiles) {
      if (pr.kind !== 'shadow_wolf') continue;
      seen.add(pr.id);
      let rig = this.shadows.get(pr.id);
      if (!rig && this.host.takeRig) {
        rig = this.host.takeRig('thornback_wolf');
        this.host.scene.add(rig.root);
        this.shadows.set(pr.id, rig);
        this.monster.call?.dust(pr.x, this.gy(pr.x, pr.z) + 0.3, pr.z, 0, 0.8, 0, 1, 0.5);
      }
      if (!rig) continue;
      const fade = Math.min(1, pr.travelled / 1.5, (pr.range - pr.travelled) / 1.5);
      rig.root.position.set(pr.x, this.gy(pr.x, pr.z), pr.z);
      rig.root.rotation.y = Math.atan2(pr.vx, pr.vz);
      this.ghost(rig, 0.25 + 0.4 * Math.max(0, fade));
      rig.animate(rig, RUN, dt, this.time);
      if (Math.random() < 0.5) this.host.vfx?.dust.add(pr.x - pr.vx * 0.06, this.gy(pr.x, pr.z) + 0.3, pr.z - pr.vz * 0.06, -pr.vx * 0.08, 0.15, -pr.vz * 0.08, { color: SHADOW, size: 0.8, sizeEnd: 1.6, life: 0.5, drag: 2.5, alpha: 0.25 });
    }
    for (const [id, rig] of this.shadows) {
      if (seen.has(id)) continue;
      const q = rig.root.position;
      this.host.vfx?.dust.add(q.x, q.y + 0.4, q.z, 0, 0.3, 0, { color: SHADOW, size: 1.0, sizeEnd: 1.9, life: 0.6, drag: 2, alpha: 0.35 });
      this.ghost(rig, 1);
      this.host.releaseRig?.(rig);
      this.shadows.delete(id);
    }
  }
}
