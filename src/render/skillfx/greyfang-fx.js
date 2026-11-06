// Greyfang's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A wolf pack closes round
// its prey from every side, goes for the legs of big prey, and howls to rally - or to scare intruders off. Greyfang
// is a mini-boss in two phases (its dread howl and pack command come at half health). Drawn in the light-and-ribbon
// language of the owner's bar skills (camera-facing ribbons: a bright core in a soft glow), moon-silver for Greyfang:
// - Hamstring (core snatch without steal): its curved path past the hero's side is marked on the ground; the dash
//   leaves two silver claw streaks along the curve and a rush of wind; what it clips gets fang marks low at the legs,
//   a burst star and sparks (core swoopHit); while the hero limps (hobble) a torn ring flickers at their feet.
// - Crescent rake (core rake hits): each claw sweeps a crescent of moonlight across its arc on the ground, three
//   claw lines slashed in the air, a burst on what it catches; the last, bigger, rolls a ring out (core monsterSwing).
// - Rally (core rally): howl rings off its head; moon-silver pillars over the spots round the hero where the pack
//   will come (core rallyMarks); dark mist, dust and a ring as each wolf arrives (core rally).
// - Pack command (core command): gold bark rings off its head; each wolf it commands flashes gold in the eyes (its
//   lane is the wolf's own warning, skillfx/wolf-fx.js); at the go a gold flare on every wolf (core commandGo).
// - Dread howl (core dread, tell ring): dark violet mist drawn into it through the wind-up; let loose, a dark ring of
//   sound runs out to the true radius with a second behind it, dust thrown up along it; the terrified hero trails
//   violet wisps over the head while the fear lasts.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { Ribbon } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, taperW, taperGlowW, lineW, lineGlowW } from './light-kit.js';

const SEG = 16, ARC = 21;
const MOON = new THREE.Color(0xdde8ff), HOWL = new THREE.Color(0xc8d8ff), GOLD = new THREE.Color(0xffd860);
const SILVER = { edge: [0.8, 0.88, 1.0], glow: [0.28, 0.42, 1.0] }, DREAD = { edge: [0.62, 0.42, 1], glow: [0.42, 0.12, 0.95] };
const STAR = { core: [1, 1, 1], glow: [0.6, 0.75, 1] }, FANG_HALO = new THREE.Color('#9fb8ff'), FANG_RIM = new THREE.Color('#ffffff');
const _v = new THREE.Vector3();

export class GreyfangFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 2400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 2400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.dashPts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3()); this.arcPts = Array.from({ length: ARC }, () => new THREE.Vector3());
    this.ring = Array.from({ length: 49 }, () => new THREE.Vector3());
    const mat = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    // the hamstring's path warning: a strip bent along the curve, a soft fill and a brighter middle line
    this.paths = Array.from({ length: 2 }, () => {
      const mk = (c, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, SEG), mat(c, o)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; };
      return { fill: mk(0xff7a3a, 0.25), line: mk(0xffc080, 0.6) };
    });
    // the rally's marks: a disc, a ring and a pillar of light at each spot
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), ring = new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2);
    const pillar = new THREE.CylinderGeometry(0.42, 0.55, 2.6, 16, 1, true).translate(0, 1.3, 0);
    for (const gg of [disc, ring, pillar]) gg.userData.shared = true;
    this.marks = Array.from({ length: 4 }, () => {
      const d = new THREE.Mesh(disc, mat(0x9fb8ff, 0.3)), r = new THREE.Mesh(ring, mat(0xe8f0ff, 0.9)), p = new THREE.Mesh(pillar, mat(0xb8c8ff, 0.2, true));
      for (const m of [d, r, p]) { m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); }
      return { d, r, p, t: 9, total: 1, x: 0, z: 0 };
    });
    this.markI = 0;
    this.limp = new THREE.Mesh(ring, mat(0xd86a4a, 0.6)); this.limp.visible = false; this.limp.renderOrder = 7; this.limp.frustumCulled = false; scene.add(this.limp);
    // ribbon effects in flight
    this.dashes = Array.from({ length: 2 }, () => ({ t: 9, id: -1, path: null }));
    this.crescents = Array.from({ length: 6 }, () => ({ t: 9, x: 0, z: 0, angle: 0, R: 3, arc: 2, side: 1, big: false }));
    this.cresI = 0;
    this.waves = Array.from({ length: 2 }, () => ({ t: 9, x: 0, z: 0, R: 6, delay: 0 }));
    this.howlT = new Map(); this.markedEyes = new Map();
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** Its claws (core monsterSwing of crescent_rake); true when drawn here. */
  swing(e) {
    if (e.type !== 'greyfang' || e.name !== 'crescent_rake') return false;
    const big = e.hit === e.hits;
    const C = this.crescents[this.cresI++ % this.crescents.length];
    Object.assign(C, { t: 0, x: e.x, z: e.z, angle: e.angle, R: e.range, arc: (e.arc * Math.PI) / 180, side: e.hit % 2 ? 1 : -1, big });
    if (e.at) {
      const y = this.gy(e.at[0], e.at[1]) + 0.8;
      this.monster.companion?.axes();
      _v.set(e.at[0], y, e.at[1]);
      this.monster.companion?.rake(_v, C.side, 3, big ? 0.6 : 0.45, big ? 0.95 : 0.75, 0.15, FANG_HALO, FANG_RIM, 0.02);
      this.monster.burstStar?.(e.at[0], y, e.at[1], big ? 0.75 : 0.5, STAR, 0xbfd0ff, 0xffffff);
    }
    if (big) { const y = this.gy(e.x, e.z); this.monster.call?.ring(e.x, y + 0.06, e.z, e.range, MOON, 0.35); this.monster.onShake?.(0.1, 0.1); }
    else this.monster.onShake?.(0.05, 0.06);
    return true;
  }

  /** Greyfang's events; true when drawn here. */
  event(e, g) {
    if (e.type === 'swoopHit') {
      const m = g?.monsterById?.(e.id);
      if (m?.type !== 'greyfang') return false;
      const y = this.gy(e.x, e.z) + 0.35;
      this.monster.companion?.axes();
      _v.set(e.x, y, e.z);
      this.monster.companion?.rake(_v, Math.sin(m.facing) > 0 ? 1 : -1, 3, 0.4, 0.75, 0.13, FANG_HALO, FANG_RIM, 0.02);
      this.monster.burstStar?.(e.x, y + 0.2, e.z, 0.6, STAR, 0xbfd0ff, 0xffffff);
      if (this.fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 3; this.fx.add(e.x, y, e.z, Math.sin(a) * v, 1 + Math.random() * 2, Math.cos(a) * v, { color: i % 2 ? 0xe8f0ff : 0xffd0a0, size: 0.08, sizeEnd: 0.02, life: 0.35, gravity: 6, drag: 2 }); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.3, y - 0.2, e.z + Math.cos(a) * 0.3, Math.sin(a) * 1.4, 0.3, Math.cos(a) * 1.4, 0.6, 0.4); }
      this.monster.onShake?.(0.08, 0.08);
      return true;
    }
    if (e.type === 'rallyMarks') { for (const [x, z] of e.spots) Object.assign(this.marks[this.markI++ % this.marks.length], { t: 0, total: e.delay, x, z }); return true; }
    if (e.type === 'rally') {
      for (const [x, z] of e.spots) {
        const y = this.gy(x, z);
        this.host.vfx?.dust.add(x, y + 0.6, z, 0, 0.6, 0, { color: 0x3a3a48, size: 1.1, sizeEnd: 2.2, life: 0.8, drag: 2, alpha: 0.6 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.monster.call?.dust(x + Math.sin(a) * 0.4, y + 0.15, z + Math.cos(a) * 0.4, Math.sin(a) * 2, 0.5, Math.cos(a) * 2, 0.8, 0.5); }
        this.monster.call?.ring(x, y + 0.06, z, 1.4, MOON, 0.35);
      }
      for (const M of this.marks) if (M.t < M.total + 0.3) M.t = M.total;
      this.monster.onShake?.(0.06, 0.08);
      return true;
    }
    if (e.type === 'command') { for (const id of e.pack) this.markedEyes.set(id, 0); return true; }
    if (e.type === 'commandGo') {
      for (const id of this.markedEyes.keys()) { const r = this.host.monsterRig?.(id), h = r?.bones?.head; if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.burstStar?.(_v.x, _v.y, _v.z, 0.45, { core: [1, 1, 0.9], glow: [1, 0.75, 0.2] }, 0xffd860, 0xffffff); } }
      this.markedEyes.clear();
      return true;
    }
    if (e.type === 'dread') {
      this.waves.forEach((W, i) => Object.assign(W, { t: -i * 0.18, x: e.x, z: e.z, R: e.radius }));
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 1.2, y + 0.15, e.z + Math.cos(a) * 1.2, Math.sin(a) * 6, 0.5, Math.cos(a) * 6, 1.0, 0.55); }
      this.monster.onShake?.(0.18, 0.18);
      return true;
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let np = 0;
    for (const m of g.monsters) {
      if (m.type !== 'greyfang' || m.dead) continue;
      const wu = m.state === 'windup' ? m.windup : null, k = wu ? Math.min(1, m.stateT / wu.total) : 0;
      if (wu?.name === 'hamstring' && wu.path && np < this.paths.length) {
        const P = this.paths[np++], reach = m.def.attacks.hamstring.reach;
        this.bend(P.fill, wu.path, reach * 2, 0.06); this.bend(P.line, wu.path, 0.12, 0.075);
        P.fill.material.opacity = 0.14 + 0.2 * k; P.line.material.opacity = 0.3 + 0.5 * k;
        P.fill.visible = P.line.visible = true;
      }
      // the dash: two silver claw streaks along the curve behind it, a rush of wind
      if (m.state === 'act' && m.swoop) {
        let D = this.dashes.find((q) => q.id === m.id && q.t < 0.6) || this.dashes.find((q) => q.t >= 0.6) || this.dashes[0];
        if (D.id !== m.id || D.t >= 0.6) Object.assign(D, { id: m.id, t: 0, path: m.swoop.path, dur: m.def.attacks.hamstring.duration });
        D.k = Math.min(1, m.stateT / D.dur);
        const y = this.gy(m.x, m.z);
        if (Math.random() < 0.9) this.monster.call?.dust(m.x, y + 0.15, m.z, -Math.sin(m.facing) * 1.5, 0.4, -Math.cos(m.facing) * 1.5, 0.7, 0.4);
      }
      // the howls: rally rings (silver), command barks (gold), and the dread gathering (violet mist drawn in)
      if (wu && (wu.name === 'rally' || wu.name === 'command')) {
        const t = (this.howlT.get(m.id) || 0) - dt;
        this.howlT.set(m.id, t <= 0 ? (wu.name === 'command' ? 0.12 : 0.16) : t);
        if (t <= 0) {
          const r = this.host.monsterRig?.(m.id), h = r?.bones?.head;
          if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.call?.ring(_v.x, _v.y + 0.3, _v.z, (wu.name === 'command' ? 0.8 : 1.2) + 1.6 * k, wu.name === 'command' ? GOLD : HOWL, 0.45); }
        }
      }
      if (wu?.name === 'dread' && this.fx) for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.283, r = 2.5 + Math.random() * 3, y = this.gy(m.x, m.z) + 0.4 + Math.random();
        this.fx.add(m.x + Math.sin(a) * r, y, m.z + Math.cos(a) * r, -Math.sin(a) * r * 2.2, 0.3, -Math.cos(a) * r * 2.2, { color: i % 2 ? 0x6a3ab8 : 0x2a1a48, size: 0.22, sizeEnd: 0.05, life: 0.45, drag: 0.5 });
      }
    }
    for (let i = np; i < this.paths.length; i++) this.paths[i].fill.visible = this.paths[i].line.visible = false;
    // the commanded wolves' eyes, flashing gold through the bark
    for (const [id, t] of this.markedEyes) {
      this.markedEyes.set(id, t + dt);
      if (t > 0 && Math.floor((t + dt) / 0.3) === Math.floor(t / 0.3)) continue; // a flash every 0.3 s
      const r = this.host.monsterRig?.(id), h = r?.bones?.head;
      if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.companion?.glint(_v.x, _v.y + 0.05, _v.z, 0.5, 0); }
    }
    this.drawDashes(dt); this.drawCrescents(dt); this.drawWaves(dt);
    this.core.end(); this.glow.end();
    this.drawMarks(dt);
    this.drawStatuses(dt, g.player);
  }

  // the hamstring's two claw streaks: lines of silver light along the curve from its start to where it is
  drawDashes(dt) {
    for (const D of this.dashes) {
      if (D.t >= 0.6 || !D.path) continue;
      D.t += dt;
      const fade = D.k >= 1 ? Math.max(0, 1 - (D.t - D.dur) / 0.35) : 1;
      if (fade <= 0) continue;
      const [p0, p1, p2] = D.path, n = SEG + 1, kEnd = Math.min(1, D.k ?? 0);
      for (const off of [0.28, -0.28]) {
        for (let j = 0; j < n; j++) {
          const kk = kEnd * (j / (n - 1)), u = 1 - kk;
          const x = u * u * p0[0] + 2 * u * kk * p1[0] + kk * kk * p2[0], z = u * u * p0[1] + 2 * u * kk * p1[1] + kk * kk * p2[1];
          const tx = 2 * u * (p1[0] - p0[0]) + 2 * kk * (p2[0] - p1[0]), tz = 2 * u * (p1[1] - p0[1]) + 2 * kk * (p2[1] - p1[1]), L = Math.hypot(tx, tz) || 1;
          this.dashPts[j].set(x + (tz / L) * off, this.gy(x, z) + 0.55, z - (tx / L) * off);
        }
        RW.v = 0.07 * fade; this.glow.strip(this.dashPts, taperGlowW, 0.7 * fade, SILVER.glow); this.core.strip(this.dashPts, taperW, 0.95 * fade, SILVER.edge);
      }
    }
  }

  // each claw: a crescent of moonlight swept across its arc low over the ground, from one side to the other
  drawCrescents(dt) {
    for (const C of this.crescents) {
      if (C.t >= 0.35) continue;
      C.t += dt;
      const sweep = Math.min(1, C.t / 0.1), fade = C.t > 0.12 ? 1 - (C.t - 0.12) / 0.23 : 1, n = ARC, y = this.gy(C.x, C.z) + 0.55;
      for (let j = 0; j < n; j++) {
        const u = j / (n - 1), a = C.angle + C.side * (u - 0.5) * C.arc * sweep, r = C.R * (0.82 + 0.18 * Math.sin(u * Math.PI));
        this.arcPts[j].set(C.x + Math.sin(a) * r, y + Math.sin(u * Math.PI) * 0.25, C.z + Math.cos(a) * r);
      }
      RW.v = (C.big ? 0.44 : 0.32) * fade; this.glow.strip(this.arcPts, taperGlowW, 0.8 * fade, SILVER.glow); this.core.strip(this.arcPts, taperW, fade, SILVER.edge);
    }
  }

  // the dread howl: dark rings of sound running out to the true radius
  drawWaves(dt) {
    for (const W of this.waves) {
      if (W.t >= 0.6) continue;
      W.t += dt;
      if (W.t < 0) continue;
      const k = Math.min(1, W.t / 0.4), r = W.R * (0.15 + 0.85 * (1 - (1 - k) * (1 - k))), fade = W.t > 0.4 ? 1 - (W.t - 0.4) / 0.2 : 1, y = this.gy(W.x, W.z) + 0.5, n = this.ring.length;
      for (let j = 0; j < n; j++) { const a = (j / (n - 1)) * Math.PI * 2; this.ring[j].set(W.x + Math.sin(a) * r, y + Math.sin(a * 6 + this.time * 10) * 0.08, W.z + Math.cos(a) * r); }
      RW.v = 0.35 * fade; this.glow.strip(this.ring, lineGlowW, 0.9 * fade, DREAD.glow); this.core.strip(this.ring, lineW, 0.8 * fade, DREAD.edge);
    }
  }

  drawMarks(dt) {
    for (const M of this.marks) {
      if (M.t >= M.total + 0.35) { M.d.visible = M.r.visible = M.p.visible = false; continue; }
      M.t += dt;
      const grow = Math.min(1, M.t / M.total), fade = M.t > M.total ? 1 - (M.t - M.total) / 0.35 : 1, y = this.gy(M.x, M.z) + 0.07;
      M.d.visible = M.r.visible = M.p.visible = true;
      M.d.position.set(M.x, y, M.z); M.r.position.set(M.x, y + 0.005, M.z); M.p.position.set(M.x, y, M.z);
      M.d.scale.setScalar(0.4 + 0.9 * grow); M.r.scale.setScalar(1.35 - 0.1 * Math.sin(this.time * 10));
      M.p.scale.set(0.6 + 0.4 * grow, 0.4 + 0.6 * grow, 0.6 + 0.4 * grow);
      M.d.material.opacity = 0.35 * fade * (0.7 + 0.3 * Math.sin(this.time * 12)); M.r.material.opacity = 0.95 * fade; M.p.material.opacity = (0.08 + 0.22 * grow) * fade;
      if (M.t < M.total && Math.random() < 0.4) this.fx?.add(M.x + (Math.random() - 0.5) * 0.7, y + 0.1, M.z + (Math.random() - 0.5) * 0.7, 0, 1.5 + Math.random(), 0, { color: 0xe0e8ff, size: 0.08, sizeEnd: 0.02, life: 0.6, drag: 1 });
    }
  }

  // the hero's limp (a torn ring at the feet) and fear (violet wisps over the head)
  drawStatuses(dt, p) {
    const hob = p && !p.dead && p.statuses?.hobble;
    this.limp.visible = !!hob;
    if (hob) {
      const y = this.gy(p.x, p.z) + 0.06;
      this.limp.position.set(p.x, y, p.z); this.limp.scale.setScalar(0.55 + 0.05 * Math.sin(this.time * 14));
      this.limp.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 6));
      if (Math.random() < dt * 4) this.monster.call?.dust(p.x, y + 0.1, p.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.45, 0.35);
    }
    if (p && !p.dead && p.statuses?.fear && this.fx) {
      const y = this.gy(p.x, p.z) + 1.9;
      for (let i = 0; i < 2; i++) { const a = this.time * 5 + i * Math.PI; this.fx.add(p.x + Math.sin(a) * 0.35, y, p.z + Math.cos(a) * 0.35, 0, 0.8, 0, { color: i ? 0x9a6aff : 0x4a2a88, size: 0.16, sizeEnd: 0.04, life: 0.5, drag: 1 }); }
    }
  }

  // a flat strip on the ground along the quadratic curve path [p0, p1, p2], `width` wide, `lift` above the ground
  bend(mesh, path, width, lift) {
    const [p0, p1, p2] = path, pos = mesh.geometry.attributes.position;
    for (let j = 0; j <= SEG; j++) {
      const k = j / SEG, u = 1 - k;
      const x = u * u * p0[0] + 2 * u * k * p1[0] + k * k * p2[0], z = u * u * p0[1] + 2 * u * k * p1[1] + k * k * p2[1];
      const tx = 2 * u * (p1[0] - p0[0]) + 2 * k * (p2[0] - p1[0]), tz = 2 * u * (p1[1] - p0[1]) + 2 * k * (p2[1] - p1[1]), n = Math.hypot(tx, tz) || 1;
      const ox = (tz / n) * width / 2, oz = (-tx / n) * width / 2, y = this.gy(x, z) + lift;
      pos.setXYZ(j * 2, x - ox, y, z - oz); pos.setXYZ(j * 2 + 1, x + ox, y, z + oz);
    }
    pos.needsUpdate = true;
  }
}
