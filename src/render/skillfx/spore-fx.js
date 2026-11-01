// Spore Pod (the trapper's poison trap, 2026-11-01; core: frontier-content.js springTrap trap.puffs, spreadCurse;
// events trapSprung with puffsLeft, poisonSpread). Its pod sits on the plate (skillfx/trap-fx.js: a fleshy
// bulb that squeezes on each puff and shrinks as it empties). Each puff is drawn here as a puffball bursting,
// not as Miasma Arrow's lime-and-violet gas rolling over the floor: golden spores, specks of light, thrown up
// out of the pod's mouth and outward like a dandelion blown apart, drifting and settling; a few soft ochre puffs
// swell low round it, and a thin ring of spore light runs out to the true radius. When a monster dies poisoned
// by it (poisonSpread), a stream of spores arcs from the body to the next one.
// Lines and light, never pictures; pooled (one ribbon of spores, a few billboards), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32, BILLBOARD_VS, NOISE, addLight, place } from './fx-common.js';

const SPORES = 280, CLOUDS = 18, RINGS = 4;
const GOLD = [1.0, 0.86, 0.36], GOLD_GLOW = [0.75, 0.62, 0.12], PALE = [1.0, 0.98, 0.78];
// a spore: a round speck of light, white-gold at its heart
const DOT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y), e = abs(vUv.x*2.0 - 1.0); float r = max(d, e*0.8); if (r > 0.95) discard;
    vec3 c = r < 0.45 ? vec3(1.0, 0.99, 0.85) : vT; gl_FragColor = vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d = abs(vUv.y), e = abs(vUv.x*2.0 - 1.0); float a = pow(max(0.0, 1.0 - max(d, e)), 2.0)*0.7; gl_FragColor = vec4(vT*a*vA, 1.0); }`;
// a soft ochre puff, see-through, two cel tones, thinning as it ages (uT 0..1)
const CLOUD_FS = `varying vec2 vUv; uniform float uT, uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*1.8 + uSeed + vec2(uT*0.5, -uT*0.7));
    float body = n*1.2 - r*0.95 - uT*0.75;
    if (body < 0.04) discard;
    vec3 c = body > 0.28 ? vec3(0.98, 0.9, 0.6) : vec3(0.78, 0.66, 0.32);
    gl_FragColor = vec4(c, (body > 0.28 ? 0.72 : 0.45)*(1.0 - uT*0.4)); }`;
const RING_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RING_FS = `varying vec2 vP; uniform float uK;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float front = 0.2 + 0.8*sqrt(uK), w = 0.015 + 0.015*uK;
    float a = exp(-pow((r - front)/w, 2.0))*(1.0 - uK)*0.5;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.85, 0.35)*a, 1.0); }`;
let sw = 0;
const dotW = () => sw, dotGlowW = () => sw * 3;

export class SporeFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(29); this.time = 0; this.camera = camera; this.right = new THREE.Vector3();
    this.core = new Ribbon(scene, camera, SPORES * 2 + 40, DOT_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, SPORES * 2 + 40, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.spores = Array.from({ length: SPORES }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 0.05, wob: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), arc: 0, h: 0 }));
    this.sporeI = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.clouds = Array.from({ length: CLOUDS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1.4, size: 1 }; });
    this.cloudI = 0;
    this.rings = Array.from({ length: RINGS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return { m, t: 9 }; });
    this.ringI = 0;
    this.light = addLight(scene, new THREE.PointLight('#e8d070', 0, 6, 1.6)); this.lightT = 9;
    this.two = [new THREE.Vector3(), new THREE.Vector3()];
  }
  /** One puff of a Spore Pod at (x, z) over radius R; left: the puffs it has left (it weakens as it empties). */
  puff(x, z, R, left = 2) {
    const r = this.rnd, k = 0.75 + 0.25 * Math.min(1, left / 2);
    // spores thrown up out of the mouth and outward, like a puffball blown apart
    for (let i = 0; i < Math.round(120 * k); i++) {
      const s = this.spores[this.sporeI++ % SPORES], a = r() * 6.283, out = (1.2 + r() * 3.6) * R / 2, up = 1.4 + r() * 2.6;
      s.p.set(x + Math.cos(a) * 0.1, 0.45, z + Math.sin(a) * 0.1); s.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
      Object.assign(s, { t: 0, life: 1.2 + r() * 1.0, size: 0.06 + r() * 0.06, wob: r() * 6.283, arc: 0 });
    }
    // soft ochre puffs swelling low round it, and a small plume rising out of the mouth
    for (let i = 0; i < 9; i++) {
      const c = this.clouds[this.cloudI++ % CLOUDS], low = i < 6, a = (i / 6) * 6.283 + r() * 0.5, sp = low ? R * (0.55 + r() * 0.3) : 0.2;
      c.p.set(x + Math.cos(a) * 0.15, low ? 0.35 : 0.6, z + Math.sin(a) * 0.15); c.v.set(Math.cos(a) * sp, low ? 0.25 : 1.6 + (i - 6) * 0.5, Math.sin(a) * sp);
      c.t = 0; c.life = 1.3 + r() * 0.4; c.size = (low ? 1.1 + r() * 0.5 : 0.9 + r() * 0.3) * k; c.m.material.uniforms.uSeed.value = r() * 40;
    }
    const g = this.rings[this.ringI++ % RINGS]; g.t = 0; g.m.visible = true; place(g.m, x, 0.04, z); g.m.scale.setScalar(R * 2);
    place(this.light, x, 0.8, z); this.lightT = 0;
  }
  /** The rules' poisonSpread: a stream of spores arcs from the dead (x, z) to the next body (tx, tz). */
  spread(e) {
    const r = this.rnd, d = Math.hypot(e.tx - e.x, e.tz - e.z);
    for (let i = 0; i < 34; i++) {
      const s = this.spores[this.sporeI++ % SPORES];
      s.from.set(e.x + (r() - 0.5) * 0.3, 0.7 + r() * 0.3, e.z + (r() - 0.5) * 0.3); s.to.set(e.tx + (r() - 0.5) * 0.3, 0.8 + r() * 0.4, e.tz + (r() - 0.5) * 0.3);
      Object.assign(s, { t: -i * 0.014, life: 0.45 + d * 0.04, size: 0.08 + r() * 0.05, arc: 1, h: 0.8 + d * 0.15 + r() * 0.3, wob: r() * 6.283 });
      s.p.copy(s.from);
    }
    // a little puff where they land on the next body
    const c = this.clouds[this.cloudI++ % CLOUDS]; c.p.set(e.tx, 0.8, e.tz); c.v.set(0, 0.4, 0); c.t = -0.45 - d * 0.04; c.life = 1.0; c.size = 0.9; c.m.material.uniforms.uSeed.value = r() * 40;
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const two = this.two, rt = this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (const s of this.spores) {
      if (s.t >= s.life) continue;
      s.t += dt; if (s.t < 0) continue;
      const u = s.t / s.life;
      if (s.arc) {
        // flying the arc to the next body
        const k = Math.min(1, u); s.p.lerpVectors(s.from, s.to, k); s.p.y += Math.sin(Math.PI * k) * s.h + 0.05 * Math.sin(this.time * 9 + s.wob);
      } else {
        // thrown, slowed by the air, then drifting down with a flutter
        s.v.multiplyScalar(Math.max(0, 1 - dt * 2.4)); s.v.y -= 0.9 * dt;
        s.p.addScaledVector(s.v, dt); s.p.x += Math.sin(this.time * 3 + s.wob) * 0.12 * dt; s.p.z += Math.cos(this.time * 2.6 + s.wob) * 0.12 * dt;
        if (s.p.y < 0.05) { s.p.y = 0.05; s.v.set(0, 0, 0); }
      }
      const a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.6) / 0.4, tw = 0.75 + 0.25 * Math.sin(this.time * 17 + s.wob * 5);
      two[0].copy(s.p).addScaledVector(rt, -s.size * 0.5); two[1].copy(s.p).addScaledVector(rt, s.size * 0.5);
      sw = s.size; this.glow.strip(two, dotGlowW, a * 0.8, GOLD_GLOW); this.core.strip(two, dotW, a * tw, s.arc ? PALE : GOLD);
    }
    this.core.end(); this.glow.end();
    const cam = this.camera.quaternion;
    for (const c of this.clouds) {
      if (c.t >= c.life) { c.m.visible = false; continue; }
      c.t += dt; if (c.t < 0) { c.m.visible = false; continue; } const u = c.t / c.life; c.m.visible = true;
      c.v.multiplyScalar(Math.max(0, 1 - dt * 2.5)); c.p.addScaledVector(c.v, dt);
      place(c.m, c.p.x, c.p.y + u * 0.3, c.p.z); c.m.quaternion.copy(cam); c.m.scale.setScalar(c.size * (0.6 + 0.9 * u)); c.m.material.uniforms.uT.value = u;
    }
    for (const g of this.rings) { if (g.t >= 0.5) { g.m.visible = false; continue; } g.t += dt; g.m.material.uniforms.uK.value = Math.min(1, g.t / 0.5); }
    if (this.lightT < 0.5) { this.lightT += dt; this.light.intensity = 3 * (1 - this.lightT / 0.5); } else this.light.intensity = 0;
  }
  clear() {
    for (const s of this.spores) s.t = 9; for (const c of this.clouds) { c.t = 9; c.m.visible = false; } for (const g of this.rings) { g.t = 9; g.m.visible = false; }
    this.light.intensity = 0;
  }
}
