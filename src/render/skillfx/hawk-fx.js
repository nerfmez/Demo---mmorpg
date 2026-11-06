// The gale hawk's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. Researched first: a
// hawk hangs in a wind-hover with its head dead still over its prey, folds its wings and stoops, its talons thrown
// forward at the last instant, then beats back up; this one is a storm hawk: its wing beats raise a thunderstorm and its
// feathers are charged like a thunderhead's. Storm light: white cores in a blue glow (Chain Spark's angular bolts), danger zones in
// the warm warning colour at their true size.
// - Stoop (core stoop, stoopHit): through the hover the strike stretch is marked on the ground (a band from short of
//   the spot to past it), its fill growing to the stoop; it crackles with static as it drops; where its talons rake,
//   forks of lightning run out over the ground from a white burst.
// - Thunder wings (core thunderWings, stormBeat, areas storm_bolt marked by vfx.js): static crackles over its wings as
//   it beats; every downstroke a ring of wind off its wings; each bolt comes down out of the sky onto its mark (Chain
//   Spark's angular bolt, a fork off it), a white burst, forks running over the ground, a ring, sparks.
// - Storm feathers (area storm_fence, core stormFeathers, fencePulse): charged feathers shaken loose drift down onto
//   their marks and stand glowing; the strands between neighbours are marked and flicker faintly while the charge
//   builds, then crack bright on every pulse.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, skyAbove } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, lineW, lineGlowW, lightSprite, glowTexture } from './light-kit.js';
import { zig, Rng, CRACKLE_FS, BOLT_GLOW_FS, rewindPts } from './chain-fx.js';

const LANES = 12, FEATHERS = 10, BURSTS = 6, BOLTS = 4;
const WARN = { edge: [1, 0.72, 0.42], glow: [1, 0.4, 0.15] };
const STORM = { core: [1, 1, 1], glow: [0.4, 0.75, 1] }, BOLT = [0.55, 0.85, 1], BOLT_GLOW = [0.3, 0.6, 1];
const RING = new THREE.Color(0xbfe6ff), DUST = new THREE.Color(0xe8dcc4);
const R = new Rng(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const pts = [], ws = [];
let bw = 0, bws = null;
const endK = (x) => Math.min(1, x * 5, (1 - x) * 5);
const boltCoreW = (x, k) => bw * bws[k] * endK(x), boltGlowW = (x, k) => bw * 2.6 * (0.5 + 0.5 * bws[k]) * Math.max(0.3, endK(x));

export class HawkFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 1200, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    this.boltCore = new Ribbon(scene, monster.camera, 2400, CRACKLE_FS, THREE.NormalBlending);
    this.boltGlow = new Ribbon(scene, monster.camera, 2400, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8; this.boltCore.mesh.renderOrder = 11; this.boltGlow.mesh.renderOrder = 10;
    // ground bands: a lane from its near end (z 0) to its far end (z 1)
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.lanes = Array.from({ length: LANES }, () => { const m = new THREE.Mesh(lane, mat(0xff7a3a)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });
    this.laneI = 0;
    this.edge = Array.from({ length: 2 }, () => new THREE.Vector3());
    // a storm feather: a long blade of a vane on a quill, standing in the ground once it lands
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(0.09, 0.16, 0.06, 0.42); shape.quadraticCurveTo(0.02, 0.56, 0, 0.62);
    shape.quadraticCurveTo(-0.05, 0.5, -0.07, 0.36); shape.quadraticCurveTo(-0.07, 0.14, 0, 0);
    const fg = new THREE.ShapeGeometry(shape, 6); fg.userData.shared = true;
    const halo = glowTexture('lightning');
    this.feathers = Array.from({ length: FEATHERS }, () => {
      const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m);
      const h = lightSprite(scene, halo, true, 8); h.material.color.setRGB(0.35, 0.7, 1);
      return { m, h };
    });
    this.flash = new Map(); // fence area id -> time since its last pulse
    // forks of ground lightning where the stoop rakes
    this.bursts = Array.from({ length: BURSTS }, () => ({ t: 9, x: 0, y: 0, z: 0, a: 0, seed: 0 }));
    this.burstI = 0;
    // the storm's bolts: down out of the sky onto their marks
    this.bolts = Array.from({ length: BOLTS }, () => ({ t: 9, x: 0, y: 0, z: 0, top: new THREE.Vector3(), seed: 0 }));
    this.boltI = 0;
    this.sky = new THREE.Vector3();
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** The gale hawk's events; true when drawn here. */
  event(e, g) {
    const m = g?.monsterById?.(e.id) ?? (e.source != null ? g?.monsterById?.(e.source) : null);
    if (m?.type !== 'gale_hawk') return false;
    const y = this.gy(e.x, e.z);
    switch (e.type) {
      case 'stoop': // it folds and drops: a crack of static off its body
        this.monster.burstStar?.(e.x, y + 0.4 + (m.alt ?? 3), e.z, 0.45, STORM, 0x9fd8ff, 0xffffff);
        return true;
      case 'stoopHit': {
        Object.assign(this.bursts[this.burstI++ % BURSTS], { t: 0, x: e.x, y: y + 0.05, z: e.z, a: e.angle, seed: Math.floor(Math.random() * 1000) });
        this.monster.burstStar?.(e.x, y + 0.7, e.z, 0.7, STORM, 0x9fd8ff, 0xffffff);
        this.monster.call?.ring(e.x, y + 0.1, e.z, 1.4, RING, 0.35);
        for (let i = 0; i < 8; i++) { const a = e.angle + (Math.random() - 0.5) * 1.2; this.monster.call?.dust(e.x, y + 0.12, e.z, Math.sin(a) * 3, 0.5, Math.cos(a) * 3, 0.7, 0.45); }
        if (this.fx) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 4; this.fx.add(e.x, y + 0.5, e.z, Math.sin(a) * v, 1 + Math.random() * 3, Math.cos(a) * v, { color: i % 3 ? 0x9fd8ff : 0xffffff, size: 0.12, sizeEnd: 0.03, life: 0.4, gravity: 8, drag: 1 }); }
        this.monster.onShake?.(0.1, 0.12);
        return true;
      }
      case 'thunderWings': this.monster.burstStar?.(e.x, y + 0.6 + (m.alt ?? 3), e.z, 0.5, STORM, 0x9fd8ff, 0xffffff); return true;
      case 'stormBeat': // a downstroke: a ring of wind off its wings
        this.monster.call?.ring(e.x, y + 0.4 + (m.alt ?? 3), e.z, 1.8, RING, 0.3);
        if (Math.random() < 0.5) this.monster.call?.feathersAt?.(e.x, y + 0.4 + (m.alt ?? 3), e.z, 2);
        return true;
      case 'stormFeathers': this.monster.call?.feathersAt?.(m.x, y + 0.4 + (m.alt ?? 3), m.z, 6); return true;
      case 'fencePulse': this.flash.set(e.id, 0); this.monster.onShake?.(0.05, 0.06); return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin(); this.boltCore.begin(); this.boltGlow.begin();
    rewindPts();
    this.laneI = 0;
    const flick = Math.floor(this.time * 15);
    for (const m of g.monsters) {
      if (m.type !== 'gale_hawk' || m.dead) continue;
      const w = m.windup, atk = w && m.def.attacks[w.name], k = w ? Math.min(1, m.stateT / w.total) : 1;
      // the stoop's strike stretch: from `before` short of the spot to `past` beyond it, its fill growing to the stoop
      if ((m.state === 'windup' && w?.name === 'stoop') || m.stoop) {
        const a = m.stoop ? m.stoop.angle : w.angle, A = m.def.attacks.stoop;
        const at = m.stoop ? m.stoop.high - A.past : 0, tx = m.stoop ? m.stoop.fromX + Math.sin(a) * at : w.tx, tz = m.stoop ? m.stoop.fromZ + Math.cos(a) * at : w.tz;
        const x0 = tx - Math.sin(a) * A.before, z0 = tz - Math.cos(a) * A.before, len = A.before + A.past;
        if (!m.stoop || m.stoop.s < m.stoop.high) this.band(x0, z0, a, A.width, len, m.stoop ? 1 : k);
        // static crackling round it as it drops
        if (m.stoop) for (let i = 0; i < 2; i++) {
          const y = this.gy(m.x, m.z) + 0.5 + (m.alt ?? 1), r = 0.7;
          _a.set(m.x, y, m.z); _b.set(m.x + Math.sin(flick * 1.7 + i * 3) * r, y + Math.cos(flick * 2.3 + i) * 0.4, m.z + Math.cos(flick * 1.3 + i * 2) * r);
          this.bolt(_a, _b, m.id * 31 + flick * 7 + i, 0.3, 3, 0.05, 0.9);
        }
      }
      // beating up the storm: static crackling over its wings
      if ((m.storm || (m.state === 'windup' && w?.name === 'thunder_wings')) && Math.random() < 0.7) {
        const y = this.gy(m.x, m.z) + 0.5 + (m.alt ?? 3);
        for (const side of [1, -1]) {
          const sx = Math.cos(m.facing) * side, sz = -Math.sin(m.facing) * side;
          _a.set(m.x + sx * 0.4, y, m.z + sz * 0.4); _b.set(m.x + sx * (1.4 + Math.random() * 0.4), y + (Math.random() - 0.3) * 0.6, m.z + sz * (1.4 + Math.random() * 0.4));
          this.bolt(_a, _b, flick * 17 + m.id * 5 + side, 0.3, 4, 0.045, 0.85);
        }
      }
      // the storm feathers: it shivers them loose through the wind-up (static flickers over its wings)
      if (m.state === 'windup' && w?.name === 'storm_feathers' && Math.random() < 0.5) {
        const y = this.gy(m.x, m.z) + 0.5 + (m.alt ?? 3), s = (Math.random() - 0.5) * 2.4;
        _a.set(m.x + Math.cos(m.facing) * s, y, m.z - Math.sin(m.facing) * s); _b.copy(_a); _b.y -= 0.5; _b.x += (Math.random() - 0.5) * 0.6;
        this.bolt(_a, _b, flick * 13 + m.id, 0.3, 3, 0.04, 0.8);
      }
    }
    this.drawFences(dt, g, flick);
    this.drawBursts(dt, flick);
    this.drawBolts(dt, flick);
    for (let i = this.laneI; i < LANES; i++) this.lanes[i].visible = false;
    this.core.end(); this.glow.end(); this.boltCore.end(); this.boltGlow.end();
  }

  /** A bolt of the gale hawk's storm striking its mark (core burst of storm_bolt). */
  strike(e) {
    const y = this.gy(e.x, e.z), seed = Math.floor(Math.random() * 1e4);
    const B = this.bolts[this.boltI++ % BOLTS];
    B.t = 0; B.x = e.x; B.y = y; B.z = e.z; B.seed = seed;
    skyAbove(this.monster.camera, e.x, e.z, 13, (Math.random() - 0.5) * 0.3, B.top);
    Object.assign(this.bursts[this.burstI++ % BURSTS], { t: 0, x: e.x, y: y + 0.05, z: e.z, a: Math.random() * 6.283, seed });
    this.monster.burstStar?.(e.x, y + 0.5, e.z, 0.75, STORM, 0x9fd8ff, 0xffffff);
    this.monster.call?.ring(e.x, y + 0.1, e.z, (e.radius || 1.4) * 1.1, RING, 0.35);
    if (this.fx) for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 4; this.fx.add(e.x, y + 0.3, e.z, Math.sin(a) * v, 1.5 + Math.random() * 3, Math.cos(a) * v, { color: i % 3 ? 0x9fd8ff : 0xffffff, size: 0.12, sizeEnd: 0.03, life: 0.4, gravity: 9, drag: 1 }); }
    this.monster.onShake?.(0.09, 0.1);
  }

  // each bolt: bright and re-jagged for a moment, a fork off it, then gone
  drawBolts(dt, flick) {
    for (const B of this.bolts) {
      if (B.t >= 0.32) continue;
      B.t += dt;
      const fade = B.t < 0.14 ? 1 : Math.max(0, 1 - (B.t - 0.14) / 0.1);
      _a.copy(B.top); _b.set(B.x, B.y + 0.05, B.z);
      this.bolt(_a, _b, B.seed + flick, 0.07, 9, 0.24, fade);
      // a fork off its lower half
      _a.lerpVectors(B.top, _b, 0.55); _b.set(B.x + Math.sin(B.seed) * 1.6, B.y + 0.05, B.z + Math.cos(B.seed) * 1.6);
      this.bolt(_a, _b, B.seed * 3 + flick, 0.12, 5, 0.1, fade * 0.8);
    }
  }

  /** A warning band on the ground from (x0, z0) along a, its plain fill grown to k of its length, a crisp edge. */
  band(x0, z0, a, width, len, k) {
    if (this.laneI + 2 > LANES) return;
    const y = this.gy(x0 + Math.sin(a) * len * 0.5, z0 + Math.cos(a) * len * 0.5) + 0.06;
    const B = this.lanes[this.laneI++], F = this.lanes[this.laneI++];
    B.position.set(x0, y, z0); B.rotation.set(0, a, 0); B.scale.set(width, 1, len); B.material.opacity = 0.18; B.visible = true;
    F.position.set(x0, y + 0.004, z0); F.rotation.set(0, a, 0); F.scale.set(width, 1, Math.max(0.01, len * k)); F.material.opacity = 0.3; F.visible = true;
    const sx = Math.cos(a) * width * 0.5, sz = -Math.sin(a) * width * 0.5, ex = Math.sin(a) * len, ez = Math.cos(a) * len;
    for (const s of [1, -1]) {
      this.edge[0].set(x0 + sx * s, y + 0.01, z0 + sz * s); this.edge[1].set(x0 + sx * s + ex, y + 0.01, z0 + sz * s + ez);
      RW.v = 0.06; this.glow.strip(this.edge, lineGlowW, 0.35, WARN.glow); this.core.strip(this.edge, lineW, 0.85, WARN.edge);
    }
  }

  /** An angular bolt from a to b (Chain Spark's zig), width wv, alpha al. */
  bolt(a, b, seed, amp, segs, wv, al) {
    zig(a, b, R, seed, amp, segs, pts, ws);
    bw = wv; bws = ws;
    this.boltGlow.strip(pts, boltGlowW, al * 0.8, BOLT_GLOW); this.boltCore.strip(pts, boltCoreW, al, BOLT);
  }

  drawFences(dt, g, flick) {
    let fi = 0;
    for (const a of g.areas) {
      if (a.kind !== 'storm_fence' || !a.fence) continue;
      const src = g.monsterById?.(a.sourceId), P = a.fence.pts, n = P.length;
      const atk = src?.def.attacks[a.attack], land = a.delay - (atk?.charge ?? 1), fall = 0.55;
      const live = a.t - a.delay, end = live - a.duration;
      const fade = end > 0 ? Math.max(0, 1 - end / 0.4) : 1;
      if (fade <= 0) continue;
      // the feathers: shaken loose over the wind-up, drifting down onto their marks as it ends, then standing
      for (let i = 0; i < n && fi < FEATHERS; i++, fi++) {
        const F = this.feathers[fi], gx = P[i][0], gz = P[i][1], gy = this.gy(gx, gz);
        const k = Math.min(1, Math.max(0, (a.t - (land - fall)) / fall));
        if (a.t < land - fall) {
          // still on the hawk, its mark warned on the ground
          F.m.visible = false; F.h.visible = false;
          this.markRing(gx, gy, gz, 0.3, Math.min(1, a.t / Math.max(0.01, land - fall)));
          continue;
        }
        const sx = src ? src.x : gx, sz = src ? src.z : gz, sy = (src ? this.gy(sx, sz) + 0.5 + (src.alt ?? 3) : gy + 3);
        const e = 1 - (1 - k) * (1 - k), sway = Math.sin(k * 9 + i * 2) * 0.5 * (1 - k);
        F.m.position.set(sx + (gx - sx) * e + sway, sy + (gy - sy) * k * k, sz + (gz - sz) * e);
        F.m.rotation.set(k < 1 ? Math.sin(k * 7 + i) * 1.2 : 0.35, i * 1.3 + (k < 1 ? k * 6 : 0), k < 1 ? Math.cos(k * 5 + i) : 0.25 * (i % 2 ? 1 : -1));
        F.m.scale.setScalar(1.6);
        const charge = live < 0 ? Math.max(0, 1 + live / Math.max(0.01, a.delay - land)) : 1, pulse = this.flash.has(a.id) ? Math.max(0, 1 - this.flash.get(a.id) / 0.2) : 0;
        F.m.material.opacity = fade; F.m.material.color.setRGB(0.75 + 0.25 * pulse, 0.9 + 0.1 * pulse, 1);
        F.m.visible = true;
        F.h.position.set(F.m.position.x, F.m.position.y + 0.35, F.m.position.z); F.h.scale.setScalar(0.7 + 0.5 * charge * (k >= 1 ? 1 : 0) + 1.2 * pulse); F.h.material.opacity = (0.35 + 0.4 * charge + 0.4 * pulse) * fade; F.h.visible = true;
      }
      // the strands: marked and faintly flickering while the charge builds, cracking bright on a pulse
      if (a.t >= land) {
        const tF = this.flash.get(a.id), pulse = tF !== undefined && tF < 0.2 ? 1 - tF / 0.2 : 0, build = live < 0 ? Math.max(0, 1 + live / Math.max(0.01, a.delay - land)) : 1;
        for (let i = 0; i + 1 < n; i++) {
          const x0 = P[i][0], z0 = P[i][1], x1 = P[i + 1][0], z1 = P[i + 1][1], ang = Math.atan2(x1 - x0, z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
          if (live < 0) this.band(x0, z0, ang, a.fence.width, len, build);
          _a.set(x0, this.gy(x0, z0) + 0.45, z0); _b.set(x1, this.gy(x1, z1) + 0.45, z1);
          if (pulse > 0) { this.bolt(_a, _b, a.id * 97 + i * 13 + flick, 0.1, 6, 0.16, pulse * fade); this.bolt(_a, _b, a.id * 53 + i * 7 + flick + 500, 0.14, 7, 0.07, 0.8 * pulse * fade); }
          else if (Math.random() < (live < 0 ? 0.15 + 0.5 * build : 0.35)) this.bolt(_a, _b, a.id * 41 + i * 17 + flick, 0.16, 6, 0.035, (live < 0 ? 0.25 + 0.35 * build : 0.4) * fade);
        }
      }
      if (this.flash.has(a.id)) this.flash.set(a.id, this.flash.get(a.id) + dt);
    }
    for (let i = fi; i < FEATHERS; i++) { this.feathers[i].m.visible = false; this.feathers[i].h.visible = false; }
    if (this.flash.size > 4) for (const id of this.flash.keys()) if (!g.areas.some((x) => x.id === id)) this.flash.delete(id);
  }

  markRing(x, y, z, r, k) {
    const n = 13;
    this.ringPts ||= Array.from({ length: n }, () => new THREE.Vector3());
    for (let j = 0; j < n; j++) { const a = (j / (n - 1)) * Math.PI * 2; this.ringPts[j].set(x + Math.sin(a) * r, y + 0.06, z + Math.cos(a) * r); }
    RW.v = 0.05; this.glow.strip(this.ringPts, lineGlowW, 0.3 * k, WARN.glow); this.core.strip(this.ringPts, lineW, 0.5 + 0.4 * k, WARN.edge);
  }

  // forks of lightning run out over the ground from where its talons raked
  drawBursts(dt, flick) {
    for (const B of this.bursts) {
      if (B.t >= 0.3) continue;
      B.t += dt;
      const fade = B.t < 0.12 ? 1 : Math.max(0, 1 - (B.t - 0.12) / 0.18), grow = Math.min(1, B.t / 0.06);
      for (let i = 0; i < 4; i++) {
        const a = B.a + (i - 1.5) * 0.7 + Math.sin(B.seed + i) * 0.2, L = (1.3 + 0.5 * Math.sin(B.seed * 3 + i)) * grow;
        _a.set(B.x, B.y, B.z); _b.set(B.x + Math.sin(a) * L, B.y, B.z + Math.cos(a) * L);
        this.bolt(_a, _b, B.seed + i * 19 + flick, 0.2, 4, 0.09, fade);
      }
    }
  }
}
