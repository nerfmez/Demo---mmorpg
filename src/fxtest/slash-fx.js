// Slash (new look): a crescent smear sweeping across the real range and arc with a fast leading
// edge and a tapered tail that tears apart, a contact cut shorter than the smear on each struck
// target, directional sparks and a little dust. The third combo step is a wider double smear.
// Timing: the smear starts on castStart so its leading edge crosses the arc at contact time.
// Direction follows the actual weapon tip. A fused payload tints the outer rim.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, flashMaterial, tintFlash } from './fx-common.js';

const SWEEP = 0.085, LIFE = 0.4, LEAD = 0.065, CUTS = 6, FLASHES = 8, PUFFS = 12;
const STEEL = { core: '#ffffff', body: '#cfe3f2', edge: '#7e9fbf', spark: [1.0, 0.92, 0.7] };
const FUSE = { fire: '#ff7a2a', arcane: '#b98cff', lightning: '#7fd8ff', cold: '#9fe0ff' };

const smearFS = `varying vec2 vUv; uniform float uHead; uniform float uFade; uniform float uDir; uniform float uSeed;
  uniform vec3 uCore; uniform vec3 uBody; uniform vec3 uEdge; uniform vec3 uRim; uniform float uRimK; ${NOISE}
  void main(){
    float s = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;   // 0 where the swing starts, 1 where it ends
    float behind = uHead - s;
    if (behind < 0.0) discard;
    float tail = 0.8;
    float k = behind / tail;
    if (k > 1.0) discard;
    // band hugs the outer edge (the blade tip path); thick at the leading edge, thin in the tail,
    // pointed at both ends of the arc
    float ends = pow(sin(3.14159 * clamp(s, 0.0, 1.0)), 0.55);
    float width = mix(0.95, 0.12, pow(k, 0.8)) * ends;
    float inner = 1.0 - width;
    float v = vUv.y;
    float n = fbm(vec2(s * 9.0 + uSeed, v * 2.5));
    float torn = inner + (n - 0.5) * 0.22 * (0.4 + k);   // ragged inner edge
    if (v < torn) discard;
    // break-up: the tail and then the whole smear erode into strands
    float strands = fbm(vec2(s * 3.0 - uSeed, v * 26.0));
    if (strands < k * 0.55 + uFade * 0.9 - 0.15) discard;
    float b = (v - torn) / max(1.0 - torn, 1e-3);           // 0 inner edge .. 1 outer edge
    vec3 c = uEdge;
    c = mix(c, uBody, step(0.28, b));
    c = mix(c, uCore, step(0.68, b) * (1.0 - step(0.94, b)) * step(k, 0.85));
    c = mix(c, uRim, step(0.94, b) * uRimK);
    // speed streaks inside the body
    float st = fbm(vec2(s * 2.0 - uHead * 5.0, v * 40.0));
    c = mix(c, uCore, smoothstep(0.7, 0.74, st) * step(0.3, b) * (1.0 - k));
    float a = mix(0.55, 1.0, step(0.28, b)) * (1.0 - smoothstep(0.75, 1.0, k));
    gl_FragColor = vec4(c, a); }`;
// contact cut: a thin streak with ragged pointed ends, grows from its centre then thins away
const cutFS = `varying vec2 vUv; uniform float uT; uniform float uSeed; uniform vec3 uCore; uniform vec3 uEdge; ${NOISE}
  void main(){
    float len = min(1.0, uT / 0.25);
    float x = vUv.x / max(len, 0.05);
    if (abs(x) > 1.0) discard;
    float w = 0.16 * (1.0 - x * x) * (1.0 - uT * 0.85);
    w *= 0.75 + 0.5 * vn(vec2(vUv.x * 14.0 + uSeed, uSeed));
    if (abs(vUv.y) > w) discard;
    vec3 c = abs(vUv.y) < w * 0.45 ? uCore : uEdge;
    gl_FragColor = vec4(c, 1.0); }`;
const puffFS = `varying vec2 vUv; uniform float uT; uniform float uSeed; ${NOISE}
  void main(){ float r = length(vUv);
    float n = fbm(vUv * 1.7 + uSeed + vec2(uT, -uT * 0.6));
    float body = n * 1.2 - r * 0.95 - uT * 0.7;
    if (body < 0.05) discard;
    vec3 c = body > 0.28 ? vec3(0.86, 0.8, 0.68) : vec3(0.66, 0.58, 0.46);
    gl_FragColor = vec4(c, body > 0.28 ? 0.7 : 0.45); }`;

function arcGeometry(arcRad, r0, r1, segs = 64) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = -arcRad / 2 + u * arcRad;
    for (let j = 0; j < 2; j++) {
      const r = j ? r1 : r0;
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, j);
    }
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BILL = `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export class SlashFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.geoCache = new Map();
    this.cuts = Array.from({ length: CUTS }, () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uHead: { value: 0 }, uFade: { value: 0 }, uDir: { value: 1 }, uSeed: { value: 0 }, uCore: { value: new THREE.Color(STEEL.core) }, uBody: { value: new THREE.Color(STEEL.body) }, uEdge: { value: new THREE.Color(STEEL.edge) }, uRim: { value: new THREE.Color('#ff7a2a') }, uRimK: { value: 0 } },
        vertexShader: VS, fragmentShader: smearFS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(this.quad, mat); m.visible = false; m.renderOrder = 5; m.frustumCulled = false;
      const g = new THREE.Group(); g.add(m); scene.add(g);
      return { g, m, mat, live: false };
    });
    this.contacts = Array.from({ length: FLASHES }, (_, k) => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 3.1 }, uCore: { value: new THREE.Color('#ffffff') }, uEdge: { value: new THREE.Color('#a9cbe8') } },
        vertexShader: BILL, fragmentShader: cutFS, transparent: true, depthWrite: false, depthTest: false });
      const m = new THREE.Mesh(this.quad, mat); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m);
      const fl = new THREE.Mesh(this.quad, flashMaterial(9 + k * 2.3)); fl.visible = false; fl.renderOrder = 6; fl.frustumCulled = false; scene.add(fl);
      tintFlash(fl.material, 'physical');
      return { m, fl, t: 9, pos: new THREE.Vector3(), roll: 0, size: 1 };
    });
    this.puffs = Array.from({ length: PUFFS }, (_, k) => {
      const m = new THREE.Mesh(this.quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 5.7 } }, vertexShader: BILL, fragmentShader: puffFS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
      return { m, t: 9, life: 0.5, size: 0.6, vx: 0, vz: 0 };
    });
    this.sparks = new Ribbon(scene, camera, 1500, `varying vec2 vUv; varying float vA; varying vec3 vT;
      void main(){ float d=abs(vUv.y); if(d>0.9) discard; gl_FragColor=vec4(d<0.45 ? vec3(1.0) : vT, vA); }`, THREE.NormalBlending);
    this.sparkList = []; this.pending = []; this.rnd = mulberry32(21); this.t = 0;
    this.tipAngle = null; this.tipVel = 0; this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.rimElement = null;
  }
  geometry(arcDeg, range) {
    const key = `${arcDeg}|${range.toFixed(2)}`;
    if (!this.geoCache.has(key)) this.geoCache.set(key, arcGeometry((arcDeg * Math.PI) / 180, range * 0.32, range));
    return this.geoCache.get(key);
  }
  // castStart of a melee_arc skill. s: the resolved skill (range, arc), fusedElement: linked payload's element
  begin(e, s, fusedElement = null) {
    const finisher = e.step === 2;
    const startIn = Math.max(0, e.total - LEAD);
    this.pending.push({ at: this.t + startIn, x: e.x, z: e.z, angle: e.angle, step: e.step, range: s.range, arc: s.arc, finisher, fusedElement });
  }
  launch(p, dir, delay = 0, scale = 1, height = 1.05) {
    const c = this.cuts.find((k) => !k.live) || this.cuts[0];
    const arc = p.finisher ? Math.min(170, p.arc + 30) : p.arc;
    c.m.geometry = this.geometry(arc, p.range * scale);
    c.live = true; c.t = -delay; c.dir = dir; this.lastDir = dir;
    c.g.position.set(p.x, height, p.z);
    c.g.rotation.set(0, p.angle, 0);
    // a slight diagonal: the leading side rises, as a swing does
    c.m.rotation.set(0, 0, 0); c.m.rotateZ(p.finisher ? 0 : dir * 0.16); c.m.rotateX(p.finisher ? -0.04 : -0.1);
    c.mat.uniforms.uDir.value = dir; c.mat.uniforms.uSeed.value = this.rnd() * 40;
    c.mat.uniforms.uRimK.value = p.fusedElement ? 1 : 0;
    if (p.fusedElement) c.mat.uniforms.uRim.value.set(FUSE[p.fusedElement] || '#ff7a2a');
    c.m.visible = false;
  }
  // a struck target. dir: swing direction; finisher adds dust and a bigger pop
  contact(x, z, dir, finisher) {
    const k = this.contacts.find((c) => c.t > 0.3) || this.contacts[0];
    k.t = 0; k.pos.set(x, 1.15, z); k.roll = dir * (0.55 + this.rnd() * 0.25) + (this.rnd() - 0.5) * 0.3; k.size = finisher ? 1.9 : 1.4;
    k.m.material.uniforms.uSeed.value = this.rnd() * 30;
    for (let i = 0; i < (finisher ? 12 : 7); i++) {
      const a = this.rnd() * Math.PI * 2, sp = 3 + this.rnd() * 4;
      this.sparkList.push({ p: k.pos.clone(), v: new THREE.Vector3(Math.cos(a) * sp, 1 + this.rnd() * 3, Math.sin(a) * sp), age: 0, life: 0.18 + this.rnd() * 0.16, w: 0.02 + this.rnd() * 0.015 });
    }
    for (let i = 0; i < (finisher ? 4 : 2); i++) this.puff(x + (this.rnd() - 0.5) * 0.6, z + (this.rnd() - 0.5) * 0.6, finisher ? 0.9 : 0.55);
  }
  puff(x, z, size) {
    const p = this.puffs.find((q) => q.t >= q.life) || this.puffs[0];
    p.t = 0; p.life = 0.45 + this.rnd() * 0.2; p.size = size; p.m.position.set(x, 0.25, z); p.vx = (this.rnd() - 0.5) * 0.8; p.vz = (this.rnd() - 0.5) * 0.8;
    p.m.material.uniforms.uSeed.value = this.rnd() * 40;
  }
  // tip: weapon tip (world); px/pz: the caster. Tracks the tip's swing direction for the smear.
  update(dt, tip, px, pz) {
    this.t += dt;
    const ang = Math.atan2(tip.x - px, tip.z - pz);
    if (this.tipAngle !== null && dt > 0) { let d = ang - this.tipAngle; d = Math.atan2(Math.sin(d), Math.cos(d)); this.tipVel = this.tipVel * 0.5 + (d / dt) * 0.5; }
    this.tipAngle = ang;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (this.t < p.at) continue;
      this.pending.splice(i, 1);
      // the swing's own direction (tip angular velocity); the combo step decides when it is unclear
      const dir = Math.abs(this.tipVel) > 2 ? Math.sign(this.tipVel) : p.step === 1 ? -1 : 1;
      this.launch(p, dir);
      if (p.finisher) this.launch(p, dir, 0.035, 0.82, 0.9);
    }
    for (const c of this.cuts) {
      if (!c.live) continue;
      c.t += dt;
      if (c.t < 0) { c.m.visible = false; continue; }
      const head = Math.min(1, c.t / SWEEP) + Math.max(0, c.t - SWEEP) / SWEEP * 0.22;
      c.mat.uniforms.uHead.value = head;
      c.mat.uniforms.uFade.value = Math.max(0, (c.t - SWEEP) / (LIFE - SWEEP));
      c.m.visible = true;
      if (c.t > LIFE) { c.live = false; c.m.visible = false; }
    }
    for (const k of this.contacts) {
      if (k.t > 0.3) { k.m.visible = k.fl.visible = false; continue; }
      k.t += dt;
      const u = k.t / 0.22;
      k.m.visible = u < 1; k.m.position.copy(k.pos); k.m.quaternion.copy(this.camera.quaternion); k.m.rotateZ(k.roll);
      k.m.scale.set(k.size * 1.6, k.size * 1.6, 1); k.m.material.uniforms.uT.value = Math.min(1, u);
      k.fl.visible = k.t < 0.1; k.fl.position.copy(k.pos); k.fl.quaternion.copy(this.camera.quaternion);
      k.fl.scale.setScalar(0.55 * k.size * (k.t < 0.03 ? 0.6 + k.t / 0.075 : 1)); k.fl.material.uniforms.uT.value = k.t / 0.1;
    }
    for (const p of this.puffs) {
      if (p.t >= p.life) { p.m.visible = false; continue; }
      p.t += dt; const u = p.t / p.life;
      p.m.visible = true; p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y = 0.25 + u * 0.3;
      p.m.quaternion.copy(this.camera.quaternion); p.m.scale.setScalar(p.size * (0.6 + 0.8 * u)); p.m.material.uniforms.uT.value = u;
    }
    for (const s of this.sparkList) { s.age += dt; s.v.y -= 9 * dt; s.v.multiplyScalar(1 - 4 * dt); s.p.addScaledVector(s.v, dt); }
    this.sparkList = this.sparkList.filter((s) => s.age < s.life);
    this.sparks.begin();
    for (const s of this.sparkList) {
      const u = s.age / s.life;
      this._a.copy(s.p).addScaledVector(s.v, -0.035);
      this.sparks.strip([this._a.clone(), s.p.clone().lerp(this._a, 0.5), s.p.clone()], (x) => s.w * x, 1 - u * u, STEEL.spark);
    }
    this.sparks.end();
  }
  clear() { this.pending = []; this.sparkList = []; for (const c of this.cuts) { c.live = false; c.m.visible = false; } for (const k of this.contacts) k.t = 9; for (const p of this.puffs) p.t = p.life; }
}
