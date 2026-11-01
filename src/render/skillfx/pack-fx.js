// Pack Hunt (core: three pack wolves join for a while; the companion stands to howl - packBuff.howl, its roarT -
// and bites harder for packBuff.duration; the 'packBuff' event). Research (web search, 2026-11-01; pages
// blocked): howl skills are drawn as a sound wave from the animal (ESO's werewolf howls, GW2's), and buff
// effects layer a glowing ground circle with rings rising on activation, then a lower-opacity aura round the
// character while the buff lasts (Fab aura listings). In the companions' see-through light, a cool moon colour
// so it reads apart from the bear's orange roar:
//   howl:  three arcs of moonlight rise from the companion's muzzle, widening as they go up, and two rings of
//          moonlight run out over the ground from it; the pack's wolves come in to it (the call's run-in);
//   frenzy: while the pack buff lasts, a warm ring breathes on the ground under the companion and embers of
//          light rise off its back now and then; it fades with the buff.
// Pooled (2 auras), numbers in uniforms; the arcs, rings and embers are the host's (CompanionFx) and the call's.
import * as THREE from 'three';
import { place } from './fx-common.js';

const AURAS = 2;
const MOON = { core: [0.93, 0.97, 1.0], glow: [0.42, 0.62, 1.0] }, MOON_RING = new THREE.Color(0.6, 0.78, 1.0);
const EMBER = { core: [1.0, 0.86, 0.6], glow: [1.0, 0.38, 0.12] };
const VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// a soft ring that breathes (uA), with a faint fill inside
const FS = `varying vec2 vP; uniform float uA; uniform vec3 uC;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float k = (exp(-pow((r - 0.8)/0.06, 2.0)) + 0.12*(1.0 - r)) * uA; if (k < 0.01) discard; gl_FragColor = vec4(uC*k, 1.0); }`;
const HEAD = { hunt_hound: 0.95, pack_hound: 0.8, hunt_bear: 2.0, hunt_hawk: 2.0 };
const _c = new THREE.Vector3(), _up = new THREE.Vector3();

export class PackFx {
  /** host: the CompanionFx (strokes on the screen's plane, the call's rings), locate(id): the ally now. */
  constructor(scene, camera, host) {
    this.camera = camera; this.host = host; this.time = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.auras = Array.from({ length: AURAS }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(1.0, 0.45, 0.15) } } }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m);
      return { m, id: null, nextEmber: 0 };
    });
  }
  /** The rules' packBuff on the companion (e.id): its howl. */
  howl(e) {
    const a = this.host.call.locate?.(e.id); if (!a) return;
    const h = HEAD[a.type] || 1, fx = Math.sin(a.facing || 0), fz = Math.cos(a.facing || 0);
    _c.set(a.x + fx * 0.5, h, a.z + fz * 0.5);
    this.host.axes();
    _up.copy(this.host.upAxis()).multiplyScalar(0.9);
    for (let i = 0; i < 3; i++) { const w = 0.5 + i * 0.18; this.host.stroke(_c, -w, 0.2, w, 0.2, 0.3 + i * 0.07, 0.12, MOON, 0.7, 0.08, i * 0.16, _up); }
    for (let i = 0; i < 2; i++) this.host.call.ring(a.x, 0.06, a.z, 3.2, MOON_RING, 0.7, 0.1 + i * 0.22);
    const u = this.auras.find((q) => q.id === e.id) || this.auras.find((q) => q.id === null) || this.auras[0];
    u.id = e.id; u.nextEmber = 0;
  }
  update(dt) {
    this.time += dt;
    for (const u of this.auras) {
      if (u.id === null) continue;
      const a = this.host.call.locate?.(u.id), left = a?.buffs?.pack?.t || 0;
      if (!a || left <= 0) { u.id = null; u.m.visible = false; continue; }
      const fade = Math.min(1, left / 0.8);
      u.m.visible = true; place(u.m, a.x, 0.05, a.z); u.m.scale.setScalar(a.type === 'hunt_bear' ? 2.6 : 1.9);
      u.m.material.uniforms.uA.value = (0.32 + 0.12 * Math.sin(this.time * 5)) * fade;
      // embers rise off its back now and then
      u.nextEmber -= dt;
      if (u.nextEmber <= 0) {
        u.nextEmber = 0.14;
        const r = this.host.rnd, h = (HEAD[a.type] || 1) * 0.7;
        this.host.axes(); _up.copy(this.host.upAxis()).multiplyScalar(0.7);
        _c.set(a.x + (r() - 0.5) * 0.7, h, a.z + (r() - 0.5) * 0.7);
        this.host.stroke(_c, 0, 0, 0, 0.22, 0, 0.07 * fade, EMBER, 0.5, 0.05, 0, _up);
      }
    }
  }
  clear() { for (const u of this.auras) { u.id = null; u.m.visible = false; } }
}
