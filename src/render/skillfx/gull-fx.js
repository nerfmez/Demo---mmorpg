// The shore gull's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Snatch: its swoop's curve is warned on the ground as a band the width of its reach, strengthening through the
//   wind-up; in the swoop, streaks of air and a feather or two trail it; what it clips throws
//   up coins (or feathers, with an empty purse), and a gold coin shines in its beak while it carries loot.
// - Shell drop: the clam rides up in its feet; it falls onto the marked spot (the View's red warning disc) the last
//   moments before it lands and shatters there in shell chips and sand; the cracked halves lie open while the gull
//   eats, and its feast is marked by bobbing sparkles over it (it is open to blows).
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { lightSprite, glowTexture } from './light-kit.js';

const N = 24, FALL = 0.55;
const PECK = { core: [1.0, 0.98, 0.9], glow: [1.0, 0.75, 0.35] }; // a peck's burst star (display colours)
const SHELL = 0xf4e6dc, CHIP = [0xfff4ec, 0xf0d8c8, 0xd8c0b0];
const _v = new THREE.Vector3();

export class GullFx {
  constructor(scene, host, monster) {
    this.host = host; this.monster = monster; this.time = 0;
    // the swoop's warning band: a strip along the curve, a dim whole and a bright part filling along it
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.band = new THREE.Mesh(geo, mat(0xff7a3a, 0.22));
    this.band.visible = false; this.band.frustumCulled = false; this.band.renderOrder = 7; scene.add(this.band);
    this.bandFor = -1;
    // coins in beaks
    this.coins = Array.from({ length: 3 }, () => { const s = lightSprite(scene, glowTexture('fire'), true, 11); s.material.color.setHex(0xffd24a); return s; });
    // clams: carried, falling, then lying cracked open
    const half = new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.45, 1); half.userData.shared = true;
    const shellMat = new THREE.MeshBasicMaterial({ color: SHELL, side: THREE.DoubleSide, toneMapped: false }); shellMat.userData.shared = true;
    this.clams = Array.from({ length: 2 }, () => {
      const a = new THREE.Mesh(half, shellMat), b = new THREE.Mesh(half, shellMat);
      b.rotation.x = Math.PI;
      const g = new THREE.Group(); g.add(a, b); g.visible = false; g.renderOrder = 9; scene.add(g);
      return { g, a, b, id: -1, src: -1, cracked: 0, x: 0, z: 0 };
    });
    this.feasts = Array.from({ length: 2 }, () => ({ s: (() => { const s = lightSprite(scene, glowTexture('fire'), true, 11); s.material.color.setHex(0xfff0a0); return s; })(), id: -1 }));
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** A gull's own events; true when drawn here. */
  event(e) {
    if (e.type === 'snatch') {
      // coins thrown up from the purse (or feathers off an empty one) where it clipped, and a glint
      const fx = this.fx, y = this.gy(e.x, e.z) + 0.9;
      if (fx) for (let i = 0; i < (e.gold ? 12 : 8); i++) { const a = Math.random() * 6.283, sp = 1 + Math.random() * 1.5; fx.add(e.x, y, e.z, Math.sin(a) * sp, 2.5 + Math.random() * 1.5, Math.cos(a) * sp, e.gold ? { color: i % 2 ? 0xffd24a : 0xfff2b0, size: 0.13, sizeEnd: 0.08, life: 0.6, gravity: 9, drag: 0.5 } : { color: 0xf4f2ea, size: 0.16, sizeEnd: 0.1, life: 0.8, gravity: 1.5, drag: 2 }); }
      this.monster.companion?.glint(e.x, y, e.z, e.gold ? 1.1 : 0.7, 0);
      this.monster.onShake?.(0.04, 0.06);
      return true;
    }
    if (e.type === 'perch' || e.type === 'hopOff' || e.type === 'shaken') {
      // feathers fly as it lands on a head, hops off, or is shaken off (a big puff, and it reels)
      const fx = this.fx, n = e.type === 'shaken' ? 14 : 7, y = this.gy(e.x, e.z) + (e.type === 'perch' ? 1.9 : 0.8);
      if (fx) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 1 + Math.random() * 1.5; fx.add(e.x, y, e.z, Math.sin(a) * sp, 0.8 + Math.random(), Math.cos(a) * sp, { color: i % 3 ? 0xf4f2ea : 0x9aa8b0, size: 0.16, sizeEnd: 0.1, life: 0.9, gravity: 1.2, drag: 2 }); }
      if (e.type === 'shaken') { this.monster.companion?.glint(e.x, y + 0.4, e.z, 1, 0); this.monster.onShake?.(0.05, 0.08); }
      return true;
    }
    if (e.type === 'feast' || e.type === 'glide') return true;
    return false;
  }
  /** The clam lands (core burst of attack shell_drop): it shatters in shell chips and sand, a ring to the true edge. */
  burst(e) {
    const fx = this.fx, y = this.gy(e.x, e.z);
    if (fx) for (let i = 0; i < 18; i++) { const a = Math.random() * 6.283, sp = 2 + Math.random() * 3; fx.add(e.x, y + 0.2, e.z, Math.sin(a) * sp, 2 + Math.random() * 2, Math.cos(a) * sp, { color: CHIP[i % 3], size: 0.12, sizeEnd: 0.04, life: 0.5, gravity: 11, drag: 1 }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.1, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.4, 0.4, Math.cos(a) * 1.4, 0.6, 0.4); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius || 1, new THREE.Color(0xffd8b8), 0.35);
    for (const c of this.clams) if (c.id === e.id || (Math.hypot(c.x - e.x, c.z - e.z) < 0.05 && !c.cracked)) c.cracked = 1;
    this.monster.onShake?.(0.08, 0.1);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    // the swoop warning
    const sw = g.monsters.find((m) => !m.dead && m.type === 'shore_gull' && m.state === 'windup' && m.windup?.name === 'snatch' && m.windup.path);
    if (sw) {
      const w = sw.windup, R = sw.def.attacks.snatch.reach;
      if (this.bandFor !== sw.id + w.total * 1000 + w.path[0][0]) {
        this.bandFor = sw.id + w.total * 1000 + w.path[0][0];
        const pos = this.band.geometry.attributes.position.array, [p0, p1, p2] = w.path;
        for (let i = 0; i <= N; i++) {
          const k = i / N, u = 1 - k, x = u * u * p0[0] + 2 * u * k * p1[0] + k * k * p2[0], z = u * u * p0[1] + 2 * u * k * p1[1] + k * k * p2[1];
          const dx = 2 * u * (p1[0] - p0[0]) + 2 * k * (p2[0] - p1[0]), dz = 2 * u * (p1[1] - p0[1]) + 2 * k * (p2[1] - p1[1]), L = Math.hypot(dx, dz) || 1;
          for (const sg of [-1, 1]) { const o = (i * 2 + (sg > 0 ? 1 : 0)) * 3, px = x + (dz / L) * R * sg, pz = z - (dx / L) * R * sg; pos[o] = px; pos[o + 1] = this.gy(px, pz) + 0.06; pos[o + 2] = pz; }
        }
        this.band.geometry.attributes.position.needsUpdate = true;
      }
      const k = Math.min(1, sw.stateT / w.total);
      // a plain fill that strengthens toward the swoop
      this.band.visible = true;
      this.band.material.opacity = 0.16 + 0.3 * k;
      this.band.material.color.setHex(k > 0.85 ? 0xff9a5a : 0xff7a3a);
    } else this.band.visible = false;
    // trails in the swoop
    for (const m of g.monsters) if (!m.dead && m.swoop && m.type === 'shore_gull' && Math.random() < 0.8) {
      const y = this.gy(m.x, m.z) + 0.9;
      this.fx?.add(m.x, y, m.z, -Math.sin(m.facing) * 2, 0, -Math.cos(m.facing) * 2, { color: 0xffffff, size: 0.1, sizeEnd: 0.02, life: 0.25, drag: 2 });
      if (Math.random() < 0.15) this.fx?.add(m.x, y + 0.2, m.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), { color: 0xf4f2ea, size: 0.14, sizeEnd: 0.1, life: 0.9, gravity: 1, drag: 2 });
    }
    // each peck of a gull riding a head: a star of light on the head, a feather now and then
    for (const m of g.monsters) {
      if (m.dead || !m.perch || m.type !== 'shore_gull') continue;
      if (m.perch.n !== (m.perch.seenN ?? 0)) {
        m.perch.seenN = m.perch.n;
        const y = this.gy(m.x, m.z) + 1.55;
        this.monster.burstStar?.(m.x, y, m.z, 0.3, PECK, 0xffffff, 0xf4f2ea);
        this.monster.onShake?.(0.03, 0.05);
      }
    }
    // a coin in the beak of each gull with loot
    let c = 0;
    for (const m of g.monsters) {
      if (m.dead || !m.loot || m.type !== 'shore_gull' || c >= this.coins.length) continue;
      const s = this.coins[c++], r = this.host.monsterRig?.(m.id), h = r?.bones?.head;
      if (!h) { s.visible = false; continue; }
      h.updateWorldMatrix(true, false); _v.set(0, -0.03, 0.42).applyMatrix4(h.matrixWorld);
      s.visible = true; s.position.copy(_v); s.scale.setScalar(0.32 + 0.06 * Math.sin(this.time * 8)); s.material.opacity = 0.9;
    }
    for (let i = c; i < this.coins.length; i++) this.coins[i].visible = false;
    // clams: carried up by a gull whose clam is falling, then falling onto the mark, then lying cracked open
    let n = 0;
    for (const ar of g.areas) {
      if (ar.attack !== 'shell_drop' || n >= this.clams.length) continue;
      const q = this.clams[n++], left = ar.delay - ar.t;
      if (q.id !== ar.id) Object.assign(q, { id: ar.id, src: ar.sourceId, cracked: 0, x: ar.x, z: ar.z });
      const src = g.monsterById?.(ar.sourceId), gy = this.gy(ar.x, ar.z);
      if (left > FALL && src) {
        // in its feet
        const r = this.host.monsterRig?.(src.id), b = r?.bones?.body;
        q.a.rotation.x = 0; q.b.rotation.x = Math.PI; q.a.position.set(0, 0, 0); q.b.position.set(0, 0, 0);
        if (b && src.state === 'act') { b.updateWorldMatrix(true, false); _v.setFromMatrixPosition(b.matrixWorld); q.g.visible = true; q.g.position.set(_v.x, _v.y - 0.45, _v.z); q.g.rotation.set(0, this.time, 0); }
        else q.g.visible = false;
      } else if (left > 0) {
        // falling, turning over, onto its mark
        const k = 1 - left / FALL;
        q.g.visible = true; q.g.position.set(ar.x, gy + 0.15 + 6 * (1 - k * k), ar.z); q.g.rotation.set(k * 6, k * 3, 0);
      }
    }
    // after its burst the area is gone: the cracked halves stay where it landed while its gull eats
    for (let i = n; i < this.clams.length; i++) {
      const q = this.clams[i];
      const eater = g.monsters.find((m) => m.id === q.src && !m.dead && (m.drop || (m.state === 'stunned' && Math.hypot(m.x - q.x, m.z - q.z) < 0.3)));
      if (!q.cracked || !eater) { q.g.visible = false; q.id = -1; continue; }
      const gy = this.gy(q.x, q.z);
      q.g.visible = true; q.g.position.set(q.x, gy + 0.05, q.z); q.g.rotation.set(0, 0.6, 0);
      q.a.rotation.x = -0.9; q.b.rotation.x = Math.PI + 0.9; q.a.position.set(0, 0, -0.12); q.b.position.set(0, 0, 0.12);
    }
    // the feast: sparkles bob over a gull eating, its open moment
    let f = 0;
    for (const m of g.monsters) {
      if (m.dead || m.type !== 'shore_gull' || m.state !== 'stunned' || !m.exposed || f >= this.feasts.length) continue;
      const s = this.feasts[f++].s, y = this.gy(m.x, m.z) + 1.6 + 0.15 * Math.sin(this.time * 6);
      s.visible = true; s.position.set(m.x, y, m.z); s.scale.setScalar(0.5 + 0.15 * Math.sin(this.time * 10)); s.material.opacity = 0.8;
      if (Math.random() < 0.2) this.monster.companion?.glint(m.x + (Math.random() - 0.5) * 0.6, y - 0.2, m.z + (Math.random() - 0.5) * 0.6, 0.45, 0);
    }
    for (let i = f; i < this.feasts.length; i++) this.feasts[i].s.visible = false;
  }
}
