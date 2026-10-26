// Blizzard: a high-tier ice spell (job skill, 12 s cooldown, a 5 s zone) in the approved set's style
// (solid cel, flat bands, same-hue dark edge; owner 2026-10-26), with its own shapes.
//   Open: a ring of tall blade-like ice shards bursts up round the edge of the real hit area, leaning
//   out, with an overshoot; a snow floor spreads inside with hard-banded wind ripples turning slowly.
//   Hold: thick banded wind streaks spiral round the centre at a few heights, carrying outlined ice
//   chunks with them.
//   End: the shards sink and the floor and wind thin away.
// Research: docs/VFX-REFERENCE.md (2026-10-26): Guild Wars 2's Blizzard pairs the storm with jutting
// ice; moving snow sells a storm. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, place, conformPlane, mulberry32 } from './fx-common.js';
import { BAND_STRIP_FS, flatMesh, colorUniforms, shardGeometry, celProp, BANDS } from './cel-kit.js';

const SLOTS = 2, SHARDS = 16, WINDS = 6, CHUNKS = 26, OPEN = 0.35;
const FLOOR_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uT,uOpen,uA;
  void main(){ float r=length(vP), a=atan(vP.y,vP.x); float R=uOpen; if(r>R) discard;
    if(r>R-0.035){ gl_FragColor=vec4(uC3,0.95*uA); return; }
    // wind ripples: bands swept round the centre, turning
    float w = fract(r*4.0 - (a+uT*0.6)*0.6366 + 0.15*sin(a*3.0));
    vec3 c = w<0.18 ? uC1 : (w<0.24 ? uC2 : uC0);
    gl_FragColor=vec4(c, (w<0.24?0.85:0.55)*uA); }`;
let stripW = 0;
const windW = (x) => stripW * Math.sin(Math.PI * Math.pow(x, 0.8));

export class BlizzardFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(53);
    this.strip = new Ribbon(scene, camera, 1600, BAND_STRIP_FS, THREE.NormalBlending); this.strip.mesh.renderOrder = 8;
    const C = BANDS.cold; this.tint = [new THREE.Color(C[2]).r, new THREE.Color(C[2]).g, new THREE.Color(C[2]).b];
    this.slots = Array.from({ length: SLOTS }, () => {
      const floor = flatMesh(FLOOR_FS, { ...colorUniforms('cold'), uT: { value: 0 }, uOpen: { value: 0 }, uA: { value: 1 } }, 1, 24);
      scene.add(floor);
      const shards = Array.from({ length: SHARDS }, (_, i) => { const c = celProp(shardGeometry(), i % 3 ? '#a9def7' : '#d8f3ff', '#2f6aa3', 0.03); c.visible = false; scene.add(c); return { c, a: 0, h: 1, lean: 0, delay: 0 }; });
      const chunks = Array.from({ length: CHUNKS }, () => { const c = celProp(new THREE.OctahedronGeometry(1), '#eefaff', '#4a86bd', 0.25); c.visible = false; scene.add(c); return { c, a: 0, r: 0, h: 0, w: 0, s: 0.1 }; });
      const winds = Array.from({ length: WINDS }, () => ({ a: 0, r: 0, h: 0, w: 0, len: 0, pts: Array.from({ length: 8 }, () => new THREE.Vector3()) }));
      return { floor, shards, chunks, winds, live: false, t: 0, dur: 5, x: 0, z: 0, radius: 3 };
    });
  }
  // core 'area': the zone lasts e.duration
  begin(e) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], r = this.rnd;
    Object.assign(s, { live: true, t: 0, dur: e.duration || 5, x: e.x, z: e.z, radius: e.radius });
    place(s.floor, e.x, 0.03, e.z); s.floor.scale.setScalar(e.radius * 2); conformPlane(s.floor); s.floor.visible = true;
    s.shards.forEach((q, i) => { q.a = (i / SHARDS) * 6.283 + (r() - 0.5) * 0.18; q.h = (1.1 + r() * 1.0) * Math.max(0.8, e.radius / 3.6); q.lean = 0.25 + r() * 0.2; q.delay = r() * 0.12; q.c.visible = true; q.c.rotation.set(0, 0, 0); });
    s.chunks.forEach((q) => { q.a = r() * 6.283; q.r = (0.15 + 0.8 * Math.sqrt(r())) * e.radius; q.h = 0.3 + r() * 1.8; q.w = (1.4 + r() * 1.4) / Math.max(0.7, q.r * 0.55); q.s = 0.07 + r() * 0.1; q.c.visible = true; });
    s.winds.forEach((q, i) => { q.a = (i / WINDS) * 6.283; q.r = e.radius * (0.35 + (i % 3) * 0.2); q.h = 0.35 + (i % 3) * 0.55; q.w = 1.6 + r() * 0.6; q.len = 1.8 + r() * 0.8; });
  }
  update(dt) {
    this.strip.begin();
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const left = s.dur - s.t, end = Math.max(0, Math.min(1, left / 0.5)), fu = s.floor.material.uniforms;
      fu.uT.value = s.t; fu.uOpen.value = Math.min(1, s.t / OPEN) * (0.55 + 0.45 * end) ; fu.uA.value = end;
      for (const q of s.shards) {
        const age = s.t - q.delay, g = Math.max(0, Math.min(1, age / 0.16));
        const k = (g < 1 ? 1.15 * Math.sin(g * Math.PI * 0.6) / Math.sin(Math.PI * 0.6) : 1) * end; // pop up with an overshoot, sink at the end
        const rr = s.radius * 0.97;
        place(q.c, s.x + Math.cos(q.a) * rr, -0.1, s.z + Math.sin(q.a) * rr);
        q.c.rotation.set(0, -q.a, 0); q.c.rotateZ(-q.lean); // lean out
        q.c.scale.set(q.h * 0.6, q.h * Math.max(0.001, k), q.h * 0.6); q.c.visible = k > 0.01;
      }
      for (const q of s.chunks) {
        q.a += q.w * dt; const hh = q.h + 0.25 * Math.sin(s.t * 2 + q.r);
        place(q.c, s.x + Math.cos(q.a) * q.r, hh, s.z + Math.sin(q.a) * q.r);
        q.c.rotation.set(s.t * 3 + q.r, s.t * 2, 0); q.c.scale.setScalar(q.s * Math.min(1, s.t / 0.4) * end); q.c.visible = end > 0.02;
      }
      for (const q of s.winds) {
        q.a += q.w * dt; const span = q.len / Math.max(0.5, q.r), n = q.pts.length;
        for (let i = 0; i < n; i++) { const a = q.a - span * (1 - i / (n - 1)); q.pts[i].set(s.x + Math.cos(a) * q.r * (1 + 0.08 * Math.sin(i)), q.h + 0.12 * Math.sin(a * 2), s.z + Math.sin(a) * q.r * (1 + 0.08 * Math.sin(i))); }
        stripW = 0.34 * Math.min(1, s.t / 0.4) * end; if (stripW > 0.01) this.strip.strip(q.pts, windW, 1, this.tint);
      }
      if (s.t >= s.dur) { s.live = false; s.floor.visible = false; for (const q of [...s.shards, ...s.chunks]) q.c.visible = false; }
    }
    this.strip.end();
  }
  clear() { for (const s of this.slots) { s.live = false; s.floor.visible = false; for (const q of [...s.shards, ...s.chunks]) q.c.visible = false; } }
  get busy() { return this.slots.some((s) => s.live); }
}
