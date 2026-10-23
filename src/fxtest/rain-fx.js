// Arrow Rain, in the bench's light-and-ribbon language: the rules' 'area' events (one per wave,
// each with its delay) mark a thin cel circle on the ground for the volley; each wave's arrows
// fall as thin streaks of light that land exactly when the rules' 'burst' fires; each landing
// leaves a short fading stub and a few sparks while the circle pulses. Element Shifts recolour it. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf } from './fx-common.js';

const RINGS = 4, PER_WAVE = 12, FALL = 0.22, DROP = 6.5, LEN = 1.3, STUCK = 0.35;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.95), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// a thin outline circle with a faint fill; uPulse flashes the rim brighter on each landing wave
const RING_FS = `varying vec2 vP; uniform float uOpen; uniform float uPulse; uniform float uFade; uniform vec3 uCol;
  void main(){
    float r = length(vP), edge = uOpen;
    if (r > edge || uOpen < 0.01) discard;
    float e = edge - r;
    vec3 c = uCol; float a = 0.12;
    if (e < 0.05) a = 0.75 + 0.25 * uPulse;
    else if (abs(r - edge * 0.6) < 0.012) a = 0.3;
    a += uPulse * 0.18;
    gl_FragColor = vec4(mix(c, vec3(1.0), 0.35 * uPulse), a * uFade); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
const glowW = (x) => stripW * 2.6 * x, coreW = (x) => stripW * x;
const sparkGlowW = () => stripW * 2.2, sparkCoreW = (x) => stripW * x * (1 - stripU * 0.6);

export class RainFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 3000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 3000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.rings = Array.from({ length: RINGS }, () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uOpen: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 }, uCol: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: RING_FS, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(quad, mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m);
      return { m, mat, live: false, x: 0, z: 0, t: 0, end: 0, pulse: 0 };
    });
    this.arrows = []; this.sparks = []; this.rnd = mulberry32(83);
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.alive = (a) => !a.done; this.sparkAlive = (s) => s.life < s.max;
  }
  // core 'area' event of one wave; from = the caster (arrows fall in from behind and above them)
  wave(e, element, from) {
    const look = lookOf(element), r = this.rnd;
    let ring = this.rings.find((g) => g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05);
    if (!ring) {
      ring = this.rings.find((g) => !g.live) || this.rings[0];
      Object.assign(ring, { live: true, x: e.x, z: e.z, t: 0, end: 0, pulse: 0 });
      ring.m.visible = true; ring.m.position.set(e.x, 0.03, e.z); ring.m.scale.setScalar(e.radius * 2);
      ring.mat.uniforms.uCol.value.setRGB(look.edge[0], look.edge[1], look.edge[2]);
    }
    ring.end = Math.max(ring.end, ring.t + e.delay + 0.35);
    // arrows: random points in the circle, each landing exactly at this wave's burst
    const ax = e.x - from.x, az = e.z - from.z, len = Math.hypot(ax, az) || 1;
    for (let i = 0; i < PER_WAVE; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * e.radius * 0.92;
      const land = e.delay + (r() - 0.5) * 0.06;
      this.arrows.push({ x: e.x + Math.cos(a) * d, z: e.z + Math.sin(a) * d, dx: -ax / len * 0.35, dz: -az / len * 0.35, start: land - FALL, land, t: 0, done: false, landed: false, look, ring });
    }
  }
  // core 'burst' of a wave: the circle pulses
  burst(e) { for (const g of this.rings) if (g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05) g.pulse = 1; }
  spark(x, z, look) {
    const r = this.rnd;
    for (let i = 0; i < 3 && this.sparks.length < 300; i++) {
      const a = r() * 6.283, s = 1.5 + r() * 2;
      this.sparks.push({ p: new THREE.Vector3(x, 0.05, z), v: new THREE.Vector3(Math.cos(a) * s, 1.2 + r() * 2, Math.sin(a) * s), life: 0, max: 0.2 + r() * 0.15, w: 0.025, look });
    }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    for (const g of this.rings) {
      if (!g.live) continue;
      g.t += dt; g.pulse = Math.max(0, g.pulse - dt / 0.18);
      const open = Math.min(1, g.t / 0.15), fade = 1 - THREE.MathUtils.smoothstep(g.t, g.end - 0.2, g.end);
      g.mat.uniforms.uOpen.value = 0.98 * (1 - Math.pow(1 - open, 3)); g.mat.uniforms.uPulse.value = g.pulse; g.mat.uniforms.uFade.value = fade;
      if (g.t >= g.end) { g.live = false; g.m.visible = false; }
    }
    const two = this.two;
    for (const a of this.arrows) {
      a.t += dt;
      if (a.t < a.start) continue;
      const u = Math.min(1, (a.t - a.start) / FALL);
      if (a.t >= a.land) {
        if (!a.landed) { a.landed = true; this.spark(a.x, a.z, a.look); }
        const k = (a.t - a.land) / STUCK;
        if (k >= 1) { a.done = true; continue; }
        // a short stub stuck in the ground, fading
        two[0].set(a.x + a.dx * 0.45, 0.45, a.z + a.dz * 0.45); two[1].set(a.x, 0.02, a.z);
        stripW = 0.05;
        this.glow.strip(two, glowW, 0.6 * (1 - k), a.look.glow); this.core.strip(two, coreW, 1 - k * k, a.look.edge);
        continue;
      }
      // the tip falls from DROP to the ground along a slight slant; the streak trails behind it
      const h = DROP * (1 - u), back = (1 - u) * DROP * 0.35;
      two[0].set(a.x + a.dx * (back + LEN), h + LEN, a.z + a.dz * (back + LEN));
      two[1].set(a.x + a.dx * back, h, a.z + a.dz * back);
      stripW = 0.065;
      this.glow.strip(two, glowW, 0.8, a.look.glow); this.core.strip(two, coreW, 1, a.look.edge);
    }
    compact(this.arrows, this.alive);
    const three = this.three;
    for (const s of this.sparks) {
      s.life += dt; s.v.y -= 12 * dt; s.p.addScaledVector(s.v, dt);
      const u = s.life / s.max;
      if (u >= 1) continue;
      three[0].copy(s.p).addScaledVector(s.v, -0.03); three[1].copy(s.p).lerp(three[0], 0.5); three[2].copy(s.p);
      stripW = s.w; stripU = u;
      this.glow.strip(three, sparkGlowW, 0.6 * (1 - u), s.look.glow); this.core.strip(three, sparkCoreW, 1 - u * u, s.look.spark);
    }
    compact(this.sparks, this.sparkAlive);
    this.core.end(); this.glow.end();
  }
  clear() { for (const g of this.rings) { g.live = false; g.m.visible = false; } this.arrows.length = 0; this.sparks.length = 0; }
  get busy() { return this.arrows.length > 0 || this.sparks.length > 0 || this.rings.some((g) => g.live); }
}
