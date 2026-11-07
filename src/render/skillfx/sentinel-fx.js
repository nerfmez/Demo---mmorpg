// The rune sentinel's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first:
// a sentry holds a perimeter and sweeps a searchlight over the ground; a ward is a circle of runes that seals what
// stands inside it; its own ring of rune-cut shards is its weapon. Cold rune light (cyan, white cores); danger zones in
// the warm warning colour at their true size.
// - Shard volley (core shardLaunch, projectiles rune_shard): each shard flares as it leaves the ring and flies as a
//   glowing blade of stone with a short light wake; a cyan star and sparks where it strikes, and a rune letter
//   that pops up glowing and drifts away.
// - Rune seal (area rune_seal): the circle marked round the hero with a plain fill growing to its close; rune
//   letters round it light one after another like a clock, each rising off the ground as it lights and floating;
//   in the last moment they rush in to the middle and it closes in a flash across the whole circle (round 3, owner:
//   no magic circles, no pillars of light - "you can't tell what it is"); whoever it holds has the runes circling
//   them while they are held.
// - Searchlight (core searchOn, searchStrike, searchOff): a cone of pale light laid on the ground from its eye,
//   following the hero; round the hero rune letters appear one by one as they are held in it; when all are there,
//   a rune bolt comes down onto them (Chain Spark's angular bolt), a star, a ring, sparks.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, skyAbove } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, tailW, tailGlowW, lightSprite, glowTexture } from './light-kit.js';
import { zig, Rng, CRACKLE_FS, BOLT_GLOW_FS, rewindPts } from './chain-fx.js';

const SHARDS = 12, HIST = 6, POPS = 8, BOLTS = 3, MARKS = 6;
const RUNE = { edge: [0.85, 1, 1], glow: [0.25, 0.85, 1] }, WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const LIT = { edge: [0.45, 0.95, 1], glow: [0.2, 0.75, 1] }, STAR = { core: [1, 1, 1], glow: [0.35, 0.9, 1] }, RING = new THREE.Color(0x9ff0ff), DIM = { edge: [0.55, 0.6, 0.6], glow: [0.2, 0.3, 0.3] };
// rune letters (after the elder futhark; strokes in a unit box, x right, y up), drawn facing the camera
const RUNES = [
  [[[0, -0.5], [0, 0.5]], [[0, 0.05], [0.32, 0.38]], [[0, -0.2], [0.32, 0.12]]],
  [[[0, -0.5], [0, 0.5], [0.3, 0.25], [0, 0], [0.3, -0.5]]],
  [[[0, -0.5], [0, 0.5]], [[-0.32, 0.48], [0, 0.12], [0.32, 0.48]]],
  [[[0, -0.5], [0, 0.5]], [[-0.3, 0.2], [0, 0.5], [0.3, 0.2]]],
  [[[0, -0.5], [0, 0.5]], [[0, 0.3], [0.3, 0], [0, -0.3]]],
  [[[0, 0.5], [0.3, 0], [0, -0.5], [-0.3, 0], [0, 0.5]]],
  [[[0.25, 0.5], [-0.2, 0.12], [0.2, -0.12], [-0.25, -0.5]]],
  [[[-0.3, 0.5], [-0.3, -0.5], [0.3, 0.5], [0.3, -0.5], [-0.3, 0.5]]],
];
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3();
const ease = (x) => x * x * (3 - 2 * x);
const R = new Rng(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const bpts = [], bws = [];
let bw = 0, bwa = null;
const endK = (x) => Math.min(1, x * 5, (1 - x) * 5);
const boltCoreW = (x, k) => bw * bwa[k] * endK(x), boltGlowW = (x, k) => bw * 2.6 * (0.5 + 0.5 * bwa[k]) * Math.max(0.3, endK(x));
// the searchlight's pool of light: brightest along its middle, soft at its sides, fading toward its far end
const CONE_VS = `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const CONE_FS = `varying vec2 vU; uniform float uA, uHalf; uniform vec3 uC;
  void main(){ vec2 p = vU*2.0 - 1.0; float r = length(p); float a = atan(p.x, p.y);
    float side = 1.0 - smoothstep(uHalf*0.55, uHalf, abs(a)), edge = smoothstep(uHalf*0.8, uHalf, abs(a))*(1.0 - smoothstep(uHalf, uHalf*1.05, abs(a)));
    float far = 1.0 - smoothstep(0.75, 1.0, r);
    float k = (0.35*side + 0.6*edge)*far*smoothstep(0.03, 0.12, r);
    if (k < 0.01) discard;
    gl_FragColor = vec4(uC*k*uA, 1.0); }`;

export class SentinelFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1200, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    this.boltCore = new Ribbon(scene, monster.camera, 600, CRACKLE_FS, THREE.NormalBlending);
    this.boltGlow = new Ribbon(scene, monster.camera, 600, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8; this.boltCore.mesh.renderOrder = 11; this.boltGlow.mesh.renderOrder = 10;
    // the flung shards: a rune-cut blade of stone, glowing
    const geo = new THREE.OctahedronGeometry(1).scale(0.35, 0.35, 1); geo.userData.shared = true;
    const glow = glowTexture('lightning');
    this.shards = Array.from({ length: SHARDS }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbff6ff, toneMapped: false })); m.visible = false; m.frustumCulled = false; scene.add(m);
      const h = lightSprite(scene, glow, true, 10); h.material.color.setRGB(0.3, 0.85, 1);
      return { m, h, id: -1, pts: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0 };
    });
    // the seal's circle (fill) and its rune letters
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); disc.userData.shared = true;
    this.fills = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.2, depthWrite: false })); m.visible = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); return m; });
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    this.gp = Array.from({ length: 6 }, (_, n) => Array.from({ length: n }, () => new THREE.Vector3()));
    // the whole circle flashing as it closes
    this.flashes = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x8fefff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); return { m, t: 9 }; });
    this.flashI = 0;
    // rune letters popping up where a shard strikes
    this.pops = Array.from({ length: POPS }, () => ({ t: 9, x: 0, y: 0, z: 0, id: 0 }));
    this.popI = 0;
    this.cage = { t: 9, x: 0, z: 0, dur: 1 };
    // the searchlight's cone (built on first use with its arc)
    this.cone = null;
    this.eye = lightSprite(scene, glow, true, 11); this.eye.material.color.setRGB(0.6, 0.95, 1);
    this.bolts = Array.from({ length: BOLTS }, () => ({ t: 9, x: 0, y: 0, z: 0, top: new THREE.Vector3(), seed: 0 }));
    this.boltI = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  /** One rune letter facing the camera, centred on (x, y, z), s tall. */
  rune(id, x, y, z, s, al, look, ga) {
    for (const st of RUNES[id % RUNES.length]) {
      const pts = this.gp[st.length];
      for (let j = 0; j < st.length; j++) { const u = st[j][0] * s, v = st[j][1] * s; pts[j].set(x + _cr.x * u + _cu.x * v, y + _cr.y * u + _cu.y * v, z + _cr.z * u + _cu.z * v); }
      if (ga > 0) this.glow.strip(pts, lineGlowW, ga, look.glow);
      this.core.strip(pts, lineW, al, look.edge);
    }
  }
  sparks(x, y, z, n) { if (this.fx) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 3; this.fx.add(x, y, z, Math.sin(a) * v, 1 + Math.random() * 2.5, Math.cos(a) * v, { color: i % 3 ? 0x7fe3ee : 0xffffff, size: 0.12, sizeEnd: 0.02, life: 0.45, drag: 2 }); } }

  /** A rune shard striking (core impact of rune_shard). */
  impact(e) { const y = this.gy(e.x, e.z) + 1.2; this.monster.burstStar?.(e.x, y, e.z, 0.6, STAR, 0x9ff0ff, 0xffffff); this.monster.call?.ring(e.x, y - 0.4, e.z, 0.9, RING, 0.3); this.sparks(e.x, y, e.z, 12); Object.assign(this.pops[this.popI++ % POPS], { t: 0, x: e.x, y: y + 0.3, z: e.z, id: Math.floor(Math.random() * RUNES.length) }); this.monster.onShake?.(0.05, 0.05); }
  /** The rune seal closing (core burst of rune_seal). */
  burst(e) {
    if (e.kind !== 'rune_seal') return false;
    const y = this.gy(e.x, e.z);
    const F = this.flashes[this.flashI++ % this.flashes.length]; F.t = 0; F.m.position.set(e.x, y + 0.06, e.z); F.m.scale.setScalar(e.radius); F.m.visible = true;
    this.sparks(e.x, y + 1, e.z, 10);
    this.monster.call?.ring(e.x, y + 0.1, e.z, e.radius, RING, 0.4);
    this.monster.burstStar?.(e.x, y + 1, e.z, 0.7, STAR, 0x9ff0ff, 0xffffff);
    Object.assign(this.cage, { t: 0, x: e.x, z: e.z, dur: 1.6 });
    this.monster.onShake?.(0.1, 0.1);
    return true;
  }

  /** The sentinel's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'rune_sentinel') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'shardLaunch': this.monster.burstStar?.(e.x, y + 1.4, e.z, 0.3, STAR, 0x9ff0ff, 0xffffff); return true;
      case 'searchOn': this.monster.burstStar?.(e.x + Math.sin(e.angle) * 0.4, y + 2.3, e.z + Math.cos(e.angle) * 0.4, 0.5, STAR, 0x9ff0ff, 0xffffff); return true;
      case 'searchOff': return true;
      case 'searchStrike': {
        const B = this.bolts[this.boltI++ % BOLTS];
        B.t = 0; B.x = e.x; B.y = y; B.z = e.z; B.seed = Math.floor(Math.random() * 1e4);
        skyAbove(this.monster.camera, e.x, e.z, 11, (Math.random() - 0.5) * 0.2, B.top);
        this.monster.burstStar?.(e.x, y + 0.7, e.z, 0.7, STAR, 0x9ff0ff, 0xffffff);
        this.monster.call?.ring(e.x, y + 0.1, e.z, 1.3, RING, 0.35);
        this.sparks(e.x, y + 0.6, e.z, 14);
        this.monster.onShake?.(0.1, 0.1);
        return true;
      }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin(); this.boltCore.begin(); this.boltGlow.begin();
    rewindPts();
    const ce = this.monster.camera.matrixWorld.elements; _cr.set(ce[0], ce[1], ce[2]); _cu.set(ce[4], ce[5], ce[6]);
    // flung shards (core projectiles rune_shard)
    for (const S of this.shards) S.seen = false;
    for (const pr of g.projectiles) {
      if (pr.kind !== 'rune_shard') continue;
      let S = this.shards.find((q) => q.id === pr.id);
      if (!S) { S = this.shards.find((q) => q.id === -1); if (!S) continue; S.id = pr.id; S.n = 0; }
      S.seen = true;
      const y = this.gy(pr.x, pr.z) + 1.3, a = Math.atan2(pr.vx, pr.vz);
      S.m.position.set(pr.x, y, pr.z); S.m.rotation.set(0, a, this.time * 9); S.m.scale.setScalar(0.5); S.m.visible = true;
      S.h.position.set(pr.x, y, pr.z); S.h.scale.setScalar(1.4); S.h.material.opacity = 0.85; S.h.visible = true;
      if (S.n === 0) for (const q of S.pts) q.set(pr.x, y, pr.z);
      for (let j = 0; j < HIST - 1; j++) S.pts[j].copy(S.pts[j + 1]);
      S.pts[HIST - 1].set(pr.x, y, pr.z); S.n++;
      RW.v = 0.3; this.glow.strip(S.pts, tailGlowW, 0.75, RUNE.glow); this.core.strip(S.pts, tailW, 0.7, RUNE.edge);
    }
    for (const S of this.shards) if (!S.seen) { S.id = -1; S.m.visible = false; S.h.visible = false; }
    // the seal: its circle and a plain fill growing to its close
    let fi = 0;
    for (const a of g.areas) {
      if (a.kind !== 'rune_seal' || a.t > a.delay || fi >= this.fills.length) continue;
      const src = g.monsterById?.(a.sourceId), atk = src?.def.attacks[a.attack], k = Math.min(1, a.t / Math.max(0.01, a.delay)), y = this.gy(a.x, a.z) + 0.05;
      const F = this.fills[fi++]; F.position.set(a.x, y, a.z); F.scale.setScalar(a.radius * (0.15 + 0.85 * k)); F.material.opacity = 0.28; F.visible = true;
      for (let j = 0; j < this.ring.length; j++) { const an = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(a.x + Math.sin(an) * a.radius, y + 0.01, a.z + Math.cos(an) * a.radius); }
      RW.v = 0.08; this.glow.strip(this.ring, lineGlowW, 0.4, WARN.glow); this.core.strip(this.ring, lineW, 0.9, WARN.edge);
      // rune letters round it, lighting one after another like a clock and rising off the ground as they light;
      // in the last moment they rush in to the middle
      const n = atk?.glyphs || 8, lit = k * n, c = ease(Math.max(0, Math.min(1, (a.t - (a.delay - 0.22)) / 0.22))), gy0 = this.gy(a.x, a.z);
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2, rr = (a.radius - 0.35) * (1 - c), on = ease(Math.max(0, Math.min(1, lit - i)));
        const gx = a.x + Math.sin(an) * rr, gz = a.z + Math.cos(an) * rr, h = 0.32 + 0.6 * on + 0.06 * on * Math.sin(this.time * 3 + i * 1.7) + 0.4 * c;
        RW.v = 0.085 + 0.02 * on;
        this.rune(i, gx, gy0 + h, gz, 0.75 * (1 - 0.35 * c), on > 0 ? 0.55 + 0.45 * on : 0.55, on > 0 ? LIT : DIM, 0.9 * on);
      }
    }
    for (let i = fi; i < this.fills.length; i++) this.fills[i].visible = false;
    // the whole circle flashing as it closes
    for (const F of this.flashes) {
      if (F.t >= 0.4) { F.m.visible = false; continue; }
      F.t += dt; F.m.material.opacity = 0.55 * Math.max(0, 1 - F.t / 0.4);
    }
    // rune letters popping up where a shard struck
    for (const P of this.pops) {
      if (P.t >= 0.55) continue;
      P.t += dt;
      const u = P.t / 0.55, fade = Math.min(1, P.t / 0.05) * (1 - u);
      RW.v = 0.075; this.rune(P.id, P.x, P.y + 0.6 * ease(Math.min(1, u * 1.5)), P.z, 0.6 * (0.7 + 0.3 * Math.min(1, u * 4)), fade, LIT, 0.9 * fade);
    }
    // the runes circling whoever it holds (the hero, while still held)
    const p = g.player;
    if (this.cage.t < this.cage.dur) {
      this.cage.t += dt;
      if (p && !p.dead && p.statuses?.root && Math.hypot(p.x - this.cage.x, p.z - this.cage.z) < 3) {
        const y = this.gy(p.x, p.z), fade = Math.min(1, this.cage.t / 0.1) * Math.min(1, (this.cage.dur - this.cage.t) / 0.25);
        for (let i = 0; i < 4; i++) {
          const an = (i / 4) * Math.PI * 2 + this.time * 1.6;
          RW.v = 0.06; this.rune(i * 2 + 1, p.x + Math.sin(an) * 0.75, y + 0.9 + 0.12 * Math.sin(this.time * 4 + i), p.z + Math.cos(an) * 0.75, 0.42, 0.9 * fade, LIT, 0.7 * fade);
        }
      }
    }
    // the searchlight: a pool of light from its eye, following the hero; a ring round the hero filling as it is held
    let lit = null;
    for (const m of g.monsters) if (m.type === 'rune_sentinel' && !m.dead && m.search) { lit = m; break; }
    if (lit) {
      const atk = lit.def.attacks[lit.search.name], half = (atk.arc * Math.PI) / 360;
      if (!this.cone) {
        const geo = new THREE.CircleGeometry(1, 24, -Math.PI / 2 - half * 1.05, half * 2.1).rotateX(-Math.PI / 2);
        // its uv: mapped so the shader reads the angle off the cone's middle (+Z) and the distance from its apex
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getZ(i) * 0.5 + 0.5);
        this.cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uHalf: { value: half }, uC: { value: new THREE.Color(0xbff6ff) } }, vertexShader: CONE_VS, fragmentShader: CONE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.cone.renderOrder = 3; this.cone.frustumCulled = false; this.scene.add(this.cone);
      }
      const k = Math.min(1, lit.search.t / 0.25);
      this.cone.position.set(lit.x, this.gy(lit.x, lit.z) + 0.06, lit.z); this.cone.rotation.set(0, lit.search.angle, 0); this.cone.scale.setScalar(atk.range);
      this.cone.material.uniforms.uA.value = k * (0.85 + 0.15 * Math.sin(this.time * 9)); this.cone.visible = true;
      const ey = this.gy(lit.x, lit.z) + 2.25; this.eye.position.set(lit.x + Math.sin(lit.search.angle) * 0.3, ey, lit.z + Math.cos(lit.search.angle) * 0.3); this.eye.scale.setScalar(0.9); this.eye.material.opacity = 0.9; this.eye.visible = true;
      // the hero's ring of being spotted
      const sp = lit.search.heroSpot || 0;
      if (p && !p.dead && sp > 0.02) {
        const y = this.gy(p.x, p.z), shown = sp * MARKS;
        for (let i = 0; i < MARKS; i++) {
          const on = Math.max(0, Math.min(1, (shown - i) * 3)); if (on <= 0) break;
          const an = (i / MARKS) * Math.PI * 2;
          RW.v = 0.08; this.rune(i + 2, p.x + Math.sin(an) * 1.0, y + 0.55 + 0.3 * on, p.z + Math.cos(an) * 1.0, 0.6 * (0.6 + 0.4 * on), on, LIT, on);
        }
      }
    } else { if (this.cone) this.cone.visible = false; this.eye.visible = false; }
    // the rune bolts
    for (const B of this.bolts) {
      if (B.t >= 0.28) continue;
      B.t += dt;
      const fade = B.t < 0.12 ? 1 : Math.max(0, 1 - (B.t - 0.12) / 0.16);
      _a.copy(B.top); _b.set(B.x, B.y + 0.05, B.z);
      zig(_a, _b, R, B.seed + Math.floor(this.time * 15), 0.07, 9, bpts, bws); bw = 0.22; bwa = bws;
      this.boltGlow.strip(bpts, boltGlowW, fade * 0.8, RUNE.glow); this.boltCore.strip(bpts, boltCoreW, fade, RUNE.edge);
    }
    this.core.end(); this.glow.end(); this.boltCore.end(); this.boltGlow.end();
  }
}
