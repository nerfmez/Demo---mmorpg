// Greyfang's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A big wolf, fast: its
// speed is what the effects sell (owner, 2026-11-06: "a big, fast wolf"; "boss-worthy"). Moon-silver light in the
// owner's bar language (camera-facing ribbons: a bright core in a soft glow); every danger zone in the warm warning
// colour at its true size.
// - Speed: whenever it runs flat out (a hamstring pass, its orbit and cut, the phantom rush, the leap's fall) it leaves
//   afterimages (copies of its own model, frozen in its pose, fading moon-blue) and three streaks of wind trailing
//   from its body; claw marks of light are scored into the ground where it skids, takes off and lands.
// - Hamstring (core snatch passes): each curved pass marked on the ground before it runs (the next one through the
//   skid); a snap leaves fang marks, a burst star and sparks (core swoopHit); a torn ring at a limping hero's feet.
// - Moon orbit (core circle_lunge): its eyes flash as it plants (core lapAim), its lane lit and filling to the cut;
//   the cut rakes what it passes (core monsterSwing).
// - Rally (core rally): howl rings off its head; pillars of moonlight where the pack will come (core rallyMarks).
// - Phase roar (core phaseRoar): rings of sound off its head and a silver wave over the ground; from then on (its
//   second phase) moon-silver wisps rise off its body and its eyes glint.
// - Moon leap (core moonLeap, moonLock, moonCrash): a burst and a pillar of light as it springs out of sight; its
//   shadow runs after the hero; when the spot locks the warning circle fills to the landing; it comes down in a
//   streak, nose first: a flash, two silver shock rings, a ring of dust and a round crater.
// - Phantom rush (core phantomMarks, projectiles phantom_wolf): moon-shadow copies of it crouch at the far ends of
//   two lanes, all three lanes lit and each filling to its own run; the shadows run them in turn, it runs the last.
// Pools only; no allocation per frame (the ghost rigs are taken once, the first time Greyfang is seen).
import * as THREE from 'three';
import { Ribbon, place, conformPlane } from './fx-common.js';
import { CORE_FS, GLOW_FS, W as RW, taperW, taperGlowW, lineW, lineGlowW, tailW, tailGlowW } from './light-kit.js';
import { warnDisc } from './anime-kit.js';
import { craterMesh } from './ground-kit.js';
import { leapHeight, LEAP_HEIGHT } from '../greyfang-anim.js';

const SEG = 16, HIST = 12, GHOSTS = 6, PHANTOMS = 2, MARKS = 10, WAVES = 5;
const MOON = new THREE.Color(0xdde8ff), HOWL = new THREE.Color(0xc8d8ff);
const DIRT = { edge: [0.27, 0.19, 0.11], glow: [0.3, 0.38, 0.75] };
const SILVER = { edge: [0.85, 0.92, 1.0], glow: [0.3, 0.45, 1.0] }, PALE = { edge: [1, 1, 1], glow: [0.5, 0.65, 1] }, DUSTY = { edge: [0.85, 0.78, 0.66], glow: [0.5, 0.42, 0.3] };
const STAR = { core: [1, 1, 1], glow: [0.6, 0.75, 1] }, FANG_HALO = new THREE.Color('#9fb8ff'), FANG_RIM = new THREE.Color('#ffffff');
// the phantoms run like a wolf: the view's state for a gallop
const RUN = { moving: true, speed: 16, smoothSpeed: 16, speedFactor: 1, state: 'chase', windup: null, windupT: 0, windupTotal: 1, lookYaw: 0, turn: 0, vSide: 0, vFwd: 16, aggro: true, hurt: 0, actT: 0, attacks: {} };
const _v = new THREE.Vector3();

export class GreyfangFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.core = new Ribbon(scene, monster.camera, 3000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, monster.camera, 3000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.pts = Array.from({ length: 49 }, () => new THREE.Vector3());
    const mat = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const flat = (geo, m, order = 7) => { const o = new THREE.Mesh(geo, m); o.visible = false; o.renderOrder = order; o.frustumCulled = false; scene.add(o); return o; };
    // the hamstring's next curve: a strip bent along it, a soft fill and a brighter middle line
    this.path = { fill: flat(new THREE.PlaneGeometry(1, 1, 1, SEG), mat(0xff7a3a, 0.25)), line: flat(new THREE.PlaneGeometry(1, 1, 1, SEG), mat(0xffc080, 0.6)) };
    // lanes (the orbit's cut, the phantom rush's three): a quad from its start along +z, a dim band and the fill
    // growing along it to the run
    const lane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); lane.userData.shared = true;
    this.lanes = Array.from({ length: 4 }, () => ({ band: flat(lane, mat(0xff7a3a, 0.2)), fill: flat(lane, mat(0xffa060, 0.45)), edge: flat(lane, mat(0xffe0b0, 0.9)) }));
    this.rush = { on: false, t: 0, lanes: Array.from({ length: 3 }, () => ({ x: 0, z: 0, a: 0, len: 1, w: 1, fire: 1 })), n: 0 };
    // the rally's marks: a disc, a ring and a pillar of light at each spot
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), ring = new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2);
    const pillar = new THREE.CylinderGeometry(0.42, 0.55, 2.6, 16, 1, true).translate(0, 1.3, 0);
    for (const gg of [disc, ring, pillar]) gg.userData.shared = true;
    this.marks = Array.from({ length: 4 }, () => ({ d: flat(disc, mat(0x9fb8ff, 0.3)), r: flat(ring, mat(0xe8f0ff, 0.9)), p: flat(pillar, mat(0xb8c8ff, 0.2, true)), t: 9, total: 1, x: 0, z: 0 }));
    this.markI = 0;
    this.limp = flat(ring, mat(0xd86a4a, 0.6));
    // the moon leap: its shadow, the landing's warning and the crater it leaves
    this.shadow = flat(disc, mat(0x0c0f1a, 0.4), 3);
    this.warn = warnDisc(scene, 'fire');
    this.crash = { t: 9, total: 1, x: 0, z: 0, R: 3, on: false };
    this.crater = craterMesh(scene, 7.7); this.craterT = 9;
    // ribbons in flight
    this.trail = { a: 0, pts: Array.from({ length: 3 }, () => Array.from({ length: HIST }, () => new THREE.Vector3())), id: -1 };
    this.claws = Array.from({ length: MARKS }, () => ({ t: 9, x: 0, z: 0, a: 0, len: 1.3, life: 1.4 }));
    this.clawI = 0;
    this.waves = Array.from({ length: WAVES }, () => ({ t: 9, x: 0, z: 0, R: 3, dur: 0.5, look: SILVER, w: 0.3 }));
    this.waveI = 0;
    this.beams = Array.from({ length: 2 }, () => ({ t: 9, x: 0, z: 0, y0: 0, y1: 1, dur: 0.4 }));
    this.beamI = 0;
    this.linePts = Array.from({ length: 8 }, () => new THREE.Vector3());
    // the skids' furrows: its claws dragged through the ground from where the skid began to where it is
    this.furrows = Array.from({ length: 3 }, () => ({ t: 9, life: 1.6, id: -1, x0: 0, z0: 0, x1: 0, z1: 0, a: 0, on: false }));
    this.furrowI = 0;
    // copies of its model: afterimages, and the phantom rush's shadows (taken once, kept hidden when unused)
    this.ghosts = []; this.ghostI = 0; this.ghostNext = 0;
    this.phantoms = [];
    this.howlT = 0; this.auraT = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  rig(id) { return this.host.monsterRig?.(id) || null; }
  headPos(id, out) { const h = this.rig(id)?.bones?.head; if (!h) return null; h.updateWorldMatrix(true, false); return out.setFromMatrixPosition(h.matrixWorld); }

  // a model copy, see-through and moon-blue
  tint(rig, a, blue = 1) {
    for (const [m, hull] of [[rig.material, rig.hull], [rig.modelMaterial, rig.modelHull]]) {
      if (!m) continue;
      if (!m.transparent) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; if (hull) { hull.transparent = true; hull.depthWrite = false; hull.needsUpdate = true; } }
      m.opacity = a; if (hull) hull.opacity = a * a * 0.3;
    }
    rig.material?.userData?.flash?.value.set(0.02 * blue, 0.1 * blue, 0.35 * blue);
  }
  warm() {
    // copies taken while its model was still loading are only skeletons: hand them back and take them again
    if (this.ghosts[0]?.rig.awaitingModel) {
      for (const q of [...this.ghosts, ...this.phantoms]) { q.rig.root.visible = false; this.host.releaseRig?.(q.rig); }
      this.ghosts.length = 0; this.phantoms.length = 0;
    }
    if (this.ghosts.length || !this.host.takeRig) return;
    const first = this.host.takeRig('greyfang');
    if (first.awaitingModel) { this.host.releaseRig?.(first); return; } // not yet: next frame
    for (let i = 0; i < GHOSTS + PHANTOMS; i++) {
      const rig = i ? this.host.takeRig('greyfang') : first;
      rig.root.visible = false; this.scene.add(rig.root); this.tint(rig, 0.5);
      // moon-blue all through (its own materials: a pooled copy, never the live wolf's)
      for (const mm of [rig.material, rig.modelMaterial]) mm?.color?.setRGB(0.42, 0.58, 1.0);
      if (i < GHOSTS) this.ghosts.push({ rig, t: 9, life: 0.28 });
      else this.phantoms.push({ rig, phase: 'off', t: 0, x: 0, z: 0, a: 0, pid: -1, alpha: 0, next: 0 });
    }
  }
  // the copy takes the live rig's pose as it is this frame
  copyPose(rig, live) {
    rig.root.position.copy(live.root.position); rig.root.quaternion.copy(live.root.quaternion); rig.root.scale.copy(live.root.scale);
    for (const n in live.bones) { const a = live.bones[n], b = rig.bones[n]; if (b && a !== live.root) { b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); } }
  }
  afterimage(live) {
    const G = this.ghosts[this.ghostI++ % this.ghosts.length];
    if (!G) return;
    this.copyPose(G.rig, live); G.t = 0;
  }
  clawMark(x, z, a, len = 1.3, life = 1.4) { Object.assign(this.claws[this.clawI++ % MARKS], { t: 0, x, z, a, len, life }); }
  wave(x, z, R, dur, look = SILVER, w = 0.3, delay = 0) { Object.assign(this.waves[this.waveI++ % WAVES], { t: -delay, x, z, R, dur, look, w }); }
  beam(x, z, y0, y1, dur) { Object.assign(this.beams[this.beamI++ % this.beams.length], { t: 0, x, z, y0, y1, dur }); }
  dustRing(x, z, n, sp, size = 0.8, life = 0.6, r = 0.5) {
    const y = this.gy(x, z);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.3; this.monster.call?.dust(x + Math.sin(a) * r, y + 0.15, z + Math.cos(a) * r, Math.sin(a) * sp, 0.4, Math.cos(a) * sp, size, life); }
  }
  bite(x, z, side, big) {
    const y = this.gy(x, z) + 0.4;
    this.monster.companion?.axes();
    _v.set(x, y, z);
    this.monster.companion?.rake(_v, side, 3, big ? 0.6 : 0.45, big ? 0.95 : 0.75, 0.14, FANG_HALO, FANG_RIM, 0.02);
    this.monster.burstStar?.(x, y + 0.2, z, big ? 0.85 : 0.6, STAR, 0xbfd0ff, 0xffffff);
    if (this.fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 3; this.fx.add(x, y, z, Math.sin(a) * v, 1 + Math.random() * 2, Math.cos(a) * v, { color: i % 2 ? 0xe8f0ff : 0xffd0a0, size: 0.08, sizeEnd: 0.02, life: 0.35, gravity: 6, drag: 2 }); }
    this.monster.onShake?.(big ? 0.14 : 0.08, 0.1);
  }

  /** Its strikes (core monsterSwing); true when drawn here. */
  swing(e) {
    if (e.type !== 'greyfang') return false;
    if (e.at) this.bite(e.at[0], e.at[1], Math.sin(e.angle) > 0 ? 1 : -1, true);
    return true;
  }

  /** Greyfang's events; true when drawn here. */
  event(e, g) {
    const m = e.id != null ? g?.monsterById?.(e.id) : null;
    if (m?.type !== 'greyfang') return false;
    const y = this.gy(e.x ?? m.x, e.z ?? m.z);
    switch (e.type) {
      case 'swoopHit': this.bite(e.x, e.z, Math.sin(m.facing) > 0 ? 1 : -1, false); return true;
      case 'skid': {
        // it can't stop: its claws bite in and furrow the ground as it slides (the furrow grows with it, update)
        Object.assign(this.furrows[this.furrowI++ % this.furrows.length], { t: 0, id: m.id, x0: e.x, z0: e.z, x1: e.x, z1: e.z, a: e.angle, on: true });
        for (let i = 0; i < 10; i++) { const a = e.angle + (Math.random() - 0.5) * 1.4; this.monster.call?.dust(e.x, y + 0.15, e.z, Math.sin(a) * 4, 0.8, Math.cos(a) * 4, 0.9, 0.5); }
        this.monster.onShake?.(0.07, 0.1);
        return true;
      }
      case 'lapAim': {
        // planted: its eyes flash, claws dug in
        if (this.headPos(m.id, _v)) { this.monster.companion?.glint(_v.x, _v.y + 0.1, _v.z, 1.1, 0); this.monster.call?.ring(_v.x, _v.y, _v.z, 0.8, MOON, 0.3); }
        this.clawMark(m.x, m.z, m.facing, 1.0, 1.2);
        return true;
      }
      case 'lunge': this.dustRing(m.x, m.z, 10, 3.5, 0.9, 0.5); this.wave(m.x, m.z, 1.8, 0.3, PALE, 0.18); return true;
      case 'phantomGo': this.dustRing(m.x, m.z, 10, 3.5, 0.9, 0.5); this.clawMark(m.x, m.z, e.angle, 1.2, 1.2); return true;
      case 'moonLeap': {
        // the spring: a burst, a ring of dust, a pillar of light up after it
        this.dustRing(e.x, e.z, 18, 6, 1.1, 0.7, 0.8);
        this.wave(e.x, e.z, 3, 0.45, PALE, 0.3);
        this.beam(e.x, e.z, y, y + LEAP_HEIGHT, 0.45);
        this.monster.burstStar?.(e.x, y + 0.5, e.z, 1.0, STAR, 0xbfd0ff, 0xffffff);
        this.clawMark(e.x, e.z, m.facing, 1.4, 2);
        this.monster.onShake?.(0.12, 0.12);
        return true;
      }
      case 'moonLock': Object.assign(this.crash, { t: 0, total: e.delay, x: e.x, z: e.z, R: e.radius, on: true }); return true;
      case 'moonCrash': {
        this.crash.on = false; this.warn.visible = false;
        this.monster.burstStar?.(e.x, y + 0.6, e.z, 1.8, STAR, 0xd8e4ff, 0xffffff);
        this.wave(e.x, e.z, e.radius * 1.15, 0.45, PALE, 0.45);
        this.wave(e.x, e.z, e.radius * 1.45, 0.65, SILVER, 0.3, 0.08);
        this.wave(e.x, e.z, e.radius * 0.9, 0.5, DUSTY, 0.35, 0.03);
        this.dustRing(e.x, e.z, 22, 7, 1.3, 0.9, e.radius * 0.5);
        if (this.fx) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, v = 3 + Math.random() * 4; this.fx.add(e.x + Math.sin(a) * 0.8, y + 0.3, e.z + Math.cos(a) * 0.8, Math.sin(a) * v, 3 + Math.random() * 3, Math.cos(a) * v, { color: i % 3 ? 0x7a6a58 : 0xdde8ff, size: 0.14, sizeEnd: 0.06, life: 0.7, gravity: 14, drag: 0.6 }); }
        // a round crater where it came down
        const C = this.crater; place(C, e.x, 0.05, e.z); C.scale.setScalar(e.radius * 0.5 * 1.7 * 2); conformPlane(C); C.visible = true;
        C.material.uniforms.uBurn.value = 0; C.material.uniforms.uGlow.value = 0; this.craterT = 0;
        for (let i = 0; i < 4; i++) this.clawMark(e.x + Math.sin(m.facing + (i - 1.5) * 0.5) * 1.2, e.z + Math.cos(m.facing + (i - 1.5) * 0.5) * 1.2, m.facing + (i - 1.5) * 0.5, 1.0, 1.8);
        this.monster.onShake?.(0.5, 0.3); // the whole weight of it coming down
        return true;
      }
      case 'phantomMarks': {
        // three lanes, each filling to its own run; a shadow of it crouched at the start of the first two
        const R = this.rush; R.on = true; R.t = 0; R.n = e.lanes.length;
        e.lanes.forEach(([x, z, a], i) => Object.assign(R.lanes[i], { x, z, a, len: Math.hypot(e.tx - x, e.tz - z) + e.past, w: e.width, fire: e.delay + i * e.gap }));
        this.warm();
        for (let i = 0; i < Math.min(this.phantoms.length, e.lanes.length - 1); i++) {
          const [x, z, a] = e.lanes[i], P = this.phantoms[i];
          Object.assign(P, { phase: 'wait', t: 0, x, z, a, pid: -1, alpha: 0 });
          this.dustRing(x, z, 8, 1.6, 1.0, 0.6);
          this.monster.call?.ring(x, this.gy(x, z) + 0.06, z, 1.4, MOON, 0.4);
        }
        return true;
      }
      case 'phaseRoar': {
        if (this.headPos(m.id, _v)) for (let i = 0; i < 3; i++) this.monster.call?.ring(_v.x, _v.y + 0.3, _v.z, 2.2 + i, MOON, 0.55, i * 0.22);
        this.wave(m.x, m.z, 6, 0.7, SILVER, 0.4, 0.15);
        this.wave(m.x, m.z, 4, 0.5, PALE, 0.25, 0.4);
        this.dustRing(m.x, m.z, 16, 5, 1.1, 0.8, 1);
        if (this.headPos(m.id, _v)) this.monster.burstStar?.(_v.x, _v.y, _v.z, 1.2, STAR, 0xbfd0ff, 0xffffff);
        this.monster.onShake?.(0.22, 0.4);
        return true;
      }
      case 'rallyMarks': for (const [x, z] of e.spots) Object.assign(this.marks[this.markI++ % this.marks.length], { t: 0, total: e.delay, x, z }); return true;
      case 'rally': {
        for (const [x, z] of e.spots) {
          const yy = this.gy(x, z);
          this.host.vfx?.dust.add(x, yy + 0.6, z, 0, 0.6, 0, { color: 0x3a3a48, size: 1.1, sizeEnd: 2.2, life: 0.8, drag: 2, alpha: 0.6 });
          this.dustRing(x, z, 8, 2, 0.8, 0.5, 0.4);
          this.monster.call?.ring(x, yy + 0.06, z, 1.4, MOON, 0.35);
        }
        for (const M of this.marks) if (M.t < M.total + 0.3) M.t = M.total;
        this.monster.onShake?.(0.06, 0.08);
        return true;
      }
    }
    return false;
  }

  update(dt, g) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let pathOn = false, nl = 0, fang = null;
    for (const m of g.monsters) {
      if (m.type !== 'greyfang' || m.dead) continue;
      fang = m;
      this.warm();
      const live = this.rig(m.id), wu = m.state === 'windup' ? m.windup : null, k = wu ? Math.min(1, m.stateT / wu.total) : 0;
      // the hamstring's curve, through the wind-up and each skid
      const path = (wu?.name === 'hamstring' && wu.path) || (m.swoop?.skid > 0 && m.swoop.path);
      if (path && !pathOn) {
        pathOn = true;
        const reach = m.def.attacks.hamstring.reach, q = wu ? k : 1 - m.swoop.skid / m.def.attacks.hamstring.skid;
        this.bend(this.path.fill, path, reach * 2, 0.06); this.bend(this.path.line, path, 0.12, 0.075);
        this.path.fill.material.opacity = 0.14 + 0.2 * q; this.path.line.material.opacity = 0.3 + 0.5 * q;
        this.path.fill.visible = this.path.line.visible = true;
      }
      // a skid under way: the furrow follows it, dirt and grit spray ahead off its braced forepaws
      if (m.swoop?.skid > 0) {
        const F = this.furrows.find((q) => q.on && q.id === m.id), q = 1 - m.swoop.skid / m.def.attacks.hamstring.skid;
        if (F) { F.x1 = m.x; F.z1 = m.z; F.t = 0; }
        const yy = this.gy(m.x, m.z), a = F ? F.a : m.facing, fx = Math.sin(a), fz = Math.cos(a), sx = Math.cos(a), sz = -Math.sin(a);
        if (Math.random() < 1 - q) for (const sd of [-1, 1]) this.monster.call?.dust(m.x + fx * 1.2 + sx * sd * 0.5, yy + 0.12, m.z + fz * 1.2 + sz * sd * 0.5, fx * 3 + sx * sd * 1.5, 0.7, fz * 3 + sz * sd * 1.5, 0.8, 0.45);
        if (this.fx && Math.random() < 1.2 * (1 - q)) { const sd = Math.random() < 0.5 ? -1 : 1; this.fx.add(m.x + fx * 1.3 + sx * sd * 0.5, yy + 0.2, m.z + fz * 1.3 + sz * sd * 0.5, fx * (2 + Math.random() * 3) + sx * sd, 2 + Math.random() * 2, fz * (2 + Math.random() * 3) + sz * sd, { color: Math.random() < 0.7 ? 0x7a6448 : 0xdde8ff, size: 0.1, sizeEnd: 0.05, life: 0.45, gravity: 12, drag: 0.8 }); }
      } else for (const F of this.furrows) if (F.on && F.id === m.id) F.on = false;
      // the orbit's cut, lit as it plants
      if (m.lap?.phase === 'aim' && nl < this.lanes.length) {
        const a = m.def.attacks[m.lap.name];
        this.lane(nl++, m.x, m.z, m.lap.angle, a.width, a.dash, Math.min(1, m.lap.t / a.aim), 1);
      }
      // flat out: afterimages, streaks of wind, dust
      const h = m.leap ? leapHeight(m.def.attacks.moon_leap, m.leap.phase, m.leap.t) : 0;
      const fast = m.state === 'act' && ((m.swoop && !(m.swoop.skid > 0)) || m.lap?.phase === 'run' || m.lap?.phase === 'dash' || m.rush?.dash || (m.leap && h > 0.1 && h < LEAP_HEIGHT - 0.1));
      if (live && live.root.visible) {
        if (fast && this.time >= this.ghostNext) { this.ghostNext = this.time + 0.08; this.afterimage(live); }
        this.trackTrail(m, live, dt, fast);
        if (fast && !m.leap && Math.random() < 0.7) { const yy = this.gy(m.x, m.z); this.monster.call?.dust(m.x, yy + 0.15, m.z, -Math.sin(m.facing) * 2, 0.5, -Math.cos(m.facing) * 2, 0.9, 0.45); }
      } else this.trail.a = Math.max(0, this.trail.a - dt * 5);
      // the moon leap: its shadow under it while it is up
      this.shadow.visible = !!m.leap && h > 0.2;
      if (this.shadow.visible) {
        const q = 1 - h / LEAP_HEIGHT, yy = this.gy(m.x, m.z) + 0.04;
        this.shadow.position.set(m.x, yy, m.z); this.shadow.scale.setScalar(0.9 + 1.0 * q);
        this.shadow.material.opacity = 0.18 + 0.4 * q;
      }
      if (m.leap && h > 0.5 && h < LEAP_HEIGHT - 0.1 && m.leap.phase !== 'rise' && Math.random() < 0.5 && this.fx) this.fx.add(m.x + (Math.random() - 0.5), this.gy(m.x, m.z) + h + 1, m.z + (Math.random() - 0.5), 0, 6, 0, { color: 0xdde8ff, size: 0.18, sizeEnd: 0.04, life: 0.3, drag: 1 });
      // its eyes through the wind-ups that ready a leap or a rush; the rally howl's rings
      if (wu && (wu.name === 'moon_leap' || wu.name === 'phantom_rush') && (this.howlT -= dt) <= 0) {
        this.howlT = 0.35;
        if (this.headPos(m.id, _v)) this.monster.companion?.glint(_v.x, _v.y + 0.1, _v.z, 0.8, 0);
        if (wu.name === 'moon_leap') this.dustRing(m.x, m.z, 6, 1.5 + 2 * k, 0.7, 0.4, 0.6);
      }
      if (wu?.name === 'rally' && (this.howlT -= dt) <= 0) {
        this.howlT = 0.16;
        if (this.headPos(m.id, _v)) this.monster.call?.ring(_v.x, _v.y + 0.3, _v.z, 1.2 + 1.6 * k, HOWL, 0.45);
      }
      // the second phase: moon-silver wisps rising off it, a glint in its eyes now and then
      if (m.enraged && !(m.leap && h > 1) && this.fx && live) {
        const s = live.root.scale.x;
        if (Math.random() < 0.7) {
          const a = Math.random() * 6.283, r = 0.6 * s * Math.random();
          this.fx.add(m.x + Math.sin(a) * r, this.gy(m.x, m.z) + (0.3 + Math.random() * 0.6) * s, m.z + Math.cos(a) * r, 0, 1.2 + Math.random(), 0, { color: Math.random() < 0.5 ? 0xcfe0ff : 0x7f9fff, size: 0.16, sizeEnd: 0.03, life: 0.7, drag: 1.5 });
        }
        if ((this.auraT -= dt) <= 0) { this.auraT = 0.9; if (this.headPos(m.id, _v)) this.monster.companion?.glint(_v.x, _v.y + 0.08, _v.z, 0.45, 0); }
      }
    }
    if (!pathOn) this.path.fill.visible = this.path.line.visible = false;
    nl = this.drawRush(dt, nl);
    for (let i = nl; i < this.lanes.length; i++) { const L = this.lanes[i]; L.band.visible = L.fill.visible = L.edge.visible = false; }
    if (!fang) this.shadow.visible = false;
    this.drawCrash(dt);
    this.drawGhosts(dt);
    this.drawPhantoms(dt, g, fang);
    this.drawTrail();
    this.drawClaws(dt);
    this.drawFurrows(dt);
    this.drawWaves(dt);
    this.drawBeams(dt);
    this.core.end(); this.glow.end();
    this.drawMarks(dt);
    this.drawLimp(dt, g.player);
  }

  // three streaks of wind from its body (its sides and its back), sampled every frame
  trackTrail(m, live, dt, fast) {
    const T = this.trail, s = live.root.scale.x, f = live.root.rotation.y, rx = Math.cos(f), rz = -Math.sin(f);
    if (T.id !== m.id || (!fast && T.a <= 0)) { T.id = m.id; for (const P of T.pts) for (const p of P) p.copy(live.root.position); }
    T.a = fast ? Math.min(1, T.a + dt * 10) : Math.max(0, T.a - dt * 4);
    const o = live.root.position, OFF = TRAIL_OFF;
    for (let i = 0; i < 3; i++) {
      const P = T.pts[i];
      for (let j = 0; j < HIST - 1; j++) P[j].copy(P[j + 1]);
      P[HIST - 1].set(o.x + rx * OFF[i][0] * s, o.y + OFF[i][1] * s, o.z + rz * OFF[i][0] * s);
    }
  }
  drawTrail() {
    const T = this.trail;
    if (T.a <= 0.02) return;
    for (let i = 0; i < 3; i++) { RW.v = (i === 2 ? 0.22 : 0.15) * T.a; this.glow.strip(T.pts[i], tailGlowW, 0.6 * T.a, SILVER.glow); this.core.strip(T.pts[i], tailW, 0.9 * T.a, SILVER.edge); }
  }

  drawGhosts(dt) {
    for (const G of this.ghosts) {
      if (G.t >= G.life) { G.rig.root.visible = false; continue; }
      G.t += dt;
      // shown once the wolf has moved on from it (never over the wolf itself), then fading
      const q = Math.min(1, G.t / G.life);
      G.rig.root.visible = G.t > 0.05 && q < 1;
      this.tint(G.rig, 0.42 * (1 - q) ** 1.5);
    }
  }

  // the phantom rush's shadows: crouched at their lanes' starts (copying its own crouch), then running the lanes
  // with the projectiles, then fading out
  drawPhantoms(dt, g, fang) {
    if (!this.phantoms.length) return;
    const live = fang && this.rig(fang.id);
    for (const pr of g.projectiles) {
      if (pr.kind !== 'phantom_wolf' || this.phantoms.some((P) => P.pid === pr.id)) continue;
      const P = this.phantoms.find((q) => q.phase === 'wait');
      if (P) { P.phase = 'run'; P.pid = pr.id; this.dustRing(pr.x, pr.z, 8, 3, 0.8, 0.5); }
    }
    for (const P of this.phantoms) {
      const rig = P.rig;
      if (P.phase === 'off') { rig.root.visible = false; continue; }
      P.t += dt;
      if (P.phase === 'wait') {
        if (live) this.copyPose(rig, live);
        rig.root.position.set(P.x, this.gy(P.x, P.z), P.z); rig.root.rotation.set(0, P.a, 0);
        P.alpha = Math.min(0.55, P.t * 1.4);
        if (!fang || (fang.state !== 'windup' && fang.state !== 'act')) { P.phase = 'gone'; P.pid = -1; }
      } else if (P.phase === 'run') {
        let pr = null;
        for (const q of g.projectiles) if (q.id === P.pid) { pr = q; break; }
        if (!pr) { P.phase = 'gone'; P.pid = -1; continue; }
        rig.root.position.set(pr.x, this.gy(pr.x, pr.z), pr.z); rig.root.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
        rig.animate(rig, RUN, dt, this.time);
        P.alpha = 0.6;
        if (Math.random() < 0.6) this.monster.call?.dust(pr.x, this.gy(pr.x, pr.z) + 0.15, pr.z, -pr.vx * 0.1, 0.4, -pr.vz * 0.1, 0.8, 0.4);
        if (this.time >= P.next) { P.next = this.time + 0.07; const G = this.ghosts[this.ghostI++ % this.ghosts.length]; if (G) { this.copyPose(G.rig, rig); G.t = 0; } }
      } else {
        P.alpha = Math.max(0, P.alpha - dt * 3);
        if (P.alpha <= 0) { P.phase = 'off'; rig.root.visible = false; continue; }
      }
      rig.root.visible = true;
      this.tint(rig, P.alpha, 0.8);
    }
  }

  // the phantom rush's three lanes, each filling to its own run, flashing as it goes, then fading
  drawRush(dt, nl) {
    const R = this.rush;
    if (!R.on) return nl;
    R.t += dt;
    let any = false;
    for (let i = 0; i < R.n && nl < this.lanes.length; i++) {
      const L = R.lanes[i], after = R.t - L.fire;
      if (after > 0.35) continue;
      any = true;
      this.lane(nl++, L.x, L.z, L.a, L.w, L.len, Math.min(1, R.t / L.fire), after > 0 ? 1 - after / 0.35 : 1, after > 0);
    }
    if (!any) R.on = false;
    return nl;
  }
  lane(i, x, z, a, w, len, k, fade = 1, flash = false) {
    const L = this.lanes[i], y = this.gy(x, z) + 0.05;
    this.laneMesh(L.band, x, y, z, a, w, len, (0.16 + 0.1 * k) * fade);
    this.laneMesh(L.fill, x, y + 0.005, z, a, w * 0.92, len * k, (flash ? 0.7 : 0.32) * fade);
    this.laneMesh(L.edge, x, y + 0.01, z, a, 0.08, len, (0.5 + 0.4 * k) * fade);
  }
  laneMesh(mesh, x, y, z, a, w, len, o) {
    mesh.position.set(x, y, z); mesh.rotation.set(0, a, 0); mesh.scale.set(w, 1, Math.max(0.01, len));
    mesh.material.opacity = o; mesh.visible = true;
  }

  drawCrash(dt) {
    const C = this.crash;
    if (C.on) {
      C.t += dt;
      const U = this.warn.material.uniforms; U.uR.value = C.R; U.uK.value = Math.min(1, C.t / C.total); U.uOpen.value = Math.min(1, C.t / 0.15);
      place(this.warn, C.x, 0.04, C.z); this.warn.scale.setScalar(C.R * 2 * 1.06); conformPlane(this.warn); this.warn.visible = true;
      if (C.t > C.total + 0.5) { C.on = false; this.warn.visible = false; }
    }
    if (this.craterT < 4) {
      this.craterT += dt;
      this.crater.material.uniforms.uA.value = Math.min(1, this.craterT / 0.06) * Math.max(0, Math.min(1, (4 - this.craterT) / 1));
      if (this.craterT >= 4) this.crater.visible = false;
    }
  }

  // claw marks of light scored into the ground: three short lines side by side, fading
  drawClaws(dt) {
    for (const C of this.claws) {
      if (C.t >= C.life) continue;
      C.t += dt;
      const fade = Math.min(1, (C.life - C.t) / (C.life * 0.6)), grow = Math.min(1, C.t / 0.08), sx = Math.cos(C.a), sz = -Math.sin(C.a), fx = Math.sin(C.a), fz = Math.cos(C.a), y = this.gy(C.x, C.z) + 0.05;
      const P = this.linePts;
      for (let l = -1; l <= 1; l++) {
        for (let j = 0; j < 8; j++) {
          const u = (j / 7 - 0.5) * C.len * grow, bend = 0.08 * (1 - (2 * j / 7 - 1) ** 2);
          P[j].set(C.x + fx * u + sx * (l * 0.22 + bend), y, C.z + fz * u + sz * (l * 0.22 + bend));
        }
        RW.v = 0.07 * fade; this.glow.strip(P, taperGlowW, 0.5 * fade, SILVER.glow); this.core.strip(P, taperW, 0.85 * fade, SILVER.edge);
      }
    }
  }

  // furrows: two claw lines under each forepaw, from where the skid began to where it got to, dark earth with a faint
  // moonlit rim, fading once it has stopped
  drawFurrows(dt) {
    for (const F of this.furrows) {
      if (F.t >= F.life) continue;
      if (!F.on) F.t += dt;
      const fade = Math.min(1, (F.life - F.t) / (F.life * 0.5)), len = Math.hypot(F.x1 - F.x0, F.z1 - F.z0);
      if (len < 0.05) continue;
      const dx = (F.x1 - F.x0) / len, dz = (F.z1 - F.z0) / len, P = this.linePts;
      for (const lat of FURROW_LAT) {
        for (let j = 0; j < 8; j++) {
          const u = j / 7, wob = 0.03 * Math.sin(u * 9 + lat * 20), x = F.x0 + (F.x1 - F.x0) * u + dz * (lat + wob), z = F.z0 + (F.z1 - F.z0) * u - dx * (lat + wob);
          P[j].set(x, this.gy(x, z) + 0.04, z);
        }
        RW.v = 0.17 * fade; this.glow.strip(P, tailGlowW, 0.35 * fade, DIRT.glow); this.core.strip(P, tailW, 0.95 * fade, DIRT.edge);
      }
    }
  }

  // rings running out over the ground (shock, sound, dust)
  drawWaves(dt) {
    for (const W of this.waves) {
      if (W.t >= W.dur) continue;
      W.t += dt;
      if (W.t < 0) continue;
      const k = Math.min(1, W.t / (W.dur * 0.7)), r = W.R * (0.15 + 0.85 * (1 - (1 - k) * (1 - k))), fade = W.t > W.dur * 0.6 ? 1 - (W.t - W.dur * 0.6) / (W.dur * 0.4) : 1, y = this.gy(W.x, W.z) + 0.3, n = this.pts.length;
      for (let j = 0; j < n; j++) { const a = (j / (n - 1)) * Math.PI * 2; this.pts[j].set(W.x + Math.sin(a) * r, y + Math.sin(a * 5 + this.time * 8) * 0.05, W.z + Math.cos(a) * r); }
      RW.v = W.w * fade; this.glow.strip(this.pts, lineGlowW, 0.8 * fade, W.look.glow); this.core.strip(this.pts, lineW, 0.85 * fade, W.look.edge);
    }
  }

  // a pillar of light up after it as it springs
  drawBeams(dt) {
    for (const B of this.beams) {
      if (B.t >= B.dur) continue;
      B.t += dt;
      const q = B.t / B.dur, fade = 1 - q, top = B.y0 + (B.y1 - B.y0) * Math.min(1, q * 3), bot = B.y0 + (B.y1 - B.y0) * q * q;
      for (let j = 0; j < 8; j++) this.linePts[j].set(B.x, bot + (top - bot) * (j / 7), B.z);
      RW.v = 0.5 * fade; this.glow.strip(this.linePts, taperGlowW, 0.7 * fade, SILVER.glow); this.core.strip(this.linePts, taperW, 0.9 * fade, PALE.edge);
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

  // the hero's limp: a torn ring at the feet
  drawLimp(dt, p) {
    const hob = p && !p.dead && p.statuses?.hobble;
    this.limp.visible = !!hob;
    if (!hob) return;
    const y = this.gy(p.x, p.z) + 0.06;
    this.limp.position.set(p.x, y, p.z); this.limp.scale.setScalar(0.55 + 0.05 * Math.sin(this.time * 14));
    this.limp.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 6));
    if (Math.random() < dt * 4) this.monster.call?.dust(p.x, y + 0.1, p.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.45, 0.35);
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
// the wind streaks' anchors on its body (rig units: sideways, up): its two flanks and its back
const TRAIL_OFF = [[0.42, 0.55], [-0.42, 0.55], [0, 0.95]];
// the furrows' sideways offsets (m): two claw lines under each forepaw
const FURROW_LAT = [-0.7, -0.42, 0.42, 0.7];
