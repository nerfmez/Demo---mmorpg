// Miasma Arrow (the spell archer's poison skill, 2026-10-31). Its own look, apart from the other poison
// (Venom Arrow's needle and puff) and the mage's zones (Blizzard's storm wall): the mist comes out of the
// arrow. A poisoned arrow arcs from the bow and pins in the middle of the circle; it pumps the mist out
// in beats (a ring running out over the ground with each beat, in time with the rules' ticks): a toxic
// pool in cel greens covers the true radius with a clear rim, bubbles welling in it, and soft cel puffs of
// gas roll out from the arrow and rise a little before thinning. When the zone ends the gas thins, the
// pool dries inward and the arrow crumbles. Puffs are one instanced draw (camera-facing quads cut from
// noise); the pool one decal. Cosmetic only: the rules' 'area' (kind poison_mist_arrow) and 'areaEnd'.
import * as THREE from 'three';
import { Ribbon, mulberry32, place, conformPlane, fxGround, NOISE } from './fx-common.js';

const ZONES = 3, PUFFS = 64, PUFF_LIFE = 1.9, FLIGHT = 0.24, SHAFT = 0.95, BEAT = 0.5;
const SHAFT_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.95) discard; vec3 c = vT*(1.0 - 0.35*d*d); gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the pool: cel greens swirling slowly, bubbles welling up in cells, a clear rim at the true radius and a
// ring running out from the arrow on every beat
const POOL_FS = `varying vec2 vP; uniform float uGrow; uniform float uDry; uniform float uT; uniform float uBeat; uniform float uSeed;` + NOISE + `
  void main(){
    float r = length(vP), a = atan(vP.y, vP.x);
    float edge = 0.97*uGrow*(1.0 - 0.95*uDry*uDry) + 0.02*sin(a*7.0 + uSeed);
    if (r > edge) discard;
    float sw = a + uT*0.25 - r*1.3;
    float n = fbm(vec2(cos(sw), sin(sw))*1.6*r + vec2(r*2.2 + uSeed, -uT*0.15));
    // a murky violet pool (it must read on green grass) with sickly lime swirls
    vec3 deep = vec3(0.2, 0.12, 0.27), mid = vec3(0.34, 0.2, 0.42), lite = vec3(0.55, 0.78, 0.22);
    vec3 c = n > 0.54 ? mid : deep; float al = n > 0.54 ? 0.7 : 0.62;
    if (abs(n - 0.66) < 0.025) { c = lite; al = 0.8; }   // thin lime swirl lines, not blobs
    // bubbles: in a grid of cells, each wells up as a ring and pops on its own clock
    vec2 g = vP*5.5 + uSeed; vec2 id = floor(g), f = fract(g) - 0.5;
    float hsh = fract(sin(dot(id, vec2(41.3, 289.1)))*43758.5), ph = fract(uT*0.7 + hsh);
    float br = 0.12 + 0.22*ph, ring = abs(length(f + (hsh - 0.5)*0.3) - br);
    if (hsh > 0.45 && ring < 0.035*(1.0 - ph) + 0.01 && r < edge - 0.05) { c = vec3(0.82, 1.0, 0.45); al = 0.85*(1.0 - ph); }
    // the beat's ring
    float bt = abs(r - uBeat*edge);
    if (uBeat > 0.02 && bt < 0.03) { c = mix(c, vec3(0.85, 1.0, 0.5), 0.8); al = max(al, 0.8*(1.0 - uBeat)); }
    // the rim: a clear line at the edge so the area reads
    float e = edge - r;
    if (e < 0.06) { c = vec3(0.72, 0.96, 0.3); al = 0.9; }
    if (e < 0.02) { c = vec3(0.22, 0.12, 0.28); al = 0.95; }
    gl_FragColor = vec4(c, al*(1.0 - uDry*0.6)); }`;
// gas puffs: camera-facing quads, cut from noise, two cel greens with a lit rim; aLife (age 0..1, seed)
const PUFF_VS = `attribute vec2 aLife; varying vec2 vUv; varying vec2 vLife;
  void main(){ vUv = uv*2.0 - 1.0; vLife = aLife;
    vec4 c = viewMatrix*modelMatrix*instanceMatrix*vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(instanceMatrix[0].xyz);
    c.xy += position.xy*s;
    gl_Position = projectionMatrix*c; }`;
const PUFF_FS = `varying vec2 vUv; varying vec2 vLife;` + NOISE + `
  void main(){
    float age = vLife.x; if (age < 0.0 || age > 1.0) discard;
    float r = length(vUv);
    float n = fbm(vUv*1.7 + vLife.y*9.0 + vec2(age*0.6, -age*0.9));
    float body = n*1.25 - r*0.95 - max(0.0, age - 0.35)*0.85 + 0.12*(1.0 - smoothstep(0.0, 0.15, age));
    if (body < 0.05) discard;
    // sickly lime gas with violet shadows: it reads over grass and over the violet pool
    vec3 c = body > 0.34 ? vec3(0.8, 0.97, 0.42) : body > 0.17 ? vec3(0.55, 0.82, 0.24) : vec3(0.42, 0.28, 0.52);
    gl_FragColor = vec4(c, body > 0.17 ? 0.88 : 0.7); }`;

let sw = 0;
const shaftW = () => sw, glowW = (x) => sw * (0.6 + 2.4 * x * x);
const X = new THREE.Vector3(1, 0, 0), UPV = new THREE.Vector3(0, 1, 0);

export class MiasmaFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.shaft = new Ribbon(scene, camera, 400, SHAFT_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 600, GLOW_FS, THREE.AdditiveBlending);
    this.shaft.mesh.renderOrder = 6; this.glow.mesh.renderOrder = 7;
    const poolVS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
    this.zones = Array.from({ length: ZONES }, (_, k) => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uGrow: { value: 0 }, uDry: { value: 0 }, uT: { value: 0 }, uBeat: { value: 0 }, uSeed: { value: k * 3.1 } },
        vertexShader: poolVS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), mat); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m);
      return { m, mat, live: false, id: 0, x: 0, z: 0, r: 3, t: 0, dur: 3, endT: -1, fx: 0, fz: 0, dir: new THREE.Vector3(), puffAt: 0 };
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.life = new Float32Array(PUFFS * 2).fill(-1);
    quad.setAttribute('aLife', new THREE.InstancedBufferAttribute(this.life, 2));
    this.puffMesh = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false }), PUFFS);
    this.puffMesh.frustumCulled = false; this.puffMesh.renderOrder = 8; this.puffMesh.count = PUFFS; this.puffMesh.visible = false; scene.add(this.puffMesh);
    this.puffs = Array.from({ length: PUFFS }, () => ({ t: 9, p: new THREE.Vector3(), v: new THREE.Vector3(), s0: 1, s1: 2, seed: 0 })); this.puffI = 0;
    this.rnd = mulberry32(47); this.t = 0;
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.p = new THREE.Vector3(); this.side = new THREE.Vector3(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s3 = new THREE.Vector3();
  }
  // the rules' 'area' of a Miasma Arrow; from: the hero (the arrow arcs from the bow)
  begin(e, from) {
    const z = this.zones.find((q) => !q.live) || this.zones[0];
    Object.assign(z, { live: true, id: e.id, x: e.x, z: e.z, r: e.radius, t: 0, dur: e.duration || 3, endT: -1, fx: from.x, fz: from.z, puffAt: FLIGHT, puffN: 0 });
    z.m.visible = true; z.m.scale.setScalar(e.radius * 2); place(z.m, e.x, 0.04, e.z); conformPlane(z.m);
    z.mat.uniforms.uGrow.value = 0; z.mat.uniforms.uDry.value = 0;
    // the arrow's slant once pinned: along its flight, coming down
    z.dir.set(e.x - from.x, -1.6, e.z - from.z).normalize();
  }
  // the rules' 'areaEnd': the gas thins and the pool dries
  end(id) { const z = this.zones.find((q) => q.live && q.id === id); if (z && z.endT < 0) z.endT = z.t; }
  puff(z, big) {
    const q = this.puffs[this.puffI++ % PUFFS], r = this.rnd, a = r() * 6.283, d = big ? 0.2 : 0.1 + r() * 0.3;
    q.t = 0; q.seed = r();
    q.p.set(z.x + Math.cos(a) * d, 0.25 + r() * 0.2, z.z + Math.sin(a) * d);
    const sp = z.r * (0.75 + r() * 0.5) / PUFF_LIFE;
    q.v.set(Math.cos(a) * sp, 0.12 + r() * 0.18, Math.sin(a) * sp);
    q.s0 = big ? 1.2 : 0.7 + r() * 0.4; q.s1 = (big ? 2.6 : 1.7 + r() * 0.8) * Math.min(1.2, z.r / 2.8);
  }
  update(dt) {
    this.t += dt;
    this.shaft.begin(); this.glow.begin();
    const two = this.two, three = this.three;
    for (const z of this.zones) {
      if (!z.live) continue;
      z.t += dt;
      const t = z.t, U = z.mat.uniforms;
      U.uT.value = this.t;
      // flight: a low arc from the bow onto the centre
      if (t < FLIGHT) {
        const u = t / FLIGHT, h = (1 - u) * 1.4 + 4 * 1.6 * u * (1 - u);
        this.p.set(z.fx + (z.x - z.fx) * u, h, z.fz + (z.z - z.fz) * u);
        this.side.set(z.x - z.fx, -1.4 + 6.4 * (1 - 2 * u), z.z - z.fz).normalize();
        two[0].copy(this.p).addScaledVector(this.side, -SHAFT); two[1].copy(this.p);
        sw = 0.05; this.shaft.strip(two, shaftW, 1, [0.28, 0.2, 0.1]);
        three[0].copy(this.p).addScaledVector(this.side, -1.4); three[1].copy(this.p).addScaledVector(this.side, -0.5); three[2].copy(this.p);
        sw = 0.08; this.glow.strip(three, glowW, 0.9, [0.55, 0.92, 0.2]);
        continue;
      }
      const live = t - FLIGHT, ending = z.endT >= 0 ? Math.min(1, (t - z.endT) / 0.7) : 0;
      if (ending >= 1) { z.live = false; z.m.visible = false; continue; }
      U.uGrow.value = 1 - Math.pow(1 - Math.min(1, live / 0.3), 3);
      U.uDry.value = ending;
      U.uBeat.value = z.endT < 0 ? (live % BEAT) / BEAT : 0;
      // the pinned arrow: shaft at its slant, a sickly glowing head in the ground, fletching up top
      const d = z.dir;
      two[0].set(z.x, 0.03, z.z); two[1].set(z.x - d.x * SHAFT * 0.6, -d.y * SHAFT * 0.6, z.z - d.z * SHAFT * 0.6);
      sw = 0.055; this.shaft.strip(two, shaftW, 1 - ending, [0.26 - 0.1 * ending, 0.2, 0.1]);
      two[0].set(z.x, 0.05, z.z); two[1].set(z.x, 0.3, z.z);
      const beat = z.endT < 0 ? 1 - (live % BEAT) / BEAT : 0;
      sw = 0.25 + 0.2 * beat; this.glow.strip(two, glowW, (0.5 + 0.5 * beat) * (1 - ending), [0.5, 0.95, 0.2]);
      // pump the gas out: a big puff on each beat, small ones between
      if (z.endT < 0) {
        while (z.puffAt <= t) { this.puff(z, z.puffN % 3 === 0); z.puffN++; z.puffAt += BEAT / 6; }
      }
    }
    // puffs
    let any = false;
    for (let i = 0; i < PUFFS; i++) {
      const q = this.puffs[i]; q.t += dt;
      const age = q.t / PUFF_LIFE, on = age < 1;
      this.life[i * 2] = on ? age : -1; this.life[i * 2 + 1] = q.seed;
      if (!on) continue;
      any = true;
      q.p.addScaledVector(q.v, dt); q.v.multiplyScalar(1 - 0.6 * dt);
      const s = q.s0 + (q.s1 - q.s0) * (1 - Math.pow(1 - age, 2));
      this.p.copy(q.p); this.p.y += fxGround.y(q.p.x, q.p.z) + s * 0.25;
      this.m4.compose(this.p, this.q.identity(), this.s3.setScalar(s)); this.puffMesh.setMatrixAt(i, this.m4);
    }
    if (any || this.puffMesh.visible) { this.puffMesh.instanceMatrix.needsUpdate = true; this.puffMesh.geometry.attributes.aLife.needsUpdate = true; }
    this.puffMesh.visible = any;
    this.shaft.end(); this.glow.end();
  }
  clear() {
    for (const z of this.zones) { z.live = false; z.m.visible = false; }
    for (const q of this.puffs) q.t = 9;
    this.puffMesh.visible = false;
  }
  get busy() { return this.zones.some((z) => z.live) || this.puffMesh.visible; }
}
