// The ironhorn ram's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first:
// bighorn rams rear on their hind legs and drop into a horn clash heard across a valley, back off for a run-up and
// charge head down, hook sideways with the curl of their horns. Iron horns: they heat to a glow through each wind-up
// and glint just before the blow; where they strike, white-hot spark streaks spray and fall, shock waves of steel
// light run over the ground out to the true reach, the ground sinks into a crater and rocks are flung. Danger zones are
// the game's own warnings (vfx.js tells). Round 2 (owner: "the effects are a bit plain").
// - Rearing clash (core monsterSwing of rear_clash): the hot horns' glint; on the blow a steel crescent across the
//   cone, three fan-shaped shock waves running out to its reach, a fan-shaped pit, spark streaks, rocks, dust, a heavy
//   shake.
// - Run-up charge (core charge, clash): hooves throw dust and sparks as it paws; a bow wave of air rides ahead of its
//   horns as it runs, dust streaming off it; its clash: the biggest burst, round shock rings, a round pit, rocks.
// - Horn hook (core hornHook): a crescent swept round the flank, a shock wave out that way, sparks flung out.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, conformPlane, place } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, taperW, taperGlowW, lineW, lineGlowW, lightSprite, glowTexture, starTexture, drawSparks, spark } from './light-kit.js';
import { rockGeometry, craterMesh, craterFan, STONE_VS, STONE_FS } from './ground-kit.js';

const ARCS = 6, WAVES = 8, N = 21, ROCKS = 12, SPARKS = 140, CRATERS = 2;
const STEEL = { edge: [1, 0.97, 0.88], glow: [1, 0.62, 0.25] }, STAR = { core: [1, 1, 0.92], glow: [1, 0.6, 0.2] };
const HOT = { edge: [1, 0.95, 0.7], glow: [1, 0.45, 0.1] }, AIR = { edge: [1, 0.96, 0.86], glow: [0.95, 0.75, 0.45] };
const RING = new THREE.Color(0xffd8a0);
const _p = new THREE.Vector3(), _v = new THREE.Vector3();

export class RamFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    // crescents standing in the air, and shock waves running over the ground (a partial ring growing out)
    this.arcs = Array.from({ length: ARCS }, () => ({ t: 9, x: 0, y: 0, z: 0, a0: 0, a1: 0, R: 2, w: 0.3 }));
    this.arcI = 0;
    this.waves = Array.from({ length: WAVES }, () => ({ t: -9, x: 0, y: 0, z: 0, a: 0, half: 1, R: 2, life: 0.35 }));
    this.waveI = 0;
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    // spark streaks (light-kit), rocks, pits
    this.sparks = []; this.free = []; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const stone = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.rocks = Array.from({ length: ROCKS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(311 + i * 11), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 0.1, spin: 0 }; });
    this.rockI = 0;
    this.craters = Array.from({ length: CRATERS }, (_, i) => ({ m: craterMesh(scene, 5.1 + i * 2.3), t: 9 }));
    this.craterI = 0;
    // the hot horns: a glow on each, a glint before the blow
    const warm = glowTexture('fire'), star = starTexture('fire');
    this.horns = Array.from({ length: 2 }, () => { const g = lightSprite(scene, warm, true, 10); g.material.color.setRGB(1, 0.5, 0.15); return g; });
    this.glint = lightSprite(scene, star, true, 11); this.glint.material.color.setRGB(1, 0.95, 0.8);
    this.dustT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** White-hot spark streaks sprayed round `a` over `spread` rad. */
  spray(x, y, z, a, spread, n, sp) {
    for (let i = 0; i < n; i++) {
      const d = a + (Math.random() - 0.5) * spread, v = sp * (0.5 + Math.random());
      _p.set(x, y, z); _v.set(Math.sin(d) * v, 2 + Math.random() * 4, Math.cos(d) * v);
      spark(this.sparks, this.free, SPARKS, _p, _v, 0.35 + Math.random() * 0.3, 0.05 + Math.random() * 0.04, i % 3 ? HOT : STEEL);
    }
  }
  sweep(x, y, z, a0, a1, R, w) { Object.assign(this.arcs[this.arcI++ % ARCS], { t: 0, x, y, z, a0, a1, R, w }); }
  wave(x, z, a, half, R, delay, life) { Object.assign(this.waves[this.waveI++ % WAVES], { t: -delay, x, y: this.gy(x, z) + 0.08, z, a, half, R, life }); }
  rocksAt(x, z, a, spread, n, sp) {
    const y = this.gy(x, z);
    for (let i = 0; i < n; i++) {
      const q = this.rocks[this.rockI++ % ROCKS], d = a + (Math.random() - 0.5) * spread, v = sp * (0.5 + Math.random() * 0.8);
      q.p.set(x + Math.sin(d) * 0.3, y + 0.2, z + Math.cos(d) * 0.3); q.v.set(Math.sin(d) * v, 3 + Math.random() * 3.5, Math.cos(d) * v);
      q.t = 0; q.size = 0.07 + Math.random() * 0.09; q.spin = (Math.random() - 0.5) * 14; q.m.visible = true;
    }
  }
  pit(x, z, R, angle, arcDeg) {
    const C = this.craters[this.craterI++ % CRATERS], u = C.m.material.uniforms;
    if (arcDeg) craterFan(C.m, angle, arcDeg, 0.05); else u.uArc.value = 0;
    u.uBurn.value = 0; u.uGlow.value = 0;
    place(C.m, x, 0.05, z); C.m.scale.setScalar(R * 1.7 * 2); conformPlane(C.m); C.m.visible = true; C.t = 0;
  }
  dust(x, y, z, a, spread, n, sp, size = 0.8) {
    for (let i = 0; i < n; i++) { const d = a + (Math.random() - 0.5) * spread; this.monster.call?.dust(x, y, z, Math.sin(d) * sp * (0.6 + Math.random() * 0.6), 0.5, Math.cos(d) * sp * (0.6 + Math.random() * 0.6), size, 0.55); }
  }

  /** The ram's horn strike (core monsterSwing of rear_clash); true when drawn here. */
  swing(e) {
    if (e.type !== 'ironhorn_ram') return false;
    const y = this.gy(e.x, e.z), arcDeg = e.arc || 110, half = (arcDeg * Math.PI) / 360;
    const hx = e.x + Math.sin(e.angle) * 1.1, hz = e.z + Math.cos(e.angle) * 1.1;
    this.sweep(e.x, y + 0.55, e.z, e.angle - half, e.angle + half, e.range * 0.8, 0.36);
    this.sweep(e.x, y + 0.35, e.z, e.angle + half, e.angle - half, e.range * 0.6, 0.22);
    for (let i = 0; i < 3; i++) this.wave(e.x, e.z, e.angle, half, e.range + 0.4, i * 0.07, 0.32);
    this.pit(e.x, e.z, e.range * 0.75, e.angle, arcDeg);
    this.spray(hx, y + 0.5, hz, e.angle, 2.2, 30, 5);
    this.rocksAt(hx, hz, e.angle, 1.6, 6, 3.5);
    this.monster.burstStar?.(hx, y + 0.6, hz, 0.8, STAR, 0xffc070, 0xffffff);
    this.monster.call?.ring(hx, y + 0.15, hz, 1.4, RING, 0.3);
    this.dust(hx, y + 0.15, hz, e.angle, 2, 12, 3.5, 0.9);
    if (e.at) this.monster.burstStar?.(e.at[0], this.gy(e.at[0], e.at[1]) + 0.8, e.at[1], 0.5, STAR, 0xffc070, 0xffffff);
    this.monster.onShake?.(0.18, 0.16);
    return true;
  }

  /** The ram's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'ironhorn_ram') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'hornHook': {
        const half = ((e.arc || 140) * Math.PI) / 360, from = e.angle - e.side * half, to = e.angle + e.side * half;
        this.sweep(e.x, y + 0.6, e.z, from, to, e.range * 0.85, 0.32);
        this.sweep(e.x, y + 0.4, e.z, from, to, e.range * 0.6, 0.18);
        this.wave(e.x, e.z, e.angle, half * 0.8, e.range + 0.3, 0.03, 0.3);
        const out = e.angle + e.side * 0.6, sx = e.x + Math.sin(e.angle) * e.range * 0.6, sz = e.z + Math.cos(e.angle) * e.range * 0.6;
        this.spray(sx, y + 0.6, sz, out, 1.4, 20, 5);
        this.dust(sx, y + 0.12, sz, out, 1.4, 8, 3);
        this.monster.burstStar?.(sx, y + 0.7, sz, 0.5, STAR, 0xffc070, 0xffffff);
        this.monster.onShake?.(0.1, 0.1);
        return true;
      }
      case 'clash': {
        const cx = (e.x + e.tx) / 2, cz = (e.z + e.tz) / 2, cy = this.gy(cx, cz);
        this.spray(cx, cy + 0.7, cz, e.angle, 2.8, 40, 6);
        this.monster.burstStar?.(cx, cy + 0.8, cz, 1.1, STAR, 0xffc070, 0xffffff);
        this.monster.call?.ring(cx, cy + 0.8, cz, 1.8, RING, 0.35);
        this.sweep(e.x, cy + 0.7, e.z, e.angle - 1, e.angle + 1, 1.7, 0.4);
        for (let i = 0; i < 3; i++) this.wave(cx, cz, 0, Math.PI, 2.6, i * 0.08, 0.36);
        this.pit(cx, cz, 1.3, 0, 0);
        this.rocksAt(cx, cz, e.angle, 3, 8, 3.5);
        this.dust(cx, cy + 0.12, cz, e.angle, 3, 14, 3.6, 1);
        this.monster.onShake?.(0.24, 0.2);
        return true;
      }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const puff = (this.dustT -= dt) <= 0;
    if (puff) this.dustT = 0.07;
    let horn = null, hk = 0, glint = 0;
    for (const m of g.monsters) {
      if (m.type !== 'ironhorn_ram' || m.dead) continue;
      const y = this.gy(m.x, m.z), w = m.windup, k = w ? Math.min(1, m.stateT / w.total) : 0;
      // the horns heat through a wind-up, glinting just before the blow; hot while it charges
      if (!horn && ((m.state === 'windup' && w) || m.charge)) {
        horn = m; hk = m.charge ? 1 : k;
        glint = m.state === 'windup' ? Math.max(0, 1 - Math.abs(k - 0.9) / 0.1) : 0;
      }
      if (!puff) continue;
      // pawing: dust and sparks off its iron-shod hooves
      if (m.state === 'windup' && w?.name === 'run_charge' && k > 0.6 && Math.random() < 0.6) {
        const fx = m.x + Math.sin(m.facing) * 0.5, fz = m.z + Math.cos(m.facing) * 0.5;
        this.dust(fx, y + 0.1, fz, m.facing + Math.PI, 1.2, 2, 1.5, 0.6);
        if (Math.random() < 0.5) this.spray(fx, y + 0.1, fz, m.facing + Math.PI, 1.5, 3, 2);
      }
      if (m.backing) this.dust(m.x, y + 0.1, m.z, m.facing, 2, 1, 0.6, 0.5);
      if (m.charge && w?.name === 'run_charge') {
        // a churned plume of dust behind it, clods and the odd spark kicked up by its hooves
        this.dust(m.x - Math.sin(m.facing) * 0.6, y + 0.12, m.z - Math.cos(m.facing) * 0.6, m.facing + Math.PI, 1.6, 4, 2.8, 1.2);
        if (Math.random() < 0.35) this.rocksAt(m.x, m.z, m.facing + Math.PI, 1.5, 1, 2);
        if (Math.random() < 0.4) this.spray(m.x, y + 0.1, m.z, m.facing + Math.PI, 1.6, 2, 2.5);
      }
    }
    // the glow on each horn (about where they sit: either side of its head, raised when it rears)
    if (horn) {
      const rear = horn.windup?.name === 'rear_clash' && horn.state === 'windup' ? Math.min(1, (horn.stateT / horn.windup.total) / 0.55) : 0;
      const f = horn.facing, d = horn.r + 0.15 - 0.6 * rear, hy = this.gy(horn.x, horn.z) + 1.05 + 0.9 * rear;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, G = this.horns[i];
        G.position.set(horn.x + Math.sin(f) * d + Math.cos(f) * 0.3 * s, hy, horn.z + Math.cos(f) * d - Math.sin(f) * 0.3 * s);
        G.scale.setScalar(0.5 + 0.5 * hk); G.material.opacity = (0.25 + 0.6 * hk) * (0.85 + 0.15 * Math.sin(this.time * 20 + i)); G.visible = true;
      }
      this.glint.position.copy(this.horns[0].position).lerp(this.horns[1].position, 0.5); this.glint.position.y += 0.15;
      this.glint.scale.setScalar(1.6 * glint); this.glint.material.opacity = glint; this.glint.material.rotation = this.time * 2; this.glint.visible = glint > 0.02;
      // a bow wave of air pushed ahead of its horns as it runs
      if (horn.charge) {
        // two nested shells of air split by its horns, swept back along its sides, flickering
        const gy = this.gy(horn.x, horn.z);
        for (const [R, back, hgt, wv, al] of [[1.35, 0.15, 0.7, 0.2, 0.75], [1.9, 0.75, 0.55, 0.13, 0.45]]) {
          const ox = horn.x + Math.sin(f) * (horn.r + 0.35 - back), oz = horn.z + Math.cos(f) * (horn.r + 0.35 - back);
          for (let j = 0; j < N; j++) { const u = j / (N - 1), a = f + (u - 0.5) * 2.6, r = R * (1 - 0.35 * Math.abs(u - 0.5) * 2); this.pts[j].set(ox - Math.sin(f) * R * 0.75 + Math.sin(a) * r, gy + hgt + 0.25 * Math.sin(u * Math.PI), oz - Math.cos(f) * R * 0.75 + Math.cos(a) * r); }
          RW.v = wv * (0.85 + 0.15 * Math.sin(this.time * 30 + R)); this.glow.strip(this.pts, taperGlowW, al * 0.8, AIR.glow); this.core.strip(this.pts, taperW, al, AIR.edge);
        }
      }
    } else { for (const G of this.horns) G.visible = false; this.glint.visible = false; }
    // the crescents of steel light: swept across in a blink, then thinning away
    for (const A of this.arcs) {
      if (A.t >= 0.4) continue;
      A.t += dt;
      const grow = Math.min(1, A.t / 0.07), fade = A.t < 0.12 ? 1 : Math.max(0, 1 - (A.t - 0.12) / 0.28), head = A.a0 + (A.a1 - A.a0) * grow;
      for (let j = 0; j < N; j++) { const u = j / (N - 1), a = A.a0 + (head - A.a0) * u, r = A.R * (0.85 + 0.15 * Math.sin(u * Math.PI)); this.pts[j].set(A.x + Math.sin(a) * r, A.y + 0.15 * Math.sin(u * Math.PI), A.z + Math.cos(a) * r); }
      RW.v = A.w * (1 + 0.3 * (1 - fade)); this.glow.strip(this.pts, taperGlowW, 0.75 * fade, STEEL.glow); this.core.strip(this.pts, taperW, fade, STEEL.edge);
    }
    // shock waves over the ground: a partial ring running out to the reach, thinning as it goes
    for (const S of this.waves) {
      if (S.t >= S.life) continue;
      S.t += dt;
      if (S.t < 0) continue;
      const u = Math.min(1, S.t / S.life), r = S.R * (0.25 + 0.75 * (1 - (1 - u) * (1 - u))), fade = 1 - u;
      for (let j = 0; j < N; j++) { const v = j / (N - 1), a = S.a - S.half + 2 * S.half * v; this.pts[j].set(S.x + Math.sin(a) * r, S.y, S.z + Math.cos(a) * r); }
      RW.v = 0.12 * fade + 0.03; this.glow.strip(this.pts, lineGlowW, 0.5 * fade, STEEL.glow); this.core.strip(this.pts, lineW, 0.9 * fade, AIR.edge);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 14);
    // rocks: flung, falling, a bounce, then shrinking away
    for (const q of this.rocks) {
      if (q.t >= 1.4) continue;
      q.t += dt;
      q.v.y -= 18 * dt; q.p.addScaledVector(q.v, dt);
      const gy = this.gy(q.p.x, q.p.z) + q.size * 0.6;
      if (q.p.y < gy) { q.p.y = gy; q.v.multiplyScalar(0.35); q.v.y = Math.abs(q.v.y) * 0.5; }
      q.m.position.copy(q.p); q.m.rotation.x += q.spin * dt; q.m.rotation.z += q.spin * 0.7 * dt;
      q.m.scale.setScalar(q.size * (q.t > 1 ? Math.max(0, (1.4 - q.t) / 0.4) : 1));
      if (q.t >= 1.4) q.m.visible = false;
    }
    // the pits: in at once, fading after a while
    for (const C of this.craters) {
      if (C.t >= 3) continue;
      C.t += dt;
      C.m.material.uniforms.uA.value = Math.min(1, C.t / 0.05) * Math.max(0, Math.min(1, (3 - C.t) / 0.8));
      if (C.t >= 3) C.m.visible = false;
    }
    this.core.end(); this.glow.end();
  }
}
