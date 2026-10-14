// Chain Spark: thin angular bolts hopping target to target, ragged contact flashes,
// ground-crawling arcs and a short "shocked" status. Driven by the core 'chain' event.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, lookOf } from './fx-common.js';

const HOP = 0.085, BOLT_HOLD = 0.2, BOLT_FADE = 0.1, LIFE = 1.0, FLASHES = 16, LIGHTS = 3;
const coreFrag = `varying vec2 vUv; varying float vA; varying vec3 vT;
  float h(float x){ return fract(sin(x*127.1)*43758.5453); }
  void main(){ float d=abs(vUv.y); float n = h(floor(vUv.x*60.0)) * 0.25;
    if(d > 0.92 - n) discard;
    vec3 c = d < 0.42 - n*0.5 ? vec3(1.0) : vT;
    gl_FragColor=vec4(c, vA); }`;
const glowFrag = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,3.0)*0.5; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

// angular lightning: few straight segments, hard kinks, uneven spacing
function zig(a, b, seed, amp, segs, out, wout) {
  const r = mulberry32(seed);
  out.length = 0; wout.length = 0;
  const len = a.distanceTo(b);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  let side = r() < 0.5 ? -1 : 1, drift = 0;
  const ts = [0];
  for (let i = 1; i < segs; i++) ts.push((i + (r() - 0.5) * 0.8) / segs);
  ts.push(1);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], env = Math.sin(Math.PI * t);
    const p = a.clone().lerp(b, t);
    if (i > 0 && i < ts.length - 1) {
      side = r() < 0.62 ? -side : side;
      drift = drift * 0.6 + (r() - 0.5) * 0.6;
      p.addScaledVector(perp, (side * (0.15 + r() * 0.95) + drift) * amp * len * (0.35 + 0.65 * env));
      p.y += (r() - 0.5) * amp * len * 0.5 * env;
    }
    out.push(p); wout.push(0.55 + r() * 0.75);
  }
  return { r, dir, perp };
}

export class ChainFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.glow = new Ribbon(scene, camera, 12000, glowFrag, THREE.AdditiveBlending);
    this.core = new Ribbon(scene, camera, 12000, coreFrag, THREE.NormalBlending);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.quad = quad;
    this.flashes = Array.from({ length: FLASHES }, (_, k) => { const m = new THREE.Mesh(quad, flashMaterial(5.1 + k * 3.7)); m.renderOrder = 6; m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
    this.lights = Array.from({ length: LIGHTS }, () => { const l = new THREE.PointLight('#c8e8ff', 0, 4, 2); scene.add(l); return l; });
    this.casts = []; this.charge = null; this.sparks = []; this.time = 0; this.rnd = mulberry32(7);
  }
  // castStart: crackle at the staff head until the bolt leaves
  beginCharge(total, element) { this.charge = { t: 0, total, look: lookOf(element), element }; }
  // points: the core event's [x, z] list (first = in front of the caster). miss: nothing was hit.
  play(points, element, tip, miss = false) {
    const look = lookOf(element);
    const from = tip.clone();
    const hits = points.slice(1).map(([x, z], i) => ({ c: new THREE.Vector3(x, miss ? 0.15 : 1.1, z), base: new THREE.Vector3(x, 0, z), hitAt: i * HOP + 0.035, done: false }));
    const chain = [from, ...hits.map((h) => h.c)];
    const bolts = [];
    for (let k = 0; k < chain.length - 1; k++) bolts.push({ a: chain[k], b: chain[k + 1], start: k * HOP, width: 0.17 * Math.pow(0.85, k), seed: (k + 1) * 13 + Math.floor(this.time * 97) });
    this.casts.push({ t: 0, look, element, hits, bolts, miss, seed: Math.floor(this.time * 1000) });
    if (this.charge) this.charge.release = 0;
  }
  spawnSparks(c, n, speed, tint, inward) {
    for (let i = 0; i < n && this.sparks.length < 400; i++) {
      const r = this.rnd, th = r() * Math.PI * 2, el = r() * 0.9 + 0.1;
      const v = new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el) * 1.1, Math.sin(th) * Math.cos(el)).multiplyScalar(speed * (0.5 + r() * 0.8));
      const p = c.clone();
      if (inward) { p.addScaledVector(v, 0.11); v.multiplyScalar(-1.4); }
      this.sparks.push({ p, v, life: 0, max: inward ? 0.1 : 0.2 + r() * 0.25, tint, w: 0.018 + r() * 0.018, inward });
    }
  }
  stroke(pts, ws, w, alpha, tint, glowTint, haloMul = 2.4) {
    const end = (x) => Math.min(1, x * 6, (1 - x) * 6);
    this.glow.strip(pts, (x, k) => w * haloMul * (0.5 + 0.5 * ws[k]) * Math.max(0.3, end(x)), alpha, glowTint);
    this.core.strip(pts, (x, k) => w * ws[k] * end(x), alpha, tint);
  }
  tendrils(c, seed, n, len, w, alpha, flat, look) {
    const r = mulberry32(seed), p = [], ws = [];
    for (let i = 0; i < n; i++) {
      const th = r() * 6.283, el = flat ? 0 : (r() - 0.3) * 1.4, L = len * (0.4 + r() * 0.8);
      tmpA.set(c.x + Math.cos(th) * Math.cos(el) * L, flat ? c.y : c.y + Math.sin(el) * L, c.z + Math.sin(th) * Math.cos(el) * L);
      zig(c, tmpA, seed * 7 + i * 31, 0.28, 4 + Math.floor(r() * 3), p, ws);
      ws[0] = 1.3;
      for (let j = 1; j < ws.length; j++) ws[j] *= 1 - j / ws.length;
      this.glow.strip(p, (x) => w * 2.2 * (1 - x * 0.7), alpha * 0.7, look.glow);
      this.core.strip(p, (x, k) => w * ws[k] * Math.min(1, (1 - x) * 4), alpha, look.edge);
    }
  }
  update(dt, tip) {
    this.time += dt;
    const flick = Math.floor(this.time * 15);
    this.glow.begin(); this.core.begin();
    let flashI = 0, lightI = 0;
    const useFlash = (pos, scale, u, seed, look) => {
      if (flashI >= FLASHES) return;
      const fl = this.flashes[flashI++];
      fl.visible = true; fl.position.copy(pos); fl.quaternion.copy(this.camera.quaternion); fl.scale.setScalar(scale);
      fl.material.uniforms.uT.value = u; fl.material.uniforms.uSeed.value = seed; tintFlash(fl.material, look.element);
    };
    const useLight = (pos, k, color) => { if (lightI >= LIGHTS) return; const L = this.lights[lightI++]; L.position.copy(pos).y += 0.4; L.intensity = k; L.color.setRGB(color[0], color[1], color[2]); };

    // staff charge
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      const look = { ...ch.look, element: ch.element };
      if (ch.release === undefined) {
        const c = Math.min(1, ch.t / Math.max(0.05, ch.total));
        useFlash(tip, (0.15 + 0.4 * c) * 1.2, 0.1 + (flick % 3) * 0.08, 2.3 + flick * 1.37, look);
        useLight(tip, 3 * c, look.edge);
        if (c > 0.1) this.tendrils(tip, 900 + flick, 2 + Math.floor(c * 3), 0.25 + c * 0.3, 0.035, 1, false, look);
        if (Math.floor(ch.t / 0.03) !== Math.floor((ch.t - dt) / 0.03)) this.spawnSparks(tip, 2, 4, look.edge, true);
        if (ch.t > ch.total + 0.4) this.charge = null;
      } else {
        ch.release += dt;
        if (ch.release < 0.12) useFlash(tip, 0.72 * (1 - ch.release / 0.12), 0.2 + ch.release * 5, 2.3 + flick, look);
        else this.charge = null;
      }
    }

    for (const cast of this.casts) {
      cast.t += dt;
      const t = cast.t, look = { ...cast.look, element: cast.element };
      cast.bolts.forEach((b, k) => {
        const age = t - b.start;
        if (age < 0 || age > BOLT_HOLD + BOLT_FADE) return;
        const lead = Math.min(1, age / 0.045);
        const fade = age > BOLT_HOLD ? 1 - (age - BOLT_HOLD) / BOLT_FADE : 1;
        const w = b.width * (age < 0.06 ? 1.4 : flick % 2 ? 1.0 : 0.8) * (0.4 + 0.6 * fade);
        const segs = Math.max(6, Math.round(b.a.distanceTo(b.b) * 2.6));
        const pts = [], ws = [];
        const { r, dir, perp } = zig(b.a, b.b, b.seed * 100 + flick, 0.1, segs, pts, ws);
        const cut = Math.max(2, Math.ceil(pts.length * lead));
        const main = pts.slice(0, cut), mw = ws.slice(0, cut);
        if (lead < 1) main[cut - 1] = pts[cut - 2].clone().lerp(pts[cut - 1], (pts.length * lead) % 1 || 1);
        this.stroke(main, mw, w, fade, look.edge, look.glow);
        if (lead >= 1) {
          const p2 = [], w2 = [];
          zig(b.a, b.b, b.seed * 100 + flick + 777, 0.08, segs + 2, p2, w2);
          this.stroke(p2, w2, w * 0.4, 0.85 * fade, look.edge, look.glow, 3.0);
          const nf = 2 + Math.floor(r() * 3), fp = [], fw = [];
          for (let f = 0; f < nf; f++) {
            const base = pts[1 + Math.floor(r() * (pts.length - 2))], L = 0.4 + r() * 0.8;
            tmpA.copy(base).addScaledVector(dir, L * 0.5).addScaledVector(perp, (r() < 0.5 ? -1 : 1) * L * (0.5 + r() * 0.5));
            tmpA.y += (r() - 0.6) * 0.5;
            zig(base, tmpA, b.seed * 333 + flick * 5 + f, 0.25, 3 + Math.floor(r() * 3), fp, fw);
            for (let j = 0; j < fw.length; j++) fw[j] *= 1 - j / fw.length;
            this.stroke(fp, fw, w * 0.55, fade, look.edge, look.glow, 2.0);
          }
        }
      });
      cast.hits.forEach((h, k) => {
        const age = t - h.hitAt;
        if (age >= 0 && !h.done) { h.done = true; this.spawnSparks(h.c, Math.max(6, 14 - k * 2), 7.5, k % 2 ? look.spark : look.edge, false); }
        if (age >= 0 && age < 0.16) {
          useFlash(h.c, (age < 0.03 ? 0.6 + 0.4 * age / 0.03 : 1) * 1.7 * Math.pow(0.9, k), age / 0.16, 5.1 + k * 3.7 + Math.floor(age * 30) * 0.9, look);
          this.tendrils(h.c, 3000 + k * 50 + flick, 6, 0.55 + age * 3, 0.05 * Math.pow(0.9, k), 1 - age / 0.16, false, look);
        }
        if (age >= 0.02 && age < 0.3) { tmpB.set(h.base.x, 0.05, h.base.z); this.tendrils(tmpB, 4000 + k * 50 + flick, 4, 0.6 + (age - 0.02) * 2.2, 0.035, 1 - (age - 0.02) / 0.28, true, look); }
        if (age >= 0 && age < 0.25) useLight(h.c, 6 * Math.pow(1 - age / 0.25, 2), look.edge);
        // shocked status: short crooked arcs hopping over the body
        if (!cast.miss && age > 0.08 && age < 0.7) {
          const r = mulberry32(5000 + k * 97 + flick), n = age < 0.35 ? 2 : r() < 0.5 ? 1 : 0, cp = [], cw = [];
          for (let i = 0; i < n; i++) {
            const a1 = r() * 6.28, a2 = a1 + 0.7 + r() * 1.2;
            tmpA.set(h.base.x + Math.cos(a1) * 0.4, 0.7 + r() * 1.0, h.base.z + Math.sin(a1) * 0.4);
            tmpB.set(h.base.x + Math.cos(a2) * 0.4, 0.7 + r() * 1.0, h.base.z + Math.sin(a2) * 0.4);
            zig(tmpA, tmpB, 7000 + k * 31 + flick * 3 + i, 0.35, 4, cp, cw);
            this.stroke(cp, cw, 0.035, 1, look.edge, look.glow, 2.0);
          }
        }
      });
    }
    this.casts = this.casts.filter((c) => c.t < LIFE);

    for (const s of this.sparks) {
      s.life += dt;
      if (!s.inward) { s.v.y -= 14 * dt; s.v.multiplyScalar(1 - 3.2 * dt); }
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.03 && !s.inward) { s.p.y = 0.03; s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; }
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
    const glowC = this.casts[0]?.look.glow || this.charge?.look.glow || [0.3, 0.6, 1];
    for (const s of this.sparks) {
      const u = s.life / s.max;
      tmpA.copy(s.p).addScaledVector(s.v, -0.03);
      const pts = [tmpA.clone(), s.p.clone().lerp(tmpA, 0.5), s.p.clone()];
      this.glow.strip(pts, () => s.w * 2.2, 0.6 * (1 - u), glowC);
      this.core.strip(pts, (x) => s.w * x * (1 - u * 0.6), 1 - u * u, s.tint);
    }
    for (let i = flashI; i < FLASHES; i++) this.flashes[i].visible = false;
    for (let i = lightI; i < LIGHTS; i++) this.lights[i].intensity = 0;
    this.glow.end(); this.core.end();
  }
  clear() { this.casts = []; this.sparks = []; this.charge = null; }
  get busy() { return this.casts.length > 0 || this.sparks.length > 0 || !!this.charge; }
}
