// The duskmane stalker's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched
// first: a big cat stalks low and freezes before an explosive rush, melts into the dusk so prey sees only its tracks,
// swats with its forepaws, and sprints in on a line it cannot bend as sharply as dodging prey. Dusk light: violet and
// pale lilac like its mane; danger zones in the warm warning colour at their true size.
// - Twin swat (core monsterSwing of dusk_swat, hit 1 and 2): three claw slashes of dusk light raked across the prey,
//   one way then the other, lilac sparks.
// - Dusk stalk (core duskVanish, pawPrint, duskReveal, duskLunge, duskRake): a violet mist where it fades; glowing paw
//   prints left on the ground as it creeps, fading slowly; when it shows itself, its eyes glint and its lane through
//   the hero is marked, filling to the lunge; dust off its spring; claw slashes on what it rakes.
// - Sprint chase (core sprintGo, sprintHit, sprintSkid): the stretch of ground it is about to cross lit ahead of it as
//   it runs (it bends after the hero, so the band follows its heading); dust off every stride; on a hit a burst and a
//   ring; overrun, a long skid of dust.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, taperW, taperGlowW, lineW, lineGlowW, lightSprite, starTexture } from './light-kit.js';

const PRINTS = 28, SLASHES = 6, LANES = 4;
const DUSK = { edge: [1, 0.95, 1], glow: [0.6, 0.35, 1] }, STAR = { core: [1, 0.97, 1], glow: [0.65, 0.4, 1] };
const WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] }, MIST = new THREE.Color(0xb9a6e6);
// a paw print: a lobed pad and four toes, soft-edged, glowing lilac (numbers in uniforms)
const PRINT_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const PRINT_FS = `varying vec2 vP; uniform float uA; uniform vec3 uC;
  float blob(vec2 p, vec2 c, vec2 r){ vec2 d = (p - c)/r; return 1.0 - smoothstep(0.7, 1.0, length(d)); }
  void main(){ float m = blob(vP, vec2(0.0, -0.28), vec2(0.42, 0.34));
    m = max(m, blob(vP, vec2(-0.45, 0.22), vec2(0.15, 0.2))); m = max(m, blob(vP, vec2(-0.16, 0.48), vec2(0.15, 0.2)));
    m = max(m, blob(vP, vec2(0.16, 0.48), vec2(0.15, 0.2))); m = max(m, blob(vP, vec2(0.45, 0.22), vec2(0.15, 0.2)));
    if (m < 0.01) discard;
    gl_FragColor = vec4(uC*(0.6 + 0.4*m), m*uA); }`;

export class StalkerFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    // the claw slashes are drawn over the bodies they cross (the cat's head is often in front of its prey)
    this.sCore = new Ribbon(scene, monster.camera, 400, CORE_FS, THREE.NormalBlending);
    this.sGlow = new Ribbon(scene, monster.camera, 400, GLOW_FS, THREE.AdditiveBlending);
    for (const r of [this.sCore, this.sGlow]) { r.mesh.material.depthTest = false; r.mesh.renderOrder = 12; }
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); plane.userData.shared = true;
    this.prints = Array.from({ length: PRINTS }, () => {
      const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(0xc9b2ff) } }, vertexShader: PRINT_VS, fragmentShader: PRINT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m); return { m, t: 9 };
    });
    this.printI = 0;
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.lanes = Array.from({ length: LANES }, () => { const m = new THREE.Mesh(lane, mat(0xff7a3a)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });
    this.laneI = 0;
    this.edge = [new THREE.Vector3(), new THREE.Vector3()];
    this.slashes = Array.from({ length: SLASHES }, () => ({ t: 9, x: 0, y: 0, z: 0, a: 0, dir: 1 }));
    this.slashI = 0;
    this.line = Array.from({ length: 9 }, () => new THREE.Vector3());
    this.eyes = Array.from({ length: 2 }, () => { const s = lightSprite(scene, starTexture('arcane'), true, 11); s.material.color.setRGB(0.9, 0.8, 1); return { s, t: 9 }; });
    this.eyeAt = new THREE.Vector3(); this.eyeA = 0;
    this.dustT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  mist(x, y, z, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 0.6 + Math.random() * 1.6; this.monster.call?.dust(x + Math.sin(a) * 0.4, y + 0.3 + Math.random() * 0.6, z + Math.cos(a) * 0.4, Math.sin(a) * v, 0.6, Math.cos(a) * v, 1.1, 0.7); } }
  sparkle(x, y, z, a, n) { if (this.fx) for (let i = 0; i < n; i++) { const d = a + (Math.random() - 0.5) * 2, v = 1.5 + Math.random() * 3; this.fx.add(x, y, z, Math.sin(d) * v, 1 + Math.random() * 2, Math.cos(d) * v, { color: i % 3 ? 0xb89cff : 0xffffff, size: 0.12, sizeEnd: 0.02, life: 0.45, drag: 2 }); } }
  slash(x, y, z, a, dir) { Object.assign(this.slashes[this.slashI++ % SLASHES], { t: 0, x, y, z, a, dir }); }

  /** The stalker's paw strike (core monsterSwing of dusk_swat); true when drawn here. */
  swing(e) {
    if (e.type !== 'duskmane_stalker') return false;
    const y = this.gy(e.x, e.z), at = e.at, dir = e.hit === 2 ? -1 : 1;
    const px = at ? at[0] : e.x + Math.sin(e.angle) * e.range * 0.7, pz = at ? at[1] : e.z + Math.cos(e.angle) * e.range * 0.7;
    this.slash(px, y + 0.85, pz, e.angle, dir);
    this.sparkle(px, y + 0.8, pz, e.angle, at ? 10 : 4);
    if (at) this.monster.burstStar?.(px, y + 0.85, pz, 0.4, STAR, 0xb89cff, 0xffffff);
    this.monster.onShake?.(0.05, 0.06);
    return true;
  }

  /** The stalker's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id);
    if (m?.type !== 'duskmane_stalker') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'duskVanish': this.mist(e.x, y, e.z, 10); return true;
      case 'pawPrint': {
        const P = this.prints[this.printI++ % PRINTS], s = e.foot ? 1 : -1, ox = Math.cos(e.angle) * 0.18 * s, oz = -Math.sin(e.angle) * 0.18 * s;
        P.m.position.set(e.x + ox, this.gy(e.x + ox, e.z + oz) + 0.04, e.z + oz); P.m.rotation.set(0, e.angle, 0); P.m.scale.setScalar(0.42);
        P.t = 0; P.m.visible = true;
        return true;
      }
      case 'duskReveal': {
        this.mist(e.x, y, e.z, 8);
        this.eyeAt.set(e.x + Math.sin(e.angle) * 0.9, y + 0.95, e.z + Math.cos(e.angle) * 0.9); this.eyeA = e.angle;
        for (const E of this.eyes) E.t = 0;
        return true;
      }
      case 'duskLunge': for (let i = 0; i < 8; i++) { const a = e.angle + Math.PI + (Math.random() - 0.5) * 1.4; this.monster.call?.dust(e.x, y + 0.12, e.z, Math.sin(a) * 2.6, 0.5, Math.cos(a) * 2.6, 0.8, 0.45); } return true;
      case 'duskRake':
        this.slash(e.x, y + 0.85, e.z, e.angle, 1); this.slash(e.x, y + 0.75, e.z, e.angle, -1);
        this.monster.burstStar?.(e.x, y + 0.85, e.z, 0.6, STAR, 0xb89cff, 0xffffff);
        this.sparkle(e.x, y + 0.8, e.z, e.angle, 14);
        this.monster.onShake?.(0.1, 0.1);
        return true;
      case 'sprintGo': for (let i = 0; i < 8; i++) { const a = e.angle + Math.PI + (Math.random() - 0.5) * 1.6; this.monster.call?.dust(e.x, y + 0.12, e.z, Math.sin(a) * 3, 0.5, Math.cos(a) * 3, 0.8, 0.5); } return true;
      case 'sprintHit':
        this.monster.burstStar?.(e.x, y + 0.8, e.z, 0.7, STAR, 0xb89cff, 0xffffff);
        this.monster.call?.ring(e.x, y + 0.15, e.z, 1.5, MIST, 0.35);
        this.slash(e.x, y + 0.8, e.z, e.angle, 1);
        this.sparkle(e.x, y + 0.8, e.z, e.angle, 12);
        for (let i = 0; i < 8; i++) { const a = e.angle + (Math.random() - 0.5) * 2; this.monster.call?.dust(e.x, y + 0.12, e.z, Math.sin(a) * 3, 0.5, Math.cos(a) * 3, 0.8, 0.5); }
        this.monster.onShake?.(0.12, 0.12);
        return true;
      case 'sprintSkid':
        for (let i = 0; i < 14; i++) { const a = e.angle + (Math.random() - 0.5) * 1.2, v = 1.5 + Math.random() * 3; this.monster.call?.dust(e.x - Math.sin(e.angle) * i * 0.12, y + 0.12, e.z - Math.cos(e.angle) * i * 0.12, Math.sin(a) * v, 0.4, Math.cos(a) * v, 0.9, 0.55); }
        return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin(); this.sCore.begin(); this.sGlow.begin();
    this.laneI = 0;
    const puff = (this.dustT -= dt) <= 0;
    if (puff) this.dustT = 0.08;
    for (const m of g.monsters) {
      if (m.type !== 'duskmane_stalker' || m.dead) continue;
      const S = m.stalk;
      // shown again: its lunge's lane through the hero, filling to the spring
      if (S && S.phase === 'aim') { const atk = m.def.attacks[S.name]; this.band(m.x, m.z, S.angle, atk.width, atk.lunge, Math.min(1, S.t / atk.aim)); }
      // crouched to sprint: the first stretch of its run marked, filling to the start
      if (m.state === 'windup' && m.windup?.name === 'sprint_chase') this.band(m.x, m.z, m.windup.angle, (m.r + 0.4) * 2, 4.5, Math.min(1, m.stateT / m.windup.total));
      // sprinting: the ground it is about to cross lit ahead of it (it bends after its prey, so this follows its heading)
      if (m.sprint) {
        const atk = m.def.attacks[m.sprint.name];
        this.band(m.x, m.z, m.sprint.angle, (m.r + 0.4) * 2, Math.min(4.5, atk.speed * Math.max(0, atk.duration - m.sprint.t)), 1);
        if (puff) { const a = m.facing + Math.PI + (Math.random() - 0.5); this.monster.call?.dust(m.x, this.gy(m.x, m.z) + 0.1, m.z, Math.sin(a) * 2, 0.4, Math.cos(a) * 2, 0.7, 0.4); }
      }
      // creeping unseen: a faint shimmer of dusk where it walks
      if (S && S.phase === 'creep' && puff && Math.random() < 0.35 && this.fx) this.fx.add(m.x + (Math.random() - 0.5), this.gy(m.x, m.z) + 0.3 + Math.random() * 0.5, m.z + (Math.random() - 0.5), 0, 0.4, 0, { color: 0xb89cff, size: 0.1, sizeEnd: 0.02, life: 0.6, drag: 1 });
    }
    for (let i = this.laneI; i < LANES; i++) this.lanes[i].visible = false;
    // paw prints: in at once, glowing, fading slowly
    for (const P of this.prints) {
      if (P.t >= 3) continue;
      P.t += dt;
      P.m.material.uniforms.uA.value = Math.min(1, P.t / 0.15) * Math.max(0, Math.min(1, (3 - P.t) / 1.2)) * 0.9;
      if (P.t >= 3) P.m.visible = false;
    }
    // its eyes glint as it shows itself
    for (let i = 0; i < 2; i++) {
      const E = this.eyes[i];
      if (E.t >= 0.45) { E.s.visible = false; continue; }
      E.t += dt;
      const s = i ? 1 : -1, k = Math.sin(Math.min(1, E.t / 0.45) * Math.PI);
      E.s.position.set(this.eyeAt.x + Math.cos(this.eyeA) * 0.12 * s, this.eyeAt.y, this.eyeAt.z - Math.sin(this.eyeA) * 0.12 * s);
      E.s.scale.setScalar(0.7 * k); E.s.material.opacity = k; E.s.material.rotation = E.t * 4; E.s.visible = true;
    }
    // claw slashes: three curved strokes of dusk light raked across, in a blink, then thinning away
    for (const L of this.slashes) {
      if (L.t >= 0.32) continue;
      L.t += dt;
      const grow = Math.min(1, L.t / 0.06), fade = L.t < 0.1 ? 1 : Math.max(0, 1 - (L.t - 0.1) / 0.22);
      const sx = Math.cos(L.a), sz = -Math.sin(L.a), fx = Math.sin(L.a), fz = Math.cos(L.a);
      for (let c = -1; c <= 1; c++) {
        const off = c * 0.22;
        for (let j = 0; j < this.line.length; j++) {
          const u = (j / (this.line.length - 1)) * grow, across = (u - 0.5) * 1.5 * L.dir, down = 0.55 - 1.1 * u, bow = Math.sin(u * Math.PI) * 0.16;
          this.line[j].set(L.x + sx * across + fx * (off * 0.4 + bow) - sx * off * 0.3, L.y + down * 0.6 + off * 0.5, L.z + sz * across + fz * (off * 0.4 + bow) - sz * off * 0.3);
        }
        RW.v = 0.12 * (1 - Math.abs(c) * 0.25); this.sGlow.strip(this.line, taperGlowW, 0.8 * fade, DUSK.glow); this.sCore.strip(this.line, taperW, fade, DUSK.edge);
      }
    }
    this.core.end(); this.glow.end(); this.sCore.end(); this.sGlow.end();
  }

  /** A warning band on the ground from (x0, z0) along a, its plain fill grown to k of its length, a crisp edge. */
  band(x0, z0, a, width, len, k) {
    if (this.laneI + 2 > LANES || len < 0.1) return;
    const y = this.gy(x0, z0) + 0.06, B = this.lanes[this.laneI++], F = this.lanes[this.laneI++];
    B.position.set(x0, y, z0); B.rotation.set(0, a, 0); B.scale.set(width, 1, len); B.material.opacity = 0.16; B.visible = true;
    F.position.set(x0, y + 0.004, z0); F.rotation.set(0, a, 0); F.scale.set(width, 1, Math.max(0.01, len * k)); F.material.opacity = 0.3; F.visible = true;
    const sx = Math.cos(a) * width * 0.5, sz = -Math.sin(a) * width * 0.5, ex = Math.sin(a) * len, ez = Math.cos(a) * len;
    for (const s of [1, -1]) {
      this.edge[0].set(x0 + sx * s, y + 0.01, z0 + sz * s); this.edge[1].set(x0 + sx * s + ex, y + 0.01, z0 + sz * s + ez);
      RW.v = 0.06; this.glow.strip(this.edge, lineGlowW, 0.35, WARN.glow); this.core.strip(this.edge, lineW, 0.85, WARN.edge);
    }
  }
}
