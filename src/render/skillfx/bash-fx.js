// Shield Bash, in the bench's light-and-ribbon language. On the rules' 'slash' contact a disc of
// light the size of a shield punches forward from the shield arm (two rings racing out, standing
// upright and facing the bash) with a cone shock ring over the 90 degree arc on the ground. Each
// struck target gets a hard burst and leaves a fading skid streak on the ground as the rules' knock
// slides it back; the taunt (the rules' 3 s) shows as a red anger mark over its head and a red ring
// at its feet, pulsing until it ends. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV } from './fx-common.js';

const EDGE = [0.85, 0.93, 1.0], GLOW = [0.4, 0.62, 1.0], RED = [1.0, 0.3, 0.22], RED_GLOW = [0.9, 0.1, 0.05];
const BURSTS = 6, RAYS = 10, RING_PTS = 25, MARKS = 6;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.97), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const taperW = (x) => stripW * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
const skidW = (x) => stripW * x;

function canvasTexture(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); }

export class BashFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const glowTex = canvasTexture((g) => { const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128); });
    // an anime anger mark: four curved red veins meeting in a cross, dark outline
    const angerTex = canvasTexture((g) => {
      g.lineCap = 'round';
      const vein = (rot) => { g.save(); g.translate(64, 64); g.rotate(rot); g.beginPath(); g.moveTo(14, -8); g.quadraticCurveTo(30, -10, 44, -34); g.moveTo(14, 8); g.quadraticCurveTo(10, 30, 34, 44); g.restore(); };
      for (const [w, c] of [[20, '#4a0805'], [11, '#ff3b2a']]) { g.lineWidth = w; g.strokeStyle = c; for (let k = 0; k < 4; k++) { vein((k * Math.PI) / 2); g.stroke(); } }
    });
    this.bursts = Array.from({ length: BURSTS }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; sp.renderOrder = 9; scene.add(sp);
      return { sp, t: 9, life: 0.3, size: 1, pos: new THREE.Vector3(), rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })) };
    });
    this.marks = Array.from({ length: MARKS }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex, depthWrite: false, depthTest: false, transparent: true, toneMapped: false })); sp.visible = false; sp.renderOrder = 10; scene.add(sp); return sp; });
    this.burstI = 0; this.rings = []; this.skids = []; this.taunts = []; this.rnd = mulberry32(71); this.t = 0;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.pts = Array.from({ length: RING_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.u = new THREE.Vector3(); this.v = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.ringAlive = (r) => r.life < r.max; this.skidAlive = (s) => s.t < 0.5; this.tauntAlive = (s) => s.t < s.duration;
    this.onShake = null;
  }
  burst(pos, dir, size, life) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd;
    b.t = 0; b.size = size; b.life = life; b.pos.copy(pos);
    b.rays.forEach((ray, k) => {
      if (k < 4) { ray.d.set(dir.x + (r() - 0.5) * 0.6, (r() - 0.3) * 0.6, dir.z + (r() - 0.5) * 0.6).normalize(); ray.len = size * (1.2 + r() * 0.6); }
      else { const a = r() * 6.283, el = (r() - 0.3) * 1.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = size * (0.45 + r() * 0.35); }
    });
  }
  // rings: upright (normal = the bash direction) or flat over an arc on the ground (normal = up)
  ring(c, normal, angle, arc, r0, r1, max, w, col, glowCol) { if (this.rings.length < 16) this.rings.push({ c: c.clone(), n: normal.clone(), angle, arc, r0, r1, life: 0, max, w, col, glowCol }); }
  // the rules' contact: hero x, z, facing, the skill's range and arc
  bash(x, z, angle, range, arcDeg) {
    this.dir.set(Math.sin(angle), 0, Math.cos(angle));
    const at = this.three[0].set(x + this.dir.x * 0.75, 1.15, z + this.dir.z * 0.75);
    this.burst(at, this.dir, 0.8, 0.22);
    this.ring(at, this.dir, 0, 6.283, 0.25, 0.85, 0.22, 0.07, EDGE, GLOW);
    this.ring(at.clone().addScaledVector(this.dir, 0.3), this.dir, 0, 6.283, 0.15, 1.15, 0.3, 0.04, EDGE, GLOW);
    this.ring(this.three[1].set(x, 0.06, z), this.up, angle, (arcDeg * Math.PI) / 180, 0.6, range * 1.1, 0.3, 0.08, EDGE, GLOW);
    this.onShake?.(0.06, 0.16);
  }
  // a struck target: knocked back (skid from where it stood) and taunted for duration
  hit(id, center, fromX, fromZ, duration) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / l, 0, dz / l);
    this.burst(center, this.dir, 1.0, 0.26);
    this.skids.push({ id, from: new THREE.Vector3(center.x, 0.05, center.z), to: new THREE.Vector3(center.x, 0.05, center.z), t: 0 });
    this.taunts = this.taunts.filter((s) => s.id !== id);
    this.taunts.push({ id, t: 0, duration });
  }
  // a target struck by a greatshield's plain shove: the hard burst only (no knock streak, no taunt)
  strike(center, fromX, fromZ) {
    const dx = center.x - fromX, dz = center.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / l, 0, dz / l);
    this.burst(center, this.dir, 0.8, 0.22);
  }
  // posOf(id) -> the dummy's live position (x, z) or null
  update(dt, posOf) {
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
        stripW = 0.08 * b.size * (1 - k * 0.6);
        this.glow.strip(three, taperGlowW, 0.8 * (1 - k), GLOW); this.core.strip(three, taperW, 1 - k * k, EDGE);
      }
    }
    for (const g of this.rings) {
      g.life += dt;
      const u = g.life / g.max;
      if (u >= 1) continue;
      const rad = g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u)), sub = this.sub; sub.length = 0;
      const flat = g.n.y > 0.9;
      if (!flat) { this.u.crossVectors(g.n, this.up).normalize(); this.v.crossVectors(g.n, this.u).normalize(); }
      for (let i = 0; i < RING_PTS; i++) {
        const a = (flat ? g.angle - g.arc / 2 : 0) + (i / (RING_PTS - 1)) * g.arc;
        if (flat) this.pts[i].set(g.c.x + Math.sin(a) * rad, g.c.y, g.c.z + Math.cos(a) * rad);
        else this.pts[i].copy(g.c).addScaledVector(this.u, Math.cos(a) * rad).addScaledVector(this.v, Math.sin(a) * rad);
        sub.push(this.pts[i]);
      }
      stripW = g.w * (1 - u * 0.5);
      this.glow.strip(sub, lineGlowW, 0.8 * (1 - u), g.glowCol); this.core.strip(sub, lineW, 1 - u, g.col);
    }
    compact(this.rings, this.ringAlive);
    // skid streaks: from where the target stood to where the knock slides it
    for (const s of this.skids) {
      s.t += dt;
      const p = posOf(s.id); if (p) s.to.set(p.x, 0.05, p.z);
      if (s.to.distanceTo(s.from) < 0.05) continue;
      const f = 1 - s.t / 0.5;
      three[0].copy(s.from); three[2].copy(s.to); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = 0.16; this.glow.strip(three, skidW, 0.5 * f, GLOW); this.core.strip(three, skidW, 0.6 * f, EDGE);
    }
    compact(this.skids, this.skidAlive);
    // taunt: an anger mark over the head and a red ring at the feet
    let n = 0;
    for (const s of this.taunts) {
      s.t += dt;
      const p = posOf(s.id); if (!p) continue;
      const fade = Math.min(1, (s.duration - s.t) / 0.3), pop = Math.min(1, s.t / 0.12), beat = 1 + 0.12 * Math.max(0, Math.sin(this.t * 9));
      if (n < MARKS) { const sp = this.marks[n++]; sp.visible = true; place(sp, p.x + 0.28, 2.3, p.z); sp.scale.setScalar(0.42 * (0.5 + 0.5 * pop) * beat); sp.material.opacity = fade; }
      const sub = this.sub; sub.length = 0;
      for (let i = 0; i < RING_PTS; i++) { const a = (i / (RING_PTS - 1)) * 6.283; this.pts[i].set(p.x + Math.sin(a) * 0.55, 0.05, p.z + Math.cos(a) * 0.55); sub.push(this.pts[i]); }
      stripW = 0.045; this.glow.strip(sub, lineGlowW, 0.5 * fade, RED_GLOW); this.core.strip(sub, lineW, 0.8 * fade, RED);
    }
    for (let i = n; i < MARKS; i++) this.marks[i].visible = false;
    compact(this.taunts, this.tauntAlive);
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const b of this.bursts) { b.t = 9; b.sp.visible = false; }
    for (const m of this.marks) m.visible = false;
    this.rings.length = 0; this.skids.length = 0; this.taunts.length = 0;
  }
}
