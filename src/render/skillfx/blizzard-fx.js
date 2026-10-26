// Blizzard, in the bench's light-and-ribbon language. For the zone's whole duration (the core 'area'
// event's duration) the ground inside the circle frosts over: a pale swirl that turns slowly, with a
// crisp jagged ice rim at the edge of the real hit area. Inside it the wind drives snow around the
// centre: short white streaks circling at different heights and speeds, with flakes drifting down
// through them. It eases in, holds, and thins away at the end. Element Shifts recolour it. Cosmetic only.
// Studied (principles only, docs/VFX-REFERENCE.md): a lingering ground zone kept as its own layer under
// the moving particles, readable edge = real hit area; Frost Nova's frost colours in this game.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, place, conformPlane, NOISE } from './fx-common.js';

const SLOTS = 2, STREAKS = 70, FLAKES = 40;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.85) discard; gl_FragColor=vec4(mix(vT, vec3(1.0), 0.7), vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.0)*0.5; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the frosted ground: a slow swirl inside, a jagged ice rim at the edge
const FIELD_FS = `varying vec2 vP; uniform float uT; uniform float uA; uniform vec3 uCol;` + NOISE + `
  void main(){ float r=length(vP); float th=atan(vP.y,vP.x);
    float tri = abs(fract(th*2.2282 + 0.13*sin(th*3.0))*2.0-1.0); // 14 ice points round the edge
    float rim = 0.885 + 0.09*tri;
    if(r>rim+0.035) discard;
    float sw = fbm(vec2(cos(th+uT*0.5+r*2.2), sin(th+uT*0.5+r*2.2))*r*3.2 + 4.0);
    float a = 0.16 + 0.22*smoothstep(0.45,0.8,sw);
    vec3 c = mix(uCol, vec3(1.0), 0.45 + 0.4*sw);
    if (r > rim - 0.02) { a = 0.85; c = mix(uCol, vec3(1.0), 0.8); }
    gl_FragColor = vec4(c, a*uA); }`;
const VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;

let stripW = 0;
const streakW = (x) => stripW * Math.sin(Math.PI * x), flakeW = () => stripW;

export class BlizzardFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 2600, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(47);
    this.slots = Array.from({ length: SLOTS }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color() } }, vertexShader: VS, fragmentShader: FIELD_FS, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.visible = false; scene.add(m);
      // each streak: angle, radius, height, angular speed; each flake: x, z offsets, fall phase
      const streaks = Array.from({ length: STREAKS }, () => ({ a: 0, r: 0, h: 0, w: 0, len: 0 }));
      const flakes = Array.from({ length: FLAKES }, () => ({ x: 0, z: 0, ph: 0, sp: 0 }));
      return { m, streaks, flakes, live: false, t: 0, dur: 5, x: 0, z: 0, radius: 3, look: null };
    });
    this.pts = Array.from({ length: 5 }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
  }
  // core 'area' event: the zone lasts e.duration
  begin(e, element) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], r = this.rnd, look = lookOf(element);
    Object.assign(s, { live: true, t: 0, dur: e.duration || 5, x: e.x, z: e.z, radius: e.radius, look });
    place(s.m, e.x, 0.03, e.z); s.m.scale.setScalar(e.radius * 2); conformPlane(s.m); s.m.visible = true;
    s.m.material.uniforms.uCol.value.setRGB(look.glow[0], look.glow[1], look.glow[2]);
    for (const q of s.streaks) { q.a = r() * 6.283; q.r = (0.15 + 0.85 * Math.sqrt(r())) * e.radius; q.h = 0.15 + r() * 2.2; q.w = (1.6 + r() * 1.8) / Math.max(0.6, q.r * 0.6); q.len = 0.35 + r() * 0.45; }
    for (const f of s.flakes) { const a = r() * 6.283, d = Math.sqrt(r()) * e.radius; f.x = Math.cos(a) * d; f.z = Math.sin(a) * d; f.ph = r(); f.sp = 0.5 + r() * 0.6; }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const pts = this.pts, two = this.two;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const fade = Math.min(1, s.t / 0.35) * (1 - THREE.MathUtils.smoothstep(s.t, s.dur - 0.45, s.dur));
      s.m.material.uniforms.uT.value = s.t; s.m.material.uniforms.uA.value = fade;
      if (s.t >= s.dur) { s.live = false; s.m.visible = false; continue; }
      // wind-driven streaks: short arcs along each one's circle, the wind slanting them slightly upward
      for (const q of s.streaks) {
        q.a += q.w * dt;
        const span = q.len / Math.max(0.3, q.r);
        for (let i = 0; i < 5; i++) {
          const a = q.a - span * (1 - i / 4), h = q.h + 0.12 * Math.sin(q.a * 2 + q.r) + i * 0.02;
          pts[i].set(s.x + Math.cos(a) * q.r, h, s.z + Math.sin(a) * q.r);
        }
        stripW = 0.07; this.glow.strip(pts, streakW, 0.55 * fade, s.look.glow);
        stripW = 0.035; this.core.strip(pts, streakW, 0.9 * fade, s.look.spark);
      }
      // flakes drifting down through the wind, round and round
      for (const f of s.flakes) {
        const k = (s.t * f.sp + f.ph) % 1, a = s.t * 0.9 + f.ph * 6.283, y = 2.8 * (1 - k);
        two[0].set(s.x + f.x + Math.cos(a) * 0.25, y + 0.06, s.z + f.z + Math.sin(a) * 0.25); two[1].set(two[0].x + 0.05, y, two[0].z);
        stripW = 0.07; this.core.strip(two, flakeW, fade * Math.min(1, k * 6) * Math.min(1, (1 - k) * 6), s.look.spark);
      }
    }
    this.core.end(); this.glow.end();
  }
  clear() { for (const s of this.slots) { s.live = false; s.m.visible = false; } }
  get busy() { return this.slots.some((s) => s.live); }
}
