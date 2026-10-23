// Flank Thrust (dagger), in the bench's light-and-ribbon language. It is a stab, not a cut: on the
// rules' 'slash' contact a narrow spear of light shoots out to the skill's reach with two thin
// speed lines beside it. A target struck from the front gets a small burst; one struck from the
// side or behind (the rules' positional bonus) gets a hard burst, a gold weak-point diamond that
// snaps shut on it and a camera shake. On the bench each dummy's weak side is marked on the ground
// with a dashed half-ring behind it, so you can see where to stand. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';

const EDGE = [0.9, 0.96, 1.0], GLOW = [0.45, 0.65, 1.0], GOLD = [1.0, 0.85, 0.35], GOLD_GLOW = [1.0, 0.55, 0.12], MARK = [1.0, 0.7, 0.3];
const BURSTS = 6, RAYS = 10, MARK_PTS = 5, DASHES = 7, LIFE = 0.16;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.97), 0.85) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
// the spear: wide at the hand, narrowing to a sharp point
const spearW = (x) => stripW * (x < 0.12 ? x / 0.12 : 1 - (x - 0.12) / 0.88 * 0.92), spearGlowW = (x) => spearW(x) * 2.6;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;

function canvasTexture(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); }

export class ThrustFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 3000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 3000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const glowTex = canvasTexture((g) => { const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128); });
    // a gold weak-point diamond: a diamond outline with four ticks pointing in
    const markTex = canvasTexture((g) => {
      g.lineCap = 'round';
      const diamond = (w, col) => { g.beginPath(); g.moveTo(64, 14); g.lineTo(114, 64); g.lineTo(64, 114); g.lineTo(14, 64); g.closePath(); g.lineWidth = w; g.strokeStyle = col; g.stroke(); };
      diamond(16, '#5a3300'); diamond(8, '#ffd45a');
      for (const [x0, y0, x1, y1] of [[64, 0, 64, 30], [128, 64, 98, 64], [64, 128, 64, 98], [0, 64, 30, 64]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = 12; g.strokeStyle = '#5a3300'; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#fff2b0'; g.stroke(); }
      g.beginPath(); g.arc(64, 64, 8, 0, 6.283); g.fillStyle = '#fff2b0'; g.fill();
    });
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); mk.visible = false; mk.renderOrder = 10; scene.add(mk);
      return { sp, mk, weak: false, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), edge: EDGE, glow: GLOW, rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    this.burstI = 0; this.thrusts = []; this.rnd = mulberry32(53); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: MARK_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.alive = (x) => x.t < LIFE; this.onShake = null;
  }
  // the rules' contact: from the hand along angle, out to the reach
  thrust(x, y, z, angle, range) { this.thrusts.push({ x, y, z, dx: Math.sin(angle), dz: Math.cos(angle), range, t: 0 }); }
  // a struck target; weak: hit from the side or behind (the rules' positional bonus)
  hit(center, angle, weak) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd, dx = Math.sin(angle), dz = Math.cos(angle);
    b.t = 0; b.weak = weak; b.size = weak ? 1.3 : 0.6; b.life = weak ? 0.34 : 0.22; b.pos.copy(center);
    b.edge = weak ? GOLD : EDGE; b.glow = weak ? GOLD_GLOW : GLOW;
    b.sp.material.color.setRGB(...(weak ? [1, 0.9, 0.6] : [0.85, 0.92, 1]));
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dx + (r() - 0.5) * 0.4, (r() - 0.4) * 0.4, dz + (r() - 0.5) * 0.4).normalize(); ray.len = b.size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = b.size * (0.4 + r() * 0.35); }
    });
    if (weak) this.onShake?.(0.05, 0.12);
  }
  // marks: [{x, z, facing}] dummies whose weak side to show (empty when not this skill)
  update(dt, marks) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three;
    for (const s of this.thrusts) {
      s.t += dt;
      const u = s.t / LIFE, out = Math.min(1, s.t / 0.04), fade = 1 - u * u;
      three[0].set(s.x + s.dx * 0.2, s.y, s.z + s.dz * 0.2);
      three[2].set(s.x + s.dx * (0.2 + s.range * out), s.y, s.z + s.dz * (0.2 + s.range * out));
      three[1].copy(three[0]).lerp(three[2], 0.12);
      stripW = 0.2 * (1 - u * 0.6);
      this.glow.strip(three, spearGlowW, 0.9 * fade, GLOW); this.core.strip(three, spearW, fade, EDGE);
      for (const side of [-1, 1]) { // speed lines beside the spear
        const ox = s.dz * side * 0.16, oz = -s.dx * side * 0.16, back = 0.4 + u * 0.5;
        three[0].set(s.x + s.dx * back + ox, s.y + side * 0.05, s.z + s.dz * back + oz);
        three[2].set(s.x + s.dx * (back + s.range * 0.55 * out) + ox, s.y + side * 0.05, s.z + s.dz * (back + s.range * 0.55 * out) + oz);
        three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.025; this.glow.strip(three, taperGlowW, 0.6 * fade, GLOW); this.core.strip(three, taperW, 0.8 * fade, EDGE);
      }
    }
    compact(this.thrusts, this.alive);
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1; b.mk.visible = b.weak && b.t < 0.5;
      if (b.mk.visible) { // the diamond snaps shut on the target, then fades
        const m = Math.min(1, b.t / 0.08);
        b.mk.position.copy(b.pos); b.mk.scale.setScalar(0.9 * (1.8 - 0.8 * m)); b.mk.material.opacity = Math.min(1, (0.5 - b.t) / 0.15); b.mk.material.rotation = (1 - m) * 0.8;
      }
      if (!b.sp.visible) continue;
      b.sp.position.copy(b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), b.glow); this.core.strip(three, taperW, 1 - k * k, b.edge);
      }
    }
    // the weak side of each dummy: a dashed half-ring on the ground behind it
    for (const m of marks) {
      const back = m.facing + Math.PI, pulse = 0.7 + 0.3 * Math.sin(this.t * 4);
      for (let d = 0; d < DASHES; d++) {
        const a0 = back - Math.PI / 2 + (d / DASHES) * Math.PI, a1 = a0 + (Math.PI / DASHES) * 0.6, sub = this.sub; sub.length = 0;
        for (let i = 0; i < MARK_PTS; i++) { const a = a0 + (a1 - a0) * (i / (MARK_PTS - 1)); this.pts[i].set(m.x + Math.sin(a) * 0.7, 0.04, m.z + Math.cos(a) * 0.7); sub.push(this.pts[i]); }
        stripW = 0.045; this.glow.strip(sub, lineGlowW, 0.4 * pulse, GOLD_GLOW); this.core.strip(sub, lineW, 0.75 * pulse, MARK);
      }
    }
    this.core.end(); this.glow.end();
  }
  clear() { this.thrusts.length = 0; for (const b of this.bursts) { b.t = 9; b.sp.visible = false; b.mk.visible = false; } }
}
