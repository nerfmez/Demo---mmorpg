// Calling a hunter's companion (call_companion, call_hawk, call_bear; and Pack Hunt's wolves): no magic, a
// whistle and an animal coming in from the wild (the path: render/companion-arrival.js; the view draws the
// rig along it). Lines and light only where they help reading; the rest is dust and feathers in the world's
// toon colours.
//   whistle: three thin arcs of sound leave the hero's mouth toward where the animal will come from;
//   the run in: the wolf and the bear kick dust from their feet as they come, the eagle trails a streak of
//     wind down out of the sky;
//   landing: a ring of dust thrown out from under the wolf and the bear (the bear's heavier, with a shake);
//     the eagle flares with a ring of wind round it and a few feathers drifting down.
// The rules hold the companion still until it is here (summon.arrive, the same time as the path).
// Cosmetic only; pooled, no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32, BILLBOARD_VS, place } from './fx-common.js';
import { DUST_FS } from './ground-kit.js';
import { CORE_FS, GLOW_FS } from './light-kit.js';
import { arrivalFrom, arrivalAt, arrivalTime } from '../companion-arrival.js';

const DUSTS = 40, CALLS = 6, ARCS = 9, FEATHERS = 24, TRAIL = 7, STREAK = 1.8, HAWK_Y = 1.8; // HAWK_Y: the eagle's body over its root (models.json offset x scale)
const WARM = [1.0, 0.95, 0.82], WARM_GLOW = [1.0, 0.78, 0.4], WIND = [0.92, 0.97, 1.0], WIND_GLOW = [0.55, 0.75, 1.0];
const FEATHER_COLS = [[0.62, 0.42, 0.24], [0.27, 0.32, 0.55], [0.93, 0.88, 0.78]];
const RING_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RING_FS = `varying vec2 vP; uniform float uK; uniform vec3 uC;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float front = 0.2 + 0.8*sqrt(uK), a = exp(-pow((r - front)/0.025, 2.0))*(1.0 - uK)*0.7;
    if (a < 0.01) discard; gl_FragColor = vec4(uC*a, 1.0); }`;
const AIR = new THREE.Color(0.85, 0.93, 1.0);
const FEATHER_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y), x = vUv.x; float w = sin(3.1416*x)*(0.6 + 0.4*x); if (d > w) discard;
    vec3 c = d > w*0.75 ? vT*0.55 : (d < 0.08 ? vT*1.25 : vT); gl_FragColor = vec4(c, vA); }`;
let sw = 0;
const arcW = (x) => sw * Math.sin(Math.PI * x), arcGlowW = (x) => sw * 2.4 * Math.sin(Math.PI * x), lineW = (x) => sw * (1 - x), lineGlowW = (x) => sw * 2.5 * (1 - x), featherW = () => sw;

export class CallFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(19); this.time = 0; this.onShake = null; this.locate = null; // locate(id): the companion where the rules have it now
    this.core = new Ribbon(scene, camera, 900, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 900, GLOW_FS, THREE.AdditiveBlending);
    this.feather = new Ribbon(scene, camera, 200, FEATHER_FS, THREE.NormalBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8; this.feather.mesh.renderOrder = 7;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dusts = Array.from({ length: DUSTS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 0.6, size: 0.6 }; });
    this.dustI = 0;
    this.rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 }, uC: { value: new THREE.Color() } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m); return { m, t: 9, life: 0.45 }; });
    this.ringI = 0;
    this.calls = Array.from({ length: CALLS }, () => ({ type: '', t: 99, from: { x: 0, z: 0 }, toX: 0, toZ: 0, landed: true, nextDust: 0, trail: Array.from({ length: TRAIL }, () => new THREE.Vector3()), tn: 0 }));
    this.arcs = Array.from({ length: ARCS }, () => ({ t: 99, x: 0, y: 0, z: 0, dir: 0 }));
    this.feathers = Array.from({ length: FEATHERS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1.5, spin: 0, ph: 0, col: FEATHER_COLS[0] }));
    this.featherI = 0;
    this.at = { x: 0, y: 0, z: 0, k: 0, facing: 0 }; this.back = { x: 0, y: 0, z: 0, k: 0, facing: 0 };
    this.pts = Array.from({ length: 12 }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
  }
  /** The rules' summon of a companion (e.id, e.x, e.z) of `type`, called by the hero (x, z, facing). */
  call(e, type, hero) {
    const c = this.calls.find((q) => q.t >= 90) || this.calls[0];
    arrivalFrom(type, e.id, e.x, e.z, hero.facing || 0, c.from);
    Object.assign(c, { type, id: e.id, t: 0, toX: e.x, toZ: e.z, landed: false, nextDust: 0, tn: 0 });
    // the whistle: three arcs toward where it comes from (once per call, not per pack wolf)
    if (!this.lastWhistle || this.time - this.lastWhistle > 0.3) {
      this.lastWhistle = this.time;
      const dir = Math.atan2(c.from.x - hero.x, c.from.z - hero.z);
      for (let i = 0; i < 3; i++) { const a = this.arcs.find((q) => q.t >= 0.6) || this.arcs[i]; Object.assign(a, { t: -i * 0.11, x: hero.x, y: 1.15, z: hero.z, dir }); }
    }
  }
  dust(x, y, z, vx, vy, vz, size, life) { const q = this.dusts[this.dustI++ % DUSTS]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = this.rnd() * 40; }
  /** A thin ring running out to R round (x, y, z) over life s (delay: starts later), colour col (a THREE.Color). */
  ring(x, y, z, R, col = AIR, life = 0.45, delay = 0) { const g = this.rings[this.ringI++ % this.rings.length]; g.t = -delay; g.life = life; g.m.visible = false; place(g.m, x, y, z); g.m.scale.setScalar(R * 2); g.m.material.uniforms.uC.value.copy(col); }
  feathersAt(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const f = this.feathers[this.featherI++ % FEATHERS], a = this.rnd() * 6.283, sp = 0.6 + this.rnd() * 1.2;
      f.p.set(x, y, z); f.v.set(Math.cos(a) * sp, 0.6 + this.rnd(), Math.sin(a) * sp);
      Object.assign(f, { t: 0, life: 1.3 + this.rnd() * 0.8, spin: (this.rnd() - 0.5) * 8, ph: this.rnd() * 6.283, col: FEATHER_COLS[i % 3] });
    }
  }
  update(dt) {
    this.time += dt;
    const r = this.rnd, at = this.at;
    this.core.begin(); this.glow.begin(); this.feather.begin();
    // the whistle's arcs: out from the mouth toward where the animal comes from, widening and fading
    for (const a of this.arcs) {
      if (a.t >= 0.6) continue;
      a.t += dt; if (a.t < 0) continue;
      const u = a.t / 0.6, R = 0.35 + 1.3 * u, n = this.pts.length;
      for (let i = 0; i < n; i++) { const s = (i / (n - 1) - 0.5) * 1.1, d = a.dir + s; this.pts[i].set(a.x + Math.sin(d) * R, a.y + 0.12 * Math.cos(s * 2.6) * (1 - u), a.z + Math.cos(d) * R); }
      sw = 0.05 * (1 - 0.5 * u); this.glow.strip(this.pts, arcGlowW, 0.6 * (1 - u), WARM_GLOW); this.core.strip(this.pts, arcW, 0.9 * (1 - u * u), WARM);
    }
    // the arrivals
    for (const c of this.calls) {
      if (c.t >= 90) continue;
      c.t += dt;
      const live = !c.landed && this.locate?.(c.id); if (live) { c.toX = live.x; c.toZ = live.z; } // it lands on the companion as it runs
      arrivalAt(c.type, c.t, c.from, c.toX, c.toZ, at);
      const hawk = c.type === 'hunt_hawk', bear = c.type === 'hunt_bear';
      if (!c.landed && !hawk && c.t >= c.nextDust && at.y < 0.15) {
        // dust kicked up behind its feet as it runs in
        c.nextDust = c.t + (bear ? 0.09 : 0.07);
        const bx = -Math.sin(at.facing), bz = -Math.cos(at.facing);
        this.dust(at.x + bx * 0.4 + (r() - 0.5) * 0.5, 0.15, at.z + bz * 0.4 + (r() - 0.5) * 0.5, bx * 0.8, 0.5, bz * 0.8, bear ? 0.8 : 0.55, 0.5);
      }
      if (hawk && !c.landed) {
        // a streak of wind down its path
        // the streak: back along its own path, at most STREAK m long (its first dive is fast)
        const head = c.trail[0].set(at.x, at.y + HAWK_Y, at.z), back = this.back;
        let len = 0;
        for (let i = 1; i < TRAIL; i++) {
          arrivalAt(c.type, Math.max(0, c.t - i * 0.03), c.from, c.toX, c.toZ, back);
          const q = c.trail[i].set(back.x, back.y + HAWK_Y, back.z), d = q.distanceTo(c.trail[i - 1]);
          if (len + d > STREAK) q.lerpVectors(c.trail[i - 1], q, Math.max(0, STREAK - len) / Math.max(1e-4, d));
          len = Math.min(STREAK, len + d);
        }
        if (head && len > 0.2 && c.tn++ >= 0) { sw = 0.06; this.glow.strip(c.trail, lineGlowW, 0.5 * (1 - at.k * 0.6), WIND_GLOW); this.core.strip(c.trail, lineW, 0.6 * (1 - at.k * 0.6), WIND); }
      }
      if (!c.landed && at.k >= 1) {
        c.landed = true;
        if (hawk) { this.ring(c.toX, HAWK_Y, c.toZ, 1.3); /* the air its wings flare out, round the bird */ this.feathersAt(c.toX, HAWK_Y + 0.2, c.toZ, 6); }
        else {
          const n = bear ? 10 : 7, R = bear ? 0.9 : 0.6;
          for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + r() * 0.4; this.dust(c.toX + Math.cos(a) * R * 0.5, 0.12, c.toZ + Math.sin(a) * R * 0.5, Math.cos(a) * (bear ? 1.8 : 1.3), 0.35, Math.sin(a) * (bear ? 1.8 : 1.3), bear ? 0.95 : 0.65, bear ? 0.7 : 0.55); }
          if (bear) this.onShake?.(0.18, 0.15);
        }
      }
      if (c.landed && c.t > arrivalTime(c.type) + 1.5) c.t = 99;
    }
    // feathers: drifting down, rocking side to side
    for (const f of this.feathers) {
      if (f.t >= f.life) continue;
      f.t += dt; const u = f.t / f.life;
      f.v.multiplyScalar(Math.max(0, 1 - dt * 2.2)); f.v.y = Math.max(f.v.y - 1.2 * dt, -0.45);
      f.p.addScaledVector(f.v, dt); f.p.x += Math.sin(f.t * 4 + f.ph) * 0.4 * dt;
      if (f.p.y < 0.03) f.p.y = 0.03;
      const a = f.ph + f.t * f.spin, L = 0.13;
      this.two[0].set(f.p.x - Math.cos(a) * L, f.p.y + Math.sin(a * 0.7) * 0.03, f.p.z - Math.sin(a) * L); this.two[1].set(f.p.x + Math.cos(a) * L, f.p.y - Math.sin(a * 0.7) * 0.03, f.p.z + Math.sin(a) * L);
      sw = 0.045; this.feather.strip(this.two, featherW, 1 - Math.max(0, u - 0.7) / 0.3, f.col);
    }
    this.core.end(); this.glow.end(); this.feather.end();
    const cam = this.camera.quaternion;
    for (const q of this.dusts) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; const u = q.t / q.life; q.m.visible = true;
      q.v.multiplyScalar(Math.max(0, 1 - dt * 3)); q.p.addScaledVector(q.v, dt);
      q.m.material.uniforms.uT.value = u; place(q.m, q.p.x, q.p.y, q.p.z); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * (0.6 + 0.8 * u));
    }
    for (const g of this.rings) { if (g.t >= g.life) { g.m.visible = false; continue; } g.t += dt; g.m.visible = g.t >= 0; g.m.material.uniforms.uK.value = Math.min(1, Math.max(0, g.t) / g.life); }
  }
  clear() {
    for (const c of this.calls) c.t = 99; for (const a of this.arcs) a.t = 99; for (const f of this.feathers) f.t = 9;
    for (const q of this.dusts) { q.t = 9; q.m.visible = false; } for (const g of this.rings) { g.t = 9; g.m.visible = false; }
  }
}
