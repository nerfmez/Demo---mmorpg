// Measured Riposte, in the bench's light-and-ribbon language. The guard (the rules' 'guardStance',
// 0.8 s) raises a curved wall of light in front of the hero over the guard's arc, following its
// facing. An incoming strike shows as a red lunge streak; a strike the guard catches (the rules'
// 'playerHit' with blocked) sets off a parry: a white-gold flash where blade meets blow, sharp rays,
// an upright ring facing the attacker and the wall breaking into shards. Then, for the rules' ready
// window, a gold ring pulses at the hero's feet and the blade glows gold: press again to counter. A
// strike that gets through flashes red on the hero. The counter itself is a gold crescent (slash-fx
// palette) with hard bursts on what it hits. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';

export const RIPOSTE_PALETTE = { hot: [1, 0.98, 0.9], body: [1.0, 0.82, 0.38], glow: [1.0, 0.6, 0.15] };
const EDGE = [0.8, 0.92, 1.0], GLOW = [0.35, 0.6, 1.0], GOLD = [1.0, 0.86, 0.4], GOLD_GLOW = [1.0, 0.58, 0.12], RED = [1.0, 0.3, 0.2], RED_GLOW = [0.9, 0.1, 0.05];
const BURSTS = 6, RAYS = 10, ARC_PTS = 15, RING_PTS = 25, WALL_ROWS = 4;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.97), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const arcW = (x) => stripW * Math.min(1, Math.sin(Math.PI * x) * 4), arcGlowW = (x) => arcW(x) * 2.4;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const shardW = (x) => stripW * (x < 0.35 ? x / 0.35 : (1 - x) / 0.65);

export class RiposteFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 5000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), edge: EDGE, glow: GLOW, rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    this.burstI = 0; this.guardT = 0; this.guardDur = 0; this.guardArc = 1.9; this.readyT = 0; this.readyDur = 0;
    this.lunges = []; this.rings = []; this.shards = []; this.rnd = mulberry32(37); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.lungeAlive = (l) => l.t < 0.2; this.ringAlive = (r) => r.life < r.max; this.shardAlive = (s) => s.life < s.max;
    this.onShake = null;
  }
  burst(pos, dir, size, life, edge, glow) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos); b.edge = edge; b.glow = glow;
    b.sp.material.color.setRGB(0.5 + edge[0] * 0.5, 0.5 + edge[1] * 0.5, 0.5 + edge[2] * 0.5);
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.6, (r() - 0.3) * 0.6, dir.z + (r() - 0.5) * 0.6).normalize(); ray.len = size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  ring(c, normal, r0, r1, max, w, col, glowCol) { if (this.rings.length < 12) this.rings.push({ c: c.clone(), n: normal.clone(), r0, r1, life: 0, max, w, col, glowCol }); }
  // the rules' guardStance: duration, and the guard's arc in degrees
  guard(duration, arcDeg) { this.guardT = 0; this.guardDur = duration; this.guardArc = (arcDeg * Math.PI) / 180; this.readyT = this.readyDur = 0; }
  // a strike coming in (bench): a red lunge streak from the attacker to the hero
  lunge(from, to) { this.lunges.push({ from: from.clone(), to: to.clone(), t: 0 }); }
  // the rules' playerHit: blocked opens the counter window (readyDuration)
  struck(hero, from, blocked, readyDuration) {
    this.dir.set(from.x - hero.x, 0, from.z - hero.z).normalize();
    const at = this.three[0].set(hero.x + this.dir.x * 0.75, 1.25, hero.z + this.dir.z * 0.75);
    if (blocked) {
      this.burst(at, this.dir, 1.3, 0.3, GOLD, GOLD_GLOW);
      this.ring(at, this.dir, 0.15, 1.0, 0.25, 0.06, GOLD, GOLD_GLOW);
      for (let i = 0; i < 14; i++) { // the guard wall breaks into shards
        const r = this.rnd, a = Math.atan2(this.dir.x, this.dir.z) + (r() - 0.5) * this.guardArc, h = 0.3 + r() * 1.5;
        this.shards.push({ p: new THREE.Vector3(hero.x + Math.sin(a) * 0.85, h, hero.z + Math.cos(a) * 0.85), v: new THREE.Vector3(Math.sin(a) * (1 + r() * 2), 1 + r() * 2, Math.cos(a) * (1 + r() * 2)), spin: r() * 6.28, rate: (r() - 0.5) * 18, len: 0.08 + r() * 0.08, life: 0, max: 0.4 + r() * 0.2 });
      }
      this.guardT = this.guardDur; this.readyT = 0; this.readyDur = readyDuration;
      this.onShake?.(0.05, 0.12);
    } else this.burst(this.three[1].set(hero.x, 1.1, hero.z), this.dir, 0.9, 0.22, RED, RED_GLOW);
  }
  counter(hit) { this.readyT = this.readyDur; if (hit) this.onShake?.(0.06, 0.14); }
  hit(center, fromX, fromZ) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / l, 0, dz / l);
    this.burst(center, this.dir, 1.05, 0.28, GOLD, GOLD_GLOW);
  }
  // hero: {x, z, facing}; blade: [base, tip] world points of the sword
  update(dt, hero, bladeBase, bladeTip) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three, two = this.two;
    // guard: a curved wall of light in front, a few stacked arcs, shimmering
    if (this.guardT < this.guardDur) {
      this.guardT += dt;
      const u = this.guardT / this.guardDur, rise = Math.min(1, this.guardT / 0.08), fade = 1 - Math.max(0, (u - 0.75) / 0.25);
      for (let row = 0; row < WALL_ROWS; row++) {
        const h = 0.25 + (row / (WALL_ROWS - 1)) * 1.5 * rise, sub = this.sub; sub.length = 0;
        for (let i = 0; i < ARC_PTS; i++) { const a = hero.facing - this.guardArc / 2 + (i / (ARC_PTS - 1)) * this.guardArc; this.pts[i].set(hero.x + Math.sin(a) * 0.85, h, hero.z + Math.cos(a) * 0.85); sub.push(this.pts[i]); }
        stripW = (row === WALL_ROWS - 1 || row === 0 ? 0.08 : 0.045) * (0.9 + 0.1 * Math.sin(this.t * 30 + row));
        this.glow.strip(sub, arcGlowW, 0.9 * fade, GLOW); this.core.strip(sub, arcW, 0.95 * fade, EDGE);
      }
    }
    // counter window: a gold ring pulsing at the feet and a gold blade
    if (this.readyT < this.readyDur) {
      this.readyT += dt;
      const fade = Math.min(1, (this.readyDur - this.readyT) / 0.2), pulse = 0.8 + 0.2 * Math.sin(this.t * 14), sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].set(hero.x + Math.sin(a) * 0.7, 0.05, hero.z + Math.cos(a) * 0.7); sub.push(this.pts[i]); }
      stripW = 0.06 * pulse; this.glow.strip(sub, lineGlowW, 0.8 * fade, GOLD_GLOW); this.core.strip(sub, lineW, fade, GOLD);
      two[0].copy(bladeBase); two[1].copy(bladeTip);
      stripW = 0.07 * pulse; this.glow.strip(two, lineGlowW, 0.9 * fade, GOLD_GLOW); this.core.strip(two, lineW, 0.8 * fade, GOLD);
    }
    for (const l of this.lunges) {
      l.t += dt;
      const u = l.t / 0.2, head = Math.min(1, l.t / 0.08);
      three[0].copy(l.from).lerp(l.to, Math.max(0, head - 0.5)); three[2].copy(l.from).lerp(l.to, head); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = 0.12 * (1 - u);
      this.glow.strip(three, taperGlowW, 0.9 * (1 - u), RED_GLOW); this.core.strip(three, taperW, 1 - u, RED);
    }
    compact(this.lunges, this.lungeAlive);
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      placeV(b.sp, b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), b.glow); this.core.strip(three, taperW, 1 - k * k, b.edge);
      }
    }
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u)), sub = this.sub; sub.length = 0;
      this.u.crossVectors(g.n, this.up).normalize(); this.v.crossVectors(g.n, this.u).normalize();
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].copy(g.c).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad); sub.push(this.pts[i]); }
      stripW = g.w * (1 - u * 0.5);
      this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), g.glowCol); this.core.strip(sub, lineW, 1 - u, g.col);
    }
    compact(this.rings, this.ringAlive);
    for (const s of this.shards) {
      s.life += dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); s.spin += s.rate * dt;
      const u = s.life / s.max;
      if (u >= 1) continue;
      const cx = Math.cos(s.spin) * s.len, cy = Math.sin(s.spin) * s.len;
      three[0].set(s.p.x - cx, s.p.y - cy, s.p.z); three[2].set(s.p.x + cx, s.p.y + cy, s.p.z); three[1].copy(three[0]).lerp(three[2], 0.35);
      stripW = 0.08 * (1 - u * 0.5);
      this.glow.strip(three, shardW, 0.5 * (1 - u), GLOW); this.core.strip(three, shardW, 1 - u * u, EDGE);
    }
    compact(this.shards, this.shardAlive);
    this.core.end(); this.glow.end();
  }
  get ready() { return this.readyT < this.readyDur; }
  clear() {
    this.guardT = this.guardDur = 0; this.readyT = this.readyDur = 0;
    for (const b of this.bursts) { b.t = 9; b.sp.visible = false; }
    this.lunges.length = 0; this.rings.length = 0; this.shards.length = 0;
  }
}
