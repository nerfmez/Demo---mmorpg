// Rapid Volley (bows: five arrows loosed 0.12 s apart along the facing, the hero down on one knee), held
// to the owner's bar (.claude/skills/skill-vfx). Owner: a cooldown skill must be grander than a main
// skill, and each arrow should fly like a ball of wind splitting the air. The arrows themselves are the
// game's arrow meshes (vfx.js); this wraps each in wind:
//  - on each loose: a ring of pushed air bursts round the shot's line just ahead of the bow (standing
//    across the shot, like a sonic ring) and speed lines are thrown forward;
//  - in flight: a cone of split air rides on the arrow's head (a see-through paraboloid shell whose
//    spiral bands of wind swirl back along it, bright at its rim), two spirals of wind wind round the
//    arrow's path behind it and a thin streak runs down the middle;
//  - on each hit: a gust bursts on the target (rays thrown on along the shot, a ring across the shot).
// Positions come from the rules' projectiles and 'hit' events. Six pooled cone meshes and one ribbon
// pair: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, tailW, tailGlowW, taperW, taperGlowW } from './light-kit.js';

const LOOK = { edge: [0.9, 1.0, 1.0], glow: [0.25, 0.8, 0.95] };
const SHOTS = 6, HIST = 12, FLICKS = 6, BURSTS = 6, LINES = 5, RAYS = 7, RING = 21, SPIRALS = 2;
const FADE = 0.18, FLICK = 0.2, BURST = 0.26, Y = 1.0, CONE_L = 1.5, CONE_R = 0.42;
const CONE_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// spiral bands of wind carried back along the shell, bright at the rim, fading off its open end; drawn
// over the scene (not added to it) so it stays white-cyan on any ground
const CONE_FS = `varying vec2 vUv; varying float vFres; uniform float uT; uniform float uA;
  ${NOISE}
  void main(){
    float v = vUv.y, ang = vUv.x * 6.2832 + v * 2.5 - uT * 5.0; // round a circle: no seam where the lathe closes
    float sw = fbm(vec2(cos(ang), sin(ang)) * 1.2 + (v * 3.0 - uT * 9.0) * vec2(0.8, 0.6));
    float bands = smoothstep(0.42, 0.72, sw);
    float a = (pow(vFres, 1.4) * 0.75 + bands * 0.55) * smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.45, 1.0, v));
    vec3 c = mix(vec3(0.55, 0.9, 1.0), vec3(1.0), clamp(bands + vFres * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
const out2 = (k) => 1 - (1 - k) * (1 - k);

// the shell: a paraboloid opening backward from its point (the arrow's head) along -Z
function coneGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector2(0.02 + CONE_R * Math.sqrt(u), -CONE_L * u)); }
  const g = new THREE.LatheGeometry(pts, 20).rotateX(Math.PI / 2); // +Y (the point) to +Z
  g.userData.shared = true; return g;
}

export class VolleyFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(29); this.time = 0;
    this.core = new Ribbon(scene, camera, 2500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const geo = coneGeometry();
    this.shots = Array.from({ length: SHOTS }, () => {
      const cone = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 } }, vertexShader: CONE_VS, fragmentShader: CONE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      cone.visible = false; cone.renderOrder = 7; scene.add(cone);
      return { id: null, live: false, n: 0, fade: 1, t: 0, dx: 0, dz: 1, cone, hist: Array.from({ length: HIST }, () => new THREE.Vector3()), view: [], spiral: Array.from({ length: HIST }, () => new THREE.Vector3()) };
    });
    const fx = () => ({ t: 9, x: 0, z: 0, dx: 0, dz: 1, y: Y, a: Array.from({ length: Math.max(LINES, RAYS) }, () => ({ o: 0, s: 0, h: 0, len: 1, ang: 0 })) });
    this.flicks = Array.from({ length: FLICKS }, fx); this.flickI = 0;
    this.bursts = Array.from({ length: BURSTS }, fx); this.burstI = 0;
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  // the rules' live projectiles: a new rapid_volley arrow bursts air at the bow; every one rides its wind
  syncProjectiles(projectiles, kind) {
    for (const s of this.shots) s.live = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      let s = null, free = null;
      for (const q of this.shots) { if (q.id === pr.id) s = q; else if (q.id === null && !free) free = q; }
      const sp = Math.hypot(pr.vx, pr.vz) || 1;
      if (!s) {
        if (!free) continue;
        s = free; s.id = pr.id; s.n = 0; s.fade = 1; s.t = 0;
        this.flick(pr.x, pr.z, pr.vx / sp, pr.vz / sp, pr.y ?? Y);
      }
      s.live = true; s.dx = pr.vx / sp; s.dz = pr.vz / sp;
      for (let i = HIST - 1; i > 0; i--) s.hist[i].copy(s.hist[i - 1]);
      s.hist[0].set(pr.x, pr.y ?? Y, pr.z); s.n = Math.min(HIST, s.n + 1);
    }
    for (const s of this.shots) if (!s.live && s.id !== null && s.fade >= 1) s.fade = 0; // gone: its wind fades
  }
  flick(x, z, dx, dz, y) {
    const f = this.flicks[this.flickI++ % FLICKS], r = this.rnd;
    f.t = 0; f.x = x; f.z = z; f.dx = dx; f.dz = dz; f.y = y;
    for (let i = 0; i < LINES; i++) { const l = f.a[i], a = (i / LINES) * 6.283 + r() * 0.5; l.s = Math.cos(a) * 0.35; l.h = Math.sin(a) * 0.3; l.o = r() * 0.2; l.len = 1.2 + r() * 0.8; }
  }
  // a struck target's centre; (dx, dz) the shot's direction
  hit(c, dx, dz) {
    const b = this.bursts[this.burstI++ % BURSTS], r = this.rnd, l0 = Math.hypot(dx, dz) || 1;
    b.t = 0; b.x = c.x; b.z = c.z; b.y = c.y; b.dx = dx / l0; b.dz = dz / l0;
    const base = Math.atan2(b.dx, b.dz);
    for (let i = 0; i < RAYS; i++) { const q = b.a[i]; q.ang = i < 4 ? base + (r() - 0.5) * 1.0 : r() * 6.283; q.len = i < 4 ? 1.5 + r() * 0.7 : 0.6 + r() * 0.4; }
  }
  // a ring standing across the shot's line (dx, dz) at (x, y, z), radius rr
  crossRing(x, y, z, dx, dz, rr) {
    const px = dz, pz = -dx;
    for (let i = 0; i < RING; i++) { const a = (i / (RING - 1)) * Math.PI * 2, c = Math.cos(a) * rr; this.ring[i].set(x + px * c, y + Math.sin(a) * rr, z + pz * c); }
    return this.ring;
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const three = this.three;
    for (const s of this.shots) {
      if (s.id === null) continue;
      if (!s.live) { s.fade += dt / FADE; if (s.fade >= 1) { s.id = null; s.cone.visible = false; continue; } }
      s.t += dt;
      const al = s.live ? Math.min(1, s.t / 0.05) : 1 - s.fade, head = s.hist[0];
      // the cone of split air on the arrow's head
      s.cone.visible = true; s.cone.position.set(head.x + s.dx * 0.35, head.y, head.z + s.dz * 0.35); s.cone.rotation.set(0, Math.atan2(s.dx, s.dz), 0);
      s.cone.scale.setScalar(s.live ? 0.7 + 0.3 * Math.min(1, s.t / 0.08) : 1 + 0.5 * s.fade);
      s.cone.material.uniforms.uT.value = this.time; s.cone.material.uniforms.uA.value = al;
      if (s.n < 2) continue;
      // the streak down the middle
      const view = s.view; view.length = 0;
      for (let i = s.n - 1; i >= 0; i--) view.push(s.hist[i]); // tail first, head last
      W.v = 0.08; this.glow.strip(view, tailGlowW, 0.6 * al, LOOK.glow); this.core.strip(view, tailW, al, LOOK.edge);
      // two spirals of wind round the path behind the arrow, widest at the head
      const px = s.dz, pz = -s.dx;
      for (let k = 0; k < SPIRALS; k++) {
        view.length = 0;
        for (let i = s.n - 1; i >= 0; i--) {
          const q = i / (HIST - 1), rr = CONE_R * 0.85 * (1 - 0.75 * q), ph = i * 0.85 - this.time * 24 + k * Math.PI, c = Math.cos(ph) * rr;
          view.push(s.spiral[i].set(s.hist[i].x + px * c, s.hist[i].y + Math.sin(ph) * rr, s.hist[i].z + pz * c));
        }
        W.v = 0.06; this.glow.strip(view, tailGlowW, 0.5 * al, LOOK.glow); this.core.strip(view, tailW, 0.9 * al, LOOK.edge);
      }
    }
    // at the bow: the ring of air standing across the shot, speed lines thrown forward round the line
    for (const f of this.flicks) {
      if (f.t >= FLICK) continue;
      f.t += dt; const k = f.t / FLICK, px = f.dz, pz = -f.dx;
      for (let i = 0; i < LINES; i++) {
        const l = f.a[i], d0 = 0.4 + l.o + 1.8 * out2(k), d1 = d0 + l.len * (1 - k);
        three[0].set(f.x + f.dx * d0 + px * l.s, f.y + l.h, f.z + f.dz * d0 + pz * l.s);
        three[2].set(f.x + f.dx * d1 + px * l.s, f.y + l.h, f.z + f.dz * d1 + pz * l.s);
        three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.08 * (1 - k); this.glow.strip(three, taperGlowW, 0.7 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
      const d = 0.6 + 0.9 * out2(k);
      this.crossRing(f.x + f.dx * d, f.y, f.z + f.dz * d, f.dx, f.dz, 0.2 + 0.55 * out2(k));
      W.v = 0.1 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.6 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 0.95 * (1 - k), LOOK.edge);
    }
    // the gusts on the targets
    for (const b of this.bursts) {
      if (b.t >= BURST) continue;
      b.t += dt; const k = b.t / BURST;
      for (let i = 0; i < RAYS; i++) {
        const q = b.a[i], sx = Math.sin(q.ang), sz = Math.cos(q.ang), d0 = 0.1 + q.len * 0.5 * k, d1 = 0.2 + q.len * out2(Math.min(1, k * 2.5));
        three[0].set(b.x + sx * d0, b.y, b.z + sz * d0); three[2].set(b.x + sx * d1, b.y, b.z + sz * d1); three[1].copy(three[0]).lerp(three[2], 0.5);
        W.v = 0.13 * (1 - k); this.glow.strip(three, taperGlowW, 0.8 * (1 - k), LOOK.glow); this.core.strip(three, taperW, 1 - k * k, LOOK.edge);
      }
      this.crossRing(b.x + b.dx * 0.3 * k, b.y, b.z + b.dz * 0.3 * k, b.dx, b.dz, 0.25 + 0.75 * out2(k));
      W.v = 0.1 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.6 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 0.9 * (1 - k), LOOK.edge);
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const s of this.shots) { s.id = null; s.live = false; s.cone.visible = false; }
    for (const f of this.flicks) f.t = 9; for (const b of this.bursts) b.t = 9;
  }
  get busy() { return this.shots.some((s) => s.id !== null) || this.flicks.some((f) => f.t < FLICK) || this.bursts.some((b) => b.t < BURST); }
}
