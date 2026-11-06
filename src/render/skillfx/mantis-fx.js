// The thicket mantis's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events. A mantis hunts by
// sitting still, swaying to judge the gap, then shooting out its spined forelegs; threatened, it rears up and fans its
// wings to flash eyespots and hiss (a startle display); and it can fly a short way.
// - Peer strike (core peer_strike): the lane is the View's warning; through the sway its eyes and blade edges catch
//   the light, and it fixes its prey with a glint as the lane locks; the strike is two streaks of light (a soft green
//   glow round a bright core) shot down the lane with a rush of wind along it; on a hit a burst star, spine marks and
//   shredded leaves (core mantisStrike).
// - Startle (core startle): its wings (a narrow leafy forewing over a great fanned hindwing, rose at the root to gold
//   and pale at the scalloped edge, veined, a ringed eyespot) snap open with a gust of leaves; the eyespots pulse and
//   hiss rings roll off it; at the freeze each eyespot flares, a shock ring runs to the cone's reach and the frozen
//   hero is ringed by dizzy sparks while the fright lasts.
// - Wing leap (core pounce with past, area mantis_land): wings buzz through the crouch, a gust ring at take-off,
//   wings beating in flight shedding leaves; it lands behind its prey with an X of two scythe slashes (glow and core)
//   across the true circle, sparks and leaves.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const HISS = new THREE.Color(0xf6ffd8), LAND = new THREE.Color(0xd8f0a0), GUST = new THREE.Color(0xe8f4c8), FLARE = new THREE.Color(0xffd860);
const STAR = { core: [1, 1, 0.9], glow: [0.7, 0.95, 0.35] }, EYE_STAR = { core: [1, 0.98, 0.85], glow: [1, 0.75, 0.25] };
const LEAF = [0x7fb14a, 0x5d8a3a, 0xa6c95a, 0x8a6a48];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// --- the wings, painted once on canvases (shared) ---
let WING = null;
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  return t;
}
function wingAssets() {
  if (WING) return WING;
  // the hindwing: a quarter fan from its root (bottom left), a scalloped edge between radiating veins
  const hind = canvas(256, 256, (g, W, H) => {
    const O = [6, H - 6], R = 236, N = 9;
    const fan = () => {
      g.beginPath(); g.moveTo(O[0], O[1]);
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * (Math.PI / 2), bump = Math.abs(Math.sin(a * N)) * 14, r = R - 14 + bump;
        g.lineTo(O[0] + Math.cos(a) * r, O[1] - Math.sin(a) * r);
      }
      g.closePath();
    };
    const gr = g.createRadialGradient(O[0], O[1], 6, O[0], O[1], R);
    gr.addColorStop(0, '#9c2452'); gr.addColorStop(0.28, '#e2506a'); gr.addColorStop(0.55, '#ff9a42'); gr.addColorStop(0.8, '#ffd862'); gr.addColorStop(1, '#f4f2b8');
    fan(); g.fillStyle = gr; g.fill();
    g.save(); fan(); g.clip();
    // cross veins: faint arcs; radiating veins: darker lines out to each scallop
    g.strokeStyle = 'rgba(90,30,30,0.28)'; g.lineWidth = 1.5;
    for (const r of [70, 115, 160, 200]) { g.beginPath(); g.arc(O[0], O[1], r, -Math.PI / 2, 0); g.stroke(); }
    g.strokeStyle = 'rgba(70,20,25,0.55)'; g.lineWidth = 2.5;
    for (let i = 0; i <= N; i++) { const a = (i / N) * (Math.PI / 2); g.beginPath(); g.moveTo(O[0], O[1]); g.lineTo(O[0] + Math.cos(a) * R, O[1] - Math.sin(a) * R); g.stroke(); }
    // the eyespot: a dark ring, gold, a blue-violet iris, a black pupil, a highlight
    const ea = Math.PI / 4, er = 140, ex = O[0] + Math.cos(ea) * er, ey = O[1] - Math.sin(ea) * er;
    for (const [r, col] of [[40, '#1c1410'], [33, '#ffcf3a'], [25, '#4a3ad0'], [14, '#0e0a10']]) { g.beginPath(); g.arc(ex, ey, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    g.beginPath(); g.arc(ex - 6, ey - 7, 6, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    fan(); g.strokeStyle = '#3a1418'; g.lineWidth = 5; g.stroke();
  });
  // the forewing: a narrow leaf, its root at the left middle
  const fore = canvas(256, 64, (g, W, H) => {
    const leaf = () => { g.beginPath(); g.moveTo(4, H / 2); g.bezierCurveTo(70, 2, 190, 4, W - 6, H / 2 - 2); g.bezierCurveTo(190, H - 4, 70, H - 2, 4, H / 2); g.closePath(); };
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#5d8a3a'); gr.addColorStop(0.5, '#8fbd52'); gr.addColorStop(1, '#b8d870');
    leaf(); g.fillStyle = gr; g.fill();
    g.save(); leaf(); g.clip();
    g.strokeStyle = 'rgba(40,70,25,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(6, H / 2); g.lineTo(W - 10, H / 2 - 2); g.stroke();
    g.lineWidth = 1.2; for (let i = 1; i < 9; i++) { const x = i * 26; g.beginPath(); g.moveTo(x, H / 2); g.lineTo(x + 16, 8); g.moveTo(x, H / 2); g.lineTo(x + 16, H - 8); g.stroke(); }
    g.beginPath(); g.arc(150, H / 2 - 10, 5, 0, Math.PI * 2); g.fillStyle = '#f6f2d0'; g.fill(); // the stigma spot
    g.restore();
    leaf(); g.strokeStyle = '#25381a'; g.lineWidth = 4; g.stroke();
  });
  const mat = (map) => { const m = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false }); m.userData.shared = true; return m; };
  const hindGeo = new THREE.PlaneGeometry(1.15, 1.15).translate(0.575, 0.575, 0); hindGeo.userData.shared = true;
  const foreGeo = new THREE.PlaneGeometry(0.95, 0.24).translate(0.475, 0, 0); foreGeo.userData.shared = true;
  WING = { hindMat: mat(hind), foreMat: mat(fore), hindGeo, foreGeo };
  return WING;
}

export class MantisFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    // streaks: a soft glow strip under a bright core strip, along the lane (the strike) or crossing (the landing X)
    const strip = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); strip.userData.shared = true;
    const mid = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); mid.userData.shared = true;
    const make = (geo, color, o, order) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = order; m.frustumCulled = false; this.scene.add(m); return m; };
    this.streaks = Array.from({ length: 4 }, () => ({ glow: make(strip, 0x9ad84a, 0.5, 8), core: make(strip, 0xfbffe0, 0.95, 9), t: 9, life: 0.3, w: 0.08 }));
    this.slashes = Array.from({ length: 2 }, () => ({ glow: make(mid, 0x9ad84a, 0.5, 8), core: make(mid, 0xf8ffe0, 0.95, 9), t: 9, life: 0.45, w: 0.14 }));
    this.streakI = 0;
    this.tick = new Map(); // monster id -> next cue time (hiss, eye pulse, glints)
    this.flew = new Set();
    this.fixed = new WeakSet(); this.gusted = new WeakSet(); // wind-ups already cued (the core's objects, only looked up)
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  every(id, key, dt, gap) { const k = id * 8 + key, t = (this.tick.get(k) ?? 0) - dt; this.tick.set(k, t <= 0 ? gap : t); return t <= 0; }

  /** Its wings (once per rig, on its body bone; pooled rigs keep them): a forewing over a fanned hindwing a side. */
  dress(rig) {
    if (rig.mantisWings || !rig.bones?.body) return;
    const A = wingAssets(), rest = rig.bones.body.userData.rest.pos, wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.06 - rest.x, 0.84 - rest.y, -0.08 - rest.z); // at the thorax's root, rig rest space
      const hind = new THREE.Mesh(A.hindGeo, A.hindMat), fore = new THREE.Mesh(A.foreGeo, A.foreMat);
      hind.scale.x = side; fore.scale.x = side; // the right side mirrored
      fore.position.z = 0.02; fore.rotation.z = side * 1.05; // the forewing raised along the fan's leading edge
      pivot.add(hind, fore);
      pivot.visible = false;
      rig.bones.body.add(pivot);
      wings.push({ pivot, hind, fore, side });
    }
    rig.mantisWings = wings;
  }
  eyespot(W, out) { return W.hind.localToWorld(out.set(W.side * 0.57, 0.57, 0.02)); }

  streak(S, x, y, z, angle, len, life, w) {
    Object.assign(S, { t: 0, life, w });
    for (const m of [S.glow, S.core]) { m.visible = true; m.position.set(x, y, z); m.rotation.set(0, angle, 0); }
    S.len = len;
  }

  /** The mantis's events; true when drawn here. */
  event(e, g) {
    if (e.type === 'mantisStrike') {
      const s = Math.sin(e.angle), c = Math.cos(e.angle), y = this.gy(e.x, e.z), fx = this.fx;
      for (const off of [0.15, -0.15]) this.streak(this.streaks[this.streakI++ % this.streaks.length], e.x + c * off + s * 0.3, y + 0.95, e.z - s * off + c * 0.3, e.angle, Math.max(0.6, e.reach), 0.32, 0.09);
      // a rush of wind down the lane
      for (let i = 0; i < 6; i++) { const u = (i + Math.random()) / 6 * e.reach; this.monster.call?.dust(e.x + s * u, y + 0.15, e.z + c * u, s * 2.5, 0.3, c * 2.5, 0.55, 0.35); }
      if (fx) for (let i = 0; i < 10; i++) { const u = Math.random() * e.reach; fx.add(e.x + s * u, y + 0.9, e.z + c * u, s * 6, Math.random(), c * 6, { color: 0xeaffc0, size: 0.06, sizeEnd: 0.01, life: 0.2, drag: 3 }); }
      const px = e.x + s * (e.reach + 0.25), pz = e.z + c * (e.reach + 0.25), py = this.gy(px, pz) + 0.9;
      if (e.hit) {
        this.monster.burstStar?.(px, py, pz, 0.6, STAR, 0xd8ff8a, 0xffffff);
        this.monster.companion?.axes();
        _v.set(px, py, pz);
        this.monster.companion?.rake(_v, 1, 4, 0.45, 0.75, 0.13, new THREE.Color('#9fd84a'), new THREE.Color('#fbffe8'), 0.02);
        if (fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 2; fx.add(px, py, pz, Math.sin(a) * v + s * 2, 1 + Math.random() * 2, Math.cos(a) * v + c * 2, { color: LEAF[i % 4], size: 0.1, sizeEnd: 0.04, life: 0.6, gravity: 8, drag: 1 }); }
        this.monster.onShake?.(0.09, 0.09);
      } else this.monster.call?.dust(px, this.gy(px, pz) + 0.15, pz, s, 0.4, c, 0.7, 0.4);
      return true;
    }
    if (e.type === 'startle') {
      // the freeze: each eyespot flares, a shock ring out to the cone's reach, a burst of hiss
      const r = this.host.monsterRig?.(e.id);
      if (r?.mantisWings) for (const W of r.mantisWings) { this.eyespot(W, _v); this.monster.burstStar?.(_v.x, _v.y, _v.z, 0.7, EYE_STAR, 0xffd860, 0xffffff); }
      const y = this.gy(e.x, e.z);
      this.monster.call?.ring(e.x, y + 0.08, e.z, e.range, FLARE, 0.35);
      for (let i = 0; i < 3; i++) this.monster.call?.ring(e.x, y + 1.5, e.z, 1.2 + i * 0.9, HISS, 0.3 + i * 0.08);
      this.monster.onShake?.(0.08, 0.1);
      return true;
    }
    if (e.type === 'wingLand') return true;
    return false;
  }

  /** It lands behind its prey (core burst of area mantis_land): an X of two slashes across the true circle. */
  burst(e) {
    if (e.kind !== 'mantis_land') return false;
    const y = this.gy(e.x, e.z), fx = this.fx;
    this.slashes.forEach((S, i) => { this.streak(S, e.x, y + 0.09, e.z, (i ? 1 : -1) * 0.78, e.radius * 2.1, 0.45, 0.16); });
    if (fx) {
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 2.5; fx.add(e.x, y + 0.3, e.z, Math.sin(a) * v, 1.5 + Math.random() * 2.5, Math.cos(a) * v, { color: LEAF[i % 4], size: 0.12, sizeEnd: 0.05, life: 0.65, gravity: 9, drag: 1 }); }
      for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, v = 4 + Math.random() * 3; fx.add(e.x, y + 0.5, e.z, Math.sin(a) * v, 1 + Math.random(), Math.cos(a) * v, { color: 0xf4ffc8, size: 0.07, sizeEnd: 0.01, life: 0.3, drag: 2.5 }); }
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.12, e.z + Math.cos(a) * 0.4, Math.sin(a) * 2, 0.4, Math.cos(a) * 2, 0.85, 0.45); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius, LAND, 0.35);
    this.monster.companion?.glint(e.x, y + 0.9, e.z, 1.2, 0);
    this.monster.onShake?.(0.12, 0.12);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    const p = g.player;
    for (const m of g.monsters) {
      if (m.type !== 'thicket_mantis' || m.dead) continue;
      const r = this.host.monsterRig?.(m.id);
      if (!r) continue;
      this.dress(r);
      const wu = m.state === 'windup' ? m.windup?.name : null, k = wu ? Math.min(1, m.stateT / m.windup.total) : 0;
      this.wings(r, m, wu);
      // the sway: glints run along its blades; it fixes its prey with a glint of the eyes as the lane locks
      if (wu === 'peer_strike') {
        if (this.every(m.id, 0, dt, 0.3)) for (const n of ['bladeL', 'bladeR']) { const b = r.bones[n]; if (!b) continue; b.updateWorldMatrix(true, false); _v.setFromMatrixPosition(b.matrixWorld); this.monster.companion?.glint(_v.x, _v.y, _v.z, 0.35, Math.random() * 0.1); }
        if (k > 0.78 && !this.fixed.has(m.windup)) { this.fixed.add(m.windup); const h = r.bones.head; if (h) { h.updateWorldMatrix(true, false); _v.setFromMatrixPosition(h.matrixWorld); this.monster.burstStar?.(_v.x, _v.y + 0.05, _v.z, 0.3, EYE_STAR, 0xffd860, 0xffffff); } }
      }
      // the display: a gust of leaves as the wings snap open, the eyespots pulsing, hiss rings
      if (wu === 'startle') {
        if (k > 0.38 && !this.gusted.has(m.windup)) { this.gusted.add(m.windup); this.gust(m.x, m.z, 1.4, 12); }
        if (this.every(m.id, 1, dt, 0.26)) this.monster.call?.ring(m.x, this.gy(m.x, m.z) + 1.6, m.z, 0.9 + k, HISS, 0.3);
        if (k > 0.4 && this.every(m.id, 2, dt, 0.2) && r.mantisWings) for (const W of r.mantisWings) { this.eyespot(W, _v); this.monster.companion?.glint(_v.x, _v.y, _v.z, 0.55, 0); }
      }
      // the leap: dust whirling under the crouch, a gust ring at take-off, leaves shed in flight
      if (wu === 'wing_leap' && Math.random() < 0.5) { const a = Math.random() * 6.283; this.monster.call?.dust(m.x + Math.sin(a) * 0.6, this.gy(m.x, m.z) + 0.1, m.z + Math.cos(a) * 0.6, Math.cos(a) * 1.5, 0.3, -Math.sin(a) * 1.5, 0.55, 0.35); }
      if (m.charge?.dive) {
        if (!this.flew.has(m.id)) { this.flew.add(m.id); this.gust(m.charge.fromX, m.charge.fromZ, 1.6, 10); }
        if (Math.random() < 0.7) this.fx?.add(m.x, this.gy(m.x, m.z) + 1.4, m.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), { color: LEAF[(Math.random() * 4) | 0], size: 0.11, sizeEnd: 0.04, life: 0.7, gravity: 2.5, drag: 1 });
      } else this.flew.delete(m.id);
    }
    // the frozen hero: dizzy sparks circling the head while the fright lasts
    if (p && !p.dead && p.statuses?.root && g.monsters.some((m) => m.type === 'thicket_mantis' && !m.dead) && this.fx) {
      const y = this.gy(p.x, p.z) + 1.9;
      for (let i = 0; i < 3; i++) { const a = this.time * 7 + (i / 3) * 6.283; this.fx.add(p.x + Math.sin(a) * 0.4, y, p.z + Math.cos(a) * 0.4, 0, 0, 0, { color: i % 2 ? 0xffe060 : 0xffffff, size: 0.09, sizeEnd: 0.02, life: 0.12 }); }
    }
    for (const S of this.streaks) this.fade(S, dt, true);
    for (const S of this.slashes) this.fade(S, dt, false);
  }

  gust(x, z, R, n) {
    const y = this.gy(x, z);
    this.monster.call?.ring(x, y + 0.06, z, R, GUST, 0.3);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; this.fx?.add(x + Math.sin(a) * 0.5, y + 0.3, z + Math.cos(a) * 0.5, Math.sin(a) * 3, 1 + Math.random(), Math.cos(a) * 3, { color: LEAF[i % 4], size: 0.11, sizeEnd: 0.04, life: 0.6, gravity: 5, drag: 1.5 }); }
  }

  // the wings: hidden folded; through the display they swing up from along its back and fan out behind it (tilted back
  // so they read from the high camera), forewings raised over them; in flight they beat
  wings(r, m, wu) {
    const k = r.wingSpread || 0;
    for (const W of r.mantisWings || []) {
      W.pivot.visible = k > 0.03;
      if (!W.pivot.visible) continue;
      const beat = m.charge?.dive ? Math.sin(this.time * 42) * 0.5 : wu === 'wing_leap' ? Math.sin(this.time * 55) * 0.25 : 0;
      const open = k * k * (3 - 2 * k);
      W.pivot.scale.setScalar(0.3 + 0.75 * open);
      W.pivot.rotation.set(-0.35 - 0.6 * open, W.side * (1.2 - 1.2 * open), W.side * (beat - 0.9 * (1 - open)));
      W.fore.rotation.z = W.side * (0.5 + 0.6 * open);
    }
  }

  fade(S, dt, along) {
    if (S.t >= S.life) { S.glow.visible = S.core.visible = false; return; }
    S.t += dt;
    const u = S.t / S.life, out = Math.min(1, S.t / 0.05), L = S.len * (along ? out : 1);
    S.core.scale.set(S.w * (1 - 0.6 * u), 1, L); S.glow.scale.set(S.w * 3.2, 1, L);
    S.core.material.opacity = 0.95 * (1 - u); S.glow.material.opacity = 0.5 * (1 - u);
    void _w;
  }
}
