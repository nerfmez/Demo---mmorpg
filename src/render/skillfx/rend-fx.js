// Earth Rend (heavy weapons; a 0.8 s wind-up, then the ground splits along an 8 m x 1.8 m lane),
// held to the owner's bar (.claude/skills/skill-vfx) and sized for a job skill (8 s cooldown). The
// wind-up draws Frontline Split's lane on the ground (SplitFx.windup); this is the split itself.
//   The blow ('lineStrike'): a ragged flash, a burst of dust and a hard shake where the weapon lands.
//   A rift then runs down the lane, speeding up: the ground tears open into a dark chasm (a decal), and
//   the earth on both sides heaves up into one continuous broken ridge each (a mesh rebuilt as the
//   front passes: a torn wall dropping into the chasm, a jagged crest, a slope back down to the
//   ground, broken into plates shoved up at different heights and tilts, a ragged outer edge;
//   toon-shaded). At the running front a glow; every fifth of the way a column
//   of dust and rock chunks bursts up and the shake pulses; at the far end a last big burst. Then the
//   ridges sink back, the chasm closes from the far end and the dust settles. Cosmetic only.
import * as THREE from 'three';
import { mulberry32, flashMaterial, tintFlash, place, placeV, conformPlane, addLight, fxGround, NOISE, BILLBOARD_VS } from './fx-common.js';
import { rockGeometry, DUST_FS, STONE_VS, STONE_FS } from './ground-kit.js';
import { glowTexture, lightSprite } from './light-kit.js';

const CHUNKS = 16, DUST = 24, RUN = 0.42, HOLD = 1.3, CLOSE = 0.6, ALONG = 64, ACROSS = 8, BEATS = 5, PLATES = 9;
// the front speeds up as it runs: the fraction of the lane reached at time t
const frontAt = (t) => { const k = Math.min(1, t / RUN); return k * (0.55 + 0.45 * k); };
// the chasm, a decal along the lane (x across -1..1 = the lane's width, y along 0..1)
const CHASM_VS = `varying vec2 vP; void main(){ vP = vec2(uv.x*2.0 - 1.0, uv.y); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const CHASM_FS = `varying vec2 vP; uniform float uFront; uniform float uClose; uniform float uSeed;` + NOISE + `
  void main(){
    float y = vP.y, x = vP.x;
    if (y > uFront || y > 1.0 - uClose) discard;
    float taper = smoothstep(0.0, 0.06, y) * smoothstep(0.0, 0.06, min(uFront, 1.0 - uClose) - y);
    float hw = (0.3 + 0.12*fbm(vec2(y*13.0, uSeed + 4.0))) * taper;
    if (abs(x) > hw) discard;
    gl_FragColor = vec4(abs(x)/hw < 0.55 ? vec3(0.05, 0.035, 0.035) : vec3(0.15, 0.1, 0.08), 1.0); }`;
// the ridges: toon-shaded earth; faces turned from the sun dark; deeper inside the chasm; cracks across
const RIDGE_VS = `attribute float aAlong; varying vec3 vN; varying float vAlong; varying float vDepth;
  void main(){ vAlong = aAlong; vDepth = position.y; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position, 1.0); }`;
const RIDGE_FS = `varying vec3 vN; varying float vAlong; varying float vDepth; uniform float uSeed; uniform float uGround;` + NOISE + `
  void main(){
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float l = dot(N, normalize(vec3(-0.33, 0.82, 0.49)));
    vec3 c = l > 0.62 ? vec3(0.68, 0.54, 0.39) : (l > 0.22 ? vec3(0.52, 0.4, 0.29) : vec3(0.31, 0.23, 0.17));
    if (vDepth < uGround) c *= 0.5;                                                  // down in the chasm
    gl_FragColor = vec4(c, 1.0); }`;

function ridgeGeometry() {
  const g = new THREE.BufferGeometry(), n = (ALONG + 1) * ACROSS, idx = [], al = new Float32Array(n);
  for (let i = 0; i <= ALONG; i++) for (let j = 0; j < ACROSS; j++) al[i * ACROSS + j] = i / ALONG;
  for (let i = 0; i < ALONG; i++) for (let j = 0; j < ACROSS - 1; j++) { const a = i * ACROSS + j, b = a + ACROSS; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aAlong', new THREE.BufferAttribute(al, 1));
  g.setIndex(idx); return g;
}

export class RendFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(41); this.time = 0;
    this.stoneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, vertexShader: STONE_VS, fragmentShader: STONE_FS });
    this.ridgeMat = new THREE.ShaderMaterial({ uniforms: { uSeed: { value: 0 }, uGround: { value: -0.05 } }, vertexShader: RIDGE_VS, fragmentShader: RIDGE_FS, side: THREE.DoubleSide });
    this.ridges = [-1, 1].map((side) => { const m = new THREE.Mesh(ridgeGeometry(), this.ridgeMat); m.frustumCulled = false; m.visible = false; scene.add(m); return { m, side, jag: new Float32Array(ALONG + 1), plate: new Float32Array(PLATES + 1), cut: new Float32Array(PLATES + 1), reach: new Float32Array(ALONG + 1) }; });
    this.sink = new Float32Array(ALONG + 1);
    this.chunks = Array.from({ length: CHUNKS }, (_, i) => { const m = new THREE.Mesh(rockGeometry(311 + i * 9), this.stoneMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 0.12 }; });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dust = Array.from({ length: DUST }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 1, life: 0.8 }; });
    this.dustI = 0; this.chunkI = 0;
    this.chasm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 40), new THREE.ShaderMaterial({ uniforms: { uFront: { value: 0 }, uClose: { value: 0 }, uSeed: { value: 0 } }, vertexShader: CHASM_VS, fragmentShader: CHASM_FS, transparent: true, depthWrite: false }));
    this.chasm.renderOrder = 2; this.chasm.visible = false; this.chasm.geometry.translate(0, 0.5, 0); this.chasm.rotation.order = 'YXZ'; scene.add(this.chasm);
    this.flash = new THREE.Mesh(quad, flashMaterial(9.1)); tintFlash(this.flash.material, 'physical'); this.flash.renderOrder = 9; this.flash.visible = false; this.flash.frustumCulled = false; scene.add(this.flash);
    this.head = lightSprite(scene, glowTexture('fire'), true, 8);
    this.light = addLight(scene, new THREE.PointLight('#ffd9a0', 0, 9, 1.6));
    this.s = null; this.p = new THREE.Vector3(); this.flashAt = new THREE.Vector3();
  }
  puff(x, y, z, vx, vy, vz, size, life) {
    const q = this.dust[this.dustI++ % DUST], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = r() * 40;
  }
  chunk(x, z, up, size) {
    const q = this.chunks[this.chunkI++ % CHUNKS], r = this.rnd, a = r() * 6.283, sp = 0.6 + r() * 1.6;
    q.p.set(x, 0.15, z); q.v.set(Math.cos(a) * sp, up * (0.8 + r() * 0.5), Math.sin(a) * sp); q.t = 0; q.size = size * (0.7 + r() * 0.6); q.m.visible = true;
  }
  // a burst at a point on the lane: a column of dust, a skirt of dust, rock chunks
  burst(x, z, k) {
    const r = this.rnd;
    this.puff(x, 0.3, z, (r() - 0.5) * 0.8, 1.8 * k, (r() - 0.5) * 0.8, 1.1 * k + r() * 0.3, 0.85);
    this.puff(x, 0.15, z, (r() - 0.5) * 2.6, 0.4, (r() - 0.5) * 2.6, 0.9 * k, 0.7);
    for (let i = 0; i < Math.round(2.5 * k); i++) this.chunk(x, z, 4.5 * k, 0.15);
  }
  // the rules' 'lineStrike': x, z the hero, angle the aim, range and width of the lane
  strike(e) {
    const r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), start = 0.6, len = e.range - start;
    this.s = { t: 0, x: e.x, z: e.z, dx, dz, sx: dz, sz: -dx, start, len, width: e.width, beats: 0, ended: false };
    place(this.chasm, e.x + dx * start, 0.05, e.z + dz * start);
    this.chasm.rotation.set(-Math.PI / 2, e.angle + Math.PI, 0); this.chasm.scale.set(e.width, len, 1);
    this.chasm.material.uniforms.uSeed.value = r() * 30; conformPlane(this.chasm, 0.05); this.chasm.visible = true;
    this.ridgeMat.uniforms.uSeed.value = r() * 30; this.ridgeMat.uniforms.uGround.value = fxGround.y(e.x, e.z) - 0.05;
    for (const R of this.ridges) {
      // broken plates of earth shoved up, each its own height and tilt; a ragged outer edge
      for (let p = 0; p <= PLATES; p++) { R.plate[p] = 0.55 + 0.75 * r(); R.cut[p] = (p + (r() - 0.5) * 0.5) / PLATES; }
      let w = 1; for (let i = 0; i <= ALONG; i++) { w = 0.55 * w + 0.45 * (0.55 + 0.9 * r()); R.reach[i] = w; R.jag[i] = 0.85 + 0.3 * r(); }
      R.m.visible = true;
    }
    // the blow: flash, dust, a hard shake
    this.flashAt.set(e.x + dx * 0.9, 0.6, e.z + dz * 0.9);
    this.burst(e.x + dx * 0.9, e.z + dz * 0.9, 1.3);
    this.onShake?.(0.3, 0.25);
  }
  // rebuilds a ridge's vertices for this frame: [into the chasm, the torn top edge, the slope down]
  ridge(R, s, f) {
    const pos = R.m.geometry.attributes.position.array, rim = s.width * 0.16, bank = s.width * 0.55;
    let p = 0;
    for (let i = 0; i <= ALONG; i++) {
      const a = i / ALONG, along = s.start + a * s.len;
      while (p < PLATES - 1 && a > R.cut[p + 1]) p++;
      const u0 = Math.max(0, R.cut[p]), u1 = Math.min(1, R.cut[p + 1]), inPlate = (a - u0) / Math.max(1e-3, u1 - u0);
      const k = Math.max(0, Math.min(1, (f - a) * 8));                            // the front has passed
      const end = Math.min(1, a * 10) * Math.min(1, (1 - a) * 10);               // tapers at both ends
      // a plate rises more toward its far edge (shoved up and tilted), steps down at the next crack
      const h = 0.62 * R.plate[p] * (0.55 + 0.45 * inPlate) * R.jag[i] * k * end * (1 - 0.3 * a) * (1 - this.sink[i]);
      const live = k > 0 && h > 0.01, bx = s.x + s.dx * along, bz = s.z + s.dz * along;
      for (let j = 0; j < ACROSS; j++) {
        let off, y;
        if (j === 0) { off = rim * 0.8; y = live ? -0.45 * k * end * (1 - this.sink[i]) : -0.3; }
        else { const u = (j - 1) / (ACROSS - 2); off = rim + bank * u * R.reach[i]; y = live ? h * (u < 0.15 ? 1 : Math.pow(1 - (u - 0.15) / 0.85, 1.3)) - (j === ACROSS - 1 ? 0.05 : 0) : -0.3; }
        const x = bx + s.sx * off * R.side, z = bz + s.sz * off * R.side, o = (i * ACROSS + j) * 3;
        pos[o] = x; pos[o + 1] = y + fxGround.y(x, z); pos[o + 2] = z;
      }
    }
    R.m.geometry.attributes.position.needsUpdate = true; R.m.geometry.computeVertexNormals();
  }
  update(dt) {
    this.time += dt;
    const s = this.s;
    if (s) {
      s.t += dt; const t = s.t, f = frontAt(t);
      // the flash where the weapon lands
      this.flash.visible = t < 0.16;
      if (this.flash.visible) { placeV(this.flash, this.flashAt); this.flash.quaternion.copy(this.camera.quaternion); this.flash.scale.setScalar(2.8 * (t < 0.03 ? 0.5 + t / 0.06 : 1)); this.flash.material.uniforms.uT.value = t / 0.16; }
      // the chasm runs, holds, closes from the far end; the ridges sink back with it
      const C = this.chasm.material.uniforms, close = t < RUN + HOLD ? 0 : Math.min(1.05, (t - RUN - HOLD) / CLOSE);
      C.uFront.value = Math.min(1.05, f * 1.02); C.uClose.value = close;
      for (let i = 0; i <= ALONG; i++) this.sink[i] = Math.max(0, Math.min(1, (close - (1 - i / ALONG) + 0.15) / 0.25));
      for (const R of this.ridges) this.ridge(R, s, f);
      // beats along the run: a dust column and chunks bursting up, the shake pulsing
      while (s.beats < BEATS - 1 && f >= (s.beats + 1) / BEATS) {
        s.beats++; const along = s.start + s.len * (s.beats / BEATS);
        this.burst(s.x + s.dx * along, s.z + s.dz * along, 1);
        this.onShake?.(0.12, 0.1);
      }
      if (!s.ended && f >= 1) { // the far end: a last big burst
        s.ended = true; const along = s.start + s.len;
        this.burst(s.x + s.dx * along, s.z + s.dz * along, 1.5); this.burst(s.x + s.dx * (along - 0.5), s.z + s.dz * (along - 0.5), 1.1);
        this.onShake?.(0.22, 0.2);
      }
      // a glow at the running front
      const at = s.start + s.len * Math.min(1, f);
      this.p.set(s.x + s.dx * at, 0.35, s.z + s.dz * at);
      this.head.visible = t < RUN + 0.08;
      if (this.head.visible) { placeV(this.head, this.p); this.head.scale.setScalar(2.2); this.head.material.opacity = 0.55; }
      placeV(this.light, this.p); this.light.intensity = 6 * Math.max(0, 1 - t / (RUN + 0.3));
      if (t > RUN + HOLD + CLOSE + 0.3) { this.s = null; this.chasm.visible = false; this.head.visible = false; for (const R of this.ridges) R.m.visible = false; }
    }
    for (const q of this.chunks) {
      if (q.t > 1.4) { q.m.visible = false; continue; }
      q.t += dt; q.v.y -= 15 * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.size) { q.p.y = q.size; q.v.set(0, 0, 0); }
      const k = Math.max(0, Math.min(1, (1.4 - q.t) / 0.3));
      q.m.visible = k > 0; placeV(q.m, q.p); q.m.scale.setScalar(q.size * k); q.m.rotation.x += dt * 7; q.m.rotation.y += dt * 5;
    }
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.2 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.6 + 0.8 * (1 - (1 - u) * (1 - u)))); q.m.material.uniforms.uT.value = u;
    }
  }
  clear() { this.s = null; this.chasm.visible = false; this.flash.visible = false; this.head.visible = false; this.light.intensity = 0; for (const R of this.ridges) R.m.visible = false; for (const q of this.chunks) { q.t = 9; q.m.visible = false; } for (const q of this.dust) { q.t = q.life = 9; q.m.visible = false; } }
  get busy() { return !!this.s || this.dust.some((q) => q.t < q.life) || this.chunks.some((q) => q.t <= 1.4); }
}
