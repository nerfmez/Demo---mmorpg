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
import { Ribbon, conformPlane, place } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW } from './light-kit.js';
import { warnDisc } from './anime-kit.js';
import { rockGeometry, craterMesh, STONE_VS, STONE_FS } from './ground-kit.js';

const BIG = 10, CHIPS = 16, DISCS = 4, CRATERS = 3, BANDS = 2, LANES = 10;
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
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class GolemFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const stone = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    // big rocks: the boulder and the orbiting rubble and their flung pieces; chips: what impacts throw up
    this.big = Array.from({ length: BIG }, (_, i) => { const m = new THREE.Mesh(rockGeometry(701 + i * 13), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
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
  wave(x, z, R0, R1, life) { Object.assign(this.waves[this.waveI++ % this.waves.length], { t: 0, x, z, R0, R1, life }); }

  /** A marked area of the golem's going off (core burst); true when drawn here. */
  burst(e) {
    if (e.kind === 'golem_slam') {
      this.pit(e.x, e.z, e.radius * 0.8); this.chipsAt(e.x, e.z, 8, 3.5, 5); this.dustRing(e.x, e.z, 0.6, 12);
      this.wave(e.x, e.z, 0.3, e.radius, 0.3);
      this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 0.12, e.z, e.radius, DUSTC, 0.35);
      this.monster.onShake?.(0.22, 0.2);
      return true;
    }
    if (e.kind === 'golem_aftershock') {
      // pebbles and dust bursting up all round the band as it passes
      const R = ((e.inner || 0) + e.radius) / 2;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 + Math.random() * 0.3; this.chipsAt(e.x + Math.sin(a) * R, e.z + Math.cos(a) * R, 1, 1.2, 3.5); }
      this.dustRing(e.x, e.z, R, 18);
      this.wave(e.x, e.z, e.inner || 0, e.radius, 0.35);
      this.monster.onShake?.(0.12, 0.14);
      return true;
    }
    if (e.kind === 'boulder') {
      this.pit(e.x, e.z, e.radius * 0.75); this.chipsAt(e.x, e.z, 10, 4, 5); this.dustRing(e.x, e.z, 0.5, 14);
      this.wave(e.x, e.z, 0.3, e.radius + 0.4, 0.3);
      this.monster.onShake?.(0.2, 0.18);
      return true;
    }
    return false;
  }
  /** A rock fragment striking something (core impact of rock_shard). */
  impact(e) { this.chipsAt(e.x, e.z, 3, 2, 3); this.monster.call?.dust(e.x, this.gy(e.x, e.z) + 0.3, e.z, 0, 0.5, 0, 0.9, 0.5); }

  /** The golem's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'crag_golem') return false;
    switch (e.type) {
      case 'orbitHit': this.chipsAt(e.x, e.z, 3, 2.5, 3); this.monster.onShake?.(0.06, 0.08); return true;
      case 'orbitFling': this.dustRing(e.x, e.z, e.ring, 12); this.monster.onShake?.(0.1, 0.1); return true;
      case 'golemHurl': this.monster.onShake?.(0.06, 0.08); return true;
      case 'golemSlam': case 'orbitStart': return true;
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
          // the fragment lanes, from the landing's rim out to their reach
          const y = this.gy(a.x, a.z) + 0.06, r0 = a.radius * 0.6, r1 = a.radius + a.shards.range * 0.85;
          this.line[0].set(a.x + Math.sin(ang) * r0, y, a.z + Math.cos(ang) * r0); this.line[1].set(a.x + Math.sin(ang) * r1, y, a.z + Math.cos(ang) * r1);
          RW.v = a.shards.radius * 2 * (0.4 + 0.6 * k); this.glow.strip(this.line, lineGlowW, 0.15, WARN.glow); this.core.strip(this.line, lineW, 0.35 + 0.3 * k, WARN.edge);
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
    // the boulder: wrenched up, raised overhead, then hurled in an arc onto its mark
    for (const m of g.monsters) {
      if (m.type !== 'crag_golem' || m.dead) continue;
      const w = m.windup, f = m.facing;
      if (m.state === 'windup' && w?.name === 'boulder_hurl' && ni < BIG) {
        const k = Math.min(1, m.stateT / w.total), R = this.big[ni++], up = Math.min(1, Math.max(0, (k - 0.3) / 0.45));
        const fx = m.x + Math.sin(f) * (1.3 - 0.9 * up), fz = m.z + Math.cos(f) * (1.3 - 0.9 * up);
        R.position.set(fx, this.gy(fx, fz) + 0.2 + 3.6 * up * up + (k < 0.3 ? -0.3 * (1 - k / 0.3) : 0), fz);
        R.scale.setScalar(0.75); R.rotation.set(k * 2, k, 0); R.visible = true;
        if (k < 0.35 && dust) { this.chipsAt(fx, fz, 1, 1.5, 2.5); this.monster.call?.dust(fx, this.gy(fx, fz) + 0.15, fz, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, 0.9, 0.5); }
      }
      // the rubble round it: lifting through the wind-up, swinging round while it spins
      if ((m.state === 'windup' && w?.name === 'rock_orbit') || m.orbit) {
        const atk = m.def.attacks.rock_orbit, n = atk.rocks, lift = m.orbit ? 1 : Math.min(1, m.stateT / w.total);
        const y0 = this.gy(m.x, m.z);
        for (let i = 0; i < n && ni < BIG; i++) {
          const a = m.orbit ? m.orbit.rocks[i].a : f + (i / n) * Math.PI * 2, R = this.big[ni++];
          const x = m.x + Math.sin(a) * atk.ring, z = m.z + Math.cos(a) * atk.ring;
          R.position.set(x, y0 + 0.2 + 1.0 * lift + 0.15 * Math.sin(this.time * 4 + i), z); R.scale.setScalar(atk.rockRadius * 1.1); R.rotation.set(this.time * 2 + i, this.time + i, 0); R.visible = true;
          if (dust && (m.orbit || lift < 0.5)) this.monster.call?.dust(x, this.gy(x, z) + 0.12, z, (Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5, 0.8, 0.45);
          // the fling's lane out from each rock, warned through the last of the spin
          if (m.orbit && m.orbit.t > atk.spin - 0.7) {
            const kk = Math.min(1, (m.orbit.t - (atk.spin - 0.7)) / 0.7), yy = this.gy(x, z) + 0.06;
            this.line[0].set(x, yy, z); this.line[1].set(x + Math.sin(a) * atk.flingRange * kk, yy, z + Math.cos(a) * atk.flingRange * kk);
            RW.v = atk.rockRadius * 2; this.glow.strip(this.line, lineGlowW, 0.15, WARN.glow); this.core.strip(this.line, lineW, 0.45, WARN.edge);
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
    }
    // flung rocks and fragments (core projectiles rock_shard): tumbling stones
    for (const pr of g.projectiles) {
      if (pr.kind !== 'rock_shard' || ni >= BIG) continue;
      const R = this.big[ni++], big = pr.attack === 'rock_orbit';
      R.position.set(pr.x, this.gy(pr.x, pr.z) + (big ? 1.0 : pr.radius * 0.9) + Math.abs(Math.sin(pr.travelled * 2.2)) * 0.25, pr.z);
      R.scale.setScalar(pr.radius * (big ? 1.1 : 0.9)); R.rotation.set(pr.travelled * 3, pr.travelled * 1.7, 0); R.visible = true;
      if (dust && Math.random() < 0.6) this.monster.call?.dust(pr.x, this.gy(pr.x, pr.z) + 0.12, pr.z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.7, 0.45);
    }
    for (let i = ni; i < BIG; i++) this.big[i].visible = false;
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
