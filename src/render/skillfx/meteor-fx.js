// Meteor in the anime style the owner picked (2026-10-26, "ทำแบบอนิเมะ"), sized for a job skill (10 s
// cooldown). The fire is built live (anime-kit AnimeFire: one mass with hooked flame tips round its rim, a
// yellow flame core, a dark red crescent, a thin dark line), its tips redrawn 12 times a second; rules in docs/VFX-REFERENCE.md.
//   Warning (the rules' delay): a crisp two-tone edge at the true radius over a low fill; a hatched
//   fill grows from the centre and reaches the edge on the landing frame. A spiky star twinkles in the
//   sky behind the target.
//   Fall (the last FALL seconds): a dark rock with molten cracks inside a fire whose top tips stream
//   back up the fall (a comet); every drawing a small fire is left behind that cools, burns out and
//   hands over to cel smoke.
//   Impact ('burst'): a fireball sits on the ground and grows from a compressed core in two drawings,
//   two smaller ones beside it a drawing later; it cools (the core goes, then the orange), burns out
//   from the middle and splits, and hands over to smoke rising behind it; glowing cracks open in the
//   ground and cool; sparks fly.
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

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, CRACKS = 9, SPARKS = 200, PARTS = 40;
const ROCK = 0.8, HEAD = 3.0;
const UP = new THREE.Vector3(0, 1, 0);

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.flames = new AnimeFire(scene, 120);
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    this.slots = Array.from({ length: SLOTS }, (_, i) => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, drawing: -1, salt: i * 101, grow: 1, tailRoll: 0,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(), side: new THREE.Vector3(),
      warn: warnDisc(scene), spike: billboard(scene, spikeMaterial(), 10),
      rock: new THREE.Mesh(rockGeometry(11 + i * 7), this.rockMat),
      parts: Array.from({ length: PARTS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, life: 9, size: 1, tall: 1, kind: 0, up: 0, seed: 0, tail: false, pop: 0, coolAt: 2, holeAt: 2, rise: 0, damp: 2 })),
      partI: 0,
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
    s.side.crossVectors(s.dir, UP).normalize();
    const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
  }
  // a fire (or smoke) particle; age below 0 waits. Spawn-time only.
  part(s, kind, p, v, size, life, o) {
    const q = s.parts[s.partI++ % PARTS];
    q.p.copy(p); q.v.copy(v); q.kind = kind; q.size = size; q.life = life; q.seed = this.rnd() * 61;
    q.age = o.age || 0; q.tall = o.tall || 1; q.up = o.up || 0; q.tail = !!o.tail; q.pop = o.pop || 0;
    q.coolAt = o.coolAt ?? 2; q.holeAt = o.holeAt ?? 2; q.rise = o.rise || 0; q.damp = o.damp ?? 2;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.spike.visible = false; s.rock.visible = false; s.warn.visible = false;
    const r = this.rnd, R = s.radius, k = R / 3.5, Z = this.v.set(0, 0, 0);
    // smoke waits behind the fire and takes over as it burns out
    for (let i = 0; i < 4; i++) { const a = r() * 6.283, d = R * 0.35 * r(); this.p.set(s.x + Math.cos(a) * d, (2.4 + r() * 0.9) * k, s.z + Math.sin(a) * d); this.part(s, FLAME.SMOKE, this.p, Z, (2.4 + r() * 0.8) * k, 1.0 + r() * 0.3, { age: -0.34 - r() * 0.1, holeAt: 0.45, rise: 1.0 }); }
    // the fireball on the ground, two smaller ones beside it a drawing later
    this.p.set(s.x, 2.7 * k, s.z); this.part(s, FLAME.FIRE, this.p, Z, 7.2 * k, 0.85, { pop: 1, up: 0.5, coolAt: 0.42, holeAt: 0.55, rise: 0.4 });
    for (let i = 0; i < 2; i++) {
      const a = r() * 6.283; this.p.set(s.x + Math.cos(a) * R * 0.5, 1.3 * k, s.z + Math.sin(a) * R * 0.5);
      this.part(s, FLAME.FIRE, this.p, Z, (3.4 + r() * 0.6) * k, 0.7, { age: -(i + 1) / DRAWINGS, pop: 1, up: 0.6, coolAt: 0.4, holeAt: 0.55, rise: 0.5 });
    }
    s.cracks.forEach((c, j) => { const a = (j / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, jj = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + jj * 0.4) * len * u, 0.03, s.z + Math.sin(a + jj * 0.4) * len * u); } });
    for (let i = 0; i < 40; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) {
    for (const m of [s.rock, s.warn, s.spike]) m.visible = false;
    for (const q of s.parts) q.age = q.life = 9;
  }
  partsLive(s) { return s.parts.some((q) => q.age < q.life); }
  update(dt) {
    this.core.begin(); this.glow.begin(); this.flames.begin();
    this.rollUp = screenAngle(this.camera, UP) - Math.PI / 2;
    for (const s of this.slots) {
      if (!s.live && !this.partsLive(s)) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      for (const q of s.parts) this.move(q, dt);
    }
    // back to front: smoke, then fire; the comet round the rock last
    for (const s of this.slots) for (const q of s.parts) if (q.kind === FLAME.SMOKE) this.draw(q, s);
    for (const s of this.slots) for (const q of s.parts) if (q.kind === FLAME.FIRE) this.draw(q, s);
    for (const s of this.slots) if (s.live && s.landedAt < 0 && s.rock.visible) this.comet(s);
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
    const d = drawingOf(q.age), u = Math.min(1, d / DRAWINGS / q.life);
    const pop = q.pop && d < 2 ? (d ? 0.75 : 0.4) : 1;              // compressed core, then full in two drawings
    const shrink = u > 0.75 ? 1 - (u - 0.75) / 0.25 * 0.5 : 1;
    const z = q.size * pop * shrink * (1 + 0.04 * (d % 2));
    this.p.copy(q.p); this.p.y += fxGround.y(q.p.x, q.p.z);
    this.flames.add(this.p, z, z * q.tall, q.tail ? s.tailRoll : this.rollUp, q.seed, d, q.up, q.kind,
      u < q.coolAt ? 0 : (u - q.coolAt) / (1 - q.coolAt), u < q.holeAt ? 0 : (u - q.holeAt) / (1 - q.holeAt));
  }
  // the fire round the falling rock: its top tips stream back up the fall
  comet(s) {
    const z = HEAD * s.grow;
    this.p.copy(s.head).addScaledVector(s.dir, -z * 0.18); this.p.y += fxGround.y(this.p.x, this.p.z);
    this.flames.add(this.p, z, z * 1.5, s.tailRoll, 7 + s.salt, drawingOf(s.t), 2.6, FLAME.FIRE);
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
    if (fresh) { // a small fire left behind each drawing: it cools, burns out and hands over to smoke
      this.p.copy(s.head).addScaledVector(s.dir, -(1.0 + r() * 0.4) * s.grow).addScaledVector(s.side, (r() - 0.5) * 0.6);
      this.part(s, FLAME.FIRE, this.p, this.v.copy(s.dir).multiplyScalar(-1), (1.6 + r() * 0.5) * s.grow, 0.42, { up: 1.2, tail: true, coolAt: 0.25, holeAt: 0.5 });
      if (d % 2) { this.p.copy(s.head).addScaledVector(s.dir, -1.8 * s.grow); this.part(s, FLAME.SMOKE, this.p, this.v.set(0, 0, 0), (1.4 + r() * 0.4) * s.grow, 0.7, { age: -0.15, holeAt: 0.45, rise: 0.5 }); }
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
