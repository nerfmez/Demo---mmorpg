// Sky Shatter (heavy weapons; a 0.7 s wind-up, a 140 degree blow in front that stuns), held to the
// owner's bar (.claude/skills/skill-vfx) and sized for a job skill (9 s cooldown). The hero pries the
// ground up (actions.js skyPry: the blade driven low into the ground through the crouch, ripped up and
// overhead on the contact), so the ground answers the blade.
//   Wind-up (castStart): pebbles lift and tremble round the hero.
//   The rip (the rules' 'slash' contact): a ragged flash and light rays where the blade tears out; the
//   ground there sinks into a crater; blunt slabs of ground are pried up row after row over the true
//   arc and range, tilted outward, each row a beat later, dust rolling off them (a stun is blunt force:
//   no sharp spikes, owner review); the pebbles are thrown up and forward with the blade and fall;
//   a warm light; a heavy shake (the director). Struck monsters get Breakbeat Slam's stun stars
//   (MaceFx.hit). Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, flashMaterial, tintFlash, place, placeV, conformPlane, addLight, NOISE, BILLBOARD_VS } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, taperW, taperGlowW } from './light-kit.js';
import { rockGeometry, slabGeometry, craterMesh } from './ground-kit.js';

const ROWS = [[1.25, 4], [2.05, 6], [2.85, 8]], SPIKES = 18, PEBBLES = 9, DUST = 22, RAYS = 6, CRATER = 2.6;
const EDGE = [1.0, 0.95, 0.82], GLOW = [0.95, 0.7, 0.35];
// stone, lit in the game's three toon steps
const STONE_VS = `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
const STONE_FS = `varying vec3 vN; uniform float uA;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49)));
    vec3 c = l > 0.55 ? vec3(0.74, 0.66, 0.55) : (l > 0.1 ? vec3(0.55, 0.48, 0.4) : vec3(0.36, 0.31, 0.27));
    gl_FragColor = vec4(c, uA); }`;
// dust: a soft puff that swells and thins, two warm tones (Firebolt's puff shape in dust colours)
const DUST_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*2.0 + uSeed + vec2(0.0, -uT*1.2));
    float body = n*1.15 - r*0.95 - uT*0.7;
    if (body < 0.04) discard;
    vec3 c = body > 0.24 ? vec3(0.86, 0.78, 0.64) : vec3(0.66, 0.57, 0.45);
    gl_FragColor = vec4(c, 0.85*(1.0 - uT*0.5)); }`;

export class ShatterFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(23); this.time = 0;
    this.core = new Ribbon(scene, camera, 1500, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1500, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.stoneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.spikes = Array.from({ length: SPIKES }, (_, i) => { const m = new THREE.Mesh(slabGeometry(71 + i * 13), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), out: 0, t: 9, h: 1, w: 0.3 }; });
    this.pebbles = Array.from({ length: PEBBLES }, (_, i) => { const m = new THREE.Mesh(rockGeometry(131 + i * 7), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), home: new THREE.Vector3(), size: 0.1, ph: 0, state: 0, t: 0 }; });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dust = Array.from({ length: DUST }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 1, life: 0.8 }; });
    this.dustI = 0;
    this.flash = new THREE.Mesh(quad, flashMaterial(7.7)); tintFlash(this.flash.material, 'physical'); this.flash.renderOrder = 9; this.flash.visible = false; this.flash.frustumCulled = false; scene.add(this.flash);
    this.crater = craterMesh(scene, 3.3);
    this.rays = Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 }));
    this.light = addLight(scene, new THREE.PointLight('#ffd9a0', 0, 9, 1.6));
    this.slamAt = -1; this.chargeAt = -1; this.center = new THREE.Vector3(); this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.p = new THREE.Vector3();
  }
  // castStart: pebbles lift round the hero for the wind-up
  charge(x, z, total) {
    const r = this.rnd; this.chargeAt = this.time; this.chargeTotal = total;
    for (const q of this.pebbles) {
      const a = r() * 6.283, d = 0.7 + r() * 1.1;
      q.home.set(x + Math.cos(a) * d, 0.35 + r() * 0.65, z + Math.sin(a) * d); q.p.set(q.home.x, 0.05, q.home.z);
      q.size = 0.07 + r() * 0.08; q.ph = r() * 6; q.state = 1; q.t = 0; q.m.visible = true; q.m.rotation.set(r() * 6, r() * 6, r() * 6);
    }
  }
  puff(x, y, z, vx, vz, size, life) {
    const q = this.dust[this.dustI++ % DUST], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, 0.4 + r() * 0.4, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = r() * 40;
  }
  // the rules' contact: x, z the hero, angle its facing, range and arc (degrees) of the hit
  slam(x, z, angle, range, arcDeg) {
    const r = this.rnd, arc = (arcDeg * Math.PI) / 180, fx = Math.sin(angle), fz = Math.cos(angle), k = range / 3.2;
    this.slamAt = this.time; this.center.set(x + fx * 1.4 * k, 0, z + fz * 1.4 * k);
    // the crater where the weapon lands
    place(this.crater, this.center.x, 0.05, this.center.z); this.crater.scale.setScalar(0.9 * k * 1.7 * 2); conformPlane(this.crater); this.crater.visible = true;
    // rows of ground slabs pried up over the true arc, each row a beat later
    let i = 0;
    ROWS.forEach(([d, n], row) => {
      for (let j = 0; j < n && i < SPIKES; j++, i++) {
        const q = this.spikes[i], u = (j + 0.5) / n, a = angle + (u - 0.5) * arc * 0.92 + (r() - 0.5) * 0.12, dd = d * k * (0.92 + r() * 0.16);
        q.p.set(x + Math.sin(a) * dd, 0, z + Math.cos(a) * dd); q.out = a; q.t = -row * 0.07; q.h = (0.45 + r() * 0.25) * (1 - row * 0.12); q.w = 0.36 + r() * 0.12;
        q.m.visible = false;
      }
    });
    // light rays shooting up out of the slam
    this.rays.forEach((ray, j) => { const a = (j / RAYS) * 6.283 + r() * 0.5, el = 1.05 + r() * 0.4; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = 2.4 + r() * 1.6; });
    // the lifted pebbles are thrown up and forward with the blade, and fall
    for (const q of this.pebbles) if (q.state === 1) { q.state = 2; q.t = 0; q.v.set(fx * (1.5 + r() * 1.5) + (r() - 0.5) * 1.6, 4.5 + r() * 3, fz * (1.5 + r() * 1.5) + (r() - 0.5) * 1.6); }
    // dust bursting out of the crater
    for (let j = 0; j < 5; j++) { const a = r() * 6.283; this.puff(this.center.x, 0.3, this.center.z, Math.cos(a) * 2, Math.sin(a) * 2, 1.1 + r() * 0.5, 0.8); }
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const t = this.time - this.slamAt;
    // pebbles: lift and tremble through the wind-up; flung, fall, shrink away
    for (const q of this.pebbles) {
      if (!q.state) continue;
      q.t += dt;
      if (q.state === 1) {
        const k = Math.min(1, q.t / Math.max(0.1, this.chargeTotal * 0.8)), e = 1 - Math.pow(1 - k, 3);
        q.p.lerpVectors(this.p.set(q.home.x, 0.05, q.home.z), q.home, e); q.p.x += Math.sin(this.time * 47 + q.ph) * 0.02 * k; q.p.y += Math.sin(this.time * 31 + q.ph) * 0.02 * k;
        q.m.rotation.y += dt * 1.5;
        if (q.t > (this.chargeTotal || 0.7) + 0.5) { q.state = 0; q.m.visible = false; }
      } else {
        q.v.y -= 15 * dt; q.p.addScaledVector(q.v, dt); q.m.rotation.x += dt * 9;
        if (q.p.y < q.size) { q.p.y = q.size; q.v.set(0, 0, 0); }
        if (q.t > 1.3) { q.state = 0; q.m.visible = false; continue; }
      }
      placeV(q.m, q.p); q.m.scale.setScalar(q.size * (q.state === 2 ? Math.min(1, (1.3 - q.t) / 0.25) : 1));
    }
    if (this.slamAt >= 0 && t < 3) {
      // the flash and the rays
      this.flash.visible = t < 0.16;
      if (this.flash.visible) { this.p.copy(this.center); this.p.y = 0.8; placeV(this.flash, this.p); this.flash.quaternion.copy(this.camera.quaternion); this.flash.scale.setScalar(3.8 * (t < 0.03 ? 0.5 + t / 0.06 : 1)); this.flash.material.uniforms.uT.value = t / 0.16; }
      const rk = Math.min(1, t / 0.32);
      if (rk < 1) for (const ray of this.rays) {
        this.two[0].copy(this.center).addScaledVector(ray.d, ray.len * 0.15 * rk); this.two[0].y += 0.3;
        this.two[1].copy(this.center).addScaledVector(ray.d, ray.len * (0.4 + 0.6 * Math.sqrt(rk))); this.two[1].y += 0.3;
        W.v = 0.14 * (1 - rk); this.glow.strip(this.two, taperGlowW, 1 - rk, GLOW); this.core.strip(this.two, taperW, 1 - rk * rk, EDGE);
      }
      // the spikes: burst up (with a little overshoot), hold, sink back; dust off their feet
      for (const q of this.spikes) {
        if (q.t > 2) continue;
        const was = q.t; q.t += dt;
        if (q.t < 0) continue;
        if (was < 0) { this.puff(q.p.x, 0.15, q.p.z, Math.sin(q.out) * 1.4, Math.cos(q.out) * 1.4, 0.7 + this.rnd() * 0.4, 0.75); }
        const up = Math.min(1, q.t / 0.09), over = up < 1 ? up : 1 + 0.12 * Math.sin(Math.min(1, (q.t - 0.09) / 0.12) * Math.PI);
        const sink = Math.max(0, Math.min(1, (q.t - 0.55) / 0.3)), hgt = q.h * over * (1 - sink);
        q.m.visible = hgt > 0.02;
        if (!q.m.visible) { if (sink >= 1) q.t = 9; continue; }
        // a slab of ground heaved up, tilted so its inner edge lifts (pushed out by the blow)
        place(q.m, q.p.x, hgt * 0.55 - 0.25, q.p.z);
        q.m.scale.set(q.w, 0.5, q.w * 0.8);
        q.m.rotation.set(0, q.out, 0); q.m.rotateX(0.45 * Math.min(1, hgt / q.h));
      }
      const C = this.crater.material.uniforms; C.uA.value = Math.min(1, t / 0.05) * Math.max(0, Math.min(1, (CRATER - t) / 0.6)); C.uGlow.value = 0;
      if (t >= CRATER) this.crater.visible = false;
      this.p.copy(this.center); this.p.y = 1.2; placeV(this.light, this.p); this.light.intensity = 8 * Math.max(0, 1 - t / 0.35);
    } else { this.flash.visible = false; this.light.intensity = 0; }
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.5 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
    this.core.end(); this.glow.end();
  }
  clear() {
    this.slamAt = -1; this.flash.visible = false; this.crater.visible = false; this.light.intensity = 0;
    for (const q of this.spikes) { q.t = 9; q.m.visible = false; } for (const q of this.pebbles) { q.state = 0; q.m.visible = false; } for (const q of this.dust) { q.t = q.life = 9; q.m.visible = false; }
  }
  get busy() { return (this.slamAt >= 0 && this.time - this.slamAt < CRATER) || this.pebbles.some((q) => q.state) || this.dust.some((q) => q.t < q.life); }
}
