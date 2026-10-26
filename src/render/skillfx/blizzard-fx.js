// Blizzard, in the FX bench's light-and-ribbon language (owner, 2026-10-26: the effects made on the
// bench are the reference; Frost Nova's lit ice in particular) and sized for a job skill (12 s
// cooldown, a 5 s zone): a storm held over the whole hit area.
//   Open: a thin double ring of pale light marks the area over a faint frost sheet; a ring of tall
//   blade-like ice shards bursts up round the edge, leaning out, with an overshoot.
//   Hold: streaks of wind-light (a white core in a pale blue glow) spiral round the centre at a few
//   heights; snow sparkles (little four-point stars) and glints swirl with them.
//   End: the shards shatter into spark streaks and the light thins away. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV, conformPlane } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, glowTexture, starTexture, lightSprite, W, lineW, lineGlowW, sparkW, circlePoints, drawSparks, spark } from './light-kit.js';

const SLOTS = 2, SHARDS = 14, WINDS = 9, FLAKES = 16, GLINTS = 8, SPARKS = 240, RING = 56;
// a faint frost sheet with a crisp light rim
const SHEET_FS = `varying vec2 vP; uniform float uA; void main(){ float r=length(vP); if(r>1.0) discard;
  float a = r>0.985 ? 0.75 : 0.16; gl_FragColor=vec4(mix(vec3(0.78,0.93,1.0),vec3(1.0),step(0.985,r)), a*uA); }`;
// lit ice, as Frost Nova's crystals are drawn: deep -> mid -> light by the light, white facet edges, a pale rim
const ICE_VS = `attribute vec3 bary; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){ vB=bary; vY=position.y; vec4 w=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`;
const ICE_FS = `varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){ vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N; float ndl=dot(N, normalize(vec3(-0.35,0.8,0.5)));
    vec3 deep=vec3(0.18,0.44,0.74), mid=vec3(0.46,0.78,0.96), lite=vec3(0.86,0.97,1.0);
    vec3 c=mix(deep,mid,smoothstep(-0.2,0.3,ndl)); c=mix(c,lite,smoothstep(0.35,0.8,ndl));
    c=mix(c,vec3(1.0),smoothstep(0.7,1.0,vY)*0.4);
    float e=min(min(vB.x,vB.y),vB.z); c=mix(c,vec3(0.95,1.0,1.0),(1.0-smoothstep(0.0,0.06,e))*0.55);
    float rim=1.0-max(dot(N,normalize(vV)),0.0); c=mix(c,vec3(0.9,0.98,1.0),smoothstep(0.5,0.95,rim)*0.55);
    gl_FragColor=vec4(c,0.9); }`;
let iceGeo = null;
function bladeGeometry() { // a tall three-sided blade with a shoulder, barycentric corners for the facet edges
  if (iceGeo) return iceGeo;
  const s = 0.3, base = [[0, 0, s], [s * 0.87, 0, -s * 0.5], [-s * 0.87, 0, -s * 0.5]], mid = (a) => [a[0] * 0.72, 0.58, a[2] * 0.72], tip = [0.06, 1, 0];
  const pos = [], bar = [], tri = (a, b, c) => { pos.push(...a, ...b, ...c); bar.push(1, 0, 0, 0, 1, 0, 0, 0, 1); };
  for (let i = 0; i < 3; i++) { const a = base[i], b = base[(i + 1) % 3]; tri(a, b, mid(b)); tri(a, mid(b), mid(a)); tri(mid(a), mid(b), tip); }
  iceGeo = new THREE.BufferGeometry(); iceGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); iceGeo.setAttribute('bary', new THREE.Float32BufferAttribute(bar, 3)); iceGeo.computeVertexNormals(); iceGeo.userData.shared = true;
  return iceGeo;
}
const windW = (x) => W.v * Math.sin(Math.PI * Math.pow(x, 0.7)), windGlowW = (x) => windW(x) * 2.6;

export class BlizzardFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(53); this.sparks = []; this.free = [];
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.look = lightOf('cold');
    this.iceMat = new THREE.ShaderMaterial({ vertexShader: ICE_VS, fragmentShader: ICE_FS, transparent: true });
    this.slots = Array.from({ length: SLOTS }, () => {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `, fragmentShader: SHEET_FS, transparent: true, depthWrite: false }));
      sheet.rotation.x = -Math.PI / 2; sheet.renderOrder = 1; sheet.visible = false; scene.add(sheet);
      const shards = Array.from({ length: SHARDS }, () => { const m = new THREE.Mesh(bladeGeometry(), this.iceMat); m.visible = false; scene.add(m); return { m, a: 0, h: 1, lean: 0, delay: 0, broke: false }; });
      const flakes = Array.from({ length: FLAKES }, () => ({ sp: lightSprite(scene, starTexture('cold'), false, 10), a: 0, r: 0, h: 0, w: 0, ph: 0 }));
      const glints = Array.from({ length: GLINTS }, () => ({ sp: lightSprite(scene, glowTexture('cold'), true, 9), p: new THREE.Vector3(), t: 9 }));
      const winds = Array.from({ length: WINDS }, () => ({ a: 0, r: 0, h: 0, w: 0, len: 0, pts: Array.from({ length: 9 }, () => new THREE.Vector3()) }));
      return { sheet, shards, flakes, glints, winds, live: false, t: 0, dur: 5, x: 0, z: 0, radius: 3, glintAt: 0 };
    });
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3()); this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
  }
  // core 'area': the zone lasts e.duration
  begin(e) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], r = this.rnd;
    Object.assign(s, { live: true, t: 0, dur: e.duration || 5, x: e.x, z: e.z, radius: e.radius, glintAt: 0 });
    place(s.sheet, e.x, 0.03, e.z); s.sheet.scale.setScalar(e.radius * 2); conformPlane(s.sheet); s.sheet.visible = true;
    s.shards.forEach((q, i) => { q.a = (i / SHARDS) * 6.283 + (r() - 0.5) * 0.2; q.h = (1.2 + r() * 1.1) * Math.max(0.8, e.radius / 3.6); q.lean = 0.2 + r() * 0.25; q.delay = r() * 0.12; q.broke = false; q.m.visible = true; });
    s.flakes.forEach((q) => { q.a = r() * 6.283; q.r = (0.15 + 0.8 * Math.sqrt(r())) * e.radius; q.h = 0.4 + r() * 2.0; q.w = (1.5 + r() * 1.5) / Math.max(0.7, q.r * 0.55); q.ph = r() * 6; });
    s.winds.forEach((q, i) => { q.a = (i / WINDS) * 6.283; q.r = e.radius * (0.3 + (i % 3) * 0.22); q.h = 0.3 + (i % 3) * 0.6; q.w = 1.7 + r() * 0.7; q.len = 2.2 + r() * 1.0; });
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const L = this.look;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const left = s.dur - s.t, end = Math.max(0, Math.min(1, left / 0.45)), open = Math.min(1, s.t / 0.2) * end;
      s.sheet.material.uniforms.uA.value = open;
      circlePoints(this.ring, s.x, s.z, s.radius); W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.7 * open, L.glow); this.core.strip(this.ring, lineW, open, L.edge);
      circlePoints(this.ring, s.x, s.z, s.radius * 0.62); W.v = 0.03; this.glow.strip(this.ring, lineGlowW, 0.5 * open, L.glow); this.core.strip(this.ring, lineW, 0.7 * open, L.edge);
      for (const q of s.shards) {
        const age = s.t - q.delay, g = Math.max(0, Math.min(1, age / 0.14));
        const k = g < 1 ? 1.18 * Math.sin(g * Math.PI * 0.6) / Math.sin(Math.PI * 0.6) : 1 + 0.12 * Math.exp(-(age - 0.14) * 20) * Math.cos((age - 0.14) * 40);
        const rr = s.radius * 0.97, x = s.x + Math.cos(q.a) * rr, z = s.z + Math.sin(q.a) * rr;
        if (left < 0.35 && !q.broke) { q.broke = true; for (let i = 0; i < 5; i++) { const r = this.rnd, a = r() * 6.283; this.p.set(x, q.h * 0.5, z); this.v.set(Math.cos(a) * 2.5, 1 + r() * 2.5, Math.sin(a) * 2.5); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.05, L); } }
        place(q.m, x, -0.08, z); q.m.rotation.set(0, -q.a, 0); q.m.rotateZ(-q.lean);
        const kk = q.broke ? 0 : k; q.m.scale.set(q.h * 0.62, q.h * Math.max(0.001, kk), q.h * 0.62); q.m.visible = kk > 0.01;
      }
      for (const q of s.winds) {
        q.a += q.w * dt; const span = q.len / Math.max(0.5, q.r), n = q.pts.length;
        for (let i = 0; i < n; i++) { const a = q.a - span * (1 - i / (n - 1)); q.pts[i].set(s.x + Math.cos(a) * q.r, q.h + 0.15 * Math.sin(a * 2 + q.r), s.z + Math.sin(a) * q.r); }
        W.v = 0.07 * Math.min(1, s.t / 0.4) * end; if (W.v > 0.005) { this.glow.strip(q.pts, windGlowW, 0.85, L.glow); this.core.strip(q.pts, windW, 1, L.edge); }
      }
      for (const q of s.flakes) {
        q.a += q.w * dt; this.p.set(s.x + Math.cos(q.a) * q.r, q.h + 0.2 * Math.sin(s.t * 2 + q.ph), s.z + Math.sin(q.a) * q.r);
        q.sp.visible = open > 0.02; placeV(q.sp, this.p); q.sp.scale.setScalar(0.22 * open * (0.7 + 0.3 * Math.sin(s.t * 9 + q.ph))); q.sp.material.rotation = s.t * 3 + q.ph;
      }
      if (s.t - s.glintAt > 0.18 && end > 0.5) { // glints catching the light here and there
        s.glintAt = s.t; const gl = s.glints.find((g) => g.t > 0.3); const r = this.rnd;
        if (gl) { const a = r() * 6.283, d = Math.sqrt(r()) * s.radius * 0.9; gl.t = 0; gl.p.set(s.x + Math.cos(a) * d, 0.2 + r() * 1.5, s.z + Math.sin(a) * d); }
      }
      for (const gl of s.glints) { gl.t += dt; const k = gl.t / 0.3; gl.sp.visible = k < 1; if (gl.sp.visible) { placeV(gl.sp, gl.p); gl.sp.scale.setScalar(0.9 * Math.sin(Math.PI * k)); } }
      if (s.t >= s.dur) { s.live = false; s.sheet.visible = false; for (const q of s.shards) q.m.visible = false; for (const q of s.flakes) q.sp.visible = false; for (const g of s.glints) { g.t = 9; g.sp.visible = false; } }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 9);
    this.core.end(); this.glow.end();
  }
  clear() { for (const s of this.slots) { s.live = false; s.sheet.visible = false; for (const q of s.shards) q.m.visible = false; for (const q of s.flakes) q.sp.visible = false; for (const g of s.glints) { g.t = 9; g.sp.visible = false; } } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live); }
}
