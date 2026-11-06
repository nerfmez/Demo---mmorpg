// The salt slime's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Engulf: seawater bubbles up round it as it flattens; on landing a splash; while it holds its prey a ring of
//   churning water turns on the ground round them and bubbles rise inside the body; it spits them out in a gush; a
//   miss splats it in a flat splash.
// - Brine pool (core area kind brine): a glob of brine arcs to the spot, splashes into a puddle the size of the true
//   radius, and salt crystals grow in from its edge toward the middle as it sets (the warning); as it sets they flash
//   white, salt bursts up, and a crust of crystals is left that crumbles away; whoever was caught has salt round their
//   feet.
// - Split (core split): a blob of the slime pinches off and lands beside it with a splash.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { lightSprite, glowTexture, bubbleTexture } from './light-kit.js';

const PUDDLES = 3, CRYSTALS = 20, CRUSTS = 4;
const SEA = 0x56c6d8, FOAM = 0xeafcff, SALT = 0xf2fbff;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class SlimeFx {
  constructor(scene, host, monster) {
    this.host = host; this.monster = monster; this.time = 0;
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); disc.userData.shared = true;
    const ring = new THREE.RingGeometry(0.94, 1, 56).rotateX(-Math.PI / 2); ring.userData.shared = true;
    const churn = new THREE.RingGeometry(0.7, 1, 40, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2); churn.userData.shared = true;
    const mat = (c, o, add = false) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = (g, m, order) => { const x = new THREE.Mesh(g, m); x.visible = false; x.renderOrder = order; x.frustumCulled = false; scene.add(x); return x; };
    // puddles: brine, a lighter wet middle, the edge, and the crystals growing in
    const crystal = new THREE.OctahedronGeometry(1, 0); crystal.userData.shared = true;
    const cmat = new THREE.MeshBasicMaterial({ color: SALT, toneMapped: false }); cmat.userData.shared = true;
    this.crystals = new THREE.InstancedMesh(crystal, cmat, (PUDDLES + CRUSTS) * CRYSTALS);
    this.crystals.count = 0; this.crystals.frustumCulled = false; this.crystals.renderOrder = 8; scene.add(this.crystals);
    this.puddles = Array.from({ length: PUDDLES }, () => ({
      id: -1, pool: mesh(disc, mat(0x2c8fae, 0.5), 6), wet: mesh(disc, mat(SEA, 0.35, true), 7), edge: mesh(ring, mat(SALT, 0.85), 7),
      glob: (() => { const s = lightSprite(scene, glowTexture('cold'), true, 10); s.material.color.setHex(0x6fd8f0); return s; })(),
      fx: 0, fy: 0, fz: 0, landed: false, seed: Math.random() * 100,
    }));
    // crusts left after a puddle sets: crystals that crumble away
    this.crusts = Array.from({ length: CRUSTS }, () => ({ t: 9, x: 0, z: 0, r: 1, seed: 0, caught: null }));
    this.crustI = 0;
    // the hold: churning water round the prey, bubbles inside
    this.churns = Array.from({ length: 2 }, () => mesh(churn, mat(0x9fe8ff, 0.7, true), 8));
    this.glow = lightSprite(scene, glowTexture('cold'), true, 9); this.glow.material.color.setHex(0x8fe0ff); this.glow.visible = false;
    // a bud flying off
    this.blobs = Array.from({ length: 2 }, () => { const s = lightSprite(scene, bubbleTexture(), true, 10); s.material.color.setHex(0x9fe0e8); return { s, t: 9, fx: 0, fz: 0, tx: 0, tz: 0 }; });
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** A salt slime's own events; true when drawn here. */
  event(e, g) {
    if (e.type === 'engulf') { this.splash(e.x, e.z, 1.0); this.monster.onShake?.(0.06, 0.08); return true; }
    if (e.type === 'spitOut') {
      // a gush of water out of it toward where the prey went
      const fx = this.fx, y = this.gy(e.x, e.z) + 0.6, dx = e.tx - e.x, dz = e.tz - e.z, L = Math.hypot(dx, dz) || 1;
      if (fx) for (let i = 0; i < 18; i++) { const sp = 3 + Math.random() * 3, j = (Math.random() - 0.5) * 0.8; fx.add(e.x, y, e.z, (dx / L) * sp + j, 1.5 + Math.random() * 1.5, (dz / L) * sp - j, { color: i % 3 ? SEA : FOAM, size: 0.14, sizeEnd: 0.05, life: 0.45, gravity: 9, drag: 1 }); }
      this.monster.waterCrown(e.tx, e.tz);
      return true;
    }
    if (e.type === 'split') {
      const r = this.host.monsterRig?.(e.id); if (r) r.splitT = 0.6;
      const b = this.blobs.find((q) => q.t >= 0.3) || this.blobs[0];
      Object.assign(b, { t: 0, fx: e.x, fz: e.z, tx: e.tx, tz: e.tz, landed: false });
      return true;
    }
    return false;
  }
  /** A miss: it splats flat in a splash. */
  splat(e) { this.splash(e.x, e.z, 1.3); }
  /** A brine puddle sets (core burst of kind brine): the crystals flash, salt bursts up, a crust is left. */
  burst(e, g) {
    const fx = this.fx, y = this.gy(e.x, e.z);
    if (fx) for (let i = 0; i < 22; i++) { const a = Math.random() * 6.283, d = Math.random() * e.radius; fx.add(e.x + Math.sin(a) * d, y + 0.1, e.z + Math.cos(a) * d, Math.sin(a) * 0.8, 2 + Math.random() * 2, Math.cos(a) * 0.8, { color: i % 3 ? SALT : 0xbfeaff, size: 0.12, sizeEnd: 0.03, life: 0.5, gravity: 8, drag: 1 }); }
    const p = g.player, caught = !p.dead && Math.hypot(p.x - e.x, p.z - e.z) <= e.radius + (p.r || 0.4) ? [p.x, p.z] : null;
    const c = this.crusts[this.crustI++ % CRUSTS];
    Object.assign(c, { t: 0, x: e.x, z: e.z, r: e.radius, seed: Math.random() * 100, caught });
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius * 1.15, new THREE.Color(0xdff6ff), 0.35);
    if (caught) this.monster.companion?.glint(caught[0], y + 0.4, caught[1], 0.9, 0);
    this.monster.onShake?.(caught ? 0.07 : 0.03, 0.08);
    return true;
  }
  splash(x, z, size) {
    const fx = this.fx, y = this.gy(x, z) + 0.2;
    if (fx) for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283, sp = (1.5 + Math.random()) * size; fx.add(x + Math.sin(a) * 0.4 * size, y, z + Math.cos(a) * 0.4 * size, Math.sin(a) * sp, 1.2 + Math.random() * 1.2, Math.cos(a) * sp, { color: i % 3 ? SEA : FOAM, size: 0.13 * size, sizeEnd: 0.04, life: 0.45, gravity: 9, drag: 1 }); }
    this.monster.call?.ring(x, y - 0.12, z, 1.1 * size, new THREE.Color(0x8fdcff), 0.35);
  }

  update(dt, g) {
    this.time += dt;
    let ci = 0;
    const put = (x, y, z, s, sy, rotY, tilt) => {
      _e.set(tilt, rotY, tilt * 0.5); _q.setFromEuler(_e); _s.set(s, s * sy, s); _p.set(x, y, z);
      this.crystals.setMatrixAt(ci++, _m.compose(_p, _q, _s));
    };
    // puddles
    let n = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'brine' || n >= PUDDLES) continue;
      const q = this.puddles[n++], gy = this.gy(ar.x, ar.z);
      if (q.id !== ar.id) {
        q.id = ar.id; q.landed = false; q.seed = Math.random() * 100;
        const src = g.monsterById?.(ar.sourceId);
        q.fx = src ? src.x : ar.x; q.fz = src ? src.z : ar.z; q.fy = src ? this.gy(src.x, src.z) + 0.8 : gy + 1;
      }
      const flight = ar.flight || 0.5, set = ar.delay - flight;
      if (ar.t < flight) {
        // the glob in the air
        const k = ar.t / flight;
        q.glob.visible = true;
        q.glob.position.set(q.fx + (ar.x - q.fx) * k, q.fy + (gy + 0.3 - q.fy) * k + Math.sin(k * Math.PI) * 1.6, q.fz + (ar.z - q.fz) * k);
        q.glob.scale.setScalar(0.9); q.glob.material.opacity = 1;
        q.pool.visible = q.wet.visible = q.edge.visible = false;
        if (Math.random() < 0.5) this.fx?.add(q.glob.position.x, q.glob.position.y, q.glob.position.z, 0, -0.5, 0, { color: SEA, size: 0.1, sizeEnd: 0.03, life: 0.3, drag: 1 });
        continue;
      }
      q.glob.visible = false;
      if (!q.landed) { q.landed = true; this.splash(ar.x, ar.z, 0.9); }
      // the puddle spreads out to its true radius, then the salt grows in from the edge as it sets
      const live = ar.t - flight, spread = Math.min(1, live / 0.2), k = Math.min(1, live / set), R = ar.radius;
      for (const m of [q.pool, q.wet, q.edge]) { m.visible = true; m.position.set(ar.x, gy + 0.04, ar.z); }
      q.pool.scale.set(R * spread, 1, R * spread); q.pool.material.opacity = 0.5;
      const open = R * (1 - 0.85 * k);
      q.wet.scale.set(open * spread, 1, open * spread); q.wet.position.y = gy + 0.05; q.wet.material.opacity = 0.25 + 0.15 * Math.sin(this.time * 6 + q.seed);
      q.edge.scale.set(R * spread, 1, R * spread); q.edge.position.y = gy + 0.06; q.edge.material.opacity = 0.6 + 0.3 * k;
      // crystals: placed round the edge first, more and further in as it sets, each growing up out of the brine
      for (let i = 0; i < CRYSTALS; i++) {
        const u = (i * 0.618 + q.seed) % 1, ring = Math.floor(i / 7), at = ring / 3 + (i % 7) / 21; // when along the set it appears
        const grow = Math.max(0, Math.min(1, (k - at) / 0.25));
        if (grow <= 0) continue;
        const a = u * Math.PI * 2 + ring * 0.7, d = R * (0.92 - ring * 0.28 - (i % 2) * 0.06);
        put(ar.x + Math.sin(a) * d, gy + 0.05, ar.z + Math.cos(a) * d, 0.09 + 0.05 * (i % 3) * 0.5, 2.2 * grow, a, 0.35 * Math.sin(i * 1.7));
      }
      if (Math.random() < dt * 8) { const a = Math.random() * 6.283, d = Math.random() * open; this.fx?.add(ar.x + Math.sin(a) * d, gy + 0.08, ar.z + Math.cos(a) * d, 0, 0.5, 0, { color: FOAM, size: 0.09, sizeEnd: 0.02, life: 0.4, drag: 1 }); }
    }
    for (let i = n; i < PUDDLES; i++) { const q = this.puddles[i]; q.pool.visible = q.wet.visible = q.edge.visible = q.glob.visible = false; q.id = -1; }
    // crusts: the set salt, crystals standing over the puddle and round a caught hero's feet, crumbling away
    for (const c of this.crusts) {
      if (c.t >= 1.6) continue;
      c.t += dt;
      const gy = this.gy(c.x, c.z), fade = c.t < 1.1 ? 1 : 1 - (c.t - 1.1) / 0.5, s = Math.max(0, fade);
      for (let i = 0; i < CRYSTALS - (c.caught ? 6 : 0); i++) {
        const u = (i * 0.618 + c.seed) % 1, a = u * Math.PI * 2, d = c.r * (0.2 + 0.75 * ((i * 0.37 + c.seed) % 1));
        put(c.x + Math.sin(a) * d, gy + 0.05 - (1 - s) * 0.1, c.z + Math.cos(a) * d, 0.11 * (0.7 + 0.3 * (i % 3)), 2 * s, a, 0.4 * Math.sin(i * 2.3));
      }
      if (c.caught) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; put(c.caught[0] + Math.sin(a) * 0.32, gy + 0.05, c.caught[1] + Math.cos(a) * 0.32, 0.14, 2.6 * s, a, 0.5 * Math.cos(a)); }
    }
    this.crystals.count = ci;
    this.crystals.instanceMatrix.needsUpdate = true;
    // the hold
    let h = 0;
    for (const m of g.monsters) {
      if (m.dead || !m.hold || h >= this.churns.length) continue;
      const ch = this.churns[h++], gy = this.gy(m.x, m.z), R = m.r * 1.9;
      ch.visible = true; ch.position.set(m.x, gy + 0.06, m.z); ch.scale.set(R, 1, R); ch.rotation.y = this.time * 5;
      ch.material.opacity = 0.45 + 0.2 * Math.sin(this.time * 9);
      if (h === 1) { this.glow.visible = true; this.glow.position.set(m.x, gy + 0.7, m.z); this.glow.scale.setScalar(2.2 + 0.2 * Math.sin(this.time * 7)); this.glow.material.opacity = 0.35; }
      if (Math.random() < dt * 14) { const a = Math.random() * 6.283, d = Math.random() * m.r * 0.9; this.monster.bubbles?.add(m.x + Math.sin(a) * d, gy + 0.2, m.z + Math.cos(a) * d, 0, 0.8 + Math.random() * 0.6, 0, 0.08 + Math.random() * 0.1, 0.6); }
    }
    for (let i = h; i < this.churns.length; i++) this.churns[i].visible = false;
    if (!h) this.glow.visible = false;
    // a bud flying off
    for (const b of this.blobs) {
      if (b.t >= 0.3) { b.s.visible = false; continue; }
      b.t += dt;
      const k = Math.min(1, b.t / 0.25), gy = this.gy(b.tx, b.tz);
      b.s.visible = k < 1; b.s.position.set(b.fx + (b.tx - b.fx) * k, gy + 0.5 + Math.sin(k * Math.PI) * 1.2, b.fz + (b.tz - b.fz) * k); b.s.scale.setScalar(0.7); b.s.material.opacity = 0.9;
      if (k >= 1 && !b.landed) { b.landed = true; this.splash(b.tx, b.tz, 0.8); }
    }
  }
}
