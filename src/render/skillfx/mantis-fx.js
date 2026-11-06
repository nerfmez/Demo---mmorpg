// The thicket mantis's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A mantis hunts by
// sitting still, swaying to judge the gap, then shooting out its spined forelegs; threatened, it rears up and fans its
// wings to flash eyespots and hiss (a startle display); and it can fly a short way.
// - Peer strike (core peer_strike): the lane is the View's warning; the strike is two streaks of light shot down it to
//   where the forelegs reach, spine marks on what they catch (core mantisStrike).
// - Startle (core startle): its hind wings (all mantises carry them, folded) fan out behind it with two great
//   eyespots, hiss rings roll off it, the eyes flash at the freeze (core startle).
// - Wing leap (core pounce with past, area mantis_land): wings out in flight, leaves shed; it lands behind its prey
//   with an X of two scythe slashes across the true circle.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HISS = new THREE.Color(0xf0ffd0), LAND = new THREE.Color(0xd8f0a0), SCY = { core: [1, 1, 0.9], glow: [0.75, 0.95, 0.4] };
const LEAF = [0x7fb14a, 0x5d8a3a, 0xa6c95a, 0x8a6a48];
const _v = new THREE.Vector3();

function paint(g, inner, outer, r) {
  g.deleteAttribute('uv');
  const a = new THREE.Color(inner), b = new THREE.Color(outer), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const d = Math.min(1, Math.hypot(p.getX(i), p.getY(i)) / r); c.copy(a).lerp(b, d); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// one hind wing, fanned in its own XY plane from its root (side +1 the mantis's left): a wide sector shading from a
// warm yellow root to leaf green, with a great eyespot (dark ring, gold, a black pupil and a highlight)
const WINGS = {};
function wingGeometry(side) {
  if (WINGS[side]) return WINGS[side];
  const R = 0.95, from = side > 0 ? 0.17 : Math.PI / 2 - 0.17, len = Math.PI / 2;
  const parts = [paint(new THREE.CircleGeometry(R, 18, from, len).toNonIndexed(), 0xf4d86a, 0x6f9a3c, R)];
  const a = from + len / 2 + side * 0.05, ex = Math.cos(a) * 0.58, ey = Math.sin(a) * 0.58;
  for (const [r, col, z] of [[0.2, 0x2a2418, 0.004], [0.15, 0xf2c23a, 0.008], [0.08, 0x1a1410, 0.012], [0.025, 0xffffff, 0.016]]) {
    parts.push(paint(new THREE.CircleGeometry(r, 16).translate(ex, ey + (r === 0.025 ? 0.03 : 0), z).toNonIndexed(), col, col, 1));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.userData.shared = true;
  WINGS[side] = g;
  return g;
}

export class MantisFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    // the strike's two streaks: thin strips of light along the lane, flashing out and fading
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xfaffd8, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); strip.userData.shared = true;
    this.streaks = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(strip, mat()); m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); return { m, t: 9 }; });
    this.streakI = 0;
    // the landing X: two slash strips crossing on the ground
    const slash = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); slash.userData.shared = true;
    this.slashes = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(slash, new THREE.MeshBasicMaterial({ color: 0xf4ffc8, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); return { m, t: 9 }; });
    this.hissT = new Map();
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** Its hind wings (once per rig, on its body bone, the rig's toon material; pooled rigs keep them). */
  dress(rig) {
    if (rig.mantisWings || !rig.bones?.body || !rig.material) return;
    const rest = rig.bones.body.userData.rest.pos, wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.05 - rest.x, 0.82 - rest.y, -0.1 - rest.z); // at the thorax's root, rig rest space
      const m = new THREE.Mesh(wingGeometry(side), rig.material);
      pivot.add(m);
      if (rig.hull) pivot.add(new THREE.Mesh(wingGeometry(side), rig.hull));
      pivot.visible = false;
      rig.bones.body.add(pivot);
      wings.push({ pivot, side });
    }
    rig.mantisWings = wings;
  }

  /** The mantis's events; true when drawn here. */
  event(e, g) {
    if (e.type === 'mantisStrike') {
      // two streaks shot down the lane to where the forelegs reach
      const s = Math.sin(e.angle), c = Math.cos(e.angle), y = this.gy(e.x, e.z);
      for (const off of [0.14, -0.14]) {
        const S = this.streaks[this.streakI++ % this.streaks.length];
        S.t = 0; S.m.visible = true; S.m.position.set(e.x + c * off + s * 0.3, y + 1.0, e.z - s * off + c * 0.3); S.m.rotation.set(0, e.angle, 0); S.m.scale.set(0.07, 1, Math.max(0.5, e.reach));
      }
      if (e.hit) {
        const px = e.x + s * (e.reach + 0.2), pz = e.z + c * (e.reach + 0.2), py = this.gy(px, pz) + 0.9;
        this.monster.companion?.axes();
        _v.set(px, py, pz);
        this.monster.companion?.rake(_v, 1, 4, 0.42, 0.7, 0.13, new THREE.Color('#9fd84a'), new THREE.Color('#fbffe8'), 0.02);
        this.monster.companion?.glint(px, py, pz, 0.9, 0.02);
        this.monster.onShake?.(0.07, 0.08);
      }
      return true;
    }
    if (e.type === 'startle') {
      // the freeze: its eyespots flash, a burst of hiss
      const m = g?.monsterById?.(e.id), r = m && this.host.monsterRig?.(m.id);
      if (r?.mantisWings) for (const W of r.mantisWings) { W.pivot.children[0].getWorldPosition(_v); this.monster.companion?.glint(_v.x, _v.y + 0.6, _v.z, 1.0, 0); }
      for (let i = 0; i < 3; i++) this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 1.4, e.z, 1.2 + i * 0.8, HISS, 0.3 + i * 0.08);
      this.monster.onShake?.(0.06, 0.08);
      return true;
    }
    if (e.type === 'wingLand') return true;
    return false;
  }

  /** It lands behind its prey (core burst of area mantis_land): an X of two slashes across the true circle. */
  burst(e) {
    if (e.kind !== 'mantis_land') return false;
    const y = this.gy(e.x, e.z);
    this.slashes.forEach((S, i) => { S.t = 0; S.m.visible = true; S.m.position.set(e.x, y + 0.08, e.z); S.m.rotation.set(0, (i ? 1 : -1) * 0.75 + (e.angle || 0), 0); S.m.scale.set(0.16, 1, e.radius * 2); });
    const fx = this.fx;
    if (fx) for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 2; fx.add(e.x, y + 0.3, e.z, Math.sin(a) * v, 1.5 + Math.random() * 2, Math.cos(a) * v, { color: LEAF[i % 4], size: 0.12, sizeEnd: 0.05, life: 0.6, gravity: 9, drag: 1 }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.12, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.6, 0.4, Math.cos(a) * 1.6, 0.8, 0.45); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius, LAND, 0.35);
    this.monster.onShake?.(0.1, 0.1);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    for (const m of g.monsters) {
      if (m.type !== 'thicket_mantis' || m.dead) continue;
      const r = this.host.monsterRig?.(m.id);
      if (!r) continue;
      this.dress(r);
      // the wings: hidden folded, fanned up and out behind it (tilted back, so they read from the high camera)
      const k = r.wingSpread || 0, buzz = m.state === 'windup' && m.windup?.name === 'wing_leap' ? Math.sin(this.time * 60) * 0.12 : 0;
      for (const W of r.mantisWings || []) {
        W.pivot.visible = k > 0.03;
        if (!W.pivot.visible) continue;
        W.pivot.scale.setScalar(0.25 + 0.75 * k);
        W.pivot.rotation.set(-0.15 - 0.85 * k, W.side * (0.25 - 0.25 * k), W.side * (buzz - 0.3 * (1 - k)));
      }
      // hissing through the display
      if (m.state === 'windup' && m.windup?.name === 'startle') {
        const t = (this.hissT.get(m.id) || 0) - dt;
        this.hissT.set(m.id, t <= 0 ? 0.25 : t);
        if (t <= 0) this.monster.call?.ring(m.x, this.gy(m.x, m.z) + 1.5, m.z, 0.8 + Math.min(1, m.stateT / m.windup.total), HISS, 0.3);
      }
      // leaves shed in flight
      if (m.charge?.dive && Math.random() < 0.6) this.fx?.add(m.x, this.gy(m.x, m.z) + 1.2, m.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), { color: LEAF[(Math.random() * 4) | 0], size: 0.1, sizeEnd: 0.04, life: 0.6, gravity: 3, drag: 1 });
    }
    for (const S of this.streaks) { if (S.t >= 0.28) { S.m.visible = false; continue; } S.t += dt; S.m.material.opacity = 0.95 * (1 - S.t / 0.28); }
    for (const S of this.slashes) { if (S.t >= 0.4) { S.m.visible = false; continue; } S.t += dt; S.m.material.opacity = 0.9 * (1 - S.t / 0.4); }
  }
}
