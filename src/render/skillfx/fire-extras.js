// Firebolt additions on top of the game's own renderer (bench only):
// - gather: flame wisps and embers spiral in from around the staff head and arrive at release,
//   so the charge reads as fire being drawn together;
// - impact embers: sparks that burst out, then sway, curl and drift upward like real embers,
//   drawn as short curved trails from their own recent path, flickering as they cool.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, BILLBOARD_VS, NOISE, place, placeV } from './fx-common.js';

const HIST = 7, TRAIL = 9, TRAIL_SPAN = 0.32;
const EMBER_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.97,0.82), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const HOT = [1.0, 0.82, 0.35], MID = [1.0, 0.5, 0.12], COOL = [0.85, 0.22, 0.08];
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
// strip widths read these (set before each strip; no closure per frame)
let sw = 0, swU = 0, swEmber = 1;
const prof = (x) => Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * x)), 0.8) * (1 - 0.35 * x); // flame tongue: pointed head, fullest a third back
const wispGlowW = (x) => sw * 2.6 * prof(x), wispCoreW = (x) => sw * prof(x) * swEmber;
const emberGlowW = (x) => sw * 2.6 * (1 - x * 0.7), emberCoreW = (x) => sw * (1 - x) * (1 - swU * 0.4);
const wispAlive = (w) => !w.done;
const mixc = (a, b, k, out) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };

export class FireExtras {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, EMBER_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,205,120,1)'); grad.addColorStop(0.35, 'rgba(255,130,40,0.5)'); grad.addColorStop(1, 'rgba(230,70,15,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.visible = false; this.halo.renderOrder = 6; scene.add(this.halo);
    this.charge = null;
    // round impact: a ragged flash and a fire puff that swells and burns away, no direction
    const quad = new THREE.PlaneGeometry(1, 1);
    this.camera = camera;
    this.pops = Array.from({ length: 4 }, (_, k) => {
      const flash = new THREE.Mesh(quad, flashMaterial(3 + k * 5.1)); tintFlash(flash.material, 'fire');
      const puff = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 7.3 } }, vertexShader: BILLBOARD_VS,
        fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uSeed; ${NOISE}
          void main(){ float r = length(vUv);
            float n = fbm(vUv * 2.2 + uSeed + vec2(0.0, -uT * 1.5));
            float body = n * 1.15 - r * 0.9 - uT * 0.75;
            if (body < 0.04) discard;
            vec3 c = body > 0.32 ? vec3(1.0, 0.86, 0.45) : body > 0.16 ? vec3(1.0, 0.5, 0.14) : vec3(0.82, 0.24, 0.08);
            gl_FragColor = vec4(c, 0.95); }`, transparent: true, depthWrite: false }));
      for (const m of [flash, puff]) { m.visible = false; m.frustumCulled = false; scene.add(m); }
      flash.renderOrder = 8; puff.renderOrder = 7;
      return { flash, puff, t: 9, pos: new THREE.Vector3() };
    });
    this.wisps = []; this.embers = []; this.rnd = mulberry32(31); this.t = 0;
    this.emberFree = []; this.view = []; this.emberAlive = (m) => m.age < m.life || (this.emberFree.push(m), false);
    this.tmp = []; this.col = [0, 0, 0];
  }
  // castStart of a fire projectile: wisps converge on the staff head over `total` seconds
  gather(total) {
    const r = this.rnd, T = Math.max(0.12, total);
    this.charge = { t: 0, total: T };
    for (let i = 0; i < 18; i++) {
      const th = r() * Math.PI * 2, el = (r() - 0.35) * 1.1, rad = 0.5 + r() * 0.4;
      this.wisps.push({
        th, el, rad, spin: (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.7), delay: r() * T * 0.25, dur: T * (0.7 + r() * 0.08),
        t: 0, w: (i < 10 ? 0.12 : 0.04) * (0.7 + r() * 0.6), ember: i >= 10, pts: Array.from({ length: TRAIL }, () => new THREE.Vector3()),
      });
    }
  }
  release() { this.charge = null; this.halo.visible = false; }
  // a point on wisp w's spiral at progress e (0 start .. 1 at the staff head)
  spiral(w, tip, e, out) {
    const ease = e * e * (3 - 2 * e);
    const rad = w.rad * (1 - ease), th = w.th + w.spin * ease, el = w.el * (1 - ease * 0.6);
    return out.set(tip.x + Math.cos(th) * Math.cos(el) * rad, tip.y + Math.sin(el) * rad * 0.8, tip.z + Math.sin(th) * Math.cos(el) * rad);
  }
  // a fire impact at (x, y, z): fluttering embers
  // embersOnly: just the sparks, no flash or puff (the fusion keeps only these from Firebolt)
  impact(x, y, z, embersOnly = false) {
    const r = this.rnd;
    if (!embersOnly) {
      const pop = this.pops.find((q) => q.t > 0.4) || this.pops[0];
      pop.t = 0; pop.pos.set(x, y, z); pop.puff.material.uniforms.uSeed.value = r() * 40;
    }
    for (let i = 0; i < 22; i++) {
      // a random direction over the whole sphere and a spread of speeds: some fly, some just float off
      const zc = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - zc * zc), sp = 0.6 + Math.pow(r(), 1.6) * 4;
      const m = this.emberFree.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), store: Array.from({ length: HIST }, () => new THREE.Vector3()), hist: [] };
      m.v.set(Math.cos(a) * rr * sp, zc * sp * 0.8 + 0.5, Math.sin(a) * rr * sp); m.p.set(x, y, z); m.hist.length = 0;
      Object.assign(m, { age: 0, life: 0.35 + r() * 0.3, w: 0.02 + r() * 0.014, freq: 4 + r() * 5, phase: r() * 6.28, amp: 4 + r() * 4, flick: 8 + r() * 10 });
      this.embers.push(m);
    }
  }
  update(dt, tip) {
    this.t += dt;
    const r = this.rnd;
    this.core.begin(); this.glow.begin();
    for (const q of this.pops) {
      if (q.t > 0.4) { q.flash.visible = q.puff.visible = false; continue; }
      q.t += dt;
      q.flash.visible = q.t < 0.12; placeV(q.flash, q.pos); q.flash.quaternion.copy(this.camera.quaternion);
      q.flash.scale.setScalar(1.35 * (q.t < 0.03 ? 0.5 + q.t / 0.06 : 1)); q.flash.material.uniforms.uT.value = q.t / 0.12;
      const u = Math.min(1, q.t / 0.4);
      q.puff.visible = true; placeV(q.puff, q.pos); q.puff.quaternion.copy(this.camera.quaternion);
      q.puff.scale.setScalar(0.8 + 1.1 * (1 - (1 - u) * (1 - u))); q.puff.material.uniforms.uT.value = u;
    }
    if (this.charge) {
      const ch = this.charge; ch.t += dt;
      const k = Math.min(1, ch.t / ch.total), grow = k * k * (3 - 2 * k);
      this.halo.visible = true; placeV(this.halo, tip);
      this.halo.scale.setScalar(0.2 + 0.6 * grow);
      this.halo.material.opacity = 0.3 + 0.35 * grow + 0.06 * Math.sin(ch.t * 40);
      if (ch.t > ch.total + 0.05) this.release();
    }
    // gather wisps: spiral in, ease into the staff head
    for (const w of this.wisps) {
      w.t += dt;
      const k = (w.t - w.delay) / w.dur;
      if (k < 0) continue;
      const e = Math.min(1, k);
      // the trail is sampled along the wisp's own spiral (not frame history), so it stays a smooth curve
      const n = Math.max(2, Math.min(TRAIL, 1 + Math.ceil((e / TRAIL_SPAN) * (TRAIL - 1))));
      for (let j = 0; j < n; j++) this.spiral(w, tip, Math.max(0, e - (j / (TRAIL - 1)) * TRAIL_SPAN), w.pts[j]);
      if (n < 6) continue; // a short stub would draw as a small triangle
      const pts = this.view; pts.length = 0;
      for (let j = 0; j < n; j++) pts.push(w.pts[j]);
      const fade = Math.min(1, Math.max(0, (e - 0.12) / 0.25)) * (e >= 1 ? 0 : 1);
      mixc(MID, HOT, e, this.col);
      sw = w.w; swEmber = w.ember ? 0.8 : 1;
      this.glow.strip(pts, wispGlowW, fade * 0.8, this.col);
      this.core.strip(pts, wispCoreW, fade, this.col);
      if (e >= 1) w.done = true;
    }
    compact(this.wisps, wispAlive);
    // embers: drag, buoyancy, a sideways sway that curls the path, flicker while cooling
    for (const m of this.embers) {
      m.age += dt;
      const u = m.age / m.life;
      m.v.multiplyScalar(1 - 4.5 * dt);
      m.v.y += (1.6 * u - 1.2) * dt * 3;               // falls a little, then rises as it cools
      const sway = Math.sin(m.age * m.freq + m.phase) * m.amp * dt;
      m.v.x += sway * Math.cos(m.phase); m.v.z += sway * Math.sin(m.phase);
      m.p.addScaledVector(m.v, dt);
      const head = m.hist.length < HIST ? m.store[m.hist.length] : m.hist.pop(); // reuse the oldest point
      m.hist.unshift(head.copy(m.p));
    }
    compact(this.embers, this.emberAlive);
    for (const m of this.embers) {
      if (m.hist.length < 2) continue;
      const u = m.age / m.life;
      const flick = 0.75 + 0.25 * Math.sin(m.age * m.flick + m.phase);
      if (u < 0.4) mixc(HOT, MID, u / 0.4, this.col); else mixc(MID, COOL, (u - 0.4) / 0.6, this.col);
      const a = (1 - u * u) * flick;
      sw = m.w; swU = u;
      this.glow.strip(m.hist, emberGlowW, a * 0.6, this.col);
      this.core.strip(m.hist, emberCoreW, a, this.col);
    }
    this.core.end(); this.glow.end();
  }
  clear() { this.wisps = []; for (const m of this.embers) this.emberFree.push(m); this.embers.length = 0; this.release(); for (const q of this.pops) q.t = 9; }
}
