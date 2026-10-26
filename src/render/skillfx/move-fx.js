// Dodge effects in the bench's light-and-ribbon language: Blink and the Leap's slam. Cosmetic only.
// Blink (violet): through the gather a ring on the ground tightens round the feet and wisps spiral into
// the body; on the jump a slit of light pinches shut where the body stood, a flash-step streak runs to the
// new spot, and there a slit opens, a ring rolls out and a few motes settle. Leap (warm): one tapered
// streak follows the body through the air; the landing pops a compact flash, two shock rings race out to
// the landing radius, short cracks score the ground and a low dust skirt with a few chips follows.
// Principles from the Cartoon FX Remaster studies in docs/VFX-REFERENCE.md (Magic Poof: the reveal kept
// apart from its accents; Ground Hit + Debris: an immediate compact contact, debris on its own gravity
// phase), rebuilt as original shapes.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, fxGround } from './fx-common.js';

const VIO = [0.55, 0.3, 1.0], VIO_CORE = [0.78, 0.64, 1.0], WARM = [1.0, 0.72, 0.36], WARM_CORE = [1.0, 0.95, 0.82];
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.3 ? mix(vT, vec3(1.0,1.0,0.98), 0.45) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const CRACK = [0.28, 0.19, 0.11];
const FLASHES = 6, RING_PTS = 33, TRAIL = 20, WISPS = 7, WISP_PTS = 7, CRACKS = 9, SLIT_PTS = 7, STREAK_PTS = 12;
const smooth = (k) => k * k * (3 - 2 * k), out2 = (k) => 1 - (1 - k) * (1 - k);
// strip widths read these (set before each strip; no closure per frame)
let sw = 0;
const flatW = () => sw, flatGlowW = () => sw * 2.6;
const taperW = (x) => sw * Math.sin(Math.PI * Math.min(1, x)), taperGlowW = (x) => taperW(x) * 2.6;
const headW = (x) => sw * x * x, headGlowW = (x) => headW(x) * 2.4; // thin tail, full at the head (the last point)
const slitW = (x) => sw * Math.pow(Math.sin(Math.PI * x), 0.6), slitGlowW = (x) => slitW(x) * 2.8;
const alive = (o) => o.t < o.life;
const compact = (arr) => { let w = 0; for (const o of arr) if (alive(o)) arr[w++] = o; arr.length = w; };

export class MoveFx {
  /** particles(): the game's particle systems ({fx, dust}: vfx.js), for motes, chips and dust */
  constructor(scene, camera, particles) {
    this.core = new Ribbon(scene, camera, 3000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 3000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.particles = particles;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.flashes = Array.from({ length: FLASHES }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.2, size: 1, delay: 0, pos: new THREE.Vector3() };
    });
    this.flashI = 0; this.rnd = mulberry32(53);
    this.rings = []; this.slits = []; this.streaks = []; this.cracks = []; this.wisps = []; this.gatherS = null;
    this.trail = Array.from({ length: TRAIL }, () => new THREE.Vector3()); this.trailN = 0; this.trailFade = 0; this.trailOn = false; this.trailView = [];
    this.pts = Array.from({ length: Math.max(RING_PTS, STREAK_PTS) }, () => new THREE.Vector3()); this.view = [];
  }
  flash(x, y, z, size, life, col, delay = 0) {
    const f = this.flashes[this.flashI++ % FLASHES];
    f.t = -delay; f.life = life; f.size = size; f.pos.set(x, y, z); f.sp.material.color.setRGB(col[0], col[1], col[2]);
  }
  ring(x, z, r0, r1, life, w, col, core, delay = 0, y = 0.04) { if (this.rings.length < 12) this.rings.push({ x, z, y, r0, r1, t: -delay, life, w, col, core }); }

  /** the blink's gather (dur seconds) at the hero's feet */
  gather(x, z, dur) {
    this.gatherS = { x, z, t: 0, life: dur };
    const r = this.rnd;
    this.wisps.length = 0;
    for (let i = 0; i < WISPS; i++) this.wisps.push({ a: (i / WISPS) * 6.283 + r() * 0.4, h: 0.25 + r() * 1.2, rad: 0.75 + r() * 0.35, spin: 1.6 + r() * 0.8, t: -r() * dur * 0.25, life: dur * 0.9 });
  }
  /** the blink's jump: gone from (fx, fz), there at (x, z) */
  jump(fx, fz, x, z) {
    this.gatherS = null; this.wisps.length = 0;
    this.slits.push({ x: fx, z: fz, t: 0, life: 0.16, open: false });
    this.slits.push({ x, z, t: -0.03, life: 0.26, open: true });
    this.streaks.push({ fx, fz, x, z, t: 0, life: 0.2 });
    this.ring(fx, fz, 0.25, 0.9, 0.2, 0.05, VIO, VIO_CORE);
    this.ring(x, z, 0.2, 1.25, 0.32, 0.07, VIO, VIO_CORE, 0.03);
    this.flash(fx, 0.9, fz, 1.5, 0.14, VIO);
    this.flash(x, 0.9, z, 2.0, 0.22, VIO, 0.03);
    const P = this.particles?.(), r = this.rnd;
    if (P) for (let i = 0; i < 12; i++) {
      const a = r() * 6.283, s = 0.6 + r() * 1.4, gy = fxGround.y(x, z);
      P.fx.add(x + Math.sin(a) * 0.25, gy + 0.4 + r() * 1.3, z + Math.cos(a) * 0.25, Math.sin(a) * s, 0.4 + r() * 0.8, Math.cos(a) * s, { color: 0xd2c2ff, size: 0.16 + r() * 0.1, sizeEnd: 0.03, life: 0.35 + r() * 0.25, drag: 2, gravity: 2.2 });
    }
  }
  /** the leap's landing at (x, z), its damage radius */
  land(x, z, radius) {
    this.trailFade = Math.min(this.trailFade, 1);
    this.flash(x, 0.35, z, 1.5, 0.14, WARM_CORE);
    this.ring(x, z, 0.3, radius * 1.05, 0.26, 0.11, WARM, WARM_CORE);
    this.ring(x, z, 0.2, radius * 0.75, 0.34, 0.05, WARM, WARM_CORE, 0.06);
    const r = this.rnd;
    for (let i = 0; i < CRACKS; i++) {
      const a = (i / CRACKS) * 6.283 + (r() - 0.5) * 0.5;
      this.cracks.push({ x, z, a, len: radius * (0.45 + r() * 0.35), bend: (r() - 0.5) * 0.5, t: 0, life: 0.55 + r() * 0.15 });
    }
    const P = this.particles?.(), gy = fxGround.y(x, z);
    if (P) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * 6.283 + r() * 0.3, s = radius * (1.6 + r() * 0.8);
        P.dust.add(x + Math.sin(a) * 0.4, gy + 0.12, z + Math.cos(a) * 0.4, Math.sin(a) * s, 0.2 + r() * 0.3, Math.cos(a) * s, { color: 0xcdb894, size: 0.55 + r() * 0.3, sizeEnd: 1.3 + r() * 0.5, life: 0.5 + r() * 0.2, drag: 4.5 });
      }
      for (let i = 0; i < 10; i++) {
        const a = r() * 6.283, s = 1.5 + r() * 2.5;
        P.fx.add(x + Math.sin(a) * 0.3, gy + 0.15, z + Math.cos(a) * 0.3, Math.sin(a) * s, 2.5 + r() * 2, Math.cos(a) * s, { color: 0x8a7458, size: 0.1 + r() * 0.06, sizeEnd: 0.08, life: 0.45 + r() * 0.2, drag: 0.6, gravity: 12 });
      }
    }
  }
  /** a point of the leaping body (ground-relative), once a frame while leaping */
  leapAt(x, y, z) {
    if (this.trailFade < 1) this.trailN = 0;
    this.trailFade = 1;
    if (this.trailN === TRAIL) { const first = this.trail[0]; for (let i = 1; i < TRAIL; i++) this.trail[i - 1] = this.trail[i]; this.trail[TRAIL - 1] = first; this.trailN--; }
    this.trail[this.trailN++].set(x, y, z);
    this.trailOn = true;
  }

  update(dt) {
    this.core.begin(); this.glow.begin();
    const pts = this.pts, view = this.view;
    // the gather: a tightening ground ring and wisps spiralling into the chest
    const G = this.gatherS;
    if (G) {
      G.t += dt;
      const k = Math.min(1, G.t / G.life), rad = 1.05 - 0.75 * smooth(k);
      view.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; view.push(pts[i].set(G.x + Math.sin(a) * rad, 0.04, G.z + Math.cos(a) * rad)); }
      sw = 0.05 + 0.04 * k;
      this.glow.strip(view, flatGlowW, 0.5 + 0.5 * k, VIO); this.core.strip(view, flatW, 0.5 + 0.5 * k, VIO_CORE);
      for (const w of this.wisps) {
        w.t += dt;
        const e = Math.min(1, Math.max(0, w.t / w.life));
        if (e <= 0) continue;
        view.length = 0;
        for (let j = 0; j < WISP_PTS; j++) {
          const q = Math.max(0, e - (j / (WISP_PTS - 1)) * 0.35), s = smooth(q), r = w.rad * (1 - s), a = w.a + w.spin * s;
          view.push(pts[j].set(G.x + Math.sin(a) * r, w.h + (0.85 - w.h) * s, G.z + Math.cos(a) * r));
        }
        view.reverse(); // tail first, so headW is full at the wisp's head
        sw = 0.07;
        const fade = Math.min(1, e / 0.2) * (e >= 1 ? 0 : 1);
        this.glow.strip(view, headGlowW, fade * 0.8, VIO); this.core.strip(view, headW, fade, VIO_CORE);
      }
      if (G.t >= G.life + 0.05) { this.gatherS = null; this.wisps.length = 0; }
    }
    // slits: a vertical slit of light pinching shut (gone) or opening then fading (there)
    for (const s of this.slits) {
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      const width = s.open ? 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k * 0.4) : 0.6 * (1 - out2(k));
      const top = s.open ? 2.1 * out2(Math.min(1, k * 2)) : 2.1 - 0.6 * k;
      view.length = 0;
      for (let j = 0; j < SLIT_PTS; j++) view.push(pts[j].set(s.x, 0.02 + (top * j) / (SLIT_PTS - 1), s.z));
      sw = width;
      this.glow.strip(view, slitGlowW, 1 - k * 0.6, VIO); this.core.strip(view, slitW, 1 - k, VIO_CORE);
    }
    compact(this.slits);
    // the flash-step streak: thin where the body left, full where it lands, fading fast
    for (const s of this.streaks) {
      s.t += dt;
      const k = Math.min(1, s.t / s.life);
      view.length = 0;
      for (let j = 0; j < STREAK_PTS; j++) { const u = j / (STREAK_PTS - 1); view.push(pts[j].set(s.fx + (s.x - s.fx) * u, 0.75 + 0.15 * Math.sin(Math.PI * u), s.fz + (s.z - s.fz) * u)); }
      sw = 0.16 * (1 - 0.5 * k);
      this.glow.strip(view, headGlowW, (1 - k) * 0.9, VIO); this.core.strip(view, headW, 1 - k, VIO_CORE);
    }
    compact(this.streaks);
    // ground rings racing out
    for (const r of this.rings) {
      r.t += dt;
      if (r.t < 0) continue;
      const k = Math.min(1, r.t / r.life), rad = r.r0 + (r.r1 - r.r0) * out2(k);
      view.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; view.push(pts[i].set(r.x + Math.sin(a) * rad, r.y, r.z + Math.cos(a) * rad)); }
      sw = r.w * (1 - 0.6 * k);
      this.glow.strip(view, flatGlowW, (1 - k) * 0.9, r.col); this.core.strip(view, flatW, 1 - k * k, r.core);
    }
    compact(this.rings);
    // ground cracks: short scores from the landing, drawn out fast and fading
    for (const c of this.cracks) {
      c.t += dt;
      const k = Math.min(1, c.t / c.life), grow = out2(Math.min(1, c.t / 0.08));
      view.length = 0;
      for (let j = 0; j < 5; j++) {
        const u = (j / 4) * grow, a = c.a + c.bend * u, d = 0.35 + c.len * u;
        view.push(pts[j].set(c.x + Math.sin(a) * d, 0.03, c.z + Math.cos(a) * d));
      }
      sw = 0.05;
      this.glow.strip(view, taperGlowW, (1 - k) * 0.3, WARM); this.core.strip(view, taperW, (1 - k) * 0.9, CRACK);
    }
    compact(this.cracks);
    // the leap's streak: one tapered ribbon behind the body, fading out after the landing
    if (this.trailN > 1) {
      if (!this.trailOn) this.trailFade -= dt / 0.18;
      this.trailOn = false;
      if (this.trailFade <= 0) this.trailN = 0;
      else {
        const tv = this.trailView; tv.length = 0;
        for (let i = 0; i < this.trailN; i++) tv.push(this.trail[i]);
        sw = 0.24;
        this.glow.strip(tv, headGlowW, this.trailFade * 0.6, WARM); this.core.strip(tv, headW, this.trailFade * 0.7, WARM_CORE);
      }
    }
    this.core.end(); this.glow.end();
    for (const f of this.flashes) {
      if (f.t > f.life) { f.sp.visible = false; continue; }
      f.t += dt;
      if (f.t < 0) { f.sp.visible = false; continue; }
      const k = Math.min(1, f.t / f.life);
      f.sp.visible = k < 1; place(f.sp, f.pos.x, f.pos.y, f.pos.z);
      f.sp.scale.setScalar(f.size * (0.55 + 0.45 * out2(k))); f.sp.material.opacity = 1 - k;
    }
  }
  clear() {
    this.rings.length = 0; this.slits.length = 0; this.streaks.length = 0; this.cracks.length = 0; this.wisps.length = 0; this.gatherS = null; this.trailN = 0;
    for (const f of this.flashes) { f.t = 9; f.sp.visible = false; }
  }
}
