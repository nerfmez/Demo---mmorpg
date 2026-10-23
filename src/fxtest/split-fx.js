// Frontline Split, in the bench's light-and-ribbon language. During the rules' 0.65 s wind-up the
// lane it will cut (range x width, turning with the aim) is drawn on the ground as a thin cel outline
// that fills from the hero outward, and light gathers along the raised blade. On 'lineStrike' a
// standing crescent of light races down the lane, a white-hot cut line opens in the ground behind
// it, and every struck target gets a clean diagonal cut mark; then the lane and the line fade.
// Cosmetic only; sizes and timing come from the rules.
import * as THREE from 'three';
import { Ribbon, mulberry32, lookOf } from './fx-common.js';

const WAVE_T = 0.2, FADE = 0.5, CUTS = 8, WAVE_PTS = 13;
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.96), 0.85) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;
// the lane: a thin outline, a faint fill and a brighter band filling from the hero (y=0) to the end
const LANE_FS = `varying vec2 vP; uniform float uFill; uniform float uAlpha; uniform float uFlash; uniform vec3 uCol; uniform vec2 uSize;
  void main(){
    vec2 m = vec2(min(vP.x, uSize.x - vP.x), min(vP.y, uSize.y - vP.y)); // distance to each edge in metres
    float edge = min(m.x, m.y);
    float a = 0.08;
    if (vP.y < uFill * uSize.y) a = 0.2;
    if (edge < 0.04) a = 0.75;
    if (abs(vP.y - uFill * uSize.y) < 0.03 && uFill < 0.999) a = 0.9; // the leading edge of the fill
    a += uFlash * 0.45;
    gl_FragColor = vec4(mix(uCol, vec3(1.0), 0.3 + 0.5 * uFlash), a * uAlpha); }`;

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.6;
const taperW = (x) => stripW * Math.sin(Math.PI * x), taperGlowW = (x) => taperW(x) * 2.6;
const sparkGlowW = () => stripW * 2.2, sparkCoreW = (x) => stripW * x * (1 - stripU * 0.6);

export class SplitFx {
  constructor(scene, camera) {
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    this.laneMat = new THREE.ShaderMaterial({ uniforms: { uFill: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 }, uCol: { value: new THREE.Color() }, uSize: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 vP; uniform vec2 uSize; void main(){ vP=uv*uSize; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: LANE_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // the lane plane stands in a group turned to the aim: its uv.y runs from the hero to the far end
    this.lane = new THREE.Group(); this.lane.visible = false; scene.add(this.lane);
    this.laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.laneMat);
    this.laneMesh.rotation.x = Math.PI / 2; this.laneMesh.renderOrder = 1; this.lane.add(this.laneMesh);
    this.wind = null; this.strikeAt = null; this.cuts = []; this.sparks = []; this.look = lookOf('physical'); this.rnd = mulberry32(61);
    this.pts = Array.from({ length: WAVE_PTS }, () => new THREE.Vector3()); this.sub = [];
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.dir = new THREE.Vector3(); this.side = new THREE.Vector3();
    this.cutAlive = (c) => c.t < 0.32; this.sparkAlive = (s) => s.life < s.max;
  }
  // castStart of the line cut: the wind-up lasts total; range and width from the skill
  windup(total, range, width, element) {
    this.look = lookOf(element);
    this.wind = { t: 0, total, range, width };
    this.strikeAt = null;
    this.laneMat.uniforms.uCol.value.setRGB(...this.look.edge);
    this.laneMat.uniforms.uSize.value.set(width, range);
    this.laneMesh.scale.set(width, range, 1); this.lane.visible = true;
  }
  placeLane(x, z, angle) {
    const w = this.wind || this.strikeAt; if (!w) return;
    this.lane.position.set(x + Math.sin(angle) * w.range / 2, 0.03, z + Math.cos(angle) * w.range / 2);
    this.lane.rotation.y = angle;
  }
  // the rules' 'lineStrike'
  strike(e) {
    this.wind = null;
    this.strikeAt = { t: 0, x: e.x, z: e.z, angle: e.angle, range: e.range, width: e.width };
    this.look = lookOf(e.element);
    this.laneMesh.scale.set(e.width, e.range, 1); this.laneMat.uniforms.uSize.value.set(e.width, e.range);
    this.placeLane(e.x, e.z, e.angle);
    const r = this.rnd;
    for (let i = 0; i < 14; i++) { // sparks thrown up off the cut line
      const d = 0.6 + r() * (e.range - 0.6), a = r() * 6.283;
      this.spark(e.x + Math.sin(e.angle) * d, e.z + Math.cos(e.angle) * d, Math.cos(a) * 1.5, 2 + r() * 2.5, Math.sin(a) * 1.5, (d / e.range) * WAVE_T);
    }
  }
  // a clean diagonal cut across a struck target
  cut(center) { if (this.cuts.length < CUTS) this.cuts.push({ c: center.clone(), t: 0, tilt: (this.rnd() - 0.5) * 0.8 }); }
  spark(x, z, vx, vy, vz, delay) { if (this.sparks.length < 200) this.sparks.push({ p: new THREE.Vector3(x, 0.08, z), v: new THREE.Vector3(vx, vy, vz), life: -delay, max: 0.3, w: 0.03 }); }
  update(dt, hero, facing, bladeBase, bladeTip) {
    this.core.begin(); this.glow.begin();
    const look = this.look, two = this.two, three = this.three, r = this.rnd;
    const W = this.wind;
    if (W) {
      W.t += dt;
      const u = Math.min(1, W.t / W.total);
      this.placeLane(hero.x, hero.z, facing);
      this.laneMat.uniforms.uFill.value = u * u * (3 - 2 * u); this.laneMat.uniforms.uAlpha.value = Math.min(1, W.t / 0.08); this.laneMat.uniforms.uFlash.value = 0;
      // light gathering along the raised blade
      two[0].copy(bladeBase); two[1].copy(bladeTip);
      stripW = 0.05 + 0.12 * u;
      this.glow.strip(two, lineGlowW, 0.3 + 0.7 * u, look.glow); this.core.strip(two, lineW, 0.2 + 0.6 * u, look.edge);
      if (r() < dt * 30 * u) {
        const k = r(), a = r() * 6.283;
        three[0].copy(bladeBase).lerp(bladeTip, k);
        const sx = three[0].x + Math.cos(a) * 0.45, sy = three[0].y + (r() - 0.5) * 0.6, sz = three[0].z + Math.sin(a) * 0.45;
        if (this.sparks.length < 200) this.sparks.push({ p: new THREE.Vector3(sx, sy, sz), v: new THREE.Vector3((three[0].x - sx) * 7, (three[0].y - sy) * 7, (three[0].z - sz) * 7), life: 0, max: 0.14, w: 0.02 });
      }
    }
    const S = this.strikeAt;
    if (S) {
      S.t += dt;
      const k = S.t / (WAVE_T + FADE);
      if (k >= 1) { this.strikeAt = null; if (!this.wind) this.lane.visible = false; }
      else {
        this.laneMat.uniforms.uFill.value = 1; this.laneMat.uniforms.uFlash.value = Math.max(0, 1 - S.t / 0.2);
        this.laneMat.uniforms.uAlpha.value = 1 - THREE.MathUtils.smoothstep(S.t, WAVE_T, WAVE_T + FADE);
        this.dir.set(Math.sin(S.angle), 0, Math.cos(S.angle)); this.side.set(this.dir.z, 0, -this.dir.x);
        const front = Math.min(1, S.t / WAVE_T), d = 0.5 + (S.range - 0.5) * front;
        // the cut line opening in the ground behind the wave
        two[0].set(S.x + this.dir.x * 0.5, 0.04, S.z + this.dir.z * 0.5); two[1].set(S.x + this.dir.x * d, 0.04, S.z + this.dir.z * d);
        const fade = 1 - THREE.MathUtils.smoothstep(S.t, WAVE_T, WAVE_T + FADE);
        stripW = 0.12 * (0.4 + 0.6 * fade);
        this.glow.strip(two, lineGlowW, fade, look.glow); this.core.strip(two, lineW, fade, look.edge);
        // a standing crescent of light racing down the lane while the wave runs
        if (S.t < WAVE_T + 0.08) {
          const a = S.t < WAVE_T ? 1 : 1 - (S.t - WAVE_T) / 0.08, sub = this.sub; sub.length = 0;
          for (let i = 0; i < WAVE_PTS; i++) {
            const x = i / (WAVE_PTS - 1), lat = (x - 0.5) * S.width * 1.25, h = 0.1 + 2.1 * Math.sin(Math.PI * x);
            this.pts[i].set(S.x + this.dir.x * (d - 0.25 * Math.sin(Math.PI * x)) + this.side.x * lat, h, S.z + this.dir.z * (d - 0.25 * Math.sin(Math.PI * x)) + this.side.z * lat);
            sub.push(this.pts[i]);
          }
          stripW = 0.3;
          this.glow.strip(sub, taperGlowW, a, look.glow); this.core.strip(sub, taperW, a, look.edge);
        }
      }
    }
    // cut marks: a thin diagonal streak drawn across the target, then thinning away
    for (const c of this.cuts) {
      c.t += dt;
      const u = c.t / 0.32, grow = Math.min(1, c.t / 0.05);
      three[0].set(c.c.x - 0.6 * grow, c.c.y + (0.7 + c.tilt * 0.3) * grow, c.c.z + 0.05);
      three[2].set(c.c.x + 0.6 * grow, c.c.y - (0.7 - c.tilt * 0.3) * grow, c.c.z - 0.05);
      three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = 0.14 * (1 - u * 0.7);
      this.glow.strip(three, taperGlowW, 0.9 * (1 - u), look.glow); this.core.strip(three, taperW, 1 - u * u, look.edge);
    }
    compact(this.cuts, this.cutAlive);
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life < 0) continue;
      s.v.y -= 10 * dt; s.p.addScaledVector(s.v, dt);
      const u = s.life / s.max;
      if (u >= 1) continue;
      three[0].copy(s.p).addScaledVector(s.v, -0.03); three[1].copy(s.p).lerp(three[0], 0.5); three[2].copy(s.p);
      stripW = s.w; stripU = u;
      this.glow.strip(three, sparkGlowW, 0.6 * (1 - u), look.glow); this.core.strip(three, sparkCoreW, 1 - u * u, look.spark);
    }
    compact(this.sparks, this.sparkAlive);
    this.core.end(); this.glow.end();
  }
  clear() { this.wind = null; this.strikeAt = null; this.lane.visible = false; this.cuts.length = 0; this.sparks.length = 0; }
  get busy() { return !!this.wind || !!this.strikeAt || this.cuts.length > 0 || this.sparks.length > 0; }
}
