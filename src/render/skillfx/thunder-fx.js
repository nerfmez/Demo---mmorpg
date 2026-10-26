// Thunderstorm, built from the approved set so it matches the old skills (owner, 2026-10-26). A thin
// cel boundary marks the storm's circle for its waves (the approved Stone Burst warning's line, in the
// lightning colour) and flashes with each wave. Each wave's 'burst' brings down the approved lightning
// strike (the same blue-white branched bolt Chain Spark lands with) at two spots inside the circle, a
// beat apart. Cosmetic only.
// Research (docs/VFX-REFERENCE.md, 2026-10-26): a stylized strike reads best short and punchy, the
// impact only a few frames; the bolt is one thick readable shape.
import * as THREE from 'three';
import { place, conformPlane, lookOf, mulberry32 } from './fx-common.js';

const SLOTS = 3;
const MARK_FS = `varying vec2 vP; uniform float uA; uniform float uPulse; uniform vec3 uCol;
  void main(){ float r=length(vP); if(r>1.0) discard; float a = r>0.955 ? 0.85 : 0.1*uPulse;
    gl_FragColor=vec4(mix(uCol,vec3(1.0),uPulse*0.6), a*uA); }`;
const VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;

export class ThunderFx {
  constructor(scene, camera, vfx) {
    this.vfx = vfx; this.rnd = mulberry32(29); this.timers = []; this.time = 0;
    this.slots = Array.from({ length: SLOTS }, () => {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uPulse: { value: 0 }, uCol: { value: new THREE.Color() } }, vertexShader: VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2; mark.renderOrder = 1; mark.visible = false; scene.add(mark);
      return { mark, live: false, t: 0, end: 0, x: 0, z: 0, radius: 3, pulse: 0 };
    });
  }
  // core 'area' event of one wave: the first of a storm draws its circle
  begin(e, element) {
    let s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) {
      s = this.slots.find((q) => !q.live) || this.slots[0];
      Object.assign(s, { live: true, t: 0, end: 0, x: e.x, z: e.z, radius: e.radius, pulse: 0 });
      place(s.mark, e.x, 0.03, e.z); s.mark.scale.setScalar(e.radius * 2); conformPlane(s.mark); s.mark.visible = true;
      const edge = lookOf(element).edge; s.mark.material.uniforms.uCol.value.setRGB(edge[0], edge[1], edge[2]);
    }
    s.end = Math.max(s.end, s.t + e.delay + 0.5);
  }
  // core 'burst' of one wave: two approved strikes inside the circle, a beat apart
  strike(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (s) s.pulse = 1;
    const r = this.rnd;
    for (let n = 0; n < 2; n++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * e.radius * 0.75, x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
      this.timers.push({ at: this.time + n * 0.08, x, z });
    }
  }
  update(dt) {
    this.time += dt;
    let w = 0;
    for (const t of this.timers) { if (this.time >= t.at) this.vfx().playApproved('lightning', { x: t.x, z: t.z }); else this.timers[w++] = t; }
    this.timers.length = w;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt; s.pulse = Math.max(0, s.pulse - dt / 0.2);
      const u = s.mark.material.uniforms;
      u.uA.value = Math.min(1, s.t / 0.12) * (1 - THREE.MathUtils.smoothstep(s.t, s.end - 0.3, s.end)); u.uPulse.value = s.pulse;
      if (s.t >= s.end) { s.live = false; s.mark.visible = false; }
    }
  }
  clear() { this.timers.length = 0; for (const s of this.slots) { s.live = false; s.mark.visible = false; } }
  get busy() { return this.timers.length > 0 || this.slots.some((s) => s.live); }
}
