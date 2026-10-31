// Flame Arrow Rain (the spell archer's fire skill, 2026-10-31). Its own look, kept apart from the
// mage's fire (Meteor's rock and crater, Firebolt's ball) and from Arrow Rain's rain of light: every
// piece is an arrow. A burning arrow climbs from the bow and bursts in a bloom of fire above the
// circle; each of the rules' waves then brings down a few heavy fire arrows - a dark shaft with a hot
// head, wrapped in a comet of Firebolt's fire (meteor-flame.js, V5_FIELD) streaming back up its path -
// that pin into the ground at a slant and keep burning there as small tongues of flame over a scorch,
// then burn away. A thin ember circle marks the area and pulses with each wave. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, place, placeV, conformPlane, fxGround } from './fx-common.js';
import { flameMaterial, cometShell } from './meteor-flame.js';

const PER_WAVE = 7, FALL = 0.32, EARLY = 0.24, LATE = 0.12;
const RISE = 0.24, APEX = 8.0;
const BURN = 1.25, BURN_OUT = 0.45;          // a pinned arrow burns this long, then burns away
const FLAMES = 32, SCORCH = 24, FLASHES = 6, RINGS = 3;
const SHAFT = 0.95;                           // shaft length (the part above ground once pinned: 0.55)
const SHAFT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard; vec3 c = vT*(1.0 - 0.35*d*d); gl_FragColor=vec4(c, vA); }`;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.97,0.82), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const RING_FS = `varying vec2 vP; uniform float uOpen; uniform float uPulse; uniform float uFade;
  void main(){
    float r = length(vP), edge = uOpen;
    if (r > edge || uOpen < 0.01) discard;
    float e = edge - r, a = 0.06 + uPulse*0.12;
    if (e < 0.035) a = 0.75 + 0.25*uPulse;
    vec3 c = mix(vec3(1.0,0.42,0.1), vec3(1.0,0.85,0.45), 0.5*uPulse + (e < 0.035 ? 0.3 : 0.0));
    gl_FragColor = vec4(c, a*uFade); }`;
// a scorch under each pinned arrow: a soft dark burn with a ragged ember edge that cools
const SCORCH_VS = `attribute vec2 aLife; varying vec2 vP; varying vec2 vLife;
  void main(){ vP = uv*2.0-1.0; vLife = aLife; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`;
const SCORCH_FS = `varying vec2 vP; varying vec2 vLife;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  void main(){
    float age = vLife.x, seed = vLife.y; if (age < 0.0 || age > 1.0) discard;
    float a = atan(vP.y, vP.x), r = length(vP);
    float rag = 0.88 + 0.06*sin(a*5.0 + seed*6.0) + 0.04*sin(a*9.0 + seed*13.0);
    if (r > rag) discard;
    float fade = 1.0 - smoothstep(0.6, 1.0, age);
    float edge = smoothstep(rag - 0.22, rag, r);
    float glow = edge*(1.0 - smoothstep(0.0, 0.55, age));
    vec3 c = mix(vec3(0.16,0.09,0.05), vec3(1.0,0.45,0.12), glow);
    gl_FragColor = vec4(c, (0.55 - 0.45*r*r)*fade + glow*0.5); }`;

const UPV = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0);
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let sw = 0;
const shaftW = () => sw, glowW = (x) => sw * (0.8 + 2.6 * x * x), coreW = (x) => sw * (0.3 + 0.7 * x * x * x), tipW = (x) => sw * Math.sin(Math.PI * x);

export class FlameRainFx {
  /** fire: the director's FireExtras (embers and a fire pop on landing and at the bloom) */
  constructor(scene, camera, fire) {
    this.camera = camera; this.fire = fire;
    this.shaft = new Ribbon(scene, camera, 1200, SHAFT_FS, THREE.NormalBlending);
    this.core = new Ribbon(scene, camera, 1600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.shaft.mesh.renderOrder = 5; this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const comet = cometShell(0, 1, 4);
    this.flames = Array.from({ length: FLAMES }, (_, k) => {
      const mat = flameMaterial(0, 0); mat.uniforms.uSeed.value = k * 1.37;
      const m = new THREE.Mesh(comet, mat); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m);
      return { m, mat, busy: false };
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => {
      const m = new THREE.Mesh(quad, flashMaterial(5 + k * 3.1)); tintFlash(m.material, 'fire');
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m);
      return { m, t: 9, size: 1 };
    });
    this.flashI = 0;
    this.rings = Array.from({ length: RINGS }, () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uOpen: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 } },
        vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: RING_FS, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m);
      return { m, mat, live: false, x: 0, z: 0, t: 0, end: 0, pulse: 0, from: new THREE.Vector3(), apex: new THREE.Vector3(), flame: null, bloomed: false };
    });
    // scorches: one instanced quad, its age and seed per instance
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.life = new Float32Array(SCORCH * 2).fill(-1);
    sg.setAttribute('aLife', new THREE.InstancedBufferAttribute(this.life, 2));
    this.scorch = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({ vertexShader: SCORCH_VS, fragmentShader: SCORCH_FS, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2 }), SCORCH);
    this.scorch.frustumCulled = false; this.scorch.renderOrder = 1; this.scorch.visible = false; scene.add(this.scorch);
    this.scorches = Array.from({ length: SCORCH }, () => ({ t: 9, x: 0, z: 0, s: 1, seed: 0 })); this.scorchI = 0;
    this.arrows = []; this.rnd = mulberry32(57); this.t = 0;
    this.alive = (a) => !a.done || (a.flame && this.release(a), false);
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.p = new THREE.Vector3(); this.side = new THREE.Vector3(); this.tail = new THREE.Vector3(); this.mtx = new THREE.Matrix4();
  }
  // fire-red fletching: two short vanes splayed back from the shaft's end (tail: the end, dir: the flight)
  fletch(tail, dir, alpha) {
    const two = this.two, s = this.side.set(-dir.z, 0, dir.x);
    if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize();
    for (const sg of [1, -1]) {
      two[0].copy(tail).addScaledVector(dir, 0.22); two[1].copy(tail).addScaledVector(dir, -0.04).addScaledVector(s, 0.09 * sg).addScaledVector(UPV, 0.05);
      sw = 0.05; this.shaft.strip(two, shaftW, alpha, [0.85, 0.22, 0.1]);
    }
  }
  take() { const f = this.flames.find((x) => !x.busy); if (f) { f.busy = true; f.m.visible = true; } return f || null; }
  release(a) { a.flame.busy = false; a.flame.m.visible = false; a.flame = null; }
  flash(v, size) { const f = this.flashes[this.flashI++ % FLASHES]; f.t = 0; f.size = size; placeV(f.m, v); }
  // the rules' 'area' of one wave; bow: the hero (the first wave of a volley looses the up-shot)
  wave(e, bow) {
    const r = this.rnd;
    let ring = this.rings.find((g) => g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05);
    if (!ring) {
      ring = this.rings.find((g) => !g.live) || this.rings[0];
      Object.assign(ring, { live: true, x: e.x, z: e.z, t: 0, end: 0, pulse: 0, bloomed: false });
      ring.m.visible = true; place(ring.m, e.x, 0.03, e.z); ring.m.scale.setScalar(e.radius * 2); conformPlane(ring.m);
      const ax = e.x - bow.x, az = e.z - bow.z, len = Math.hypot(ax, az) || 1;
      ring.from.set(bow.x + ax / len * 0.4, 1.5, bow.z + az / len * 0.4);
      ring.apex.set(e.x - ax / len * 2.0, APEX, e.z - az / len * 2.0);
      if (ring.flame) { ring.flame.busy = false; ring.flame.m.visible = false; }
      ring.flame = this.take();
    }
    ring.end = Math.max(ring.end, ring.t + e.delay + LATE + BURN + BURN_OUT);
    for (let i = 0; i < PER_WAVE; i++) {
      // spread round the circle (a turn split into PER_WAVE with jitter), so a wave never clumps
      const a = (i + r() * 0.7) / PER_WAVE * 6.283 + r() * 0.4, d = (0.25 + 0.7 * Math.sqrt(r())) * e.radius * 0.92;
      const land = ring.t + e.delay - EARLY + (EARLY + LATE) * (i + r() * 0.8) / PER_WAVE;
      const x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
      const sx = ring.apex.x + (r() - 0.5) * 2.2, sy = ring.apex.y - r() * 1.2, sz = ring.apex.z + (r() - 0.5) * 2.2;
      this.arrows.push({ x, z, sx, sy, sz, start: Math.max(ring.t + RISE, land - FALL), land, t: ring.t, done: false, landed: false, flame: null, seed: r() * 10, ring });
    }
  }
  burst(e) { for (const g of this.rings) if (g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05) g.pulse = 1; }
  // the comet of fire wrapping a flying arrow: front at the head (+x along the flight), tail streaming back
  orientFlame(f, head, dir, len, thick, k) {
    const m = f.m; placeV(m, head);
    m.quaternion.setFromUnitVectors(X, dir); m.scale.set(len / 4, thick, thick);
    f.mat.uniforms.uTime.value = this.t; f.mat.uniforms.uAlpha.value = k;
  }
  update(dt) {
    this.t += dt;
    this.shaft.begin(); this.core.begin(); this.glow.begin();
    const two = this.two, three = this.three, dir = this.dir;
    for (const g of this.rings) {
      if (!g.live) continue;
      g.t += dt; g.pulse = Math.max(0, g.pulse - dt / 0.2);
      const open = Math.min(1, g.t / 0.18), fade = 1 - THREE.MathUtils.smoothstep(g.t, g.end - 0.4, g.end);
      g.mat.uniforms.uOpen.value = 0.98 * (1 - Math.pow(1 - open, 3)); g.mat.uniforms.uPulse.value = g.pulse; g.mat.uniforms.uFade.value = fade;
      // the up-shot: a burning arrow climbing to the bloom
      if (g.t < RISE && g.flame) {
        const u = g.t / RISE, e = 1 - (1 - u) * (1 - u);
        this.p.copy(g.from).lerp(g.apex, e); dir.subVectors(g.apex, g.from).normalize();
        this.orientFlame(g.flame, this.p, dir, 2.2, 0.2, 1);
        two[0].copy(this.p).addScaledVector(dir, -SHAFT); two[1].copy(this.p);
        sw = 0.05; this.shaft.strip(two, shaftW, 1, [0.32, 0.16, 0.08]);
        sw = 0.07; this.glow.strip(two, glowW, 0.9, [1.0, 0.45, 0.1]);
      } else if (!g.bloomed) {
        g.bloomed = true;
        if (g.flame) { g.flame.busy = false; g.flame.m.visible = false; g.flame = null; }
        this.flash(g.apex, 2.6);
        this.fire?.impact(g.apex.x, g.apex.y, g.apex.z, false, 0.9);
      }
      if (g.t >= g.end) { g.live = false; g.m.visible = false; if (g.flame) { g.flame.busy = false; g.flame.m.visible = false; g.flame = null; } }
    }
    for (const f of this.flashes) {
      f.t += dt; const k = f.t / 0.24;
      f.m.visible = k < 1;
      if (!f.m.visible) continue;
      f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(f.size * (0.6 + k * 0.7)); f.m.material.uniforms.uT.value = k;
    }
    for (const a of this.arrows) {
      a.t += dt;
      if (a.t < a.start) continue;
      const dx = a.x - a.sx, dy = -a.sy, dz = a.z - a.sz, l = Math.hypot(dx, dy, dz);
      dir.set(dx / l, dy / l, dz / l); // the flight, downward
      if (a.t >= a.land) {
        if (!a.landed) {
          a.landed = true;
          this.p.set(a.x, 0.15, a.z); this.flash(this.p, 1.0);
          this.fire?.burst(a.x, 0.12, a.z, 4, 0.55);
          const s = this.scorches[this.scorchI++ % SCORCH]; s.t = 0; s.x = a.x; s.z = a.z; s.s = 0.7 + this.rnd() * 0.25; s.seed = this.rnd();
        }
        const k = (a.t - a.land) / (BURN + BURN_OUT);
        if (k >= 1) { a.done = true; continue; }
        // pinned at its slant: the shaft out of the ground, its fletching end up the flight path
        two[0].set(a.x, 0.02, a.z); two[1].set(a.x - dir.x * SHAFT * 0.58, -dir.y * SHAFT * 0.58, a.z - dir.z * SHAFT * 0.58);
        const charred = Math.min(1, (a.t - a.land) / BURN);
        const vis = 1 - THREE.MathUtils.smoothstep(k, 0.8, 1);
        sw = 0.05; this.shaft.strip(two, shaftW, vis, [0.3 - 0.18 * charred, 0.15 - 0.1 * charred, 0.08 - 0.05 * charred]);
        this.tail.copy(two[1]); this.fletch(this.tail, dir, vis * (1 - charred * 0.6));
        // a tongue of flame burning up the shaft (front in the ground, flowing up), burning away at the end
        if (!a.flame) a.flame = this.take();
        if (a.flame) {
          const out = Math.max(0, (a.t - a.land - BURN) / BURN_OUT), grow = Math.min(1, (a.t - a.land) / 0.12);
          const flicker = 1 + 0.12 * Math.sin(this.t * 17 + a.seed * 5) + 0.08 * Math.sin(this.t * 29 + a.seed);
          this.p.set(a.x, 0.06, a.z); placeV(a.flame.m, this.p);
          a.flame.m.quaternion.setFromUnitVectors(X, DOWN);
          a.flame.m.scale.set(0.24 * grow * flicker * (1 - 0.4 * out), 0.15 * grow, 0.15 * grow);
          a.flame.mat.uniforms.uTime.value = this.t; a.flame.mat.uniforms.uAlpha.value = 1;
          a.flame.mat.uniforms.uCut.value = out * 0.35; a.flame.mat.uniforms.uCool.value = out * 0.2;
        }
        continue;
      }
      const u = (a.t - a.start) / (a.land - a.start), e = u * u * 0.55 + u * 0.45;
      this.p.set(a.sx + dx * e, a.sy + dy * e, a.sz + dz * e);
      // the arrow: shaft trailing the head, a hot point, a glow streak, the comet of fire round it
      two[0].copy(this.p).addScaledVector(dir, -SHAFT); two[1].copy(this.p);
      sw = 0.055; this.shaft.strip(two, shaftW, 1, [0.32, 0.16, 0.08]);
      this.tail.copy(two[0]); this.fletch(this.tail, dir, 1);
      three[0].copy(this.p).addScaledVector(dir, -2.0 * Math.min(1, u * 3)); three[1].copy(this.p).addScaledVector(dir, -0.6); three[2].copy(this.p);
      sw = 0.09; this.glow.strip(three, glowW, 0.8, [1.0, 0.42, 0.1]);
      sw = 0.035; this.core.strip(three, coreW, 0.9, [1.0, 0.6, 0.2]);
      two[0].copy(this.p).addScaledVector(dir, -0.16); two[1].copy(this.p).addScaledVector(dir, 0.06);
      sw = 0.09; this.core.strip(two, tipW, 1, [1.0, 0.9, 0.55]);
      if (!a.flame) a.flame = this.take();
      if (a.flame) {
        a.flame.mat.uniforms.uCut.value = 0; a.flame.mat.uniforms.uCool.value = 0;
        this.orientFlame(a.flame, this.p, dir, 1.7, 0.17, Math.min(1, u * 5));
      }
    }
    compact(this.arrows, this.alive);
    let any = false;
    for (let i = 0; i < SCORCH; i++) {
      const s = this.scorches[i]; s.t += dt;
      const age = s.t / 2.6, on = age < 1;
      this.life[i * 2] = on ? age : -1; this.life[i * 2 + 1] = s.seed;
      if (!on) continue;
      any = true;
      this.mtx.makeScale(s.s, 1, s.s); this.mtx.setPosition(s.x, 0.02 + fxGround.y(s.x, s.z), s.z);
      this.scorch.setMatrixAt(i, this.mtx);
    }
    if (any || this.scorch.visible) { this.scorch.instanceMatrix.needsUpdate = true; this.scorch.geometry.attributes.aLife.needsUpdate = true; }
    this.scorch.visible = any;
    this.shaft.end(); this.core.end(); this.glow.end();
  }
  clear() {
    for (const g of this.rings) { g.live = false; g.m.visible = false; g.flame = null; }
    for (const f of this.flames) { f.busy = false; f.m.visible = false; }
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const s of this.scorches) s.t = 9;
    this.arrows.length = 0; this.scorch.visible = false;
  }
  get busy() { return this.arrows.length > 0 || this.rings.some((g) => g.live); }
}
