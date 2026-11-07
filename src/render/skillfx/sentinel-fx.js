// The rune sentinel's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first:
// a sentry holds a perimeter and sweeps a searchlight over the ground; a ward is a circle of runes that seals what
// stands inside it; its own ring of rune-cut shards is its weapon. Cold rune light (cyan, white cores); danger zones in
// the warm warning colour at their true size.
// - Shard volley (core shardLaunch, projectiles rune_shard): each shard flares as it leaves the ring and flies as a
//   glowing blade of stone with a short light wake; a cyan star and sparks where it strikes.
// - Rune seal (area rune_seal): the circle marked round the hero with a plain fill growing to its close; rune glyphs
//   round it light one after another like a clock; it closes in a flash, pillars of rune light standing up from every
//   glyph; a cage of light bars round whoever it holds while they are held.
// - Searchlight (core searchOn, searchStrike, searchOff): a cone of pale light laid on the ground from its eye,
//   following the hero; round the hero a ring fills as they are held in it; when it fills, a rune bolt comes down onto
//   them (Chain Spark's angular bolt), a star, a ring, sparks.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, skyAbove } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, tailW, tailGlowW, lightSprite, glowTexture, drawSparks, spark } from './light-kit.js';
import { zig, Rng, CRACKLE_FS, BOLT_GLOW_FS, rewindPts } from './chain-fx.js';

const SHARDS = 12, HIST = 6, GLYPHS = 12, PILLARS = 12, BOLTS = 3;
const RUNE = { edge: [0.85, 1, 1], glow: [0.25, 0.85, 1] }, WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const LIT = { edge: [0.35, 0.85, 1], glow: [0.1, 0.55, 1] }, STAR_LOOK = { edge: [1, 1, 1], glow: [0.4, 0.9, 1] }, STAR = { core: [1, 1, 1], glow: [0.35, 0.9, 1] }, RING = new THREE.Color(0x9ff0ff), DIM = { edge: [0.55, 0.6, 0.6], glow: [0.2, 0.3, 0.3] };
const R = new Rng(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const bpts = [], bws = [];
let bw = 0, bwa = null;
const endK = (x) => Math.min(1, x * 5, (1 - x) * 5);
const boltCoreW = (x, k) => bw * bwa[k] * endK(x), boltGlowW = (x, k) => bw * 2.6 * (0.5 + 0.5 * bwa[k]) * Math.max(0.3, endK(x));
// the searchlight's pool of light: brightest along its middle, soft at its sides, fading toward its far end
// round 2 (owner: "the concept is fine, the effects are not pretty yet"): a magic circle of rune light (additive;
// uv -1..1 over its radius): a double outer ring, a band of rune staves lit round it up to uK like a clock, an inner
// ring, a six-point star of two triangles turning the other way, a soft glow in the middle; numbers in uniforms
const SEAL_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SEAL_FS = `varying vec2 vP; uniform float uA, uRot, uK, uN, uHot; uniform vec3 uC;
  float ln(float d, float w){ return 1.0 - smoothstep(w*0.5, w, abs(d)); }
  float tri(vec2 p, float r, float rot){ float v = 0.0; for (int i = 0; i < 3; i++){ float a0 = rot + float(i)*2.0944, a1 = a0 + 2.0944;
      vec2 A = vec2(cos(a0), sin(a0))*r, B = vec2(cos(a1), sin(a1))*r, e = B - A; float h = clamp(dot(p - A, e)/dot(e, e), 0.0, 1.0);
      v = max(v, ln(length(p - A - e*h), 0.03)); } return v; }
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    float rings = ln(r - 0.965, 0.026) + ln(r - 0.9, 0.016)*0.8 + ln(r - 0.66, 0.02)*0.8;
    // the rune band: a stave per glyph and short branches, lit round up to uK (a clock from the top)
    float ga = mod(-a + 1.5708 + 6.2832, 6.2832), cell = ga/6.2832*uN, id = floor(cell), f = fract(cell) - 0.5;
    float across = f*6.2832*0.79/uN, band = (r > 0.71 && r < 0.87) ? 1.0 : 0.0;
    float stave = ln(across, 0.03)*band, branch = ln(across - (r - 0.79)*0.6, 0.024)*band*step(0.74, r)*step(r, 0.84);
    float lit = step(id + 0.5, uK*uN) + uHot;
    float runes = max(stave, branch)*(0.35 + 0.65*clamp(lit, 0.0, 1.0));
    float star = (tri(vP, 0.6, -uRot) + tri(vP, 0.6, -uRot + 1.0472))*0.7;
    float glow = (0.3 + (1.0 - r)*0.5)*0.22*(0.4 + uK) + uHot*0.25*(1.0 - r);
    float v = (rings*0.55 + runes*0.75 + star*0.5 + glow)*uA*(1.0 + uHot*1.5);
    if (v < 0.004) discard;
    // normal blend so the cyan holds its hue on bright sand; the strongest lines run to white
    gl_FragColor = vec4(mix(uC, vec3(0.85, 1.0, 1.0), clamp(v*v*0.6 + uHot*0.5, 0.0, 1.0)), clamp(v*2.6, 0.0, 0.95)); }`;
// the searchlight's shaft: a fan of light from its eye down to the lit ground, faint at the eye, brighter low
const SHAFT_VS = `attribute float aK; varying float vK; varying float vS; attribute float aS;
  void main(){ vK = aK; vS = aS; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SHAFT_FS = `varying float vK; varying float vS; uniform float uA; uniform vec3 uC;
  void main(){ float edge = smoothstep(0.75, 1.0, abs(vS)); float a = (0.05 + 0.14*vK)*(0.6 + 0.8*edge)*uA; gl_FragColor = vec4(uC*a, 1.0); }`;
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
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6fd8ec, toneMapped: false })); m.visible = false; m.frustumCulled = false; scene.add(m);
      const h = lightSprite(scene, glow, true, 10); h.material.color.setRGB(0.3, 0.85, 1);
      return { m, h, id: -1, pts: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0 };
    });
    // the seal's circle (fill), its glyph strokes and the pillars as it closes
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); disc.userData.shared = true;
    this.fills = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.2, depthWrite: false })); m.visible = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m); return m; });
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    this.glyph = Array.from({ length: 3 }, () => new THREE.Vector3());
    this.pillars = Array.from({ length: PILLARS }, () => ({ t: 9, x: 0, z: 0 }));
    this.pillarI = 0;
    this.cage = { t: 9, x: 0, z: 0, dur: 1 };
    this.two = [new THREE.Vector3(), new THREE.Vector3()];
    // the searchlight's cone (built on first use with its arc)
    this.cone = null;
    this.eye = lightSprite(scene, glow, true, 11); this.eye.material.color.setRGB(0.6, 0.95, 1);
    this.bolts = Array.from({ length: BOLTS }, () => ({ t: 9, x: 0, y: 0, z: 0, top: new THREE.Vector3(), seed: 0 }));
    this.boltI = 0;
    this.meter = Array.from({ length: 33 }, () => new THREE.Vector3());
    // magic circles: the seal's (big) and the small sigils at a launch or a strike
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); quad.userData.shared = true;
    const sealMat = () => new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uK: { value: 0 }, uN: { value: 8 }, uHot: { value: 0 }, uC: { value: new THREE.Color(0x14b0ff) } }, vertexShader: SEAL_VS, fragmentShader: SEAL_FS, transparent: true, depthWrite: false });
    this.seals = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(quad, sealMat()); m.visible = false; m.renderOrder = 3; m.frustumCulled = false; this.scene.add(m); return { m, t: 9, x: 0, z: 0, R: 2.4, close: -1 }; });
    this.sigils = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(quad, sealMat()); m.visible = false; m.renderOrder = 3; m.frustumCulled = false; this.scene.add(m); return { m, t: 9, R: 0.8 }; });
    this.sigilI = 0;
    this.sparkList = []; this.free = []; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.shaft = null;
  }
  sigil(x, z, R) { const S = this.sigils[this.sigilI++ % this.sigils.length]; S.t = 0; S.R = R; S.m.position.set(x, this.gy(x, z) + 0.07, z); S.m.scale.setScalar(R); S.m.visible = true; }
  streaks(x, y, z, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.5 + Math.random()); _a.set(x, y, z); _b.set(Math.sin(a) * v, 1.5 + Math.random() * 3, Math.cos(a) * v); spark(this.sparkList, this.free, 80, _a, _b, 0.3 + Math.random() * 0.3, 0.05, i % 3 ? RUNE : STAR_LOOK); } }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  sparks(x, y, z, n) { if (this.fx) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 3; this.fx.add(x, y, z, Math.sin(a) * v, 1 + Math.random() * 2.5, Math.cos(a) * v, { color: i % 3 ? 0x7fe3ee : 0xffffff, size: 0.12, sizeEnd: 0.02, life: 0.45, drag: 2 }); } }

  /** A rune shard striking (core impact of rune_shard). */
  impact(e) { const y = this.gy(e.x, e.z) + 1.2; this.monster.burstStar?.(e.x, y, e.z, 0.6, STAR, 0x9ff0ff, 0xffffff); this.sigil(e.x, e.z, 0.9); this.streaks(e.x, y, e.z, 10, 3.5); this.sparks(e.x, y, e.z, 6); this.monster.onShake?.(0.05, 0.05); }
  /** The rune seal closing (core burst of rune_seal). */
  burst(e) {
    if (e.kind !== 'rune_seal') return false;
    const y = this.gy(e.x, e.z), n = 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; Object.assign(this.pillars[this.pillarI++ % PILLARS], { t: 0, x: e.x + Math.sin(a) * e.radius, z: e.z + Math.cos(a) * e.radius }); }
    this.monster.call?.ring(e.x, y + 0.1, e.z, e.radius, RING, 0.4);
    this.monster.call?.ring(e.x, y + 0.1, e.z, e.radius * 1.4, RING, 0.5, 0.08);
    this.monster.burstStar?.(e.x, y + 1, e.z, 0.9, STAR, 0x9ff0ff, 0xffffff);
    this.streaks(e.x, y + 0.5, e.z, 20, 4.5);
    // the circle flares as it closes, then fades
    const C = this.seals.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < 0.01 && q.close < 0) || this.seals[0];
    Object.assign(C, { x: e.x, z: e.z, R: e.radius, close: 0 }); C.m.visible = true;
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
      case 'shardLaunch': this.monster.burstStar?.(e.x, y + 1.4, e.z, 0.35, STAR, 0x9ff0ff, 0xffffff); this.sigil(e.x, e.z, 0.7); return true;
      case 'searchOn': this.monster.burstStar?.(e.x + Math.sin(e.angle) * 0.4, y + 2.3, e.z + Math.cos(e.angle) * 0.4, 0.5, STAR, 0x9ff0ff, 0xffffff); return true;
      case 'searchOff': return true;
      case 'searchStrike': {
        const B = this.bolts[this.boltI++ % BOLTS];
        B.t = 0; B.x = e.x; B.y = y; B.z = e.z; B.seed = Math.floor(Math.random() * 1e4);
        skyAbove(this.monster.camera, e.x, e.z, 11, (Math.random() - 0.5) * 0.2, B.top);
        this.monster.burstStar?.(e.x, y + 0.7, e.z, 0.7, STAR, 0x9ff0ff, 0xffffff);
        this.monster.call?.ring(e.x, y + 0.1, e.z, 1.3, RING, 0.35);
        this.sigil(e.x, e.z, 1.4); this.streaks(e.x, y + 0.5, e.z, 16, 4);
        this.sparks(e.x, y + 0.6, e.z, 8);
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
    // the seal: a magic circle round the hero, its runes lighting round it like a clock, a plain fill growing to its close
    let fi = 0, si = 0;
    for (const a of g.areas) {
      if (a.kind !== 'rune_seal' || a.t > a.delay || fi >= this.fills.length) continue;
      const src = g.monsterById?.(a.sourceId), atk = src?.def.attacks[a.attack], k = Math.min(1, a.t / Math.max(0.01, a.delay)), y = this.gy(a.x, a.z) + 0.05;
      const F = this.fills[fi++]; F.position.set(a.x, y, a.z); F.scale.setScalar(a.radius * (0.15 + 0.85 * k)); F.material.opacity = 0.22; F.visible = true;
      for (let j = 0; j < this.ring.length; j++) { const an = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(a.x + Math.sin(an) * a.radius, y + 0.01, a.z + Math.cos(an) * a.radius); }
      RW.v = 0.07; this.glow.strip(this.ring, lineGlowW, 0.35, WARN.glow); this.core.strip(this.ring, lineW, 0.9, WARN.edge);
      const C = this.seals.find((q) => q.close < 0 && Math.hypot(q.x - a.x, q.z - a.z) < 0.01) || this.seals.find((q) => q.close < 0 && q.t > 8) || this.seals[si];
      si++;
      Object.assign(C, { x: a.x, z: a.z, R: a.radius, t: 0, close: -1 });
      const U = C.m.material.uniforms;
      U.uK.value = k; U.uN.value = atk?.glyphs || 8; U.uRot.value = this.time * 0.6; U.uHot.value = 0; U.uA.value = Math.min(1, a.t / 0.2) * 0.9;
      C.m.position.set(a.x, y + 0.02, a.z); C.m.scale.setScalar(a.radius * 0.98); C.m.visible = true;
    }
    // a closed seal: flaring, then fading
    for (const C of this.seals) {
      if (C.close < 0) { if (!g.areas.some((a) => a.kind === 'rune_seal' && Math.hypot(a.x - C.x, a.z - C.z) < 0.01 && a.t <= a.delay)) C.m.visible = false; continue; }
      C.close += dt;
      const U = C.m.material.uniforms, u = C.close;
      U.uK.value = 1; U.uHot.value = Math.max(0, 1 - u / 0.4); U.uA.value = Math.max(0, 1 - Math.max(0, u - 0.3) / 0.5); U.uRot.value = this.time * 0.6;
      if (u > 0.8) { C.m.visible = false; C.close = -1; C.t = 9; }
    }
    // the small sigils: opening, turning, fading
    for (const S of this.sigils) {
      if (S.t >= 0.5) { S.m.visible = false; continue; }
      S.t += dt;
      const U = S.m.material.uniforms; U.uK.value = 1; U.uHot.value = Math.max(0, 1 - S.t / 0.2); U.uRot.value = this.time * 3; U.uA.value = Math.max(0, 1 - S.t / 0.5);
      S.m.scale.setScalar(S.R * (0.6 + 0.6 * Math.min(1, S.t / 0.12)));
    }
    for (let i = fi; i < this.fills.length; i++) this.fills[i].visible = false;
    // the pillars standing up from the glyphs as it closes
    for (const P of this.pillars) {
      if (P.t >= 0.5) continue;
      P.t += dt;
      const up = Math.min(1, P.t / 0.08), fade = P.t < 0.2 ? 1 : Math.max(0, 1 - (P.t - 0.2) / 0.3), y = this.gy(P.x, P.z);
      this.two[0].set(P.x, y, P.z); this.two[1].set(P.x, y + 2.4 * up, P.z);
      RW.v = 0.18; this.glow.strip(this.two, tailGlowW, 0.8 * fade, RUNE.glow); this.core.strip(this.two, tailW, fade, RUNE.edge);
    }
    // the cage round whoever it holds (the hero, while still held)
    const p = g.player;
    if (this.cage.t < this.cage.dur) {
      this.cage.t += dt;
      if (p && !p.dead && p.statuses?.root && Math.hypot(p.x - this.cage.x, p.z - this.cage.z) < 3) {
        const y = this.gy(p.x, p.z), fade = Math.min(1, this.cage.t / 0.1) * Math.min(1, (this.cage.dur - this.cage.t) / 0.25);
        for (let i = 0; i < 6; i++) {
          const an = (i / 6) * Math.PI * 2 + this.time * 0.8;
          this.two[0].set(p.x + Math.sin(an) * 0.55, y, p.z + Math.cos(an) * 0.55); this.two[1].set(p.x + Math.sin(an) * 0.45, y + 1.7, p.z + Math.cos(an) * 0.45);
          RW.v = 0.07; this.glow.strip(this.two, lineGlowW, 0.5 * fade, RUNE.glow); this.core.strip(this.two, lineW, 0.85 * fade, RUNE.edge);
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
      // the shaft of light from its eye down to the ground it lights, and motes glinting in it
      if (!this.shaft) {
        const n = 16, pos = new Float32Array((n + 2) * 3), ak = new Float32Array(n + 2), as = new Float32Array(n + 2), idx = [];
        pos.set([0, 2.25, 0.3], 0); ak[0] = 0; as[0] = 0;
        for (let i = 0; i <= n; i++) { const t = -half + (2 * half * i) / n; pos.set([Math.sin(t) * atk.range, 0.05, Math.cos(t) * atk.range], (i + 1) * 3); ak[i + 1] = 1; as[i + 1] = (2 * i) / n - 1; if (i < n) idx.push(0, i + 1, i + 2); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aK', new THREE.BufferAttribute(ak, 1)); geo.setAttribute('aS', new THREE.BufferAttribute(as, 1)); geo.setIndex(idx);
        this.shaft = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uC: { value: new THREE.Color(0xbff6ff) } }, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        this.shaft.renderOrder = 4; this.shaft.frustumCulled = false; this.scene.add(this.shaft);
      }
      this.shaft.position.set(lit.x, this.gy(lit.x, lit.z), lit.z); this.shaft.rotation.set(0, lit.search.angle, 0); this.shaft.material.uniforms.uA.value = k; this.shaft.visible = true;
      if (this.fx && Math.random() < 0.6) { const d = 2 + Math.random() * (atk.range - 2), t = lit.search.angle + (Math.random() - 0.5) * half * 1.6, mx = lit.x + Math.sin(t) * d, mz = lit.z + Math.cos(t) * d; this.fx.add(mx, this.gy(mx, mz) + 0.2 + Math.random() * 1.2, mz, 0, 0.35, 0, { color: Math.random() < 0.5 ? 0xbff6ff : 0xffffff, size: 0.08, sizeEnd: 0.02, life: 0.8, drag: 1 }); }
      const ey = this.gy(lit.x, lit.z) + 2.25; this.eye.position.set(lit.x + Math.sin(lit.search.angle) * 0.3, ey, lit.z + Math.cos(lit.search.angle) * 0.3); this.eye.scale.setScalar(0.9); this.eye.material.opacity = 0.9; this.eye.visible = true;
      // the hero's ring of being spotted
      const sp = lit.search.heroSpot || 0;
      if (p && !p.dead && sp > 0.02) {
        const y = this.gy(p.x, p.z) + 0.06, n = this.meter.length;
        for (let j = 0; j < n; j++) { const an = (j / (n - 1)) * Math.PI * 2 * sp; this.meter[j].set(p.x + Math.sin(an) * 0.75, y, p.z + Math.cos(an) * 0.75); }
        RW.v = 0.09; this.glow.strip(this.meter, lineGlowW, 0.6, RUNE.glow); this.core.strip(this.meter, lineW, 1, RUNE.edge);
      }
    } else { if (this.cone) this.cone.visible = false; if (this.shaft) this.shaft.visible = false; this.eye.visible = false; }
    // the rune bolts
    for (const B of this.bolts) {
      if (B.t >= 0.28) continue;
      B.t += dt;
      const fade = B.t < 0.12 ? 1 : Math.max(0, 1 - (B.t - 0.12) / 0.16);
      _a.copy(B.top); _b.set(B.x, B.y + 0.05, B.z);
      zig(_a, _b, R, B.seed + Math.floor(this.time * 15), 0.07, 9, bpts, bws); bw = 0.22; bwa = bws;
      this.boltGlow.strip(bpts, boltGlowW, fade * 0.8, RUNE.glow); this.boltCore.strip(bpts, boltCoreW, fade, RUNE.edge);
    }
    drawSparks(this.sparkList, this.free, dt, this.core, this.glow, this.three, 9);
    this.core.end(); this.glow.end(); this.boltCore.end(); this.boltGlow.end();
  }
}
