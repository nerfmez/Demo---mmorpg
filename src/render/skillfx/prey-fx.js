// Mark Prey (the hunter's marking arrow; core: a projectile whose exposure carries `prey`: armour lowered for
// its time, the companion goes for it first, and its death may drop one more part - the 'preyDrop' event).
// Research (web search, 2026-11-01; pages blocked): a hunter's mark is shown as an indicator hovering over the
// target that everyone can see (WoW's Hunter's Mark), the target of an order as a head marker (Sic 'Em here
// uses a red chevron), so the prey's mark must read apart from it: an amber hunting sigil, a crosshair ring
// with four ticks round a paw print (the companion's quarry), in the companions' see-through light.
//   stamp: when the mark takes, the sigil comes down big and faint and shrinks onto the prey's head with a
//          flash and a ring of light round the prey;
//   held:  it hovers over the head, turning slowly and breathing, for as long as the rules keep the mark,
//          and fades over its last second;
//   prize: when a marked kill drops one more part, a gold star and sparkles rise from where it fell.
// Pooled (8 sigils, 2 prize glints), numbers in uniforms, no per-frame allocation.
import * as THREE from 'three';
import { place } from './fx-common.js';
import { lightSprite, starTexture } from './light-kit.js';

const SIGILS = 8, PRIZES = 2, SPARKS = 16;
const VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// the sigil (uv -1..1): a ring with four inward ticks, a paw print in the middle (a pad and four toes);
// lines with a soft halo; uRot turns the ring, uA fades, uFlash whitens
const FS = `varying vec2 vP; uniform float uA, uRot, uFlash; uniform vec3 uC;
  float ell(vec2 p, vec2 c, vec2 r){ return length((p - c)/r) - 1.0; }
  void main(){
    float r = length(vP); if (r > 1.0) discard;
    float ring = abs(r - 0.78);
    float a = atan(vP.y, vP.x) + uRot, sec = mod(a + 0.3927, 1.5708) - 0.3927;           // nearest of four ticks
    float tick = (r > 0.5 && r < 0.78) ? abs(sin(sec) * r) : 1.0;
    float line = min(ring, tick);
    // the paw: a pad and four toes (filled)
    vec2 p = vP * 1.6;
    float pad = ell(p, vec2(0.0, -0.18), vec2(0.36, 0.3));
    float toe = min(min(ell(p, vec2(-0.42, 0.22), vec2(0.13, 0.17)), ell(p, vec2(0.42, 0.22), vec2(0.13, 0.17))),
                    min(ell(p, vec2(-0.15, 0.42), vec2(0.13, 0.17)), ell(p, vec2(0.15, 0.42), vec2(0.13, 0.17))));
    float paw = 1.0 - smoothstep(-0.05, 0.08, min(pad, toe));
    float core = (1.0 - smoothstep(0.022, 0.045, line)) + paw * 0.8;
    float halo = exp(-line*line*260.0) * 0.5 + paw * 0.25;
    float k = (core + halo) * uA; if (k < 0.01) discard;
    vec3 col = mix(uC, vec3(1.0, 0.97, 0.88), clamp(core*0.55 + uFlash, 0.0, 1.0));
    gl_FragColor = vec4(col * k, 1.0); }`;
const RING_FS = `varying vec2 vP; uniform float uK, uA; uniform vec3 uC;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float f = 0.3 + 0.7*uK, a = exp(-pow((r - f)/0.03, 2.0)) * (1.0 - uK) * uA; if (a < 0.01) discard; gl_FragColor = vec4(uC*a, 1.0); }`;
const AMBER = new THREE.Color('#ffb02e');

export class PreyFx {
  constructor(scene, camera) {
    this.camera = camera;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.sigils = Array.from({ length: SIGILS }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uFlash: { value: 0 }, uC: { value: AMBER.clone() } } }));
      m.renderOrder = 15; m.frustumCulled = false; m.visible = false; scene.add(m);
      const ring = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 1 }, uA: { value: 1 }, uC: { value: AMBER.clone() } } }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; ring.visible = false; scene.add(ring);
      return { m, ring, id: null, age: 0, lastT: 0, seen: false };
    });
    this.prizes = Array.from({ length: PRIZES }, () => ({ s: lightSprite(scene, starTexture('holy'), true, 16), t: 9, x: 0, z: 0 }));
    this.prizeI = 0;
    this.sparks = Array.from({ length: SPARKS }, () => ({ s: lightSprite(scene, starTexture('holy'), true, 16), t: 9, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.sparkI = 0;
  }
  /** The rules' preyDrop at (x, z): the extra part's gold star and sparkles. */
  prize(x, z) {
    const p = this.prizes[this.prizeI++ % PRIZES]; p.t = 0; p.x = x; p.z = z;
    for (let i = 0; i < 6; i++) { const s = this.sparks[this.sparkI++ % SPARKS], a = i / 6 * 6.283; s.t = 0; s.p.set(x + Math.cos(a) * 0.2, 0.4, z + Math.sin(a) * 0.2); s.v.set(Math.cos(a) * 0.6, 1.6 + (i % 3) * 0.4, Math.sin(a) * 0.6); }
  }
  /** marked: the monsters whose exposure carries prey ({id, x, z, y (head), t (time left)}). */
  update(dt, marked) {
    const q = this.camera.quaternion;
    for (const s of this.sigils) s.seen = false;
    for (const o of marked) {
      let s = this.sigils.find((q2) => q2.id === o.id);
      // a new mark, or a fresh one on the same prey (its time went up): stamp it again
      if (!s) { s = this.sigils.find((q2) => q2.id === null); if (!s) continue; s.id = o.id; s.age = 0; }
      else if (o.t > s.lastT + 0.2) s.age = 0;
      s.seen = true; s.lastT = o.t; s.age += dt;
      const k = Math.min(1, s.age / 0.22), fade = Math.min(1, o.t / 1.0), U = s.m.material.uniforms;
      s.m.visible = true; place(s.m, o.x, o.y + 0.15 * (1 - k) + 0.05 * Math.sin(s.age * 3), o.z); s.m.quaternion.copy(q);
      s.m.scale.setScalar((0.9 + 0.9 * (1 - k) * (1 - k)) * (1 + 0.04 * Math.sin(s.age * 4)));
      U.uA.value = (0.35 + 0.65 * k) * fade; U.uRot.value = s.age * 0.8; U.uFlash.value = Math.max(0, 1 - Math.abs(s.age - 0.22) / 0.12) * 0.8;
      // the ring round the prey as it takes
      const rk = (s.age - 0.18) / 0.4; s.ring.visible = rk > 0 && rk < 1;
      if (s.ring.visible) { place(s.ring, o.x, 0.06, o.z); s.ring.scale.setScalar(2.6); s.ring.material.uniforms.uK.value = rk; }
    }
    for (const s of this.sigils) if (!s.seen) { s.id = null; s.m.visible = false; s.ring.visible = false; }
    for (const p of this.prizes) {
      if (p.t >= 0.7) { p.s.visible = false; continue; }
      p.t += dt; const u = p.t / 0.7; p.s.visible = true; place(p.s, p.x, 0.6 + 0.8 * u, p.z);
      p.s.scale.setScalar(1.1 * Math.sin(Math.PI * Math.min(1, u * 1.4))); p.s.material.rotation = u * 2; p.s.material.opacity = 1 - u * u;
    }
    for (const s of this.sparks) {
      if (s.t >= 0.8) { s.s.visible = false; continue; }
      s.t += dt; const u = s.t / 0.8; s.v.y -= 2.5 * dt; s.p.addScaledVector(s.v, dt);
      s.s.visible = true; place(s.s, s.p.x, s.p.y, s.p.z); s.s.scale.setScalar(0.28 * (1 - u)); s.s.material.opacity = 1 - u;
    }
  }
  clear() {
    for (const s of this.sigils) { s.id = null; s.m.visible = false; s.ring.visible = false; }
    for (const p of this.prizes) { p.t = 9; p.s.visible = false; } for (const s of this.sparks) { s.t = 9; s.s.visible = false; }
  }
}
