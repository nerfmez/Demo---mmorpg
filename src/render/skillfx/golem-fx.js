// The crag golem's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first (a
// crag is not an animal: how rock behaves): a big impact sends an aftershock running out through the ground after it;
// a falling boulder bursts and its fragments skid on downhill; loose talus rubble lifts and grinds in a slide. Stone in
// the game's three toon steps, dust, its amber core light; danger zones in the warm warning colour at their true size.
// - Hammer fists (areas golem_slam, golem_aftershock): the slam's disc and the aftershock's band marked from the wind-up
//   (each filling to its own moment); the slam: a crater, rocks, dust, a shock ring; the aftershock: a ring of dust and
//   pebbles bursting up all round the band as it passes.
// - Boulder hurl (area boulder with its shard lanes; projectiles rock_shard): the boulder wrenched up out of the ground
//   into its fists, hurled in a high arc, spinning, onto its marked spot; the fragment lanes marked out from the spot
//   through the flight; it bursts into a crater and fragments that tumble along their lanes.
// - Rock orbit (core orbitStart, orbitHit, orbitFling; projectiles rock_shard): rubble lifts round it through the
//   wind-up, its ring marked; swings round it grinding dust off the ground; straight lanes out from each rock warn of
//   the fling; flung, they tumble away.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, conformPlane, place, placeV, flashMaterial, tintFlash, BILLBOARD_VS } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, taperW, taperGlowW, lightSprite, glowTexture } from './light-kit.js';
import { warnDisc } from './anime-kit.js';
import { rockGeometry, slabGeometry, craterMesh, STONE_VS, STONE_FS, DUST_FS } from './ground-kit.js';

const BIG = 10, CHIPS = 16, DISCS = 4, CRATERS = 3, BANDS = 2, LANES = 10, SLABS = 30, PUFFS = 36, FLASHES = 3, RAYS = 7, GLOWS = 6;
const AMBER = { edge: [1, 0.92, 0.7], glow: [1, 0.55, 0.15] };
const WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] }, SHOCK = { edge: [1, 0.95, 0.85], glow: [1, 0.6, 0.3] };
const DUSTC = new THREE.Color(0xe8dcc4);
// the aftershock's band: a crisp edge at both its rims, a plain fill growing out from the inner rim to its moment
const BAND_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BAND_FS = `varying vec2 vP; uniform float uIn, uK, uA; uniform vec3 uEdge, uFill;
  void main(){ float r = length(vP); if (r > 1.0 || r < uIn) discard;
    float lw = 0.025, f = uIn + (1.0 - uIn)*uK;
    vec3 c = uFill; float a = 0.1;
    if (r < f) a = 0.3;
    if (r < f && r > f - 0.02) { c = uEdge; a = 0.85; }
    if (r > 1.0 - lw || r < uIn + lw) { c = uEdge; a = 0.95; }
    gl_FragColor = vec4(c, a*uA); }`;
// the golem's own stone (its boulders and rubble): three toon steps in its dark grey-brown, the tones in uniforms
const GSTONE_FS = `varying vec3 vN; uniform float uA; uniform vec3 uHi, uMid, uLo;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49)));
    vec3 c = l > 0.55 ? uHi : (l > 0.1 ? uMid : uLo);
    gl_FragColor = vec4(c, uA); }`;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class GolemFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const stone = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    const rock = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uHi: { value: new THREE.Color(0xa49a8c) }, uMid: { value: new THREE.Color(0x766d62) }, uLo: { value: new THREE.Color(0x4c4540) } }, vertexShader: STONE_VS, fragmentShader: GSTONE_FS });
    // big rocks (its own dark stone): the boulder and the orbiting rubble and their flung pieces; chips: what impacts
    // throw up (ground stone)
    this.big = Array.from({ length: BIG }, (_, i) => { const m = new THREE.Mesh(rockGeometry(701 + i * 13), rock); m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
    this.chips = Array.from({ length: CHIPS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(911 + i * 7), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 0.1, spin: 0 }; });
    this.chipI = 0;
    this.discs = Array.from({ length: DISCS }, () => warnDisc(scene, 'fire'));
    this.craters = Array.from({ length: CRATERS }, (_, i) => ({ m: craterMesh(scene, 2.7 + i * 1.9), t: 9 }));
    this.craterI = 0;
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); plane.userData.shared = true;
    this.bands = Array.from({ length: BANDS }, () => {
      const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uIn: { value: 0.5 }, uK: { value: 0 }, uA: { value: 1 }, uEdge: { value: new THREE.Color(0xffb070) }, uFill: { value: new THREE.Color(0xff7a3a) } }, vertexShader: BAND_VS, fragmentShader: BAND_FS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); return m;
    });
    this.waves = Array.from({ length: 6 }, () => ({ t: 9, x: 0, z: 0, R0: 0, R1: 1, life: 0.35 }));
    this.waveI = 0;
    this.ring = Array.from({ length: 41 }, () => new THREE.Vector3());
    this.line = [new THREE.Vector3(), new THREE.Vector3()];
    // round 2 (owner: "the effects are poor"), Earth Heave's techniques in the golem's own colours: slabs of ground
    // heaved up and sinking, big billowing dust clouds, a ragged flash and amber rays out of its impacts (the amber of
    // its heart), its heart and the boulder glowing
    this.slabs = Array.from({ length: SLABS }, (_, i) => { const m = new THREE.Mesh(slabGeometry(41 + i * 17), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, x: 0, z: 0, out: 0, t: 9, h: 1, w: 0.4 }; });
    this.slabI = 0;
    const quad = new THREE.PlaneGeometry(1, 1); quad.userData.shared = true;
    this.puffs = Array.from({ length: PUFFS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 1 }; });
    this.puffI = 0;
    this.flashes = Array.from({ length: FLASHES }, (_, i) => { const m = new THREE.Mesh(quad, flashMaterial(3.1 + i * 2.2)); tintFlash(m.material, 'fire'); m.material.uniforms.uMid.value.set('#ffc070'); m.material.uniforms.uOut.value.set('#b0702a'); m.renderOrder = 9; m.visible = false; m.frustumCulled = false; scene.add(m); return { m, t: 9, x: 0, y: 0, z: 0, size: 3 }; });
    this.flashI = 0;
    this.rays = Array.from({ length: FLASHES }, () => ({ t: 9, x: 0, y: 0, z: 0, d: Array.from({ length: RAYS }, () => new THREE.Vector3()), len: Array(RAYS).fill(2) }));
    this.two = [new THREE.Vector3(), new THREE.Vector3()];
    const warm = glowTexture('fire');
    this.glows = Array.from({ length: GLOWS }, () => { const g = lightSprite(scene, warm, true, 10); g.material.color.setRGB(1, 0.6, 0.2); return g; });
    this.shards = new Map(); // projectile id -> rock mesh index (for its tumble)
    this.dustT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }

  chipsAt(x, z, n, sp, up = 4) {
    const y = this.gy(x, z);
    for (let i = 0; i < n; i++) {
      const q = this.chips[this.chipI++ % CHIPS], a = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.8);
      q.p.set(x + Math.sin(a) * 0.3, y + 0.2, z + Math.cos(a) * 0.3); q.v.set(Math.sin(a) * v, up * (0.6 + Math.random() * 0.7), Math.cos(a) * v);
      q.t = 0; q.size = 0.08 + Math.random() * 0.12; q.spin = (Math.random() - 0.5) * 14; q.m.visible = true;
    }
  }
  pit(x, z, R) {
    const C = this.craters[this.craterI++ % CRATERS], u = C.m.material.uniforms;
    u.uArc.value = 0; u.uBurn.value = 0; u.uGlow.value = 0;
    place(C.m, x, 0.05, z); C.m.scale.setScalar(R * 1.7 * 2); conformPlane(C.m); C.m.visible = true; C.t = 0;
  }
  dustRing(x, z, R, n) { const y = this.gy(x, z); for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; this.monster.call?.dust(x + Math.sin(a) * R, y + 0.15, z + Math.cos(a) * R, Math.sin(a) * 2.2, 0.6, Math.cos(a) * 2.2, 1, 0.55); } }
  /** A small chevron of warm light on the ground `r` m out from (x, z) along `a`, pointing outward. */
  chevron(x, z, a, r, size, alpha) {
    const cx = x + Math.sin(a) * r, cz = z + Math.cos(a) * r, y = this.gy(cx, cz) + 0.06, sx = Math.cos(a) * size, sz = -Math.sin(a) * size, fx = Math.sin(a) * size, fz = Math.cos(a) * size;
    this.chev ||= [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.chev[0].set(cx - fx * 0.6 + sx, y, cz - fz * 0.6 + sz); this.chev[1].set(cx + fx * 0.4, y, cz + fz * 0.4); this.chev[2].set(cx - fx * 0.6 - sx, y, cz - fz * 0.6 - sz);
    RW.v = 0.07; this.glow.strip(this.chev, lineGlowW, 0.35 * alpha, WARN.glow); this.core.strip(this.chev, lineW, alpha, WARN.edge);
  }
  /** A slab of ground heaved up at (x, z), tilted out along `out`, after `delay` s. */
  heave(x, z, out, delay, h, w) { Object.assign(this.slabs[this.slabI++ % SLABS], { x, z, out, t: -delay, h, w }); }
  ringOfSlabs(x, z, R, n, delay, h, step = 0) { const a0 = Math.random() * 6.283; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * 6.283 + (Math.random() - 0.5) * 0.25; this.heave(x + Math.sin(a) * R, z + Math.cos(a) * R, a, delay + i * step, h * (0.75 + Math.random() * 0.5), 0.32 + Math.random() * 0.14); } }
  puff(x, y, z, vx, vy, vz, size, life) { const q = this.puffs[this.puffI++ % PUFFS]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.life = life; q.size = size; q.m.material.uniforms.uSeed.value = Math.random() * 40; }
  cloud(x, z, R, n, size) { const y = this.gy(x, z); for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.5, sp = 1.2 + Math.random() * 1.6; this.puff(x + Math.sin(a) * R, y + 0.35, z + Math.cos(a) * R, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, Math.cos(a) * sp, size * (0.8 + Math.random() * 0.5), 0.9 + Math.random() * 0.4); } }
  bang(x, z, size) {
    const F = this.flashes[this.flashI], R = this.rays[this.flashI]; this.flashI = (this.flashI + 1) % FLASHES;
    const y = this.gy(x, z) + 0.7;
    Object.assign(F, { t: 0, x, y, z, size });
    R.t = 0; R.x = x; R.y = y; R.z = z;
    for (let j = 0; j < RAYS; j++) { const a = (j / RAYS) * 6.283 + Math.random() * 0.6, el = 0.9 + Math.random() * 0.5; R.d[j].set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); R.len[j] = size * (0.7 + Math.random() * 0.5); }
  }
  wave(x, z, R0, R1, life) { Object.assign(this.waves[this.waveI++ % this.waves.length], { t: 0, x, z, R0, R1, life }); }

  /** A marked area of the golem's going off (core burst); true when drawn here. */
  burst(e) {
    if (e.kind === 'golem_slam') {
      this.pit(e.x, e.z, e.radius * 0.8); this.chipsAt(e.x, e.z, 10, 3.5, 6); this.dustRing(e.x, e.z, 0.6, 10);
      this.wave(e.x, e.z, 0.3, e.radius, 0.3); this.wave(e.x, e.z, 0.3, e.radius + 0.4, 0.42);
      this.bang(e.x, e.z, 3.4);
      this.ringOfSlabs(e.x, e.z, e.radius * 0.85, 9, 0.02, 0.75);
      this.cloud(e.x, e.z, e.radius * 0.6, 8, 1.8);
      this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 0.12, e.z, e.radius, DUSTC, 0.35);
      this.monster.onShake?.(0.22, 0.2);
      return true;
    }
    if (e.kind === 'golem_aftershock') {
      // pebbles and dust bursting up all round the band as it passes
      const R = ((e.inner || 0) + e.radius) / 2;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 + Math.random() * 0.3; this.chipsAt(e.x + Math.sin(a) * R, e.z + Math.cos(a) * R, 1, 1.2, 3.5); }
      this.dustRing(e.x, e.z, R, 14);
      // the ground heaves all round the band, the slabs rising one after another round it
      this.ringOfSlabs(e.x, e.z, R, 14, 0, 0.6, 0.012);
      this.cloud(e.x, e.z, R, 10, 1.6);
      this.wave(e.x, e.z, e.inner || 0, e.radius, 0.35);
      this.monster.onShake?.(0.12, 0.14);
      return true;
    }
    if (e.kind === 'boulder') {
      this.pit(e.x, e.z, e.radius * 0.75); this.chipsAt(e.x, e.z, 10, 4, 6); this.dustRing(e.x, e.z, 0.5, 10);
      this.wave(e.x, e.z, 0.3, e.radius + 0.4, 0.3);
      this.bang(e.x, e.z, 3);
      this.ringOfSlabs(e.x, e.z, e.radius * 0.8, 8, 0, 0.6);
      this.cloud(e.x, e.z, e.radius * 0.5, 7, 1.7);
      this.monster.onShake?.(0.2, 0.18);
      return true;
    }
    return false;
  }
  /** A rock fragment striking something (core impact of rock_shard). */
  impact(e) { this.chipsAt(e.x, e.z, 4, 2.5, 3.5); this.cloud(e.x, e.z, 0.2, 3, 1.1); this.monster.onShake?.(0.06, 0.06); }

  /** The golem's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'crag_golem') return false;
    switch (e.type) {
      case 'orbitHit': this.chipsAt(e.x, e.z, 3, 2.5, 3); this.monster.onShake?.(0.06, 0.08); return true;
      case 'orbitFling': this.dustRing(e.x, e.z, e.ring, 12); this.cloud(e.x, e.z, e.ring, 8, 1.4); this.monster.onShake?.(0.12, 0.12); return true;
      case 'orbitStart': this.ringOfSlabs(e.x, e.z, e.ring, e.rocks * 2, 0, 0.45); this.cloud(e.x, e.z, e.ring, 6, 1.3); return true;
      case 'golemHurl': this.monster.onShake?.(0.06, 0.08); return true;
      case 'golemSlam': return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let bi = 0, di = 0, ni = 0;
    const dust = (this.dustT -= dt) <= 0;
    if (dust) this.dustT = 0.08;
    // the marked areas: the slam's disc, the aftershock's band, the boulder's landing and its fragment lanes
    for (const a of g.areas) {
      if (a.t > a.delay) continue;
      const src = g.monsterById?.(a.sourceId);
      if (src?.type !== 'crag_golem') continue;
      const k = Math.min(1, a.t / Math.max(0.01, a.delay));
      if ((a.kind === 'golem_slam' || a.kind === 'boulder') && di < DISCS) {
        const D = this.discs[di++], U = D.material.uniforms;
        U.uR.value = a.radius; U.uK.value = k; U.uOpen.value = Math.min(1, a.t / 0.15);
        place(D, a.x, 0.04, a.z); D.scale.setScalar(a.radius * 2 * 1.06); conformPlane(D); D.visible = true;
        if (a.shards) for (const ang of a.shards.angles) {
          // which way each fragment will fly: a small chevron just outside the landing's rim (round 3, owner: the long
          // lanes spoiled it)
          this.chevron(a.x, a.z, ang, a.radius + 0.35, 0.3 + 0.1 * k, 0.5 + 0.45 * k);
        }
      }
      if (a.kind === 'golem_aftershock' && bi < BANDS) {
        const B = this.bands[bi++], U = B.material.uniforms;
        U.uIn.value = (a.inner || 0) / a.radius; U.uK.value = k; U.uA.value = Math.min(1, a.t / 0.15);
        B.position.set(a.x, this.gy(a.x, a.z) + 0.05, a.z); B.scale.setScalar(a.radius); B.visible = true;
      }
    }
    for (let i = di; i < DISCS; i++) this.discs[i].visible = false;
    for (let i = bi; i < BANDS; i++) this.bands[i].visible = false;
    let gi = 0;
    // the boulder: wrenched up, raised overhead, then hurled in an arc onto its mark
    for (const m of g.monsters) {
      if (m.type !== 'crag_golem' || m.dead) continue;
      const w = m.windup, f = m.facing;
      // its amber heart burns brighter through every wind-up and while the rubble swings
      if ((m.state === 'windup' || m.orbit) && gi < GLOWS) {
        const k = m.orbit ? 1 : Math.min(1, m.stateT / w.total), G = this.glows[gi++];
        G.position.set(m.x + Math.sin(f) * 0.75, this.gy(m.x, m.z) + 1.7, m.z + Math.cos(f) * 0.75);
        G.scale.setScalar(0.8 + 1.4 * k); G.material.opacity = (0.3 + 0.6 * k) * (0.85 + 0.15 * Math.sin(this.time * 18)); G.visible = true;
      }
      if (m.state === 'windup' && w?.name === 'boulder_hurl' && ni < BIG) {
        const k = Math.min(1, m.stateT / w.total), R = this.big[ni++], up = Math.min(1, Math.max(0, (k - 0.3) / 0.45));
        const fx = m.x + Math.sin(f) * (1.3 - 0.9 * up), fz = m.z + Math.cos(f) * (1.3 - 0.9 * up);
        R.position.set(fx, this.gy(fx, fz) + 0.2 + 3.6 * up * up + (k < 0.3 ? -0.3 * (1 - k / 0.3) : 0), fz);
        R.scale.setScalar(0.75); R.rotation.set(k * 2, k, 0); R.visible = true;
        if (gi < GLOWS) { const G = this.glows[gi++]; G.position.copy(R.position); G.scale.setScalar(1.6 * up); G.material.opacity = 0.7 * up; G.visible = up > 0.05; }
        if (k < 0.35 && dust) this.puff(fx, this.gy(fx, fz) + 0.3, fz, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 1.1, 0.8);
        if (k < 0.35 && dust) { this.chipsAt(fx, fz, 1, 1.5, 2.5); this.monster.call?.dust(fx, this.gy(fx, fz) + 0.15, fz, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 0.9, 0.5); }
      }
      // the rubble round it: lifting through the wind-up, swinging round while it spins
      if ((m.state === 'windup' && w?.name === 'rock_orbit') || m.orbit) {
        const atk = m.def.attacks.rock_orbit, n = atk.rocks, lift = m.orbit ? 1 : Math.min(1, m.stateT / w.total);
        const y0 = this.gy(m.x, m.z);
        for (let i = 0; i < n && ni < BIG; i++) {
          const a = m.orbit ? m.orbit.rocks[i].a : f + (i / n) * Math.PI * 2, R = this.big[ni++];
          const x = m.x + Math.sin(a) * atk.ring, z = m.z + Math.cos(a) * atk.ring;
          R.position.set(x, y0 + 0.2 + 1.0 * lift + 0.15 * Math.sin(this.time * 4 + i), z); R.scale.setScalar(atk.rockRadius * 1.3); R.rotation.set(this.time * 2 + i, this.time + i, 0); R.visible = true;
          if (gi < GLOWS) { const G = this.glows[gi++]; G.position.copy(R.position); G.scale.setScalar(1.1 * lift); G.material.opacity = 0.5 * lift; G.visible = true; }
          // a swirl of dust dragged round behind each rock
          if (dust && m.orbit) this.puff(x, y0 + 0.4, z, -Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5, 1.2, 0.8);
          if (dust && (m.orbit || lift < 0.5)) this.monster.call?.dust(x, this.gy(x, z) + 0.12, z, (Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5, 0.8, 0.45);
          // the fling's lane out from each rock, warned through the last of the spin
          if (m.orbit && m.orbit.t > atk.spin - 0.7) {
            const kk = Math.min(1, (m.orbit.t - (atk.spin - 0.7)) / 0.7);
            this.chevron(m.x, m.z, a, atk.ring + atk.rockRadius + 0.35, 0.3, 0.4 + 0.55 * kk);
          }
        }
        // the ring it swings round, marked at the true band
        const yy = this.gy(m.x, m.z) + 0.06;
        for (const r of [atk.ring - atk.rockRadius, atk.ring + atk.rockRadius]) {
          for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(m.x + Math.sin(a) * r, yy, m.z + Math.cos(a) * r); }
          RW.v = 0.06; this.glow.strip(this.ring, lineGlowW, 0.3 * lift, WARN.glow); this.core.strip(this.ring, lineW, 0.8 * lift, WARN.edge);
        }
      }
    }
    // the boulder in flight (the area is marked; its landing is a.delay)
    for (const a of g.areas) {
      if (a.kind !== 'boulder' || a.t > a.delay || ni >= BIG) continue;
      const src = g.monsterById?.(a.sourceId), atk = src?.def.attacks[a.attack];
      if (!src || !atk) continue;
      const fl = a.t - (a.delay - atk.flight);
      if (fl < 0) continue;
      const u = Math.min(1, fl / atk.flight), R = this.big[ni++], sx = src.x, sz = src.z;
      R.position.set(sx + (a.x - sx) * u, this.gy(a.x, a.z) + (1 - u) * 3.8 + Math.sin(u * Math.PI) * 4, sz + (a.z - sz) * u);
      R.scale.setScalar(0.75); R.rotation.set(u * 9, u * 5, 0); R.visible = true;
      if (gi < GLOWS) { const G = this.glows[gi++]; G.position.copy(R.position); G.scale.setScalar(1.7); G.material.opacity = 0.65; G.visible = true; }
      // pebbles and dust shaken off it as it flies
      if (dust) { const q = this.chips[this.chipI++ % CHIPS]; q.p.copy(R.position); q.v.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2); q.t = 0; q.size = 0.07; q.spin = 6; q.m.visible = true; this.puff(R.position.x, R.position.y, R.position.z, 0, -0.3, 0, 0.8, 0.6); }
    }
    // flung rocks and fragments (core projectiles rock_shard): tumbling stones
    for (const pr of g.projectiles) {
      if (pr.kind !== 'rock_shard' || ni >= BIG) continue;
      const R = this.big[ni++], big = pr.attack === 'rock_orbit';
      R.position.set(pr.x, this.gy(pr.x, pr.z) + (big ? 1.0 : pr.radius * 0.9) + Math.abs(Math.sin(pr.travelled * 2.2)) * 0.25, pr.z);
      R.scale.setScalar(pr.radius * 1.3); R.rotation.set(pr.travelled * 3, pr.travelled * 1.7, 0); R.visible = true;
      if (dust && Math.random() < 0.6) this.monster.call?.dust(pr.x, this.gy(pr.x, pr.z) + 0.12, pr.z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.7, 0.45);
    }
    for (let i = ni; i < BIG; i++) this.big[i].visible = false;
    for (let i = gi; i < GLOWS; i++) this.glows[i].visible = false;
    // slabs: burst up with an overshoot, hold, sink back; dust off their feet as they rise
    for (const q of this.slabs) {
      if (q.t > 1.6) continue;
      const was = q.t; q.t += dt;
      if (q.t < 0) continue;
      if (was < 0) this.puff(q.x, this.gy(q.x, q.z) + 0.2, q.z, Math.sin(q.out) * 1.2, 0.4, Math.cos(q.out) * 1.2, 0.8, 0.7);
      const up = Math.min(1, q.t / 0.08), over = up < 1 ? up : 1 + 0.15 * Math.sin(Math.min(1, (q.t - 0.08) / 0.12) * Math.PI);
      const sink = Math.max(0, Math.min(1, (q.t - 0.6) / 0.4)), hgt = q.h * over * (1 - sink);
      q.m.visible = hgt > 0.02;
      if (!q.m.visible) { if (sink >= 1) q.t = 9; continue; }
      place(q.m, q.x, hgt * 0.55 - 0.25, q.z);
      q.m.scale.set(q.w, 0.5, q.w * 0.8); q.m.rotation.set(0, q.out, 0); q.m.rotateX(0.5 * Math.min(1, hgt / q.h));
    }
    // dust clouds: swelling, drifting, thinning
    const cam = this.monster.camera;
    for (const q of this.puffs) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.2 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; q.m.position.copy(q.p); q.m.quaternion.copy(cam.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
    // the ragged flash and the amber rays out of an impact
    for (let i = 0; i < FLASHES; i++) {
      const F = this.flashes[i], R = this.rays[i];
      if (F.t < 0.18) { F.t += dt; F.m.visible = F.t < 0.16; F.m.position.set(F.x, F.y, F.z); F.m.quaternion.copy(cam.quaternion); F.m.scale.setScalar(F.size * (F.t < 0.03 ? 0.5 + F.t / 0.06 : 1)); F.m.material.uniforms.uT.value = F.t / 0.16; } else F.m.visible = false;
      if (R.t < 0.34) {
        R.t += dt; const rk = Math.min(1, R.t / 0.34);
        for (let j = 0; j < RAYS; j++) {
          this.two[0].set(R.x, R.y, R.z).addScaledVector(R.d[j], R.len[j] * 0.15 * rk);
          this.two[1].set(R.x, R.y, R.z).addScaledVector(R.d[j], R.len[j] * (0.4 + 0.6 * Math.sqrt(rk)));
          RW.v = 0.16 * (1 - rk); this.glow.strip(this.two, taperGlowW, 1 - rk, AMBER.glow); this.core.strip(this.two, taperW, 1 - rk * rk, AMBER.edge);
        }
      }
    }
    // shock waves over the ground
    for (const W of this.waves) {
      if (W.t >= W.life) continue;
      W.t += dt;
      const u = Math.min(1, W.t / W.life), r = W.R0 + (W.R1 - W.R0) * (1 - (1 - u) * (1 - u)), yy = this.gy(W.x, W.z) + 0.08;
      for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(W.x + Math.sin(a) * r, yy, W.z + Math.cos(a) * r); }
      RW.v = 0.14 * (1 - u) + 0.03; this.glow.strip(this.ring, lineGlowW, 0.45 * (1 - u), SHOCK.glow); this.core.strip(this.ring, lineW, 0.85 * (1 - u), SHOCK.edge);
    }
    // chips: flung, falling, a bounce, shrinking away
    for (const q of this.chips) {
      if (q.t >= 1.3) continue;
      q.t += dt; q.v.y -= 18 * dt; q.p.addScaledVector(q.v, dt);
      const gy = this.gy(q.p.x, q.p.z) + q.size * 0.6;
      if (q.p.y < gy) { q.p.y = gy; q.v.multiplyScalar(0.35); q.v.y = Math.abs(q.v.y) * 0.5; }
      q.m.position.copy(q.p); q.m.rotation.x += q.spin * dt; q.m.rotation.z += q.spin * 0.7 * dt;
      q.m.scale.setScalar(q.size * (q.t > 0.9 ? Math.max(0, (1.3 - q.t) / 0.4) : 1));
      if (q.t >= 1.3) q.m.visible = false;
    }
    for (const C of this.craters) {
      if (C.t >= 3) continue;
      C.t += dt;
      C.m.material.uniforms.uA.value = Math.min(1, C.t / 0.05) * Math.max(0, Math.min(1, (3 - C.t) / 0.8));
      if (C.t >= 3) C.m.visible = false;
    }
    this.core.end(); this.glow.end();
  }
}
