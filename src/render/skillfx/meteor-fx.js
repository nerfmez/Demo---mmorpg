// Meteor, in the FX bench's light-and-ribbon language (owner, 2026-10-26: the effects made on the bench
// are the reference) and sized for a job skill (10 s cooldown): more beats and a wider footprint than
// Firebolt, inside the real hit area.
//   Warning (the rules' delay): a thin double ring of light marks the hit area (as Arrow Rain's
//   circle does) while an inner ring closes in like a timer; a star twinkles and brightens in the sky.
//   Fall (the last FALL seconds): the star drops as a ball of fire-light with a thick tapering tail,
//   shedding spark streaks.
//   Impact ('burst'): a big glow pops, light rays burst up and out, two shock rings race past the
//   radius, glowing cracks open in the ground and cool, spark streaks fly, little stars pop, embers
//   linger. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, glowTexture, starTexture, lightSprite, W, lineW, lineGlowW, taperW, taperGlowW, tailW, tailGlowW, circlePoints, drawSparks, spark } from './light-kit.js';

const SLOTS = 2, FALL = 0.55, APEX = 6.6, BACK = 2.6, RAYS = 14, CRACKS = 9, STARS = 8, EMBERS = 10, SPARKS = 320, RING = 48;

export class MeteorFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 7000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 7000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.slots = Array.from({ length: SLOTS }, () => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, sparkAt: 0,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(),
      sky: lightSprite(scene, glowTexture('fire'), true, 9), skyStar: lightSprite(scene, starTexture('fire'), false, 10),
      pop: lightSprite(scene, glowTexture('fire'), true, 9),
      rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })),
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
      stars: Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, starTexture('fire'), false, 10), p: new THREE.Vector3(), at: 0 })),
      embers: Array.from({ length: EMBERS }, () => ({ sp: lightSprite(scene, glowTexture('fire'), true, 9), p: new THREE.Vector3(), ph: 0 })),
    }));
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, look: lightOf(element), landedAt: -1, sparkAt: 0 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    for (const sp of [s.sky, s.pop, ...s.embers.map((q) => q.sp)]) sp.material.map = glowTexture(element);
    for (const sp of [s.skyStar, ...s.stars.map((q) => q.sp)]) sp.material.map = starTexture(element);
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.sky.visible = false; s.skyStar.visible = false;
    const r = this.rnd, R = s.radius;
    s.rays.forEach((ray, k) => { const a = r() * 6.283, el = k < 5 ? 0.9 + r() * 0.6 : 0.1 + r() * 0.5; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = R * (k < 5 ? 0.7 + r() * 0.5 : 0.45 + r() * 0.4); });
    s.cracks.forEach((c, k) => { const a = (k / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, j = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + j * 0.4) * len * u, 0.03, s.z + Math.sin(a + j * 0.4) * len * u); } });
    s.stars.forEach((q) => { const a = r() * 6.283, d = R * (0.2 + r() * 0.7); q.p.set(s.x + Math.cos(a) * d, 0.6 + r() * 1.6, s.z + Math.sin(a) * d); q.at = 0.05 + r() * 0.35; });
    s.embers.forEach((q) => { const a = r() * 6.283, d = R * Math.sqrt(r()) * 0.8; q.p.set(s.x + Math.cos(a) * d, 0.15, s.z + Math.sin(a) * d); q.ph = r() * 6; });
    for (let i = 0; i < 60; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) { for (const sp of [s.sky, s.skyStar, s.pop, ...s.stars.map((q) => q.sp), ...s.embers.map((q) => q.sp)]) sp.visible = false; }
  update(dt) {
    this.core.begin(); this.glow.begin();
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      if (s.landedAt < 0) this.warn(s); else this.after(s, s.t - s.landedAt);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end();
  }
  warn(s) {
    const L = s.look, open = Math.min(1, s.t / 0.15), k = Math.min(1, s.t / s.delay);
    // the hit area: an outer ring and a closing timer ring
    circlePoints(this.ring, s.x, s.z, s.radius * (0.9 + 0.1 * open));
    W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.7 * open, L.glow); this.core.strip(this.ring, lineW, open, L.edge);
    circlePoints(this.ring, s.x, s.z, s.radius * Math.max(0.05, 1 - k) * 0.97);
    W.v = 0.035; this.glow.strip(this.ring, lineGlowW, 0.6 * open, L.glow); this.core.strip(this.ring, lineW, 0.85 * open, L.edge);
    const fallAt = s.delay - FALL;
    if (s.t < fallAt) {
      const u = Math.min(1, s.t / Math.max(0.1, fallAt)), tw = 0.8 + 0.2 * Math.sin(s.t * 30);
      s.sky.visible = true; placeV(s.sky, s.apex); s.sky.scale.setScalar((0.8 + 1.6 * u) * tw);
      s.skyStar.visible = true; placeV(s.skyStar, s.apex); s.skyStar.scale.setScalar((0.4 + 0.7 * u) * tw); s.skyStar.material.rotation = s.t * 2;
      return;
    }
    s.skyStar.visible = false;
    const f = Math.min(1, (s.t - fallAt) / FALL), e = f * f * 0.7 + f * 0.3;
    s.head.set(s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.3 * e, s.apex.z + (s.z - s.apex.z) * e);
    placeV(s.sky, s.head); s.sky.scale.setScalar(2.6 + 0.3 * Math.sin(s.t * 50));
    const back = this.two, tl = 1.2 + 3.6 * Math.min(1, f * 3);
    back[0].copy(s.head).addScaledVector(s.dir, -tl); back[1].copy(s.head);
    W.v = 0.5; this.glow.strip(back, tailGlowW, 1, L.glow);
    W.v = 0.42; this.core.strip(back, tailW, 1, L.edge);
    if (s.t - s.sparkAt > 0.02) { s.sparkAt = s.t; const r = this.rnd; this.v.set((r() - 0.5) * 2, 0.5 + r(), (r() - 0.5) * 2).addScaledVector(s.dir, -2); spark(this.sparks, this.free, SPARKS, s.head, this.v, 0.25 + r() * 0.2, 0.045, L); }
  }
  after(s, t) {
    const L = s.look, R = s.radius;
    // the glow pops big and fades
    const pk = Math.min(1, t / 0.35); s.pop.visible = pk < 1;
    if (s.pop.visible) { this.p.set(s.x, 0.8, s.z); placeV(s.pop, this.p); s.pop.scale.setScalar(R * (1.1 + 1.0 * Math.sqrt(pk))); s.pop.material.opacity = 1 - pk * pk; }
    // rays: shoot out, then thin away
    const rk = Math.min(1, t / 0.32);
    if (rk < 1) for (const ray of s.rays) {
      this.two[0].set(s.x, 0.3, s.z).addScaledVector(ray.d, ray.len * 0.15 * rk); this.two[1].set(s.x, 0.3, s.z).addScaledVector(ray.d, ray.len * (0.4 + 0.6 * Math.sqrt(rk)));
      W.v = 0.16 * (1 - rk); this.glow.strip(this.two, taperGlowW, 1 - rk, L.glow); this.core.strip(this.two, taperW, 1 - rk * rk, L.edge);
    }
    // two shock rings racing out past the radius
    for (const [d, w, far] of [[0, 0.09, 1.15], [0.1, 0.05, 0.95]]) {
      const k = Math.min(1, Math.max(0, t - d) / 0.4); if (k <= 0 || k >= 1) continue;
      circlePoints(this.ring, s.x, s.z, R * far * (1 - Math.pow(1 - k, 2)) + 0.2, 0.06);
      W.v = w * (1 - k * 0.7); this.glow.strip(this.ring, lineGlowW, 1 - k, L.glow); this.core.strip(this.ring, lineW, 1 - k * k, L.edge);
    }
    // glowing cracks: open fast, glow, cool
    const ck = Math.min(1, t / 0.12), cool = Math.max(0, 1 - Math.max(0, t - 0.6) / 1.2);
    if (cool > 0) for (const c of s.cracks) { W.v = 0.07 * ck; this.glow.strip(c, lineGlowW, cool, L.glow); this.core.strip(c, taperW, cool, L.edge); }
    // little stars pop around
    for (const q of s.stars) {
      const k = (t - q.at) / 0.4; q.sp.visible = k > 0 && k < 1;
      if (q.sp.visible) { placeV(q.sp, q.p); q.sp.scale.setScalar(0.5 * Math.sin(Math.PI * k)); q.sp.material.rotation = k * 2; }
    }
    // embers linger and flicker out
    for (const q of s.embers) {
      const k = t / 1.8; q.sp.visible = k < 1;
      if (q.sp.visible) { placeV(q.sp, q.p); q.sp.scale.setScalar(0.55 * (1 - k) * (0.7 + 0.3 * Math.sin(t * 20 + q.ph))); q.sp.material.opacity = 1 - k; }
    }
    if (t > 2) { s.live = false; this.hide(s); }
  }
  clear() { for (const s of this.slots) { s.live = false; this.hide(s); } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live); }
}
