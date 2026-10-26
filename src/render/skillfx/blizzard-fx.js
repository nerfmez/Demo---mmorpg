// Blizzard, made the way the owner's best effects are made (.claude/skills/skill-vfx: Firebolt's
// see-through layers cut from flowing noise, Frost Nova's clean cel frost, Chain Spark-clean motion)
// and sized for a job skill (12 s cooldown, a 5 s zone that slows): a snowstorm held over the area.
//   Open: Frost Nova's cel frost spreads out to the true radius; a wall of wind rises round its edge,
//   wind streaks cut from noise that is carried round the circle (see-through where it faces the
//   camera, so the monsters inside and their wind-ups stay readable).
//   Hold: snow streaks and flakes spiral round the centre at a few heights, faster near the middle; drifts of
//   snow sweep round over the frost; a cold light.
//   End: the wall tears apart and thins away, the streaks fade, the frost melts inward. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, conformPlane, addLight, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf } from './light-kit.js';
import { V5_FIELD } from '../fireball-v5.js';

const SLOTS = 2, STREAKS = 40, FLAKES = 22, TRAIL = 7, WALL_H = 1.9;
// ground frost (Frost Nova's look): a flat cel decal, scalloped edge, a light rim band, a thin same-hue
// line; snow drifts sweep round over it (noise carried round the centre); grows out, melts inward
const FROST_FS = `varying vec2 vP; uniform float uGrow; uniform float uMelt; uniform float uT; uniform float uA;` + NOISE + `
  void main(){
    float r = length(vP), ang = atan(vP.y, vP.x);
    float sc = abs(sin(ang*6.5 + 0.7));
    float edge = (0.9 + 0.06*sc + 0.04*pow(1.0 - sc, 6.0)) * uGrow * (1.0 - 0.9*uMelt*uMelt);
    if (r > edge) discard;
    float e = (edge - r)/max(edge, 0.01);
    vec3 c = vec3(0.72, 0.89, 0.98); float a = 0.62;
    if (e < 0.09) { c = vec3(0.9, 0.97, 1.0); a = 0.85; }
    if (e < 0.022) { c = vec3(0.44, 0.71, 0.93); a = 0.92; }
    // drifts: noise in polar coordinates, carried round the centre
    float sw = ang - uT*0.9 + r*1.6;
    float d = fbm(vec2(cos(sw), sin(sw))*1.7*r + vec2(r*3.0, uT*0.2));
    float drift = smoothstep(0.56, 0.6, d) * smoothstep(0.08, 0.3, r);
    c = mix(c, vec3(0.97, 0.995, 1.0), drift*0.85); a = mix(a, 0.9, drift);
    gl_FragColor = vec4(c, a*uA); }`;
const FROST_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
// the wind wall: an open ring, base at 0, height 1 (scaled); Firebolt's warped noise carried round
// the circle, stretched along it into streaks; white cores, pale blue body, a thin blue edge;
// see-through where it faces the camera
const WALL_VS = `varying vec3 vO; varying vec3 vN; varying vec3 vV;
  void main(){ vO = position; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const WALL_FS = `uniform float uT, uA, uCut, uSeed, uSpin;
  varying vec3 vO; varying vec3 vN; varying vec3 vV;` + V5_FIELD + `
  void main(){
    float ang = atan(vO.z, vO.x) - uT*uSpin, y = clamp(vO.y, 0.0, 1.0);
    vec3 q = vec3(cos(ang)*1.15, y*3.4 - uT*0.25, sin(ang)*1.15) + vec3(uSeed, 0.0, uSeed*0.7);
    float w = 0.3*uT + uSeed;
    vec3 warp = vec3(fbm(q*0.9, w, 1.5), fbm(q*0.9 + vec3(19,7,31), w, 1.5), fbm(q*0.9 + vec3(47,23,11), w, 1.5));
    float n = fbm(q + 0.6*(warp - 0.5), 0.46*uT + uSeed, 0.8);
    float thr = 0.5 + 0.16*y + uCut;
    float cov = clamp((n - thr + 0.012)/0.034, 0.0, 1.0);
    float mask = smoothstep(0.0, 0.14, y) * (1.0 - smoothstep(0.62, 1.0, y));
    vec3 c = mix(vec3(0.44, 0.72, 0.95), vec3(0.8, 0.94, 1.0), smoothstep(thr + 0.03, thr + 0.07, n));
    c = mix(c, vec3(1.0), smoothstep(thr + 0.12, thr + 0.17, n));
    float face = abs(dot(normalize(vN), normalize(vV)));
    float a = cov*mask*uA*mix(1.0, 0.45, smoothstep(0.35, 0.9, face));
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a); }`;
let streakW = 0;
const streakCore = (x) => streakW * Math.sin(Math.PI * x) * x, streakGlow = (x) => streakW * 2.4 * x;

export class BlizzardFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(17); this.time = 0;
    this.core = new Ribbon(scene, camera, 5000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.look = lightOf('cold');
    const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 80, 6, true); wallGeo.translate(0, 0.5, 0); wallGeo.userData.shared = true;
    const wall = (seed, spin) => { const m = new THREE.Mesh(wallGeo, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCut: { value: 0 }, uSeed: { value: seed }, uSpin: { value: spin } }, vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 6; m.visible = false; scene.add(m); return m; };
    this.slots = Array.from({ length: SLOTS }, (_, i) => {
      const frost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({ uniforms: { uGrow: { value: 0 }, uMelt: { value: 0 }, uT: { value: 0 }, uA: { value: 1 } }, vertexShader: FROST_VS, fragmentShader: FROST_FS, transparent: true, depthWrite: false }));
      frost.rotation.x = -Math.PI / 2; frost.renderOrder = 1; frost.visible = false; scene.add(frost);
      return {
        live: false, t: 0, dur: 5, x: 0, z: 0, radius: 3.8, frost, walls: [wall(i * 3.1, 0.9), wall(i * 3.1 + 7.7, 1.5)],
        streaks: Array.from({ length: STREAKS + FLAKES }, () => ({ a: 0, r: 1, h: 1, w: 0.05, spin: 1, ph: 0, len: 0.6, pts: Array.from({ length: TRAIL }, () => new THREE.Vector3()) })),
      };
    });
    this.light = addLight(scene, new THREE.PointLight('#bfe9ff', 0, 9, 1.6));
  }
  // core 'area': the zone opens
  begin(e) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], r = this.rnd;
    Object.assign(s, { live: true, t: 0, dur: e.duration || 5, x: e.x, z: e.z, radius: e.radius });
    place(s.frost, e.x, 0.03, e.z); s.frost.scale.setScalar(e.radius * 2); conformPlane(s.frost); s.frost.visible = true;
    s.walls.forEach((m, k) => { place(m, e.x, 0, e.z); m.scale.set(e.radius * (1 - 0.04 * k), WALL_H * (1 - 0.3 * k), e.radius * (1 - 0.04 * k)); m.visible = true; });
    s.streaks.forEach((q, i) => {
      q.r = e.radius * (0.18 + 0.78 * Math.sqrt(r())); q.a = r() * 6.283; q.h = 0.25 + r() * 1.9; q.ph = r() * 6;
      q.spin = (2.6 / Math.max(0.8, q.r)) * (0.8 + r() * 0.4); q.w = i < 12 ? 0.07 + r() * 0.03 : 0.025 + r() * 0.02; q.len = 0.5 + r() * 0.6;
      if (i >= STREAKS) { q.w = 0.09 + r() * 0.05; q.len = 0.1 + r() * 0.06; q.h = 0.3 + r() * 2.4; }   // snow flakes: short, fat, white
    });
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    let light = 0;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const t = s.t, end = s.dur, open = Math.min(1, t / 0.35), close = Math.max(0, Math.min(1, (end - t) / 0.6));
      // ground frost: grows out, holds, melts inward
      const F = s.frost.material.uniforms; F.uGrow.value = 1 - Math.pow(1 - open, 3); F.uMelt.value = 1 - close; F.uT.value = this.time;
      // the wind wall: rises with a small overshoot, tears apart at the end
      const rise = open < 1 ? 1 - Math.pow(1 - open, 3) * Math.cos(open * 4) : 1;
      s.walls.forEach((m, k) => {
        const U = m.material.uniforms; U.uT.value = this.time; U.uA.value = Math.min(1, open * 1.5) * (0.3 + 0.7 * close);
        U.uCut.value = 0.35 * (1 - close); m.scale.y = WALL_H * (1 - 0.3 * k) * Math.max(0.05, rise);
      });
      // snow streaks: spiral round the centre, a curved trail along their own path
      const fade = open * close;
      for (const q of s.streaks) {
        q.a += q.spin * dt;
        const flick = 0.6 + 0.4 * Math.sin(this.time * 3 + q.ph);
        for (let j = 0; j < TRAIL; j++) {
          const u = j / (TRAIL - 1), a = q.a - q.len * (1 - u) / Math.max(0.5, q.r) * 1.6, rr = q.r * (1 + 0.04 * (1 - u));
          q.pts[j].set(s.x + Math.cos(a) * rr, q.h + 0.15 * Math.sin(a * 2 + q.ph), s.z + Math.sin(a) * rr);
        }
        streakW = q.w;
        this.glow.strip(q.pts, streakGlow, 0.55 * fade * flick, this.look.glow);
        this.core.strip(q.pts, streakCore, fade * flick, this.look.edge);
      }
      light = Math.max(light, 4 * fade);
      place(this.light, s.x, 1.5, s.z);
      if (t >= end) { s.live = false; s.frost.visible = false; for (const m of s.walls) m.visible = false; }
    }
    this.light.intensity = light;
    this.core.end(); this.glow.end();
  }
  clear() { for (const s of this.slots) { s.live = false; s.frost.visible = false; for (const m of s.walls) m.visible = false; } this.light.intensity = 0; }
  get busy() { return this.slots.some((s) => s.live); }
}
