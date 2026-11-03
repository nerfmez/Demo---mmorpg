// Gravity Rune (the trapper's arcane trap, 2026-11-01; core: springTrap with the skill's `pull` {radius, time}:
// monsters, not bosses, are drawn to the middle over pull.time; the burst hits the small circle). Its plate is
// a stone disc with a violet rune ring that glows once armed (skillfx/trap-fx.js). When it springs:
//   circle: a rune circle of violet light opens on the ground out to the pull's true reach (an outer and an
//     inner ring with glyph ticks between them, turning), and spiral arms of light wind in toward the middle,
//     flowing inward while it pulls;
//   pull: streaks of light are drawn in along the spiral from the reach to the middle, faster as they near it;
//   collapse: at the end of the pull the circle shrinks into the middle, a ring snaps in, a star glint and a
//     short ring out to the burst's radius, a violet light.
// Lines and light, no fills; never pictures. Not Hex's curse ring (that lies still): this one turns and pulls.
// Pooled (2 circles, one ribbon pair), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight, place, conformPlane } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, lightSprite, starTexture } from './light-kit.js';

const LOOK = lightOf('arcane'), VIOLET = [0.78, 0.68, 1.0];
const CIRCLES = 2, STREAKS = 40, OPEN = 0.12, FADE = 0.45;
// the rune circle (additive; uv -1..1 over the pull's reach): rings, glyph ticks, spiral arms flowing in
const RUNE_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RUNE_FS = `varying vec2 vP; uniform float uA, uRot, uFlow, uPull;
  float line(float d, float w){ return 1.0 - smoothstep(w*0.5, w, abs(d)); }
  void main(){
    float r = length(vP); if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    // two rings and glyph ticks between them (12, alternating long and short), turning one way
    float k = line(r - 0.96, 0.012) + line(r - 0.84, 0.008)*0.8;
    float ga = a + uRot, cell = ga/6.2832*24.0, f = fract(cell) - 0.5, id = floor(cell);
    float across = f*6.2832*r/24.0;                                       // distance across a tick (in radii)
    float tick = (r > 0.86 && r < 0.94) ? line(across, 0.014) * (mod(id, 2.0) < 1.0 ? 1.0 : step(abs(r - 0.9), 0.022)) : 0.0;
    // a small diamond outline on every fourth tick
    float dm = (mod(id, 4.0) < 1.0) ? line(abs(across) + abs(r - 0.9) - 0.03, 0.01) : 0.0;
    // spiral arms (5) winding in, flowing toward the middle while it pulls
    float arms = 5.0, sp = a*arms/6.2832 + log(max(r, 0.02))*2.2 + uFlow;
    float arm = line(fract(sp) - 0.5, 0.07) * smoothstep(0.05, 0.25, r) * smoothstep(0.84, 0.6, r) * uPull;
    float glow = (1.0 - r)*0.12*uPull;
    float v = (k*0.5 + max(tick, dm)*0.45 + arm*0.4 + glow)*uA;
    if (v < 0.004) discard;
    gl_FragColor = vec4(vec3(0.55, 0.38, 1.0)*v + vec3(0.25, 0.2, 0.35)*v*v, 1.0); }`;
let sw = 0;
const lineW = (x) => sw * Math.sin(Math.PI * x), lineGlowW = (x) => sw * 2.6 * Math.sin(Math.PI * x);

export class RuneFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(37); this.time = 0;
    this.core = new Ribbon(scene, camera, 1200, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 1200, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    const disc = new THREE.PlaneGeometry(1, 1, 8, 8);
    this.circles = Array.from({ length: CIRCLES }, () => {
      const m = new THREE.Mesh(disc, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uFlow: { value: 0 }, uPull: { value: 1 } }, vertexShader: RUNE_VS, fragmentShader: RUNE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m);
      const snap = new THREE.Mesh(disc, new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uFlow: { value: 0 }, uPull: { value: 0 } }, vertexShader: RUNE_VS, fragmentShader: RUNE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      snap.rotation.x = -Math.PI / 2; snap.renderOrder = 2; snap.visible = false; scene.add(snap);
      return { m, snap, star: lightSprite(scene, starTexture('arcane'), false, 10), t: 99, x: 0, z: 0, R: 4.5, burst: 1.6, pull: 0.8, done: false };
    });
    this.circleI = 0;
    this.streaks = Array.from({ length: STREAKS }, () => ({ c: null, a: 0, t: 99, life: 0.5, w: 0.05, turn: 1 }));
    this.streakI = 0;
    this.light = addLight(scene, new THREE.PointLight('#a98cff', 0, 8, 1.6)); this.lightT = 9;
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  /** The rules' trapSprung of a Gravity Rune at (x, z): R the pull's reach, burst the hit's radius, pull its time. */
  open(x, z, R, burst, pull) {
    const c = this.circles[this.circleI++ % CIRCLES];
    Object.assign(c, { t: 0, x, z, R, burst, pull, done: false });
    c.m.visible = true; place(c.m, x, 0.035, z); c.m.scale.setScalar(R * 2); conformPlane(c.m, 0.035);
    place(this.light, x, 1, z); this.lightT = 0;
  }
  // a pooled streak drawn in along the spiral (a: its start angle)
  streak(c, a, delay) { const s = this.streaks[this.streakI++ % STREAKS]; Object.assign(s, { c, a, t: -delay, life: 0.45 + this.rnd() * 0.2, w: 0.04 + this.rnd() * 0.03, turn: 1.4 + this.rnd() * 0.6 }); }
  // a point on the spiral at fraction u (0 the reach .. 1 the middle) from angle a
  spiralPoint(c, s, u, out) { const r = c.R * 0.95 * (1 - u) ** 1.35, a = s.a + s.turn * u; return out.set(c.x + Math.cos(a) * r, 0.25 + 0.25 * (1 - u), c.z + Math.sin(a) * r); }

  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    for (const c of this.circles) {
      if (c.t >= 90) continue;
      c.t += dt; const t = c.t, U = c.m.material.uniforms;
      // open in a few frames, turn and flow while it pulls, then shrink into the middle and fade
      const open = Math.min(1, t / OPEN), shrink = Math.max(0, (t - c.pull) / FADE);
      U.uA.value = open * (1 - shrink); U.uRot.value = t * 1.6; U.uFlow.value = t * 3.2; U.uPull.value = Math.max(0, 1 - shrink * 1.5);
      c.m.scale.setScalar(c.R * 2 * (0.85 + 0.15 * open) * (1 - 0.7 * shrink * shrink));
      // streaks drawn in while it pulls
      if (t < c.pull && Math.floor(t * 30) !== Math.floor((t - dt) * 30)) for (let i = 0; i < 2; i++) this.streak(c, this.rnd() * 6.283, 0);
      // the collapse: a ring snapping in to the burst's circle, a star glint where it ends
      if (!c.done && t >= c.pull) { c.done = true; c.snap.visible = true; place(c.snap, c.x, 0.04, c.z); this.lightT = 0.05; }
      const sk = (t - c.pull) / 0.3;
      c.snap.visible = sk >= 0 && sk < 1;
      if (c.snap.visible) { const S = c.snap.material.uniforms; S.uA.value = 1 - sk; S.uRot.value = -t * 3; c.snap.scale.setScalar(Math.max(0.1, c.burst * 2 * (1.6 - 0.6 * Math.min(1, sk * 3)))); }
      const gk = (t - c.pull + 0.05) / 0.35; c.star.visible = gk > 0 && gk < 1;
      if (c.star.visible) { place(c.star, c.x, 0.6, c.z); c.star.scale.setScalar(1.3 * Math.sin(Math.PI * gk)); c.star.material.rotation = gk * 1.8; c.star.material.opacity = 1; }
      if (shrink >= 1) { c.t = 99; c.m.visible = false; c.snap.visible = false; c.star.visible = false; }
    }
    // the streaks: drawn in along the spiral, a short bright head with a thin tail, faster near the middle
    const P = this.three;
    for (const s of this.streaks) {
      if (s.t >= s.life || !s.c) continue;
      s.t += dt; if (s.t < 0) continue;
      const u = Math.min(1, (s.t / s.life) ** 1.6), a = Math.min(1, s.t * 8) * (1 - Math.max(0, (u - 0.85) / 0.15));
      for (let i = 0; i < 4; i++) this.spiralPoint(s.c, s, Math.max(0, u - (3 - i) * 0.06), P[i]);
      sw = s.w; this.glow.strip(P, lineGlowW, 0.8 * a, LOOK.glow); this.core.strip(P, lineW, 0.85 * a, VIOLET);
    }
    this.core.end(); this.glow.end();
    if (this.lightT < 0.5) { this.lightT += dt; this.light.intensity = 4 * (1 - this.lightT / 0.5); } else this.light.intensity = 0;
  }
  clear() {
    for (const c of this.circles) { c.t = 99; c.m.visible = false; c.snap.visible = false; c.star.visible = false; }
    for (const s of this.streaks) s.t = 99; this.light.intensity = 0;
  }
}
