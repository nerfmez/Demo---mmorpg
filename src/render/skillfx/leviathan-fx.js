// The earthburrow leviathan's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events: a giant
// earth serpent with roots grown through its stone scales. Earth in the game's three toon steps, dust, roots; danger
// zones in the warm warning colour at their true size (vfx.js marks its areas).
// - Under the ground (burrow hunt, tremor sense): a mound of heaved slabs and dust runs over it, leaving a line of
//   cracked ground that sinks back; where it will burst out the ground bulges; bursting out: rocks flung, a ring of
//   slabs, a dust cloud, a shock ring.
// - Head smash, the arc leap's two ends: a crater, chips, slabs, dust, a shock ring.
// - Coil ring: its furrow behind it a wall of roots (twisting strands rising out of the ground, slabs heaved along it);
//   when it closes, the roots squeeze in.
// - Tremor sense: each tremor a ripple running out over the ground from it; the one it finds: dust jumping round them.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, conformPlane, place, BILLBOARD_VS } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW } from './light-kit.js';
import { rockGeometry, slabGeometry, craterMesh, STONE_VS, DUST_FS } from './ground-kit.js';

const CHIPS = 20, PUFFS = 40, SLABS = 48, CRATERS = 3, WAVES = 8, ROOTS = 3;
const EARTH = { edge: [0.55, 0.4, 0.26], glow: [0.35, 0.24, 0.12] }, ROOT = [0.52, 0.34, 0.18], ROOT_DARK = [0.36, 0.22, 0.11], MOSS = [0.42, 0.52, 0.2];
// a root: a plain strand in its own colour, lit along its middle, darker to its edges (not the light ribbons' white core)
const ROOT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y); if (d > 0.95) discard; vec3 c = mix(vT*1.25, vT*0.6, smoothstep(0.15, 0.95, d)); gl_FragColor = vec4(c, vA); }`;
// its stone: earth browns in the game's three toon steps
const EARTH_FS = `varying vec3 vN; uniform float uA; uniform vec3 uHi, uMid, uLo;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49))); gl_FragColor = vec4(l > 0.55 ? uHi : (l > 0.1 ? uMid : uLo), uA); }`;
const _a = new THREE.Vector3();

export class LeviathanFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1000, GLOW_FS, THREE.AdditiveBlending);
    this.roots = new Ribbon(scene, monster.camera, 1200, ROOT_FS, THREE.NormalBlending);
    this.core.mesh.renderOrder = 4; this.glow.mesh.renderOrder = 3; this.roots.mesh.renderOrder = 5;
    const stone = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uHi: { value: new THREE.Color(0xa88760) }, uMid: { value: new THREE.Color(0x7c5d3f) }, uLo: { value: new THREE.Color(0x4f3a27) } }, vertexShader: STONE_VS, fragmentShader: EARTH_FS });
    this.chips = Array.from({ length: CHIPS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(2311 + i * 7), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 0.1, spin: 0 }; });
    this.chipI = 0;
    this.slabs = Array.from({ length: SLABS }, (_, i) => { const m = new THREE.Mesh(slabGeometry(611 + i * 17), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, x: 0, z: 0, out: 0, t: 9, h: 1, w: 0.4, life: 0.8 }; });
    this.slabI = 0;
    const quad = new THREE.PlaneGeometry(1, 1); quad.userData.shared = true;
    this.puffs = Array.from({ length: PUFFS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 1 }; });
    this.puffI = 0;
    this.craters = Array.from({ length: CRATERS }, (_, i) => ({ m: craterMesh(scene, 4.1 + i * 2.3), t: 9 }));
    this.craterI = 0;
    this.waves = Array.from({ length: WAVES }, () => ({ t: 9, x: 0, z: 0, R0: 0, R1: 1, life: 0.35, w: 0.2 }));
    this.waveI = 0;
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    this.strand = Array.from({ length: 64 }, () => new THREE.Vector3());
    this.trailT = 0; this.dustT = 0;
    this.lastX = new Map(); this.lastZ = new Map(); // where each burrowed one last dropped a cracked slab
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }

  chipsAt(x, z, n, sp, up = 4) {
    const y = this.gy(x, z);
    for (let i = 0; i < n; i++) {
      const q = this.chips[this.chipI++ % CHIPS], a = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.8);
      q.p.set(x + Math.sin(a) * 0.4, y + 0.2, z + Math.cos(a) * 0.4); q.v.set(Math.sin(a) * v, up * (0.6 + Math.random() * 0.7), Math.cos(a) * v);
      q.t = 0; q.size = 0.12 + Math.random() * 0.2; q.spin = (Math.random() - 0.5) * 12; q.m.visible = true;
    }
  }
  puff(x, y, z, vx, vy, vz, size, life) { const q = this.puffs[this.puffI++ % PUFFS]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.life = life; q.size = size; q.m.material.uniforms.uSeed.value = Math.random() * 40; }
  cloud(x, z, R, n, size) { const y = this.gy(x, z); for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.5, sp = 1.2 + Math.random() * 1.8; this.puff(x + Math.sin(a) * R, y + 0.35, z + Math.cos(a) * R, Math.sin(a) * sp, 0.4 + Math.random() * 0.6, Math.cos(a) * sp, size * (0.8 + Math.random() * 0.5), 0.9 + Math.random() * 0.5); } }
  heave(x, z, out, delay, h, w, life = 0.8) { Object.assign(this.slabs[this.slabI++ % SLABS], { x, z, out, t: -delay, h, w, life }); }
  ringOfSlabs(x, z, R, n, h, w = 0.4, life = 0.8) { const a0 = Math.random() * 6.283; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283 + (Math.random() - 0.5) * 0.3; this.heave(x + Math.sin(a) * R, z + Math.cos(a) * R, a, i * 0.01, h * (0.75 + Math.random() * 0.5), w * (0.8 + Math.random() * 0.4), life); } }
  pit(x, z, R) { const C = this.craters[this.craterI++ % CRATERS], u = C.m.material.uniforms; u.uArc.value = 0; u.uBurn.value = 0; u.uGlow.value = 0; place(C.m, x, 0.05, z); C.m.scale.setScalar(R * 1.7 * 2); conformPlane(C.m); C.m.visible = true; C.t = 0; }
  wave(x, z, R0, R1, life, w = 0.2) { Object.assign(this.waves[this.waveI++ % WAVES], { t: 0, x, z, R0, R1, life, w }); }
  breach(x, z, R) {
    this.chipsAt(x, z, 12, 4, 6); this.ringOfSlabs(x, z, R * 0.75, 10, 1.1, 0.5); this.cloud(x, z, R * 0.5, 10, 2.2);
    this.wave(x, z, 0.5, R + 0.6, 0.35); this.monster.onShake?.(0.22, 0.2);
  }

  /** The leviathan's marked areas going off (core burst); true when drawn here. */
  burst(e) {
    if (e.kind === 'lev_smash') { this.pit(e.x, e.z, e.radius * 0.7); this.chipsAt(e.x, e.z, 10, 3.5, 5); this.ringOfSlabs(e.x, e.z, e.radius * 0.8, 9, 0.8); this.cloud(e.x, e.z, e.radius * 0.5, 8, 1.8); this.wave(e.x, e.z, 0.4, e.radius + 0.4, 0.3); this.monster.onShake?.(0.2, 0.18); return true; }
    if (e.kind === 'lev_breach') { this.breach(e.x, e.z, e.radius); return true; }
    if (e.kind === 'lev_land') { this.pit(e.x, e.z, e.radius * 0.8); this.breach(e.x, e.z, e.radius); this.wave(e.x, e.z, 0.5, e.radius + 1.5, 0.45, 0.3); return true; }
    return false;
  }

  /** The leviathan's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'earthburrow_leviathan') return false;
    switch (e.type) {
      case 'burrowDive': case 'tremorDive': this.chipsAt(e.x, e.z, 8, 2.5, 4); this.cloud(e.x, e.z, 0.8, 8, 1.8); this.ringOfSlabs(e.x, e.z, 1.2, 7, 0.7); this.monster.onShake?.(0.12, 0.12); return true;
      case 'burrowTell': this.ringOfSlabs(e.x, e.z, e.radius * 0.55, 8, 0.45, 0.35, e.tell + 0.3); this.cloud(e.x, e.z, 0.4, 5, 1.2); this.monster.onShake?.(0.06, e.tell); return true;
      case 'levBreach': this.breach(e.x, e.z, Math.max(2, e.radius)); return true;
      case 'arcLeap': this.cloud(e.x, e.z, 0.6, 6, 1.6); return true;
      case 'tremorPulse': this.wave(e.x, e.z, 0.5, 16, 0.9, 0.12); this.monster.onShake?.(0.05, 0.1); return true;
      case 'tremorFound': { const y = this.gy(e.x, e.z); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.puff(e.x + Math.sin(a) * 0.8, y + 0.2, e.z + Math.cos(a) * 0.8, Math.sin(a), 1.2, Math.cos(a), 0.9, 0.6); } this.chipsAt(e.x, e.z, 4, 1, 3); return true; }
      case 'coilStart': return true;
      case 'coilClose': { this.ringOfSlabs(e.x, e.z, e.ring * 0.6, 14, 1, 0.5); this.ringOfSlabs(e.x, e.z, e.ring * 0.3, 8, 1.2, 0.5); this.cloud(e.x, e.z, e.ring * 0.4, 12, 2); this.wave(e.x, e.z, e.ring, 0.5, 0.35, 0.3); this.monster.onShake?.(0.25, 0.25); return true; }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin(); this.roots.begin();
    const dust = (this.dustT -= dt) <= 0;
    if (dust) this.dustT = 0.07;
    let ri = 0;
    for (const m of g.monsters) {
      if (m.type !== 'earthburrow_leviathan' || m.dead) continue;
      // the mound running over it under the ground, and the cracked line it leaves
      const under = (m.burrow && m.burrow.phase !== 'out') || m.tremor;
      if (under) {
        const lx = this.lastX.get(m.id) ?? m.x, lz = this.lastZ.get(m.id) ?? m.z;
        if (Math.hypot(m.x - lx, m.z - lz) > 0.6 || !this.lastX.has(m.id)) {
          this.lastX.set(m.id, m.x); this.lastZ.set(m.id, m.z);
          const a = Math.atan2(m.x - lx, m.z - lz);
          for (const s of [-1, 1]) this.heave(m.x + Math.cos(a) * 0.7 * s, m.z - Math.sin(a) * 0.7 * s, a + s * 1.2, 0, 0.45 + Math.random() * 0.25, 0.32, 1.1);
        }
        if (dust && m.moving) { const y = this.gy(m.x, m.z); this.puff(m.x, y + 0.3, m.z, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 1.4, 0.8); if (Math.random() < 0.4) this.chipsAt(m.x, m.z, 1, 1.5, 3); }
      } else { this.lastX.delete(m.id); this.lastZ.delete(m.id); }
      // the coil: a wall of roots in its furrow, from where it began round to its head
      if (m.ring && ri < ROOTS) {
        ri++;
        const R = m.ring, atk = m.def.attacks[R.name], swept = Math.min(Math.PI * 2, Math.abs(R.a - R.a0)), n = Math.max(2, Math.min(this.strand.length, Math.ceil(swept / 0.12) + 1));
        for (let k = 0; k < 3; k++) {
          for (let j = 0; j < n; j++) {
            const a = R.a0 + R.dir * swept * (j / (n - 1)), r = R.R + Math.sin(j * 0.9 + k * 2.1 + this.time * 2) * 0.25, x = R.cx + Math.sin(a) * r, z = R.cz + Math.cos(a) * r;
            const grow = Math.min(1, (swept - swept * (j / (n - 1))) / 0.5);
            this.strand[j].set(x, this.gy(x, z) + (0.25 + 0.55 * Math.abs(Math.sin(j * 0.7 + k * 1.3))) * grow, z);
          }
          const seg = this.strand.slice(0, n);
          RW.v = 0.26 - k * 0.05; this.roots.strip(seg, lineW, 1, k === 2 ? MOSS : k ? ROOT_DARK : ROOT);
        }
        // its true band, faint, so the gap reads
        for (let j = 0; j < n; j++) { const a = R.a0 + R.dir * swept * (j / (n - 1)), x = R.cx + Math.sin(a) * R.R, z = R.cz + Math.cos(a) * R.R; this.strand[j].set(x, this.gy(x, z) + 0.05, z); }
        RW.v = atk.band * 2; this.core.strip(this.strand.slice(0, n), lineW, 0.18, [1, 0.45, 0.2]);
        if (dust) { const x = m.x, z = m.z; this.heave(x, z, R.a + Math.PI / 2, 0, 0.6, 0.35, 1.2); this.puff(x, this.gy(x, z) + 0.3, z, 0, 0.5, 0, 1.2, 0.7); }
      }
    }
    // slabs heaved up, then sinking back
    for (const q of this.slabs) {
      if (q.t > q.life + 0.5) { q.m.visible = false; continue; }
      const was = q.t; q.t += dt;
      if (q.t < 0) continue;
      if (was < 0 && Math.random() < 0.5) this.puff(q.x, this.gy(q.x, q.z) + 0.2, q.z, Math.sin(q.out), 0.4, Math.cos(q.out), 0.9, 0.7);
      const up = Math.min(1, q.t / 0.1), over = up < 1 ? up : 1 + 0.12 * Math.sin(Math.min(1, (q.t - 0.1) / 0.14) * Math.PI);
      const sink = Math.max(0, Math.min(1, (q.t - q.life) / 0.5)), hgt = q.h * over * (1 - sink);
      q.m.visible = hgt > 0.02;
      if (!q.m.visible) continue;
      place(q.m, q.x, hgt * 0.55 - 0.25, q.z);
      q.m.scale.set(q.w, 0.5, q.w * 0.8); q.m.rotation.set(0, q.out, 0); q.m.rotateX(0.5 * Math.min(1, hgt / q.h));
    }
    const cam = this.monster.camera;
    for (const q of this.chips) {
      if (q.t > 1.4) { q.m.visible = false; continue; }
      q.t += dt; q.v.y -= 16 * dt; q.p.addScaledVector(q.v, dt);
      const gy = this.gy(q.p.x, q.p.z) + q.size * 0.5;
      if (q.p.y < gy) { q.p.y = gy; q.v.set(q.v.x * 0.4, Math.abs(q.v.y) * 0.25, q.v.z * 0.4); }
      q.m.position.copy(q.p); q.m.scale.setScalar(q.size * (q.t > 1.0 ? 1 - (q.t - 1.0) / 0.4 : 1)); q.m.rotation.x += q.spin * dt; q.m.rotation.y += q.spin * 0.6 * dt; q.m.visible = true;
    }
    for (const q of this.puffs) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.2 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; q.m.position.copy(q.p); q.m.quaternion.copy(cam.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
    for (const C of this.craters) { if (C.t > 3) { C.m.visible = false; continue; } C.t += dt; C.m.material.uniforms.uA && (C.m.material.uniforms.uA.value = Math.max(0, 1 - Math.max(0, C.t - 2) / 1)); }
    for (const W of this.waves) {
      if (W.t >= W.life) continue;
      W.t += dt;
      const u = Math.min(1, W.t / W.life), R = W.R0 + (W.R1 - W.R0) * (1 - (1 - u) * (1 - u)), y = this.gy(W.x, W.z) + 0.08;
      for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(W.x + Math.sin(a) * R, y, W.z + Math.cos(a) * R); }
      RW.v = W.w * (1 - u) + 0.03; this.glow.strip(this.ring, lineGlowW, 0.35 * (1 - u), EARTH.glow); this.core.strip(this.ring, lineW, 0.8 * (1 - u), EARTH.edge);
    }
    this.core.end(); this.glow.end(); this.roots.end();
  }
}
