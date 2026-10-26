// Meteor in the anime style the owner picked (2026-10-26, "ทำแบบอนิเมะ"), sized for a job skill (10 s
// cooldown). The fire is built live from cel flame quads (anime-kit AnimeFire: round lobes with curling
// tongues, a yellow core in front, a dark red crescent, a thin dark line), every shape redrawn 12
// times a second; rules in docs/VFX-REFERENCE.md.
//   Warning (the rules' delay): a crisp two-tone edge at the true radius over a low fill; a hatched
//   fill grows from the centre and reaches the edge on the landing frame. A spiky star twinkles in the
//   sky behind the target.
//   Fall (the last FALL seconds): a dark rock with molten cracks inside a cluster of flames whose
//   tongues stream back up the fall; every drawing flames are left behind that cool, break and hand
//   over to cel smoke.
//   Impact ('burst'): a fireball grows on the ground from a compressed core in two drawings (big, mid
//   and small flames, a yellow core in front), flame licks fly out, it cools from the outside, breaks
//   and hands over to smoke rising behind it; glowing cracks open in the ground and cool; sparks fly.
//   Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV, place, conformPlane, fxGround, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, W, lineGlowW, taperW, drawSparks, spark } from './light-kit.js';
import { drawingOf, DRAWINGS, AnimeFire, FLAME, faceCamera, screenAngle, spikeMaterial, warnDisc, billboard } from './anime-kit.js';

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

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, CRACKS = 9, SPARKS = 200, PARTS = 72;
const ROCK = 0.8;
const UP = new THREE.Vector3(0, 1, 0);
const ORDER = [FLAME.SMOKE, FLAME.BODY, FLAME.CORE];
// flames round the falling rock: [back along the fall, sideways, size, kind]
const HEAD_SET = [[0.35, 0.35, 2.2, FLAME.BODY], [0.55, -0.4, 1.9, FLAME.BODY], [0.9, 0.1, 1.7, FLAME.BODY], [0.1, 0.0, 1.5, FLAME.CORE], [0.45, 0.05, 1.2, FLAME.CORE]];

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.flames = new AnimeFire(scene, 260);
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    this.slots = Array.from({ length: SLOTS }, (_, i) => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, drawing: -1, salt: i * 101,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(), side: new THREE.Vector3(),
      warn: warnDisc(scene), spike: billboard(scene, spikeMaterial(), 10),
      rock: new THREE.Mesh(rockGeometry(11 + i * 7), this.rockMat),
      parts: Array.from({ length: PARTS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, life: 1, size: 1, kind: 0, tip: 1, curl: 0, side: 0, seed: 0, tail: false, pop: 0, cx: 0, cz: 0, splay: 0, coolAt: 2, holeAt: 2, rise: 0, damp: 2 })),
      partI: 0,
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
    }));
    for (const s of this.slots) { s.rock.visible = false; s.rock.renderOrder = 10; scene.add(s.rock); }
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3(); this.q = new THREE.Vector3(); this.right = new THREE.Vector3(); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.clock = 0;
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
    const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
  }
  // a cel flame (or smoke) particle; age below 0 waits
  part(s, o) {
    const q = s.parts[s.partI++ % PARTS], r = this.rnd;
    q.p.copy(o.p); q.v.copy(o.v || this.q.set(0, 0, 0));
    Object.assign(q, { age: o.age || 0, life: o.life, size: o.size, kind: o.kind, tip: o.tip ?? 1.05, curl: (r() - 0.5) * 1.1, side: o.kind === FLAME.SMOKE ? 0 : Math.floor(r() * 3) - 1,
      seed: r() * 97, tail: !!o.tail, pop: o.pop || 0, cx: o.cx ?? o.p.x, cz: o.cz ?? o.p.z, splay: o.splay || 0, coolAt: o.coolAt ?? 2, holeAt: o.holeAt ?? 2, rise: o.rise || 0, damp: o.damp ?? 2 });
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.spike.visible = false; s.rock.visible = false; s.warn.visible = false;
    const r = this.rnd, R = s.radius, k = R / 3.5;
    // smoke waits behind the fire and takes over as it breaks up
    for (let i = 0; i < 6; i++) { const a = r() * 6.283, d = R * 0.3 * r(); this.p.set(s.x + Math.cos(a) * d, (2.4 + r() * 0.8) * k, s.z + Math.sin(a) * d); this.part(s, { p: this.p, v: this.v.set(Math.cos(a), 0, Math.sin(a)), age: -0.32 - r() * 0.1, life: 1.0 + r() * 0.3, size: (2.2 + r() * 0.9) * k, kind: FLAME.SMOKE, tip: 0, holeAt: 0.45, rise: 1.0 }); }
    // the body: big, mid and small flames; then the yellow core in front
    const sizes = [4.6, 4.2, 4.0, 3.1, 3.0, 2.9, 2.8, 2.7, 2.0, 1.9, 1.5, 1.4];
    sizes.forEach((z, i) => { const a = r() * 6.283, d = (i < 3 ? 0.4 : 1.3) * r() * k * 1.2; this.p.set(s.x + Math.cos(a) * d, (z * 0.48 + r() * 0.3) * k, s.z + Math.sin(a) * d); this.part(s, { p: this.p, v: this.v.set(Math.cos(a) * 1.4, 0.3, Math.sin(a) * 1.4), life: 0.8 + r() * 0.2, size: z * k, kind: FLAME.BODY, tip: 0.95 + r() * 0.3, pop: 1, coolAt: 0.68, holeAt: 0.78, rise: 0.5, cx: s.x, cz: s.z, splay: 1.6 }); });
    // round lobes round the base (no tongues): the fireball's cauliflower bottom
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + r() * 0.5, d = 1.5 * k; this.p.set(s.x + Math.cos(a) * d, 0.9 * k, s.z + Math.sin(a) * d); this.part(s, { p: this.p, v: this.v.set(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2), life: 0.85 + r() * 0.15, size: (1.9 + r() * 0.5) * k, kind: FLAME.BODY, tip: 0, pop: 1, coolAt: 0.62, holeAt: 0.76, rise: 0.4 }); }
    for (let i = 0; i < 7; i++) { const a = r() * 6.283, d = 0.8 * r() * k; this.p.set(s.x + Math.cos(a) * d, (1.8 + r() * 0.7) * k, s.z + Math.sin(a) * d); this.part(s, { p: this.p, v: this.v.set(Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.8), life: 0.5 + r() * 0.12, size: (2.2 + r() * 0.8) * k, kind: FLAME.CORE, tip: 1.0 + r() * 0.2, pop: 1, cx: s.x, cz: s.z, splay: 1.2 }); }
    // flame licks thrown out
    for (let i = 0; i < 6; i++) { const a = r() * 6.283; this.p.set(s.x + Math.cos(a) * 0.8 * k, 0.8 * k, s.z + Math.sin(a) * 0.8 * k); this.part(s, { p: this.p, v: this.v.set(Math.cos(a) * 5, 1.5 + r() * 2, Math.sin(a) * 5), age: -1 / DRAWINGS, life: 0.4, size: (0.7 + r() * 0.3) * k, kind: FLAME.BODY, tip: 1.2, coolAt: 0.5, damp: 3 }); }
    s.cracks.forEach((c, j) => { const a = (j / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, jj = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + jj * 0.4) * len * u, 0.03, s.z + Math.sin(a + jj * 0.4) * len * u); } });
    for (let i = 0; i < 40; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) {
    for (const m of [s.rock, s.warn, s.spike]) m.visible = false;
    for (const q of s.parts) q.age = q.life = 9;
  }
  partsLive(s) { return s.parts.some((q) => q.age < q.life); }
  update(dt) {
    this.clock += dt;
    this.core.begin(); this.glow.begin(); this.flames.begin();
    this.rollUp = screenAngle(this.camera, UP) - Math.PI / 2; this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    for (const s of this.slots) {
      if (!s.live && !this.partsLive(s)) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      for (const q of s.parts) this.move(q, dt);
    }
    // back to front: smoke, then the orange bodies, then the yellow cores
    for (const kind of ORDER) for (const s of this.slots) for (const q of s.parts) if (q.kind === kind) this.draw(q, s);
    for (const s of this.slots) if (s.live && s.landedAt < 0 && s.rock.visible) this.headFlames(s);
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end(); this.flames.end();
  }
  move(q, dt) {
    if (q.age >= q.life) return;
    q.age += dt; if (q.age < 0) return;
    q.v.multiplyScalar(Math.max(0, 1 - dt * q.damp)); q.p.addScaledVector(q.v, dt); q.p.y += q.rise * dt;
  }
  draw(q, s) {
    if (q.age < 0 || q.age >= q.life) return;
    const d = drawingOf(q.age), u = Math.min(1, d / DRAWINGS / q.life), h = (d * 7.31 + q.seed) % 97;
    const pop = q.pop && d < 2 ? (d ? 0.75 : 0.4) : 1;              // compressed core, then full in two drawings
    const shrink = u > 0.72 ? 1 - (u - 0.72) / 0.28 * (q.kind === FLAME.SMOKE ? 0.5 : 0.8) : 1;
    const z = q.size * pop * shrink * (0.94 + 0.12 * ((h * 13) % 1)), boil = 0.88 + 0.24 * ((h * 7.7) % 1);
    // flames off the side of a cluster lean outward (screen sideways offset from its centre)
    const lean = q.splay ? Math.max(-0.9, Math.min(0.9, -((q.p.x - q.cx) * this.right.x + (q.p.z - q.cz) * this.right.z) / q.size * q.splay)) : 0;
    const roll = (q.tail ? s.tailRoll : this.rollUp) + lean + (((h * 3.3) % 1) - 0.5) * 0.3;
    this.p.copy(q.p); this.p.y += fxGround.y(q.p.x, q.p.z);
    this.flames.add(this.p, z, z * (q.tip ? 1.25 : 1), roll, h, q.tip * boil, q.curl * boil, q.side, q.kind,
      u >= q.coolAt ? 1 : 0, u >= q.holeAt ? (u - q.holeAt) / (1 - q.holeAt) * 0.85 : 0);
  }
  // the flames wrapped round the falling rock, tongues streaming back up the fall
  headFlames(s) {
    const d = drawingOf(s.t), grow = s.grow, B = this.p;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < HEAD_SET.length; i++) {
      const [back, off, z, k] = HEAD_SET[i];
      if (k !== (pass ? FLAME.CORE : FLAME.BODY)) continue;
      const h = (d * 5.17 + i * 11 + s.salt) % 97;
      B.copy(s.head).addScaledVector(s.dir, -back * grow).addScaledVector(s.side, off * grow); B.y += fxGround.y(B.x, B.z);
      const zz = z * grow * (0.92 + 0.16 * ((h * 13) % 1));
      this.flames.add(B, zz, zz * 1.3, s.tailRoll + (((h * 3.3) % 1) - 0.5) * 0.25, h, 1.15 + 0.15 * ((h * 7.7) % 1), (((h * 5.1) % 1) - 0.5) * 1.2, (i % 3) - 1, k);
    }
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
    s.tailRoll = screenAngle(this.camera, this.v.copy(s.dir).negate()) - Math.PI / 2;
    // the rock, tumbling, its leading face red-hot
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(ROCK * s.grow); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    this.rockMat.uniforms.uDir.value.copy(s.dir);
    if (fresh) { // flames left behind each drawing: they cool, break and hand over to smoke
      for (let i = 0; i < 2; i++) {
        this.p.copy(s.head).addScaledVector(s.dir, -(0.6 + r() * 0.5) * s.grow).addScaledVector(s.side, (r() - 0.5) * 0.9);
        this.part(s, { p: this.p, v: this.v.copy(s.dir).multiplyScalar(-1.2), life: 0.4 + r() * 0.1, size: (1.3 + r() * 0.5) * s.grow, kind: FLAME.BODY, tip: 1.1, tail: true, coolAt: 0.4, holeAt: 0.62 });
      }
      if (d % 2) { this.p.copy(s.head).addScaledVector(s.dir, -1.6 * s.grow); this.part(s, { p: this.p, age: -0.12, life: 0.7, size: (1.4 + r() * 0.4) * s.grow, kind: FLAME.SMOKE, tip: 0, holeAt: 0.45, rise: 0.5 }); }
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
