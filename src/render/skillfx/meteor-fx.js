// Meteor, in the FX bench's language (owner, 2026-10-26: the effects made on the bench are the
// reference) and sized for a job skill (10 s cooldown). Built one phase at a time with the owner.
//   Warning (the rules' delay): a thin double ring of light marks the hit area, an inner ring closes
//   in like a timer, the ground inside glows hotter and embers rise off the ring; a star brightens in
//   the sky behind the target.
//   Fall (the last FALL seconds): a real rock, lit, with molten cracks glowing through it, tumbles
//   down wrapped in fire: a solid flame tail of licking tongues (white-hot core, yellow, orange, a red
//   edge) behind a hot glow, shedding embers and leaving smoke.
//   Impact ('burst'): a big glow pops, light rays burst up and out, two shock rings race past the
//   radius, glowing cracks open in the ground and cool, spark streaks fly, little stars pop, embers
//   linger. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, placeV, place, conformPlane, NOISE } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightOf, glowTexture, starTexture, lightSprite, W, lineW, lineGlowW, taperW, taperGlowW, tailGlowW, circlePoints, drawSparks, spark } from './light-kit.js';

// the flame tail: x runs tail (0) -> head (1), y across; licking tongues eat into the edge
const FLAME_FS = `varying vec2 vUv; varying float vA; varying vec3 vT; uniform float uT;` + NOISE + `
  void main(){ float x=vUv.x, d=abs(vUv.y);
    float n = fbm(vec2(x*5.0 - uT*7.0, vUv.y*1.7 + uT*0.6));
    float edge = (0.42 + 0.58*x) * (0.62 + 0.5*n);
    if (d > edge || vA < 0.02) discard;
    float k = d/edge, heat = x*0.75 + (1.0-k)*0.6 + n*0.25;
    vec3 c = mix(vec3(1.0,0.42,0.1), vec3(1.0,0.62,0.18), smoothstep(0.45,0.55,heat));
    c = mix(c, vec3(1.0,0.86,0.4), smoothstep(0.78,0.86,heat));
    c = mix(c, vec3(1.0,0.98,0.88), smoothstep(1.0,1.08,heat));
    float a = vA * (1.0 - smoothstep(0.7, 1.0, k) * (1.0 - x*0.6));
    gl_FragColor = vec4(c, a); }`;
// the rock: lit in three steps, molten cracks glowing through, a hot rim on the side the fire wraps
const ROCK_VS = `varying vec3 vN; varying vec3 vO; varying vec3 vV;
  void main(){ vO=position; vec4 w=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`;
const ROCK_FS = `varying vec3 vN; varying vec3 vO; varying vec3 vV; uniform float uHeat;` + NOISE + `
  void main(){ vec3 N=normalize(vN); float ndl=dot(N, normalize(vec3(-0.35,0.8,0.5)));
    vec3 c = ndl > 0.45 ? vec3(0.36,0.3,0.32) : (ndl > 0.0 ? vec3(0.24,0.19,0.22) : vec3(0.14,0.1,0.13));
    float n = fbm(vO.xy*1.6 + vO.z*1.3);
    float crack = abs(fract(n*2.6) - 0.5);
    float glow = 1.0 - smoothstep(0.02, 0.09, crack);
    c = mix(c, vec3(1.0,0.5,0.12), glow);
    c = mix(c, vec3(1.0,0.95,0.7), 1.0 - smoothstep(0.0, 0.03, crack));
    float under = smoothstep(0.1, -0.7, N.y);
    c = mix(c, vec3(1.0,0.55,0.16), under * 0.75 * uHeat);
    float rim = 1.0 - max(dot(N, normalize(vV)), 0.0);
    c = mix(c, vec3(1.0,0.78,0.36), smoothstep(0.5, 0.9, rim) * uHeat);
    gl_FragColor = vec4(c, 1.0); }`;
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; let a = seed;
  const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280), o = [r() * 6, r() * 6, r() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 0.86 + 0.16 * Math.sin(v.x * 2.3 + o[0]) * Math.cos(v.y * 2.1 + o[1]) + 0.08 * Math.sin(v.z * 3.7 + o[2]);
    p.setXYZ(i, v.x * f * 1.05, v.y * f * 0.88, v.z * f);
  }
  g.computeVertexNormals(); return g;
}
const smokeTexture = (() => { let t = null; return () => {
  if (t) return t; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(120,108,104,0.85)'); grad.addColorStop(0.55, 'rgba(96,86,84,0.45)'); grad.addColorStop(1, 'rgba(80,72,70,0)'); g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  t = new THREE.CanvasTexture(c); t.userData.shared = true; return t; }; })();
const HEAT_FS = `varying vec2 vP; uniform float uA; void main(){ float r=length(vP); if(r>1.0) discard; float a=pow(1.0-r,1.6); gl_FragColor=vec4(vec3(1.0,0.45,0.12)*a*uA, 1.0); }`;
const flameW = (x) => W.v * (0.25 + 0.75 * Math.pow(x, 0.6));

const SLOTS = 2, FALL = 0.6, APEX = 7, BACK = 2.8, RAYS = 14, CRACKS = 9, STARS = 8, EMBERS = 10, SPARKS = 360, RING = 48, SMOKE = 18, TAIL = 10;

export class MeteorFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 7000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 7000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.rnd = mulberry32(61); this.sparks = []; this.free = [];
    this.slots = Array.from({ length: SLOTS }, () => ({
      live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, el: 'fire', look: lightOf('fire'), landedAt: -1, sparkAt: 0,
      apex: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(),
      sky: lightSprite(scene, glowTexture('fire'), true, 9), skyStar: lightSprite(scene, starTexture('fire'), false, 10),
      pop: lightSprite(scene, glowTexture('fire'), true, 9),
      rays: Array.from({ length: RAYS }, () => ({ d: new THREE.Vector3(), len: 1 })),
      cracks: Array.from({ length: CRACKS }, () => Array.from({ length: 5 }, () => new THREE.Vector3())),
      stars: Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, starTexture('fire'), false, 10), p: new THREE.Vector3(), at: 0 })),
      embers: Array.from({ length: EMBERS }, () => ({ sp: lightSprite(scene, glowTexture('fire'), true, 9), p: new THREE.Vector3(), ph: 0 })),
    }));
    this.flame = new Ribbon(scene, camera, 600, FLAME_FS, THREE.NormalBlending); this.flame.mesh.renderOrder = 9;
    this.flame.mesh.material.uniforms.uT = { value: 0 };
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uHeat: { value: 1 } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    for (const s of this.slots) {
      s.rock = new THREE.Mesh(rockGeometry(11 + this.slots.indexOf(s) * 7), this.rockMat); s.rock.visible = false; scene.add(s.rock);
      s.heat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `, fragmentShader: HEAT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.heat.rotation.x = -Math.PI / 2; s.heat.renderOrder = 1; s.heat.visible = false; scene.add(s.heat);
      s.smoke = Array.from({ length: SMOKE }, () => { const sp = lightSprite(scene, smokeTexture(), false, 6); return { sp, p: new THREE.Vector3(), t: 9, s: 1 }; });
      s.smokeI = 0; s.smokeAt = 0; s.emberAt = 0;
    }
    this.tail = Array.from({ length: TAIL }, () => new THREE.Vector3());
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, el: element, look: lightOf(element), landedAt: -1, sparkAt: 0 });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    for (const sp of [s.sky, s.pop, ...s.embers.map((q) => q.sp)]) sp.material.map = glowTexture(element);
    for (const sp of [s.skyStar, ...s.stars.map((q) => q.sp)]) sp.material.map = starTexture(element);
    place(s.heat, e.x, 0.04, e.z); s.heat.scale.setScalar(e.radius * 2); conformPlane(s.heat); s.heat.visible = true;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t; s.sky.visible = false; s.skyStar.visible = false; s.rock.visible = false; s.heat.visible = false;
    const r = this.rnd, R = s.radius;
    s.rays.forEach((ray, k) => { const a = r() * 6.283, el = k < 5 ? 0.9 + r() * 0.6 : 0.1 + r() * 0.5; ray.d.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); ray.len = R * (k < 5 ? 0.7 + r() * 0.5 : 0.45 + r() * 0.4); });
    s.cracks.forEach((c, k) => { const a = (k / CRACKS) * 6.283 + (r() - 0.5) * 0.4, len = R * (0.55 + r() * 0.4); for (let i = 0; i < 5; i++) { const u = i / 4, j = i ? (r() - 0.5) * 0.35 : 0; c[i].set(s.x + Math.cos(a + j * 0.4) * len * u, 0.03, s.z + Math.sin(a + j * 0.4) * len * u); } });
    s.stars.forEach((q) => { const a = r() * 6.283, d = R * (0.2 + r() * 0.7); q.p.set(s.x + Math.cos(a) * d, 0.6 + r() * 1.6, s.z + Math.sin(a) * d); q.at = 0.05 + r() * 0.35; });
    s.embers.forEach((q) => { const a = r() * 6.283, d = R * Math.sqrt(r()) * 0.8; q.p.set(s.x + Math.cos(a) * d, 0.15, s.z + Math.sin(a) * d); q.ph = r() * 6; });
    for (let i = 0; i < 60; i++) { const a = r() * 6.283, sp = 3 + r() * 7; this.p.set(s.x + Math.cos(a) * 0.3, 0.3, s.z + Math.sin(a) * 0.3); this.v.set(Math.cos(a) * sp, 3 + r() * 6, Math.sin(a) * sp); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.35 + r() * 0.35, 0.05, s.look); }
  }
  hide(s) { for (const sp of [s.sky, s.skyStar, s.pop, ...s.stars.map((q) => q.sp), ...s.embers.map((q) => q.sp), ...s.smoke.map((q) => q.sp)]) sp.visible = false; s.rock.visible = false; s.heat.visible = false; for (const q of s.smoke) q.t = 9; }
  update(dt) {
    this.core.begin(); this.glow.begin(); this.flame.begin(); this.time = (this.time || 0) + dt; this.flame.mesh.material.uniforms.uT.value = this.time;
    for (const s of this.slots) {
      if (!s.live && !s.smoke.some((q) => q.t < 1)) continue;
      if (s.live) { s.t += dt; if (s.landedAt < 0) this.warn(s, dt); else this.after(s, s.t - s.landedAt); }
      for (const q of s.smoke) { // smoke puffs: swell, drift up, thin away
        if (q.t >= 1) { q.sp.visible = false; continue; }
        q.t += dt / 0.9; q.p.y += dt * 0.6; q.sp.visible = true; placeV(q.sp, q.p); q.sp.scale.setScalar(q.s * (0.5 + 1.2 * q.t)); q.sp.material.opacity = 0.75 * (1 - q.t);
      }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 13);
    this.core.end(); this.glow.end(); this.flame.end();
  }
  warn(s, dt) {
    const L = s.look, open = Math.min(1, s.t / 0.15), k = Math.min(1, s.t / s.delay);
    // the hit area: an outer ring and a closing timer ring
    circlePoints(this.ring, s.x, s.z, s.radius * (0.9 + 0.1 * open));
    W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.7 * open, L.glow); this.core.strip(this.ring, lineW, open, L.edge);
    circlePoints(this.ring, s.x, s.z, s.radius * Math.max(0.05, 1 - k) * 0.97);
    W.v = 0.035; this.glow.strip(this.ring, lineGlowW, 0.6 * open, L.glow); this.core.strip(this.ring, lineW, 0.85 * open, L.edge);
    // the ground inside heats up, embers rising off the ring as the hit nears
    s.heat.material.uniforms.uA.value = 0.15 + 0.6 * k * k;
    if (k > 0.3 && this.rnd() < dt * 40 * k) { const r = this.rnd, a = r() * 6.283; this.p.set(s.x + Math.cos(a) * s.radius * 0.98, 0.05, s.z + Math.sin(a) * s.radius * 0.98); this.v.set(0, 1.5 + r() * 2, 0); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.4 + r() * 0.3, 0.035, L); }
    const fallAt = s.delay - FALL;
    if (s.t < fallAt) {
      const u = Math.min(1, s.t / Math.max(0.1, fallAt)), tw = 0.8 + 0.2 * Math.sin(s.t * 30);
      s.sky.visible = true; placeV(s.sky, s.apex); s.sky.scale.setScalar((0.8 + 1.6 * u) * tw);
      s.skyStar.visible = true; placeV(s.skyStar, s.apex); s.skyStar.scale.setScalar((0.4 + 0.7 * u) * tw); s.skyStar.material.rotation = s.t * 2;
      return;
    }
    s.skyStar.visible = false;
    const f = Math.min(1, (s.t - fallAt) / FALL), e = f * f * 0.65 + f * 0.35;
    s.head.set(s.apex.x + (s.x - s.apex.x) * e, s.apex.y * (1 - e) + 0.7 * e, s.apex.z + (s.z - s.apex.z) * e);
    // the rock: tumbling, growing in as it leaves the star
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(0.85 * Math.min(1, 0.35 + f * 4)); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    // the hot glow round it
    placeV(s.sky, s.head); s.sky.scale.setScalar(3.4 + 0.4 * Math.sin(s.t * 47)); s.sky.material.opacity = 0.9;
    // the flame tail: licking tongues streaming back up the path (tail -> head)
    const len = 1.5 + 4.5 * Math.min(1, f * 2.5);
    for (let i = 0; i < TAIL; i++) { const u = i / (TAIL - 1); this.tail[i].copy(s.head).addScaledVector(s.dir, -len * (1 - u) - 0.15); }
    W.v = 2.3; this.flame.strip(this.tail, flameW, 1, L.edge);
    W.v = 1.1; this.glow.strip(this.tail, tailGlowW, 0.9, L.glow);
    const r = this.rnd;
    if (s.t - s.emberAt > 0.016) { s.emberAt = s.t; this.v.set((r() - 0.5) * 3, 0.5 + r() * 1.5, (r() - 0.5) * 3).addScaledVector(s.dir, -3); this.p.copy(s.head).addScaledVector(s.dir, -0.6); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.25, 0.05, L); }
    if (s.t - s.smokeAt > 0.05) { s.smokeAt = s.t; const q = s.smoke[s.smokeI++ % SMOKE]; q.t = 0; q.s = 0.9 + r() * 0.7; q.p.copy(s.head).addScaledVector(s.dir, -len * (0.55 + r() * 0.4)); q.p.x += (r() - 0.5) * 0.6; q.p.z += (r() - 0.5) * 0.6; }
  }
  after(s, t) {
    const L = s.look, R = s.radius;
    // the glow pops big and fades
    const pk = Math.min(1, t / 0.35); s.pop.visible = pk < 1;
    if (s.pop.visible) { this.p.set(s.x, 0.8, s.z); placeV(s.pop, this.p); s.pop.scale.setScalar(R * (1.1 + 1.0 * Math.sqrt(pk))); s.pop.material.opacity = 1 - pk * pk; }
    // rays: shoot out, then thin away
    const rk = Math.min(1, t / 0.32);
    if (rk < 1) for (const ray of s.rays) {
      this.two[0].set(s.x, 0.3, s.z).addScaledVector(ray.d, ray.len * 0.15 * rk); this.two[1].set(s.x, 0.3, s.z).addScaledVector(ray.d, ray.len * (0.4 + 0.6 * Math.sqrt(rk)));
      W.v = 0.16 * (1 - rk); this.glow.strip(this.two, taperGlowW, 1 - rk, L.glow); this.core.strip(this.two, taperW, 1 - rk * rk, L.edge);
    }
    // two shock rings racing out past the radius
    for (const [d, w, far] of [[0, 0.09, 1.15], [0.1, 0.05, 0.95]]) {
      const k = Math.min(1, Math.max(0, t - d) / 0.4); if (k <= 0 || k >= 1) continue;
      circlePoints(this.ring, s.x, s.z, R * far * (1 - Math.pow(1 - k, 2)) + 0.2, 0.06);
      W.v = w * (1 - k * 0.7); this.glow.strip(this.ring, lineGlowW, 1 - k, L.glow); this.core.strip(this.ring, lineW, 1 - k * k, L.edge);
    }
    // glowing cracks: open fast, glow, cool
    const ck = Math.min(1, t / 0.12), cool = Math.max(0, 1 - Math.max(0, t - 0.6) / 1.2);
    if (cool > 0) for (const c of s.cracks) { W.v = 0.07 * ck; this.glow.strip(c, lineGlowW, cool, L.glow); this.core.strip(c, taperW, cool, L.edge); }
    // little stars pop around
    for (const q of s.stars) {
      const k = (t - q.at) / 0.4; q.sp.visible = k > 0 && k < 1;
      if (q.sp.visible) { placeV(q.sp, q.p); q.sp.scale.setScalar(0.5 * Math.sin(Math.PI * k)); q.sp.material.rotation = k * 2; }
    }
    // embers linger and flicker out
    for (const q of s.embers) {
      const k = t / 1.8; q.sp.visible = k < 1;
      if (q.sp.visible) { placeV(q.sp, q.p); q.sp.scale.setScalar(0.55 * (1 - k) * (0.7 + 0.3 * Math.sin(t * 20 + q.ph))); q.sp.material.opacity = 1 - k; }
    }
    if (t > 2) { s.live = false; this.hide(s); }
  }
  clear() { for (const s of this.slots) { s.live = false; this.hide(s); } for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; }
  get busy() { return this.sparks.length > 0 || this.slots.some((s) => s.live || s.smoke.some((q) => q.t < 1)); }
}
