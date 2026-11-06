// The sporecap's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Fairy ring (core area kind fairy_ring): little mushrooms sprout round the ring as it grows, over a band of warning
//   between its inner and outer edge (the middle stays clear: it is safe); as it goes off each one puffs spores and the
//   ring shrinks back into the ground.
// - Sprouts (core sprout, sproutPuff, wilt): earth pops where each is sown; a puff of spores as each puffs; a little
//   cloud of spores where one wilts.
// - Sleepy spores (core area kind sleep_cloud): a soft pink cloud drifting along the ground over a pale disc of its
//   true size; Zs rise over whoever is getting drowsy in it, faster as they near sleep; asleep, a bubble swells and
//   shrinks at their nose.
// Pools only; no allocation per frame.
import * as THREE from 'three';
import { lightSprite, bubbleTexture } from './light-kit.js';

const RINGS = 3, SHROOMS = 14;
const SPORE = 0xc89aff, SLEEP = 0xffc8e8;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
let ZTEX = null;
const zTexture = () => {
  if (ZTEX) return ZTEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(90,40,110,0.9)'; g.strokeText('Z', 32, 34);
  g.fillStyle = '#ffffff'; g.fillText('Z', 32, 34);
  ZTEX = new THREE.CanvasTexture(c); ZTEX.userData.shared = true;
  return ZTEX;
};

export class SporeMonFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    const mat = (c, o, add = false) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = (g, m, order) => { const x = new THREE.Mesh(g, m); x.visible = false; x.renderOrder = order; x.frustumCulled = false; scene.add(x); return x; };
    // fairy rings: a band (its own geometry, rebuilt per ring for its inner edge) and its two crisp edges
    this.rings = Array.from({ length: RINGS }, () => ({ id: -1, band: mesh(new THREE.RingGeometry(0.5, 1, 56).rotateX(-Math.PI / 2), mat(0xff7a5a, 0.25), 6), out: mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), mat(0xff8a6a, 0.8), 7), inn: mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), mat(0xffd0a0, 0.6), 7), seed: 0, done: -1, x: 0, z: 0, R: 1 }));
    // the little mushrooms: instanced stems and caps
    const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 6).translate(0, 0.11, 0); stem.userData.shared = true;
    const cap = new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.2, 0); cap.userData.shared = true;
    const sm = new THREE.MeshBasicMaterial({ color: 0xf0e4cc, toneMapped: false }), cm = new THREE.MeshBasicMaterial({ color: 0xd8584a, toneMapped: false });
    sm.userData.shared = cm.userData.shared = true;
    this.stems = new THREE.InstancedMesh(stem, sm, RINGS * SHROOMS); this.caps = new THREE.InstancedMesh(cap, cm, RINGS * SHROOMS);
    for (const im of [this.stems, this.caps]) { im.count = 0; im.frustumCulled = false; im.renderOrder = 8; scene.add(im); }
    // sleepy clouds: a pale disc and its edge
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); disc.userData.shared = true;
    const edge = new THREE.RingGeometry(0.95, 1, 48).rotateX(-Math.PI / 2); edge.userData.shared = true;
    this.clouds = Array.from({ length: 2 }, () => ({ disc: mesh(disc, mat(SLEEP, 0.2), 6), edge: mesh(edge, mat(0xff9ad0, 0.6), 7) }));
    // Zs and sleep bubbles
    this.zs = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); s.visible = false; s.renderOrder = 12; scene.add(s); return { s, t: 9, x: 0, y: 0, z: 0 }; });
    this.zI = 0; this.zNext = 0;
    this.bubble = lightSprite(scene, bubbleTexture(), true, 12); this.bubble.material.color.setHex(0xd8f0ff);
    this.sleepT = 0; this.sleepFor = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }
  get dust() { return this.host.vfx?.dust; }
  spores(x, z, n, up = 1) {
    const y = this.gy(x, z), d = this.dust;
    if (d) for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 0.4 + Math.random() * 0.8; d.add(x + Math.sin(a) * 0.15, y + 0.3, z + Math.cos(a) * 0.15, Math.sin(a) * v, 0.6 * up + Math.random() * 0.5, Math.cos(a) * v, { color: i % 2 ? SPORE : 0xe0c8ff, size: 0.35, sizeEnd: 0.9, life: 0.9, drag: 2, alpha: 0.55 }); }
  }

  /** A sporecap's own events; true when drawn here. */
  event(e) {
    if (e.type === 'sprout') {
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.2, y + 0.1, e.z + Math.cos(a) * 0.2, Math.sin(a) * 1.2, 0.8, Math.cos(a) * 1.2, 0.6, 0.45); }
      this.spores(e.x, e.z, 5);
      return true;
    }
    if (e.type === 'sproutPuff') { const r = this.host.monsterRig?.(e.id); if (r) r.puffT = 0.4; this.spores(e.x, e.z, 8, 1.4); return true; }
    if (e.type === 'wilt') { this.spores(e.x, e.z, 10, 0.5); return true; }
    if (e.type === 'asleep') {
      if (e.hero) { this.sleepT = 0; this.sleepFor = e.duration; }
      return true;
    }
    return false;
  }
  /** A fairy ring goes off (core burst of kind fairy_ring): every mushroom puffs. */
  burst(e) {
    const R = e.radius, ri = e.inner || 0, mid = (R + ri) / 2;
    for (let i = 0; i < SHROOMS; i++) { const a = (i / SHROOMS) * 6.283; this.spores(e.x + Math.sin(a) * mid, e.z + Math.cos(a) * mid, 2, 1.6); }
    this.monster.call?.ring(e.x, this.gy(e.x, e.z) + 0.08, e.z, R, new THREE.Color(0xd8a0ff), 0.4);
    for (const r of this.rings) if (Math.hypot(r.x - e.x, r.z - e.z) < 0.05) r.done = this.time;
    this.monster.onShake?.(0.05, 0.08);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    // fairy rings
    let n = 0, mi = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'fairy_ring' || n >= RINGS) continue;
      const q = this.rings[n++];
      if (q.id !== ar.id) {
        q.id = ar.id; q.seed = Math.random() * 6; q.done = -1; q.x = ar.x; q.z = ar.z; q.R = ar.radius;
        q.band.geometry.dispose(); q.band.geometry = new THREE.RingGeometry(ar.inner / ar.radius, 1, 56).rotateX(-Math.PI / 2);
      }
      const k = Math.min(1, ar.t / Math.max(0.01, ar.delay)), y = this.gy(ar.x, ar.z);
      for (const m of [q.band, q.out, q.inn]) { m.visible = ar.t < ar.delay; m.position.set(ar.x, y + 0.05, ar.z); }
      q.band.scale.set(ar.radius, 1, ar.radius); q.band.material.opacity = 0.12 + 0.28 * k;
      q.out.scale.set(ar.radius, 1, ar.radius); q.inn.scale.set(ar.inner, 1, ar.inner);
      // mushrooms sprout one after another round the ring, each popping up with a little overshoot
      const mid = (ar.radius + ar.inner) / 2, shrink = ar.t >= ar.delay ? Math.max(0, 1 - (ar.t - ar.delay) / 0.3) : 1;
      for (let i = 0; i < SHROOMS; i++) {
        const at = (i / SHROOMS) * 0.6, g2 = Math.max(0, Math.min(1, (k - at) / 0.3)), pop = g2 < 1 ? g2 * (1 + 0.35 * Math.sin(g2 * Math.PI)) : 1;
        if (pop <= 0) continue;
        const a = (i / SHROOMS) * 6.283 + q.seed, rr = mid + Math.sin(i * 2.7 + q.seed) * (ar.radius - ar.inner) * 0.25;
        const x = ar.x + Math.sin(a) * rr, z = ar.z + Math.cos(a) * rr, sc = pop * shrink * (1.5 + 0.7 * ((i * 0.37) % 1));
        _p.set(x, this.gy(x, z), z); _q.identity(); _s.set(sc, sc, sc); _m.compose(_p, _q, _s);
        this.stems.setMatrixAt(mi, _m); this.caps.setMatrixAt(mi, _m); mi++;
      }
    }
    for (let i = n; i < RINGS; i++) { const q = this.rings[i]; q.band.visible = q.out.visible = q.inn.visible = false; q.id = -1; }
    this.stems.count = this.caps.count = mi;
    this.stems.instanceMatrix.needsUpdate = this.caps.instanceMatrix.needsUpdate = true;
    // sleepy clouds
    let c = 0;
    for (const ar of g.areas) {
      if (ar.kind !== 'sleep_cloud' || c >= this.clouds.length) continue;
      const q = this.clouds[c++], y = this.gy(ar.x, ar.z), fade = Math.min(1, ar.t * 3, (ar.duration - ar.t) * 2);
      for (const m of [q.disc, q.edge]) { m.visible = true; m.position.set(ar.x, y + 0.05, ar.z); m.scale.set(ar.radius, 1, ar.radius); }
      q.disc.material.opacity = 0.22 * fade; q.edge.material.opacity = 0.55 * fade;
      const d = this.dust;
      if (d && Math.random() < 0.6) for (let i = 0; i < 1; i++) { const a = Math.random() * 6.283, rr = Math.random() * ar.radius * 0.85; d.add(ar.x + Math.sin(a) * rr, y + 0.3 + Math.random() * 0.8, ar.z + Math.cos(a) * rr, (ar.drift?.vx || 0) * 0.8, 0.15, (ar.drift?.vz || 0) * 0.8, { color: Math.random() < 0.5 ? SLEEP : 0xf8e0ff, size: 0.7, sizeEnd: 1.3, life: 1.1, drag: 1, alpha: 0.3 * fade }); }
    }
    for (let i = c; i < this.clouds.length; i++) this.clouds[i].disc.visible = this.clouds[i].edge.visible = false;
    // Zs over a drowsy hero, faster as sleep nears; a bubble at the nose while asleep
    const p = g.player;
    this.zNext -= dt;
    const drowsy = p.drowse || 0, asleep = this.sleepT < this.sleepFor;
    if (!p.dead && (drowsy > 0.05 || asleep) && this.zNext <= 0) {
      this.zNext = asleep ? 0.45 : 0.5 - 0.35 * drowsy;
      const z = this.zs[this.zI++ % this.zs.length];
      Object.assign(z, { t: 0, x: p.x + 0.25, y: this.gy(p.x, p.z) + 1.7, z: p.z });
    }
    for (const z of this.zs) {
      if (z.t >= 1.2) { z.s.visible = false; continue; }
      z.t += dt;
      const k = z.t / 1.2;
      z.s.visible = true; z.s.position.set(z.x + Math.sin(k * 6) * 0.15 + k * 0.3, z.y + k * 0.9, z.z); z.s.scale.setScalar(0.22 + 0.2 * k); z.s.material.opacity = 1 - k * k;
    }
    if (asleep && !p.dead) {
      this.sleepT += dt;
      const br = 0.5 + 0.5 * Math.sin(this.sleepT * 4);
      this.bubble.visible = true; this.bubble.position.set(p.x + 0.12, this.gy(p.x, p.z) + 1.25, p.z + 0.2); this.bubble.scale.setScalar(0.15 + 0.3 * br); this.bubble.material.opacity = 0.9;
    } else this.bubble.visible = false;
  }
}
