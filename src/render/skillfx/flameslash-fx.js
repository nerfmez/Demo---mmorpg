// Flame Slash (ฟันเพลิง, spellblade): a cut of fire that follows the blade (owner: a spellblade's effect
// comes off its sword; round 1's flames standing along the arc read as "setting fire", not a slash).
// Firebolt's fire (V5_FIELD noise, its heat ramp) in three beats:
//   1. wind-up: the sword catches fire - flame tongues run along the blade toward its tip;
//   2. the cut: one crescent of fire over the rules' arc and reach, swept the way the blade really travels
//      so its head passes the middle at the contact: a white-hot outer edge (the blade's path), an orange
//      body, its inner edge torn into flame by noise carried back along the cut, with a soft glow around;
//   3. after: it burns away from the inner edge to the outer one and rises a little, gone in half a
//      second; embers fly off (the director's FireExtras). Nothing is left burning on the ground.
// Cosmetic only; one crescent at a time (a repeat restarts it), no per-frame allocation.
import * as THREE from 'three';
import { V5_FIELD } from '../fireball-v5.js';
import { FIRE_COLORS } from './meteor-flame.js';
import { Ribbon, fxGround, addLight, place } from './fx-common.js';

const SWEEP = 0.1, BURN = 0.5, BLADE_AFTER = 0.25, TILT = 0.3; // seconds; TILT: the cut's roll (radians)
const COLS = 72, ROWS = 10;

// u along the arc in angle order (0..1), v across it (0 inner .. 1 outer)
const SHEET_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// shared: s along the cut in sweep order, the crescent's width (thick mid-arc, pointed ends, thinning as it burns)
const CUT = `uniform float uTime, uHead, uDir, uAge, uLen, uSeed;
  float widthAt(float s, float burn){ return pow(sin(3.14159*clamp(s, 0.0, 1.0)), 0.75)*(1.0 - 0.55*burn); }`;
const CRESCENT_FS = `varying vec2 vUv;` + CUT + V5_FIELD + `
  void main(){
    float u = vUv.x, v = vUv.y;
    float s = uDir > 0.0 ? u : 1.0 - u, trail = uHead - s;            // 0 at the leading edge, grows behind it
    if (trail < 0.0) discard;
    float burn = smoothstep(0.0, ${BURN.toFixed(2)}, uAge + trail*0.12);
    float w = widthAt(s, burn)*(0.2 + 0.8*smoothstep(0.0, 0.2, trail)), b = (v - (1.0 - w))/max(w, 1e-3);    // 0 inner .. 1 outer; the head runs to a point on the outer edge
    if (b < -0.35) discard;
    // fire carried back along the cut (against the sweep) and a little outward
    // streaks drawn out along the cut (long along it, narrow across), carried back against the sweep
    vec3 a = vec3(s*uLen*0.55 + uTime*2.4*uDir, b*3.4 - uTime*0.6, uSeed*3.0);
    float t = 0.34*uTime + uSeed;
    vec3 warp = vec3(fbm(a*0.95, t, 2.0), fbm(a*0.95 + vec3(19,7,31), t, 2.0), 0.0);
    float n = fbm(a + 0.8*(warp - 0.5), 0.46*uTime + uSeed, 0.65);
    // solid toward the outer edge, torn into flame toward the inner one; burning eats in from the inner edge
    float d = fbm(vec3(s*uLen*2.2, b*6.0, uSeed + 9.0) + vec3(uTime*4.0*uDir, 0.0, 0.0), 0.5*uTime, 0.6);   // fine flicker
    float f = b*1.25 - 0.2 + (n - 0.5)*2.0 + (d - 0.5)*0.7 - burn*1.0;
    float coverage = clamp(f/0.05, 0.0, 1.0)*(1.0 - smoothstep(0.97, 1.03, b));
    float fresh = exp(-trail*14.0);
    float heat = 0.45 + 0.27*smoothstep(0.35, 0.95, b) + 0.12*fresh - 0.1*burn;
    if (coverage < 0.01) discard;
    gl_FragColor = vec4(heatColor(heat, false)*1.6, coverage);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const GLOW_FS = `varying vec2 vUv;` + CUT + `
  void main(){
    float u = vUv.x, v = vUv.y;
    float s = uDir > 0.0 ? u : 1.0 - u, trail = uHead - s;
    if (trail < -0.03) discard;
    float burn = smoothstep(0.0, ${BURN.toFixed(2)}, uAge + trail*0.12);
    float w = widthAt(s, burn)*(0.2 + 0.8*smoothstep(0.0, 0.2, trail))*1.4 + 0.06, b = (v - (1.0 - w))/max(w, 1e-3);
    if (b < 0.0) discard;
    float g = smoothstep(0.0, 0.8, b)*(1.0 - smoothstep(0.88, 1.0, b))*(1.0 - burn)*(trail < 0.0 ? 1.0 + trail*33.0 : 1.0);
    gl_FragColor = vec4(vec3(1.0, 0.42, 0.08)*g*0.55, 1.0); }`;
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

let bw = 0;
const bladeW = (x) => bw * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, x * 1.3))), bladeGlowW = (x) => bw * 2.6 * (0.6 + 0.4 * x);
const ORANGE = [1, 0.5, 0.15];

export class FlameSlashFx {
  constructor(scene, camera) {
    this.time = 0; this.seed = 3;
    this.geo = sheet(COLS, ROWS);
    const uniforms = () => ({ uTime: { value: 0 }, uHead: { value: 0 }, uDir: { value: 1 }, uAge: { value: 0 }, uLen: { value: 4 }, uSeed: { value: 0 } });
    this.crescent = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: { ...fireColors(), ...uniforms() }, vertexShader: SHEET_VS, fragmentShader: CRESCENT_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
    this.glow = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: uniforms(), vertexShader: SHEET_VS, fragmentShader: GLOW_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.crescent.renderOrder = 8; this.glow.renderOrder = 7;
    for (const m of [this.crescent, this.glow]) { m.frustumCulled = false; m.visible = false; scene.add(m); }
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
  // lay the crescent over the arc: a band from 0.45 of the reach to the reach, rolled about the facing so the
  // side the blade starts from is high and the side it ends on is low (a diagonal cut), lifted off the real ground
  start() {
    const at = this.where(); this.x = at.x; this.z = at.z; this.angle = at.angle; this.started = true;
    // the fire runs the way the blade really travels round the body (the action's own sweep), else the given side
    if (Math.abs(this.spin) > 2) this.dir = Math.sign(this.spin);
    const P = this.geo.attributes.position.array, inner = this.range * 0.55, outer = this.range, roll = Math.sin(TILT) * -this.dir;
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
      const u = i / COLS, v = j / ROWS, la = (u - 0.5) * this.arc, a = this.angle + la, r = inner + (outer - inner) * v;
      const x = this.x + Math.sin(a) * r, z = this.z + Math.cos(a) * r, k = (j * (COLS + 1) + i) * 3;
      P[k] = x; P[k + 1] = fxGround.y(this.x, this.z) + 0.85 + Math.sin(la) * r * roll; P[k + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.computeBoundingSphere();
    this.seed = (this.seed * 7.31) % 97;
    for (const m of [this.crescent, this.glow]) { const u = m.material.uniforms; u.uDir.value = this.dir; u.uLen.value = this.arc * outer * 0.75; u.uSeed.value = this.seed; u.uHead.value = 0; u.uAge.value = 0; m.visible = true; }
    place(this.light, this.x + Math.sin(this.angle) * outer * 0.6, 0.9, this.z + Math.cos(this.angle) * outer * 0.6);
  }
  /** Points along the cut for the director's embers (k 0..1 in sweep order). */
  arcPoint(k, out) { const u = this.dir > 0 ? k : 1 - k, la = (u - 0.5) * this.arc, a = this.angle + la, r = this.range * 0.85; return out.set(this.x + Math.sin(a) * r, 0.85 + Math.sin(la) * r * Math.sin(TILT) * -this.dir, this.z + Math.cos(a) * r); }

  update(dt, base, tip) {
    this.time += dt;
    this.crescent.material.uniforms.uTime.value = this.time; this.glow.material.uniforms.uTime.value = this.time;
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
      for (const m of [this.crescent, this.glow]) { const u = m.material.uniforms; u.uHead.value = head; u.uAge.value = age; m.visible = age < BURN; }
      // rises a little as it burns away
      this.crescent.position.y = this.glow.position.y = 0.4 * age;
      this.light.intensity = age <= 0 ? 6 * Math.min(1, t / SWEEP * 2) : 6 * Math.exp(-age * 6);
      if (age >= BURN) { this.sweepAt = -1; this.light.intensity = 0; }
    }
  }
  clear() {
    this.sweepAt = -1; this.bladeUntil = -1; this.light.intensity = 0;
    this.crescent.visible = this.glow.visible = false;
    this.bladeFire.begin(); this.bladeFire.end(); this.bladeGlow.begin(); this.bladeGlow.end();
  }
}
