// Meteor, held to the bar of the owner's best effects (2026-10-26: Firebolt and Flame Stream): fire
// as nested see-through shells cut from flowing noise in Firebolt's heat ramp (meteor-flame.js),
// smooth every frame, with Firebolt's fluttering embers (FireExtras). Sized for a job skill (10 s
// cooldown); rules in docs/VFX-REFERENCE.md.
//   Warning and fall (the rules' delay): a crisp two-tone edge at the true radius over a low fill; a
//   plain fill grows from the centre and reaches the edge on the landing frame. The meteor is in view
//   the whole time: a dark rock with molten cracks leading a comet of fire, far up the sky at first,
//   speeding up as it comes; embers peel off behind; the ground under it lights up as it nears.
//   Impact ('burst'): Firebolt's ragged flash and fire puff at meteor size, a dome of fire that bursts
//   up out of the ground, then tears into tongues and burns away as it cools; embers flutter out;
//   glowing rock chunks fly and land; a round crater is left, its molten floor cooling, then fades.
//   Cosmetic only.
import * as THREE from 'three';
import { mulberry32, placeV, place, conformPlane, fxGround, addLight, NOISE } from './fx-common.js';
import { glowTexture, lightSprite } from './light-kit.js';
import { warnDisc } from './anime-kit.js';
import { FireExtras } from './fire-extras.js';
import { flameMaterial, cometShell, domeShell } from './meteor-flame.js';

// the rock: two flat cel bands, molten cracks in flat fire bands, the face it falls on red-hot
const ROCK_VS = `varying vec3 vN; varying vec3 vO;
  void main(){ vO=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
const ROCK_FS = `varying vec3 vN; varying vec3 vO; uniform vec3 uDir;` + NOISE + `
  void main(){ vec3 N=normalize(vN);
    vec3 c = dot(N, normalize(vec3(-0.4,0.8,0.45))) > 0.15 ? vec3(0.29,0.21,0.25) : vec3(0.16,0.11,0.14);
    float n = fbm(vO.xy*1.3 + vO.z*1.1), crack = abs(fract(n*2.4) - 0.5);
    if (crack < 0.075) c = crack < 0.03 ? vec3(1.0,0.82,0.25) : vec3(1.0,0.48,0.1);
    float hot = dot(N, uDir);
    if (hot > 0.35) c = hot > 0.72 ? vec3(1.0,0.82,0.25) : vec3(1.0,0.48,0.1);
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

const SLOTS = 2, APEX = 7, BACK = 2.8, FAR = 1.5, CHUNKS = 5, CRATER = 4.2;
const ROCK = 0.85, HEAD = 1.15, TAIL = 4.2, DOME = 2.0;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
const HEAT_FS = `varying vec2 vP; uniform float uA; void main(){ float r=length(vP); if(r>1.0) discard; float a=pow(1.0-r,1.6); gl_FragColor=vec4(vec3(1.0,0.45,0.12)*a*uA, 1.0); }`;
const HEAT_VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
// the crater, a decal on the ground (radius 1 = the bowl's lip; the plane spans 1.7): a sunken bowl,
// its wall lit on the side facing the sun (the far wall) and shaded on the near one, a raised broken
// lip, soot round it, a molten floor that cools (uGlow), fading out (uA)
const CRATER_FS = `varying vec2 vP; uniform float uA; uniform float uGlow; uniform float uSeed;` + NOISE + `
  void main(){
    vec2 p = vP*1.7; float r = length(p), an = atan(p.y, p.x);
    float n = fbm(vec2(cos(an), sin(an))*2.0 + uSeed), lip = 1.0 + 0.1*(n - 0.5);
    float soot = (1.0 - smoothstep(lip, 1.65, r)) * (0.55 + 0.45*fbm(p*2.3 + uSeed));
    if (r > 1.65 || (r > lip + 0.12 && soot < 0.05)) discard;
    vec2 d = p/max(r, 1e-3), L = normalize(vec2(-0.55, -0.83));            // the sun's side on the ground plane
    float wall = smoothstep(0.25, 0.9, r/lip) * (1.0 - smoothstep(0.9, 1.0, r/lip));
    float lit = dot(-d, L);                                                   // a wall facing the sun is lit
    vec3 c = mix(vec3(0.17, 0.12, 0.1), vec3(0.3, 0.22, 0.17), smoothstep(0.0, 0.85, r/lip));
    c *= 1.0 + 0.55*lit*wall;
    float a = 0.92;
    if (r > lip*0.9) { float k = (r - lip*0.9)/(lip*0.22); c = mix(vec3(0.46, 0.36, 0.26), vec3(0.33, 0.25, 0.19), clamp(k, 0.0, 1.0)) * (1.0 - 0.35*lit); }
    if (r > lip + 0.12) { c = vec3(0.14, 0.1, 0.09); a = 0.5*soot; }
    float m = (1.0 - smoothstep(0.2, 0.62, r)) * smoothstep(0.42, 0.62, fbm(p*3.0 + uSeed*2.0) + 0.25*(1.0 - r));
    c = mix(c, mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.85, 0.4), smoothstep(0.6, 0.9, m)), clamp(m*1.6, 0.0, 1.0)*uGlow);
    gl_FragColor = vec4(c, a*uA); }`;

export class MeteorFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.embers = new FireExtras(scene, camera);
    this.rnd = mulberry32(61); this.clock = 0;
    // drawn over its own fire: the rock leads, the fire wraps round behind it
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS, depthTest: false, transparent: true });
    this.chunkMat = new THREE.ShaderMaterial({ uniforms: { uDir: { value: new THREE.Vector3(0, -1, 0) } }, vertexShader: ROCK_VS, fragmentShader: ROCK_FS });
    const shell = (geo, mode, layer, filled, order) => { const m = new THREE.Mesh(geo, flameMaterial(mode, layer, filled)); m.renderOrder = order; m.frustumCulled = false; return m; };
    this.slots = Array.from({ length: SLOTS }, (_, i) => {
      const comet = new THREE.Group();
      comet.add(shell(cometShell(0, HEAD, TAIL), 0, 0, false, 7), shell(cometShell(1, HEAD, TAIL), 0, 1, false, 6));
      const cometCore = shell(new THREE.SphereGeometry(HEAD * 0.8, 24, 16), 0, 1, true, 5); comet.add(cometCore);
      const dome = new THREE.Group();
      dome.add(shell(domeShell(), 1, 0, false, 7), shell(domeShell(), 1, 1, false, 6));
      const domeCore = shell(domeShell(), 1, 1, true, 5); domeCore.scale.setScalar(0.62); dome.add(domeCore);
      for (const g of [comet, dome]) { g.visible = false; scene.add(g); for (const m of g.children) m.material.uniforms.uSeed.value = i * 1.7; }
      comet.children[0].material.uniforms.uLen.value = comet.children[1].material.uniforms.uLen.value = TAIL; comet.children[2].material.uniforms.uLen.value = TAIL;
      for (const m of comet.children) m.material.uniforms.uFront.value = HEAD;
      const heat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: HEAT_VS, fragmentShader: HEAT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      heat.rotation.x = -Math.PI / 2; heat.renderOrder = 1; heat.visible = false; scene.add(heat);
      const rock = new THREE.Mesh(rockGeometry(11 + i * 7), this.rockMat); rock.visible = false; rock.renderOrder = 12; scene.add(rock);
      const crater = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: i * 5.3 } }, vertexShader: HEAT_VS, fragmentShader: CRATER_FS, transparent: true, depthWrite: false }));
      crater.rotation.x = -Math.PI / 2; crater.renderOrder = 2; crater.visible = false; scene.add(crater);
      return {
        live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, landedAt: -1, salt: i * 101, grow: 1,
        from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3(),
        warn: warnDisc(scene), halo: lightSprite(scene, glowTexture('fire'), true, 4),
        comet, dome, heat, rock, crater, emberAt: 0,
        chunks: Array.from({ length: CHUNKS }, (_, j) => { const m = new THREE.Mesh(rockGeometry(31 + j * 5 + i), this.chunkMat); m.visible = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), size: 0.2, landed: -1 }; }),
      };
    });
    this.light = addLight(scene, new THREE.PointLight('#ffae5a', 0, 12, 1.6));
    this.v = new THREE.Vector3(); this.p = new THREE.Vector3(); this.tip = new THREE.Vector3(); this.q = new THREE.Quaternion();
  }
  // core 'area': the rules' delay starts. from: the caster (the meteor comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.hide(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, landedAt: -1, emberAt: 0.15 });
    // the line it falls along: down from behind the target, starting FAR metres beyond the old apex
    s.to.set(e.x, 0.9, e.z);
    s.dir.set(-dx / l * BACK, -APEX, -dz / l * BACK).normalize();
    s.from.copy(s.to).addScaledVector(s.dir, -((APEX - 0.9) / -s.dir.y + FAR));
    const U = s.warn.material.uniforms; U.uR.value = e.radius; U.uK.value = 0; U.uOpen.value = 0;
    place(s.warn, e.x, 0.04, e.z); s.warn.scale.setScalar(e.radius * 2 * 1.06); conformPlane(s.warn); s.warn.visible = true;
    place(s.heat, e.x, 0.05, e.z); s.heat.scale.setScalar(e.radius * 2.2); conformPlane(s.heat); s.heat.visible = true; s.heat.material.uniforms.uA.value = 0;
  }
  // core 'burst': it lands
  impact(e) {
    const s = this.slots.find((q) => q.live && q.landedAt < 0 && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landedAt = s.t;
    for (const m of [s.halo, s.comet, s.rock, s.warn]) m.visible = false;
    const r = this.rnd, R = s.radius, gy = fxGround.y(s.x, s.z);
    place(s.crater, s.x, 0.06, s.z); s.crater.scale.setScalar(R * 0.62 * 1.7 * 2); conformPlane(s.crater); s.crater.visible = true;
    // Firebolt's ragged flash and fire puff, at meteor size, and its embers
    this.embers.impact(s.x, gy + 1.2, s.z, false, 2.8);
    this.embers.burst(s.x, gy + 0.3, s.z, 18, 2.2, R * 0.5);
    s.dome.visible = true; place(s.dome, s.x, 0, s.z); s.dome.scale.setScalar(0.01);
    // glowing chunks of the rock fly out and land
    s.chunks.forEach((c, j) => {
      const a = (j / CHUNKS) * 6.283 + r() * 0.6, sp = 3 + r() * 3.5;
      c.p.set(s.x + Math.cos(a) * 0.4, 0.6, s.z + Math.sin(a) * 0.4); c.v.set(Math.cos(a) * sp, 4 + r() * 4, Math.sin(a) * sp);
      c.spin.set(r() * 9, r() * 9, r() * 9); c.size = 0.16 + r() * 0.16; c.landed = -1; c.m.visible = true;
    });
  }
  hide(s) {
    for (const m of [s.halo, s.comet, s.dome, s.rock, s.warn, s.heat, s.crater]) m.visible = false;
    for (const c of s.chunks) c.m.visible = false;
  }
  update(dt) {
    this.clock += dt;
    let light = 0;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      light = Math.max(light, s.landedAt < 0 ? this.warn(s, dt) : this.after(s, s.t - s.landedAt, dt));
    }
    this.light.intensity = light;
    this.embers.update(dt, this.tip);
  }
  warn(s, dt) {
    const k = Math.min(1, s.t / s.delay);
    // the true area: a crisp edge, a low fill, and a fill growing to the edge on the landing frame
    const U = s.warn.material.uniforms; U.uOpen.value = Math.min(1, s.t / 0.15); U.uK.value = k;
    // the meteor, in view the whole time: far up the sky at first, speeding up as it comes
    const e = Math.pow(k, 1.8);
    s.head.lerpVectors(s.from, s.to, e);
    s.grow = 0.45 + 0.55 * e;
    s.rock.visible = true; placeV(s.rock, s.head); s.rock.scale.setScalar(ROCK * s.grow); s.rock.rotation.x += dt * 5; s.rock.rotation.z += dt * 3.2;
    this.rockMat.uniforms.uDir.value.copy(s.dir);
    // the comet of fire round it, its tail stretching out as it speeds up
    s.comet.visible = true; this.p.copy(s.head).addScaledVector(s.dir, 0.15 * s.grow); placeV(s.comet, this.p);
    s.comet.quaternion.copy(this.q.setFromUnitVectors(X, s.dir));
    s.comet.scale.set(s.grow * (0.4 + 0.6 * Math.min(1, k * 1.6)), s.grow, s.grow);
    for (const m of s.comet.children) m.material.uniforms.uTime.value = this.clock;
    s.halo.visible = true; placeV(s.halo, s.head); s.halo.scale.setScalar(3.2 * s.grow); s.halo.material.opacity = 0.3;
    // embers peel off behind it
    while (s.emberAt < s.t) { s.emberAt += 0.02; this.p.copy(s.head).addScaledVector(s.dir, -1.2 * s.grow); this.embers.burst(this.p.x, this.p.y + fxGround.y(this.p.x, this.p.z), this.p.z, 1, 0.9, 0.8); }
    // the ground under it lights up as it nears
    s.heat.material.uniforms.uA.value = 0.05 + 0.6 * e * e;
    placeV(this.light, s.head);
    return 6 * e;
  }
  after(s, t, dt) {
    const R = s.radius;
    // the dome: bursts up out of the ground in a few frames, then tears into tongues and burns away
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.16), 3), size = R * 0.72 * (0.35 + 0.65 * grow) * (1 + 0.12 * Math.min(1, t / 0.9));
    const cut = Math.max(0, t - 0.22) / 0.75, fade = Math.max(0, Math.min(1, (1.05 - t) / 0.2));
    s.dome.visible = fade > 0; s.dome.scale.set(size, size * 1.3, size);
    for (const m of s.dome.children) { const u = m.material.uniforms; u.uTime.value = this.clock; u.uCut.value = 0.07 + 0.45 * cut * cut; u.uCool.value = 0.07 + 0.2 * Math.min(1, cut); u.uAlpha.value = fade; }
    s.dome.children[2].material.uniforms.uAlpha.value = Math.max(0, 1 - t / 0.35);
    // the ground glow flares, then cools
    s.heat.material.uniforms.uA.value = 0.6 * Math.max(0, 1 - t / 1.4);
    // glowing chunks: fly, spin, land, cool down
    this.chunkMat.uniforms.uDir.value.set(0, 1, 0);   // chunks glow on the side the camera sees
    for (const c of s.chunks) {
      if (!c.m.visible) continue;
      if (c.landed < 0) {
        c.v.y -= 16 * dt; c.p.addScaledVector(c.v, dt); c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt;
        if (c.p.y < c.size * 0.6 && c.v.y < 0) { c.p.y = c.size * 0.6; c.landed = t; this.embers.burst(c.p.x, c.p.y + fxGround.y(c.p.x, c.p.z), c.p.z, 4, 0.7); }
        else if (this.rnd() < dt * 30) this.embers.burst(c.p.x, c.p.y + fxGround.y(c.p.x, c.p.z), c.p.z, 1, 0.4);
      }
      const k = c.landed < 0 ? 1 : Math.max(0, 1 - (t - c.landed) / 0.6);
      c.m.visible = k > 0; placeV(c.m, c.p); c.m.scale.setScalar(c.size * k);
    }
    // the crater: its molten floor cools, then it fades away
    const C = s.crater.material.uniforms; C.uGlow.value = Math.max(0, 1 - t / 1.6); C.uA.value = Math.min(1, t / 0.06) * Math.max(0, Math.min(1, (CRATER - t) / 0.8));
    if (t > CRATER) { s.live = false; this.hide(s); }
    this.p.set(s.x, 1.5, s.z); placeV(this.light, this.p);
    return 14 * Math.max(0, 1 - t / 0.7);
  }
  clear() { for (const s of this.slots) { s.live = false; this.hide(s); } this.embers.clear(); this.light.intensity = 0; }
  get busy() { return this.slots.some((s) => s.live) || this.embers.embers.length > 0; }
}
