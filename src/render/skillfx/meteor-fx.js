// Meteor in the anime style the owner picked (2026-10-26, "ทำแบบอนิเมะ"), sized for a job skill (10 s
// cooldown). The fire and smoke are drawn flipbooks (assets/vfx/anime-sheets: a trial with the owner's
// reference images) stepped at 12 drawings a second; rules in docs/VFX-REFERENCE.md.
//   Warning (the rules' delay): a crisp two-tone edge at the true radius over a low fill; a hatched
//   fill grows from the centre and reaches the edge on the landing frame. A spiky star twinkles in the
//   sky behind the target, redrawn every drawing.
//   Fall (the last FALL seconds): a dark rock with molten cracks inside a drawn fireball streaming back
//   along the fall; every drawing a fire chunk is left behind that bursts, breaks up and hands over to
//   drawn smoke.
//   Impact ('burst'): a drawn fireball sits on the ground and grows from a compressed core to its peak
//   in a few drawings, two smaller ones beside it a drawing later; smoke rises from it as it breaks up;
//   glowing cracks open in the ground and cool; sparks fly. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV, place, conformPlane, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, W, lineGlowW, taperW, drawSparks, spark } from './light-kit.js';
import { drawingOf, DRAWINGS, sheetMaterial, sheetFrame, faceCamera, screenAngle, spikeMaterial, warnDisc, billboard } from './anime-kit.js';

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

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, CRACKS = 9, SPARKS = 200, FIRES = 14, SMOKES = 12;
const HEAD = 2.6, ROCK = 0.8;

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    const part = (name, order) => ({ m: billboard(scene, sheetMaterial(name), order), p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, dur: 1, first: 0, last: 0, ease: 1, size: 1, roll: 0, rise: 0 });
    this.slots = Array.from({ length: SLOTS }, (_, i) => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, drawing: -1, salt: i * 101,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(),
      warn: warnDisc(scene), spike: billboard(scene, spikeMaterial(), 10),
      ball: billboard(scene, sheetMaterial('fire'), 9),
      rock: new THREE.Mesh(rockGeometry(11 + i * 7), this.rockMat),
      fires: Array.from({ length: FIRES }, () => part('fire', 9)), fireI: 0,
      smokes: Array.from({ length: SMOKES }, () => part('smoke', 8)), smokeI: 0,
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
    }));
    for (const s of this.slots) { s.rock.visible = false; s.rock.renderOrder = 10; scene.add(s.rock); }
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3(); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, look: lightOf(element), landedAt: -1, drawing: -1 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.spike.visible = false; s.ball.visible = false; s.rock.visible = false; s.warn.visible = false;
    const r = this.rnd, R = s.radius, big = R * 1.5;
    // the fireball on the ground: a hero drawing and two smaller ones a drawing later
    this.p.set(s.x, big * 0.42, s.z); this.fire(s, this.p, this.v.set(0, 0, 0), big, 0, 0.8, 0, 4, 0.6, 0);
    for (const sg of [-1, 1]) {
      const a = r() * 6.283;
      this.p.set(s.x + Math.cos(a) * R * 0.45, big * 0.3, s.z + Math.sin(a) * R * 0.45);
      this.fire(s, this.p, this.v.set(0, 0, 0), big * (0.55 + r() * 0.15), -1 / DRAWINGS * (sg > 0 ? 1 : 2), 0.7, 0, 4, 0.6, 0);
    }
    s.cracks.forEach((c, k) => { const a = (k / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, j = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + j * 0.4) * len * u, 0.03, s.z + Math.sin(a + j * 0.4) * len * u); } });
    for (let i = 0; i < 40; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  // a drawn fire (or smoke) particle; age starts below 0 to wait
  fire(s, p, v, size, age, dur, first, last, ease, rise) { return this.part(s.fires[s.fireI++ % FIRES], p, v, size, age, dur, first, last, ease, rise); }
  smoke(s, p, v, size, age, dur, rise) { return this.part(s.smokes[s.smokeI++ % SMOKES], p, v, size, age, dur, 0, 5, 1, rise); }
  part(q, p, v, size, age, dur, first, last, ease, rise) {
    q.p.copy(p); q.v.copy(v); Object.assign(q, { size, age, dur, first, last, ease, rise, roll: (this.rnd() - 0.5) * 0.5 });
    q.m.material.uniforms.uFlip.value = this.rnd() < 0.5 ? 1 : 0;
    return q;
  }
  hide(s) {
    for (const m of [s.rock, s.warn, s.spike, s.ball]) m.visible = false;
    for (const q of [...s.fires, ...s.smokes]) { q.age = 9; q.dur = 1; q.m.visible = false; }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    for (const s of this.slots) {
      const parts = this.partsLive(s);
      if (!s.live && !parts) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      if (parts) this.parts(s, dt);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end();
  }
  partsLive(s) { return s.fires.some((q) => q.age < q.dur) || s.smokes.some((q) => q.age < q.dur); }
  // drawn particles: frames step on the drawing grid, positions drift smoothly
  parts(s, dt) { for (const q of s.fires) this.step(q, dt); for (const q of s.smokes) this.step(q, dt); }
  step(q, dt) {
    if (q.age >= q.dur) { q.m.visible = false; return; }
    q.age += dt;
    if (q.age < 0) { q.m.visible = false; return; }
    q.v.multiplyScalar(Math.max(0, 1 - dt * 2.5)); q.p.addScaledVector(q.v, dt); q.p.y += q.rise * dt;
    q.m.material.uniforms.uFrame.value = sheetFrame(q.age, q.dur, q.first, q.last, q.ease);
    q.m.visible = true; placeV(q.m, q.p); faceCamera(q.m, this.camera, q.roll); q.m.scale.setScalar(q.size);
  }
  warn(s, dt) {
    const k = Math.min(1, s.t / s.delay), d = drawingOf(s.t), fresh = d !== s.drawing; s.drawing = d;
    // the true area: a crisp edge, a low fill, and a hatched fill growing to the edge on the landing frame
    const U = s.warn.material.uniforms; U.uOpen.value = Math.min(1, s.t / 0.15); U.uK.value = k;
    const fallAt = s.delay - FALL, r = this.rnd;
    if (s.t < fallAt) {
      // a star twinkling in the sky behind the target, redrawn every drawing
      const u = Math.min(1, s.t / Math.max(0.1, fallAt));
      s.spike.visible = true; placeV(s.spike, s.apex); faceCamera(s.spike, this.camera);
      if (fresh) { s.spike.material.uniforms.uSeed.value = d + s.salt; s.spike.scale.setScalar((0.7 + 1.3 * u) * (d % 2 ? 0.85 : 1)); }
      return;
    }
    s.spike.visible = false;
    const f = Math.min(1, (s.t - fallAt) / FALL), e = f * f * 0.65 + f * 0.35;
    s.head.set(s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.9 * e, s.apex.z + (s.z - s.apex.z) * e);
    const grow = Math.min(1, 0.45 + f * 3);
    // the rock, tumbling, its leading face red-hot
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(ROCK * grow); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    this.rockMat.uniforms.uDir.value.copy(s.dir);
    // the fireball round it, its flames streaming back up the fall (the drawing's top along the tail)
    const tail = screenAngle(this.camera, this.v.copy(s.dir).negate());
    this.p.copy(s.head).addScaledVector(s.dir, -HEAD * 0.22 * grow);
    s.ball.visible = true; placeV(s.ball, this.p); faceCamera(s.ball, this.camera, tail - Math.PI / 2);
    s.ball.scale.set(HEAD * grow, HEAD * grow * 1.25, 1);
    if (fresh) {
      const B = s.ball.material.uniforms; B.uFrame.value = 1 + (d % 2); B.uFlip.value = (d >> 1) % 2;
      // a fire chunk left behind each drawing: it bursts, breaks up and hands over to smoke
      this.p.copy(s.head).addScaledVector(s.dir, -HEAD * (0.5 + r() * 0.3)); this.p.x += (r() - 0.5) * 0.5; this.p.z += (r() - 0.5) * 0.5;
      this.fire(s, this.p, this.v.copy(s.dir).multiplyScalar(-1.5), HEAD * (0.55 + r() * 0.25) * grow, 0, 0.42, 2, 4, 1, 0.4);
      if (d % 2) this.smoke(s, this.p, this.v.set(0, 0, 0), HEAD * (0.45 + r() * 0.2) * grow, -0.15, 0.6, 0.5);
    }
  }
  after(s, t) {
    const L = s.look, R = s.radius;
    if (t > 0.12 && !s.smoked) { // smoke from the fireball as it peaks, rising, then breaking up
      s.smoked = true; const r = this.rnd;
      for (let i = 0; i < 2; i++) { const a = r() * 6.283; this.p.set(s.x + Math.cos(a) * R * 0.25, R * (0.9 + i * 0.3), s.z + Math.sin(a) * R * 0.25); this.smoke(s, this.p, this.v.set(0, 0, 0), R * (0.7 + r() * 0.2), -i / DRAWINGS, 1.0, 1.2); }
    }
    // glowing cracks: open fast, glow, cool
    const ck = Math.min(1, t / 0.12), cool = Math.max(0, 1 - Math.max(0, t - 0.6) / 1.2);
    if (cool > 0) for (const c of s.cracks) { W.v = 0.07 * ck; this.glow.strip(c, lineGlowW, cool, L.glow); this.core.strip(c, taperW, cool, L.edge); }
    if (t > 2) { s.live = false; s.smoked = false; this.hide(s); }
  }
  clear() { for (const s of this.slots) { s.live = false; s.smoked = false; this.hide(s); } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live || this.partsLive(s)); }
}
