// Breakbeat Slam (mace), in the bench's light-and-ribbon language. The bench dummies take turns
// winding up (sandbox), shown by a red "!" over the head and a red ring filling at the feet; that is
// the moment to slam. The slam lands on the rules' 'slash' contact: a heavy ground impact in front
// (a glow that pops, upward rays, two shock rings racing out over the 65 degree cone) and a hard
// burst on each struck target. A target interrupted mid wind-up has its "!" shatter into shards and
// is stunned for the rules' time: little stars of light circle its head. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';

const EDGE = [1.0, 0.93, 0.7], GLOW = [0.95, 0.65, 0.25], WARN = [1.0, 0.25, 0.15], WARN_GLOW = [0.9, 0.12, 0.05];
const BURSTS = 6, RAYS = 10, RING_PTS = 25, ICONS = 6, STARS = 4;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.98,0.92), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const shardW = (x) => stripW * (x < 0.35 ? x / 0.35 : (1 - x) / 0.65);

function canvasTexture(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); }
const glowTex = () => canvasTexture((g) => {
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,235,1)'); grad.addColorStop(0.25, 'rgba(255,215,150,0.7)'); grad.addColorStop(0.6, 'rgba(255,160,70,0.18)'); grad.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
});
// a red warning "!" in a rounded diamond, dark outline (anime UI icon)
const warnTex = () => canvasTexture((g) => {
  g.beginPath(); g.moveTo(64, 8); g.quadraticCurveTo(70, 8, 118, 58); g.quadraticCurveTo(122, 64, 118, 70); g.lineTo(70, 118); g.quadraticCurveTo(64, 124, 58, 118); g.lineTo(10, 70); g.quadraticCurveTo(4, 64, 10, 58); g.lineTo(58, 10); g.quadraticCurveTo(62, 6, 64, 8); g.closePath();
  g.fillStyle = '#ff3b2a'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#5a0a05'; g.stroke();
  g.fillStyle = '#fff4e8'; g.beginPath(); g.moveTo(54, 30); g.lineTo(74, 30); g.lineTo(69, 76); g.lineTo(59, 76); g.closePath(); g.fill();
  g.beginPath(); g.arc(64, 92, 9, 0, 6.283); g.fill();
});
// a small four-point star for the stun
const starTex = () => canvasTexture((g) => {
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 - Math.PI / 2, r = i % 2 ? 18 : 56; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#fff1a0'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#8a5a00'; g.stroke();
});

export class MaceFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const sprite = (map, opts, order) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true, ...opts })); sp.visible = false; sp.renderOrder = order; scene.add(sp); return sp; };
    const g = glowTex(), w = warnTex(), st = starTex();
    this.bursts = Array.from({ length: BURSTS }, () => ({ sp: sprite(g, { blending: THREE.AdditiveBlending }, 9), t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) }));
    this.icons = Array.from({ length: ICONS }, () => ({ sp: sprite(w, { depthTest: false, toneMapped: false }, 10), id: null, t: 0, total: 1 }));
    this.stars = Array.from({ length: ICONS * STARS }, () => sprite(st, { depthTest: false, toneMapped: false }, 10));
    this.stunned = []; this.rings = []; this.shards = [];
    this.burstI = 0; this.rnd = mulberry32(47); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.dir = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.ringAlive = (r) => r.life < r.max; this.shardAlive = (s) => s.life < s.max; this.stunAlive = (s) => s.t < s.duration;
    this.onShake = null;
  }
  burst(pos, dir, size, life, upward) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos);
    b.rays.forEach((ray, k) => {
      if (upward) { const a = r() * 6.283, el = 0.45 + r() * 1.0; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.6 + r() * 0.7); }
      else if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.6, (r() - 0.2) * 0.6, dir.z + (r() - 0.5) * 0.6).normalize(); ray.len = size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  // a ground shock ring over an arc (or a full circle when arc >= 2 pi), centred on c
  ring(c, angle, arc, r0, r1, max, w, col, glowCol) { if (this.rings.length < 16) this.rings.push({ c: c.clone(), angle, arc, r0, r1, life: 0, max, w, col, glowCol }); }
  shard(p, col) {
    const r = this.rnd, a = r() * 6.283, s = 1.5 + r() * 2;
    if (this.shards.length < 120) this.shards.push({ p: p.clone(), v: new THREE.Vector3(Math.cos(a) * s, 1.5 + r() * 2.5, Math.sin(a) * s), spin: r() * 6.28, rate: (r() - 0.5) * 20, len: 0.08 + r() * 0.08, life: 0, max: 0.4 + r() * 0.2, col });
  }
  // a dummy starts winding up (sandbox benchWindup)
  windup(id, total) { const ic = this.icons.find((x) => x.id === null || x.id === id); if (ic) { ic.id = id; ic.t = 0; ic.total = total; } }
  windupEnd(id) { for (const ic of this.icons) if (ic.id === id) { ic.id = null; ic.sp.visible = false; } }
  // the slam's contact: x, z, facing, the skill's range and arc
  slam(x, z, angle, range, arcDeg) {
    this.dir.set(Math.sin(angle), 0, Math.cos(angle));
    const at = this.three[0].set(x + this.dir.x * 1.1, 0.08, z + this.dir.z * 1.1);
    this.burst(at, this.dir, 1.3, 0.3, true);
    const arc = (arcDeg * Math.PI) / 180, c = this.three[1].set(x, 0.06, z);
    this.ring(c, angle, arc * 1.15, 0.6, range * 1.1, 0.3, 0.11, EDGE, GLOW);
    this.ring(c, angle, arc * 1.15, 0.4, range * 0.75, 0.38, 0.06, EDGE, GLOW);
    this.ring(at, 0, 7, 0.1, 1.0, 0.25, 0.07, EDGE, GLOW);
    this.onShake?.(0.1, 0.25);
  }
  // a struck target; interrupted: it was winding up and is now stunned for duration
  hit(center, fromX, fromZ) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / l, 0, dz / l);
    this.burst(center, this.dir, 1.0, 0.28, false);
  }
  interrupted(id, head, duration) {
    for (const ic of this.icons) if (ic.id === id) {
      for (let i = 0; i < 10; i++) this.shard(ic.sp.position, WARN); // the "!" shatters
      ic.id = null; ic.sp.visible = false;
    }
    this.stunned = this.stunned.filter((s) => s.id !== id);
    this.stunned.push({ id, head, t: 0, duration });
    this.onShake?.(0.05, 0.12);
  }
  update(dt, headOf) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three;
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.sp.visible = k < 1;
      if (!b.sp.visible) continue;
      b.sp.position.copy(b.pos); b.sp.scale.setScalar(b.size * (0.9 + 1.4 * Math.sqrt(k))); b.sp.material.opacity = 1 - k * k;
      const out = Math.min(1, k * 3.5), inner = Math.max(0, k * 1.4 - 0.3);
      for (const ray of b.rays) {
        three[0].copy(b.pos).addScaledVector(ray.d, ray.len * inner * 0.9); three[2].copy(b.pos).addScaledVector(ray.d, ray.len * out); three[1].copy(three[0]).lerp(three[2], 0.5);
        stripW = 0.09 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), GLOW); this.core.strip(three, taperW, 1 - k * k, EDGE);
      }
    }
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u)), sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = g.angle - g.arc / 2 + (i / (RING_PTS - 1)) * g.arc; this.pts[i].set(g.c.x + Math.sin(a) * rad, g.c.y, g.c.z + Math.cos(a) * rad); sub.push(this.pts[i]); }
      stripW = g.w * (1 - u * 0.5);
      this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), g.glowCol); this.core.strip(sub, lineW, 1 - u, g.col);
    }
    compact(this.rings, this.ringAlive);
    for (const s of this.shards) {
      s.life += dt; s.v.y -= 11 * dt; s.p.addScaledVector(s.v, dt); s.spin += s.rate * dt;
      const u = s.life / s.max;
      if (u >= 1) continue;
      const cx = Math.cos(s.spin) * s.len, cy = Math.sin(s.spin) * s.len;
      three[0].set(s.p.x - cx, s.p.y - cy, s.p.z); three[2].set(s.p.x + cx, s.p.y + cy, s.p.z); three[1].copy(three[0]).lerp(three[2], 0.35);
      stripW = 0.09 * (1 - u * 0.5);
      this.glow.strip(three, shardW, 0.5 * (1 - u), WARN_GLOW); this.core.strip(three, shardW, 1 - u * u, s.col);
    }
    compact(this.shards, this.shardAlive);
    // wind-up warnings: a "!" over the head (pulsing faster as the attack nears) and a filling red ring
    for (const ic of this.icons) {
      if (ic.id === null) continue;
      const head = headOf(ic.id); if (!head) continue;
      ic.t += dt;
      const u = Math.min(1, ic.t / ic.total), pop = Math.min(1, ic.t / 0.12);
      ic.sp.visible = true; ic.sp.position.set(head.x, head.y + 0.35, head.z);
      ic.sp.scale.setScalar(0.5 * (0.6 + 0.4 * pop) * (1 + 0.08 * Math.sin(ic.t * (8 + 16 * u))));
      const sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283 * u; this.pts[i].set(head.x + Math.sin(a) * 0.55, 0.05, head.z + Math.cos(a) * 0.55); sub.push(this.pts[i]); }
      stripW = 0.05; this.glow.strip(sub, lineGlowW, 0.7, WARN_GLOW); this.core.strip(sub, lineW, 0.9, WARN);
    }
    // stun: stars circling the head
    let n = 0;
    for (const s of this.stunned) {
      s.t += dt;
      const head = headOf(s.id) || s.head, fade = Math.min(1, (s.duration - s.t) / 0.15);
      for (let k = 0; k < STARS && n < this.stars.length; k++) {
        const sp = this.stars[n++], a = s.t * 7 + k * (6.283 / STARS);
        sp.visible = true; sp.position.set(head.x + Math.cos(a) * 0.38, head.y + 0.22 + Math.sin(a * 2) * 0.04, head.z + Math.sin(a) * 0.38);
        sp.scale.setScalar(0.3 * Math.min(1, s.t / 0.1) * (0.85 + 0.15 * Math.sin(this.t * 20 + k))); sp.material.opacity = Math.max(0, fade);
      }
    }
    for (let i = n; i < this.stars.length; i++) this.stars[i].visible = false;
    compact(this.stunned, this.stunAlive);
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const b of this.bursts) { b.t = 9; b.sp.visible = false; }
    for (const ic of this.icons) { ic.id = null; ic.sp.visible = false; }
    for (const sp of this.stars) sp.visible = false;
    this.stunned.length = 0; this.rings.length = 0; this.shards.length = 0;
  }
}
