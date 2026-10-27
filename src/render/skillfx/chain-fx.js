// Chain Spark: thin angular bolts hopping target to target (no contact burst),
// and a short "shocked" status on struck targets. Driven by the core 'chain' event.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, lookOf, place, placeV, addLight } from './fx-common.js';

const HOP = 0.085, BOLT_HOLD = 0.2, BOLT_FADE = 0.1, LIFE = 1.0, FLASHES = 16, LIGHTS = 3;
export const CRACKLE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  float h(float x){ return fract(sin(x*127.1)*43758.5453); }
  void main(){ float d=abs(vUv.y); float n = h(floor(vUv.x*60.0)) * 0.25;
    if(d > 0.92 - n) discard;
    vec3 c = d < 0.42 - n*0.5 ? vec3(1.0) : vT;
    gl_FragColor=vec4(c, vA); }`;
export const BOLT_GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,3.0)*0.5; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
// spark streaks reuse these (Ribbon.strip copies the points at once)
const sparkPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
let sparkW = 0, sparkU = 0;
const sparkGlowW = () => sparkW * 2.2, sparkCoreW = (x) => sparkW * x * (1 - sparkU * 0.6);

// Seeded random streams with no closure per use: zig() reseeds one, its caller keeps drawing from it.
export class Rng {
  seed(a) { this.a = a | 0; return this; }
  next() { let a = (this.a = (this.a + 0x6d2b79f5) | 0), t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
}
const R1 = new Rng(), R2 = new Rng(), R3 = new Rng();
// bolt points come from a pool that is rewound every frame (Ribbon.strip copies them at once)
const PTS = [];
let ptI = 0;
const takePt = () => PTS[ptI++] || (PTS[ptI - 1] = new THREE.Vector3());
/** Rewinds the shared bolt point pool (Thunderstorm draws with zig too; strips copy points at once). */
export const rewindPts = () => { ptI = 0; };
export const zDir = new THREE.Vector3(), zPerp = new THREE.Vector3();
const ts = [];
// scratch point/width lists, filled in place
const L = { pts: [], ws: [], main: [], mw: [], p2: [], w2: [], fp: [], fw: [], cp: [], cw: [], tp: [], tw: [] };
// stroke widths read these (no closure per stroke)
let stW = 0, stHalo = 2.4, stWs = null, tdW = 0;
const endK = (x) => Math.min(1, x * 6, (1 - x) * 6);
const strokeGlowW = (x, k) => stW * stHalo * (0.5 + 0.5 * stWs[k]) * Math.max(0.3, endK(x));
const strokeCoreW = (x, k) => stW * stWs[k] * endK(x);
const tendrilGlowW = (x) => tdW * 2.2 * (1 - x * 0.7), tendrilCoreW = (x, k) => tdW * stWs[k] * Math.min(1, (1 - x) * 4);
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
const castAlive = (c) => c.t < LIFE;

// angular lightning: few straight segments, hard kinks, uneven spacing. r is reseeded with seed;
// zDir/zPerp hold the bolt's direction and its sideways axis afterwards.
export function zig(a, b, r, seed, amp, segs, out, wout) {
  r.seed(seed);
  out.length = 0; wout.length = 0;
  const len = a.distanceTo(b);
  zDir.subVectors(b, a).normalize();
  zPerp.set(-zDir.z, 0, zDir.x).normalize();
  let side = r.next() < 0.5 ? -1 : 1, drift = 0;
  ts.length = 0; ts.push(0);
  for (let i = 1; i < segs; i++) ts.push((i + (r.next() - 0.5) * 0.8) / segs);
  ts.push(1);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i], env = Math.sin(Math.PI * t);
    const p = takePt().copy(a).lerp(b, t);
    if (i > 0 && i < ts.length - 1) {
      side = r.next() < 0.62 ? -side : side;
      drift = drift * 0.6 + (r.next() - 0.5) * 0.6;
      p.addScaledVector(zPerp, (side * (0.15 + r.next() * 0.95) + drift) * amp * len * (0.35 + 0.65 * env));
      p.y += (r.next() - 0.5) * amp * len * 0.5 * env;
    }
    out.push(p); wout.push(0.55 + r.next() * 0.75);
  }
}

export class ChainFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.glow = new Ribbon(scene, camera, 12000, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.core = new Ribbon(scene, camera, 12000, CRACKLE_FS, THREE.NormalBlending);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.quad = quad;
    this.flashes = Array.from({ length: FLASHES }, (_, k) => { const m = new THREE.Mesh(quad, flashMaterial(5.1 + k * 3.7)); m.renderOrder = 6; m.visible = false; m.frustumCulled = false; scene.add(m); return m; });
    this.lights = Array.from({ length: LIGHTS }, () => { return addLight(scene, new THREE.PointLight('#c8e8ff', 0, 4, 2)); });
    this.casts = []; this.charge = null; this.sparks = []; this.time = 0; this.rnd = mulberry32(7);
    this.sparkFree = []; this.sparkAlive = (s) => s.life < s.max || (this.sparkFree.push(s), false);
    this.flashI = 0; this.lightI = 0; this.perp = new THREE.Vector3(); this.dir = new THREE.Vector3();
  }
  // castStart: crackle at the staff head until the bolt leaves
  beginCharge(total, element) { this.charge = { t: 0, total, look: { ...lookOf(element), element }, element }; }
  // points: the core event's [x, z] list (first = in front of the caster). miss: nothing was hit.
  play(points, element, tip, miss = false) {
    const look = { ...lookOf(element), element };
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
      const s = this.sparkFree.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
      const v = s.v.set(Math.cos(th) * Math.cos(el), Math.sin(el) * 1.1, Math.sin(th) * Math.cos(el)).multiplyScalar(speed * (0.5 + r() * 0.8));
      const p = s.p.copy(c);
      if (inward) { p.addScaledVector(v, 0.11); v.multiplyScalar(-1.4); }
      s.life = 0; s.max = inward ? 0.1 : 0.2 + r() * 0.25; s.tint = tint; s.w = 0.018 + r() * 0.018; s.inward = inward;
      this.sparks.push(s);
    }
  }
  stroke(pts, ws, w, alpha, tint, glowTint, haloMul = 2.4) {
    stW = w; stHalo = haloMul; stWs = ws;
    this.glow.strip(pts, strokeGlowW, alpha, glowTint);
    this.core.strip(pts, strokeCoreW, alpha, tint);
  }
  tendrils(c, seed, n, len, w, alpha, flat, look) {
    const r = R3.seed(seed), p = L.tp, ws = L.tw;
    for (let i = 0; i < n; i++) {
      const th = r.next() * 6.283, el = flat ? 0 : (r.next() - 0.3) * 1.4, Ln = len * (0.4 + r.next() * 0.8), steps = 4 + Math.floor(r.next() * 3);
      tmpA.set(c.x + Math.cos(th) * Math.cos(el) * Ln, flat ? c.y : c.y + Math.sin(el) * Ln, c.z + Math.sin(th) * Math.cos(el) * Ln);
      zig(c, tmpA, R2, seed * 7 + i * 31, 0.28, steps, p, ws);
      ws[0] = 1.3;
      for (let j = 1; j < ws.length; j++) ws[j] *= 1 - j / ws.length;
      tdW = w; stWs = ws;
      this.glow.strip(p, tendrilGlowW, alpha * 0.7, look.glow);
      this.core.strip(p, tendrilCoreW, alpha, look.edge);
    }
  }
  useFlash(pos, scale, u, seed, look) {
    if (this.flashI >= FLASHES) return;
    const fl = this.flashes[this.flashI++];
    fl.visible = true; placeV(fl, pos); fl.quaternion.copy(this.camera.quaternion); fl.scale.setScalar(scale);
    fl.material.uniforms.uT.value = u; fl.material.uniforms.uSeed.value = seed; tintFlash(fl.material, look.element);
  }
  useLight(pos, k, color) { if (this.lightI >= LIGHTS) return; const l = this.lights[this.lightI++]; place(l, pos.x, pos.y + 0.4, pos.z); l.intensity = k; l.color.setRGB(color[0], color[1], color[2]); }
  update(dt, tip) {
    this.time += dt;
    const flick = Math.floor(this.time * 15);
    this.glow.begin(); this.core.begin();
    this.flashI = 0; this.lightI = 0; ptI = 0;

    // staff charge
    const ch = this.charge;
    if (ch) {
      ch.t += dt;
      const look = ch.look;
      if (ch.release === undefined) {
        const c = Math.min(1, ch.t / Math.max(0.05, ch.total));
        this.useFlash(tip, (0.15 + 0.4 * c) * 1.2, 0.1 + (flick % 3) * 0.08, 2.3 + flick * 1.37, look);
        this.useLight(tip, 3 * c, look.edge);
        if (c > 0.1) this.tendrils(tip, 900 + flick, 2 + Math.floor(c * 3), 0.25 + c * 0.3, 0.035, 1, false, look);
        if (Math.floor(ch.t / 0.03) !== Math.floor((ch.t - dt) / 0.03)) this.spawnSparks(tip, 2, 4, look.edge, true);
        if (ch.t > ch.total + 0.4) this.charge = null;
      } else {
        ch.release += dt;
        if (ch.release < 0.12) this.useFlash(tip, 0.72 * (1 - ch.release / 0.12), 0.2 + ch.release * 5, 2.3 + flick, look);
        else this.charge = null;
      }
    }

    for (const cast of this.casts) {
      cast.t += dt;
      const t = cast.t, look = cast.look;
      for (const b of cast.bolts) {
        const age = t - b.start;
        if (age < 0 || age > BOLT_HOLD + BOLT_FADE) continue;
        const lead = Math.min(1, age / 0.045);
        const fade = age > BOLT_HOLD ? 1 - (age - BOLT_HOLD) / BOLT_FADE : 1;
        const w = b.width * (age < 0.06 ? 1.4 : flick % 2 ? 1.0 : 0.8) * (0.4 + 0.6 * fade);
        const segs = Math.max(6, Math.round(b.a.distanceTo(b.b) * 2.6));
        const pts = L.pts, ws = L.ws, r = R1;
        zig(b.a, b.b, r, b.seed * 100 + flick, 0.1, segs, pts, ws);
        const dir = this.dir.copy(zDir), perp = this.perp.copy(zPerp);
        const cut = Math.max(2, Math.ceil(pts.length * lead));
        const main = L.main, mw = L.mw; main.length = 0; mw.length = 0;
        for (let j = 0; j < cut; j++) { main.push(pts[j]); mw.push(ws[j]); }
        if (lead < 1) main[cut - 1] = takePt().copy(pts[cut - 2]).lerp(pts[cut - 1], (pts.length * lead) % 1 || 1);
        this.stroke(main, mw, w, fade, look.edge, look.glow);
        if (lead >= 1) {
          const p2 = L.p2, w2 = L.w2;
          zig(b.a, b.b, R2, b.seed * 100 + flick + 777, 0.08, segs + 2, p2, w2);
          this.stroke(p2, w2, w * 0.4, 0.85 * fade, look.edge, look.glow, 3.0);
          const nf = 2 + Math.floor(r.next() * 3), fp = L.fp, fw = L.fw;
          for (let f = 0; f < nf; f++) {
            const base = pts[1 + Math.floor(r.next() * (pts.length - 2))], Lf = 0.4 + r.next() * 0.8;
            tmpA.copy(base).addScaledVector(dir, Lf * 0.5).addScaledVector(perp, (r.next() < 0.5 ? -1 : 1) * Lf * (0.5 + r.next() * 0.5));
            tmpA.y += (r.next() - 0.6) * 0.5;
            zig(base, tmpA, R2, b.seed * 333 + flick * 5 + f, 0.25, 3 + Math.floor(r.next() * 3), fp, fw);
            for (let j = 0; j < fw.length; j++) fw[j] *= 1 - j / fw.length;
            this.stroke(fp, fw, w * 0.55, fade, look.edge, look.glow, 2.0);
          }
        }
      }
      for (let k = 0; k < cast.hits.length; k++) {
        const h = cast.hits[k], age = t - h.hitAt;
        // no contact burst on the target (owner review): the bolt itself and the shocked arcs carry the hit
        // shocked status: short crooked arcs hopping over the body
        if (!cast.miss && age > 0.08 && age < 0.7) {
          const r = R3.seed(5000 + k * 97 + flick), n = age < 0.35 ? 2 : r.next() < 0.5 ? 1 : 0, cp = L.cp, cw = L.cw;
          for (let i = 0; i < n; i++) {
            const a1 = r.next() * 6.28, a2 = a1 + 0.7 + r.next() * 1.2;
            tmpA.set(h.base.x + Math.cos(a1) * 0.4, 0.7 + r.next() * 1.0, h.base.z + Math.sin(a1) * 0.4);
            tmpB.set(h.base.x + Math.cos(a2) * 0.4, 0.7 + r.next() * 1.0, h.base.z + Math.sin(a2) * 0.4);
            zig(tmpA, tmpB, R2, 7000 + k * 31 + flick * 3 + i, 0.35, 4, cp, cw);
            this.stroke(cp, cw, 0.035, 1, look.edge, look.glow, 2.0);
          }
        }
      }
    }
    compact(this.casts, castAlive);

    for (const s of this.sparks) {
      s.life += dt;
      if (!s.inward) { s.v.y -= 14 * dt; s.v.multiplyScalar(1 - 3.2 * dt); }
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.03 && !s.inward) { s.p.y = 0.03; s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; }
    }
    compact(this.sparks, this.sparkAlive);
    const glowC = this.casts[0]?.look.glow || this.charge?.look.glow || [0.3, 0.6, 1];
    for (const s of this.sparks) {
      const u = s.life / s.max;
      sparkPts[0].copy(s.p).addScaledVector(s.v, -0.03);
      sparkPts[1].copy(s.p).lerp(sparkPts[0], 0.5);
      sparkPts[2].copy(s.p);
      sparkW = s.w; sparkU = u;
      this.glow.strip(sparkPts, sparkGlowW, 0.6 * (1 - u), glowC);
      this.core.strip(sparkPts, sparkCoreW, 1 - u * u, s.tint);
    }
    for (let i = this.flashI; i < FLASHES; i++) this.flashes[i].visible = false;
    for (let i = this.lightI; i < LIGHTS; i++) this.lights[i].intensity = 0;
    this.glow.end(); this.core.end();
  }
  clear() { this.casts = []; for (const s of this.sparks) this.sparkFree.push(s); this.sparks.length = 0; this.charge = null; }
  get busy() { return this.casts.length > 0 || this.sparks.length > 0 || !!this.charge; }
}
