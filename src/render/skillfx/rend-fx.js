// Earth Rend (heavy weapons; a 0.8 s wind-up, then the ground splits along an 8 m x 1.8 m lane),
// held to the owner's bar (.claude/skills/skill-vfx) and sized for a job skill (8 s cooldown). The
// wind-up draws Frontline Split's lane on the ground (SplitFx.windup); this is the split itself.
//   The blow ('lineStrike'): a ragged flash and dust where the weapon lands; a rift races down the
//   lane: the ground tears open into a dark chasm (a decal shaded in the game's toon steps, its walls
//   lit on the sun's side) and both banks heave up and fall away from it as blunt slabs, tilted
//   outward; dust bursts off the running front; rock chunks are thrown up and fall. Then the slabs sink
//   back, the chasm closes from the far end and the dust settles. Cosmetic only.
import * as THREE from 'three';
import { mulberry32, flashMaterial, tintFlash, place, placeV, conformPlane, addLight, NOISE, BILLBOARD_VS } from './fx-common.js';
import { rockGeometry, slabGeometry, STONE_VS, STONE_FS, DUST_FS } from './ground-kit.js';

const SLABS = 16, CHUNKS = 10, DUST = 18, RUN = 0.32, HOLD = 1.3, CLOSE = 0.6;
// the chasm, a decal along the lane (x across -1..1 = the lane's width, y along 0..1): a jagged slit
// opened up to the running front (uFront), its depth dark, the wall facing the sun lit, a lip of
// broken ground; closes from the far end (uClose)
const CHASM_VS = `varying vec2 vP; void main(){ vP = vec2(uv.x*2.0 - 1.0, uv.y); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const CHASM_FS = `varying vec2 vP; uniform float uFront; uniform float uClose; uniform float uSeed; uniform float uA;` + NOISE + `
  void main(){
    float y = vP.y, x = vP.x;
    if (y > uFront || y > 1.0 - uClose) discard;
    float taper = smoothstep(0.0, 0.08, y) * smoothstep(0.0, 0.1, min(uFront, 1.0 - uClose) - y);
    float centre = (fbm(vec2(y*7.0, uSeed)) - 0.5)*0.3;                     // the rift wanders
    float hw = (0.36 + 0.22*fbm(vec2(y*13.0, uSeed + 4.0))) * taper;
    float d = abs(x - centre);
    float lip = hw + 0.16*taper;
    if (d > lip) discard;
    vec3 c;
    if (d < hw) {
      float k = d/hw, s = sign(x - centre);
      c = k < 0.45 ? vec3(0.06, 0.04, 0.04) : (s < 0.0 ? vec3(0.34, 0.25, 0.18) : vec3(0.17, 0.12, 0.09));   // depth, lit and shaded walls
    } else c = vec3(0.45, 0.36, 0.27) * (0.85 + 0.15*fbm(vec2(x*9.0, y*30.0)));                              // broken lip
    gl_FragColor = vec4(c, uA); }`;

export class RendFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(41); this.time = 0;
    this.stoneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.slabs = Array.from({ length: SLABS }, (_, i) => { const m = new THREE.Mesh(slabGeometry(211 + i * 17), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), at: 0, side: 1, h: 0.4, w: 0.4 }; });
    this.chunks = Array.from({ length: CHUNKS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(311 + i * 9), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, delay: 0, size: 0.12 }; });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dust = Array.from({ length: DUST }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, delay: 0, size: 1, life: 0.8 }; });
    this.dustI = 0;
    this.chasm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 40), new THREE.ShaderMaterial({ uniforms: { uFront: { value: 0 }, uClose: { value: 0 }, uSeed: { value: 0 }, uA: { value: 1 } }, vertexShader: CHASM_VS, fragmentShader: CHASM_FS, transparent: true, depthWrite: false }));
    this.chasm.renderOrder = 2; this.chasm.visible = false; this.chasm.geometry.translate(0, 0.5, 0); this.chasm.rotation.order = 'YXZ'; scene.add(this.chasm);
    this.flash = new THREE.Mesh(quad, flashMaterial(9.1)); tintFlash(this.flash.material, 'physical'); this.flash.renderOrder = 9; this.flash.visible = false; this.flash.frustumCulled = false; scene.add(this.flash);
    this.light = addLight(scene, new THREE.PointLight('#ffd9a0', 0, 9, 1.6));
    this.s = null; this.p = new THREE.Vector3(); this.at = new THREE.Vector3();
  }
  puff(x, y, z, vx, vz, size, life, delay) {
    const q = this.dust[this.dustI++ % DUST], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, 0.5 + r() * 0.5, vz); q.t = -delay; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = r() * 40;
  }
  // the rules' 'lineStrike': x, z the hero, angle the aim, range and width of the lane
  strike(e) {
    const r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), sx = dz, sz = -dx, start = 0.6, len = e.range - start;
    this.s = { t: 0, x: e.x, z: e.z, dx, dz, sx, sz, start, len, width: e.width };
    // the chasm decal, laid along the lane from just in front of the hero
    place(this.chasm, e.x + dx * start, 0.05, e.z + dz * start);
    this.chasm.rotation.set(-Math.PI / 2, e.angle + Math.PI, 0, 'YXZ'); this.chasm.scale.set(e.width, len, 1);
    this.chasm.material.uniforms.uSeed.value = r() * 30; conformPlane(this.chasm, 0.05); this.chasm.visible = true;
    // the banks: slabs on both sides of the rift, each heaving as the front passes it
    this.slabs.forEach((q, i) => {
      const side = i % 2 ? 1 : -1, u = (Math.floor(i / 2) + 0.3 + r() * 0.4) / (SLABS / 2), along = start + u * len * 0.97, off = side * e.width * (0.42 + r() * 0.2);
      q.p.set(e.x + dx * along + sx * off, 0, e.z + dz * along + sz * off); q.at = (u * RUN); q.side = side;
      q.h = (0.45 + r() * 0.35) * (1 - 0.35 * u); q.w = 0.2 + r() * 0.16; q.yaw = e.angle + (r() - 0.5) * 0.9; q.m.visible = false;
    });
    // rock chunks thrown up along the rift; dust off the running front
    this.chunks.forEach((q) => {
      const u = r(), along = start + u * len, a = r() * 6.283, sp = 0.8 + r() * 1.5;
      q.p.set(e.x + dx * along, 0.1, e.z + dz * along); q.v.set(Math.cos(a) * sp, 3 + r() * 3, Math.sin(a) * sp);
      q.delay = u * RUN; q.t = -q.delay; q.size = 0.1 + r() * 0.12; q.m.visible = false;
    });
    for (let i = 0; i < 9; i++) {
      const u = i / 8, along = start + u * len;
      this.puff(e.x + dx * along, 0.25, e.z + dz * along, sx * (r() - 0.5) * 2.4, sz * (r() - 0.5) * 2.4, 1.0 + r() * 0.5 - u * 0.2, 0.85, u * RUN);
    }
    this.puff(e.x + dx * 0.9, 0.3, e.z + dz * 0.9, 0, 0, 1.5, 0.7, 0);
  }
  update(dt) {
    this.time += dt;
    const s = this.s;
    if (s) {
      s.t += dt; const t = s.t;
      // the flash where the weapon lands
      this.flash.visible = t < 0.16;
      if (this.flash.visible) { this.p.set(s.x + s.dx * 0.9, 0.6, s.z + s.dz * 0.9); placeV(this.flash, this.p); this.flash.quaternion.copy(this.camera.quaternion); this.flash.scale.setScalar(2.6 * (t < 0.03 ? 0.5 + t / 0.06 : 1)); this.flash.material.uniforms.uT.value = t / 0.16; }
      // the rift runs down the lane, holds, closes from the far end
      const C = this.chasm.material.uniforms;
      C.uFront.value = Math.min(1.05, t / RUN); C.uClose.value = t < RUN + HOLD ? 0 : Math.min(1.05, (t - RUN - HOLD) / CLOSE);
      C.uA.value = 1;
      // the banks heave as the front passes, tilt away from the rift, then sink back as it closes
      for (const q of s ? this.slabs : []) {
        const k = t - q.at, closeAt = RUN + HOLD + (1 - q.at / RUN) * CLOSE * 0.8;
        if (k < 0) { q.m.visible = false; continue; }
        const up = Math.min(1, k / 0.1), over = up < 1 ? up : 1 + 0.15 * Math.sin(Math.min(1, (k - 0.1) / 0.15) * Math.PI);
        const sink = Math.max(0, Math.min(1, (t - closeAt) / 0.3)), hgt = q.h * over * (1 - sink);
        q.m.visible = hgt > 0.02;
        if (!q.m.visible) continue;
        place(q.m, q.p.x, hgt * 0.5 - 0.22, q.p.z);
        q.m.scale.set(q.w, 0.5, q.w * 1.3);
        q.m.rotation.set(0, q.yaw, 0); q.m.rotateZ(-q.side * 0.6 * Math.min(1, hgt / q.h));   // falling away from the rift
      }
      this.p.set(s.x + s.dx * (s.start + s.len * Math.min(1, t / RUN)), 1, s.z + s.dz * (s.start + s.len * Math.min(1, t / RUN))); placeV(this.light, this.p);
      this.light.intensity = 6 * Math.max(0, 1 - t / 0.5);
      if (t > RUN + HOLD + CLOSE + 0.2) { this.s = null; this.chasm.visible = false; for (const q of this.slabs) q.m.visible = false; }
    }
    for (const q of this.chunks) {
      if (q.t > 1.4) continue;
      q.t += dt;
      if (q.t < 0) continue;
      q.v.y -= 15 * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.size) { q.p.y = q.size; q.v.set(0, 0, 0); }
      const k = Math.max(0, Math.min(1, (1.4 - q.t) / 0.3));
      q.m.visible = k > 0; placeV(q.m, q.p); q.m.scale.setScalar(q.size * k); q.m.rotation.x += dt * 7; q.m.rotation.y += dt * 5;
    }
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; if (q.t < 0) { q.m.visible = false; continue; }
      q.v.multiplyScalar(1 - 2.5 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
  }
  clear() { this.s = null; this.chasm.visible = false; this.flash.visible = false; this.light.intensity = 0; for (const q of this.slabs) q.m.visible = false; for (const q of this.chunks) { q.t = 9; q.m.visible = false; } for (const q of this.dust) { q.t = q.life = 9; q.m.visible = false; } }
  get busy() { return !!this.s || this.dust.some((q) => q.t < q.life) || this.chunks.some((q) => q.t <= 1.4); }
}
