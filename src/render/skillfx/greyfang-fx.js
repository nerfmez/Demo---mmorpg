// Greyfang's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A wolf pack hunts by
// closing round its prey from every side, goes for the legs of big prey to slow it, and howls to rally the pack:
// - Hamstring (core snatch without steal): its curved path past the hero's side is marked on the ground through the
//   wind-up (the true reach either side of it); the dash leaves a grey rush of wind and dust; what it clips gets fang
//   marks low at the legs and sparks (core swoopHit); while the hero limps (status hobble) a torn ring flickers at
//   their feet with scuffs of dust.
// - Rally (core rally): howl rings roll off its head through the wind-up and moon-silver marks grow at the spots round
//   the hero where its pack will come (core rallyMarks); as they arrive each spot bursts in dark mist and dust with a
//   ring (core rally).
// - Takedown (core pounce, area takedown): grey streaks off it in the air; it lands in a shock ring with an X of
//   claw slashes across the true circle, dust thrown out, claw marks raked down what it pins.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const SEG = 16, MOON = new THREE.Color(0xdde8ff), HOWL = new THREE.Color(0xc8d8ff), SHOCK = new THREE.Color(0xe8e0d0), TORN = new THREE.Color(0xd86a4a);
const CLAW = { core: [1, 1, 0.95], glow: [0.8, 0.85, 1] }, FANG_HALO = new THREE.Color('#d8a070'), FANG_RIM = new THREE.Color('#fff4e6');
const _v = new THREE.Vector3();

export class GreyfangFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    const mat = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    // the hamstring's path: a strip bent along the curve, a soft fill and a brighter middle line
    this.paths = Array.from({ length: 2 }, () => {
      const mk = (c, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, SEG), mat(c, o)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; };
      return { fill: mk(0xff7a3a, 0.25), line: mk(0xffc080, 0.6) };
    });
    // the rally's marks: a disc and a ring at each spot
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), ring = new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2);
    disc.userData.shared = true; ring.userData.shared = true;
    // a pillar of moon-silver light over each spot, so the pack's arrival points read from afar
    const pillar = new THREE.CylinderGeometry(0.42, 0.55, 2.6, 16, 1, true).translate(0, 1.3, 0); pillar.userData.shared = true;
    this.marks = Array.from({ length: 4 }, () => {
      const d = new THREE.Mesh(disc, mat(0x9fb8ff, 0.3)), r = new THREE.Mesh(ring, mat(0xe8f0ff, 0.9)), p = new THREE.Mesh(pillar, mat(0xb8c8ff, 0.2, true));
      for (const m of [d, r, p]) { m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); }
      return { d, r, p, t: 9, total: 1, x: 0, z: 0 };
    });
    this.markI = 0;
    // the takedown's X: two slash strips crossing on the ground (glow and core)
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); strip.userData.shared = true;
    this.slashes = Array.from({ length: 2 }, () => {
      const glow = new THREE.Mesh(strip, mat(0x9fb0ff, 0.5, true)), core = new THREE.Mesh(strip, mat(0xf8faff, 0.95));
      for (const m of [glow, core]) { m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); }
      return { glow, core, t: 9, len: 1 };
    });
    // the limp: a torn ring at the hero's feet
    this.limp = new THREE.Mesh(ring, mat(0xd86a4a, 0.6)); this.limp.visible = false; this.limp.renderOrder = 7; this.limp.frustumCulled = false; scene.add(this.limp);
    this.howlT = new Map();
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** Greyfang's events; true when drawn here. */
  event(e, g) {
    if (e.type === 'swoopHit') {
      const m = g?.monsterById?.(e.id);
      if (m?.type !== 'greyfang') return false;
      // fangs at the legs: marks low on the prey, sparks and dust kicked from its feet
      const y = this.gy(e.x, e.z) + 0.35;
      this.monster.companion?.axes();
      _v.set(e.x, y, e.z);
      this.monster.companion?.rake(_v, Math.sin(m.facing) > 0 ? 1 : -1, 3, 0.32, 0.6, 0.12, FANG_HALO, FANG_RIM, 0.02);
      this.monster.burstStar?.(e.x, y, e.z, 0.45, CLAW, 0xffd0a0, 0xffffff);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.3, y - 0.2, e.z + Math.cos(a) * 0.3, Math.sin(a) * 1.4, 0.3, Math.cos(a) * 1.4, 0.6, 0.4); }
      this.monster.onShake?.(0.07, 0.08);
      return true;
    }
    if (e.type === 'rallyMarks') {
      for (const [x, z] of e.spots) Object.assign(this.marks[this.markI++ % this.marks.length], { t: 0, total: e.delay, x, z });
      return true;
    }
    if (e.type === 'rally') {
      // the pack arrives: each spot bursts in dark mist and dust, a ring
      for (const [x, z] of e.spots) {
        const y = this.gy(x, z);
        this.host.vfx?.dust.add(x, y + 0.6, z, 0, 0.6, 0, { color: 0x3a3a48, size: 1.1, sizeEnd: 2.2, life: 0.8, drag: 2, alpha: 0.6 });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.monster.call?.dust(x + Math.sin(a) * 0.4, y + 0.15, z + Math.cos(a) * 0.4, Math.sin(a) * 2, 0.5, Math.cos(a) * 2, 0.8, 0.5); }
        this.monster.call?.ring(x, y + 0.06, z, 1.4, MOON, 0.35);
      }
      for (const M of this.marks) if (M.t < M.total + 0.3) M.t = M.total; // the marks fade as they arrive
      this.monster.onShake?.(0.06, 0.08);
      return true;
    }
    return false;
  }

  /** It lands (core burst of area takedown): a shock ring, an X of claw slashes across the circle, dust. */
  burst(e) {
    if (e.kind !== 'takedown') return false;
    const y = this.gy(e.x, e.z);
    this.slashes.forEach((S, i) => {
      S.t = 0; S.len = e.radius * 2.1;
      for (const m of [S.glow, S.core]) { m.visible = true; m.position.set(e.x, y + 0.09, e.z); m.rotation.set(0, (i ? 1 : -1) * 0.78, 0); }
    });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.5, y + 0.12, e.z + Math.cos(a) * 0.5, Math.sin(a) * 2.6, 0.4, Math.cos(a) * 2.6, 0.95, 0.5); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius, SHOCK, 0.35);
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius * 1.4, SHOCK, 0.5);
    this.monster.companion?.axes();
    _v.set(e.x, y + 0.7, e.z);
    this.monster.companion?.rake(_v, 1, 4, 0.55, 0.9, 0.16, new THREE.Color('#a8b8ff'), new THREE.Color('#ffffff'), 0.03);
    this.monster.onShake?.(0.16, 0.14);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    let np = 0;
    for (const m of g.monsters) {
      if (m.type !== 'greyfang' || m.dead) continue;
      const wu = m.state === 'windup' ? m.windup : null, k = wu ? Math.min(1, m.stateT / wu.total) : 0;
      // the hamstring's curved path
      if (wu?.name === 'hamstring' && wu.path && np < this.paths.length) {
        const P = this.paths[np++], reach = m.def.attacks.hamstring.reach;
        this.bend(P.fill, wu.path, reach * 2, 0.06); this.bend(P.line, wu.path, 0.12, 0.075);
        P.fill.material.opacity = 0.14 + 0.2 * k; P.line.material.opacity = 0.3 + 0.5 * k;
        P.fill.visible = P.line.visible = true;
      }
      // the dash: a grey rush of wind and dust
      if (m.state === 'act' && m.swoop) {
        const y = this.gy(m.x, m.z);
        if (Math.random() < 0.9) this.monster.call?.dust(m.x, y + 0.15, m.z, -Math.sin(m.facing) * 1.5, 0.4, -Math.cos(m.facing) * 1.5, 0.7, 0.4);
        this.fx?.add(m.x + (Math.random() - 0.5) * 0.6, y + 0.6 + Math.random() * 0.6, m.z + (Math.random() - 0.5) * 0.6, -Math.sin(m.facing) * 7, 0, -Math.cos(m.facing) * 7, { color: 0xe8ecff, size: 0.07, sizeEnd: 0.01, life: 0.2, drag: 3 });
      }
      // the howl: rings off its head
      if (wu?.name === 'rally') {
        const t = (this.howlT.get(m.id) || 0) - dt;
        this.howlT.set(m.id, t <= 0 ? 0.16 : t);
        if (t <= 0) {
          const r = this.host.monsterRig?.(m.id), h = r?.bones?.head;
          if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.call?.ring(_v.x, _v.y + 0.3, _v.z, 1.2 + 1.8 * k, HOWL, 0.5); this.monster.call?.ring(_v.x, _v.y + 0.6, _v.z, 0.7 + k, MOON, 0.35); }
        }
      }
      // grey streaks off it in the takedown's flight
      if (m.charge?.dive) this.fx?.add(m.x + (Math.random() - 0.5) * 0.8, this.gy(m.x, m.z) + 1 + Math.random(), m.z + (Math.random() - 0.5) * 0.8, 0, -1, 0, { color: 0xdde4ff, size: 0.09, sizeEnd: 0.01, life: 0.25, drag: 2 });
    }
    for (let i = np; i < this.paths.length; i++) this.paths[i].fill.visible = this.paths[i].line.visible = false;
    // the rally marks: growing to their arrival, then fading
    for (const M of this.marks) {
      if (M.t >= M.total + 0.35) { M.d.visible = M.r.visible = M.p.visible = false; continue; }
      M.t += dt;
      const grow = Math.min(1, M.t / M.total), fade = M.t > M.total ? 1 - (M.t - M.total) / 0.35 : 1, y = this.gy(M.x, M.z) + 0.07;
      M.d.visible = M.r.visible = M.p.visible = true;
      M.d.position.set(M.x, y, M.z); M.r.position.set(M.x, y + 0.005, M.z); M.p.position.set(M.x, y, M.z);
      M.d.scale.setScalar(0.4 + 0.9 * grow); M.r.scale.setScalar(1.35 - 0.1 * Math.sin(this.time * 10));
      M.p.scale.set(0.6 + 0.4 * grow, 0.4 + 0.6 * grow, 0.6 + 0.4 * grow);
      M.d.material.opacity = 0.35 * fade * (0.7 + 0.3 * Math.sin(this.time * 12)); M.r.material.opacity = 0.95 * fade;
      M.p.material.opacity = (0.08 + 0.22 * grow) * fade;
      if (M.t < M.total && Math.random() < 0.4) this.fx?.add(M.x + (Math.random() - 0.5) * 0.7, y + 0.1, M.z + (Math.random() - 0.5) * 0.7, 0, 1.5 + Math.random(), 0, { color: 0xe0e8ff, size: 0.08, sizeEnd: 0.02, life: 0.6, drag: 1 });
    }
    // the X slashes
    for (const S of this.slashes) {
      if (S.t >= 0.45) { S.glow.visible = S.core.visible = false; continue; }
      S.t += dt;
      const u = S.t / 0.45;
      S.core.scale.set(0.16 * (1 - 0.6 * u), 1, S.len); S.glow.scale.set(0.5, 1, S.len);
      S.core.material.opacity = 0.95 * (1 - u); S.glow.material.opacity = 0.5 * (1 - u);
    }
    // the limp: a torn ring flickering at the hero's feet, scuffs of dust
    const p = g.player, hob = p && !p.dead && p.statuses?.hobble;
    this.limp.visible = !!hob;
    if (hob) {
      const y = this.gy(p.x, p.z) + 0.06;
      this.limp.position.set(p.x, y, p.z); this.limp.scale.setScalar(0.55 + 0.05 * Math.sin(this.time * 14));
      this.limp.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 6));
      if (Math.random() < dt * 4) this.monster.call?.dust(p.x, y + 0.1, p.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.45, 0.35);
    }
    void TORN;
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
