// Thunderstorm: a high-tier lightning spell (job skill, 11 s cooldown) in the approved set's style
// (solid cel, flat bands, same-hue dark edge; owner 2026-10-26), with its own shapes.
//   Gather: an electric circle draws round the real hit area (two banded rings with a zigzag band
//   between them) under a storm's shadow.
//   Each wave ('burst'): two thick banded bolts with forks come down from the sky inside the circle,
//   the circle flashes, and each landing leaves a spiky star on the ground and short crawling arcs.
//   Last wave: one big central bolt, a bigger star and a banded shock ring.
// Research: docs/VFX-REFERENCE.md (2026-10-26): short punchy strikes, a few-frame impact. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, place, conformPlane, mulberry32 } from './fx-common.js';
import { BAND_STRIP_FS, flatMesh, colorUniforms, STAR_FS, BANDS } from './cel-kit.js';

// no cloud mesh: from the game camera a cloud overhead would hide the circle and the monsters' wind-ups,
// so the storm is a shadow on the ground and the bolts come down from the sky above the screen
const SLOTS = 2, BOLTS = 8, STARS = 8, ARCS = 40, SKY_Y = 11, SKY_BACK = 3.5, LIFE = 0.2;
const SIGIL_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uOpen,uFlash,uA,uRot;
  void main(){ float r=length(vP), a=atan(vP.y,vP.x); if(r>1.0) discard;
    if(mod(a+3.14159+uRot,6.28318)/6.28318>uOpen) discard;
    float tri=abs(fract((a+uRot)*12.0/6.28318)*2.0-1.0); float zig=0.8+0.07*tri;
    vec3 c; float on=0.0;
    if(r>0.93){ c=r>0.975?uC3:uC2; on=1.0; }
    else if(abs(r-zig)<0.022){ c=abs(r-zig)>0.012?uC3:uC1; on=1.0; }
    else if(r>0.62&&r<0.66){ c=r>0.65||r<0.63?uC3:uC2; on=1.0; }
    else { c=uC2; on=0.1+0.25*uFlash; }
    if(uFlash>0.3&&on>0.9&&c!=uC3) c=uC0;
    gl_FragColor=vec4(c,(on>0.9?1.0:on)*uA); }`;
// the storm's shadow: a flat darker disc with a hard edge, wider than the circle
const SHADE_FS = `varying vec2 vP; uniform float uA; void main(){ float r=length(vP); if(r>1.0) discard; gl_FragColor=vec4(0.12,0.15,0.26,(r>0.8?0.16:0.26)*uA); }`;
const SHOCK_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uR,uW;
  void main(){ float r=length(vP); float d=(r-uR)/uW; if(abs(d)>1.0) discard; float k=abs(d);
    vec3 c = k<0.3?uC0:(k<0.6?uC1:(k<0.85?uC2:uC3)); gl_FragColor=vec4(c,1.0); }`;
let stripW = 0;
const boltW = (x) => stripW * (0.6 + 0.4 * x), arcW = (x) => stripW * Math.sin(Math.PI * x);

export class ThunderFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(31); this.time = 0; this.timers = [];
    this.strip = new Ribbon(scene, camera, 2600, BAND_STRIP_FS, THREE.NormalBlending); this.strip.mesh.renderOrder = 9;
    const quad = new THREE.PlaneGeometry(1, 1, 8, 8), L = BANDS.lightning;
    this.slots = Array.from({ length: SLOTS }, () => {
      const sigil = flatMesh(SIGIL_FS, { ...colorUniforms('lightning'), uOpen: { value: 0 }, uFlash: { value: 0 }, uA: { value: 1 }, uRot: { value: 0 } }, 1, 24);
      const shock = flatMesh(SHOCK_FS, { ...colorUniforms('lightning'), uR: { value: 0 }, uW: { value: 0.1 } }, 3, 24);
      const shade = flatMesh(SHADE_FS, { uA: { value: 0 } }, 0, 4);
      for (const m of [sigil, shock, shade]) scene.add(m);
      return { sigil, shock, shade, live: false, t: 0, end: 0, x: 0, z: 0, radius: 3, waves: 0, struck: 0, flash: 0, finalAt: -1, el: 'lightning' };
    });
    this.bolts = Array.from({ length: BOLTS }, () => ({ live: false, t: 0, w: 0.4, main: Array.from({ length: 10 }, () => new THREE.Vector3()), forks: [0, 1].map(() => Array.from({ length: 4 }, () => new THREE.Vector3())), tint: L[2] }));
    this.stars = Array.from({ length: STARS }, (_, k) => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { ...colorUniforms('lightning'), uK: { value: 0 }, uPts: { value: 8 }, uSeed: { value: k * 1.3 } }, vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `, fragmentShader: STAR_FS, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return { m, t: 9, size: 1.6 };
    });
    this.arcs = Array.from({ length: ARCS }, () => ({ t: 9, pts: Array.from({ length: 5 }, () => new THREE.Vector3()) }));
    this.tint = new THREE.Color(L[2]); this.tintArr = [this.tint.r, this.tint.g, this.tint.b];
  }
  // core 'area' of one wave: the first gathers the storm; each counts a wave
  begin(e, element) {
    let s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) {
      s = this.slots.find((q) => !q.live) || this.slots[0];
      Object.assign(s, { live: true, t: 0, end: 0, x: e.x, z: e.z, radius: e.radius, waves: 0, struck: 0, flash: 0, finalAt: -1, el: element });
      for (const m of [s.sigil, s.shock]) { place(m, e.x, 0.035, e.z); m.scale.setScalar(e.radius * 2); conformPlane(m); }
      s.sigil.visible = true;
      place(s.shade, e.x, 0.02, e.z); s.shade.scale.setScalar(e.radius * 2.6); conformPlane(s.shade); s.shade.visible = true;
    }
    s.waves++; s.end = Math.max(s.end, s.t + e.delay + 0.7);
  }
  bolt(s, x, z, w) {
    const b = this.bolts.find((q) => !q.live) || this.bolts[0], r = this.rnd;
    // from the sky above the screen (up the screen is -z), down to the strike point
    const sx = x + (r() - 0.5) * 2, sz = z - SKY_BACK + (r() - 0.5) * 1.5, top = SKY_Y;
    // sharp zigzag: each joint kicks the other way across the screen (x), by a random amount
    for (let i = 0; i < 10; i++) { const u = i / 9, jag = i === 0 || i === 9 ? 0 : (i % 2 ? 1 : -1) * (0.35 + 0.45 * r()) * Math.sin(Math.PI * Math.min(1, u * 1.2)); b.main[i].set(sx + (x - sx) * u + jag, top * (1 - u), sz + (z - sz) * u + (r() - 0.5) * 0.3); }
    b.forks.forEach((f, k) => { const from = b.main[3 + k * 2], fa = r() * 6.283; for (let i = 0; i < 4; i++) { const u = i / 3; f[i].set(from.x + Math.cos(fa) * 1.5 * u, from.y - 1.4 * u, from.z + Math.sin(fa) * 1.5 * u); } });
    b.live = true; b.t = 0; b.w = w;
    const st = this.stars.find((q) => q.t > 0.25) || this.stars[0]; st.t = 0; st.size = w * 4.5; place(st.m, x, 0.04, z); conformPlane(st.m);
    for (let n = 0; n < 5; n++) { const a = this.arcs.find((q) => q.t > 0.3); if (!a) break; a.t = -n * 0.02; const ang = r() * 6.283, len = 0.8 + r() * 0.8; for (let i = 0; i < 5; i++) { const u = i / 4; a.pts[i].set(x + Math.cos(ang) * len * u + (r() - 0.5) * 0.25 * (i % 4 ? 1 : 0), 0.06, z + Math.sin(ang) * len * u + (r() - 0.5) * 0.25 * (i % 4 ? 1 : 0)); } }
    s.flash = 1;
  }
  // core 'burst' of one wave
  strike(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.struck++;
    const r = this.rnd;
    if (s.struck >= s.waves) { // the last wave: one big bolt at the centre and a shock ring
      this.bolt(s, s.x, s.z, 0.75); s.finalAt = s.t; s.shock.visible = true;
      for (let n = 0; n < 2; n++) { const a = r() * 6.283, d = s.radius * (0.5 + r() * 0.35); this.timers.push({ at: this.time + 0.05 + n * 0.05, s, x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d, w: 0.38 }); }
      return;
    }
    for (let n = 0; n < 2; n++) { const a = r() * 6.283, d = Math.sqrt(r()) * s.radius * 0.8; this.timers.push({ at: this.time + n * 0.07, s, x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d, w: 0.42 }); }
  }
  update(dt) {
    this.time += dt;
    let w = 0; for (const q of this.timers) { if (this.time >= q.at) this.bolt(q.s, q.x, q.z, q.w); else this.timers[w++] = q; } this.timers.length = w;
    this.strip.begin();
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt; s.flash = Math.max(0, s.flash - dt / 0.18);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(s.t, s.end - 0.35, s.end), su = s.sigil.material.uniforms;
      su.uOpen.value = Math.min(1, s.t / 0.3); su.uRot.value = s.t * -0.5; su.uFlash.value = s.flash; su.uA.value = fadeOut;
      s.shade.material.uniforms.uA.value = Math.min(1, s.t / 0.3) * fadeOut;
      if (s.finalAt >= 0) { const k = Math.min(1, (s.t - s.finalAt) / 0.35), u = s.shock.material.uniforms; u.uR.value = 0.15 + 0.85 * (1 - Math.pow(1 - k, 2)); u.uW.value = 0.08 * (1 - k) + 0.008; s.shock.visible = k < 1; }
      if (s.t >= s.end) { s.live = false; s.sigil.visible = false; s.shock.visible = false; s.shade.visible = false; }
    }
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.t += dt; const k = b.t / LIFE;
      if (k >= 1) { b.live = false; continue; }
      const on = (k < 0.35 || (k > 0.5 && k < 0.8)) ? 1 : 0; // a hard flicker, no soft fade
      if (!on) continue;
      stripW = b.w; this.strip.strip(b.main, boltW, 1, this.tintArr);
      stripW = b.w * 0.55; for (const f of b.forks) this.strip.strip(f, boltW, 1, this.tintArr);
    }
    for (const st of this.stars) {
      st.t += dt; const k = st.t / 0.24; st.m.visible = k < 1;
      if (st.m.visible) { st.m.scale.setScalar(st.size); st.m.material.uniforms.uK.value = k; }
    }
    for (const a of this.arcs) {
      if (a.t > 0.3) continue;
      a.t += dt; if (a.t < 0) continue;
      if (Math.floor(a.t / 0.05) % 2 === 0) { stripW = 0.13; this.strip.strip(a.pts, arcW, 1, this.tintArr); }
    }
    this.strip.end();
  }
  clear() { this.timers.length = 0; for (const s of this.slots) { s.live = false; s.sigil.visible = false; s.shock.visible = false; s.shade.visible = false; } for (const b of this.bolts) b.live = false; for (const st of this.stars) { st.t = 9; st.m.visible = false; } for (const a of this.arcs) a.t = 9; }
  get busy() { return this.timers.length > 0 || this.slots.some((s) => s.live); }
}
