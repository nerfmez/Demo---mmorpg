// The moss beetle's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Bombardier spray (core bombard pulses): each burst lights the lane it hits on the ground for a moment and blasts a
//   jet of hissing yellow-green acid and vapour out of its rear along it.
// - Moss ball (core projectile mossball): a mossy ball it pushes in front of its head through the wind-up, then rolling
//   along its lane, turning and growing, shedding moss; where it stops a green moss patch spreads (core area
//   moss_patch, its true size), tufts and leaves stirring on it.
// - Play dead (core feign, click): a puff as it flips on its back; the click is a snap of light and it springs; its
//   landing on the marked spot throws up earth and moss.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const ACID = 0xd8f04a, VAPOUR = 0xc8e08a, MOSS = [0x5d8a3a, 0x7fb14a, 0xa6c95a];
const _p = new THREE.Vector3();
let MOSS_TEX = null;
const mossTexture = () => {
  if (MOSS_TEX) return MOSS_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#5d8a3a'; g.fillRect(0, 0, 64, 64);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) { g.fillStyle = ['#7fb14a', '#a6c95a', '#4a7030'][i % 3]; g.beginPath(); g.arc(r() * 64, r() * 64, 2 + r() * 5, 0, Math.PI * 2); g.fill(); }
  MOSS_TEX = new THREE.CanvasTexture(c); MOSS_TEX.colorSpace = THREE.SRGBColorSpace; MOSS_TEX.userData.shared = true;
  return MOSS_TEX;
};

export class BeetleFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    this.lanes = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(lane, new THREE.MeshBasicMaterial({ color: ACID, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending })); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return { m, t: 9 }; });
    this.laneI = 0;
    const ball = new THREE.IcosahedronGeometry(1, 2); ball.userData.shared = true;
    const ballMat = new THREE.MeshBasicMaterial({ map: mossTexture(), toneMapped: false }); ballMat.userData.shared = true;
    this.balls = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(ball, ballMat); m.visible = false; m.renderOrder = 8; scene.add(m); return m; });
    this.ballSpin = new Map();
    const disc = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2); disc.userData.shared = true;
    const ring = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2); ring.userData.shared = true;
    this.patches = Array.from({ length: 3 }, () => ({ disc: (() => { const m = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: mossTexture(), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return m; })(), ring: (() => { const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xb8e070, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; })() }));
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  get dust() { return this.host.vfx?.dust; }

  /** A beetle's own events; true when drawn here. */
  event(e) {
    if (e.type === 'bombard') {
      const L = this.lanes[this.laneI++ % this.lanes.length], y = this.gy(e.x, e.z);
      L.t = 0; L.m.visible = true; L.m.position.set(e.x, y + 0.06, e.z); L.m.rotation.y = e.angle; L.m.scale.set(e.width, 1, e.length);
      // the jet: acid blobs blasted out of its rear along the lane, vapour boiling off them
      const fx = this.fx, dust = this.dust, s = Math.sin(e.angle), c = Math.cos(e.angle), x0 = e.x + s * 0.7, z0 = e.z + c * 0.7;
      if (fx) for (let i = 0; i < 22; i++) { const v = 7 + Math.random() * 5, j = (Math.random() - 0.5) * 1.2; fx.add(x0, y + 0.55, z0, s * v + c * j, 0.4 + Math.random() * 0.8, c * v - s * j, { color: i % 3 ? ACID : 0xffffc0, size: 0.16 + Math.random() * 0.1, sizeEnd: 0.06, life: 0.45, gravity: 3, drag: 2.5 }); }
      if (dust) for (let i = 0; i < 6; i++) { const u = (i + Math.random()) / 6 * e.length; dust.add(e.x + s * u, y + 0.4, e.z + c * u, 0, 0.5, 0, { color: VAPOUR, size: 0.6, sizeEnd: 1.3, life: 0.7, drag: 2, alpha: 0.45 }); }
      this.monster.companion?.glint(x0, y + 0.6, z0, 0.8, 0);
      this.monster.onShake?.(0.03, 0.05);
      return true;
    }
    if (e.type === 'feign') {
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.15, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.0, 0.6, Math.cos(a) * 1.0, 0.7, 0.45); }
      return true;
    }
    if (e.type === 'click') {
      // the click: a sharp snap of light at its hinge, and it springs
      const y = this.gy(e.x, e.z) + 0.6;
      this.monster.burstStar?.(e.x, y, e.z, 0.45, SNAP, 0xffffff, 0xd8f04a);
      this.monster.onShake?.(0.05, 0.06);
      return true;
    }
    return false;
  }
  /** It lands on its marked spot (core burst of attack click): earth and moss thrown up, a ring to the true edge. */
  burst(e) {
    const y = this.gy(e.x, e.z), fx = this.fx;
    if (fx) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 2.5; fx.add(e.x, y + 0.2, e.z, Math.sin(a) * v, 2 + Math.random() * 2, Math.cos(a) * v, { color: MOSS[i % 3], size: 0.13, sizeEnd: 0.05, life: 0.55, gravity: 11, drag: 0.6 }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.12, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.6, 0.4, Math.cos(a) * 1.6, 0.8, 0.5); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius || 1.2, RING, 0.35);
    this.monster.onShake?.(0.1, 0.1);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    for (const L of this.lanes) { if (L.t >= 0.3) { L.m.visible = false; continue; } L.t += dt; L.m.material.opacity = 0.55 * (1 - L.t / 0.3); }
    // moss balls: one pushed in front of a winding-up beetle's head, the rolling ones
    let n = 0;
    for (const m of g.monsters) {
      if (m.dead || m.type !== 'moss_beetle' || m.state !== 'windup' || m.windup?.name !== 'mossball' || n >= this.balls.length) continue;
      const atk = m.def.attacks.mossball, k = Math.min(1, m.stateT / m.windup.total), r = atk.radius * (0.4 + 0.6 * k), d = m.r + r;
      const x = m.x + Math.sin(m.facing) * d, z = m.z + Math.cos(m.facing) * d, b = this.balls[n++];
      b.visible = true; b.position.set(x, this.gy(x, z) + r, z); b.scale.setScalar(r); b.rotation.x += dt * 3;
    }
    const seen = this.seen || (this.seen = new Set()); seen.clear();
    for (const pr of g.projectiles) {
      if (pr.kind !== 'mossball' || n >= this.balls.length) continue;
      seen.add(pr.id);
      const b = this.balls[n++], spin = (this.ballSpin.get(pr.id) || 0) + (pr.speed * dt) / pr.radius;
      this.ballSpin.set(pr.id, spin);
      b.visible = true; b.position.set(pr.x, this.gy(pr.x, pr.z) + pr.radius, pr.z); b.scale.setScalar(pr.radius);
      b.rotation.set(spin, Math.atan2(pr.vx, pr.vz), 0, 'YXZ');
      if (Math.random() < 0.5) this.fx?.add(pr.x - pr.vx * 0.08, this.gy(pr.x, pr.z) + 0.15, pr.z - pr.vz * 0.08, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), { color: MOSS[(Math.random() * 3) | 0], size: 0.1, sizeEnd: 0.04, life: 0.5, gravity: 8, drag: 1 });
    }
    for (const id of this.ballSpin.keys()) if (!seen.has(id)) this.ballSpin.delete(id);
    for (let i = n; i < this.balls.length; i++) this.balls[i].visible = false;
    // moss patches
    let p = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'moss_patch' || p >= this.patches.length) continue;
      const q = this.patches[p++], y = this.gy(ar.x, ar.z), live = ar.t - ar.delay, spread = Math.min(1, live / 0.25), fade = Math.min(1, (ar.duration - live) / 0.6);
      for (const m of [q.disc, q.ring]) { m.visible = true; m.position.set(ar.x, y + 0.045, ar.z); m.scale.set(ar.radius * spread, 1, ar.radius * spread); }
      q.disc.material.opacity = 0.7 * fade; q.ring.material.opacity = 0.65 * fade;
      if (Math.random() < dt * 6) { const a = Math.random() * 6.283, rr = Math.random() * ar.radius; this.fx?.add(ar.x + Math.sin(a) * rr, y + 0.1, ar.z + Math.cos(a) * rr, 0, 0.6, 0, { color: MOSS[(Math.random() * 3) | 0], size: 0.1, sizeEnd: 0.03, life: 0.6, drag: 1 }); }
    }
    for (let i = p; i < this.patches.length; i++) this.patches[i].disc.visible = this.patches[i].ring.visible = false;
    void _p;
  }
}

const SNAP = { core: [1.0, 1.0, 0.92], glow: [0.85, 0.95, 0.3] };
const RING = new THREE.Color(0xb8e070);
