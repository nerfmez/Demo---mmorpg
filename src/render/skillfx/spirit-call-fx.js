// Calling the summoner's spirits (Spirit Swarm first; owner, 2026-11-02: "go on", the summoner group's
// effects one at a time). Research (web search; pages blocked): summon effects are built in layers - a ground
// circle and motes rising from it - in phases from a still circle to a release (a Unity summon-circle study,
// a Roblox layering guide), and a critique warns that too many motions at once (out, up, down and turning)
// stop reading. So one motion per layer, in the spirits' see-through blue light:
//   flight: from the staff's tip a spirit flame per summon arcs out to where the summon will stand (a bright
//           head with a fading tail), the swarm's three leaving a beat apart;
//   circle: where each lands a small rune circle of light opens on the ground (two rings and six ticks,
//           turning slowly), with a soft flash; motes rise from it while the spirit forms out of the ground
//           (render/spirit-reveal.js, held back until its flame lands: SPIRIT_ARRIVE; the rules hold it still until
//           it has formed: summon.arrive);
//   fade:   the circle sinks away.
// Pooled (8 flights, 8 circles), numbers in uniforms; no allocation per frame.
import * as THREE from 'three';
import { Ribbon, place } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightSprite, glowTexture } from './light-kit.js';

export const SPIRIT_ARRIVE = { spirit_wisp: 0.24 }; // when a summon's flame lands (s after the summon): its reveal waits for it
const N = 8, TRAIL = 10, CIRCLE = 0.95, MOTES = 24;
const CORE = [0.72, 0.92, 1.0], GLOW = [0.2, 0.55, 1.0];
const VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FS = `varying vec2 vP; uniform float uA, uRot, uOpen;
  float line(float d, float w){ return 1.0 - smoothstep(w*0.5, w, abs(d)); }
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float R = 0.55 + 0.37*uOpen, a = atan(vP.y, vP.x) + uRot;
    float k = line(r - R, 0.035) + 0.7*line(r - R*0.78, 0.022);
    float cell = fract(a/1.0472 + 0.5) - 0.5, tick = (r > R*0.8 && r < R*0.98) ? line(cell*r*1.0472, 0.03) : 0.0;
    float star = 0.0; for (int i = 0; i < 3; i++) { float t = float(i)*2.0944 + uRot*0.5; star = max(star, line(dot(vP, vec2(cos(t), sin(t))) - 0.0, 0.02) * step(r, R*0.7)); }
    float glow = exp(-pow((r - R)/0.12, 2.0))*0.35 + (1.0 - r)*0.08;
    float v = (k + tick*0.8 + star*0.35 + glow)*uA; if (v < 0.01) discard;
    gl_FragColor = vec4(vec3(0.22, 0.58, 1.0)*v + vec3(0.5, 0.7, 1.0)*v*v*0.25, 1.0); }`;
let sw = 0;
const tailW = (x) => sw * (1 - x) ** 0.7, tailGlowW = (x) => sw * 2.6 * (1 - x) ** 0.7;

export class SpiritCallFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 300, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 300, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 11; this.glow.mesh.renderOrder = 10;
    const halo = glowTexture('lightning'), quad = new THREE.PlaneGeometry(1, 1);
    this.flights = Array.from({ length: N }, () => ({ head: lightSprite(scene, halo, true, 12), t: 9, delay: 0, dur: 0.24, a: new THREE.Vector3(), b: new THREE.Vector3(), lift: 1, trail: Array.from({ length: TRAIL }, () => new THREE.Vector3()), n: 0, landed: true }));
    this.circles = Array.from({ length: N }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uOpen: { value: 0 } } }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m);
      return { m, flash: lightSprite(scene, halo, true, 11), t: 9, x: 0, z: 0, size: 1 };
    });
    this.motes = Array.from({ length: MOTES }, () => ({ p: new THREE.Vector3(), t: 9, life: 0.8, v: 0.8, w: 0.03 }));
    this.fi = 0; this.ci = 0; this.mi = 0; this.pts = Array.from({ length: TRAIL }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.lastCall = -9; this.time = 0; this.order = 0;
  }
  /** A summon e (e.id, e.x, e.z) of `type` called from the staff tip `tip` (world). */
  summon(e, type, tip) {
    const f = this.flights[this.fi++ % N];
    // the swarm's flames leave a beat apart
    if (this.time - this.lastCall > 0.05) this.order = 0;
    this.lastCall = this.time;
    const delay = this.order++ * 0.05, dur = (SPIRIT_ARRIVE[type] || 0.24) - delay;
    Object.assign(f, { t: -delay, delay, dur: Math.max(0.12, dur), lift: 0.5 + 0.2 * this.order, landed: false, n: 0, size: type === 'spirit_wisp' ? 0.75 : 1.2 });
    f.a.copy(tip); f.b.set(e.x, 0.35, e.z);
  }
  land(f) {
    const c = this.circles[this.ci++ % N];
    Object.assign(c, { t: 0, x: f.b.x, z: f.b.z, size: f.size });
    c.m.visible = true; place(c.m, c.x, 0.04, c.z); c.m.scale.setScalar(2 * CIRCLE * c.size);
    for (let i = 0; i < 5; i++) {
      const q = this.motes[this.mi++ % MOTES], a = (i / 5) * 6.283 + Math.random();
      q.p.set(c.x + Math.cos(a) * 0.45 * c.size, 0.08, c.z + Math.sin(a) * 0.45 * c.size); Object.assign(q, { t: -i * 0.06, life: 0.7 + 0.2 * Math.random(), v: 0.9 + 0.5 * Math.random(), w: 0.035 });
    }
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const P = this.pts;
    for (const f of this.flights) {
      if (f.landed && f.t >= 9) { f.head.visible = false; continue; }
      f.t += dt; if (f.t < 0) { f.head.visible = false; continue; }
      const k = Math.min(1, f.t / f.dur), e = 1 - (1 - k) * (1 - k);
      // an arc from the tip up and over to the spot (a quadratic through a raised middle)
      const pos = P[0].lerpVectors(f.a, f.b, e); pos.y += f.lift * 4 * e * (1 - e);
      if (!f.landed) {
        if (f.n === 0) for (const q of f.trail) q.copy(pos);
        for (let i = TRAIL - 1; i > 0; i--) f.trail[i].copy(f.trail[i - 1]); f.trail[0].copy(pos); f.n++;
        sw = 0.17 * f.size; this.glow.strip(f.trail, tailGlowW, 0.9, GLOW); this.core.strip(f.trail, tailW, 0.85, CORE);
        f.head.visible = true; place(f.head, pos.x, pos.y, pos.z); f.head.scale.setScalar(0.85 * f.size * (0.9 + 0.2 * Math.sin(this.time * 40))); f.head.material.opacity = 1;
        if (k >= 1) { f.landed = true; this.land(f); f.t = 0; }
      } else {
        // the tail runs out into the circle
        for (let i = TRAIL - 1; i > 0; i--) f.trail[i].copy(f.trail[i - 1]);
        const fade = 1 - f.t / 0.12; f.head.visible = false;
        if (fade > 0) { sw = 0.11 * f.size * fade; this.glow.strip(f.trail, tailGlowW, 0.6 * fade, GLOW); this.core.strip(f.trail, tailW, 0.7 * fade, CORE); } else f.t = 9;
      }
    }
    for (const q of this.motes) {
      if (q.t >= q.life) continue;
      q.t += dt; if (q.t < 0) continue;
      const u = q.t / q.life; q.p.y += q.v * dt;
      this.two[0].copy(q.p); this.two[1].copy(q.p); this.two[1].y -= 0.16;
      sw = q.w; const a = Math.sin(Math.PI * u); this.glow.strip(this.two, tailGlowW, 0.6 * a, GLOW); this.core.strip(this.two, tailW, 0.8 * a, CORE);
    }
    this.core.end(); this.glow.end();
    for (const c of this.circles) {
      if (c.t >= CIRCLE) { c.m.visible = false; c.flash.visible = false; continue; }
      c.t += dt; const u = c.t / CIRCLE, U = c.m.material.uniforms;
      U.uOpen.value = 1 - (1 - Math.min(1, c.t / 0.15)) ** 2; U.uRot.value = c.t * 1.4; U.uA.value = Math.min(1, c.t / 0.06) * (1 - Math.max(0, (u - 0.45) / 0.55));
      const fk = c.t / 0.18; c.flash.visible = fk < 1;
      if (c.flash.visible) { place(c.flash, c.x, 0.3, c.z); c.flash.scale.setScalar(1.3 * c.size * Math.sin(Math.PI * Math.min(1, fk * 1.3 + 0.1))); c.flash.material.opacity = 1 - fk; }
    }
  }
  clear() { for (const f of this.flights) { f.t = 9; f.landed = true; f.head.visible = false; } for (const c of this.circles) { c.t = 9; c.m.visible = false; c.flash.visible = false; } for (const q of this.motes) q.t = 9; }
}
