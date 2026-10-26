// Thunder Arrow (bench fusion: Hunter's Shot + Chain Spark): its own look for the draw and the flight;
// the chain on the hit is Chain Spark's own lightning, started at the struck target (skill-fx.js).
// Cast: through Hunter's Shot's own short cast, jagged arcs crackle round the drawn arrow with a cold
// glow at the nock (the fusion has no charge of its own). Flight: three jagged strands of lightning wrap the arrow's shaft and trail
// behind its head, re-struck every few frames, with a bright head glow and sparks shed behind it.
// Principles from docs/VFX-REFERENCE.md (lightning: a narrow bright core with a soft glow, short
// crackling re-strikes, sparks as secondary accents). Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from '../render/skillfx/fx-common.js';

const CORE = [0.85, 0.95, 1.0], GLOW = [0.35, 0.6, 1.0];
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard; vec3 c = d < 0.35 ? vec3(1.0) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.4)*0.7; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
const ARCS = 6, ARC_PTS = 6, STRANDS = 3, STRAND_PTS = 9;
let sw = 0;
const coreW = (x) => sw * (1 - x * 0.6), glowW = (x) => coreW(x) * 3.2;
const tailW = (x) => sw * x, tailGlowW = (x) => tailW(x) * 3.2; // thin at the back, full at the head (last point)

export class ThunderArrowFx {
  constructor(scene, camera, particles) {
    this.core = new Ribbon(scene, camera, 2000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.particles = particles;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(160,200,255,0.6)'); grad.addColorStop(1, 'rgba(80,140,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const mat = () => new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.nock = new THREE.Sprite(mat()); this.nock.visible = false; this.nock.renderOrder = 10; scene.add(this.nock);
    this.heads = Array.from({ length: 4 }, () => { const s = new THREE.Sprite(mat()); s.visible = false; s.renderOrder = 10; scene.add(s); return s; });
    this.rnd = mulberry32(17); this.charge = null; this.t = 0; this.restrike = 0; this.seed = 1;
    this.pts = Array.from({ length: Math.max(ARC_PTS, STRAND_PTS) }, () => new THREE.Vector3()); this.view = [];
    this.dir = new THREE.Vector3(); this.side = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.p = new THREE.Vector3(); this.q = new THREE.Vector3();
  }
  beginCharge(total) { this.charge = { t: 0, total }; }
  release() { this.charge = null; this.nock.visible = false; }
  cancel() { this.release(); }
  // a jagged line from a to b (seeded), into this.view
  zig(a, b, seed, amp, n) {
    const r = mulberry32(seed), view = this.view; view.length = 0;
    this.dir.subVectors(b, a); const len = this.dir.length() || 1;
    this.side.crossVectors(this.dir, this.up).normalize(); if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), j = i === 0 || i === n - 1 ? 0 : 1;
      const p = this.pts[i].copy(a).addScaledVector(this.dir, u);
      p.addScaledVector(this.side, (r() - 0.5) * amp * len * j).y += (r() - 0.5) * amp * len * j;
      view.push(p);
    }
    return view;
  }
  /** tip: the drawn arrow's point (world); kind: the recipe id its arrows carry (pr.fusion) */
  update(dt, projectiles, kind, tip) {
    this.t += dt;
    this.restrike -= dt;
    if (this.restrike <= 0) { this.restrike = 1 / 24; this.seed = (this.seed * 16807) % 2147483647; }
    this.core.begin(); this.glow.begin();
    const r = this.rnd;
    // the draw: arcs crackle round the arrow at the bow, more and brighter as it fills
    if (this.charge && this.charge.t >= this.charge.total) this.release();
    if (this.charge && tip) {
      const c = this.charge; c.t += dt;
      const k = Math.min(1, c.t / c.total), n = 2 + Math.floor(k * (ARCS - 2));
      for (let i = 0; i < n; i++) {
        const sd = this.seed + i * 977, rr = mulberry32(sd), a = rr() * 6.283, el = (rr() - 0.5) * 1.6, L = 0.18 + rr() * 0.3 * (0.5 + k);
        this.p.set(tip.x + Math.cos(a) * Math.cos(el) * L, tip.y + Math.sin(el) * L, tip.z + Math.sin(a) * Math.cos(el) * L);
        const v = this.zig(tip, this.p, sd, 0.35, ARC_PTS);
        sw = 0.03 + 0.02 * k;
        this.glow.strip(v, glowW, 0.6 + 0.4 * k, GLOW); this.core.strip(v, coreW, 0.7 + 0.3 * k, CORE);
      }
      this.nock.visible = true; this.nock.position.copy(tip); this.nock.scale.setScalar(0.35 + 0.55 * k + 0.08 * Math.sin(this.t * 60));
      this.nock.material.opacity = 0.6 + 0.4 * k;
    }
    // the flight: strands wrapping the shaft and trailing behind the head
    let h = 0;
    for (const pr of projectiles) {
      if (!kind || pr.fusion !== kind) continue; // no recipe: plain arrows stay plain
      const sp = Math.hypot(pr.vx, pr.vz) || 1, dx = pr.vx / sp, dz = pr.vz / sp, y = pr.y ?? 1;
      const head = this.p.set(pr.x + dx * 0.35, y, pr.z + dz * 0.35);
      const back = this.q.set(pr.x - dx * 1.5, y, pr.z - dz * 1.5);
      for (let s = 0; s < STRANDS; s++) {
        const v = this.zig(back, head, this.seed + s * 131 + pr.id * 7, 0.12, STRAND_PTS);
        sw = 0.07 - s * 0.015;
        this.glow.strip(v, tailGlowW, 0.9, GLOW); this.core.strip(v, tailW, 1, CORE);
      }
      if (h < this.heads.length) { const s = this.heads[h++]; s.visible = true; s.position.copy(head); s.scale.setScalar(0.7 + 0.1 * Math.sin(this.t * 50)); }
      const P = this.particles?.();
      if (P && r() < 0.8) P.fx.add(pr.x - dx * 0.4, y + (r() - 0.5) * 0.3, pr.z - dz * 0.4, (r() - 0.5) * 2 - dx * 2, (r() - 0.3) * 2, (r() - 0.5) * 2 - dz * 2, { color: 0xbfe0ff, size: 0.12, sizeEnd: 0.02, life: 0.2, drag: 3 });
    }
    for (; h < this.heads.length; h++) this.heads[h].visible = false;
    this.core.end(); this.glow.end();
  }
  clear() { this.release(); for (const s of this.heads) s.visible = false; }
}
