// Meteor in anime 3D (owner, 2026-10-26: "อนิเมะแบบ 3D"), sized for a job skill (10 s cooldown): real
// shapes with volume, toon-shaded (skillfx/cel3d.js), shapes re-drawn 12 times a second; rules in
// docs/VFX-REFERENCE.md.
//   Warning (the rules' delay): a crisp two-tone edge at the true radius over a low fill; a hatched
//   fill grows from the centre and reaches the edge on the landing frame. A spiky star twinkles in the
//   sky behind the target.
//   Fall (the last FALL seconds): a dark rock with molten cracks inside a solid comet of fire whose
//   tongues twist back up the fall and break up at the tail; every drawing a fire puff is left behind
//   that cools, dissolves and hands over to smoke.
//   Impact ('burst'): a lumpy fireball of solid puffs grows on the ground from a compressed core in two
//   drawings while flame tongues burst out and up; it cools (the yellow goes, then the orange) and
//   dissolves with burning edges into smoke puffs rising behind it; glowing cracks open in the ground
//   and cool; sparks fly. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV, place, conformPlane, fxGround, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, W, lineGlowW, taperW, drawSparks, spark } from './light-kit.js';
import { drawingOf, DRAWINGS, faceCamera, spikeMaterial, warnDisc, billboard } from './anime-kit.js';
import { celMaterial, puffGeometry, cometGeometry, tongueGeometry, alongY } from './cel3d.js';

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

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, CRACKS = 9, SPARKS = 200, PUFFS = 18, TONGUES = 10, COMET_LEN = 4;
const ROCK = 0.85, HEAD = 0.95;
const UP = new THREE.Vector3(0, 1, 0);

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(61); this.sparks = []; this.free = []; this.clock = 0;
    // drawn over the fire (it leads the fire, which wraps round behind it)
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS, depthTest: false });
    const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
    const part = (m, kind) => ({ m, kind, p: new THREE.Vector3(), v: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), age: 9, life: 9, size: 1, len: 1, pop: 0, coolAt: 2, erodeAt: 2, rise: 0, damp: 2, smoke: false, trail: false });
    this.slots = Array.from({ length: SLOTS }, (_, i) => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, drawing: -1, salt: i * 101, grow: 1,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), back: new THREE.Vector3(), head: new THREE.Vector3(), side: new THREE.Vector3(),
      warn: warnDisc(scene), spike: billboard(scene, spikeMaterial(), 10),
      rock: mesh(rockGeometry(11 + i * 7), this.rockMat),
      comet: mesh(cometGeometry(COMET_LEN), celMaterial({ len: COMET_LEN, lobes: 5, lobeAmp: 0.9, twist: 1.6, lobeFrom: 0.05, disp: 0.3, freq: 1.2, scroll: 3, tailErode: 0.45, seed: i * 7 })),
      puffs: Array.from({ length: PUFFS }, (_, j) => part(mesh(puffGeometry(), celMaterial({ disp: 0.42, freq: 1.2, scroll: 1.6, lobes: 5, lobeAmp: 0.45, twist: 1.5, lobeFrom: 0.35, seed: j * 3.7 + i })), 'puff')), puffI: 0,
      tongues: Array.from({ length: TONGUES }, (_, j) => part(mesh(tongueGeometry(), celMaterial({ disp: 0.06, freq: 3, scroll: 2, seed: j * 5.1 + i, hot: 1.1 })), 'tongue')), tongueI: 0,
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
    }));
    for (const s of this.slots) s.rock.renderOrder = 12;
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3(); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, look: lightOf(element), landedAt: -1, drawing: -1 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize(); s.back.copy(s.dir).negate();
    s.side.crossVectors(s.dir, UP).normalize();
    const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
  }
  // a puff or tongue from the slot's pools (spawn-time only); age below 0 waits
  spawn(pool, idx, p, v, size, life, o) {
    const q = pool[idx % pool.length];
    q.p.copy(p); q.v.copy(v); q.size = size; q.life = life; q.age = o.age || 0; q.len = o.len || 1; q.pop = o.pop || 0;
    q.coolAt = o.coolAt ?? 2; q.erodeAt = o.erodeAt ?? 2; q.rise = o.rise || 0; q.damp = o.damp ?? 2; q.smoke = !!o.smoke; q.trail = !!o.trail;
    if (o.dir) q.dir.copy(o.dir); else q.dir.set(0, 1, 0);
    const U = q.m.material.uniforms; U.uSmoke.value = q.smoke ? 1 : 0; U.uCurl.value = o.curl || 0; U.uCool.value = 0; U.uErode.value = 0; U.uHot.value = o.hot ?? 1;
  }
  puff(s, p, v, size, life, o) { this.spawn(s.puffs, s.puffI++, p, v, size, life, o); }
  tongue(s, p, dir, size, len, life, o) { o.dir = dir; o.len = len; this.spawn(s.tongues, s.tongueI++, p, this.v.set(0, 0, 0), size, life, o); }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.spike.visible = false; s.rock.visible = false; s.warn.visible = false; s.comet.visible = false;
    const r = this.rnd, R = s.radius, k = R / 3.5, Z = this.p;
    for (const q of s.puffs) if (q.trail && !q.smoke) q.age = q.life;   // the fireball swallows the last trail flames
    // the fireball: a big puff and lumps round it, sitting on the ground
    this.puff(s, Z.set(s.x, 1.3 * k, s.z), this.v.set(0, 0.6, 0), 1.6 * k, 0.9, { pop: 1, coolAt: 0.35, erodeAt: 0.5, rise: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + r() * 0.6, d = (0.9 + r() * 0.4) * k, y = (0.6 + r() * 1.4) * k;
      this.puff(s, Z.set(s.x + Math.cos(a) * d, y, s.z + Math.sin(a) * d), this.v.set(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2), (0.8 + r() * 0.45) * k, 0.75 + r() * 0.15, { pop: 1, coolAt: 0.3, erodeAt: 0.45, rise: 0.4, age: -(i % 2) / DRAWINGS, hot: 0.8 });
    }
    // flame tongues bursting out and up, sideways to the camera (one pointing at it reads as a ball)
    const ca = Math.atan2(this.camera.position.z - s.z, this.camera.position.x - s.x);
    for (let i = 0; i < 9; i++) {
      const a = ca + Math.PI / 2 + (i % 2 ? Math.PI : 0) + (r() - 0.5) * 1.5, out = 0.55 + r() * 0.5;
      this.v.set(Math.cos(a) * out, 1, Math.sin(a) * out).normalize();
      const dir = this.three[0].copy(this.v);
      this.tongue(s, Z.set(s.x + Math.cos(a) * 1.0 * k, 1.3 * k, s.z + Math.sin(a) * 1.0 * k), dir, (1.6 + r() * 0.6) * k, (2.4 + r() * 1.2) * k, 0.55 + r() * 0.15, { pop: 1, coolAt: 0.35, erodeAt: 0.4, curl: (r() - 0.5) * 0.5, hot: 0.9 });
    }
    // smoke behind, taking over as the fire dissolves
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.283, d = r() * 1.2 * k;
      this.puff(s, Z.set(s.x + Math.cos(a) * d, (1.8 + r() * 1.0) * k, s.z + Math.sin(a) * d), this.v.set(Math.cos(a) * 0.6, 0.5, Math.sin(a) * 0.6), (0.75 + r() * 0.3) * k, 1.0 + r() * 0.3, { smoke: true, age: -0.3 - r() * 0.12, erodeAt: 0.5, rise: 0.9, pop: 1 });
    }
    s.cracks.forEach((c, j) => { const a = (j / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, jj = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + jj * 0.4) * len * u, 0.03, s.z + Math.sin(a + jj * 0.4) * len * u); } });
    for (let i = 0; i < 40; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) {
    for (const m of [s.rock, s.warn, s.spike, s.comet]) m.visible = false;
    for (const q of s.puffs) { q.age = q.life = 9; q.m.visible = false; }
    for (const q of s.tongues) { q.age = q.life = 9; q.m.visible = false; }
  }
  partsLive(s) { return s.puffs.some((q) => q.age < q.life) || s.tongues.some((q) => q.age < q.life); }
  update(dt) {
    this.clock += dt; this.T = drawingOf(this.clock) / DRAWINGS;
    this.core.begin(); this.glow.begin();
    for (const s of this.slots) {
      if (!s.live && !this.partsLive(s)) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      for (const q of s.puffs) this.step(q, dt);
      for (const q of s.tongues) this.step(q, dt);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end();
  }
  step(q, dt) {
    if (q.age >= q.life) { q.m.visible = false; return; }
    q.age += dt;
    if (q.age < 0 || q.age >= q.life) { q.m.visible = false; return; }
    q.v.multiplyScalar(Math.max(0, 1 - dt * q.damp)); q.p.addScaledVector(q.v, dt); q.p.y += q.rise * dt;
    const d = drawingOf(q.age), u = Math.min(1, d / DRAWINGS / q.life);
    const pop = q.pop && d < 2 ? (d ? 0.75 : 0.4) : 1;              // compressed core, then full in two drawings
    const U = q.m.material.uniforms;
    U.uT.value = this.T;
    U.uCool.value = u < q.coolAt ? 0 : Math.min(1, (u - q.coolAt) / (1 - q.coolAt) * 1.3);
    U.uErode.value = u < q.erodeAt ? 0 : (u - q.erodeAt) / (1 - q.erodeAt) * 0.8;
    q.m.visible = true; placeV(q.m, q.p);
    if (q.kind === 'tongue') { alongY(q.m, q.dir); q.m.scale.set(q.size * pop, q.len * pop * (1 + 0.15 * (u < 0.5 ? u : 0.5)), q.size * pop); }
    else q.m.scale.setScalar(q.size * pop * (1 + (q.smoke ? 0.35 * u : 0.15 * u)));
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
    s.grow = Math.min(1, 0.45 + f * 3);
    // the rock, tumbling, its leading face red-hot, inside a solid comet of fire
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(ROCK * s.grow); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    this.rockMat.uniforms.uDir.value.copy(s.dir);
    this.p.copy(s.head).addScaledVector(s.back, 0.55 * s.grow);   // behind the rock, so the rock leads
    s.comet.visible = true; placeV(s.comet, this.p); alongY(s.comet, s.back);
    s.comet.scale.set(HEAD * s.grow, HEAD * s.grow * (0.6 + 0.4 * Math.min(1, f * 2.5)), HEAD * s.grow);
    s.comet.material.uniforms.uT.value = this.T;
    if (fresh) { // a fire puff left behind each drawing: it cools, dissolves and hands over to smoke
      this.p.copy(s.head).addScaledVector(s.back, (1.6 + r() * 1.4) * s.grow).addScaledVector(s.side, (r() - 0.5) * 0.7);
      this.puff(s, this.p, this.v.copy(s.dir).multiplyScalar(-0.8), (0.45 + r() * 0.25) * s.grow, 0.45, { coolAt: 0.15, erodeAt: 0.4, trail: true });
      if (d % 2) { this.p.copy(s.head).addScaledVector(s.back, 3.6 * s.grow); this.puff(s, this.p, this.v.set(0, 0.3, 0), (0.38 + r() * 0.15) * s.grow, 0.7, { smoke: true, age: -0.1, erodeAt: 0.45, rise: 0.5 }); }
    }
  }
  after(s, t) {
    const L = s.look;
    // glowing cracks: open fast, glow, cool
    const ck = Math.min(1, t / 0.12), cool = Math.max(0, 1 - Math.max(0, t - 0.6) / 1.2);
    if (cool > 0) for (const c of s.cracks) { W.v = 0.07 * ck; this.glow.strip(c, lineGlowW, cool, L.glow); this.core.strip(c, taperW, cool, L.edge); }
    if (t > 2) s.live = false;
  }
  clear() { for (const s of this.slots) { s.live = false; this.hide(s); } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live || this.partsLive(s)); }
}
