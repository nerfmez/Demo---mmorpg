// Visuals for what mods add on top of a skill: Burning Ground patches (core 'area' of kind
// burning_ground, synced from game.areas) and secondary bursts (core 'burst' kind mod_burst,
// e.g. Shatter). Cosmetic only.
import * as THREE from 'three';
import { mulberry32, NOISE, flashMaterial, tintFlash, lookOf, Ribbon, place, placeV } from './fx-common.js';

const groundFS = `varying vec2 vP; uniform float uT; uniform float uLife; uniform float uSeed; ${NOISE}
  void main(){
    float r = length(vP); vec2 dir = vP/max(r,1e-3);
    float edge = 0.78 + 0.22*fbm(dir*3.0 + uSeed);
    float fade = smoothstep(0.0, 0.15, uLife) * smoothstep(1.0, 0.8, uLife);
    if (r > edge) discard;
    float n = fbm(vP*3.2 + vec2(uT*0.6, -uT*0.9) + uSeed);
    float tongues = fbm(vec2(atan(vP.y,vP.x)*3.0 + uSeed, r*4.0 - uT*2.5));
    float k = n*0.75 + tongues*0.45 - r*0.35;
    vec3 ash = vec3(0.24,0.14,0.11), red = vec3(0.86,0.22,0.08), org = vec3(1.0,0.52,0.14), yel = vec3(1.0,0.84,0.36);
    vec3 c = ash;
    float a = 0.55;
    c = mix(c, red, step(0.42, k)); a = mix(a, 0.85, step(0.42, k));
    c = mix(c, org, step(0.55, k));
    c = mix(c, yel, step(0.68, k));
    float rim = smoothstep(edge - 0.08, edge, r);
    c = mix(c, vec3(0.45,0.08,0.05), rim*0.8);
    gl_FragColor = vec4(c, a * fade); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
const burstAlive = (b) => b.t < 0.2;
let sparkW = 0;
const sparkWidth = (x) => sparkW * x;

export class ModFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.grounds = new Map();
    this.bursts = [];
    this.flashes = Array.from({ length: 8 }, (_, k) => { const m = new THREE.Mesh(this.quad, flashMaterial(11 + k * 2.9)); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return m; });
    this.embers = new Ribbon(scene, camera, 2000, `varying vec2 vUv; varying float vA; varying vec3 vT;
      void main(){ float d=abs(vUv.y); if(d>0.9) discard; gl_FragColor=vec4(d<0.45 ? vec3(1.0,0.96,0.8) : vT, vA); }`, THREE.NormalBlending);
    this.sparks = []; this.rnd = mulberry32(13); this.t = 0;
    this.sparkFree = []; this.seg = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.sparkAlive = (s) => s.age < s.life || (this.sparkFree.push(s), false);
  }
  // areas: the game's live areas; draws each burning_ground patch for as long as the rules keep it
  syncAreas(areas) {
    const seen = new Set();
    for (const a of areas) {
      if (a.kind !== 'burning_ground') continue;
      seen.add(a.id);
      let g = this.grounds.get(a.id);
      if (!g) {
        const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uLife: { value: 0 }, uSeed: { value: (a.id * 7.3) % 50 } },
          vertexShader: `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
          fragmentShader: groundFS, transparent: true, depthWrite: false });
        const m = new THREE.Mesh(this.quad, mat);
        m.rotation.x = -Math.PI / 2; place(m, a.x, 0.03, a.z); m.scale.setScalar(a.radius * 2.1); m.renderOrder = 1;
        this.scene.add(m); g = { m, a }; this.grounds.set(a.id, g);
      }
      g.a = a;
      g.m.material.uniforms.uLife.value = Math.min(1, a.t / Math.max(0.01, a.duration));
      if (this.rnd() < 0.25) { const r = this.rnd, ang = r() * 6.28, rr = Math.sqrt(r()) * a.radius * 0.8; this.spark(a.x + Math.cos(ang) * rr, 0.1, a.z + Math.sin(ang) * rr, 'fire', 0.6); }
    }
    for (const [id, g] of this.grounds) if (!seen.has(id)) { g.m.removeFromParent(); g.m.material.dispose(); this.grounds.delete(id); }
  }
  burst(e) { this.bursts.push({ x: e.x, z: e.z, radius: e.radius, element: e.element, t: 0, seed: this.rnd() * 40 }); for (let i = 0; i < 10; i++) this.spark(e.x, 0.8, e.z, e.element, 2.5); }
  spark(x, y, z, element, speed) {
    if (this.sparks.length > 300) return;
    const r = this.rnd, a = r() * 6.28, s = this.sparkFree.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
    s.p.set(x, y, z); s.v.set(Math.cos(a) * speed * r(), 1.2 + r() * 2.2, Math.sin(a) * speed * r());
    s.age = 0; s.life = 0.4 + r() * 0.5; s.w = 0.025 + r() * 0.02; s.tint = lookOf(element).edge;
    this.sparks.push(s);
  }
  update(dt) {
    this.t += dt;
    for (const g of this.grounds.values()) g.m.material.uniforms.uT.value = this.t;
    let i = 0;
    for (const b of this.bursts) {
      b.t += dt;
      if (b.t < 0.2 && i < this.flashes.length) {
        const f = this.flashes[i++];
        f.visible = true; place(f, b.x, 0.9, b.z); f.quaternion.copy(this.camera.quaternion);
        f.scale.setScalar(b.radius * 1.5 * (b.t < 0.03 ? 0.6 + b.t / 0.075 : 1));
        f.material.uniforms.uT.value = b.t / 0.2; f.material.uniforms.uSeed.value = b.seed + Math.floor(b.t * 30); tintFlash(f.material, b.element);
      }
    }
    for (; i < this.flashes.length; i++) this.flashes[i].visible = false;
    compact(this.bursts, burstAlive);
    for (const s of this.sparks) { s.age += dt; s.v.y -= 3 * dt; s.p.addScaledVector(s.v, dt); }
    compact(this.sparks, this.sparkAlive);
    this.embers.begin();
    const seg = this.seg;
    for (const s of this.sparks) {
      const u = s.age / s.life;
      seg[0].copy(s.p).addScaledVector(s.v, -0.04); seg[1].copy(s.p).lerp(seg[0], 0.5); seg[2].copy(s.p);
      sparkW = s.w;
      this.embers.strip(seg, sparkWidth, 1 - u * u, s.tint);
    }
    this.embers.end();
  }
  clear() { for (const g of this.grounds.values()) { g.m.removeFromParent(); g.m.material.dispose(); } this.grounds.clear(); this.bursts = []; for (const s of this.sparks) this.sparkFree.push(s); this.sparks.length = 0; }
}
