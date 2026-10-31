// Flame Slash (ฟันเพลิง, spellblade): the fire follows the blade (owner: a spellblade's effects come off
// its sword, not a mage's spell). Firebolt's fire (V5_FIELD noise, its heat ramp) in three beats:
//   1. wind-up: the sword catches fire - flame tongues run along the blade toward its tip and grow;
//   2. the cut: flame tongues spring up along the arc the blade sweeps (the rules' range and arc), revealed
//      the way the blade really travels so they pass the middle at the contact, hottest where just swept;
//   3. after: the tongues tear upward and burn away while a band of embers on the ground cools from
//      orange to dull red and fades (no crater, no ragged flash).
// Cosmetic only; one set of tongues (one instanced draw) and one band at a time (a repeat restarts them),
// no per-frame allocation. A first try with one upright curtain read as thin paper shards from the high camera.
import * as THREE from 'three';
import { V5_FIELD } from '../fireball-v5.js';
import { FIRE_COLORS } from './meteor-flame.js';
import { Ribbon, fxGround, addLight, place, mulberry32 } from './fx-common.js';

const SWEEP = 0.13, BURN = 0.95, BAND = 1.5, BLADE_AFTER = 0.3; // seconds
const COLS = 64, BAND_ROWS = 4, TONGUES = 34;

// the band: u along the arc in angle order (0..1), v across it
const SHEET_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// flame tongues: camera-facing quads standing along the cut (one instanced draw). Per tongue: aBase (ground
// point, world), aP (s: place in sweep order 0..1, seed, width, height). Each is a tongue shape cut out of
// Firebolt's flowing noise, hot at its root; it appears as the sweep passes it, rises and burns away.
const TONGUE_VS = `attribute vec3 aBase; attribute vec4 aP; uniform float uHead, uAge;
  varying vec2 vUv; varying vec4 vP; varying float vT;
  void main(){
    vUv = vec2(position.x, position.y); vP = aP;
    float trail = uHead - aP.x; vT = trail;
    float grow = clamp(trail*7.0, 0.0, 1.0);
    float h = aP.w*(0.35 + 0.65*grow)*(1.0 + 0.3*smoothstep(0.0, 0.3, uAge) - 0.55*smoothstep(0.3, ${BURN.toFixed(2)}, uAge));   // leaps up, then sinks as it burns out
    vec4 c = viewMatrix*vec4(aBase, 1.0);
    vec4 centre = projectionMatrix*(c + vec4(0.0, 0.0, 0.3, 0.0));                // its root's depth, a little nearer: the ground never cuts it, bodies behind stay in front
    c.xy += vec2(position.x*aP.z, position.y*h);
    gl_Position = projectionMatrix*c;
    gl_Position.z = centre.z/centre.w*gl_Position.w;
    if (trail < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
const TONGUE_FS = `uniform float uTime, uAge;
  varying vec2 vUv; varying vec4 vP; varying float vT;` + V5_FIELD + `
  void main(){
    float x = vUv.x*2.0, y = vUv.y;                                  // x -1..1 across, y 0 root .. 1 tip
    float seed = vP.y;
    // the tongue: fullest a third up, pointed tip, swaying
    float sway = 0.22*y*y*sin(uTime*7.0 + seed*6.0);
    float wid = pow(sin(3.14159*min(1.0, 0.12 + y*0.95)), 0.7)*(1.0 - 0.45*y);
    float shape = 1.0 - abs(x - sway)/max(wid, 1e-3);
    vec3 a = vec3(x*0.9, y*1.7 - uTime*2.6, seed*7.0);
    float w = 0.34*uTime + seed*3.0;
    vec3 warp = vec3(fbm(a*0.95, w, 2.0), fbm(a*0.95 + vec3(19,7,31), w, 2.0), 0.0);
    float n = fbm(a + 0.8*(warp - 0.5), 0.46*uTime + seed, 0.65);
    float burn = smoothstep(0.05, ${BURN.toFixed(2)}, uAge);
    float fresh = exp(-max(vT, 0.0)*8.0);
    float f = shape*0.75 + (n - 0.5)*2.4 - 0.12 - burn*(0.35 + 0.9*y) + 0.1*fresh;
    float coverage = clamp(f/0.06, 0.0, 1.0);
    float heat = 0.43 + 0.3*clamp(f*1.6, 0.0, 1.0)*(1.0 - 0.6*y) + 0.08*fresh - 0.08*burn;
    float alpha = coverage;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(heatColor(heat, false)*1.55, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// the ember band on the ground: u along the arc, v across it (0 inner .. 1 outer); additive light
const BAND_FS = `uniform float uTime, uHead, uDir, uAge, uLen, uSeed;
  varying vec2 vUv;` + V5_FIELD + `
  void main(){
    float u = vUv.x, v = vUv.y;
    float s = uDir > 0.0 ? u : 1.0 - u, trail = uHead - s;
    if (trail < 0.0) discard;
    float n = fbm(vec3(u*uLen*1.6, v*2.2, uSeed) + vec3(0.0, 0.0, uTime*0.25), 1.0, 0.8);
    float k = uAge/${BAND.toFixed(2)};
    float across = smoothstep(0.35, 0.7, v)*(1.0 - smoothstep(0.78, 1.0, v));   // brightest toward the outer side
    float ends = pow(sin(3.14159*u), 0.6);
    float glow = across*ends*smoothstep(0.38 + 0.25*k, 0.62 + 0.2*k, n);         // breaks into glowing patches as it cools
    vec3 hot = vec3(1.0, 0.42, 0.08), cool = vec3(0.6, 0.08, 0.02);
    vec3 c = mix(hot, cool, smoothstep(0.1, 0.6, k)) * glow * (1.0 - smoothstep(0.55, 1.0, k)) * (1.0 + 0.8*exp(-trail*10.0)) * smoothstep(0.0, 0.12, trail);   // soft leading edge
    gl_FragColor = vec4(c*0.75, 1.0);
  }`;
// flame along the blade: u from the hilt (0) to the tip (1), v across (-1..1)
const BLADE_FS = `uniform float uTime; varying vec2 vUv; varying float vA; varying vec3 vT;` + V5_FIELD + `
  void main(){
    float x = vUv.x, y = abs(vUv.y);
    vec3 a = vec3(x*2.6 - uTime*3.2, vUv.y*0.9, uTime*0.4);
    float n = fbm(a, 1.0 + 0.3*uTime, 0.65);
    float body = 1.0 - y;
    float edge = 0.48 - 0.22*x;                 // thinner toward the tip
    float cov = clamp((n*body - edge*(1.0 - body*0.4) + 0.02)/0.06, 0.0, 1.0) * smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.85, 1.0, x));
    float heat = 0.5 + 0.28*body - 0.08*x;
    float alpha = cov*vA; if (alpha < 0.01) discard;
    gl_FragColor = vec4(heatColor(heat, false)*1.5, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const BLADE_GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y); float g = pow(1.0 - d, 2.2)*smoothstep(0.0, 0.2, vUv.x)*(1.0 - smoothstep(0.8, 1.0, vUv.x));
    gl_FragColor = vec4(vec3(1.0, 0.45, 0.1)*g*0.5*vA, 1.0); }`;

function sheet(cols, rows) {
  const n = (cols + 1) * (rows + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const k = j * (cols + 1) + i; uv[k * 2] = i / cols; uv[k * 2 + 1] = j / rows; }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const fireColors = () => ({ uRim: { value: new THREE.Color(FIRE_COLORS.rim) }, uBody: { value: new THREE.Color(FIRE_COLORS.body) }, uHot: { value: new THREE.Color(FIRE_COLORS.hot) }, uCore: { value: new THREE.Color(FIRE_COLORS.core) } });
const cutUniforms = () => ({ uTime: { value: 0 }, uHead: { value: 0 }, uDir: { value: 1 }, uAge: { value: 0 }, uLen: { value: 4 }, uSeed: { value: 0 } });

let bw = 0;
const bladeW = (x) => bw * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, x * 1.3))), bladeGlowW = (x) => bw * 2.6 * (0.6 + 0.4 * x);
const ORANGE = [1, 0.5, 0.15];

export class FlameSlashFx {
  constructor(scene, camera) {
    this.time = 0; this.seed = 3;
    // the tongues: one instanced draw of camera-facing quads (root at y 0)
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    this.base = new THREE.InstancedBufferAttribute(new Float32Array(TONGUES * 3), 3); this.param = new THREE.InstancedBufferAttribute(new Float32Array(TONGUES * 4), 4);
    geo.setAttribute('aBase', this.base); geo.setAttribute('aP', this.param); geo.instanceCount = TONGUES;
    this.tongues = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...fireColors(), ...cutUniforms() }, vertexShader: TONGUE_VS, fragmentShader: TONGUE_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.tongues.renderOrder = 7; this.tongues.frustumCulled = false; this.tongues.visible = false; scene.add(this.tongues);
    this.rnd = mulberry32(41);
    this.bandGeo = sheet(COLS, BAND_ROWS);
    this.band = new THREE.Mesh(this.bandGeo, new THREE.ShaderMaterial({ uniforms: { ...fireColors(), ...cutUniforms() }, vertexShader: SHEET_VS, fragmentShader: BAND_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.band.renderOrder = 2; this.band.frustumCulled = false; this.band.visible = false; scene.add(this.band);
    this.bladeFire = new Ribbon(scene, camera, 64, BLADE_FS, THREE.NormalBlending);
    this.bladeFire.mesh.material.uniforms = { ...fireColors(), uTime: { value: 0 } }; this.bladeFire.mesh.renderOrder = 9;
    this.bladeGlow = new Ribbon(scene, camera, 64, BLADE_GLOW_FS, THREE.AdditiveBlending);
    this.light = addLight(scene, new THREE.PointLight('#ff8a3a', 0, 8, 1.6));
    this.pts = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.where = null; this.sweepAt = -1; this.contactAt = -1; this.igniteAt = -1; this.bladeUntil = -1; this.dir = 1;
    this.x = 0; this.z = 0; this.angle = 0; this.range = 3; this.arc = 2.8; this.spin = 0; this.tipAng = null;
  }
  get wantsBlade() { return this.time < this.bladeUntil; }
  /** castStart: the sword ignites now; the cut's contact lands `total` s from now. where(): caster {x, z, angle}. */
  ignite(total, where, dir, range, arcDeg) {
    this.igniteAt = this.time; this.contactAt = this.time + total; this.sweepAt = this.contactAt - SWEEP * 0.5;
    this.bladeUntil = this.contactAt + BLADE_AFTER; this.where = where; this.dir = dir || 1;
    this.range = range; this.arc = (arcDeg * Math.PI) / 180; this.started = false; this.spin = 0; this.tipAng = null;
  }
  // lay the tongues and the band along the arc, on the real ground under each
  start() {
    const at = this.where(); this.x = at.x; this.z = at.z; this.angle = at.angle; this.started = true;
    // the fire runs the way the blade really travels round the body (the action's own sweep), else the given side
    if (Math.abs(this.spin) > 2) this.dir = Math.sign(this.spin);
    const R = this.range * 0.8, inner = 0.9, outer = this.range * 1.02, bp = this.bandGeo.attributes.position.array, r = this.rnd;
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS, a = this.angle + (u - 0.5) * this.arc, sx = Math.sin(a), sz = Math.cos(a);
      for (let j = 0; j <= BAND_ROWS; j++) {
        const rr = inner + (outer - inner) * (j / BAND_ROWS), x = this.x + sx * rr, z = this.z + sz * rr, k = (j * (COLS + 1) + i) * 3;
        bp[k] = x; bp[k + 1] = fxGround.y(x, z) + 0.03; bp[k + 2] = z;
      }
    }
    this.bandGeo.attributes.position.needsUpdate = true; this.bandGeo.computeBoundingSphere();
    // tongues along the cut: the big ones on the reach, smaller ones inside; tallest mid-arc, short at the ends
    const B = this.base.array, P = this.param.array;
    for (let i = 0; i < TONGUES; i++) {
      const outerRow = i < 24, u = outerRow ? (i + 0.2 + 0.6 * r()) / 24 : (i - 24 + 0.2 + 0.6 * r()) / 10;
      const a = this.angle + (u - 0.5) * this.arc * (outerRow ? 1 : 0.9), rr = (outerRow ? R : R * 0.62) + (r() - 0.5) * 0.35, mid = Math.sin(Math.PI * u);
      const x = this.x + Math.sin(a) * rr, z = this.z + Math.cos(a) * rr;
      B[i * 3] = x; B[i * 3 + 1] = fxGround.y(x, z); B[i * 3 + 2] = z;
      P[i * 4] = this.dir > 0 ? u : 1 - u; P[i * 4 + 1] = r();
      const size = (outerRow ? 1 : 0.6) * (0.45 + 0.55 * mid) * (0.8 + 0.4 * r());
      P[i * 4 + 2] = 0.6 * size; P[i * 4 + 3] = 1.05 * size;
    }
    this.base.needsUpdate = true; this.param.needsUpdate = true;
    this.seed = (this.seed * 7.31) % 97;
    const len = this.arc * R;
    for (const m of [this.tongues, this.band]) { const u = m.material.uniforms; u.uDir.value = this.dir; u.uLen.value = len; u.uSeed.value = this.seed; u.uHead.value = 0; u.uAge.value = 0; m.visible = true; }
    place(this.light, this.x + Math.sin(this.angle) * R * 0.8, 0.9, this.z + Math.cos(this.angle) * R * 0.8);
  }
  /** Points along the arc for the director's embers (k 0..1 in sweep order). */
  arcPoint(k, out) { const u = this.dir > 0 ? k : 1 - k, a = this.angle + (u - 0.5) * this.arc, r = this.range * 0.8; return out.set(this.x + Math.sin(a) * r, 0.5, this.z + Math.cos(a) * r); }

  update(dt, base, tip) {
    this.time += dt;
    this.tongues.material.uniforms.uTime.value = this.time;
    this.band.material.uniforms.uTime.value = this.time;
    // the burning blade, from the ignition until just after the cut
    this.bladeFire.begin(); this.bladeGlow.begin();
    if (this.wantsBlade && base && tip) {
      const grow = Math.min(1, (this.time - this.igniteAt) / Math.max(0.08, this.contactAt - this.igniteAt)), out = Math.max(0, (this.time - this.contactAt) / BLADE_AFTER);
      const k = Math.min(1, grow * 1.6) * (1 - out * out), n = this.pts.length;
      // the tip's angular speed round the caster (radians per second), smoothed
      if (!this.started && this.where && dt > 0) {
        const at = this.where(), ang = Math.atan2(tip.x - at.x, tip.z - at.z);
        if (this.tipAng !== null) { let d = ang - this.tipAng; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; this.spin += (d / dt - this.spin) * 0.5; }
        this.tipAng = ang;
      }
      // a little past the tip, so the tongues lick off the end
      for (let i = 0; i < n; i++) { const s = i / (n - 1); this.pts[i].copy(base).lerp(tip, s * 1.12); this.pts[i].y += 0.06 * s; }
      bw = 0.34 * k; this.bladeGlow.strip(this.pts, bladeGlowW, k, ORANGE); this.bladeFire.strip(this.pts, bladeW, k, ORANGE);
      this.bladeFire.mesh.material.uniforms.uTime.value = this.time;
    }
    this.bladeFire.end(); this.bladeGlow.end();
    // the cut
    if (this.sweepAt >= 0 && this.time >= this.sweepAt) {
      if (!this.started) this.start();
      const t = this.time - this.sweepAt, head = Math.min(1.2, t / SWEEP * 1.2), age = Math.max(0, this.time - this.contactAt);
      { const u = this.tongues.material.uniforms; u.uHead.value = head; u.uAge.value = age; this.tongues.visible = age < BURN; }
      const bu = this.band.material.uniforms; bu.uHead.value = head; bu.uAge.value = age; this.band.visible = age < BAND;
      this.light.intensity = age <= 0 ? 6 * Math.min(1, t / SWEEP * 2) : 6 * Math.exp(-age * 3.2);
      if (age >= BAND) { this.sweepAt = -1; this.light.intensity = 0; }
    }
  }
  clear() {
    this.sweepAt = -1; this.bladeUntil = -1; this.light.intensity = 0;
    for (const m of [this.tongues, this.band]) m.visible = false;
    this.bladeFire.begin(); this.bladeFire.end(); this.bladeGlow.begin(); this.bladeGlow.end();
  }
}
