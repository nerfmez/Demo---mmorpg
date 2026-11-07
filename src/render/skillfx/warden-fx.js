// The horned warden's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first:
// a lava-seamed stone titan with a shield. Pahoehoe lava chills to a crust that cracks and glows where the molten
// inside breaks out; a fissure eruption opens the whole length of a crack at once in a curtain of lava fountains; a
// shield wall turns blows from the front, the back is open. Stone in the game's three toon steps, dust, lava light;
// danger zones in the warm warning colour at their true size, cover in a cool colour.
// - Shield bash (core monsterSwing shield_bash): a blunt star and chips where the shield lands, dust.
// - Shield wall (shield_wall wind-up; core clawGuard, weakHit, shieldBash): a curved wall of amber light before its
//   shield, flaring at each blow it turns (brighter for each); its lava seams glow at its back where it is open; the
//   bash: a ragged flash, rays, dust and chips across its front, bigger for each blow turned.
// - Boulder ricochet (core charge, ricochet): lava sparks and dust off the rolling boulder; each carom a burst of chips
//   and a shock ring, the next leg's lane flashing ahead of it.
// - Lava fissures (area lava_fissure; core fissureFist): cracks glowing out from its fist across the true lane width
//   through the wind-up; at once the whole length splits in a curtain of lava fountains, then a lane of lava that
//   crusts over and fades.
// - Core eruption (core slabsRise, coreBlast): the slabs heave up round the hero, the shadow behind each laid on the
//   ground in a cool colour (cover); the whole reach marked, filling to the burst; its core blazes; the burst: a flash,
//   rays, a ring of fire out to its reach, the slabs cracking and sinking.
// - Phase roar (core phaseRoar): a ring of heat and embers off it; its seams glow hot from then on (monsters.js).
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, conformPlane, place, flashMaterial, tintFlash, BILLBOARD_VS, NOISE } from './fx-common.js';
import { flameMaterial, cometShell, domeShell } from './meteor-flame.js';
import { FireExtras } from './fire-extras.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, taperW, taperGlowW, lightSprite, glowTexture } from './light-kit.js';
import { warnDisc } from './anime-kit.js';
import { rockGeometry, slabGeometry, STONE_VS, STONE_FS, DUST_FS } from './ground-kit.js';

const CHIPS = 18, PUFFS = 30, FLASHES = 3, RAYS = 8, COVERS = 3, GLOWS = 6, LANES = 3;
const LAVA = { edge: [1, 0.85, 0.45], glow: [1, 0.38, 0.06] }, CRUST = { edge: [0.32, 0.1, 0.05], glow: [0.6, 0.12, 0.02] };
const MOLTEN = [0.96, 0.36, 0.05], HOT = [1, 0.86, 0.38];
const WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] }, AMBER = { edge: [1, 0.92, 0.7], glow: [1, 0.55, 0.15] };
const COOL = { edge: [0.7, 0.95, 1], glow: [0.25, 0.75, 1] };
const STAR = { core: [1, 0.95, 0.8], glow: [1, 0.5, 0.15] };
const HEAT = new THREE.Color(0xffa040);
// the shield's wall of light: brightest low and at its rim, fading upward; flaring on a turned blow (uHit)
const WALL_VS = `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const WALL_FS = `varying vec2 vU; uniform float uA, uHit, uT; uniform vec3 uC;
  void main(){ float up = 1.0 - vU.y, side = min(vU.x, 1.0 - vU.x)*2.0;
    float edge = smoothstep(0.0, 0.25, side), rim = 1.0 - smoothstep(0.0, 0.12, side);
    float bands = 0.5 + 0.5*sin(vU.y*18.0 - uT*4.0);
    float k = (0.18 + 0.35*up*up + 0.25*bands*up)*edge + 0.5*rim*up;
    k *= uA*(1.0 + 2.0*uHit);
    if (k < 0.01) discard;
    gl_FragColor = vec4(uC*k, 1.0); }`;
// a slab's shadow on the ground (cover): a plain cool fill with a crisp rim, the shape of the rule's shadow
const COVER_FS = `varying vec2 vU; uniform float uA;
  void main(){ float rim = max(1.0 - smoothstep(0.0, 0.06, min(vU.x, 1.0 - vU.x)), 1.0 - smoothstep(0.0, 0.05, min(vU.y, 1.0 - vU.y)));
    gl_FragColor = vec4(mix(vec3(0.15, 0.55, 1.0), vec3(0.7, 0.95, 1.0), rim), (0.38 + 0.55*rim)*uA); }`;
// round 2 (owner: "the effects are not pretty yet"): Firebolt's fire (meteor-flame.js shells cut from flowing noise,
// FireExtras embers and fire puffs) and a molten lava lane: flowing noise, hot threads between crust plates that
// spread as it cools (numbers in uniforms)
const LANE_VS = `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const LANE_FS = `varying vec2 vU; uniform float uT, uCool, uA, uHot;` + NOISE + `
  void main(){ float v = abs(vU.y), u = vU.x;
    float edge = 1.0 - smoothstep(0.6, 1.0, v);
    float flow = fbm(vec2(u*0.9 - uT*0.35, vU.y*1.4 + uT*0.1));
    float plates = fbm(vec2(u*1.6 + 3.1, vU.y*2.2 - 1.7) + 0.6*vec2(flow, flow));
    float crust = smoothstep(0.62 - 0.45*uCool, 0.7 - 0.45*uCool, plates) + smoothstep(0.55, 0.95, v);
    float heat = clamp(flow*1.15 + uHot*0.5 - v*0.35, 0.0, 1.0);
    vec3 molten = mix(vec3(0.85, 0.2, 0.04), mix(vec3(1.0, 0.55, 0.1), vec3(1.0, 0.92, 0.55), smoothstep(0.55, 0.85, heat)), smoothstep(0.25, 0.6, heat));
    vec3 c = mix(molten, vec3(0.2, 0.09, 0.06), clamp(crust, 0.0, 1.0)*0.92);
    float a = edge*uA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a); }`;
const LANE_N = 32, _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tip = new THREE.Vector3();

export class WardenFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const stone = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.chips = Array.from({ length: CHIPS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(1311 + i * 7), stone); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 0.1, spin: 0 }; });
    this.chipI = 0;
    const quad = new THREE.PlaneGeometry(1, 1); quad.userData.shared = true;
    this.puffs = Array.from({ length: PUFFS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 1 }; });
    this.puffI = 0;
    this.flashes = Array.from({ length: FLASHES }, (_, i) => { const m = new THREE.Mesh(quad, flashMaterial(5.3 + i * 2.1)); tintFlash(m.material, 'fire'); m.material.uniforms.uMid.value.set('#ffb050'); m.material.uniforms.uOut.value.set('#c04a10'); m.renderOrder = 9; m.visible = false; m.frustumCulled = false; scene.add(m); return { m, t: 9, x: 0, y: 0, z: 0, size: 3 }; });
    this.flashI = 0;
    this.rays = Array.from({ length: FLASHES }, () => ({ t: 9, x: 0, y: 0, z: 0, d: Array.from({ length: RAYS }, () => new THREE.Vector3()), len: Array(RAYS).fill(2) }));
    this.waves = Array.from({ length: 6 }, () => ({ t: 9, x: 0, z: 0, R0: 0, R1: 1, life: 0.35, look: AMBER }));
    this.waveI = 0;
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: 24 }, () => new THREE.Vector3());
    const warm = glowTexture('fire');
    this.glows = Array.from({ length: GLOWS }, () => { const g = lightSprite(scene, warm, true, 10); g.material.color.setRGB(1, 0.55, 0.15); return g; });
    // the shield's wall of light: a part of a cylinder before it (160 degrees, built once)
    const wg = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -1.4, 2.8); wg.translate(0, 0.5, 0); wg.userData.shared = true;
    this.wall = new THREE.Mesh(wg, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uHit: { value: 0 }, uT: { value: 0 }, uC: { value: new THREE.Color(0xffa040) } }, vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.wall.visible = false; this.wall.frustumCulled = false; this.wall.renderOrder = 7; scene.add(this.wall);
    this.hit = 0;
    // the cover slabs and their shadows; the burst's reach
    const big = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uHi: { value: new THREE.Color(0x9a8f84) }, uMid: { value: new THREE.Color(0x6d645b) }, uLo: { value: new THREE.Color(0x45403b) } }, vertexShader: STONE_VS, fragmentShader: `varying vec3 vN; uniform float uA; uniform vec3 uHi, uMid, uLo;
      void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49))); gl_FragColor = vec4(l > 0.55 ? uHi : (l > 0.1 ? uMid : uLo), uA); }` });
    const sq = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); sq.userData.shared = true;
    this.covers = Array.from({ length: COVERS }, (_, i) => {
      const m = new THREE.Mesh(slabGeometry(301 + i * 29), big); m.visible = false; m.frustumCulled = false; scene.add(m);
      const sh = new THREE.Mesh(sq, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: WALL_VS, fragmentShader: COVER_FS, transparent: true, depthWrite: false }));
      sh.visible = false; sh.frustumCulled = false; sh.renderOrder = 2; scene.add(sh);
      return { m, sh, t: 9, x: 0, z: 0, a: 0, w: 1.8, end: 9, burst: false };
    });
    this.reach = warnDisc(scene, 'fire');
    // Firebolt's fire: embers and fire puffs; flame shells for the wall, the rolling boulder, the core's dome and the
    // ring racing out, and per fissure a curtain and a lava lane (strips rebuilt in place when a fissure opens)
    this.fire = new FireExtras(scene, monster.camera);
    const shell = (geo, mode, layer, filled, order) => { const m = new THREE.Mesh(geo, flameMaterial(mode, layer, filled)); m.renderOrder = order; m.frustumCulled = false; return m; };
    const group = (...ms) => { const g = new THREE.Group(); g.add(...ms); g.visible = false; scene.add(g); return g; };
    this.flameWall = group(shell(wg, 1, 0, false, 7), shell(wg, 1, 1, false, 6));
    this.comet = group(shell(cometShell(0, 2.5, 6.5), 0, 0, false, 7), shell(cometShell(1, 2.5, 6.5), 0, 1, false, 6));
    for (const m of this.comet.children) { m.material.uniforms.uLen.value = 6.5; m.material.uniforms.uFront.value = 2.5; }
    this.dome = group(shell(domeShell(), 1, 0, false, 7), shell(domeShell(), 1, 1, false, 6), shell(domeShell(), 1, 1, true, 5));
    this.dome.children[2].scale.setScalar(0.62);
    const rg = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true); rg.translate(0, 0.5, 0); rg.userData.shared = true;
    this.fireRing = group(shell(rg, 1, 0, false, 7), shell(rg, 1, 1, false, 6));
    this.domeT = 9; this.ringT = 9; this.ringR = 13;
    this.fiss = Array.from({ length: LANES }, () => {
      const lane = new THREE.BufferGeometry(), curtain = new THREE.BufferGeometry(), n = LANE_N + 1, idx = [];
      for (let i = 0; i < LANE_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      for (const g of [lane, curtain]) { g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4), 2)); g.setIndex(idx); }
      const lm = new THREE.Mesh(lane, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uCool: { value: 0 }, uA: { value: 0 }, uHot: { value: 1 } }, vertexShader: LANE_VS, fragmentShader: LANE_FS, transparent: true, depthWrite: false }));
      lm.renderOrder = 3; lm.frustumCulled = false; lm.visible = false; scene.add(lm);
      const cw = group(shell(curtain, 1, 0, false, 7), shell(curtain, 1, 1, false, 6));
      return { id: -1, lane: lm, curtain: cw, gy: 0 };
    });
    this.dustT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  chipsAt(x, z, n, sp, up = 4) {
    const y = this.gy(x, z);
    for (let i = 0; i < n; i++) {
      const q = this.chips[this.chipI++ % CHIPS], a = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.8);
      q.p.set(x + Math.sin(a) * 0.3, y + 0.2, z + Math.cos(a) * 0.3); q.v.set(Math.sin(a) * v, up * (0.6 + Math.random() * 0.7), Math.cos(a) * v);
      q.t = 0; q.size = 0.08 + Math.random() * 0.14; q.spin = (Math.random() - 0.5) * 14; q.m.visible = true;
    }
  }
  puff(x, y, z, vx, vy, vz, size, life) { const q = this.puffs[this.puffI++ % PUFFS]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.life = life; q.size = size; q.m.material.uniforms.uSeed.value = Math.random() * 40; }
  cloud(x, z, R, n, size) { const y = this.gy(x, z); for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.5, sp = 1.2 + Math.random() * 1.6; this.puff(x + Math.sin(a) * R, y + 0.35, z + Math.cos(a) * R, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, Math.cos(a) * sp, size * (0.8 + Math.random() * 0.5), 0.9 + Math.random() * 0.4); } }
  bang(x, y, z, size) {
    const F = this.flashes[this.flashI], R = this.rays[this.flashI]; this.flashI = (this.flashI + 1) % FLASHES;
    Object.assign(F, { t: 0, x, y, z, size });
    R.t = 0; R.x = x; R.y = y; R.z = z;
    for (let j = 0; j < RAYS; j++) { const a = (j / RAYS) * 6.283 + Math.random() * 0.6, el = 0.5 + Math.random() * 0.7; R.d[j].set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); R.len[j] = size * (0.7 + Math.random() * 0.5); }
  }
  wave(x, z, R0, R1, life, look = AMBER) { Object.assign(this.waves[this.waveI++ % this.waves.length], { t: 0, x, z, R0, R1, life, look }); }
  embers(x, y, z, n, sp, up = 3) { const fx = this.fx; if (fx) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.4 + Math.random()); fx.add(x, y, z, Math.sin(a) * v, up * (0.5 + Math.random()), Math.cos(a) * v, { color: i % 3 ? 0xff8a2a : 0xffe08a, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.03, life: 0.5 + Math.random() * 0.4, gravity: 5, drag: 1.2 }); } }

  /** The warden's shield bash (core monsterSwing); true when drawn here. */
  swing(e) {
    if (e.type !== 'horned_warden' || e.name !== 'shield_bash') return false;
    const d = 1.6 + 1.2, x = e.x + Math.sin(e.angle) * d, z = e.z + Math.cos(e.angle) * d, y = this.gy(x, z);
    this.monster.burstStar?.(x, y + 0.9, z, 0.8, STAR, 0xffb050, 0xfff0c0);
    this.fire.impact(x, y + 0.9, z, false, 1.3);
    this.chipsAt(x, z, 6, 3, 3); this.cloud(x, z, 0.4, 4, 1.1);
    this.wave(x, z, 0.3, 1.6, 0.28);
    this.monster.onShake?.(0.12, 0.12);
    return true;
  }

  /** The warden's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id ?? e.source);
    if (e.type === 'fencePulse') { const s = g?.monsterById?.(e.source); if (s?.type !== 'horned_warden') return false; if (e.pulse === 1) this.monster.onShake?.(0.18, 0.18); return true; }
    if (m?.type !== 'horned_warden') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'clawGuard': {
        // a blow turned by the shield: sparks off the wall toward the blow, the wall flaring
        const a = Math.atan2(e.fromX - e.x, e.fromZ - e.z), r = m.r + 0.7, hx = e.x + Math.sin(a) * r, hz = e.z + Math.cos(a) * r;
        this.hit = 1;
        this.monster.burstStar?.(hx, y + 1.2, hz, 0.45, STAR, 0xffc060, 0xffffff);
        this.fire.impact(hx, y + 1.2, hz, false, 0.7);
        return true;
      }
      case 'weakHit': {
        const a = Math.atan2(e.fromX - e.x, e.fromZ - e.z), r = m.r * 0.6, hx = e.x + Math.sin(a) * r, hz = e.z + Math.cos(a) * r;
        this.monster.burstStar?.(hx, y + 1.6, hz, 0.7, STAR, 0xff7a20, 0xffe0a0);
        this.fire.impact(hx, y + 1.6, hz, false, 1.1);
        return true;
      }
      case 'shieldBash': {
        const d = m.r + 1.2, x = e.x + Math.sin(e.angle) * d, z = e.z + Math.cos(e.angle) * d, k = 1 + 0.25 * (e.blocked || 0);
        this.bang(x, this.gy(x, z) + 0.9, z, 2.6 * k); this.fire.impact(x, this.gy(x, z) + 1, z, false, 1.6 * k);
        this.chipsAt(x, z, 6 + 2 * (e.blocked || 0), 3.5, 3.5); this.cloud(x, z, 0.8, 6, 1.4 * k);
        const arc = (e.arc * Math.PI) / 180;
        for (let i = 0; i < 7; i++) { const a = e.angle + ((i / 6) - 0.5) * arc, r = e.range * 0.8; this.puff(e.x + Math.sin(a) * r, this.gy(e.x, e.z) + 0.3, e.z + Math.cos(a) * r, Math.sin(a) * 2, 0.4, Math.cos(a) * 2, 1.1, 0.7); }
        this.monster.onShake?.(0.16 * k, 0.15);
        return true;
      }
      case 'ricochet': {
        // a carom: chips and a shock ring off the boulder, its next lane flashing ahead
        this.chipsAt(e.x, e.z, 8, 3, 4); this.cloud(e.x, e.z, 0.6, 5, 1.3);
        this.wave(e.x, e.z, 0.8, 3.6, 0.32); this.wave(e.x, e.z, 0.5, 2.4, 0.25, LAVA);
        this.bang(e.x, y + 1.6, e.z, 3.2); this.fire.impact(e.x, y + 1.4, e.z, false, 2);
        this.lane = { t: 0, x: e.x, z: e.z, a: e.angle, len: e.length };
        const rig = this.monster.rig(e.id); if (rig) rig.hopT = 0; // the boulder bounces off (monsters.js)
        this.monster.onShake?.(0.14, 0.12);
        return true;
      }
      case 'fissureFist': {
        const x = e.x + Math.sin(e.angle) * (m.r + 0.3), z = e.z + Math.cos(e.angle) * (m.r + 0.3);
        this.chipsAt(x, z, 8, 2.5, 4); this.cloud(x, z, 0.5, 5, 1.3); this.bang(x, this.gy(x, z) + 0.4, z, 1.8); this.fire.impact(x, this.gy(x, z) + 0.5, z, false, 1.5);
        this.monster.onShake?.(0.14, 0.14);
        return true;
      }
      case 'slabsRise': {
        const atk = m.def.attacks.core_eruption;
        e.slabs.forEach((s, i) => { const C = this.covers[i % COVERS]; Object.assign(C, { t: -i * 0.12, x: s.x, z: s.z, a: Math.atan2(s.x - e.x, s.z - e.z), w: e.width, end: e.total + i * 0.0, burst: false, shadow: atk.shadow }); });
        return true;
      }
      case 'coreBlast': {
        const cy = y + 2.2;
        this.blast = { t: 0, x: e.x, z: e.z, R: e.radius };
        // a dome of fire bursting out of its core, and a ring of flame racing out to its reach
        this.domeT = 0; this.dome.position.set(e.x, y, e.z); this.ringT = 0; this.ringR = e.radius; this.fireRing.position.set(e.x, y, e.z);
        this.fire.release(); this.fire.burst(e.x, cy, e.z, 40, 2.2, 2);
        this.bang(e.x, cy, e.z, 8);
        // the heat bursting up all over its reach
        if (this.fx) for (let i = 0; i < 46; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * e.radius, x = e.x + Math.sin(a) * r, z = e.z + Math.cos(a) * r; if (e.slabs.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6)) continue; this.fx.add(x, this.gy(x, z) + 0.2, z, Math.sin(a) * 1.5, 3 + Math.random() * 4, Math.cos(a) * 1.5, { color: Math.random() < 0.4 ? 0xffd070 : 0xff6a10, size: 0.3 + Math.random() * 0.2, sizeEnd: 0.06, life: 0.6, gravity: 8, drag: 0.5 }); }
        this.wave(e.x, e.z, 1, e.radius, 0.45, LAVA); this.wave(e.x, e.z, 1, e.radius * 0.7, 0.35, AMBER);
        this.embers(e.x, cy, e.z, 30, 7, 4);
        for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283, r = e.radius * (0.35 + Math.random() * 0.55); this.puff(e.x + Math.sin(a) * r, this.gy(e.x, e.z) + 0.4, e.z + Math.cos(a) * r, Math.sin(a) * 2.5, 0.6, Math.cos(a) * 2.5, 1.8, 1.1); }
        for (const C of this.covers) if (C.t >= 0 && C.t < 9) { C.burst = true; C.end = C.t; this.chipsAt(C.x, C.z, 5, 2.5, 4); }
        this.monster.onShake?.(0.4, 0.35);
        return true;
      }
      case 'phaseRoar': {
        this.wave(e.x, e.z, 1, 7, 0.5, LAVA); this.wave(e.x, e.z, 1, 4.5, 0.4, AMBER);
        this.fire.impact(e.x, y + 2.2, e.z, false, 2.6);
        this.cloud(e.x, e.z, 1.6, 10, 1.6);
        this.monster.onShake?.(0.3, 0.4);
        return true;
      }
    }
    return false;
  }

  /** Lay a fissure's lava lane (`width` wide, flat on the ground) and its curtain (a wall 0..1 high in object space)
   *  along the polyline `pts`, evenly sampled, into F's fixed buffers. */
  strips(F, pts, width) {
    const lens = [0]; for (let i = 0; i + 1 < pts.length; i++) lens.push(lens[i] + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
    const total = lens[lens.length - 1], LP = F.lane.geometry.attributes.position.array, LU = F.lane.geometry.attributes.uv.array;
    const CP = F.curtain.children[0].geometry.attributes.position.array, CU = F.curtain.children[0].geometry.attributes.uv.array;
    const at = (d, o) => { let i = 0; while (i < lens.length - 2 && lens[i + 1] < d) i++; const k = (d - lens[i]) / Math.max(1e-6, lens[i + 1] - lens[i]); o[0] = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k; o[1] = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k; return o; };
    const p = [0, 0], q = [0, 0], r = [0, 0];
    F.gy = this.gy(pts[2][0], pts[2][1]);
    for (let j = 0; j <= LANE_N; j++) {
      const d = (j / LANE_N) * total; at(d, p); at(Math.min(total, d + 0.3), q); at(Math.max(0, d - 0.3), r);
      let tx = q[0] - r[0], tz = q[1] - r[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const sx = tz * width * 0.5, sz = -tx * width * 0.5, y = this.gy(p[0], p[1]) + 0.07;
      LP.set([p[0] + sx, y, p[1] + sz, p[0] - sx, y, p[1] - sz], j * 6); LU.set([d, 1, d, -1], j * 4);
      CP.set([p[0], 0, p[1], p[0], 1, p[1]], j * 6); CU.set([d / total, 0, d / total, 1], j * 4);
    }
    for (const g of [F.lane.geometry, F.curtain.children[0].geometry]) { g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; }
  }

  /** A fissure crack's polyline from `pts` to `p` of its length, lifted `h`. */
  crack(pts, p, h) {
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let left = total * p, n = 0;
    const out = this.pts;
    for (let i = 0; i + 1 < pts.length && left > 0; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      // a few points along each straight piece, with a little jag so it reads as a crack
      const steps = 4;
      for (let s = 0; s < steps && left > 0; s++) {
        const u0 = s / steps;
        if (n === 0) out[n++].set(x0 + (x1 - x0) * u0, this.gy(x0, z0) + h, z0 + (z1 - z0) * u0);
        const u1 = Math.min(1, u0 + Math.min(1 / steps, left / L)), jx = (z1 - z0) / L, jz = -(x1 - x0) / L, j = (((i * 7 + s * 3) % 5) - 2) * 0.06;
        const x = x0 + (x1 - x0) * u1 + jx * j, z = z0 + (z1 - z0) * u1 + jz * j;
        out[n++].set(x, this.gy(x, z) + h, z);
        left -= L / steps;
      }
    }
    return n;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const dust = (this.dustT -= dt) <= 0;
    if (dust) this.dustT = 0.06;
    let gi = 0, wall = false, reach = false, comet = false, gather = false;
    for (const m of g.monsters) {
      if (m.type !== 'horned_warden' || m.dead) continue;
      const w = m.windup, f = m.facing, y0 = this.gy(m.x, m.z), k = w ? Math.min(1, m.stateT / Math.max(0.01, w.total)) : 0;
      // the shield wall: its wall of light, flaring when it turns a blow; its open back glowing
      if (m.state === 'windup' && w?.name === 'shield_wall') {
        wall = true;
        // a wall of fire before its shield, rising as it plants it, flaring taller at each blow it turns
        const open = Math.min(1, m.stateT / 0.25), blocks = Math.min(4, m.blocked || 0);
        for (const q of this.flameWall.children) { const U = q.material.uniforms; U.uTime.value = this.time; U.uCut.value = 0.06 - 0.05 * this.hit - 0.012 * blocks; U.uCool.value = 0.04 - 0.06 * this.hit; U.uAlpha.value = open; }
        this.flameWall.position.set(m.x, y0, m.z); this.flameWall.rotation.set(0, f, 0); this.flameWall.scale.set(m.r + 1.7, (1.8 + 0.25 * blocks + 0.7 * this.hit) * open, m.r + 1.7);
        for (let i = 0; i < 2 && gi < GLOWS; i++) {
          const a = f + Math.PI + (i ? 0.35 : -0.35), G = this.glows[gi++];
          G.position.set(m.x + Math.sin(a) * m.r * 0.6, y0 + 1.5 + i * 0.4, m.z + Math.cos(a) * m.r * 0.6);
          G.scale.setScalar(1.2 + 0.3 * Math.sin(this.time * 9 + i)); G.material.opacity = 0.75 * open; G.visible = true;
        }
      }
      // the core blazing as it kneels for its eruption; heat rising off it
      if (m.state === 'windup' && w?.name === 'core_eruption') {
        reach = true;
        const atk = m.def.attacks.core_eruption, U = this.reach.material.uniforms;
        U.uR.value = atk.radius; U.uK.value = k; U.uOpen.value = Math.min(1, m.stateT / 0.25);
        place(this.reach, m.x, 0.04, m.z); this.reach.scale.setScalar(atk.radius * 2 * 1.04); conformPlane(this.reach); this.reach.visible = true;
        if (gi < GLOWS) { const G = this.glows[gi++]; G.position.set(m.x + Math.sin(f) * 0.6, y0 + 2.0, m.z + Math.cos(f) * 0.6); G.scale.setScalar(1 + 3.5 * k * k); G.material.opacity = 0.5 + 0.5 * k; G.visible = true; }
        if (dust && this.fx) { const a = Math.random() * 6.283, r = 1 + Math.random() * 3; this.fx.add(m.x + Math.sin(a) * r, y0 + 0.2, m.z + Math.cos(a) * r, -Math.sin(a) * 1.5 * k, 1.5 + 2 * k, -Math.cos(a) * 1.5 * k, { color: Math.random() < 0.5 ? 0xff8a2a : 0xffd070, size: 0.14, sizeEnd: 0.03, life: 0.7, drag: 0.5 }); }
      }
      // the boulder rolling: lava sparks thrown off it and dust behind
      if (m.state === 'act' && m.charge && m.def.attacks[m.windup?.name]?.legs) {
        // the boulder wrapped in fire streaming back along its roll (Firebolt's comet)
        comet = true;
        // its tail swings round after a carom rather than snapping (the shortest way, quickly)
        if (!this.comet.visible) this.cometA = m.charge.angle;
        this.cometA += Math.atan2(Math.sin(m.charge.angle - this.cometA), Math.cos(m.charge.angle - this.cometA)) * Math.min(1, dt * 9);
        const hopY = this.monster.rig(m.id)?.hopY || 0;
        this.comet.position.set(m.x, y0 + 1.9 + hopY, m.z); this.comet.rotation.set(0, this.cometA - Math.PI / 2, 0);
        for (const q of this.comet.children) { q.material.uniforms.uTime.value = this.time; q.material.uniforms.uAlpha.value = Math.min(1, m.charge.t / 0.08 + (m.charge.leg ? 1 : 0)); }
        if (dust) { this.puff(m.x, y0 + 0.4, m.z, 0, 0.3, 0, 1.3, 0.7); this.fire.burst(m.x, y0 + 1.4, m.z, 2, 1.2, 1.5); }
      }
      if (m.state === 'windup' && w?.name === 'core_eruption') {
        gather = true;
        if (this.gatherId !== m.id + ':' + w.total) { this.gatherId = m.id + ':' + w.total; this.fire.gather(w.total * 0.9); }
        _tip.set(m.x + Math.sin(f) * 0.7, y0 + 2.1, m.z + Math.cos(f) * 0.7);
      }
      // its seams in the second phase: heat and embers rising off it now and then
      if (m.enraged && dust && Math.random() < 0.25 && this.fx) this.fx.add(m.x + (Math.random() - 0.5) * 2, y0 + 1 + Math.random() * 2, m.z + (Math.random() - 0.5) * 2, 0, 1.2, 0, { color: 0xff8a2a, size: 0.1, sizeEnd: 0.02, life: 0.8, drag: 0.5 });
    }
    this.hit = Math.max(0, this.hit - dt * 4);
    this.flameWall.visible = wall;
    this.comet.visible = comet;
    if (!gather) { if (this.gatherId) { this.fire.release(); this.gatherId = null; } }
    this.fire.update(dt, _tip);
    // the dome of fire out of its core: bursts up in a few frames, tears into tongues and burns away
    if (this.domeT < 1.1) {
      const t = (this.domeT += dt), grow = 1 - Math.pow(1 - Math.min(1, t / 0.16), 3), size = 5.2 * (0.35 + 0.65 * grow) * (1 + 0.12 * Math.min(1, t / 0.9));
      const cut = Math.max(0, t - 0.22) / 0.75, fade = Math.max(0, Math.min(1, (1.05 - t) / 0.2));
      this.dome.visible = fade > 0; this.dome.scale.set(size, size * 1.3, size);
      for (const q of this.dome.children) { const u = q.material.uniforms; u.uTime.value = this.time; u.uCut.value = 0.07 + 0.45 * cut * cut; u.uCool.value = 0.07 + 0.2 * Math.min(1, cut); u.uAlpha.value = fade; }
      this.dome.children[2].material.uniforms.uAlpha.value = Math.max(0, 1 - t / 0.35);
    } else this.dome.visible = false;
    // the ring of flame racing out to its reach, low and tearing as it goes
    if (this.ringT < 0.75) {
      const t = (this.ringT += dt), u = Math.min(1, t / 0.55), R = 1.5 + (this.ringR - 1.5) * (1 - (1 - u) * (1 - u)), fade = Math.max(0, Math.min(1, (0.75 - t) / 0.25));
      this.fireRing.visible = fade > 0; this.fireRing.scale.set(R, 3.6 * (1 - 0.55 * u) * Math.min(1, t / 0.06), R);
      for (const q of this.fireRing.children) { const U = q.material.uniforms; U.uTime.value = this.time; U.uCut.value = -0.04 + 0.22 * u; U.uCool.value = 0.02 + 0.15 * u; U.uAlpha.value = fade; }
    } else this.fireRing.visible = false;
    if (!reach && this.blast && this.blast.t < 0.45) {
      // the burst over its whole reach: the marked disc flashing full and fading
      const B = this.blast, U = this.reach.material.uniforms; B.t += dt;
      U.uR.value = B.R; U.uK.value = 1; U.uOpen.value = 1; U.uA.value = 1 - B.t / 0.45;
      place(this.reach, B.x, 0.04, B.z); this.reach.scale.setScalar(B.R * 2 * 1.04); conformPlane(this.reach); this.reach.visible = true;
    } else if (!reach) this.reach.visible = false;
    if (reach) this.reach.material.uniforms.uA.value = 1;
    for (let i = gi; i < GLOWS; i++) this.glows[i].visible = false;
    // the next leg's lane after a carom, flashing as it goes
    if (this.lane && this.lane.t < 0.5) {
      const L = this.lane; L.t += dt;
      const fade = 1 - L.t / 0.5, sx = Math.cos(L.a) * 1.3, sz = -Math.sin(L.a) * 1.3;
      this.two[0].set(L.x, this.gy(L.x, L.z) + 0.05, L.z); const fx = L.x + Math.sin(L.a) * L.len, fz = L.z + Math.cos(L.a) * L.len; this.two[1].set(fx, this.gy(fx, fz) + 0.05, fz);
      RW.v = 2.6; this.core.strip(this.two, lineW, 0.3 * fade, WARN.glow);
      for (const s of [-1, 1]) {
        this.two[0].set(L.x + sx * s, this.gy(L.x, L.z) + 0.06, L.z + sz * s);
        const ex = L.x + Math.sin(L.a) * L.len + sx * s, ez = L.z + Math.cos(L.a) * L.len + sz * s;
        this.two[1].set(ex, this.gy(ex, ez) + 0.06, ez);
        RW.v = 0.08; this.glow.strip(this.two, lineGlowW, 0.4 * fade, WARN.glow); this.core.strip(this.two, lineW, 0.9 * fade, WARN.edge);
      }
    }
    // the fissures: glowing cracks across the true lane through the wind-up; the curtain; the lava lane crusting over
    for (const a of g.areas) {
      if (a.kind !== 'lava_fissure' || !a.fence) continue;
      const pts = a.fence.pts;
      if (a.t < a.delay) {
        const k = Math.min(1, a.t / Math.max(0.01, a.delay)), n = this.crack(pts, Math.min(1, k * 1.6), 0.05), seg = this.pts.slice(0, n);
        if (n < 2) continue;
        // the lane's true width in the warning colour; a dark crack running out, glowing molten inside as it opens
        RW.v = a.fence.width; this.core.strip(seg, lineW, 0.2 + 0.15 * k, WARN.glow);
        RW.v = 0.16 + 0.1 * k; this.core.strip(seg, lineW, 0.95, CRUST.edge);
        RW.v = 0.06 + 0.08 * k; this.glow.strip(seg, lineGlowW, 0.3 + 0.4 * k, LAVA.glow); this.core.strip(seg, lineW, 0.4 + 0.6 * k, MOLTEN);
        continue;
      }
      const live = a.t - a.delay, end = a.duration;
      // its curtain and lava lane: a free pair taken when it opens, the strips rebuilt in place along its crack
      let F = this.fiss.find((q) => q.id === a.id);
      if (!F) {
        F = this.fiss.find((q) => q.id === -1 || !g.areas.some((x) => x.id === q.id)) || this.fiss[0];
        F.id = a.id; this.strips(F, pts, a.fence.width);
        const mid = pts[2]; this.bang(mid[0], this.gy(mid[0], mid[1]) + 1, mid[1], 2.4);
        for (let i = 0; i < pts.length; i++) this.fire.burst(pts[i][0], this.gy(pts[i][0], pts[i][1]) + 0.3, pts[i][1], 6, 1.6, 1);
      }
      F.seen = true;
      const cool = Math.min(1, Math.max(0, (live - (end - 1.5)) / 1.5)), L = F.lane.material.uniforms;
      L.uT.value = this.time; L.uCool.value = 0.15 + 0.85 * cool; L.uHot.value = Math.max(0, 1 - live / 0.8); L.uA.value = Math.min(1, live / 0.08) * (1 - Math.max(0, (live - end + 0.3) / 0.3)); F.lane.visible = true;
      // the curtain of fire: up the whole length at once, then torn into tongues and sinking
      const ct = live, rise = Math.min(1, ct / 0.1), cf = Math.max(0, Math.min(1, (0.95 - ct) / 0.3));
      F.curtain.visible = cf > 0; F.curtain.position.y = F.gy; F.curtain.scale.y = 2.8 * rise * (1 - 0.45 * Math.max(0, ct - 0.25));
      for (const q of F.curtain.children) { const U = q.material.uniforms; U.uTime.value = this.time; U.uCut.value = 0.03 + 0.4 * Math.max(0, ct - 0.25); U.uCool.value = 0.03 + 0.2 * Math.max(0, ct - 0.3); U.uAlpha.value = cf; }
      if (dust && Math.random() < 0.5 * (1 - cool)) { const p = pts[1 + Math.floor(Math.random() * 3)]; this.fire.burst(p[0], this.gy(p[0], p[1]) + 0.2, p[1], 1, 0.8, 1.2); }
    }
    for (const F of this.fiss) { if (!F.seen) { F.lane.visible = false; F.curtain.visible = false; if (F.id !== -1 && !g.areas.some((x) => x.id === F.id)) F.id = -1; } F.seen = false; }
    // the cover slabs: heaving up, standing, their shadows laid on the ground; cracking and sinking after the burst
    for (const C of this.covers) {
      if (C.t >= 9) { C.m.visible = false; C.sh.visible = false; continue; }
      C.t += dt;
      if (C.t < 0) continue;
      if (C.t - dt < 0) { this.chipsAt(C.x, C.z, 5, 2, 3.5); this.cloud(C.x, C.z, 0.5, 4, 1.2); }
      const up = Math.min(1, C.t / 0.22), over = up < 1 ? up : 1 + 0.08 * Math.sin(Math.min(1, (C.t - 0.22) / 0.15) * Math.PI);
      const sink = C.burst ? Math.min(1, (C.t - C.end) / 0.6) : 0, h = over * (1 - sink);
      if (C.burst && sink >= 1) { C.t = 9; continue; }
      place(C.m, C.x, -0.2 + 2.2 * h - 2.2, C.z); C.m.position.y += 0; C.m.scale.set(C.w * 0.5, 2.2, 0.5); C.m.rotation.set(C.burst ? 0.3 * sink : 0, C.a, C.burst ? 0.2 * sink : 0); C.m.visible = h > 0.02;
      C.m.position.y = this.gy(C.x, C.z) - 2.2 + 2.2 * h;
      // the shadow: from just behind it out to `shadow` m, widening with the rule's spread
      const S = C.sh; S.visible = !C.burst && up > 0.5;
      if (S.visible) {
        S.position.set(C.x + Math.sin(C.a) * 0.3, this.gy(C.x, C.z) + 0.05, C.z + Math.cos(C.a) * 0.3); S.rotation.set(0, C.a, 0);
        S.scale.set(C.w + (C.shadow || 4.5) * 0.12, 1, (C.shadow || 4.5) - 0.3); S.material.uniforms.uA.value = Math.min(1, (C.t - 0.1) / 0.3);
      }
      if (C.burst && dust) this.puff(C.x, this.gy(C.x, C.z) + 0.5, C.z, 0, 0.5, 0, 1.4, 0.8);
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
    for (let i = 0; i < FLASHES; i++) {
      const F = this.flashes[i], R = this.rays[i];
      if (F.t < 0.2) { F.t += dt; F.m.visible = F.t < 0.18; F.m.position.set(F.x, F.y, F.z); F.m.quaternion.copy(cam.quaternion); F.m.scale.setScalar(F.size * (F.t < 0.03 ? 0.5 + F.t / 0.06 : 1)); F.m.material.uniforms.uT.value = F.t / 0.18; } else F.m.visible = false;
      if (R.t < 0.34) {
        R.t += dt; const rk = Math.min(1, R.t / 0.34);
        for (let j = 0; j < RAYS; j++) {
          this.two[0].set(R.x, R.y, R.z).addScaledVector(R.d[j], R.len[j] * 0.15 * rk);
          this.two[1].set(R.x, R.y, R.z).addScaledVector(R.d[j], R.len[j] * (0.4 + 0.6 * Math.sqrt(rk)));
          RW.v = 0.16 * (1 - rk); this.glow.strip(this.two, taperGlowW, 1 - rk, LAVA.glow); this.core.strip(this.two, taperW, 1 - rk * rk, AMBER.edge);
        }
      }
    }
    for (const W of this.waves) {
      if (W.t >= W.life) continue;
      W.t += dt;
      const u = Math.min(1, W.t / W.life), R = W.R0 + (W.R1 - W.R0) * (1 - (1 - u) * (1 - u)), y = this.gy(W.x, W.z) + 0.1;
      for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(W.x + Math.sin(a) * R, y, W.z + Math.cos(a) * R); }
      RW.v = (W.R1 > 6 ? 0.5 : 0.22) * (1 - u) + 0.04; this.glow.strip(this.ring, lineGlowW, 0.6 * (1 - u), W.look.glow); this.core.strip(this.ring, lineW, 0.9 * (1 - u), W.look.edge);
    }
    this.core.end(); this.glow.end();
  }
}
