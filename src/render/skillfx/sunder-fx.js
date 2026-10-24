// Sunder Cut (axe), in the bench's light-and-ribbon language. The swing itself is the bench Slash
// crescent in amber steel (slash-fx palette). On each struck target a hard burst goes off (a glow
// that pops, rays thrown on along the cut, a ring) and angular armour shards of light break off and
// fall; while the rules keep the target's armour exposure, a broken ring of light (six arcs with
// gaps) circles it at chest height, slowly turning and pulsing, and a broken-shield icon floats
// over its head; both fade as the exposure runs out.
// Cosmetic only; the exposure and its time come from the rules.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';

export const SUNDER_PALETTE = { hot: [1, 0.97, 0.88], body: [1.0, 0.66, 0.3], glow: [0.95, 0.42, 0.12] };
const EDGE = [1.0, 0.72, 0.36], GLOW = [0.95, 0.42, 0.12], HOT = [1, 0.95, 0.8];
const BURSTS = 6, RAYS = 10, ARCS = 6, ARC_PTS = 6, ICONS = 8;

// a broken shield: two halves of a shield split by a zigzag crack, pushed apart, amber with a dark
// outline, drawn once into a canvas for the head icons
function brokenShieldTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const shield = () => { g.beginPath(); g.moveTo(64, 14); g.quadraticCurveTo(90, 26, 106, 24); g.quadraticCurveTo(108, 78, 64, 116); g.quadraticCurveTo(20, 78, 22, 24); g.quadraticCurveTo(38, 26, 64, 14); g.closePath(); };
  const crack = [[60, 10], [70, 38], [56, 56], [72, 78], [60, 120]];
  const half = (side) => { // clip the shield to one side of the crack
    g.save(); g.beginPath();
    g.moveTo(side < 0 ? 0 : 128, 0); for (const [x, y] of crack) g.lineTo(x, y); g.lineTo(side < 0 ? 0 : 128, 128); g.closePath(); g.clip();
    g.translate(side * 7, side < 0 ? 3 : -3); g.rotate(side * 0.06);
    shield(); g.fillStyle = '#ffb347'; g.fill();
    g.beginPath(); g.moveTo(64, 26); g.quadraticCurveTo(86, 34, 96, 33); g.quadraticCurveTo(96, 74, 64, 104); g.quadraticCurveTo(32, 74, 32, 33); g.quadraticCurveTo(42, 34, 64, 26); g.closePath(); g.fillStyle = '#ffd88a'; g.fill();
    shield(); g.lineWidth = 7; g.strokeStyle = '#5a2a0a'; g.stroke();
    g.beginPath(); g.moveTo(crack[0][0], crack[0][1]); for (const [x, y] of crack) g.lineTo(x, y); g.lineWidth = 6; g.stroke();
    g.restore();
  };
  half(-1); half(1);
  return new THREE.CanvasTexture(c);
}
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.98,0.92), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const arcW = (x) => stripW * Math.min(1, Math.sin(Math.PI * x) * 3), arcGlowW = (x) => arcW(x) * 2.4;
// a shard: a short, fat-then-pointed sliver
const shardW = (x) => stripW * (x < 0.35 ? x / 0.35 : (1 - x) / 0.65);

export class SunderFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,235,1)'); grad.addColorStop(0.25, 'rgba(255,200,130,0.7)'); grad.addColorStop(0.6, 'rgba(255,140,60,0.18)'); grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    const iconTex = brokenShieldTexture();
    this.icons = Array.from({ length: ICONS }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); sp.visible = false; sp.renderOrder = 10; scene.add(sp); return sp; });
    this.burstI = 0; this.shards = []; this.rnd = mulberry32(29); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: ARC_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.shardAlive = (s) => s.life < s.max;
  }
  // a struck target: from = where the cut came from
  hit(center, fromX, fromZ) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1, r = this.rnd;
    const b = this.bursts[this.burstI++ % BURSTS];
    b.t = 0; b.size = 1.1; b.life = 0.3; b.pos.copy(center);
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dx / l + (r() - 0.5) * 0.6, (r() - 0.3) * 0.6, dz / l + (r() - 0.5) * 0.6).normalize(); ray.len = 1.3 + r() * 0.6; }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = 0.5 + r() * 0.4; }
    });
    // armour shards breaking off, thrown away from the cut and falling
    for (let i = 0; i < 9 && this.shards.length < 120; i++) {
      const a = Math.atan2(dz, dx) + (r() - 0.5) * 2.2, s = 2 + r() * 2.5;
      this.shards.push({ p: new THREE.Vector3(center.x, center.y + (r() - 0.3) * 0.6, center.z), v: new THREE.Vector3(Math.cos(a) * s, 1.5 + r() * 2.5, Math.sin(a) * s), spin: r() * 6.28, rate: (r() - 0.5) * 20, len: 0.14 + r() * 0.14, life: 0, max: 0.45 + r() * 0.25 });
    }
  }
  // exposed: [{x, z, t}] targets whose armour the rules keep open, t = seconds left
  update(dt, exposed) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three;
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.09 * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), GLOW); this.core.strip(three, taperW, 1 - k * k, EDGE);
      }
    }
    for (const s of this.shards) {
      s.life += dt; s.v.y -= 11 * dt; s.p.addScaledVector(s.v, dt); s.spin += s.rate * dt;
      if (s.p.y < 0.03) { s.p.y = 0.03; s.v.set(s.v.x * 0.3, 0, s.v.z * 0.3); s.rate *= 0.3; }
      const u = s.life / s.max;
      if (u >= 1) continue;
      const cx = Math.cos(s.spin) * s.len, cy = Math.sin(s.spin) * s.len;
      three[0].set(s.p.x - cx, s.p.y - cy, s.p.z); three[2].set(s.p.x + cx, s.p.y + cy, s.p.z); three[1].copy(three[0]).lerp(three[2], 0.35);
      stripW = 0.11 * (1 - u * 0.5);
      this.glow.strip(three, shardW, 0.5 * (1 - u), GLOW); this.core.strip(three, shardW, 1 - u * u, EDGE);
    }
    compact(this.shards, this.shardAlive);
    // the exposure: a broken-shield icon over the head and a broken ring of light at chest height
    let n = 0;
    for (const e of exposed) {
      if (n < ICONS) {
        const ic = this.icons[n++], since = e.full - e.t, pop = Math.min(1, since / 0.15), fadeOut = Math.min(1, e.t / 0.5);
        ic.visible = true; place(ic, e.x, 2.45 + Math.sin(this.t * 3 + e.x) * 0.05, e.z);
        ic.scale.setScalar(0.55 * (pop < 1 ? 0.6 + 0.6 * pop : 1 + 0.08 * Math.max(0, 1 - (since - 0.15) / 0.2)));
        ic.material.opacity = fadeOut;
      }
      const fade = Math.min(1, e.t / 0.5), pulse = 0.85 + 0.15 * Math.sin(this.t * 6);
      const rad = 0.62, y = 1.15 + Math.sin(this.t * 2 + e.x) * 0.04, spin = this.t * 0.9;
      for (let k = 0; k < ARCS; k++) {
        const sub = this.sub; sub.length = 0;
        for (let i = 0; i < ARC_PTS; i++) { const a = spin + k * (6.283 / ARCS) + (i / (ARC_PTS - 1)) * 0.75; this.pts[i].set(e.x + Math.cos(a) * rad, y, e.z + Math.sin(a) * rad); sub.push(this.pts[i]); }
        stripW = 0.05 * pulse;
        this.glow.strip(sub, arcGlowW, 0.6 * fade, GLOW); this.core.strip(sub, arcW, fade * pulse, EDGE);
      }
    }
    for (let i = n; i < ICONS; i++) this.icons[i].visible = false;
    this.core.end(); this.glow.end();
  }
  clear() { for (const ic of this.icons) ic.visible = false; this.shards.length = 0; for (const b of this.bursts) { b.t = 9; b.sp.visible = false; } }
}
