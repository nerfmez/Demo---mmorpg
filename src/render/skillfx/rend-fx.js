// Earth Rend (heavy weapons; a 0.8 s wind-up, then the ground splits along an 8 m x 1.8 m lane),
// held to the owner's bar (.claude/skills/skill-vfx) and sized for a job skill (8 s cooldown). The hero
// leaps and cleaves down into the ground (actions.js rendLeap); the wind-up draws Frontline Split's
// lane on the ground (SplitFx.windup).
//   The blow ('lineStrike'), all of it at once along the whole lane (owner: no running front): a ragged
//   flash where the blade lands and a hard shake; a jagged fissure tears open down the lane, glowing hot
//   for a moment inside a band of scorched, darkened earth that blends into the ground; blunt pillars of
//   rock burst up out of it and shatter, their pieces flung out and falling; smaller rocks and a wall of
//   dust go up with them. The pieces settle and shrink away, the fissure cools and fades. Cosmetic only.
import * as THREE from 'three';
import { mulberry32, flashMaterial, tintFlash, place, placeV, conformPlane, addLight, NOISE, BILLBOARD_VS } from './fx-common.js';
import { rockGeometry, slabGeometry, DUST_FS, STONE_VS, STONE_FS } from './ground-kit.js';

const PILLARS = 10, PIECES = 44, DUST = 16, RISE = 0.1, BREAK = 0.2, PIECE_LIFE = 1.2, FADE_AT = 1.6, END = 2.3;
// the fissure, a decal along the lane (x across -1..1 = the lane's width, y along 0..1): a thin jagged
// crack with forks, hot at first (uHot), inside a band of darkened earth whose edge breaks up into the
// ground; fades out (uA)
const FISSURE_VS = `varying vec2 vP; void main(){ vP = vec2(uv.x*2.0 - 1.0, uv.y); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const FISSURE_FS = `varying vec2 vP; uniform float uSeed; uniform float uHot; uniform float uA; uniform float uLen;` + NOISE + `
  void main(){
    float y = vP.y, x = vP.x, ends = smoothstep(0.0, 0.05, y) * smoothstep(0.0, 0.04, 1.0 - y);
    float c0 = (fbm(vec2(y*uLen*0.9, uSeed)) - 0.5)*0.55;                      // the crack wanders
    float d = abs(x - c0);
    float w = (0.05 + 0.07*fbm(vec2(y*uLen*2.5, uSeed + 3.0))) * ends;        // its jagged width
    // forks: short cracks leaving the main one at an angle
    float fy = fract(y*uLen*0.45 + uSeed), fid = floor(y*uLen*0.45 + uSeed);
    float side = mod(fid, 2.0) < 1.0 ? 1.0 : -1.0, fl = fy*(0.6 + 0.4*fract(sin(fid*12.9)*437.5));
    float fork = abs((x - c0) - side*fl*0.9) - 0.035*(1.0 - fy);
    bool forkOn = fy < 0.55 && (x - c0)*side > 0.0;
    float band = 0.55 + 0.25*fbm(vec2(y*uLen*1.2, uSeed + 7.0)) + 0.15*(fbm(vP*vec2(6.0, uLen*2.0) + uSeed) - 0.5);
    float scorch = (1.0 - smoothstep(band*0.55, band, d)) * ends;
    vec3 c = vec3(0.24, 0.17, 0.12); float a = 0.42*scorch;
    if (d < w || (forkOn && fork < 0.0)) {
      float k = min(1.0, d/max(w, 1e-3));
      c = mix(vec3(0.05, 0.035, 0.03), mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.86, 0.5), 1.0 - k), uHot*(1.0 - 0.6*k));
      a = 1.0;
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a*uA); }`;

export class RendFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(41); this.time = 0;
    this.stoneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.pillars = Array.from({ length: PILLARS }, (_, i) => { const m = new THREE.Mesh(slabGeometry(411 + i * 23), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), h: 1, w: 0.3, yaw: 0, lean: 0, broke: false }; });
    this.pieces = Array.from({ length: PIECES }, (_, i) => { const m = new THREE.Mesh(rockGeometry(511 + i * 7), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 9, size: 0.12 }; });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dust = Array.from({ length: DUST }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 1, life: 0.8 }; });
    this.dustI = 0; this.pieceI = 0;
    this.fissure = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 48), new THREE.ShaderMaterial({ uniforms: { uSeed: { value: 0 }, uHot: { value: 1 }, uA: { value: 1 }, uLen: { value: 8 } }, vertexShader: FISSURE_VS, fragmentShader: FISSURE_FS, transparent: true, depthWrite: false }));
    this.fissure.renderOrder = 2; this.fissure.visible = false; this.fissure.geometry.translate(0, 0.5, 0); this.fissure.rotation.order = 'YXZ'; scene.add(this.fissure);
    this.flash = new THREE.Mesh(quad, flashMaterial(9.1)); tintFlash(this.flash.material, 'physical'); this.flash.renderOrder = 9; this.flash.visible = false; this.flash.frustumCulled = false; scene.add(this.flash);
    this.light = addLight(scene, new THREE.PointLight('#ffc98a', 0, 10, 1.6));
    this.t = 9; this.flashAt = new THREE.Vector3(); this.mid = new THREE.Vector3();
  }
  puff(x, y, z, vx, vy, vz, size, life) {
    const q = this.dust[this.dustI++ % DUST], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = r() * 40;
  }
  piece(x, y, z, vx, vy, vz, size) {
    const q = this.pieces[this.pieceI++ % PIECES], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, vy, vz); q.spin.set((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14); q.t = 0; q.size = size; q.m.visible = true;
  }
  // the rules' 'lineStrike': x, z the hero, angle the aim, range and width of the lane
  strike(e) {
    const r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), sx = dz, sz = -dx, start = 0.7, len = e.range - start;
    this.t = 0;
    // the fissure along the whole lane at once
    place(this.fissure, e.x + dx * start, 0.05, e.z + dz * start);
    this.fissure.rotation.set(-Math.PI / 2, e.angle + Math.PI, 0); this.fissure.scale.set(e.width * 1.3, len, 1);
    const F = this.fissure.material.uniforms; F.uSeed.value = r() * 30; F.uLen.value = len; F.uHot.value = 1; F.uA.value = 1;
    conformPlane(this.fissure, 0.05); this.fissure.visible = true;
    // pillars of rock bursting up out of it
    this.pillars.forEach((q, i) => {
      const u = (i + 0.2 + r() * 0.6) / PILLARS, along = start + u * len, off = (r() - 0.5) * e.width * 0.45;
      q.p.set(e.x + dx * along + sx * off, 0, e.z + dz * along + sz * off);
      q.h = (0.75 + r() * 0.5) * (1 - 0.3 * u); q.w = 0.22 + r() * 0.12; q.yaw = e.angle + (r() - 0.5) * 1.2; q.lean = (r() - 0.5) * 0.5; q.broke = false; q.m.visible = true;
    });
    // smaller rocks and a wall of dust, all along the lane
    for (let i = 0; i < 12; i++) {
      const along = start + r() * len, a = r() * 6.283, sp = 0.8 + r() * 1.8;
      this.piece(e.x + dx * along, 0.15, e.z + dz * along, Math.cos(a) * sp, 3 + r() * 3, Math.sin(a) * sp, 0.07 + r() * 0.08);
    }
    for (let i = 0; i < 9; i++) {
      const along = start + (i + r() * 0.6) / 9 * len;
      this.puff(e.x + dx * along, 0.3, e.z + dz * along, sx * (r() - 0.5) * 2.4, 0.8 + r() * 0.8, sz * (r() - 0.5) * 2.4, 1.0 + r() * 0.5, 0.9);
    }
    // the blow
    this.flashAt.set(e.x + dx * 1.0, 0.6, e.z + dz * 1.0);
    this.puff(this.flashAt.x, 0.3, this.flashAt.z, 0, 1.2, 0, 1.6, 0.8);
    this.mid.set(e.x + dx * (start + len * 0.5), 1.2, e.z + dz * (start + len * 0.5));
    this.onShake?.(0.4, 0.3);
  }
  update(dt) {
    this.time += dt;
    if (this.t < END) {
      this.t += dt; const t = this.t;
      this.flash.visible = t < 0.16;
      if (this.flash.visible) { placeV(this.flash, this.flashAt); this.flash.quaternion.copy(this.camera.quaternion); this.flash.scale.setScalar(3.2 * (t < 0.03 ? 0.5 + t / 0.06 : 1)); this.flash.material.uniforms.uT.value = t / 0.16; }
      const F = this.fissure.material.uniforms; F.uHot.value = Math.max(0, 1 - t / 0.5); F.uA.value = Math.max(0, Math.min(1, (END - t) / (END - FADE_AT)));
      // pillars: burst up with a little overshoot, then shatter into pieces flung out
      for (const q of this.pillars) {
        if (q.broke) continue;
        if (t >= BREAK) {
          q.broke = true; q.m.visible = false; const r = this.rnd;
          for (let k = 0; k < 3; k++) {
            const a = r() * 6.283, sp = 1.2 + r() * 2.4, y = q.h * (0.25 + 0.6 * r());
            this.piece(q.p.x, y, q.p.z, Math.cos(a) * sp, 2 + r() * 3.5, Math.sin(a) * sp, q.w * (0.45 + r() * 0.35));
          }
          continue;
        }
        const up = Math.min(1, t / RISE), over = up < 1 ? 1 - Math.pow(1 - up, 3) : 1 + 0.1 * Math.sin(Math.min(1, (t - RISE) / (BREAK - RISE)) * Math.PI), h = q.h * over;
        place(q.m, q.p.x, h * 0.5 - 0.35, q.p.z); q.m.scale.set(q.w, h * 0.5 + 0.2, q.w * 0.9);
        q.m.rotation.set(q.lean, q.yaw, q.lean * 0.6);
      }
      placeV(this.light, this.mid); this.light.intensity = 9 * Math.max(0, 1 - t / 0.5);
      if (t >= END) { this.fissure.visible = false; this.flash.visible = false; }
    }
    for (const q of this.pieces) {
      if (q.t > PIECE_LIFE) { q.m.visible = false; continue; }
      q.t += dt; q.v.y -= 15 * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.size) { q.p.y = q.size; q.v.multiplyScalar(0.3); q.v.y = Math.abs(q.v.y) * 0.3; q.spin.multiplyScalar(0.5); }
      const k = Math.max(0, Math.min(1, (PIECE_LIFE - q.t) / 0.3));
      q.m.visible = k > 0; placeV(q.m, q.p); q.m.scale.setScalar(q.size * k);
      q.m.rotation.x += q.spin.x * dt; q.m.rotation.y += q.spin.y * dt; q.m.rotation.z += q.spin.z * dt;
    }
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.2 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
  }
  clear() { this.t = 9; this.fissure.visible = false; this.flash.visible = false; this.light.intensity = 0; for (const q of this.pillars) q.m.visible = false; for (const q of this.pieces) { q.t = 9; q.m.visible = false; } for (const q of this.dust) { q.t = q.life = 9; q.m.visible = false; } }
  get busy() { return this.t < END || this.dust.some((q) => q.t < q.life) || this.pieces.some((q) => q.t <= PIECE_LIFE); }
}
