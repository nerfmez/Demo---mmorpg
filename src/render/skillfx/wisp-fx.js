// The marsh wisp's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first: a
// will-o'-the-wisp is a ghost light over a bog - marsh gas (methane, phosphine) welling up and catching fire by itself -
// that in folklore leads travellers astray into the water and scatters when they come near. Cold blue flame round a
// gold heart (its crystal); round 2 (owner, 2026-11-06): every light it gives out is the orange of that crystal, its
// body a see-through glow (monsters.js animWisp). Danger zones in the warm warning colour at their true size.
// - Lost lights (core projectiles wisp_orb, weaving): each an orange flame with a warm white heart, trailing a gold
//   ribbon along the path it weaves, sparks shed behind; on a hit a gold burst (core impact).
// - Marsh gas (areas marsh_gas, marked by vfx.js): through the wind-up a dark puddle spreads at every spot with a teal
//   rim, glossy bubbles welling up out of it; each catches in turn (core burst): a jet of Firebolt's fire in the
//   crystal's gold (the Flame Geyser jet, lower), embers, a ring.
// - Bog lure (area bog_pool, drawn here): through the wind-up the bog is ringed and its ring closes in; orange lights
//   gather and dance over it; the bog itself is murky marsh water with a ragged shore, rings where bubbles break, low
//   mist and the lights mirrored in it; lured (core lure, the hero's lure status), gold threads run from the lights to the hero
//   and little lights circle the hero's head.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, tailW, tailGlowW } from './light-kit.js';
import { lightSprite, glowTexture } from './light-kit.js';
import { GeyserFx } from './geyser-fx.js';

const ORBS = 6, HIST = 14;
const GOLD = { edge: [1, 0.92, 0.6], glow: [1, 0.55, 0.12] }, LIGHTS = 6, PUDDLES = 10, POOLS = 3;
// its marsh fire: Firebolt's flame (the trapper's Flame Geyser jet) in its crystal's gold (round 1's blue outside a
// gold heart mixed to a muddy green)
const FIRE = { uRim: '#ff7418', uBody: '#ffab36', uHot: '#ffe48c', uCore: '#fff8e8' }, GAS_H = 2.2;
const WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const STAR = { core: [1, 1, 0.9], glow: [1, 0.6, 0.18] }, RING = new THREE.Color(0xffc070);
// the bog (round 3, owner: round 2's dark disc with a bright rim and rings looked odd): murky marsh water with a ragged
// shore that fades into the ground, slow drifting scum near the shore, a dull sheen, and rings spreading where bubbles
// break (uRip: x, y in the pool's -1..1, age 0..1, on). Numbers in uniforms.
const RIPS = 4;
const POOL_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const POOL_FS = `varying vec2 vP; uniform float uT, uA; uniform vec3 uDeep, uMurk, uScum, uSheen; uniform vec4 uRip[${RIPS}];
  float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
    return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){ float r = length(vP), e = r + (vn(vP*5.0) - 0.5)*0.1 + (vn(vP*13.0) - 0.5)*0.04;
    if (e > 1.0) discard;
    float scum = vn(vP*3.0 + vec2(uT*0.05, -uT*0.03))*0.6 + vn(vP*8.0 - uT*0.04)*0.4;
    vec3 c = mix(uDeep, uMurk, smoothstep(0.05, 0.95, r)*0.85);
    c = mix(c, uScum, smoothstep(0.55, 0.78, scum)*0.55*smoothstep(0.35, 0.9, r));
    float rip = 0.0;
    for (int i = 0; i < ${RIPS}; i++) { vec4 q = uRip[i]; float d = length(vP - q.xy); rip += exp(-pow((d - 0.05 - q.z*0.28)/0.022, 2.0))*(1.0 - q.z)*q.w; }
    float sheen = (1.0 - smoothstep(0.0, 0.45, abs(vP.x*0.8 + vP.y + 0.15)))*(0.6 + 0.4*vn(vP*4.0 + uT*0.15))*(1.0 - smoothstep(0.6, 0.95, r));
    c += uSheen*(sheen*0.22 + rip*0.6);
    c = mix(c, uDeep*0.7, smoothstep(0.8, 1.0, e)*0.35);
    gl_FragColor = vec4(c, (1.0 - smoothstep(0.9, 1.0, e))*0.92*uA); }`;
const _v = new THREE.Vector3();

export class WispFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const warm = glowTexture('fire');
    this.orbs = Array.from({ length: ORBS }, () => {
      // an orange flame round a warm white heart, like its crystal (owner, 2026-11-06)
      const halo = lightSprite(scene, warm, true, 10), heart = lightSprite(scene, warm, true, 11);
      halo.material.color.setRGB(1, 0.5, 0.12); heart.material.color.setRGB(1, 0.92, 0.72);
      halo.visible = heart.visible = false;
      return { id: -1, halo, heart, pts: Array.from({ length: HIST }, () => new THREE.Vector3()), n: 0, seen: false };
    });
    this.ring = Array.from({ length: 41 }, () => new THREE.Vector3());
    // the gas jets: a Flame Geyser of its own, lower, recoloured
    this.geyser = new GeyserFx(scene, monster.camera, null, GAS_H);
    for (const j of this.geyser.jets) for (const m of [...j.jet.children, ...j.tongues.map((q) => q.m)]) for (const [k, c] of Object.entries(FIRE)) m.material.uniforms[k] = { value: new THREE.Color(c) };
    this.geyser.light.color.set('#ffb860');
    // murky puddles where the gas wells up, and the lights that dance over its bog
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), rim = new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2);
    disc.userData.shared = rim.userData.shared = true;
    const mat = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.puddles = Array.from({ length: PUDDLES }, () => {
      const d = new THREE.Mesh(disc, mat(0x1c3438, 0.5)), r = new THREE.Mesh(rim, mat(0x6fd8e8, 0.5, true));
      for (const m of [d, r]) { m.visible = false; m.renderOrder = 3; m.frustumCulled = false; scene.add(m); }
      return { d, r, id: -1 };
    });
    this.lights = Array.from({ length: LIGHTS }, () => {
      const g = lightSprite(scene, warm, true, 10), h = lightSprite(scene, warm, true, 11);
      g.material.color.setRGB(1, 0.6, 0.2); h.material.color.setRGB(1, 0.95, 0.75);
      return { g, h };
    });
    // the bogs (core areas bog_pool) and the lights mirrored in them
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); plane.userData.shared = true;
    this.pools = Array.from({ length: POOLS }, () => {
      const rips = Array.from({ length: RIPS }, () => new THREE.Vector4(0, 0, 1, 0));
      const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uDeep: { value: new THREE.Color(0x121a12) }, uMurk: { value: new THREE.Color(0x2c3a24) }, uScum: { value: new THREE.Color(0x5f7236) }, uSheen: { value: new THREE.Color(0xa8c4b8) }, uRip: { value: rips } }, vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 3; m.frustumCulled = false; scene.add(m); m.userData.rips = rips; m.userData.ri = 0; return m;
    });
    this.mirror = Array.from({ length: LIGHTS }, () => {
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: warm, color: 0xff8a30, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m); return m;
    });
    this.thread = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.bubbleT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** A lost light's hit (core impact of wisp_orb). */
  impact(e) {
    const y = this.gy(e.x, e.z) + 1.0;
    this.monster.burstStar?.(e.x, y, e.z, 0.6, STAR, 0xffb050, 0xfff4d8);
    this.monster.call?.ring(e.x, y, e.z, 0.7, RING, 0.3);
    if (this.fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 2.5; this.fx.add(e.x, y, e.z, Math.sin(a) * v, 1 + Math.random() * 2, Math.cos(a) * v, { color: i % 3 ? 0xffa040 : 0xfff0c8, size: 0.16, sizeEnd: 0.03, life: 0.45, drag: 2 }); }
  }
  /** A spot of marsh gas catching fire (core burst of marsh_gas): a jet of gold fire out of its puddle. */
  ignite(e) {
    const y = this.gy(e.x, e.z);
    this.geyser.erupt(e.x, e.z, e.radius);
    if (this.fx) for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283, r = Math.random() * e.radius * 0.5; this.fx.add(e.x + Math.sin(a) * r, y + 0.4, e.z + Math.cos(a) * r, Math.sin(a) * 0.8, 3 + Math.random() * 3, Math.cos(a) * 0.8, { color: i % 2 ? 0xffc870 : 0xff8a30, size: 0.12, sizeEnd: 0.03, life: 0.7, gravity: 3, drag: 1 }); }
    this.monster.onShake?.(0.05, 0.06);
  }

  /** The marsh wisp's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'marsh_wisp') return false;
    if (e.type === 'wispOrbs') { this.monster.burstStar?.(m.x, this.gy(m.x, m.z) + 1.2, m.z, 0.5, STAR, 0xffb050, 0xfff4d8); return true; }
    if (e.type === 'lure') { this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 0.1, e.z, 2.2, RING, 0.5); return true; }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    // the lost lights
    for (const O of this.orbs) O.seen = false;
    for (const pr of g.projectiles) {
      if (pr.kind !== 'wisp_orb') continue;
      let O = this.orbs.find((q) => q.id === pr.id);
      if (!O) { O = this.orbs.find((q) => q.id === -1 || !g.projectiles.some((p) => p.id === q.id)); if (!O) continue; O.id = pr.id; O.n = 0; }
      O.seen = true;
      const y = this.gy(pr.x, pr.z) + 1.0 + Math.sin(this.time * 9 + pr.id) * 0.06;
      O.halo.position.set(pr.x, y, pr.z); O.halo.scale.setScalar(1.7 + 0.2 * Math.sin(this.time * 17 + pr.id)); O.halo.material.opacity = 0.95; O.halo.visible = true;
      O.heart.position.set(pr.x, y, pr.z); O.heart.scale.setScalar(0.38); O.heart.material.opacity = 1; O.heart.visible = true;
      // its weaving path as a ribbon of light behind it
      if (O.n === 0) for (const p of O.pts) p.set(pr.x, y, pr.z);
      for (let j = 0; j < HIST - 1; j++) O.pts[j].copy(O.pts[j + 1]);
      O.pts[HIST - 1].set(pr.x, y, pr.z); O.n++;
      RW.v = 0.32; this.glow.strip(O.pts, tailGlowW, 0.9, GOLD.glow); this.core.strip(O.pts, tailW, 0.8, GOLD.edge);
      if (this.fx && Math.random() < 0.8) this.fx.add(pr.x, y, pr.z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, { color: Math.random() < 0.5 ? 0xff9a3a : 0xffe2a8, size: 0.2, sizeEnd: 0.03, life: 0.4, drag: 1.5 });
    }
    for (const O of this.orbs) if (!O.seen) { O.id = -1; O.halo.visible = O.heart.visible = false; }
    // the marsh gas welling up through the wind-up: a murky puddle spreading at each spot, glossy bubbles rising and
    // popping out of it
    const bubble = (this.bubbleT -= dt) <= 0;
    if (bubble) this.bubbleT = 0.09;
    let np = 0, pool = null, nb = 0, poolA = 0;
    for (const a of g.areas) {
      if (a.kind === 'bog_pool' && a.t >= a.delay && nb < POOLS) {
        pool = a;
        const live = a.t - a.delay, fade = Math.max(0, Math.min(1, live * 5) * Math.min(1, (a.duration - live) * 2)), M = this.pools[nb++];
        M.position.set(a.x, this.gy(a.x, a.z) + 0.06, a.z); M.scale.setScalar(a.radius * (0.7 + 0.3 * Math.min(1, live / 0.25)));
        M.material.uniforms.uT.value = this.time; M.material.uniforms.uA.value = poolA = fade; M.visible = true;
        // a bubble breaks now and then: a ring spreads from it; low mist drifts over the water
        for (const q of M.userData.rips) if (q.w) { q.z += dt / 1.1; if (q.z >= 1) q.w = 0; }
        if (bubble && Math.random() < 0.3) {
          const ang = Math.random() * 6.283, f = 0.15 + Math.random() * 0.55, q = M.userData.rips[M.userData.ri++ % RIPS];
          q.set(Math.sin(ang) * f, -Math.cos(ang) * f, 0, 1);
          this.monster.bubbles?.add(a.x + Math.sin(ang) * f * a.radius, M.position.y + 0.04, a.z + Math.cos(ang) * f * a.radius, 0, 0.25 + Math.random() * 0.2, 0, 0.1 + Math.random() * 0.1, 0.35 + Math.random() * 0.2, 0xc8dcc0);
        }
        if (bubble && Math.random() < 0.25 && this.host.vfx?.dust) { const ang = Math.random() * 6.283, r = Math.random() * a.radius * 0.8; this.host.vfx.dust.add(a.x + Math.sin(ang) * r, M.position.y + 0.25, a.z + Math.cos(ang) * r, (Math.random() - 0.5) * 0.4, 0.08, (Math.random() - 0.5) * 0.4, { color: 0xdfe8e0, size: 1.1, sizeEnd: 2.2, life: 1.6, drag: 0.5, alpha: 0.22 }); }
      }
      if (a.kind !== 'marsh_gas' || np >= PUDDLES) continue;
      const P = this.puddles[np++], q = Math.min(1, a.t / a.delay), after = a.t - a.delay, fade = after > 0 ? Math.max(0, 1 - after / 0.3) : 1, y = this.gy(a.x, a.z) + 0.05;
      P.d.position.set(a.x, y, a.z); P.r.position.set(a.x, y + 0.004, a.z);
      P.d.scale.setScalar(a.radius * (0.35 + 0.6 * q)); P.r.scale.setScalar(a.radius * (0.35 + 0.6 * q));
      P.d.material.opacity = 0.5 * fade; P.r.material.opacity = (0.25 + 0.35 * q) * fade * (0.8 + 0.2 * Math.sin(this.time * 9 + a.id));
      P.d.visible = P.r.visible = true;
      if (after < 0 && bubble && Math.random() < 0.55) {
        const ang = Math.random() * 6.283, r = Math.random() * a.radius * 0.5;
        this.monster.bubbles?.add(a.x + Math.sin(ang) * r, y + 0.1, a.z + Math.cos(ang) * r, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 0.16 + 0.22 * q, 0.5 + Math.random() * 0.4, 0x9fe8f0);
      }
    }
    for (let i = np; i < PUDDLES; i++) this.puddles[i].d.visible = this.puddles[i].r.visible = false;
    for (let i = nb; i < POOLS; i++) this.pools[i].visible = false;
    // the bog: through the wind-up a warning ring, its fill growing to the end; its lights gathering over it, then
    // dancing over the burning water while it lasts
    let bog = null, k = 1;
    for (const m of g.monsters) {
      if (m.type !== 'marsh_wisp' || m.dead || m.state !== 'windup' || m.windup?.name !== 'bog_lure') continue;
      const atk = m.def.attacks.bog_lure, x = m.windup.tx, z = m.windup.tz, y = this.gy(x, z) + 0.06;
      k = Math.min(1, m.stateT / m.windup.total);
      bog = { x, z, R: atk.radius };
      for (const [R, w, o] of [[atk.radius, 0.08, 0.9], [atk.radius * k, 0.05, 0.6]]) {
        for (let j = 0; j < this.ring.length; j++) { const a = (j / (this.ring.length - 1)) * Math.PI * 2; this.ring[j].set(x + Math.sin(a) * R, y, z + Math.cos(a) * R); }
        RW.v = w; this.glow.strip(this.ring, lineGlowW, 0.4 * o, WARN.glow); this.core.strip(this.ring, lineW, o, WARN.edge);
      }
      break;
    }
    if (!bog && pool) bog = { x: pool.x, z: pool.z, R: pool.radius };
    for (let i = 0; i < LIGHTS; i++) {
      const L = this.lights[i];
      if (!bog) { L.g.visible = L.h.visible = false; continue; }
      const a = this.time * 0.7 + (i / LIGHTS) * Math.PI * 2, r = bog.R * (0.45 + 0.2 * Math.sin(this.time * 1.3 + i * 2)), x = bog.x + Math.sin(a) * r, z = bog.z + Math.cos(a) * r;
      const y = this.gy(x, z) + 0.9 + 0.25 * Math.sin(this.time * 2.4 + i * 1.7), on = Math.min(1, k * 1.3);
      L.g.position.set(x, y, z); L.h.position.set(x, y, z);
      L.g.scale.setScalar(0.9 * on); L.h.scale.setScalar(0.28 * on);
      L.g.material.opacity = 0.65 * on * (0.8 + 0.2 * Math.sin(this.time * 11 + i)); L.h.material.opacity = on;
      L.g.visible = L.h.visible = true;
      // mirrored in the water once the bog is there
      const R = this.mirror[i]; R.visible = !!pool && bog.x === pool.x;
      if (R.visible) { R.position.set(x, this.gy(x, z) + 0.08, z); R.scale.setScalar(0.42 + 0.06 * Math.sin(this.time * 5 + i)); R.material.opacity = 0.45 * poolA; }
    }
    if (!bog) for (const R of this.mirror) R.visible = false;
    // lured: ribbons of gold light from the bog's lights to the hero, little gold lights circling the hero's head
    const p = g.player, Lr = p && !p.dead && p.statuses?.lure;
    if (Lr) {
      const y0 = this.gy(p.x, p.z) + 1.1;
      for (let s = 0; s < 3; s++) {
        const Lt = this.lights[s * 2].g.position;
        for (let j = 0; j < this.thread.length; j++) {
          const u = j / (this.thread.length - 1), dx = Lt.x - p.x, dz = Lt.z - p.z, d = Math.hypot(dx, dz) || 1, wob = Math.sin(u * 7 - this.time * 9 + s * 2) * 0.22 * Math.sin(u * Math.PI);
          this.thread[j].set(p.x + dx * u + (dz / d) * wob, y0 + (Lt.y - y0) * u + Math.sin(u * Math.PI) * 0.35, p.z + dz * u - (dx / d) * wob);
        }
        RW.v = 0.09; this.glow.strip(this.thread, lineGlowW, 0.6, GOLD.glow); this.core.strip(this.thread, lineW, 0.8, GOLD.edge);
      }
      if (bubble && this.fx) for (let i = 0; i < 2; i++) { const a = this.time * 5 + i * Math.PI; this.fx.add(p.x + Math.sin(a) * 0.4, y0 + 0.9, p.z + Math.cos(a) * 0.4, 0, 0.3, 0, { color: 0xffd080, size: 0.15, sizeEnd: 0.04, life: 0.45, drag: 1 }); }
    }
    this.geyser.update(dt);
    this.core.end(); this.glow.end();
  }
}
