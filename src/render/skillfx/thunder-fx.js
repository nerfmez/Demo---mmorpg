// Thunderstorm, in the bench's light-and-ribbon language. When the storm is cast (the first 'area'
// event of its waves) a dark cloud gathers over the hit circle and a thin blue outline marks the area
// on the ground. Each wave's 'burst' brings down two jagged bolts from the cloud to spots inside the
// circle: a white core in a blue glow with a short fork, flickering and gone in a fifth of a second,
// a ground flash and a spray of sparks where each lands, and the cloud lights from inside. The cloud
// thins away after the last wave. Element Shifts recolour it. Cosmetic only.
// Studied (principles only, docs/VFX-REFERENCE.md "developing a lightning skill"): a strike as the
// main motion, an impact flash, secondary sparks, and Chain Spark's own bolt look in this game.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, flashMaterial, tintFlash, place, conformPlane, NOISE } from './fx-common.js';

const SLOTS = 3, BOLTS = 10, FLASHES = 8, CLOUD_Y = 6.2, BOLT_LIFE = 0.2, SPARKS = 220;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.85) discard; gl_FragColor=vec4(mix(vT, vec3(1.0), 0.85), vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.0)*0.8; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the storm cloud: a swirling dark disc, lit from inside by uLit
const CLOUD_FS = `varying vec2 vP; uniform float uT; uniform float uA; uniform float uLit; uniform vec3 uCol;` + NOISE + `
  void main(){ float r=length(vP); if(r>1.0) discard;
    float th=atan(vP.y,vP.x)+uT*0.35+r*1.6; vec2 q=vec2(cos(th),sin(th))*r*3.0;
    float n=fbm(q+uT*0.4); float body=smoothstep(1.0,0.35,r)*(0.45+0.75*n);
    if(body<0.25) discard;
    vec3 c=mix(vec3(0.16,0.19,0.27), vec3(0.32,0.36,0.48), n);
    c=mix(c, uCol+0.4, uLit*smoothstep(0.9,0.0,r)*n);
    gl_FragColor=vec4(c, min(1.0,body)*0.78*uA); }`;
const MARK_FS = `varying vec2 vP; uniform float uA; uniform float uPulse; uniform vec3 uCol;
  void main(){ float r=length(vP); if(r>1.0) discard;
    float a = r>0.955 ? 0.75 : 0.05 + 0.12*uPulse; gl_FragColor=vec4(mix(uCol,vec3(1.0),uPulse*0.5), a*uA); }`;
const VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;

let stripW = 0;
const boltW = (x, k) => stripW * (k === 0 ? 0.6 : 1), sparkW = (x) => stripW * Math.sin(Math.PI * x);

export class ThunderFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 2400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const flat = (fs, uniforms, order, segs = 12) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, segs, segs), new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = order; m.visible = false; scene.add(m); return m; };
    this.slots = Array.from({ length: SLOTS }, () => ({
      cloud: flat(CLOUD_FS, { uT: { value: 0 }, uA: { value: 0 }, uLit: { value: 0 }, uCol: { value: new THREE.Color() } }, 6, 1),
      mark: flat(MARK_FS, { uA: { value: 0 }, uPulse: { value: 0 }, uCol: { value: new THREE.Color() } }, 1),
      live: false, t: 0, end: 0, x: 0, z: 0, radius: 3, look: null, lit: 0, pulse: 0,
    }));
    const quad = new THREE.PlaneGeometry(1, 1);
    this.flashes = Array.from({ length: FLASHES }, (_, k) => { const m = new THREE.Mesh(quad, flashMaterial(5 + k * 1.7)); m.visible = false; m.renderOrder = 9; m.frustumCulled = false; scene.add(m); return { m, t: 9 }; });
    this.flashI = 0;
    // bolts: fixed point buffers (a main path of 9 points and a fork of 4)
    this.bolts = Array.from({ length: BOLTS }, () => ({ live: false, t: 0, main: Array.from({ length: 9 }, () => new THREE.Vector3()), fork: Array.from({ length: 4 }, () => new THREE.Vector3()), look: null }));
    this.sparks = []; this.free = []; this.rnd = mulberry32(29);
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  // core 'area' event of one wave: the first one of a storm gathers its cloud
  begin(e, element) {
    let s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) {
      s = this.slots.find((q) => !q.live) || this.slots[0];
      const look = lookOf(element);
      Object.assign(s, { live: true, t: 0, end: 0, x: e.x, z: e.z, radius: e.radius, look, lit: 0, pulse: 0 });
      place(s.cloud, e.x, CLOUD_Y, e.z); s.cloud.scale.setScalar(e.radius * 2.4); s.cloud.visible = true;
      s.cloud.material.uniforms.uCol.value.setRGB(look.glow[0], look.glow[1], look.glow[2]);
      place(s.mark, e.x, 0.03, e.z); s.mark.scale.setScalar(e.radius * 2); conformPlane(s.mark); s.mark.visible = true;
      s.mark.material.uniforms.uCol.value.setRGB(look.edge[0], look.edge[1], look.edge[2]);
    }
    s.end = Math.max(s.end, s.t + e.delay + 0.6);
  }
  // core 'burst' of one wave: two bolts strike inside the circle
  strike(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.lit = 1; s.pulse = 1;
    const r = this.rnd;
    for (let n = 0; n < 2; n++) {
      const b = this.bolts.find((q) => !q.live) || this.bolts[0];
      const a = r() * 6.283, d = Math.sqrt(r()) * e.radius * 0.8, gx = e.x + Math.cos(a) * d, gz = e.z + Math.sin(a) * d;
      const sx = e.x + (r() - 0.5) * e.radius, sz = e.z + (r() - 0.5) * e.radius;
      for (let i = 0; i < 9; i++) {
        const u = i / 8, jag = i === 0 || i === 8 ? 0 : 0.55 * Math.sin(Math.PI * u);
        b.main[i].set(sx + (gx - sx) * u + (r() - 0.5) * jag * 1.6, CLOUD_Y * (1 - u), sz + (gz - sz) * u + (r() - 0.5) * jag * 1.6);
      }
      const from = b.main[3 + Math.floor(r() * 2)], fa = r() * 6.283;
      for (let i = 0; i < 4; i++) { const u = i / 3; b.fork[i].set(from.x + Math.cos(fa) * 1.4 * u + (r() - 0.5) * 0.3 * u, from.y - 1.6 * u, from.z + Math.sin(fa) * 1.4 * u + (r() - 0.5) * 0.3 * u); }
      b.live = true; b.t = -n * 0.06; b.look = s.look;
      const f = this.flashes[this.flashI++ % FLASHES]; f.t = -n * 0.06; place(f.m, gx, 0.6, gz); tintFlash(f.m.material, 'lightning'); f.m.userData.look = s.look;
      for (let i = 0; i < 9 && this.sparks.length < SPARKS; i++) {
        const sa = r() * 6.283, sp = 2 + r() * 3, q = this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
        q.p.set(gx, 0.1, gz); q.v.set(Math.cos(sa) * sp, 1.5 + r() * 2.5, Math.sin(sa) * sp); q.life = -n * 0.06; q.max = 0.2 + r() * 0.15; q.look = s.look; this.sparks.push(q);
      }
    }
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt; s.lit = Math.max(0, s.lit - dt / 0.25); s.pulse = Math.max(0, s.pulse - dt / 0.2);
      const fade = Math.min(1, s.t / 0.3) * (1 - THREE.MathUtils.smoothstep(s.t, s.end - 0.4, s.end));
      const u = s.cloud.material.uniforms; u.uT.value = s.t; u.uA.value = fade; u.uLit.value = s.lit;
      s.mark.material.uniforms.uA.value = fade; s.mark.material.uniforms.uPulse.value = s.pulse;
      if (s.t >= s.end) { s.live = false; s.cloud.visible = false; s.mark.visible = false; }
    }
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.t += dt;
      if (b.t < 0) continue;
      const k = b.t / BOLT_LIFE;
      if (k >= 1) { b.live = false; continue; }
      const flick = (Math.sin(b.t * 90) > -0.3 ? 1 : 0.35) * (1 - k * k);
      stripW = 0.55; this.glow.strip(b.main, boltW, flick, b.look.glow); this.glow.strip(b.fork, boltW, flick * 0.7, b.look.glow);
      stripW = 0.13; this.core.strip(b.main, boltW, flick, b.look.spark); this.core.strip(b.fork, boltW, flick * 0.8, b.look.spark);
    }
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / 0.18;
      f.m.visible = k >= 0 && k < 1;
      if (f.m.visible) { f.m.quaternion.copy(this.camera.quaternion); f.m.scale.setScalar(1.3 + k * 1.2); f.m.material.uniforms.uT.value = k; }
    }
    const three = this.three;
    let w = 0;
    for (const q of this.sparks) {
      q.life += dt;
      if (q.life >= 0) {
        q.v.y -= 10 * dt; q.p.addScaledVector(q.v, dt);
        const u = q.life / q.max;
        if (u < 1) {
          three[0].copy(q.p).addScaledVector(q.v, -0.03); three[1].copy(q.p).lerp(three[0], 0.5); three[2].copy(q.p);
          stripW = 0.05; this.glow.strip(three, sparkW, 0.7 * (1 - u), q.look.glow); this.core.strip(three, sparkW, 1 - u, q.look.spark);
        }
      }
      if (q.life < q.max) this.sparks[w++] = q; else this.free.push(q);
    }
    this.sparks.length = w;
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const s of this.slots) { s.live = false; s.cloud.visible = false; s.mark.visible = false; }
    for (const b of this.bolts) b.live = false;
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live) || this.bolts.some((b) => b.live); }
}
