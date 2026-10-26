// Meteor, in the bench's light-and-ribbon language. While the rules' delay runs, a cel circle marks
// the hit area and fills like a timer, and a star brightens high in the sky behind the target. In
// the last part of the delay the star drops as a burning rock: a bright head with a thick tapering
// fire tail, shedding embers, speeding up as it falls. On the 'burst' it lands: a ragged flash, a
// shock ring out to the hit radius, embers and dark chips thrown out on their own gravity, and a
// scorched ring that fades. Element Shifts recolour it. Cosmetic only.
// Studied (principles only, docs/VFX-REFERENCE.md): CFXR2 Ground Hit + Debris (an immediate compact
// contact, debris on its own gravity phase), CFXR Impact Contrast (bright core before small bits),
// Arrow Rain's own up-shot/burst timing in this game.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf, flashMaterial, tintFlash, place, placeV, conformPlane, NOISE } from './fx-common.js';

// the star sits low and close enough to stay inside the game camera's view while it falls
const SLOTS = 3, FALL = 0.55, APEX = 6.8, BACK = 2.2, SPARKS = 260;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.35 ? mix(vT, vec3(1.0,0.98,0.85), 0.75) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.0)*0.75; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// a soft round glow (additive), for the star and the falling head
const GLOW_SPRITE_FS = `varying vec2 vUv; uniform vec3 uCol; uniform float uA;
  void main(){ float d=length(vUv); float a=pow(max(0.0,1.0-d),2.2); float core=smoothstep(0.35,0.0,d);
    gl_FragColor=vec4((uCol*a + vec3(1.0)*core*0.8)*uA, 1.0); }`;
// the hit area: a cel outline with a fill that grows inward as the delay runs out
const MARK_FS = `varying vec2 vP; uniform float uFill; uniform float uA; uniform vec3 uCol;
  void main(){ float r=length(vP); if(r>1.0) discard;
    float a = r>0.95 ? 0.85 : (r > 1.0-uFill ? 0.22 : 0.07);
    if (abs(r-(1.0-uFill))<0.015 && uFill>0.02 && uFill<0.99) a=0.6;
    gl_FragColor=vec4(uCol, a*uA); }`;
// the shock ring (thin band) and the scorch (dark soft ring)
const SHOCK_FS = `varying vec2 vP; uniform float uR; uniform float uA; uniform vec3 uCol;
  void main(){ float r=length(vP); float w=0.08+0.1*(1.0-uR); float d=abs(r-uR); if(d>w) discard;
    gl_FragColor=vec4(mix(vec3(1.0),uCol,d/w), uA*(1.0-d/w)); }`;
const SCORCH_FS = `varying vec2 vP; uniform float uA;` + NOISE + `
  void main(){ float r=length(vP); float n=fbm(vP*3.2+7.0); float edge=0.7+0.3*n; if(r>edge) discard;
    float a = smoothstep(edge,edge*0.55,r) * (0.5+0.5*n) * (r<0.22?0.55:1.0);
    gl_FragColor=vec4(0.12,0.08,0.06, a*0.55*uA); }`;
const VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const BILL_VS = `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;

let stripW = 0;
const tailGlowW = (x) => stripW * (0.15 + 1.6 * x * x), tailCoreW = (x) => stripW * (0.05 + 0.95 * x * x * x);
const sparkW = (x) => stripW * Math.sin(Math.PI * x);
const flatMesh = (fs, uniforms, order) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = order; m.visible = false; return m;
};

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 3000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 3000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.slots = Array.from({ length: SLOTS }, (_, k) => {
      const mark = flatMesh(MARK_FS, { uFill: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color() } }, 1);
      const shock = flatMesh(SHOCK_FS, { uR: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color() } }, 2);
      shock.material.blending = THREE.AdditiveBlending;
      const scorch = flatMesh(SCORCH_FS, { uA: { value: 0 } }, 1);
      const star = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 0 } }, vertexShader: BILL_VS, fragmentShader: GLOW_SPRITE_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      star.visible = false; star.renderOrder = 9; star.frustumCulled = false;
      const flash = new THREE.Mesh(quad, flashMaterial(11 + k * 3.1)); flash.visible = false; flash.renderOrder = 9; flash.frustumCulled = false;
      for (const m of [mark, shock, scorch, star, flash]) scene.add(m);
      return { mark, shock, scorch, star, flash, live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, look: null, apex: new THREE.Vector3(), head: new THREE.Vector3(), landed: -1 };
    });
    this.sparks = []; this.free = []; this.rnd = mulberry32(61);
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.sparkAlive = (s) => s.life < s.max || (this.free.push(s), false);
  }
  // core 'area' event: the rules' delay starts. from: the caster (the rock comes from behind the target, away from them)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0], look = lookOf(element);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.5, e.delay), x: e.x, z: e.z, radius: e.radius, look, landed: -1 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    for (const m of [s.mark, s.shock, s.scorch]) { place(m, e.x, 0.03, e.z); m.scale.setScalar(e.radius * 2); conformPlane(m); }
    s.mark.visible = true; s.mark.material.uniforms.uCol.value.setRGB(look.edge[0], look.edge[1], look.edge[2]);
    s.shock.material.uniforms.uCol.value.setRGB(look.glow[0], look.glow[1], look.glow[2]);
    s.star.visible = true; s.star.material.uniforms.uCol.value.setRGB(look.glow[0], look.glow[1], look.glow[2]);
    tintFlash(s.flash.material, element);
  }
  // core 'burst': the rock lands
  impact(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landed = s.t; s.mark.visible = false; s.star.visible = false;
    s.flash.visible = true; place(s.flash, e.x, 0.9, e.z);
    s.shock.visible = true; s.scorch.visible = true;
    const r = this.rnd;
    for (let i = 0; i < 46 && this.sparks.length < SPARKS; i++) {
      const a = r() * 6.283, sp = 3 + r() * 6, rock = i < 10;
      const q = this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
      q.p.set(e.x + Math.cos(a) * 0.4, 0.3, e.z + Math.sin(a) * 0.4);
      q.v.set(Math.cos(a) * sp * (rock ? 0.6 : 1), (rock ? 4 : 2.5) + r() * 4, Math.sin(a) * sp * (rock ? 0.6 : 1));
      q.life = 0; q.max = rock ? 0.7 + r() * 0.3 : 0.35 + r() * 0.35; q.w = rock ? 0.11 : 0.05; q.rock = rock; q.look = s.look; this.sparks.push(q);
    }
  }
  ember(p, look) {
    if (this.sparks.length >= SPARKS) return;
    const r = this.rnd, q = this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
    q.p.copy(p); q.v.set((r() - 0.5) * 2, 0.5 + r(), (r() - 0.5) * 2);
    q.life = 0; q.max = 0.25 + r() * 0.25; q.w = 0.045; q.rock = false; q.look = look; this.sparks.push(q);
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    const two = this.two, three = this.three;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      const fallAt = s.delay - FALL;
      if (s.landed < 0) {
        const k = Math.min(1, s.t / s.delay);
        s.mark.material.uniforms.uFill.value = k; s.mark.material.uniforms.uA.value = Math.min(1, s.t / 0.12);
        if (s.t < fallAt) {
          // the star: a point of light swelling in the sky
          const u = Math.min(1, s.t / Math.max(0.1, fallAt));
          placeV(s.star, s.apex); s.star.quaternion.copy(this.camera.quaternion);
          s.star.scale.setScalar(0.6 + 1.4 * u + 0.15 * Math.sin(s.t * 40)); s.star.material.uniforms.uA.value = 0.4 + 0.6 * u;
        } else {
          // the fall: accelerating from the star to the circle's centre
          const u = Math.min(1, (s.t - fallAt) / FALL), e = u * u * 0.7 + u * 0.3;
          s.head.set(s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.3 * e, s.apex.z + (s.z - s.apex.z) * e);
          placeV(s.star, s.head); s.star.quaternion.copy(this.camera.quaternion); s.star.scale.setScalar(2.2); s.star.material.uniforms.uA.value = 1;
          const dx = s.apex.x - s.x, dy = s.apex.y, dz = s.apex.z - s.z, l = Math.hypot(dx, dy, dz), tl = 1 + 3.2 * Math.min(1, u * 3);
          two[0].set(s.head.x + dx / l * tl, s.head.y + dy / l * tl, s.head.z + dz / l * tl); two[1].copy(s.head);
          stripW = 1.1; this.glow.strip(two, tailGlowW, 1, s.look.glow);
          stripW = 0.45; this.core.strip(two, tailCoreW, 1, s.look.edge);
          if (this.rnd() < dt * 60) this.ember(s.head, s.look);
        }
      } else {
        const k = s.t - s.landed;
        const f = k / 0.26; s.flash.visible = f < 1;
        if (s.flash.visible) { s.flash.quaternion.copy(this.camera.quaternion); s.flash.scale.setScalar(s.radius * (1.1 + f * 0.9)); s.flash.material.uniforms.uT.value = f; }
        const sh = Math.min(1, k / 0.32);
        s.shock.material.uniforms.uR.value = 0.25 + 0.75 * (1 - Math.pow(1 - sh, 3)); s.shock.material.uniforms.uA.value = 1 - sh; s.shock.visible = sh < 1;
        s.scorch.material.uniforms.uA.value = Math.min(1, k / 0.08) * (1 - THREE.MathUtils.smoothstep(k, 0.6, 1.5));
        if (k > 1.5) { s.live = false; s.scorch.visible = false; s.shock.visible = false; s.flash.visible = false; }
      }
    }
    let w = 0;
    for (const q of this.sparks) {
      q.life += dt; q.v.y -= (q.rock ? 16 : 9) * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.03) { q.p.y = 0.03; q.v.set(q.v.x * 0.3, Math.abs(q.v.y) * 0.2, q.v.z * 0.3); }
      const u = q.life / q.max;
      if (u < 1) {
        three[0].copy(q.p).addScaledVector(q.v, -0.035); three[1].copy(q.p).lerp(three[0], 0.5); three[2].copy(q.p);
        stripW = q.w;
        if (q.rock) this.core.strip(three, sparkW, 1 - u * u, ROCK);
        else { this.glow.strip(three, sparkW, 0.8 * (1 - u), q.look.glow); this.core.strip(three, sparkW, 1 - u, q.look.spark); }
      }
      if (this.sparkAlive(q)) this.sparks[w++] = q;
    }
    this.sparks.length = w;
    this.core.end(); this.glow.end();
  }
  clear() {
    for (const s of this.slots) { s.live = false; for (const m of [s.mark, s.shock, s.scorch, s.star, s.flash]) m.visible = false; }
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live); }
}
const ROCK = [0.24, 0.17, 0.13];
