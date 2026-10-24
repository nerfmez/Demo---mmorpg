// Arrow Rain, in the bench's light-and-ribbon language. As the hero looses at the sky (the first
// 'area' event of a volley), a bright streak climbs from the bow to a point above the target and
// bursts there; the rules' waves then come down from that burst as a rain of arrows of light,
// each with a bright head and a fading tail, landing one after another around each wave's
// 'burst' instead of all at once. Each landing leaves a short stub and a few sparks, and a thin
// cel circle marks the volley and pulses with each wave. Element Shifts recolour it. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, flashMaterial, tintFlash, place, placeV, conformPlane } from './fx-common.js';

const RINGS = 4, FLASHES = 4;
const PER_WAVE = 26, FALL = 0.3, LEN = 1.1, STUCK = 0.4;
const EARLY = 0.28, LATE = 0.14;      // a wave's arrows land from EARLY before its burst to LATE after
const RISE = 0.2, APEX = 8.5;         // the up-shot: time to climb, height of the burst
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.95), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// a thin outline circle with a faint fill; uPulse flashes it brighter as each wave lands
const RING_FS = `varying vec2 vP; uniform float uOpen; uniform float uPulse; uniform float uFade; uniform vec3 uCol;
  void main(){
    float r = length(vP), edge = uOpen;
    if (r > edge || uOpen < 0.01) discard;
    float e = edge - r;
    float a = 0.1;
    if (e < 0.04) a = 0.8 + 0.2 * uPulse;
    else if (abs(r - edge * 0.62) < 0.01) a = 0.28;
    a += uPulse * 0.16;
    gl_FragColor = vec4(mix(uCol, vec3(1.0), 0.35 * uPulse), a * uFade); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
// arrows: a thin tail swelling to a bright head (x runs tail -> head)
const tailGlowW = (x) => stripW * (0.8 + 2.2 * x * x), tailCoreW = (x) => stripW * (0.25 + 0.75 * x * x * x);
const headW = (x) => stripW * 2.4 * Math.sin(Math.PI * x);
const sparkGlowW = () => stripW * 2.2, sparkCoreW = (x) => stripW * x * (1 - stripU * 0.6);

export class RainFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 6000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 6000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.rings = Array.from({ length: RINGS }, () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uOpen: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 }, uCol: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: RING_FS, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m);
      return { m, mat, live: false, x: 0, z: 0, t: 0, end: 0, pulse: 0, apex: new THREE.Vector3(), from: new THREE.Vector3(), look: null };
    });
    this.flashes = Array.from({ length: FLASHES }, (_, k) => {
      const m = new THREE.Mesh(quad, flashMaterial(7 + k * 2.3)); m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m);
      return { m, t: 9, at: 0 };
    });
    this.flashI = 0;
    this.arrows = []; this.sparks = []; this.rnd = mulberry32(83);
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.head = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.alive = (a) => !a.done; this.free = []; this.sparkAlive = (s) => s.life < s.max || (this.free.push(s), false); // sparks are recycled
  }
  // core 'area' event of one wave. bow: where the up-shot leaves (the first wave of a volley fires it)
  wave(e, element, bow) {
    const look = lookOf(element), r = this.rnd;
    let ring = this.rings.find((g) => g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05);
    if (!ring) {
      ring = this.rings.find((g) => !g.live) || this.rings[0];
      Object.assign(ring, { live: true, x: e.x, z: e.z, t: 0, end: 0, pulse: 0, look });
      ring.m.visible = true; place(ring.m, e.x, 0.03, e.z); ring.m.scale.setScalar(e.radius * 2); conformPlane(ring.m);
      ring.mat.uniforms.uCol.value.setRGB(look.edge[0], look.edge[1], look.edge[2]);
      // the burst sits above and a little short of the circle, so the arrows come down slanted
      const ax = e.x - bow.x, az = e.z - bow.z, len = Math.hypot(ax, az) || 1;
      ring.from.set(bow.x + ax / len * 0.4, 1.5, bow.z + az / len * 0.4);
      ring.apex.set(e.x - ax / len * 2.2, APEX, e.z - az / len * 2.2);
      const f = this.flashes[this.flashI++ % FLASHES];
      f.t = 0; f.at = RISE; placeV(f.m, ring.apex); tintFlash(f.m.material, element);
    }
    ring.end = Math.max(ring.end, ring.t + e.delay + LATE + STUCK);
    for (let i = 0; i < PER_WAVE; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * e.radius * 0.95;
      // spread over the window so they patter down one after another
      const land = ring.t + e.delay - EARLY + (EARLY + LATE) * (i + r() * 0.8) / PER_WAVE;
      const x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
      // each starts from around the burst, falling straight at its own spot
      const sx = ring.apex.x + (r() - 0.5) * 2.4, sy = ring.apex.y - r() * 1.5, sz = ring.apex.z + (r() - 0.5) * 2.4;
      this.arrows.push({ x, z, sx, sy, sz, start: Math.max(ring.t + RISE, land - FALL), land, t: ring.t, done: false, landed: false, look, ring });
    }
  }
  // core 'burst' of a wave: the circle pulses
  burst(e) { for (const g of this.rings) if (g.live && Math.hypot(g.x - e.x, g.z - e.z) < 0.05) g.pulse = 1; }
  spark(x, z, look, n) {
    const r = this.rnd;
    for (let i = 0; i < n && this.sparks.length < 400; i++) {
      const a = r() * 6.283, s = 1.4 + r() * 1.8;
      const q = (this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() }); q.p.set(x, 0.05, z); q.v.set(Math.cos(a) * s, 1.0 + r() * 1.8, Math.sin(a) * s);
      q.life = 0; q.max = 0.18 + r() * 0.14; q.w = 0.022; q.look = look; this.sparks.push(q);
    }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const two = this.two, three = this.three, head = this.head;
    for (const g of this.rings) {
      if (!g.live) continue;
      g.t += dt; g.pulse = Math.max(0, g.pulse - dt / 0.18);
      const open = Math.min(1, g.t / 0.15), fade = 1 - THREE.MathUtils.smoothstep(g.t, g.end - 0.25, g.end);
      g.mat.uniforms.uOpen.value = 0.98 * (1 - Math.pow(1 - open, 3)); g.mat.uniforms.uPulse.value = g.pulse; g.mat.uniforms.uFade.value = fade;
      // the up-shot: a bright streak climbing from the bow to the burst
      if (g.t < RISE + 0.05) {
        const u = Math.min(1, g.t / RISE), tail = Math.max(0, u - 0.35);
        two[0].copy(g.from).lerp(g.apex, tail); two[1].copy(g.from).lerp(g.apex, u);
        stripW = 0.08; this.glow.strip(two, tailGlowW, 1, g.look.glow); this.core.strip(two, tailCoreW, 1, g.look.edge);
      }
      if (g.t >= g.end) { g.live = false; g.m.visible = false; }
    }
    for (const f of this.flashes) {
      f.t += dt;
      const k = (f.t - f.at) / 0.22;
      f.m.visible = k >= 0 && k < 1;
      if (!f.m.visible) continue;
      f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(1.6 + k * 1.4); f.m.material.uniforms.uT.value = k;
    }
    for (const a of this.arrows) {
      a.t += dt;
      if (a.t < a.start) continue;
      if (a.t >= a.land) {
        if (!a.landed) { a.landed = true; this.spark(a.x, a.z, a.look, 2); }
        const k = (a.t - a.land) / STUCK;
        if (k >= 1) { a.done = true; continue; }
        // stuck in the ground along its line of flight, fading
        const dx = a.sx - a.x, dy = a.sy, dz = a.sz - a.z, l = Math.hypot(dx, dy, dz);
        two[0].set(a.x + dx / l * 0.45, dy / l * 0.45, a.z + dz / l * 0.45); two[1].set(a.x, 0.02, a.z);
        stripW = 0.04;
        this.glow.strip(two, tailGlowW, 0.5 * (1 - k), a.look.glow); this.core.strip(two, tailCoreW, 1 - k * k, a.look.edge);
        continue;
      }
      const u = (a.t - a.start) / (a.land - a.start), e = u * u * 0.6 + u * 0.4; // speeding up as it falls
      head[2].set(a.sx + (a.x - a.sx) * e, a.sy * (1 - e), a.sz + (a.z - a.sz) * e);
      const dx = a.sx - a.x, dy = a.sy, dz = a.sz - a.z, l = Math.hypot(dx, dy, dz);
      const tl = LEN * Math.min(1, u * 4);
      two[0].set(head[2].x + dx / l * tl, head[2].y + dy / l * tl, head[2].z + dz / l * tl); two[1].copy(head[2]);
      stripW = 0.045;
      this.glow.strip(two, tailGlowW, 0.85, a.look.glow); this.core.strip(two, tailCoreW, 1, a.look.edge);
      // the head: a small bright diamond at the tip
      head[0].set(head[2].x + dx / l * 0.22, head[2].y + dy / l * 0.22, head[2].z + dz / l * 0.22); head[1].copy(head[0]).lerp(head[2], 0.5);
      stripW = 0.06; this.core.strip(head, headW, 1, a.look.spark);
    }
    compact(this.arrows, this.alive);
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
  clear() {
    for (const g of this.rings) { g.live = false; g.m.visible = false; }
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    this.arrows.length = 0; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.arrows.length > 0 || this.sparks.length > 0 || this.rings.some((g) => g.live); }
}
