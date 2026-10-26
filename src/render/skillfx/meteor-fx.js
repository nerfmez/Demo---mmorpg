// Meteor, drawn in the anime (sakuga) style the owner picked (2026-10-26, "ทำแบบอนิเมะ") and sized for a
// job skill (10 s cooldown). Built one phase at a time with the owner; rules in docs/VFX-REFERENCE.md.
//   Warning (the rules' delay): a crisp two-tone edge at the true radius over a low fill; an inner fill
//   grows from the centre and reaches the edge on the landing frame. A spiky star twinkles in the sky
//   behind the target, redrawn every drawing.
//   Fall (the last FALL seconds): a dark rock with molten cracks, wrapped in a comet of flat fire bands
//   (white hugging the rock, yellow, orange, a dark red shadow band) with swept-back tongues, redrawn
//   12 times a second; speed lines; fire chunks break off the tail and cool into solid cel smoke that
//   dies by holes. The last drawing before contact is a smear.
//   Impact ('burst'): still the earlier light version, to be redrawn next. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV, place, conformPlane, fxGround, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, glowTexture, starTexture, lightSprite, W, lineW, lineGlowW, taperW, taperGlowW, circlePoints, drawSparks, spark } from './light-kit.js';
import { drawingOf, DRAWINGS, cometMaterial, layComet, puffMaterial, spikeMaterial, warnDisc, billboard } from './anime-kit.js';

// the rock: two flat cel bands, molten cracks in flat fire bands, the face it falls on red-hot
const ROCK_VS = `varying vec3 vN; varying vec3 vO;
  void main(){ vO=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
const ROCK_FS = `varying vec3 vN; varying vec3 vO; uniform vec3 uDir;` + NOISE + `
  void main(){ vec3 N=normalize(vN);
    vec3 c = dot(N, normalize(vec3(-0.4,0.8,0.45))) > 0.15 ? vec3(0.29,0.21,0.25) : vec3(0.16,0.11,0.14);
    float n = fbm(vO.xy*1.3 + vO.z*1.1), crack = abs(fract(n*2.4) - 0.5);
    if (crack < 0.075) c = crack < 0.03 ? vec3(1.0,0.82,0.25) : vec3(1.0,0.48,0.1);
    float hot = dot(N, uDir);
    if (hot > 0.35) c = hot > 0.72 ? vec3(1.0,0.82,0.25) : vec3(1.0,0.48,0.1);
    gl_FragColor = vec4(c, 1.0); }`;
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; let a = seed;
  const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280), o = [r() * 6, r() * 6, r() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 0.86 + 0.16 * Math.sin(v.x * 2.3 + o[0]) * Math.cos(v.y * 2.1 + o[1]) + 0.08 * Math.sin(v.z * 3.7 + o[2]);
    p.setXYZ(i, v.x * f * 1.05, v.y * f * 0.88, v.z * f);
  }
  g.computeVertexNormals(); return g;
}

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, RAYS = 14, CRACKS = 9, STARS = 8, EMBERS = 10, SPARKS = 360, RING = 48, PUFFS = 24, LINES = 3;
const HEAD_R = 1.15, ROCK = 0.8;
const UP = new THREE.Vector3(0, 1, 0);

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 7000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 7000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    this.slots = Array.from({ length: SLOTS }, (_, i) => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, drawing: -1, salt: i * 101,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(), side: new THREE.Vector3(),
      warn: warnDisc(scene), spike: billboard(scene, spikeMaterial(), 10),
      comet: billboard(scene, cometMaterial(), 9),
      rock: new THREE.Mesh(rockGeometry(11 + i * 7), this.rockMat),
      puffs: Array.from({ length: PUFFS }, () => ({ m: billboard(scene, puffMaterial(), 8), p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, life: 1, size: 1, fire: 0 })),
      puffI: 0,
      lines: Array.from({ length: LINES }, () => ({ off: 0, ang: 0, back: 0, len: 0 })),
      pop: lightSprite(scene, glowTexture('fire'), true, 9),
      rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })),
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
      stars: Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, starTexture('fire'), false, 10), p: new THREE.Vector3(), at: 0 })),
      embers: Array.from({ length: EMBERS }, () => ({ sp: lightSprite(scene, glowTexture('fire'), true, 9), p: new THREE.Vector3(), ph: 0 })),
    }));
    for (const s of this.slots) { s.rock.visible = false; s.rock.renderOrder = 8; scene.add(s.rock); }
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, look: lightOf(element), landedAt: -1, drawing: -1 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    s.side.crossVectors(s.dir, UP).normalize();
    for (const sp of [s.pop, ...s.embers.map((q) => q.sp)]) sp.material.map = glowTexture(element);
    for (const q of s.stars) q.sp.material.map = starTexture(element);
    s.warn.material.uniforms.uR.value = e.radius; s.warn.material.uniforms.uK.value = 0; s.warn.material.uniforms.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.spike.visible = false; s.comet.visible = false; s.rock.visible = false; s.warn.visible = false;
    const r = this.rnd, R = s.radius;
    s.rays.forEach((ray, k) => { const a = r() * 6.283, el = k < 5 ? 0.9 + r() * 0.6 : 0.1 + r() * 0.5; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = R * (k < 5 ? 0.7 + r() * 0.5 : 0.45 + r() * 0.4); });
    s.cracks.forEach((c, k) => { const a = (k / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, j = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + j * 0.4) * len * u, 0.03, s.z + Math.sin(a + j * 0.4) * len * u); } });
    s.stars.forEach((q) => { const a = r() * 6.283, d = R * (0.2 + r() * 0.7); q.p.set(s.x + Math.cos(a) * d, 0.6 + r() * 1.6, s.z + Math.sin(a) * d); q.at = 0.05 + r() * 0.35; });
    s.embers.forEach((q) => { const a = r() * 6.283, d = R * Math.sqrt(r()) * 0.8; q.p.set(s.x + Math.cos(a) * d, 0.15, s.z + Math.sin(a) * d); q.ph = r() * 6; });
    for (let i = 0; i < 60; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) {
    for (const sp of [s.pop, ...s.stars.map((q) => q.sp), ...s.embers.map((q) => q.sp)]) sp.visible = false;
    for (const m of [s.rock, s.warn, s.spike, s.comet]) m.visible = false;
    for (const q of s.puffs) { q.age = 9; q.m.visible = false; }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    for (const s of this.slots) {
      const puffing = s.puffs.some((q) => q.age < q.life);
      if (!s.live && !puffing) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      if (puffing) this.puffs(s, dt);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end();
  }
  // fire chunks and smoke: shapes step on the drawing grid, positions drift smoothly
  puffs(s, dt) {
    const cam = this.camera.quaternion;
    for (const q of s.puffs) {
      if (q.age >= q.life) { q.m.visible = false; continue; }
      q.age += dt; q.v.multiplyScalar(Math.max(0, 1 - dt * 3)); q.p.addScaledVector(q.v, dt); q.p.y += dt * (q.fire ? 0.5 : 0.35);
      const u = Math.min(1, Math.floor(q.age * DRAWINGS) / DRAWINGS / q.life), U = q.m.material.uniforms;
      U.uCool.value = q.fire ? Math.min(1, Math.max(0, (u - 0.12) / 0.4)) : 1;
      U.uHole.value = u < 0.5 ? 0 : (u - 0.5) * 1.5;
      const grow = Math.min(1, 0.55 + u * 2.2), shrink = u > 0.8 ? 1 - (u - 0.8) * 3 : 1;
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * grow * shrink);
    }
  }
  puff(s, p, v, size, life, fire) {
    const q = s.puffs[s.puffI++ % PUFFS];
    q.p.copy(p); q.v.copy(v); q.size = size; q.life = life; q.fire = fire; q.age = 0;
    const U = q.m.material.uniforms; U.uSeed.value = this.rnd() * 50; U.uFire.value = fire; U.uCool.value = 0; U.uHole.value = 0;
  }
  warn(s, dt) {
    const k = Math.min(1, s.t / s.delay), d = drawingOf(s.t), fresh = d !== s.drawing; s.drawing = d;
    // the true area: a crisp edge, a low fill, and a fill growing to the edge on the landing frame
    const U = s.warn.material.uniforms; U.uOpen.value = Math.min(1, s.t / 0.15); U.uK.value = k;
    const fallAt = s.delay - FALL, r = this.rnd, cam = this.camera.quaternion;
    if (s.t < fallAt) {
      // a star twinkling in the sky behind the target, redrawn every drawing
      const u = Math.min(1, s.t / Math.max(0.1, fallAt));
      s.spike.visible = true; placeV(s.spike, s.apex); s.spike.quaternion.copy(cam);
      if (fresh) { s.spike.material.uniforms.uSeed.value = d + s.salt; s.spike.scale.setScalar((0.7 + 1.3 * u) * (d % 2 ? 0.85 : 1)); }
      return;
    }
    s.spike.visible = false;
    const f = Math.min(1, (s.t - fallAt) / FALL), e = f * f * 0.65 + f * 0.35;
    s.head.set(s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.9 * e, s.apex.z + (s.z - s.apex.z) * e);
    const grow = Math.min(1, 0.45 + f * 3), smear = f > 0.86 ? 1 : 0;
    // the rock, tumbling, its leading face red-hot
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(ROCK * grow); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    this.rockMat.uniforms.uDir.value.copy(s.dir);
    // the comet of flat fire bands round it, redrawn every drawing; the last drawing smears
    const R = HEAD_R * grow * (1 + 0.12 * smear), len = (1.6 + 4.2 * Math.min(1, f * 2.5)) * (1 + 0.5 * smear);
    s.comet.visible = true; this.v.copy(s.head); this.v.y += fxGround.y(s.head.x, s.head.z);
    layComet(s.comet, this.camera, this.v, s.dir, R, len, R * 2.1);
    s.comet.material.uniforms.uRock.value = ROCK * grow * 0.92;
    if (fresh) {
      s.comet.material.uniforms.uSeed.value = d * 1.37 + s.salt;
      // speed lines along the fall, new each drawing
      for (const ln of s.lines) { ln.off = (r() < 0.5 ? -1 : 1) * R * (0.9 + r() * 0.9); ln.ang = r() * 6.283; ln.back = 0.4 + r() * 1.2; ln.len = 2 + r() * 2.2; }
      // a fire chunk breaks off the tail; smoke left at the end of the tail
      const tf = 0.3 + r() * 0.35, sd = (r() < 0.5 ? -1 : 1) * R * (0.6 + r() * 0.5);
      this.p.copy(s.head).addScaledVector(s.dir, -len * tf).addScaledVector(s.side, sd);
      this.v.copy(s.dir).multiplyScalar(-2).addScaledVector(s.side, Math.sign(sd) * 1.2);
      this.puff(s, this.p, this.v, R * (0.7 + r() * 0.35), 0.45 + r() * 0.2, 1);
      this.p.copy(s.head).addScaledVector(s.dir, -len * (0.85 + r() * 0.2)).addScaledVector(s.side, (r() - 0.5) * R);
      this.v.set(0, 0, 0);
      this.puff(s, this.p, this.v, R * (1.2 + r() * 0.6), 0.8 + r() * 0.3, 0);
    }
    for (const ln of s.lines) {
      this.two[0].copy(s.head).addScaledVector(s.side, ln.off * Math.cos(ln.ang)).addScaledVector(UP, ln.off * 0.5 * Math.sin(ln.ang)).addScaledVector(s.dir, -ln.back);
      this.two[1].copy(this.two[0]).addScaledVector(s.dir, -ln.len);
      W.v = 0.07; this.core.strip(this.two, taperW, 0.95, [1, 0.96, 0.86]);
    }
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
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live || s.puffs.some((q) => q.age < q.life)); }
}
