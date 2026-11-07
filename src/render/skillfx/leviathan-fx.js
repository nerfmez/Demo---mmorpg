// The earthburrow leviathan's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events: a giant
// earth serpent with roots grown through its stone scales. Earth in the game's three toon steps, dust, roots; danger
// zones in the warm warning colour at their true size (vfx.js marks its areas).
// - Under the ground (burrow hunt, tremor sense): a mound of heaved slabs and dust runs over it, leaving a line of
//   cracked ground that sinks back; where it will burst out the ground bulges; bursting out: rocks flung, a ring of
//   slabs, a dust cloud, a shock ring.
// - Head smash, the arc leap's two ends: a crater, chips, slabs, dust, a shock ring.
// - Coil ring: its furrow behind it a wall of roots (round 2: real roots, arches erupting one after another, a fence);
//   when it closes, the roots squeeze in.
// - Tremor sense: each tremor a ripple running out over the ground from it; the one it finds: dust jumping round them.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, conformPlane, place, BILLBOARD_VS } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW } from './light-kit.js';
import { rockGeometry, slabGeometry, craterMesh, STONE_VS, DUST_FS } from './ground-kit.js';
import { flameMaterial, domeShell } from './meteor-flame.js';

const CHIPS = 20, PUFFS = 40, SLABS = 48, CRATERS = 3, WAVES = 8, ROOTS = 3, ARCHES = 44, LUNGES = 12, WRAPS = 2;
const EARTH = { edge: [0.55, 0.4, 0.26], glow: [0.35, 0.24, 0.12] };
// its stone: earth browns in the game's three toon steps
const EARTH_FS = `varying vec3 vN; uniform float uA; uniform vec3 uHi, uMid, uLo;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49))); gl_FragColor = vec4(l > 0.55 ? uHi : (l > 0.1 ? uMid : uLo), uA); }`;
const _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// round 2 (owner: "the root move is not good enough"): real roots, tapered, gnarled tubes in the game's toon steps,
// shared shapes drawn instanced. A root is a tube along a bent curve, thick where it leaves the ground and thinning to
// its tip (`taper` 0..1 along it -> radius share); bumps along it make it knotted
function rootTube(points, radius, taper, seed) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 28, radius, 7, false), P = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= 28; i++) {
    const t = i / 28; curve.getPointAt(t, c);
    const k = taper(t) * (1 + 0.18 * Math.sin(t * 23 + seed) * Math.sin(t * 7 + seed * 2));
    for (let j = 0; j <= 7; j++) { const v = i * 8 + j; P.setXYZ(v, c.x + (P.getX(v) - c.x) * k, c.y + (P.getY(v) - c.y) * k, c.z + (P.getZ(v) - c.z) * k); }
  }
  g.computeVertexNormals(); g.userData.shared = true; return g;
}
const ROOT_TONE_FS = `varying vec3 vN; uniform vec3 uHi, uMid, uLo;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49))); gl_FragColor = vec4(l > 0.5 ? uHi : (l > 0.05 ? uMid : uLo), 1.0); }`;
const ROOT_VS = `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix*instanceMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); }`;

export class LeviathanFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 4; this.glow.mesh.renderOrder = 3;
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
    // the roots: arches erupting along its furrow (a fence), long roots lunging in from the ring as it closes, coils
    // round a held prey; each instanced, their state here
    const rootMat = new THREE.ShaderMaterial({ uniforms: { uHi: { value: new THREE.Color(0x9a7650) }, uMid: { value: new THREE.Color(0x6a4b30) }, uLo: { value: new THREE.Color(0x3c2a1c) } }, vertexShader: ROOT_VS, fragmentShader: ROOT_TONE_FS });
    const arch = rootTube([[-0.75, -0.2, 0], [-0.55, 0.55, 0.05], [-0.1, 1.05, -0.04], [0.35, 0.85, 0.06], [0.7, 0.2, 0], [0.8, -0.2, 0]], 0.17, (t) => 0.45 + 0.55 * Math.abs(1 - 2 * t) ** 0.6, 1);
    const lunge = rootTube([[0, -0.3, 0], [0.05, 0.35, 0.18], [-0.08, 0.6, 0.45], [0.06, 0.55, 0.72], [0, 0.35, 0.95], [0.02, 0.15, 1.05]], 0.2, (t) => 1 - 0.85 * t, 2);
    const wrapPts = []; for (let i = 0; i <= 16; i++) { const a = i * 0.85, y = -0.1 + i * 0.09; wrapPts.push([Math.sin(a) * 0.55, y, Math.cos(a) * 0.55]); }
    const wrap = rootTube(wrapPts, 0.09, (t) => 1 - 0.7 * t, 3);
    const inst = (geo, n) => { const m = new THREE.InstancedMesh(geo, rootMat, n); m.frustumCulled = false; m.renderOrder = 2; for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO); scene.add(m); return m; };
    this.archIM = inst(arch, ARCHES); this.lungeIM = inst(lunge, LUNGES); this.wrapIM = inst(wrap, WRAPS);
    this.arches = Array.from({ length: ARCHES }, () => ({ t: 9, x: 0, z: 0, a: 0, s: 1, tilt: 0, end: 9 }));
    this.lunges = Array.from({ length: LUNGES }, () => ({ t: 9, x: 0, z: 0, a: 0, len: 4, end: 9 }));
    this.archI = 0; this.lungeI = 0;
    // round 3 (owner: "the cracking ground is fine; can it be prettier?"): Firebolt's technique in earth - a dome of
    // flung soil cut from flowing noise in see-through layers, bursting up and tearing apart as it falls; and the mound
    // over it under the ground one rounded hump of earth instead of loose blocks
    const dirtMat = (layer, filled) => {
      const m = flameMaterial(1, layer, filled);
      Object.assign(m.uniforms, { uRim: { value: new THREE.Color(0x2a1d12) }, uBody: { value: new THREE.Color(0x4a3524) }, uHot: { value: new THREE.Color(0x6e5a40) }, uCore: { value: new THREE.Color(0x8c7a5e) } });
      return m;
    };
    this.dirt = Array.from({ length: 3 }, (_, i) => {
      const g = new THREE.Group(), dome = domeShell();
      for (const [layer, filled, order] of [[0, false, 7], [1, false, 6], [1, true, 5]]) { const mm = new THREE.Mesh(dome, dirtMat(layer, filled)); mm.renderOrder = order; mm.frustumCulled = false; mm.material.uniforms.uSeed.value = i * 2.7 + layer; g.add(mm); }
      g.children[2].scale.setScalar(0.6); g.visible = false; scene.add(g);
      return { g, t: 9, R: 2 };
    });
    this.dirtI = 0;
    const hump = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2); hump.userData.shared = true;
    // (in the ground's own sand colours, so it reads as the ground bulging, not a hole)
    this.hump = new THREE.Mesh(hump, new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uHi: { value: new THREE.Color(0xe2c894) }, uMid: { value: new THREE.Color(0xbf9f6c) }, uLo: { value: new THREE.Color(0x8c6c48) } }, vertexShader: STONE_VS, fragmentShader: EARTH_FS })); this.hump.visible = false; this.hump.frustumCulled = false; scene.add(this.hump);
    this.humpK = 0;
    this.placed = new Map(); // a coil's id -> how far round its arches are placed
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
  /** A dome of flung soil bursting up over (x, z), `R` m across at its fullest. */
  soil(x, z, R) { const D = this.dirt[this.dirtI++ % this.dirt.length]; D.t = 0; D.R = R; D.g.position.set(x, this.gy(x, z), z); }
  breach(x, z, R) {
    this.soil(x, z, R * 0.85);
    this.chipsAt(x, z, 12, 4, 6); this.ringOfSlabs(x, z, R * 0.75, 10, 1.1, 0.5); this.cloud(x, z, R * 0.5, 10, 2.2);
    this.wave(x, z, 0.5, R + 0.6, 0.35); this.monster.onShake?.(0.22, 0.2);
  }

  /** The leviathan's marked areas going off (core burst); true when drawn here. */
  burst(e) {
    if (e.kind === 'lev_smash') { this.soil(e.x, e.z, e.radius * 0.6); this.pit(e.x, e.z, e.radius * 0.7); this.chipsAt(e.x, e.z, 10, 3.5, 5); this.ringOfSlabs(e.x, e.z, e.radius * 0.8, 9, 0.8); this.cloud(e.x, e.z, e.radius * 0.5, 8, 1.8); this.wave(e.x, e.z, 0.4, e.radius + 0.4, 0.3); this.monster.onShake?.(0.2, 0.18); return true; }
    if (e.kind === 'lev_breach') { this.breach(e.x, e.z, e.radius); return true; }
    if (e.kind === 'lev_land') { this.pit(e.x, e.z, e.radius * 0.8); this.breach(e.x, e.z, e.radius); this.wave(e.x, e.z, 0.5, e.radius + 1.5, 0.45, 0.3); return true; }
    return false;
  }

  /** The leviathan's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'earthburrow_leviathan') return false;
    switch (e.type) {
      case 'burrowDive': case 'tremorDive': this.soil(e.x, e.z, 1.6); this.chipsAt(e.x, e.z, 8, 2.5, 4); this.cloud(e.x, e.z, 0.8, 8, 1.8); this.ringOfSlabs(e.x, e.z, 1.2, 7, 0.7); this.monster.onShake?.(0.12, 0.12); return true;
      case 'burrowTell': this.ringOfSlabs(e.x, e.z, e.radius * 0.55, 8, 0.45, 0.35, e.tell + 0.3); this.cloud(e.x, e.z, 0.4, 5, 1.2); this.monster.onShake?.(0.06, e.tell); return true;
      case 'levBreach': this.breach(e.x, e.z, Math.max(2, e.radius)); return true;
      case 'arcLeap': this.cloud(e.x, e.z, 0.6, 6, 1.6); return true;
      case 'tremorPulse': this.wave(e.x, e.z, 0.5, 16, 0.9, 0.12); this.monster.onShake?.(0.05, 0.1); return true;
      case 'tremorFound': { const y = this.gy(e.x, e.z); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.puff(e.x + Math.sin(a) * 0.8, y + 0.2, e.z + Math.cos(a) * 0.8, Math.sin(a), 1.2, Math.cos(a), 0.9, 0.6); } this.chipsAt(e.x, e.z, 4, 1, 3); return true; }
      case 'coilStart': return true;
      case 'coilClose': {
        // the roots lunge in from all round the ring toward its middle and squeeze; then all wither back into the ground
        for (let i = 0; i < LUNGES; i++) { const a = (i / LUNGES) * Math.PI * 2 + Math.random() * 0.2, L = this.lunges[this.lungeI++ % LUNGES]; Object.assign(L, { t: -i * 0.012, x: e.x + Math.sin(a) * e.ring, z: e.z + Math.cos(a) * e.ring, a: a + Math.PI, len: e.ring * (0.8 + Math.random() * 0.15), end: 1.1 }); }
        for (const A of this.arches) if (A.t < A.end) A.end = Math.min(A.end, A.t + 1.3);
        this.ringOfSlabs(e.x, e.z, e.ring * 0.6, 14, 1, 0.5); this.ringOfSlabs(e.x, e.z, e.ring * 0.3, 8, 1.2, 0.5); this.cloud(e.x, e.z, e.ring * 0.4, 12, 2); this.wave(e.x, e.z, e.ring, 0.5, 0.35, 0.3); this.monster.onShake?.(0.25, 0.25); return true; }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const dust = (this.dustT -= dt) <= 0;
    if (dust) this.dustT = 0.07;
    let ri = 0, hump = false;
    for (const m of g.monsters) {
      if (m.type !== 'earthburrow_leviathan' || m.dead) continue;
      // the mound running over it under the ground, and the cracked line it leaves
      const under = (m.burrow && m.burrow.phase !== 'out') || m.tremor;
      if (under) {
        const lx = this.lastX.get(m.id) ?? m.x, lz = this.lastZ.get(m.id) ?? m.z;
        if (Math.hypot(m.x - lx, m.z - lz) > 1.1 || !this.lastX.has(m.id)) {
          this.lastX.set(m.id, m.x); this.lastZ.set(m.id, m.z);
          const a = Math.atan2(m.x - lx, m.z - lz), s = Math.random() < 0.5 ? -1 : 1;
          this.heave(m.x + Math.cos(a) * 0.9 * s, m.z - Math.sin(a) * 0.9 * s, a + s * 1.2, 0, 0.3 + Math.random() * 0.2, 0.26, 0.9);
          this.humpA = a;
        }
        // the hump of earth running over it, swelling as it goes, breathing while it lies still and listens
        hump = true;
        this.humpK = Math.min(1, this.humpK + dt * 4);
        const sw = 1 + 0.06 * Math.sin(this.time * (m.moving ? 14 : 4));
        this.hump.position.set(m.x, this.gy(m.x, m.z) - 0.15, m.z); this.hump.rotation.set(0, this.humpA || 0, 0);
        this.hump.scale.set(1.3 * this.humpK * sw, (m.moving ? 0.65 : 0.45) * this.humpK * sw, 1.9 * this.humpK);
        if (dust && m.moving) { const y = this.gy(m.x, m.z); this.puff(m.x, y + 0.3, m.z, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 1.4, 0.8); if (Math.random() < 0.4) this.chipsAt(m.x, m.z, 1, 1.5, 3); }
      } else { this.lastX.delete(m.id); this.lastZ.delete(m.id); }
      // the coil: a wall of roots in its furrow, from where it began round to its head
      if (m.ring && ri < ROOTS) {
        ri++;
        const R = m.ring, atk = m.def.attacks[R.name], swept = Math.min(Math.PI * 2, Math.abs(R.a - R.a0)), n = Math.max(2, Math.min(this.strand.length, Math.ceil(swept / 0.12) + 1));
        // arches of root erupt along the furrow behind its head, overlapping, one every 0.8 m round the ring
        const key = m.id + ':' + R.a0.toFixed(4), done = this.placed.get(key) || 0, step = 0.8 / R.R;
        let k = done;
        for (; k * step <= swept - 0.3 / R.R; k++) {
          const A = this.arches[this.archI++ % ARCHES], ang = R.a0 + R.dir * k * step, r = R.R + (k % 2 ? 0.25 : -0.2);
          Object.assign(A, { t: 0, x: R.cx + Math.sin(ang) * r, z: R.cz + Math.cos(ang) * r, a: ang + Math.PI / 2 + (Math.random() - 0.5) * 0.9, s: 0.65 + Math.random() * 0.7, tilt: (Math.random() - 0.5) * 0.9, end: 9 });
        }
        this.placed.set(key, k);
        // its true band, faint, so the gap reads
        for (let j = 0; j < n; j++) { const a = R.a0 + R.dir * swept * (j / (n - 1)), x = R.cx + Math.sin(a) * R.R, z = R.cz + Math.cos(a) * R.R; this.strand[j].set(x, this.gy(x, z) + 0.05, z); }
        RW.v = atk.band * 2; this.core.strip(this.strand.slice(0, n), lineW, 0.18, [1, 0.45, 0.2]);
        if (dust) { const x = m.x, z = m.z; this.heave(x, z, R.a + Math.PI / 2, 0, 0.6, 0.35, 1.2); this.puff(x, this.gy(x, z) + 0.3, z, 0, 0.5, 0, 1.2, 0.7); }
      }
    }
    if (!hump) this.humpK = Math.max(0, this.humpK - dt * 6);
    this.hump.visible = this.humpK > 0.02;
    if (!hump && this.hump.visible) this.hump.scale.multiplyScalar(0.9);
    // the domes of soil: up in a few frames, then torn into clods and falling away
    for (const D of this.dirt) {
      if (D.t > 1) { D.g.visible = false; continue; }
      const t = (D.t += dt), grow = 1 - Math.pow(1 - Math.min(1, t / 0.14), 3), size = D.R * (0.35 + 0.65 * grow), cut = Math.max(0, t - 0.18) / 0.7, fade = Math.max(0, Math.min(1, (1 - t) / 0.25));
      D.g.visible = fade > 0; D.g.scale.set(size, size * (1.25 - 0.35 * cut), size);
      for (const q of D.g.children) { const u = q.material.uniforms; u.uTime.value = this.time; u.uCut.value = 0.05 + 0.5 * cut * cut; u.uCool.value = 0.05 + 0.15 * Math.min(1, cut); u.uAlpha.value = fade; }
      D.g.children[2].material.uniforms.uAlpha.value = Math.max(0, 1 - t / 0.3);
    }
    // the roots: erupting out of the ground with a little overshoot, held, withering back down
    for (let i = 0; i < ARCHES; i++) {
      const A = this.arches[i];
      if (A.t > A.end + 0.6) { this.archIM.setMatrixAt(i, ZERO); continue; }
      A.t += dt;
      const up = Math.min(1, A.t / 0.22), grow = up < 1 ? 1 - (1 - up) ** 3 : 1 + 0.08 * Math.sin(Math.min(1, (A.t - 0.22) / 0.2) * Math.PI), wither = Math.max(0, Math.min(1, (A.t - A.end) / 0.6));
      const h = A.s * grow * (1 - wither), sway = 0.04 * Math.sin(this.time * 3 + i);
      _s.set(A.s * (1.1 + 0.5 * ((i * 7) % 5) / 4), 1.5 * h * (0.8 + 0.4 * ((i * 3) % 4) / 3), A.s * 1.2); _q.setFromEuler(_e.set(A.tilt + sway, A.a, 0));
      _a.set(A.x, this.gy(A.x, A.z) - 0.3 * (1 - grow) - 0.6 * wither, A.z);
      this.archIM.setMatrixAt(i, _m.compose(_a, _q, _s));
    }
    this.archIM.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < LUNGES; i++) {
      const L = this.lunges[i];
      if (L.t > L.end + 0.6) { this.lungeIM.setMatrixAt(i, ZERO); continue; }
      L.t += dt;
      if (L.t < 0) { this.lungeIM.setMatrixAt(i, ZERO); continue; }
      const out = Math.min(1, L.t / 0.16), reach = 1 - (1 - out) ** 3, squeeze = L.t > 0.3 && L.t < 0.7 ? 1 + 0.06 * Math.sin((L.t - 0.3) * 40) : 1, wither = Math.max(0, Math.min(1, (L.t - L.end) / 0.6));
      _s.set(1.6 * squeeze, 1.6 * (1 - wither), L.len * reach); _q.setFromEuler(_e.set(0, L.a, 0));
      _a.set(L.x, this.gy(L.x, L.z) - 0.8 * wither, L.z);
      this.lungeIM.setMatrixAt(i, _m.compose(_a, _q, _s));
    }
    this.lungeIM.instanceMatrix.needsUpdate = true;
    // coils of root round a held prey (the hero, rooted by the ring's crush)
    let wi = 0;
    const p = g.player;
    if (p && !p.dead && p.statuses?.root && this.lunges.some((L) => L.t >= 0 && L.t < L.end + 0.6)) {
      _s.set(1, 1.2 + 0.1 * Math.sin(this.time * 9), 1); _q.setFromEuler(_e.set(0, this.time * 0.6, 0)); _a.set(p.x, this.gy(p.x, p.z), p.z);
      this.wrapIM.setMatrixAt(wi++, _m.compose(_a, _q, _s));
    }
    for (; wi < WRAPS; wi++) this.wrapIM.setMatrixAt(wi, ZERO);
    this.wrapIM.instanceMatrix.needsUpdate = true;
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
    this.core.end(); this.glow.end();
  }
}
