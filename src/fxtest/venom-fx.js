// Venom Shot (bench trial of Venom Mire as a projectile): an anime glob of poison. The flying glob
// is a lime toon droplet in a dark violet outline, stretched along its flight and wobbling, with
// drips falling off behind it. On impact a cel splat star bursts on the target with droplets
// thrown out, and a poisoned target gives off small rising bubbles while its poison lasts.
// Positions come from the rules' projectiles and 'impact' events. Cosmetic only.
import * as THREE from 'three';
import { mulberry32, BILLBOARD_VS } from './fx-common.js';
import { toonRamp } from '../render/toon.js';

const GLOBS = 6, SPLATS = 6, DROPS = 260, BUBBLES = 140;
const SPLAT_LIFE = 0.3;

const splatFS = `varying vec2 vUv; uniform float uT; uniform float uSeed;
  void main(){
    float r = length(vUv), ang = atan(vUv.y, vUv.x);
    // a seven-point splat with uneven arms; it pops open, then thins from the middle
    float arms = pow(abs(sin(ang * 3.5 + uSeed)), 3.0) * (0.55 + 0.45 * fract(sin(floor(ang * 1.114 + 4.0) * 7.31 + uSeed) * 91.7));
    float open = min(1.0, uT / 0.25) ;
    float edge = (0.42 + 0.5 * arms) * (0.55 + 0.45 * open);
    if (r > edge) discard;
    float hole = smoothstep(0.35, 1.0, uT) * edge * 0.95;
    if (r < hole) discard;
    float e = edge - r;
    vec3 c = vec3(0.72, 0.95, 0.30);
    if (r < edge * 0.45) c = vec3(0.90, 1.0, 0.62);   // bright centre
    if (e < 0.07) c = vec3(0.36, 0.16, 0.46);         // violet outline
    gl_FragColor = vec4(c, 1.0); }`;

// drop finished items in place (no new array each frame)
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
const living = (x) => x.life < x.max;

export class VenomFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    const ramp = toonRamp(), ball = new THREE.IcosahedronGeometry(1, 2);
    const lime = new THREE.MeshToonMaterial({ color: '#b6f04c', emissive: '#3d6e10', gradientMap: ramp });
    const outline = new THREE.MeshBasicMaterial({ color: '#3a1a4a', side: THREE.BackSide });
    const shine = new THREE.MeshBasicMaterial({ color: '#f4ffd8' });
    // a few globs, reused: lime body, a dark violet back-face outline and a small shine
    this.globs = Array.from({ length: GLOBS }, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(ball, lime));
      const o = new THREE.Mesh(ball, outline); o.scale.setScalar(1.18); g.add(o);
      const s = new THREE.Mesh(ball, shine); s.scale.setScalar(0.28); s.position.set(-0.35, 0.4, 0.25); g.add(s);
      g.visible = false; scene.add(g);
      return { g, id: null, t: 0, dripAcc: 0 };
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.splats = Array.from({ length: SPLATS }, (_, k) => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: k * 1.7 } }, vertexShader: BILLBOARD_VS, fragmentShader: splatFS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m);
      return { m, t: SPLAT_LIFE };
    });
    const inst = (n, color, emissive) => {
      const m = new THREE.InstancedMesh(ball, new THREE.MeshToonMaterial({ color, emissive, gradientMap: ramp }), n);
      m.count = 0; m.frustumCulled = false; scene.add(m); return m;
    };
    this.dropMesh = inst(DROPS, '#a8e646', '#356610');
    this.bubbleMesh = inst(BUBBLES, '#c79be6', '#4a2260');
    this.drops = []; this.bubbles = []; this.rnd = mulberry32(57); this.splatI = 0;
    this.o = new THREE.Object3D(); this.dir = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.fwd = new THREE.Vector3(0, 0, 1);
  }
  drop(x, y, z, vx, vy, vz, size, max) { if (this.drops.length < DROPS) this.drops.push({ x, y, z, vx, vy, vz, size, life: 0, max }); }
  bubble(x, y, z, size) { if (this.bubbles.length < BUBBLES) this.bubbles.push({ x, y, z, size, life: 0, max: 0.6 + this.rnd() * 0.5, sway: this.rnd() * 6.28 }); }
  // projectiles: the rules' live projectiles; one glob follows each Venom Shot
  syncProjectiles(projectiles, kind, dt) {
    for (const gl of this.globs) gl.live = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      let gl = null, free = null;
      for (const x of this.globs) { if (x.id === pr.id) gl = x; else if (x.id === null && !free) free = x; }
      if (!gl) { if (!free) continue; gl = free; gl.id = pr.id; gl.t = 0; gl.dripAcc = 0; }
      gl.live = true; gl.t += dt;
      const r = this.rnd, y = 1.15, size = 0.2;
      gl.g.visible = true; gl.g.position.set(pr.x, y, pr.z);
      this.dir.set(pr.vx, 0, pr.vz).normalize();
      this.q.setFromUnitVectors(this.fwd, this.dir); gl.g.quaternion.copy(this.q);
      const w = Math.sin(gl.t * 26) * 0.08; // a wobbling droplet stretched along its flight
      gl.g.scale.set(size * (1 + w), size * (1 - w * 0.6), size * 1.45);
      gl.dripAcc += dt * 32;
      while (gl.dripAcc >= 1) {
        gl.dripAcc -= 1;
        this.drop(pr.x - this.dir.x * 0.25 + (r() - 0.5) * 0.15, y - 0.05 + (r() - 0.5) * 0.12, pr.z - this.dir.z * 0.25 + (r() - 0.5) * 0.15,
          -this.dir.x * 0.6 + (r() - 0.5) * 0.4, 0.3 + r() * 0.4, -this.dir.z * 0.6 + (r() - 0.5) * 0.4, 0.045 + r() * 0.04, 0.35 + r() * 0.2);
      }
    }
    for (const gl of this.globs) if (!gl.live && gl.id !== null) { gl.id = null; gl.g.visible = false; }
  }
  // the splat on the target, from the core 'impact' event
  impact(e) {
    const sp = this.splats[this.splatI++ % SPLATS], r = this.rnd;
    sp.t = 0; sp.m.visible = true; sp.m.position.set(e.x, 1.15, e.z); sp.m.scale.setScalar(1.5);
    sp.m.material.uniforms.uSeed.value = r() * 6.28;
    for (let i = 0; i < 18; i++) {
      const a = r() * 6.283, s = 2 + r() * 2.6;
      this.drop(e.x, 1.15, e.z, Math.cos(a) * s, 1.2 + r() * 3, Math.sin(a) * s, 0.06 + r() * 0.06, 0.5 + r() * 0.3);
    }
  }
  // a poisoned target breathes out a bubble now and then (called each frame per poisoned dummy)
  poisoned(x, z, dt) {
    if (this.rnd() < dt * 9) { const r = this.rnd, a = r() * 6.283; this.bubble(x + Math.cos(a) * 0.32, 0.8 + r() * 1.0, z + Math.sin(a) * 0.32, 0.08 + r() * 0.07); }
  }
  update(dt) {
    for (const sp of this.splats) {
      if (!sp.m.visible) continue;
      sp.t += dt; sp.m.quaternion.copy(this.camera.quaternion);
      sp.m.material.uniforms.uT.value = sp.t / SPLAT_LIFE;
      if (sp.t >= SPLAT_LIFE) sp.m.visible = false;
    }
    const o = this.o;
    let n = 0;
    for (const d of this.drops) {
      d.life += dt; d.vy -= 12 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < 0.03) { d.y = 0.03; d.vx *= 0.2; d.vz *= 0.2; d.vy = 0; }
      const u = d.life / d.max;
      if (u >= 1) continue;
      const s = d.size * (1 - u * u);
      o.position.set(d.x, d.y, d.z); o.scale.set(s, s * (d.vy < -1 ? 1.5 : d.y <= 0.03 ? 0.4 : 1), s); o.updateMatrix();
      this.dropMesh.setMatrixAt(n++, o.matrix);
    }
    this.dropMesh.count = n; this.dropMesh.instanceMatrix.needsUpdate = true;
    compact(this.drops, living);
    n = 0;
    for (const b of this.bubbles) {
      b.life += dt;
      const u = b.life / b.max;
      if (u >= 1) continue;
      b.y += 0.6 * dt; b.x += Math.sin(b.sway + b.life * 8) * 0.2 * dt;
      const s = b.size * (u < 0.85 ? Math.sqrt(u / 0.85) : 1 + (u - 0.85) * 3); // swell, then pop
      o.position.set(b.x, b.y, b.z); o.scale.setScalar(s); o.updateMatrix();
      this.bubbleMesh.setMatrixAt(n++, o.matrix);
    }
    this.bubbleMesh.count = n; this.bubbleMesh.instanceMatrix.needsUpdate = true;
    compact(this.bubbles, living);
  }
  clear() {
    for (const gl of this.globs) { gl.id = null; gl.g.visible = false; }
    for (const sp of this.splats) sp.m.visible = false;
    this.drops.length = 0; this.bubbles.length = 0;
  }
  get busy() { return this.drops.length > 0 || this.bubbles.length > 0 || this.globs.some((g) => g.id !== null); }
}
