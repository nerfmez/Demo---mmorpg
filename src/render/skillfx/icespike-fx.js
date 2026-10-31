// Ice Spikes (หนามน้ำแข็ง, spellblade): the hero drives the sword into the ground and spikes of ice stab up
// out of it in a straight line ahead (the rules' lane: 'lineStrike' x, z, angle, range, width). Owner: spikes
// rising from the ground in a line, like the earth skills, but ice; round 1 (opaque pale cel crystals on a
// flat crust with an outline) "still not pretty". Round 2 follows the pixelfx bar: translucent ice lit from
// within, lines and light instead of fills, many small events. Never pictures.
//   wind-up (castStart): a cold star blooms at the blade's tip;
//   the strike: a cold light runs down the lane in 0.22 s; behind it the spikes stab up with an overshoot
//     in a left-right rhythm (a big one leaning to its side, two small ones leaning the other way), glassy
//     blue rising to a white point, over frost light on the ground (a glowing vein with fern branches);
//     shards and glints fly;
//   after: each spike flashes white and cracks apart (slender shards flung out, a glint, the spike sinking
//     away) from the near end, cold mist rises and the frost light fades.
// Cosmetic only; pooled (two instanced spike meshes, one instanced shard mesh), no per-frame allocation.
import * as THREE from 'three';
import { mulberry32, NOISE, BILLBOARD_VS, addLight, fxGround, place, conformPlane } from './fx-common.js';
import { crystalGeo } from './frost-fx.js';
import { lightSprite, starTexture, glowTexture } from './light-kit.js';

const STATIONS = 9, PER = 3, SPIKES = STATIONS * PER, CHIPS = 70, MISTS = 6, GLINTS = 10;
const FRONT = 0.22, GROW = 0.06, HOLD = 0.75, BREAK = 0.22, MELT0 = 1.3, END = 2.1; // seconds

// translucent ice for instanced crystals (tip at y 1), lit from within (pixelfx: translucent volumes,
// lines and light): a deep blue root rising to cyan and a white point, see-through where it faces the camera
// and solid at its rim, bright facet edges, thin light streaks running up inside; aFlash (per instance)
// turns it white just before it cracks
const ICE_VS = `attribute vec3 bary; attribute float aFlash; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vF;
  void main(){ vB = bary; vP = position; vF = aFlash;
    mat4 m = modelMatrix*instanceMatrix; vec4 w = m*vec4(position, 1.0);
    vN = normalize(mat3(m)*normal); vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix*viewMatrix*w; }`;
const ICE_FS = `varying vec3 vB; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vF;
  void main(){
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float y = clamp((vP.y + 0.25)/1.25, 0.0, 1.0);                             // 0 root .. 1 point
    float ndl = dot(N, normalize(vec3(-0.35, 0.8, 0.5)));
    vec3 c = mix(vec3(0.06, 0.26, 0.62), vec3(0.28, 0.72, 1.0), smoothstep(0.05, 0.7, y));
    c *= 0.8 + 0.3*step(0.1, ndl) + 0.2*step(0.55, ndl);                       // three cel steps
    float face = max(dot(N, normalize(vV)), 0.0), rim = 1.0 - face;
    c += vec3(0.35, 0.75, 1.0)*face*face*0.45*(0.4 + 0.6*y);                   // the glow inside
    float ang = atan(vP.z, vP.x);
    float streak = smoothstep(0.92, 1.0, sin(ang*3.0 + vP.y*2.5))*smoothstep(0.1, 0.5, y);
    c = mix(c, vec3(0.85, 0.97, 1.0), streak*0.55);                            // light streaks up inside
    float e = min(min(vB.x, vB.y), vB.z);
    c = mix(c, vec3(0.92, 0.99, 1.0), (1.0 - smoothstep(0.0, 0.06, e))*0.75); // bright facet edges
    c = mix(c, vec3(0.95, 1.0, 1.0), smoothstep(0.55, 0.95, rim)*0.75);        // bright rim
    c = mix(c, vec3(1.0), smoothstep(0.78, 1.0, y)*0.7);                       // the point runs white
    c = mix(c, vec3(1.0), vF);
    float a = mix(0.5, 0.95, smoothstep(0.2, 0.85, rim)) + 0.4*vF;
    gl_FragColor = vec4(c, min(1.0, a)); }`;
// frost light along the lane (x across -1..1, y along 0..1; additive): a soft cold glow and thin bright frost
// lines - a vein down the middle with fern branches slanting forward - spreading in behind the front
// (uFront, metres) and fading (uMelt); no fill, no outline
const CRUST_VS = `varying vec2 vP; void main(){ vP = vec2(uv.x*2.0 - 1.0, uv.y); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const CRUST_FS = `varying vec2 vP; uniform float uFront, uMelt, uLen, uSeed;` + NOISE + `
  void main(){
    float along = vP.y*uLen, x = vP.x;
    float ends = smoothstep(0.0, 0.6, along)*smoothstep(-0.2, 0.8, uLen - along);
    float lead = smoothstep(uFront, uFront - 0.6, along), fade = 1.0 - uMelt;
    float c0 = (fbm(vec2(along*0.8, uSeed)) - 0.5)*0.3, d = abs(x - c0);
    float glow = exp(-d*d*5.0)*0.35;
    float vein = 1.0 - smoothstep(0.015, 0.05, d);
    // fern branches: short lines leaving the vein, slanting forward, alternating sides
    float cell = along*1.6 + uSeed, fid = floor(cell), fy = fract(cell);
    float side = mod(fid, 2.0) < 1.0 ? 1.0 : -1.0, off = (x - c0)*side;
    float bl = 0.35 + 0.35*fract(sin(fid*12.9)*437.5);
    float branch = (off > 0.0 && off < bl) ? 1.0 - smoothstep(0.02, 0.06, abs(fy - 0.15 - off*0.9)) : 0.0;
    branch *= 1.0 - off/bl;
    float sparkle = step(0.985, fract(sin(dot(floor(vP*vec2(18.0, uLen*6.0)), vec2(12.9, 78.2)))*43758.5))*0.8;
    float k = (glow + max(vein*0.9, branch*0.7) + sparkle*exp(-d*3.0))*ends*lead*fade;
    if (k < 0.004) discard;
    gl_FragColor = vec4(vec3(0.45, 0.8, 1.0)*k + vec3(0.5, 0.6, 0.6)*k*k, 1.0); }`;
const MIST_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*2.0 + uSeed + vec2(uT*0.6, -uT*0.9));
    float body = n*1.2 - r*0.95 - uT*0.8;
    if (body < 0.04) discard;
    vec3 c = body > 0.3 ? vec3(0.97, 1.0, 1.0) : vec3(0.74, 0.9, 0.99);
    gl_FragColor = vec4(c, body > 0.3 ? 0.8 : 0.45); }`;

const easeBack = (k) => { const c = 2.2; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class IceSpikeFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(57); this.t = 9; this.time = 0;
    const mat = new THREE.ShaderMaterial({ vertexShader: ICE_VS, fragmentShader: ICE_FS, transparent: true, depthWrite: false });
    // two crystal shapes, alternating, so neighbours differ
    this.meshes = [crystalGeo(71), crystalGeo(83)].map((g) => { g.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(Math.ceil(SPIKES / 2)), 1)); const m = new THREE.InstancedMesh(g, mat, Math.ceil(SPIKES / 2)); m.frustumCulled = false; m.visible = false; m.renderOrder = 4; for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); scene.add(m); return m; });   // spare slots stay empty
    this.spikes = Array.from({ length: SPIKES }, (_, i) => ({ mesh: this.meshes[i % 2], slot: i >> 1, p: new THREE.Vector3(), q: new THREE.Quaternion(), w: 0.2, h: 1, at: 0, breakAt: 9, broke: false }));
    const chipGeo = crystalGeo(97); chipGeo.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(CHIPS).fill(0.35), 1));
    this.chipMesh = new THREE.InstancedMesh(chipGeo, mat, CHIPS); this.chipMesh.frustumCulled = false; this.chipMesh.visible = false; this.chipMesh.renderOrder = 4; scene.add(this.chipMesh);
    this.chips = Array.from({ length: CHIPS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), t: 9, life: 0.6, size: 0.08 }));
    this.chipI = 0;
    this.crust = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 6, 48), new THREE.ShaderMaterial({ uniforms: { uFront: { value: 0 }, uMelt: { value: 0 }, uLen: { value: 6 }, uSeed: { value: 0 } }, vertexShader: CRUST_VS, fragmentShader: CRUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.crust.geometry.translate(0, 0.5, 0); this.crust.rotation.order = 'YXZ'; this.crust.renderOrder = 2; this.crust.visible = false; scene.add(this.crust);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.mists = Array.from({ length: MISTS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), t: 9, at: 0, size: 1 }; });
    this.glints = Array.from({ length: GLINTS }, () => ({ s: lightSprite(scene, starTexture('cold'), false, 10), p: new THREE.Vector3(), at: 9 }));
    this.tipGlint = lightSprite(scene, starTexture('cold'), false, 10);
    this.front = lightSprite(scene, glowTexture('cold'), true, 9); // the cold light running ahead of the spikes
    this.glintI = 0;
    this.light = addLight(scene, new THREE.PointLight('#a8dcff', 0, 9, 1.6));
    this.windAt = -1; this.windEnd = -1; this.x = 0; this.z = 0; this.angle = 0; this.range = 6;
  }
  /** castStart: frost glints gather at the blade's tip until the strike lands `total` s from now. */
  windup(total) { this.windAt = this.time; this.windEnd = this.time + total; }
  /** lineStrike: the spikes run down the lane. */
  strike(e) {
    const r = this.rnd, dx = Math.sin(e.angle), dz = Math.cos(e.angle), sx = Math.cos(e.angle), sz = -Math.sin(e.angle), half = e.width / 2;
    this.t = 0; this.windEnd = -1; this.x = e.x; this.z = e.z; this.angle = e.angle; this.range = e.range;
    for (let st = 0; st < STATIONS; st++) {
      const along = 1.0 + (e.range - 1.0) * (st / (STATIONS - 1)), k = along / e.range, at = FRONT * k;
      const big = 1.0 + 0.9 * Math.sin(Math.PI * Math.min(1, 0.2 + 0.85 * k));       // tallest past the middle
      const lr = st % 2 ? 1 : -1;   // the big spikes alternate sides and lean that way: a clear left-right rhythm
      for (let j = 0; j < PER; j++) {
        const s = this.spikes[st * PER + j], main = j === 0, side = main ? lr * (0.18 + r() * 0.12) : -lr * (0.25 + r() * 0.3) * (j === 1 ? 1 : -0.6);
        const fwd = along + (main ? 0 : (j === 1 ? 0.25 : -0.2)) + (r() - 0.5) * 0.15, lat = side * half;
        s.p.set(e.x + dx * fwd + sx * lat, 0, e.z + dz * fwd + sz * lat); s.p.y = fxGround.y(s.p.x, s.p.z) - 0.12;
        s.h = (main ? big : big * (0.38 + r() * 0.18)) * (0.9 + r() * 0.2); s.w = (main ? 0.17 : 0.1) * (0.9 + r() * 0.2);
        // lean: forward along the lane, out to its own side; then turned to the lane
        _e.set(main ? 0.3 + r() * 0.1 : 0.12 + r() * 0.12, r() * 6.283, 0, 'YXZ'); _q.setFromEuler(_e);
        _e.set(0, 0, -Math.sign(side) * (main ? 0.22 : 0.55), 'XYZ'); _q2.setFromEuler(_e); _q.premultiply(_q2);
        _q2.setFromAxisAngle(_y, e.angle); s.q.copy(_q).premultiply(_q2);
        s.at = at + (main ? 0 : 0.03 + r() * 0.04); s.breakAt = HOLD + at * 1.6 + r() * 0.08; s.broke = false;
      }
      // chips and a glint as each station breaks through
      if (st % 2 === 0) this.chipBurst(e.x + dx * along, e.z + dz * along, 3, 0.25, at);
    }
    this.glintI = 5;
    for (let i = 0; i < 5; i++) { const g = this.glints[i], s = this.spikes[(i * 2) * PER]; g.p.copy(s.p).addScaledVector(_p.set(0, 1, 0).applyQuaternion(s.q), s.h * 0.95); g.p.y -= fxGround.y(g.p.x, g.p.z); g.at = s.at + GROW; }
    for (const m of this.meshes) m.visible = true; this.chipMesh.visible = true;
    // the crust along the lane
    const len = e.range + 0.4;
    place(this.crust, e.x, 0.03, e.z); this.crust.rotation.set(-Math.PI / 2, e.angle + Math.PI, 0); this.crust.scale.set(e.width * 1.5, len, 1);
    const C = this.crust.material.uniforms; C.uLen.value = len; C.uSeed.value = r() * 30; C.uFront.value = 0; C.uMelt.value = 0;
    conformPlane(this.crust, 0.03); this.crust.visible = true;
    place(this.light, e.x + dx * e.range * 0.5, 1, e.z + dz * e.range * 0.5);
  }
  chipBurst(x, z, n, spread, delay) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const c = this.chips[this.chipI++ % CHIPS], a = r() * 6.283, sp = 1.2 + r() * 2.2;
      c.p.set(x + (r() - 0.5) * spread, 0.25 + r() * 0.4, z + (r() - 0.5) * spread); c.v.set(Math.cos(a) * sp, 2.5 + r() * 2.5, Math.sin(a) * sp);
      c.spin.set(r() * 12 - 6, r() * 12 - 6, r() * 12 - 6); c.rot.set(r() * 6, r() * 6, r() * 6); c.t = -delay; c.life = 0.5 + r() * 0.3; c.size = 0.07 + r() * 0.06;
    }
  }
  mist(x, z, at, size) { const q = this.mists.find((m) => m.t >= 1.4) || this.mists[0]; q.p.set(x, 0.35, z); q.t = -at; q.size = size; q.m.material.uniforms.uSeed.value = this.rnd() * 40; }

  update(dt, tip) {
    this.time += dt;
    const cam = this.camera.quaternion;
    // wind-up: a cold star blooms at the blade's tip
    const winding = this.windEnd > this.time && tip;
    this.tipGlint.visible = !!winding;
    if (winding) { const k = (this.time - this.windAt) / Math.max(0.05, this.windEnd - this.windAt); place(this.tipGlint, tip.x, tip.y, tip.z); this.tipGlint.scale.setScalar(0.25 + 0.45 * k * (1 + 0.15 * Math.sin(this.time * 40))); this.tipGlint.material.rotation = this.time * 4; this.tipGlint.material.opacity = Math.min(1, k * 2); }
    if (this.t >= END) return;
    const t = (this.t += dt);
    // spikes: stab up with an overshoot, hold, then crack apart and sink away
    for (const s of this.spikes) {
      let k = (t - s.at) / GROW;
      if (k <= 0) { s.mesh.setMatrixAt(s.slot, ZERO); continue; }
      let hk = easeBack(Math.min(1, k)), wk = Math.min(1, 0.35 + 0.65 * Math.min(1, k));
      const b = (t - s.breakAt) / BREAK, fl = Math.min(1, Math.max(0, (t - s.breakAt + 0.1) / 0.1));
      s.mesh.geometry.attributes.aFlash.array[s.slot] = b > 0 ? Math.max(0, 1 - b * 2.5) : fl * fl;   // whitens, then cracks
      if (b > 0) {
        if (!s.broke) {
          s.broke = true; _p.set(0, 1, 0).applyQuaternion(s.q);
          this.chipBurst(s.p.x + _p.x * s.h * 0.5, s.p.z + _p.z * s.h * 0.5, s.h > 1 ? 3 : 1, s.w * 2, 0);
          if (s.h > 1) { const g = this.glints[this.glintI++ % GLINTS]; g.p.set(s.p.x + _p.x * s.h * 0.6, s.h * 0.55, s.p.z + _p.z * s.h * 0.6); g.at = t; }
        }
        hk *= Math.max(0, 1 - b) * (1 - 0.3 * Math.min(1, b)); wk *= Math.max(0, 1 - b * 0.7);
      }
      if (hk <= 0.001) { s.mesh.setMatrixAt(s.slot, ZERO); continue; }
      _m.compose(s.p, s.q, _s.set(s.w * wk, s.h * hk, s.w * wk)); s.mesh.setMatrixAt(s.slot, _m);
    }
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aFlash.needsUpdate = true; }
    // chips: flung, falling, tumbling, shrinking away
    for (let i = 0; i < CHIPS; i++) {
      const c = this.chips[i];
      if (c.t >= c.life) { this.chipMesh.setMatrixAt(i, ZERO); continue; }
      c.t += dt; if (c.t < 0) { this.chipMesh.setMatrixAt(i, ZERO); continue; }
      c.v.y -= 11 * dt; c.p.addScaledVector(c.v, dt); if (c.p.y < 0.03) { c.p.y = 0.03; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.3; }
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt; _q.setFromEuler(c.rot);
      const sz = c.size * Math.min(1, 2.5 * (1 - c.t / c.life));
      _p.set(c.p.x, c.p.y + fxGround.y(c.p.x, c.p.z), c.p.z); _m.compose(_p, _q, _s.set(sz * 0.45, sz * 2.6, sz * 0.45)); this.chipMesh.setMatrixAt(i, _m);
    }
    this.chipMesh.instanceMatrix.needsUpdate = true;
    // the crust: spreads with the front, melts inward at the end
    const C = this.crust.material.uniforms; C.uFront.value = (this.range + 0.9) * Math.min(1, t / FRONT); C.uMelt.value = Math.min(1, Math.max(0, (t - MELT0) / (END - MELT0)));
    const fk = t / (FRONT + 0.06); this.front.visible = fk < 1;
    if (this.front.visible) { const f = (this.range + 0.4) * Math.min(1, t / FRONT); place(this.front, this.x + Math.sin(this.angle) * f, 0.3, this.z + Math.cos(this.angle) * f); this.front.scale.setScalar(1.1); this.front.material.opacity = 1 - fk * fk; }
    // glints on the spike points, a cold light with the front
    for (const g of this.glints) {
      const k = (t - g.at) / 0.35; g.s.visible = k > 0 && k < 1;
      if (g.s.visible) { place(g.s, g.p.x, g.p.y, g.p.z); g.s.scale.setScalar(0.55 * Math.sin(Math.PI * k)); g.s.material.rotation = k * 1.5; g.s.material.opacity = 1; }
    }
    this.light.intensity = t < FRONT ? 5 * t / FRONT : 5 * Math.exp(-(t - FRONT) * 3);
    // cold mist as the spikes break
    if (t - dt < HOLD && t >= HOLD) for (let i = 0; i < 4; i++) { const f = (i + 0.5) / 4 * this.range; this.mist(this.x + Math.sin(this.angle) * f, this.z + Math.cos(this.angle) * f, i * 0.08, 0.9 + this.rnd() * 0.4); }
    for (const q of this.mists) {
      if (q.t >= 1.4) { q.m.visible = false; continue; }
      q.t += dt; q.m.visible = q.t > 0; if (!q.m.visible) continue;
      const k = q.t / 1.4; q.m.material.uniforms.uT.value = k; place(q.m, q.p.x, q.p.y + 0.4 * k, q.p.z); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * (1 + 0.6 * k));
    }
    if (t >= END) this.clear();
  }
  clear() {
    this.t = 9; this.windEnd = -1; this.crust.visible = false; this.light.intensity = 0; this.tipGlint.visible = false; this.front.visible = false;
    for (const m of this.meshes) m.visible = false; this.chipMesh.visible = false;
    for (const c of this.chips) c.t = 9; for (const q of this.mists) { q.t = 9; q.m.visible = false; } for (const g of this.glints) g.s.visible = false;
  }
}
