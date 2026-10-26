// Backstab (daggers: a step through the shadows to behind the target, then a heavy stab), held to the
// owner's bar (.claude/skills/skill-vfx). Owner: the first warp was too plain, so the step is drawn as
// shadow, not light: dark ink with a violet rim, which reads strongly on any ground.
// On the rules' 'shadowStep' event:
//  - leave: a pool of shadow spreads under the feet, ink tendrils whip up from it and sink back, and
//    shards spray out (the View leaves dark afterimages of the body, vfx.shadowEchoes);
//  - travel: a thick ink streak with a bright violet thread runs from there round the target's side to
//    its back (a curve, never through the body), its head racing ahead, then thins from its tail;
//  - arrive: a second pool opens behind the target, tendrils rise round the hero, a tall violet slit
//    flashes and shards gather in, with a light and a short shake.
// The stab is Flank Thrust's spear and hard burst in the same violet (the director calls ThrustFx).
// Few ribbon strips, two pooled ground discs and pooled shard sparks: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight, fxGround, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, drawSparks, spark } from './light-kit.js';

const LOOK = { edge: [0.72, 0.48, 1.0], glow: [0.55, 0.12, 1.0] };
const INK = [0.62, 0.3, 1.0]; // the ink strips' rim; the body is this darkened (INK_FS)
const THREAD = [0.86, 0.72, 1.0];
// ink: a near-black violet body with a coloured rim (normal blending, so it darkens the ground)
const INK_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard;
    vec3 c = mix(vT*0.12, vT, smoothstep(0.55, 0.85, d)); gl_FragColor=vec4(c, vA*(1.0-smoothstep(0.85,0.95,d)*0.5)); }`;
const POOL_FS = `varying vec2 vUv; uniform float uR; uniform float uA; uniform float uT; uniform float uSeed;
  ${NOISE}
  void main(){
    vec2 p = vUv*2.0-1.0; float r = length(p), th = atan(p.y, p.x);
    float edge = uR * (0.82 + 0.18*fbm(vec2(cos(th), sin(th))*2.0 + uSeed + uT*1.5));
    if (r > edge) discard;
    float k = r/edge;
    vec3 c = mix(vec3(0.05,0.01,0.09), vec3(0.42,0.12,0.8), smoothstep(0.78, 0.98, k));
    gl_FragColor = vec4(c, uA*(0.35 + 0.55*smoothstep(0.2, 0.9, k))); }`;
const SPARKS = 90, PATH = 16, TENDRILS = 7, TEN_PTS = 7, POOLS = 2;
const TRAVEL = 0.1, STREAK = 0.34, POOL_LIFE = 0.6, TEN_LIFE = 0.42;
let sw = 0;
// the streak: full at the head (the last point), thin at the tail
const headW = (x) => sw * (0.2 + 0.8 * x * x), threadW = (x) => sw * 0.22 * x, threadGlowW = (x) => sw * 0.9 * x;
// a tendril: wide at the root (the first point), a point at the tip
const tendrilW = (x) => sw * (1 - x) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, x + 0.3)));
const slitW = (x) => sw * Math.pow(Math.sin(Math.PI * x), 0.6), slitGlowW = (x) => slitW(x) * 3;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class ShadowFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(37);
    this.ink = new Ribbon(scene, camera, 1200, INK_FS, THREE.NormalBlending);
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.ink.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 9; this.core.mesh.renderOrder = 10;
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); geo.userData.shared = true;
    this.pools = Array.from({ length: POOLS }, (_, i) => {
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uR: { value: 0 }, uA: { value: 0 }, uT: { value: 0 }, uSeed: { value: i * 7.3 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: POOL_FS, transparent: true, depthWrite: false,
      }));
      m.visible = false; m.renderOrder = 4; scene.add(m);
      return { m, t: 9, size: 1 };
    });
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.ctrl = new THREE.Vector3(); this.t = 9;
    this.path = Array.from({ length: PATH }, () => new THREE.Vector3());
    this.tendrils = Array.from({ length: TENDRILS * 2 }, () => ({ x: 0, z: 0, a: 0, h: 1, curl: 1, delay: 0 }));
    this.tpts = Array.from({ length: TEN_PTS }, () => new THREE.Vector3());
    this.slit = Array.from({ length: 7 }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.sparks = []; this.free = [];
    this.light = addLight(scene, new THREE.PointLight('#9a5cff', 0, 5, 2));
    this.onShake = null;
  }
  // the hero leaves (fx, fz) and appears at (x, z), behind the target standing at (tx, tz) with radius tr
  step(fx, fz, x, z, tx = (fx + x) / 2, tz = (fz + z) / 2, tr = 0.5) {
    const r = this.rnd;
    this.from.set(fx, 0, fz); this.to.set(x, 0, z); this.t = 0;
    // the curve's control point: out to the side of the line, away from the target's side of it, so the
    // streak swings round the body instead of through it
    const lx = x - fx, lz = z - fz, ll = Math.hypot(lx, lz) || 1;
    let px = -lz / ll, pz = lx / ll;
    if ((tx - fx) * px + (tz - fz) * pz > 0.05) { px = -px; pz = -pz; }
    const push = 2 * (tr + 1.2); // a quadratic bezier reaches half way to its control point
    this.ctrl.set((fx + x) / 2 + px * push, 0, (fz + z) / 2 + pz * push);
    this.pool(0, fx, fz, 1.0, 0); this.pool(1, x, z, 0.85, TRAVEL * 0.6);
    for (let i = 0; i < TENDRILS * 2; i++) {
      const o = this.tendrils[i], at = i < TENDRILS, a = (i / TENDRILS) * 6.283 + r() * 0.6;
      o.x = (at ? fx : x) + Math.sin(a) * (0.25 + r() * 0.35); o.z = (at ? fz : z) + Math.cos(a) * (0.25 + r() * 0.35);
      o.a = a; o.h = 1.1 + r() * 0.9; o.curl = (r() < 0.5 ? -1 : 1) * (1.5 + r() * 1.5); o.delay = at ? r() * 0.05 : TRAVEL * 0.7 + r() * 0.06;
    }
    // vanish: shards spray up and out from where it stood
    for (let i = 0; i < 16; i++) {
      const a = r() * 6.283, sp = 2 + r() * 3;
      this.p.set(fx + Math.sin(a) * 0.3, 0.4 + r() * 1.1, fz + Math.cos(a) * 0.3);
      this.v.set(Math.sin(a) * sp, 1 + r() * 2.5, Math.cos(a) * sp);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.2 + r() * 0.2, 0.04, LOOK);
    }
    // appear: shards flying in toward where it lands
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.283, d = 1.3 + r() * 0.6;
      this.p.set(x + Math.sin(a) * d, 0.4 + r() * 1.2, z + Math.cos(a) * d);
      this.v.set(-Math.sin(a) * d * 6, (0.9 - this.p.y) * 4, -Math.cos(a) * d * 6);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.14 + r() * 0.06, 0.035, LOOK);
    }
    this.light.position.set(x, 1.1, z);
    this.onShake?.(0.06, 0.1);
  }
  pool(i, x, z, size, delay) { const o = this.pools[i]; o.t = -delay; o.size = size; o.m.position.set(x, fxGround.y(x, z) + 0.03, z); }
  bez(q, out) { // the curve from -> ctrl -> to at q
    const a = (1 - q) * (1 - q), b = 2 * (1 - q) * q, c = q * q;
    return out.set(a * this.from.x + b * this.ctrl.x + c * this.to.x, 0.85 + Math.sin(Math.PI * q) * 0.25, a * this.from.z + b * this.ctrl.z + c * this.to.z);
  }
  update(dt) {
    this.ink.begin(); this.core.begin(); this.glow.begin();
    for (const o of this.pools) {
      o.t += dt;
      const k = o.t / POOL_LIFE;
      o.m.visible = o.t >= 0 && k < 1;
      if (!o.m.visible) continue;
      const u = o.m.material.uniforms, grow = out2(Math.min(1, o.t / 0.12));
      o.m.scale.setScalar(o.size * (0.9 + 0.3 * grow));
      u.uR.value = grow * (1 - 0.35 * k * k); u.uA.value = Math.min(1, (1 - k) * 2.5); u.uT.value = o.t;
    }
    if (this.t < 1) {
      this.t += dt;
      const t = this.t;
      // the streak: its head runs the curve in TRAVEL, then the tail eats up to the head
      const head = Math.min(1, t / TRAVEL), tail = t < TRAVEL ? 0 : Math.min(1, (t - TRAVEL) / (STREAK - TRAVEL));
      if (tail < 1) {
        for (let i = 0; i < PATH; i++) this.bez(tail + (head - tail) * (i / (PATH - 1)), this.path[i]);
        const fade = 1 - tail * tail;
        sw = 0.42 * (1 - 0.5 * tail); this.ink.strip(this.path, headW, 0.9 * fade, INK);
        this.glow.strip(this.path, threadGlowW, 0.9 * fade, LOOK.glow); this.core.strip(this.path, threadW, fade, THREAD);
      }
      // ink tendrils whipping up from both pools, then sinking back
      for (const o of this.tendrils) {
        const age = t - o.delay; if (age < 0 || age > TEN_LIFE) continue;
        const k = age / TEN_LIFE, rise = out2(Math.min(1, k * 2.5)), sink = k > 0.5 ? (k - 0.5) * 2 : 0;
        const pts = this.tpts;
        for (let i = 0; i < TEN_PTS; i++) {
          const q = i / (TEN_PTS - 1), h = o.h * rise * q * (1 - 0.6 * sink), a = o.a + o.curl * q * rise, rr = 0.15 + 0.35 * q;
          pts[i].set(o.x + Math.sin(a) * rr * q, 0.05 + h, o.z + Math.cos(a) * rr * q);
        }
        sw = 0.22; this.ink.strip(pts, tendrilW, 0.85 * (1 - sink * sink), INK);
      }
      // a tall violet slit where the hero appears
      const sk = (t - TRAVEL * 0.8) / 0.22;
      if (sk > 0 && sk < 1) {
        for (let i = 0; i < this.slit.length; i++) this.slit[i].set(this.to.x, 0.05 + (i / (this.slit.length - 1)) * 2.2 * (0.6 + 0.4 * out2(sk)), this.to.z);
        sw = 0.22 * (1 - sk); this.glow.strip(this.slit, slitGlowW, 1 - sk, LOOK.glow); this.core.strip(this.slit, slitW, 1 - sk * sk, THREAD);
      }
      this.light.intensity = 4 * Math.max(0, 1 - Math.abs(t - TRAVEL) / 0.25);
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 4);
    this.ink.end(); this.core.end(); this.glow.end();
  }
  clear() {
    this.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; this.light.intensity = 0;
    for (const o of this.pools) { o.t = 9; o.m.visible = false; }
  }
  get busy() { return this.t < 1 || this.sparks.length > 0 || this.pools.some((o) => o.t < POOL_LIFE); }
}
