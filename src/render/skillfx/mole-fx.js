// The rootdigger mole's earth (docs/MONSTER-ATTACKS.md), built from the ground kit the owner approved for Earth
// Heave (skillfx/ground-kit.js): soft noise-cut dust puffs, lumpy toon-shaded clods and slabs of ground, and a
// freshly dug pit decal - never dots of colour (owner, 2026-11-05: "the effects are very bad").
//   Dig Scoop: a shallow fan of freshly dug soil where the claws scooped, clods and dust flung across the arc.
//   Dirt Spray: while it digs, dust and clods kicked up under its claws; the shots are tumbling clods of earth
//     trailing dust, breaking into a puff and a few bouncing crumbs where they end.
//   Burrow Burst: it digs a pit where it goes under; only once it is gone (owner: the earth used to move before it
//     had finished digging in) the ground heaves along its path - slabs of soil pushed up and settling, dust rolling
//     off them - to the mark, where the ground bursts: a round dug pit, a ring of slabs pried up outward, clods
//     thrown high, dust bursting out.
// Cosmetic only; everything pooled, no allocation per frame.
import * as THREE from 'three';
import { mulberry32, place, placeV, conformPlane, BILLBOARD_VS } from './fx-common.js';
import { rockGeometry, slabGeometry, craterMesh, craterFan, DUST_FS } from './ground-kit.js';

// earth lit in the game's three toon steps; the colours are uniforms (one program for every earth piece)
const EARTH_VS = `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
const EARTH_FS = `varying vec3 vN; uniform vec3 uLit; uniform vec3 uMid; uniform vec3 uDark;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49)));
    gl_FragColor = vec4(l > 0.55 ? uLit : (l > 0.1 ? uMid : uDark), 1.0); }`;
const SOIL = { lit: [0.56, 0.41, 0.27], mid: [0.4, 0.28, 0.19], dark: [0.25, 0.17, 0.12] };
const CLODS = 10, SLABS = 16, DUST = 28, PITS = 3;

export class MoleFx {
  constructor(scene, camera, host) {
    this.camera = camera; this.host = host; this.rnd = mulberry32(61);
    const c = (a) => new THREE.Color(...a);
    this.earth = new THREE.ShaderMaterial({ uniforms: { uLit: { value: c(SOIL.lit) }, uMid: { value: c(SOIL.mid) }, uDark: { value: c(SOIL.dark) } }, vertexShader: EARTH_VS, fragmentShader: EARTH_FS });
    const mesh = (g) => { const m = new THREE.Mesh(g, this.earth); m.visible = false; scene.add(m); return m; };
    this.clods = Array.from({ length: CLODS }, (_, i) => ({ m: mesh(rockGeometry(311 + i * 17)), p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 0.1, spin: 0 }));
    this.slabs = Array.from({ length: SLABS }, (_, i) => ({ m: mesh(slabGeometry(401 + i * 11)), x: 0, z: 0, out: 0, t: 9, h: 0.3, w: 0.3, rise: 0.09, hold: 0.4, tilt: 0.4 }));
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dust = Array.from({ length: DUST }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m);
      return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 1, life: 0.8 };
    });
    this.dustI = 0;
    this.pits = Array.from({ length: PITS }, (_, i) => ({ m: craterMesh(scene, 5.1 + i * 2.3), t: 9, life: 2, grow: 0.1 }));
    this.pitI = 0;
    this.shots = new Map(); // a Dirt Spray projectile -> its clod
    this.digs = new Map(); // a burrowing mole's id -> its dig { x, z, tx, tz, total, t, next, gone }
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }

  puff(x, y, z, vx, vz, size, life, up = 0.5) {
    const q = this.dust[this.dustI++ % DUST];
    q.p.set(x, y, z); q.v.set(vx, up + this.rnd() * 0.4, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = this.rnd() * 40;
  }
  clod(x, y, z, vx, vy, vz, size, life = 1.2) {
    const q = this.clods.find((c) => c.t >= c.life && !c.shot) || this.clods[(this.rnd() * CLODS) | 0];
    if (q.shot) return null;
    q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.life = life; q.size = size; q.spin = 6 + this.rnd() * 6; q.m.visible = true;
    q.m.rotation.set(this.rnd() * 6, this.rnd() * 6, this.rnd() * 6);
    return q;
  }
  slab(x, z, out, h, w, delay, rise = 0.09, hold = 0.4, tilt = 0.45) {
    const q = this.slabs.find((s) => s.t > 2) || this.slabs[(this.rnd() * SLABS) | 0];
    Object.assign(q, { x, z, out, h, w, t: -delay, rise, hold, tilt }); q.m.visible = false;
  }
  pit(x, z, radius, life, fan = null) {
    const P = this.pits[this.pitI++ % PITS], u = P.m.material.uniforms;
    u.uBurn.value = 0; u.uGlow.value = 0; u.uA.value = 0;
    if (fan) craterFan(P.m, fan.angle, fan.arc, 0.05); else { u.uArc.value = 0; }
    place(P.m, x, 0.04, z); P.m.scale.setScalar(radius * 1.7 * 2); conformPlane(P.m); P.m.visible = true;
    P.t = 0; P.life = life;
  }

  /** Dig Scoop's contact (core monsterSwing): a fan of dug soil over the scooped arc, earth flung across it. */
  scoop(e) {
    const arc = (e.arc * Math.PI) / 180, R = Math.min(2.2, e.range), r = this.rnd;
    this.pit(e.x + Math.sin(e.angle) * 0.4, e.z + Math.cos(e.angle) * 0.4, R * 0.75, 1.6, { angle: e.angle, arc: e.arc * 0.85 });
    for (let i = 0; i < 6; i++) {
      const a = e.angle + (i / 5 - 0.5) * arc * 0.9 + (r() - 0.5) * 0.15, sp = 2.4 + r() * 2;
      this.clod(e.x + Math.sin(a) * 0.9, 0.35, e.z + Math.cos(a) * 0.9, Math.sin(a) * sp, 2.5 + r() * 2, Math.cos(a) * sp, 0.07 + r() * 0.06, 1.0);
    }
    for (let i = 0; i < 4; i++) { const a = e.angle + (i / 3 - 0.5) * arc * 0.8; this.puff(e.x + Math.sin(a) * 1.1, 0.25, e.z + Math.cos(a) * 1.1, Math.sin(a) * 1.6, Math.cos(a) * 1.6, 0.9 + r() * 0.4, 0.7); }
  }

  /** A wind-up began: Dirt Spray kicks earth up under its claws; Burrow Burst starts its dig. */
  windup(e, g) {
    if (e.name === 'erupt') {
      const a = g.areas?.find((q) => q.sourceId === e.id && q.attack === 'erupt');
      this.digs.set(e.id, { x: e.x, z: e.z, tx: a ? a.x : e.x, tz: a ? a.z : e.z, total: e.total, t: 0, next: 0, pit: false, step: 0 });
    }
  }
  /** The mark bursts (core burst of its Burrow Burst area). */
  burst(e) {
    const R = e.radius || 1.8, r = this.rnd;
    this.digs.delete(e.source);
    this.pit(e.x, e.z, R * 0.8, 2.2);
    // a ring of slabs pried up outward, a beat apart round the ring
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283 + r() * 0.3, d = R * (0.55 + r() * 0.2);
      this.slab(e.x + Math.sin(a) * d, e.z + Math.cos(a) * d, a, 0.42 + r() * 0.22, 0.3 + r() * 0.1, i * 0.012, 0.08, 0.5, 0.6);
    }
    for (let i = 0; i < 8; i++) { const a = r() * 6.283, sp = 1.5 + r() * 2.5; this.clod(e.x, 0.4, e.z, Math.sin(a) * sp, 5 + r() * 3.5, Math.cos(a) * sp, 0.08 + r() * 0.08, 1.4); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + r(); this.puff(e.x + Math.sin(a) * 0.4, 0.3, e.z + Math.cos(a) * 0.4, Math.sin(a) * 2.6, Math.cos(a) * 2.6, 1.2 + r() * 0.5, 0.9, 0.9); }
  }

  update(dt, g) {
    const r = this.rnd;
    // the burrow: the pit where it went under, then (once it is down) the ground heaving along its path
    for (const [id, d] of this.digs) {
      const m = g.monsterById?.(id);
      d.t += dt;
      if (!m || m.dead || m.state !== 'windup') { this.digs.delete(id); continue; }
      const k = d.t / d.total;
      if (!d.pit && k > 0.05) { d.pit = true; this.pit(d.x, d.z, 1.0, d.total + 1.2); }
      d.next -= dt;
      if (k < 0.36) {
        // digging in: earth thrown back off its claws
        if (d.next <= 0) { d.next = 0.07; const a = r() * 6.283; this.puff(d.x + Math.sin(a) * 0.5, 0.2, d.z + Math.cos(a) * 0.5, Math.sin(a) * 1.2, Math.cos(a) * 1.2, 0.7 + r() * 0.3, 0.6); if (r() < 0.6) this.clod(d.x, 0.3, d.z, Math.sin(a) * 2, 3 + r() * 2, Math.cos(a) * 2, 0.05 + r() * 0.04, 0.9); }
        continue;
      }
      // under the ground: the heave runs from where it went in to the mark, arriving as the dig ends
      const p = Math.min(1, (k - 0.36) / 0.6), x = d.x + (d.tx - d.x) * p, z = d.z + (d.tz - d.z) * p, ang = Math.atan2(d.tx - d.x, d.tz - d.z);
      if (d.next <= 0 && p < 1) {
        d.next = 0.06;
        // the head of the heave: slabs either side of the path pushed up and settling as it passes, and dust
        const side = (d.step++ % 2 ? 1 : -1) * (0.18 + r() * 0.1);
        this.slab(x + Math.cos(ang) * side, z - Math.sin(ang) * side, ang + side * 2, 0.16 + r() * 0.08, 0.2 + r() * 0.06, 0, 0.07, 0.18, 0.35);
        if (d.step % 2) this.puff(x, 0.15, z, (r() - 0.5) * 0.8, (r() - 0.5) * 0.8, 0.6 + r() * 0.3, 0.55, 0.3);
      }
    }
    // the spray's shots in flight: a clod each, lobbed, trailing dust; a puff and crumbs where each ends
    for (const pr of g.projectiles) {
      if (pr.kind !== 'spray') continue;
      let c = this.shots.get(pr);
      if (!c) { c = this.clod(pr.x, 0.6, pr.z, 0, 0, 0, 0.2, 99); if (!c) continue; c.shot = true; this.shots.set(pr, c); }
      const k = Math.min(1, pr.travelled / pr.range);
      c.p.set(pr.x, 0.55 + Math.sin(k * Math.PI) * 0.9, pr.z); c.t = 0;
      if (r() < 0.35) this.puff(pr.x, c.p.y, pr.z, -pr.vx * 0.04, -pr.vz * 0.04, 0.35, 0.35, 0.1);
    }
    for (const [pr, c] of this.shots) {
      if (g.projectiles.includes(pr)) continue;
      this.shots.delete(pr); c.shot = false; c.t = c.life = 9; c.m.visible = false;
      this.puff(c.p.x, 0.4, c.p.z, 0, 0, 0.8, 0.6);
      for (let i = 0; i < 3; i++) { const a = r() * 6.283; this.clod(c.p.x, 0.4, c.p.z, Math.sin(a) * 1.8, 2 + r() * 1.5, Math.cos(a) * 1.8, 0.05, 0.8); }
    }
    // clods: thrown, fall, bounce once, shrink away
    for (const q of this.clods) {
      if (q.shot) { q.m.rotation.x += dt * q.spin; q.m.rotation.y += dt * q.spin * 0.6; placeV(q.m, q.p); q.m.scale.setScalar(q.size); continue; }
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.y -= 16 * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.size) { q.p.y = q.size; q.v.y = Math.abs(q.v.y) * 0.25; q.v.x *= 0.5; q.v.z *= 0.5; q.spin *= 0.5; }
      q.m.rotation.x += dt * q.spin; q.m.rotation.z += dt * q.spin * 0.7;
      placeV(q.m, q.p); q.m.scale.setScalar(q.size * Math.min(1, (q.life - q.t) / 0.25));
    }
    // slabs of ground: up (a little overshoot), held, sinking back
    for (const q of this.slabs) {
      if (q.t > 2) continue;
      q.t += dt;
      if (q.t < 0) continue;
      const up = Math.min(1, q.t / q.rise), over = up < 1 ? up : 1 + 0.1 * Math.sin(Math.min(1, (q.t - q.rise) / 0.12) * Math.PI);
      const sink = Math.max(0, Math.min(1, (q.t - q.rise - q.hold) / 0.35)), hgt = q.h * over * (1 - sink);
      q.m.visible = hgt > 0.015;
      if (!q.m.visible) { if (sink >= 1) q.t = 9; continue; }
      place(q.m, q.x, hgt * 0.55 - q.h * 0.5, q.z);
      q.m.scale.set(q.w, q.h, q.w * 0.8);
      q.m.rotation.set(0, q.out, 0); q.m.rotateX(q.tilt * Math.min(1, hgt / q.h));
    }
    // dust
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.5 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
    // dug pits: open quickly, fade at the end
    for (const P of this.pits) {
      if (P.t >= P.life) { P.m.visible = false; continue; }
      P.t += dt;
      P.m.material.uniforms.uA.value = Math.min(1, P.t / 0.08) * Math.max(0, Math.min(1, (P.life - P.t) / 0.6));
    }
  }
}
