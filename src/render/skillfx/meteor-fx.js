// Meteor: a high-tier fire spell (job skill, 10 s cooldown), so it is bigger and has more beats than
// Firebolt, while every shape stays solid cel with flat bands and a same-hue dark edge (the approved
// set's style, owner 2026-10-26; its shapes are not reused).
//   Warning (the rules' delay): a fire circle draws itself round the real hit area (a banded ring,
//   flame teeth between two rings) and burns brighter as the hit nears.
//   Fall (the last FALL seconds): a chunky outlined rock wrapped in a banded flame shell, leaving
//   cel smoke puffs, speeds down from the sky behind the target.
//   Impact (the rules' 'burst'): a spiky star flash for a few frames, a fire dome that swells to the
//   radius and is eaten away, a banded shock ring, outlined rock chunks thrown and bouncing, a ring of
//   smoke, then a cracked crater glowing orange that cools and fades.
// Research: docs/VFX-REFERENCE.md (2026-10-26). Cosmetic only.
import * as THREE from 'three';
import { place, conformPlane } from './fx-common.js';
import { energyMaterial, setBands, flatMesh, colorUniforms, STAR_FS, rockGeometry, celProp, puffGeometry, BANDS } from './cel-kit.js';
import { disposeObject } from '../dispose.js';

const SLOTS = 2, FALL = 0.55, APEX = 6.6, BACK = 2.6, CHUNKS = 10, SMOKE = 14, TRAIL = 16;
const SIGIL_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uOpen,uHot,uRot,uA;
  void main(){ float r=length(vP), a=atan(vP.y,vP.x); if(r>1.0) discard;
    float sweep = mod(a + 3.14159 + uRot, 6.28318) / 6.28318; if(sweep>uOpen) discard;
    vec3 c; float on=0.0;
    if(r>0.9){ c = r>0.97?uC3:(r>0.93?uC2:uC1); on=1.0; }                          // outer ring
    else if(r>0.66&&r<0.72){ c = r>0.705||r<0.675?uC3:uC2; on=1.0; }                  // inner ring
    else if(r>0.72&&r<0.9){ float t=fract((a+uRot*0.5)*8.0/6.28318); float w=(0.9-r)/0.18*0.5; // flame teeth
      if(abs(t-0.5)<w){ c = abs(t-0.5)>w-0.05?uC3:(r<0.78?uC1:uC2); on=1.0; } }
    if(on<0.5){ if(r<0.66){ c=uC2; on=0.12+0.25*uHot; } else discard; }               // faint fill inside
    if(uHot>0.5 && on>0.9 && c!=uC3) c = mix(c,uC0,uHot-0.5);
    gl_FragColor=vec4(c, (on>0.9?1.0:on)*uA); }`;
const SHOCK_FS = `varying vec2 vP; uniform vec3 uC0,uC1,uC2,uC3; uniform float uR,uW;
  void main(){ float r=length(vP); float d=(r-uR)/uW; if(abs(d)>1.0) discard; float k=abs(d);
    vec3 c = k<0.3?uC0:(k<0.6?uC1:(k<0.85?uC2:uC3)); gl_FragColor=vec4(c,1.0); }`;
const CRATER_FS = `varying vec2 vP; uniform float uGlow,uA,uSeed;
  float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
  void main(){ float r=length(vP), a=atan(vP.y,vP.x); float edge=0.78+0.14*vn(vec2(a*3.0+uSeed,0.0)); if(r>edge) discard;
    vec3 c=r>edge-0.06?vec3(0.24,0.15,0.12):vec3(0.33,0.22,0.17);
    float crack = abs(fract(vn(vec2(a*5.0+uSeed, r*3.0))*4.0)-0.5); // radial jagged cracks
    if(crack<0.06+0.04*(1.0-r) && r<edge-0.08){ c = uGlow>0.66?vec3(1.0,0.92,0.6):(uGlow>0.33?vec3(1.0,0.55,0.15):vec3(0.55,0.2,0.1)); }
    gl_FragColor=vec4(c, uA*0.92); }`;

export class MeteorFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.slots = Array.from({ length: SLOTS }, (_, k) => {
      const sigil = flatMesh(SIGIL_FS, { ...colorUniforms('fire'), uOpen: { value: 0 }, uHot: { value: 0 }, uRot: { value: 0 }, uA: { value: 1 } }, 1, 24);
      const shock = flatMesh(SHOCK_FS, { ...colorUniforms('fire'), uR: { value: 0 }, uW: { value: 0.1 } }, 3, 24);
      const crater = flatMesh(CRATER_FS, { uGlow: { value: 1 }, uA: { value: 1 }, uSeed: { value: k * 3.7 } }, 1, 20);
      const star = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { ...colorUniforms('fire'), uK: { value: 0 }, uPts: { value: 10 }, uSeed: { value: k } }, vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `, fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false }));
      star.visible = false; star.renderOrder = 10; star.frustumCulled = false;
      // the falling body: rock + flame shell (stretched sphere behind it) + two flame tongues
      const body = new THREE.Group();
      const rock = celProp(rockGeometry(7 + k, 1), '#5b3627', '#2b120b', 0.06); rock.scale.setScalar(0.85); body.add(rock);
      const shellMat = energyMaterial('fire'), shell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shellMat);
      shell.scale.set(1.05, 1.05, 2.4); shell.position.z = -2.0; body.add(shell); // the rock leads, its front out of the flame
      const tongues = [0, 1].map((i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 10), energyMaterial('fire')); m.rotation.x = -Math.PI / 2; m.position.set(i ? 0.5 : -0.5, 0.2, -2.6); body.add(m); return m; });
      body.visible = false;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), energyMaterial('fire', THREE.DoubleSide)); dome.visible = false;
      const chunks = Array.from({ length: CHUNKS }, (_, i) => { const c = celProp(rockGeometry(20 + i, 0), i % 3 ? '#6a4433' : '#4a2e22', '#24100a', 0.05); c.visible = false; return { c, v: new THREE.Vector3(), spin: new THREE.Vector3(), s: 0.2 }; });
      const smoke = Array.from({ length: SMOKE }, () => { const c = celProp(puffGeometry(), '#77707e', '#3e3746', 0.05); c.visible = false; return { c, a: 0, s: 0 }; });
      const trail = Array.from({ length: TRAIL }, () => { const c = celProp(puffGeometry(), '#9a909c', '#5a5060', 0.05); c.visible = false; return { c, t: 9, s: 0.5 }; });
      for (const m of [sigil, shock, crater, star, body, dome, ...chunks.map((q) => q.c), ...smoke.map((q) => q.c), ...trail.map((q) => q.c)]) scene.add(m);
      return { sigil, shock, crater, star, body, rock, shell, tongues, dome, chunks, smoke, trail, trailI: 0, trailAt: 0, live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', apex: new THREE.Vector3(), dir: new THREE.Vector3(), landedAt: -1 };
    });
    this._look = new THREE.Vector3();
  }
  setElement(s, el) {
    for (const m of [s.sigil.material, s.shock.material, s.star.material]) for (const [k, i] of [['uC0', 0], ['uC1', 1], ['uC2', 2], ['uC3', 3]]) m.uniforms[k].value.set((BANDS[el] || BANDS.fire)[i]);
    for (const m of [s.shell.material, s.dome.material, ...s.tongues.map((t) => t.material)]) setBands(m, el);
  }
  // core 'area': the rules' delay starts. from: the caster (the rock comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hideAll(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, landedAt: -1, trailAt: 0 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    this.setElement(s, element);
    for (const m of [s.sigil, s.shock, s.crater]) { place(m, e.x, 0.035, e.z); m.scale.setScalar(e.radius * 2); conformPlane(m); }
    s.sigil.visible = true;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.body.visible = false; s.sigil.visible = false;
    s.star.visible = true; place(s.star, e.x, 1.2, e.z);
    s.dome.visible = true; place(s.dome, e.x, 0, e.z); s.dome.scale.setScalar(0.01); s.dome.material.uniforms.uErode.value = -1;
    s.shock.visible = true; s.crater.visible = true; s.crater.scale.setScalar(e.radius * 1.5); conformPlane(s.crater);
    let seed = Math.floor(e.x * 13 + e.z * 7);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const q of s.chunks) {
      const a = rnd() * 6.283, sp = 3 + rnd() * 4;
      q.c.visible = true; place(q.c, e.x + Math.cos(a) * 0.5, 0.4, e.z + Math.sin(a) * 0.5); q.gy = q.c.position.y - 0.4; q.s = 0.16 + rnd() * 0.22; q.c.scale.setScalar(q.s);
      q.v.set(Math.cos(a) * sp, 5 + rnd() * 4, Math.sin(a) * sp); q.spin.set(rnd() * 10, rnd() * 10, rnd() * 10);
    }
    s.smoke.forEach((q, i) => { q.a = (i / SMOKE) * 6.283 + rnd() * 0.3; q.s = 0.55 + rnd() * 0.4; q.c.visible = true; });
  }
  hideAll(s) {
    for (const m of [s.sigil, s.shock, s.crater, s.star, s.body, s.dome]) m.visible = false;
    for (const q of [...s.chunks, ...s.smoke, ...s.trail]) q.c.visible = false;
    for (const q of s.trail) q.t = 9;
  }
  update(dt) {
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      if (s.landedAt < 0) this.warnAndFall(s, dt); else this.afterImpact(s, s.t - s.landedAt, dt);
      for (const q of s.trail) {
        if (q.t > 0.5) { q.c.visible = false; continue; }
        q.t += dt; const k = q.t / 0.5; q.c.visible = true; q.c.scale.setScalar(q.s * (k < 0.25 ? 0.6 + 1.6 * k : 1.0 - 0.9 * (k - 0.25) / 0.75)); q.c.position.y += dt * 0.4;
      }
    }
  }
  warnAndFall(s, dt) {
    const k = Math.min(1, s.t / s.delay), u = s.sigil.material.uniforms;
    u.uOpen.value = Math.min(1, s.t / 0.3); u.uRot.value = s.t * 0.6; u.uHot.value = k > 0.6 ? (k - 0.6) / 0.4 * (0.75 + 0.25 * Math.sin(s.t * 40)) : 0;
    const fallAt = s.delay - FALL;
    if (s.t < fallAt) return;
    const f = Math.min(1, (s.t - fallAt) / FALL), e = f * f * 0.7 + f * 0.3;
    s.body.visible = true;
    place(s.body, s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.5 * e, s.apex.z + (s.z - s.apex.z) * e);
    s.body.lookAt(this._look.copy(s.body.position).add(s.dir));
    s.body.scale.setScalar(Math.min(1, 0.4 + f * 3));
    s.rock.rotation.x += dt * 6; s.rock.rotation.y += dt * 4;
    for (const m of [s.shell, ...s.tongues]) { m.material.uniforms.uT.value = s.t; m.material.uniforms.uErode.value = 0.12 + 0.08 * Math.sin(s.t * 30 + m.position.x); }
    if (s.t - s.trailAt > 0.06) { // a few smoke puffs left behind, of different sizes, off the line a little
      s.trailAt = s.t; const q = s.trail[s.trailI++ % TRAIL]; q.t = 0; q.s = 0.18 + Math.random() * 0.22; q.c.position.copy(s.body.position).addScaledVector(s.dir, -3.2); q.c.position.x += (Math.random() - 0.5) * 0.5; q.c.position.z += (Math.random() - 0.5) * 0.5;
    }
  }
  afterImpact(s, t, dt) {
    const R = s.radius;
    // star flash: the first frames
    s.star.visible = t < 0.2;
    if (s.star.visible) { s.star.quaternion.copy(this.camera.quaternion); s.star.scale.setScalar(R * 1.7); s.star.material.uniforms.uK.value = t / 0.2; }
    // fire dome: swells fast, then eaten away while rising a little
    const swell = Math.min(1, t / 0.16), dm = s.dome.material.uniforms;
    s.dome.scale.set(R * 0.85 * (1 - Math.pow(1 - swell, 3)), R * 0.62 * (1 - Math.pow(1 - swell, 3)), R * 0.85 * (1 - Math.pow(1 - swell, 3)));
    dm.uT.value = t; dm.uHot.value = Math.max(0, 0.3 - t); dm.uErode.value = t < 0.16 ? -1 : -0.2 + (t - 0.16) / 0.5 * 1.3;
    s.dome.visible = dm.uErode.value < 1.05;
    // shock ring out past the radius, thinning
    const sk = Math.min(1, t / 0.38), su = s.shock.material.uniforms;
    su.uR.value = 0.15 + 0.62 * (1 - Math.pow(1 - sk, 2)); su.uW.value = 0.07 * (1 - sk) + 0.008; s.shock.visible = sk < 1;
    // chunks fly, bounce once, then sink
    for (const q of s.chunks) {
      if (!q.c.visible) continue;
      q.v.y -= 22 * dt; q.c.position.addScaledVector(q.v, dt); q.c.rotation.x += q.spin.x * dt; q.c.rotation.y += q.spin.y * dt;
      if (q.c.position.y - q.gy < q.s * 0.5 && q.v.y < 0) { q.c.position.y = q.gy + q.s * 0.5; q.v.set(q.v.x * 0.35, -q.v.y * 0.3, q.v.z * 0.35); q.spin.multiplyScalar(0.5); }
      if (t > 1.2) q.c.scale.setScalar(Math.max(0.001, q.s * (1 - (t - 1.2) / 0.4)));
      if (t > 1.6) q.c.visible = false;
    }
    // smoke ring rising from the rim
    for (const q of s.smoke) {
      if (!q.c.visible) continue;
      const k = t / 1.4, rr = R * (0.45 + 0.4 * Math.min(1, t / 0.3));
      place(q.c, s.x + Math.cos(q.a) * rr, 0.3 + k * 1.4, s.z + Math.sin(q.a) * rr);
      q.c.scale.setScalar(q.s * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 1.2);
      if (k >= 1) q.c.visible = false;
    }
    // crater: glows, cools, fades
    const cu = s.crater.material.uniforms; cu.uGlow.value = Math.max(0, 1 - t / 1.8); cu.uA.value = 1 - Math.max(0, (t - 2.2) / 0.8);
    if (t > 3) { s.live = false; this.hideAll(s); }
  }
  clear() { for (const s of this.slots) { s.live = false; this.hideAll(s); } }
  get busy() { return this.slots.some((s) => s.live); }
  dispose() { for (const s of this.slots) for (const m of [s.sigil, s.shock, s.crater, s.star, s.body, s.dome]) disposeObject(m); }
}
