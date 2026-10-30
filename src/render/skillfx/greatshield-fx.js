// The guardian's greatshield skills, round 2, held to the owner's bar (.claude/skills/skill-vfx): built
// with Firebolt's techniques, not thin lines. Owner on round 1 (ribbons and sprites): "ไม่มีเอฟเฟคอะไรเลย".
// The force is light made like Firebolt's fire: nested see-through shells whose light is cut out of
// domain-warped noise (V5_FIELD) carried along the flow, a smooth hot-to-cool ramp (each skill's own
// colours, LOOK) with narrow transitions, glowing above the tone mapping, moving smoothly every
// frame, see-through where a shell faces the camera (Blizzard's wall). Contacts are Firebolt's: a ragged
// flash, sparks that bounce, embers that flutter up, a point light, a short shake; big hits touch the
// ground (dust). Cosmetic only: they read the rules' events and the hero's state.
//  - Line Breaker (shield_rush): through the wind-up wisps of light spiral in to the shield and a small
//    knot of force swells there; on the charge it bursts into a bow wave (a comet shell wrapping the
//    shield's front, its light streaming back along the dash) with dust kicked up behind; each monster
//    reached gets a flash and sparks thrown to the side it is knocked; a boss or big monster that stops
//    the charge sets off a clash (a big flash, sparks and embers, a ring of dust, a hard shake; owner:
//    no pit in the ground); on arrival the wave collapses forward and dust skids out.
//  - Shield Fortress (shield_fort): the shield is planted (a flash, dust at its foot) and a curved
//    curtain of gold light rises over the guard's arc, its light flowing up and torn into short tongues
//    at the top; a blocked blow flashes where it struck, a ripple runs through the curtain and sparks fly
//    back at the attacker; when the shield drops the curtain burns away from the top.
//  - Wall of Faith (faith_wall): a seam of light opens along the ground and a pool of light spreads round
//    it, then the wall rises from it with an overshoot (dust and embers bursting up, a shake): a row of
//    overlapping columns of holy light, so it has height from every side under the high camera, its
//    light rising and tearing into tongues; embers drift up off it; a stopped shot flashes, ripples and
//    throws sparks back; at its end the tongues burn away and the seam closes.
// Pools only: no allocation per frame. Numbers that tune a shader are uniforms (one shell program).
import * as THREE from 'three';
import { Ribbon, mulberry32, place, placeV, flashMaterial, BILLBOARD_VS, NOISE, addLight, conformPlane } from './fx-common.js';
import { V5_FIELD } from '../fireball-v5.js';
import { cometShell } from './meteor-flame.js';
import { DUST_FS, DECAL_VS } from './ground-kit.js';

// One look per skill (owner, 2026-10-30: colour by what the skill does, with the guardian's gold shared
// by all three): Line Breaker is a physical blow, steel white edged in gold; Shield Fortress is the
// guard, full gold; Wall of Faith is holy, pale white-gold like Blessing of Light. Linear colours: the
// shells' ramp (edge, body, hot, core), the strips' edge and glow, the flash (in, mid, out), the embers
// (hot, mid, cool).
const WHITE = [1, 1, 0.97];
const look = (o) => ({ ...o, flashC: o.flash.map((c) => new THREE.Color(c)) });
const LOOK = {
  rush: look({ ramp: { rim: [0.9, 0.58, 0.14], body: [0.78, 0.82, 0.9], hot: [0.94, 0.96, 1.0], core: [1, 1, 1] },
    edge: [0.9, 0.94, 1.0], glow: [0.85, 0.6, 0.22], flash: ['#ffffff', '#e6edf8', '#dcb04c'], ember: [[1, 1, 1], [0.86, 0.9, 0.98], [0.9, 0.6, 0.2]] }),
  fort: look({ ramp: { rim: [0.86, 0.46, 0.06], body: [1.0, 0.7, 0.2], hot: [1.0, 0.9, 0.56], core: [1.0, 0.99, 0.92] },
    edge: [1.0, 0.84, 0.42], glow: [1.0, 0.55, 0.1], flash: ['#ffffff', '#fff0b0', '#f4bf3c'], ember: [[1.0, 0.97, 0.75], [1.0, 0.76, 0.28], [0.92, 0.46, 0.1]] }),
  wall: look({ ramp: { rim: [0.95, 0.62, 0.16], body: [1.0, 0.86, 0.5], hot: [1.0, 0.95, 0.78], core: [1, 1, 0.97] },
    edge: [1.0, 0.95, 0.74], glow: [1.0, 0.72, 0.25], flash: ['#ffffff', '#fffbe6', '#f2cc66'], ember: [[1, 1, 0.92], [1.0, 0.92, 0.62], [1.0, 0.74, 0.3]] }),
};
const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,1.0,0.96), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.6; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

const SHELL_VS = `varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;
  void main(){ vObject = position; vec4 mv = modelViewMatrix*vec4(position, 1.0);
    vNormal = normalize(normalMatrix*normal); vEye = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
// uMode 0: the rush's bow wave, a comet (object +x forward) whose light is carried back along -x.
// uMode 1: a curtain (object y up, 0..uH metres), its light carried up and torn into tongues at the top.
// uCut raises the cut-off (burning away); uFlash and a ripple from uRip (object space, uRipT seconds
// old) push light through it.
const SHELL_FS = `uniform float uTime, uLayer, uAlpha, uMode, uFlow, uLen, uFront, uH, uCut, uSeed, uFace, uFlash, uRipT, uFill;
  uniform vec3 uRip;
  varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;` + V5_FIELD + `
  vec3 ramp(float h){ vec3 c = mix(uRim, uBody, smoothstep(0.43, 0.57, h)); c = mix(c, uHot, smoothstep(0.57, 0.65, h)); return mix(c, uCore, smoothstep(0.65, 0.75, h)); }
  void main(){
    float l = uLayer, t = uTime;
    vec3 a; float thr, heat;
    if (uMode < 0.5) {
      a = rotateField(vObject*vec3(0.75 + 0.2*l, 1.7 - 0.2*l, 1.7 - 0.2*l), 0.6 + 0.7*l + uSeed) + vec3(uFlow*t, 0.7*l, uSeed*3.0);
      float along = clamp((vObject.x + uLen)/(uLen + uFront), 0.0, 1.0);          // 0 tail .. 1 front
      thr = mix(0.8 + 0.01*l, 0.43 + 0.04*l, smoothstep(0.3, 0.92, along)); heat = mix(0.47 + 0.05*l, 0.58 + 0.05*l, along);
    } else {
      float h = clamp(vObject.y/uH, 0.0, 1.0);
      a = rotateField(vObject*vec3(1.45 - 0.2*l, 0.62 + 0.1*l, 1.45 - 0.2*l), 0.9*l + uSeed) - vec3(0.0, uFlow*t, 0.0);
      thr = mix(0.42 + 0.02*l - uFill, 0.64 + 0.02*l, h*h); heat = mix(0.6 + 0.04*l, 0.48 + 0.04*l, h);
    }
    float w = 6.73*l + 0.34*t;
    vec3 warp = vec3(fbm(a*0.95, w, 1.5), fbm(a*0.95 + vec3(19,7,31), w, 1.5), fbm(a*0.95 + vec3(47,23,11), w, 1.5));
    float n = fbm(a + 0.75*(warp - 0.5), 3.37*l + 0.46*t, 0.65);
    float rip = 0.0;
    if (uRipT < 0.45) { float d = length(vObject - uRip); rip = smoothstep(0.22, 0.0, abs(d - uRipT*4.0))*(1.0 - uRipT/0.45); }
    float push = uFlash + rip;
    thr += uCut - 0.2*push;
    float coverage = clamp((n - thr + 0.012)/0.034, 0.0, 1.0);
    heat += 0.4*(n - thr) + 0.3*push;                                           // hot inside each tongue
    float face = abs(dot(normalize(vNormal), normalize(vEye)));
    float alpha = coverage*uAlpha*mix(1.0, uFace, smoothstep(0.35, 0.9, face));
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(ramp(heat)*mix(1.12, 1.35, l), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// the wall's footprint: a pool of light on the ground round a bright seam, opening from the middle (uRun)
const POOL_FS = `varying vec2 vP; uniform float uA; uniform float uT; uniform float uRun; uniform float uEnd;` + NOISE + `
  void main(){
    float x = abs(vP.x), y = abs(vP.y);
    if (x > uRun) discard;
    float d = length(vec2(max(x - uEnd, 0.0)/(1.0 - uEnd), y));
    float n = fbm(vP*vec2(7.0, 2.2) + vec2(uT*0.35, 0.0));
    float pool = (1.0 - smoothstep(0.15, 1.0, d))*(0.5 + 0.5*n);
    float seam = smoothstep(0.1, 0.0, y - 0.04*n)*(1.0 - smoothstep(uEnd, 1.0, x));
    if (pool*0.5 + seam < 0.02) discard;
    vec3 c = mix(vec3(1.0, 0.8, 0.42), vec3(1.0, 0.99, 0.93), clamp(seam + pool*0.3, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(pool*0.5 + seam, 0.0, 1.0)*uA); }`;

const FLASHES = 6, DUST = 18, SPARKS = 64, EMBERS = 36, WISPS = 9, TRAIL = 8, HIST = 6, ARC_PTS = 21;
const FORT_R = 1.2, FORT_H = 2.0, WALL_H = 2.4, WALL_R = 0.45, WALL_STEP = 0.75;
const BOW_HEAD = 0.95, BOW_LEN = 2.2;
const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };
let stripW = 0, stripU = 0;
const lineW = () => stripW, lineGlowW = () => stripW * 2.4;
const arcW = (x) => stripW * Math.min(1, Math.sin(Math.PI * x) * 4), arcGlowW = (x) => arcW(x) * 2.4;
const tailW = (x) => stripW * x;
const prof = (x) => Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * x)), 0.8) * (1 - 0.35 * x); // a wisp: pointed head
const wispCoreW = (x) => stripW * prof(x), wispGlowW = (x) => stripW * 2.6 * prof(x);
const emberGlowW = (x) => stripW * 2.6 * (1 - x * 0.7), emberCoreW = (x) => stripW * (1 - x) * (1 - stripU * 0.4);
const mixc = (a, b, k, out) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };
const out2 = (k) => 1 - (1 - k) * (1 - k);

function shellMaterial(mode, layer, L) {
  const c = (v) => ({ value: new THREE.Color().setRGB(...v) });
  return new THREE.ShaderMaterial({
    uniforms: { uRim: c(L.ramp.rim), uBody: c(L.ramp.body), uHot: c(L.ramp.hot), uCore: c(L.ramp.core), uTime: { value: 0 }, uLayer: { value: layer }, uAlpha: { value: 0 }, uMode: { value: mode }, uFlow: { value: mode ? 0.8 : 3.4 },
      uLen: { value: BOW_LEN }, uFront: { value: BOW_HEAD * 0.9 }, uH: { value: 2 }, uCut: { value: 0 }, uSeed: { value: layer * 2.7 }, uFace: { value: 0.45 },
      uFlash: { value: 0 }, uRipT: { value: 9 }, uRip: { value: new THREE.Vector3() }, uFill: { value: 0 } },
    vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, forceSinglePass: true,
  });
}
// the wall: overlapping open columns along local x (its axis), y up from 0 to WALL_H; one noise field over
// all of them, so they read as one mass from the side and as a row of pillars edge on
const wallCache = new Map();
function wallGeometry(half) {
  const key = half.toFixed(2); if (wallCache.has(key)) return wallCache.get(key);
  const n = Math.max(2, Math.round((half * 2 - WALL_R * 1.2) / WALL_STEP) + 1), step = (half * 2 - WALL_R * 1.2) / (n - 1), pos = [], nor = [], idx = [];
  let base = 0;
  for (let i = 0; i < n; i++) {
    const c = new THREE.CylinderGeometry(WALL_R, WALL_R * 1.1, WALL_H, 16, 5, true); c.translate(-half + WALL_R * 0.6 + i * step, WALL_H / 2, 0);
    pos.push(...c.attributes.position.array); nor.push(...c.attributes.normal.array);
    for (const k of c.index.array) idx.push(k + base);
    base += c.attributes.position.count; c.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  g.userData.shared = true; wallCache.set(key, g); return g;
}

export class GreatshieldFx {
  constructor(scene, camera) {
    this.camera = camera;
    this.core = new Ribbon(scene, camera, 5000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 5000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 8; this.glow.mesh.renderOrder = 7;
    const shell = (geo, mode, layer, order, L) => { const m = new THREE.Mesh(geo, shellMaterial(mode, layer, L)); m.visible = false; m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m; };
    // Line Breaker: the bow wave, two nested comet shells
    this.bow = [shell(cometShell(0, BOW_HEAD, BOW_LEN), 0, 0, 6, LOOK.rush), shell(cometShell(1, BOW_HEAD, BOW_LEN), 0, 1, 5, LOOK.rush)];
    // Shield Fortress: two nested curtains (rebuilt only when the guard's arc changes)
    this.fort = [shell(new THREE.BufferGeometry(), 1, 0, 6, LOOK.fort), shell(new THREE.BufferGeometry(), 1, 1, 5, LOOK.fort)];
    for (const m of this.fort) { m.material.uniforms.uH.value = FORT_H; m.material.uniforms.uFace.value = 0.4; m.material.uniforms.uFill.value = 0.04; }
    this.fortArc = 0;
    // Wall of Faith: two nested walls of columns and a pool of light on the ground
    this.wallShells = [shell(new THREE.BufferGeometry(), 1, 0, 6, LOOK.wall), shell(new THREE.BufferGeometry(), 1, 1, 5, LOOK.wall)];
    for (const m of this.wallShells) { m.material.uniforms.uH.value = WALL_H; m.material.uniforms.uFlow.value = 1.0; m.material.uniforms.uFace.value = 0.55; }
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 24, 4), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uT: { value: 0 }, uRun: { value: 0 }, uEnd: { value: 0.8 } }, vertexShader: DECAL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false }));
    this.pool.visible = false; this.pool.renderOrder = 2; scene.add(this.pool);
    // contacts: Firebolt's ragged flash in gold, dust puffs, a point light
    const quad = new THREE.PlaneGeometry(1, 1); quad.userData.shared = true;
    this.flashes = Array.from({ length: FLASHES }, (_, k) => {
      const m = new THREE.Mesh(quad, flashMaterial(2 + k * 4.3));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 9; scene.add(m);
      return { m, t: 9, life: 0.13, size: 1, pos: new THREE.Vector3() };
    });
    this.flashI = 0;
    this.dust = Array.from({ length: DUST }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
      return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, size: 1, life: 0.7 };
    });
    this.dustI = 0;
    this.light = addLight(scene, new THREE.PointLight('#ffc45e', 0, 9, 1.6)); this.lightAt = new THREE.Vector3(); this.lightI = 0; this.lightHold = 0;
    this.sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 9, max: 1, w: 0 }));
    this.embers = []; this.emberFree = []; this.emberAlive = (m) => m.age < m.life || (this.emberFree.push(m), false);
    this.wisps = Array.from({ length: WISPS }, () => ({ th: 0, el: 0, rad: 1, spin: 1, delay: 0, dur: 1, w: 0.1, pts: Array.from({ length: TRAIL }, () => new THREE.Vector3()) }));
    this.rush = { wind: 9, windDur: 0.3, on: false, end: 9, x: 0, z: 0, fromX: 0, fromZ: 0, angle: 0, dustAt: 0, stopped: false };
    this.fortT = 9; this.fortUp = false; this.fortDown = 9; this.fortRip = 9; this.fortPlant = false;
    this.wall = { id: null, x: 0, z: 0, axis: 0, facing: 0, half: 3, t: 9, end: 9, emberAt: 0, rose: false };
    this.rnd = mulberry32(53); this.t = 0; this.onShake = null; this.L = LOOK.fort;
    this.pts = Array.from({ length: ARC_PTS }, () => new THREE.Vector3()); this.view = [];
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.tip = new THREE.Vector3(); this.col = [0, 0, 0];
  }

  // ---- shared pieces ----
  flash(x, y, z, size) {
    const f = this.flashes[this.flashI++ % FLASHES];
    const u = f.m.material.uniforms, c = this.L.flashC;
    f.t = 0; f.size = size; f.pos.set(x, y, z); u.uSeed.value = this.rnd() * 40; u.uIn.value.copy(c[0]); u.uMid.value.copy(c[1]); u.uOut.value.copy(c[2]);
  }
  puff(x, y, z, vx, vz, size, life) {
    const q = this.dust[this.dustI++ % DUST], r = this.rnd;
    q.p.set(x, y, z); q.v.set(vx, 0.35 + r() * 0.4, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = r() * 40;
  }
  // sparks from (x, y, z) along (dx, dz), spread over `spread` radians; they bounce on the ground
  sparkBurst(x, y, z, dx, dz, n, spread, speed) {
    const r = this.rnd, base = Math.atan2(dx, dz);
    let made = 0;
    for (const sp of this.sparks) {
      if (made >= n) break;
      if (sp.life < sp.max) continue;
      const a = base + (r() - 0.5) * spread, s = speed * (0.45 + r() * 0.75);
      sp.p.set(x, y, z); sp.v.set(Math.sin(a) * s, 1.5 + r() * 4.5, Math.cos(a) * s); sp.life = 0; sp.max = 0.3 + r() * 0.35; sp.w = 0.03 + r() * 0.035; sp.L = this.L; made++;
    }
  }
  // fluttering embers that drift up as they cool (Firebolt's), in gold
  emberBurst(x, y, z, count, size = 1, spread = 0) {
    const r = this.rnd;
    for (let i = 0; i < count && this.embers.length < EMBERS; i++) {
      const zc = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - zc * zc), sp = (0.5 + Math.pow(r(), 1.6) * 3) * size;
      const m = this.emberFree.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), store: Array.from({ length: HIST }, () => new THREE.Vector3()), hist: [] };
      m.p.set(x + (r() - 0.5) * spread, y, z + (r() - 0.5) * spread); m.v.set(Math.cos(a) * rr * sp, Math.abs(zc) * sp * 0.6 + 0.6, Math.sin(a) * rr * sp); m.hist.length = 0;
      Object.assign(m, { L: this.L, age: 0, life: (0.5 + r() * 0.5) * (0.7 + 0.3 * size), w: (0.025 + r() * 0.015) * Math.sqrt(size), freq: 4 + r() * 5, phase: r() * 6.28, amp: 3 + r() * 4, flick: 8 + r() * 10 });
      this.embers.push(m);
    }
  }
  // the point light goes to the brightest event this frame and decays
  glowAt(x, y, z, intensity) { if (intensity >= this.lightI) { this.lightI = intensity; this.lightAt.set(x, y, z); } }

  // ---- Line Breaker ----
  windup(p, total) {
    this.L = LOOK.rush;
    const R = this.rush, r = this.rnd; R.wind = 0; R.windDur = Math.max(0.08, total); R.on = false; R.end = 9;
    for (const w of this.wisps) { w.th = r() * Math.PI * 2; w.el = (r() - 0.3) * 1.2; w.rad = 1.0 + r() * 0.6; w.spin = (r() < 0.5 ? -1 : 1) * (1 + r() * 0.8); w.delay = r() * R.windDur * 0.25; w.dur = R.windDur * (0.7 + r() * 0.1); w.w = 0.07 + r() * 0.05; }
  }
  rushStart(e) {
    this.L = LOOK.rush;
    const R = this.rush; R.on = true; R.end = 9; R.wind = 9; R.fromX = e.x; R.fromZ = e.z; R.angle = e.angle; R.x = e.x; R.z = e.z; R.dustAt = 0; R.stopped = false;
    const s = Math.sin(e.angle), c = Math.cos(e.angle), r = this.rnd;
    this.flash(e.x + s * 0.9, 0.9, e.z + c * 0.9, 1.2);                       // the push-off
    for (let i = 0; i < 4; i++) { const a = e.angle + Math.PI + (r() - 0.5) * 1.6; this.puff(e.x - s * 0.3, 0.2, e.z - c * 0.3, Math.sin(a) * 2, Math.cos(a) * 2, 0.9 + r() * 0.4, 0.6); }
    this.glowAt(e.x, 1, e.z, 4);
    this.onShake?.(0.05, 0.08);
  }
  rushHit(c) {
    this.L = LOOK.rush;
    const R = this.rush, a = R.angle, sx = Math.cos(a), sz = -Math.sin(a);
    const k = (c.x - R.fromX) * sx + (c.z - R.fromZ) * sz >= 0 ? 1 : -1;     // knocked to this side
    this.flash(c.x, c.y, c.z, 1.25);
    this.sparkBurst(c.x, c.y, c.z, sx * k + Math.sin(a) * 0.5, sz * k + Math.cos(a) * 0.5, 12, 1.1, 7);
    this.emberBurst(c.x, c.y, c.z, 4, 0.8);
    this.puff(c.x, 0.2, c.z, sx * k * 1.6, sz * k * 1.6, 1.0, 0.55);
    this.glowAt(c.x, c.y, c.z, 6);
    this.onShake?.(0.07, 0.1);
  }
  rushStop(x, z, angle) {
    this.L = LOOK.rush;
    const s = Math.sin(angle), c = Math.cos(angle), r = this.rnd, ax = x + s * 1.0, az = z + c * 1.0;
    this.rush.stopped = true;
    this.flash(ax, 1.05, az, 2.3); this.flash(ax, 0.6, az, 1.4);
    this.sparkBurst(ax, 1.0, az, -s, -c, 26, 3.2, 8.5);
    this.emberBurst(ax, 1.0, az, 14, 1.4, 0.5);
    // a ring of dust round the clash
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r() * 0.4; this.puff(ax + Math.sin(a) * 0.6, 0.25, az + Math.cos(a) * 0.6, Math.sin(a) * 2.6, Math.cos(a) * 2.6, 1.1 + r() * 0.5, 0.8); }
    this.glowAt(ax, 1.1, az, 12);
    this.onShake?.(0.28, 0.32);
  }
  rushArrive(x, z) {
    this.L = LOOK.rush;
    const R = this.rush; if (!R.on) return;
    R.on = false; R.end = 0; R.x = x; R.z = z;
    if (R.stopped) return;
    const s = Math.sin(R.angle), c = Math.cos(R.angle), r = this.rnd;
    for (let i = 0; i < 4; i++) { const k = i < 2 ? 1 : -1; this.puff(x + c * 0.35 * k + s * 0.3, 0.2, z - s * 0.35 * k + c * 0.3, (s * 1.6 + c * k * 1.2) * (0.7 + r() * 0.5), (c * 1.6 - s * k * 1.2) * (0.7 + r() * 0.5), 0.9 + r() * 0.3, 0.6); }
  }

  // ---- Shield Fortress ----
  raise(arcDeg) {
    const arc = (arcDeg * Math.PI) / 180;
    if (this.fortArc !== arc) { // theta 0 points along local +z (the hero's facing at rotation.y)
      const g = new THREE.CylinderGeometry(FORT_R, FORT_R * 1.04, FORT_H, 40, 6, true, -arc / 2, arc); g.translate(0, FORT_H / 2, 0);
      this.fort[0].geometry.dispose(); for (const m of this.fort) m.geometry = g;
      this.fortArc = arc;
    }
    this.fortT = 0; this.fortUp = true; this.fortDown = 9; this.fortRip = 9; this.fortPlant = true;
  }
  lower() { if (this.fortUp) { this.fortUp = false; this.fortDown = 0; } }
  block(p, fromX, fromZ) {
    this.L = LOOK.fort;
    const a = Math.atan2(fromX - p.x, fromZ - p.z), off = Math.atan2(Math.sin(a - p.facing), Math.cos(a - p.facing));
    const hx = p.x + Math.sin(a) * FORT_R, hz = p.z + Math.cos(a) * FORT_R;
    this.flash(hx, 1.15, hz, 1.5);
    this.sparkBurst(hx, 1.15, hz, Math.sin(a), Math.cos(a), 14, 1.6, 7);
    this.emberBurst(hx, 1.15, hz, 5, 0.9);
    this.fortRip = 0; for (const m of this.fort) { m.material.uniforms.uRip.value.set(Math.sin(off) * FORT_R, 1.15, Math.cos(off) * FORT_R); m.material.uniforms.uFlash.value = 0.35; }
    this.glowAt(hx, 1.2, hz, 7);
    this.onShake?.(0.08, 0.14);
  }

  // ---- Wall of Faith ----
  // area: the rules' light wall (x, z, angle = its axis, facing = the caster's aim, radius = half its length)
  wallBegin(area) {
    this.L = LOOK.wall;
    const W = this.wall; W.id = area.id; W.x = area.x; W.z = area.z; W.axis = area.angle; W.facing = area.facing; W.half = area.radius; W.t = 0; W.end = 9; W.emberAt = 0; W.rose = false;
    const geo = wallGeometry(W.half);
    for (const m of this.wallShells) { m.geometry = geo; m.material.uniforms.uRipT.value = 9; m.material.uniforms.uCut.value = 0; }
    this.pool.scale.set(W.half * 2 + 1.2, 2.4, 1); this.pool.material.uniforms.uEnd.value = W.half / (W.half + 0.6);
    this.pool.rotation.set(-Math.PI / 2, W.facing, 0, 'YXZ'); place(this.pool, W.x, 0.04, W.z); conformPlane(this.pool); this.pool.visible = true;
    this.flash(W.x, 0.3, W.z, 1.4);
    this.glowAt(W.x, 0.8, W.z, 5);
  }
  wallBlock(id, x, z, y = 1.1) {
    this.L = LOOK.wall;
    const W = this.wall; if (W.id !== id && id !== undefined) return;
    const along = (x - W.x) * Math.sin(W.axis) + (z - W.z) * Math.cos(W.axis);
    for (const m of this.wallShells) { m.material.uniforms.uRip.value.set(along, y, 0); m.material.uniforms.uRipT.value = 0; }
    this.flash(x, y, z, 1.2);
    this.sparkBurst(x, y, z, Math.sin(W.facing), Math.cos(W.facing), 9, 1.8, 6);
    this.glowAt(x, y, z, 6);
  }
  wallEnd(id) { const W = this.wall; if (W.id === id && W.end > 1) W.end = 0; }

  get fortBusy() { return this.fortUp || this.fortDown < 0.25; }

  update(dt, p) {
    this.t += dt;
    this.core.begin(); this.glow.begin();
    this.lightI = Math.max(0, this.lightI - dt * 30);
    const three = this.three, r = this.rnd, time = this.t;
    // ---- Line Breaker ----
    const R = this.rush, dashing = p.dash?.kind === 'shield_rush';
    const fs = Math.sin(p.facing), fc = Math.cos(p.facing);
    if (R.wind < R.windDur) {
      // the wind-up: wisps spiral in to the shield's front, a knot of force swells there
      R.wind += dt;
      const k = Math.min(1, R.wind / R.windDur);
      this.tip.set(p.x + fs * 0.85, 0.9, p.z + fc * 0.85);
      for (const w of this.wisps) {
        const e = Math.min(1, Math.max(0, (R.wind - w.delay) / w.dur)); if (e <= 0 || e >= 1) continue;
        for (let j = 0; j < TRAIL; j++) {
          const q = Math.max(0, e - (j / (TRAIL - 1)) * 0.35), ease = q * q * (3 - 2 * q), rad = w.rad * (1 - ease), th = w.th + w.spin * ease, el = w.el * (1 - ease * 0.6);
          w.pts[j].set(this.tip.x + Math.cos(th) * Math.cos(el) * rad, this.tip.y + Math.sin(el) * rad * 0.8, this.tip.z + Math.sin(th) * Math.cos(el) * rad);
        }
        const fade = Math.min(1, (e - 0.05) / 0.25);
        stripW = w.w; this.glow.strip(w.pts, wispGlowW, 0.8 * fade, LOOK.rush.glow); this.core.strip(w.pts, wispCoreW, fade, LOOK.rush.edge);
      }
      this.bowPose(this.tip.x - fs * 0.5, this.tip.z - fc * 0.5, p.facing, 0.3 + 0.25 * k * k, 0.65 * k, 0.12 * (1 - k), 0.6);
      this.glowAt(this.tip.x, 0.9, this.tip.z, 3 * k);
    } else if (dashing || R.end < 0.2) {
      // the bow wave round the shield's front, dust kicked up behind; it collapses forward on arrival
      if (dashing) { R.x = p.x; R.z = p.z; R.on = true; } else R.end += dt;
      const s = Math.sin(R.angle), c = Math.cos(R.angle), e = dashing ? 0 : R.end / 0.2;
      this.bowPose(R.x + s * (0.45 + 0.5 * e), R.z + c * (0.45 + 0.5 * e), R.angle, 1 - 0.25 * e, 1 - e * e, 0.45 * e, 3.4);
      if (dashing && time >= R.dustAt) {
        R.dustAt = time + 0.06;
        for (const k of [-1, 1]) this.puff(R.x - s * 0.4 + c * 0.4 * k, 0.15, R.z - c * 0.4 - s * 0.4 * k, (c * k - s * 0.6) * 1.5, (-s * k - c * 0.6) * 1.5, 0.8 + r() * 0.3, 0.55);
      }
      this.glowAt(R.x + s, 0.9, R.z + c, 5 * (1 - e));
    } else for (const m of this.bow) m.visible = false;
    // ---- Shield Fortress ----
    if (this.fortUp || this.fortDown < 0.25) {
      if (this.fortUp) this.fortT += dt; else this.fortDown += dt;
      const t = this.fortT, rise = Math.min(1, t / 0.14), k = rise < 1 ? out2(rise) * 1.08 : 1 + 0.06 * Math.exp(-(t - 0.14) * 14) * Math.cos((t - 0.14) * 30);
      const burn = this.fortUp ? 0 : this.fortDown / 0.25;
      if (this.fortPlant) {
        this.L = LOOK.fort;
        // planted: a flash low at the shield, dust at the curtain's foot
        this.fortPlant = false;
        this.flash(p.x + fs * FORT_R, 0.45, p.z + fc * FORT_R, 1.2);
        for (let i = 0; i < 5; i++) { const a = p.facing + (i / 4 - 0.5) * this.fortArc * 0.9; this.puff(p.x + Math.sin(a) * FORT_R, 0.15, p.z + Math.cos(a) * FORT_R, Math.sin(a) * 1.4, Math.cos(a) * 1.4, 0.8, 0.5); }
        this.onShake?.(0.06, 0.1);
      }
      this.fortRip += dt;
      this.fort.forEach((m, l) => {
        m.visible = true; place(m, p.x, 0.02, p.z); m.rotation.y = p.facing;
        const sc = l ? 0.93 : 1; m.scale.set(sc, Math.max(0.02, k) * (l ? 0.9 : 1), sc);
        const U = m.material.uniforms; U.uTime.value = time; U.uAlpha.value = Math.min(1, t / 0.05) * (1 - burn * burn); U.uCut.value = 0.35 * burn + 0.08 * Math.max(0, 1 - t / 0.2);
        U.uRipT.value = this.fortRip; U.uFlash.value = Math.max(0, U.uFlash.value - dt * 2.5);
      });
      // the curtain's foot on the ground
      const view = this.view; view.length = 0;
      for (let i = 0; i < ARC_PTS; i++) { const a = p.facing - this.fortArc / 2 + (i / (ARC_PTS - 1)) * this.fortArc; this.pts[i].set(p.x + Math.sin(a) * FORT_R, 0.05, p.z + Math.cos(a) * FORT_R); view.push(this.pts[i]); }
      stripW = 0.12 * (1 - burn); this.glow.strip(view, arcGlowW, 0.8 * (1 - burn), LOOK.fort.glow); this.core.strip(view, arcW, 0.9 * (1 - burn), LOOK.fort.edge);
      this.glowAt(p.x + fs * 1.4, 1.0, p.z + fc * 1.4, 2.5 * (1 - burn));
    } else for (const m of this.fort) m.visible = false;
    // ---- Wall of Faith ----
    const W = this.wall;
    if (W.id !== null) {
      W.t += dt; if (W.end < 9) W.end += dt;
      const run = out2(Math.min(1, W.t / 0.22)), rt = W.t - 0.18, rise = Math.max(0, Math.min(1, rt / 0.28));
      const gone = W.end < 9 ? Math.min(1, W.end / 0.55) : 0;
      if (gone >= 1) { W.id = null; for (const m of this.wallShells) m.visible = false; this.pool.visible = false; }
      else {
        const sa = Math.sin(W.axis), ca = Math.cos(W.axis);
        const P = this.pool.material.uniforms; P.uRun.value = run; P.uT.value = time; P.uA.value = (1 - gone) * (0.85 + 0.15 * Math.sin(time * 4));
        this.L = LOOK.wall;
        if (rise > 0 && !W.rose) {
          // the wall bursts up: dust and embers all along it, a shake
          W.rose = true;
          for (let i = 0; i < 8; i++) { const u = (i / 7) * 2 - 1, k = i % 2 ? 1 : -1; this.puff(W.x + sa * W.half * u, 0.2, W.z + ca * W.half * u, Math.sin(W.facing) * 1.8 * k, Math.cos(W.facing) * 1.8 * k, 1.0 + r() * 0.4, 0.7); }
          for (let i = 0; i < 3; i++) { const u = (i - 1) * 0.65; this.emberBurst(W.x + sa * W.half * u, 0.6, W.z + ca * W.half * u, 5, 1.1, 0.6); }
          this.onShake?.(0.12, 0.18);
          this.glowAt(W.x, 1.2, W.z, 9);
        }
        const k = rise < 1 ? out2(rise) * 1.1 : 1 + 0.05 * Math.exp(-(rt - 0.28) * 12) * Math.cos((rt - 0.28) * 26);
        this.wallShells.forEach((m, l) => {
          m.visible = rise > 0; if (!m.visible) return;
          place(m, W.x, 0.02, W.z); m.rotation.y = W.facing; m.scale.set(1, Math.max(0.02, k) * (l ? 0.88 : 1), l ? 0.7 : 1);
          const U = m.material.uniforms; U.uTime.value = time; U.uAlpha.value = Math.min(1, rise * 2.5) * (1 - gone * gone); U.uCut.value = 0.4 * gone; U.uRipT.value += dt;
          U.uFlash.value = Math.max(0, 0.3 * (1 - rise * 1.5));
        });
        // embers drift up off it now and then
        if (rise >= 1 && gone === 0 && time >= W.emberAt) { W.emberAt = time + 0.22; const u = r() * 2 - 1; this.emberBurst(W.x + sa * W.half * u, 0.4 + r() * 1.4, W.z + ca * W.half * u, 1, 0.7, 0.4); }
        // the seam's bright line, running out both ways from the middle
        for (const s of [-1, 1]) {
          three[0].set(W.x, 0.05, W.z); three[2].set(W.x + sa * W.half * run * s, 0.05, W.z + ca * W.half * run * s); three[1].copy(three[0]).lerp(three[2], 0.5);
          stripW = 0.09 * (1 - gone); this.glow.strip(three, lineGlowW, 0.8 * (1 - gone), LOOK.wall.glow); this.core.strip(three, lineW, 1 - gone, WHITE);
        }
        this.glowAt(W.x, 1.0, W.z, 3 * (1 - gone));
      }
    }
    // ---- contacts ----
    for (const f of this.flashes) {
      if (f.t >= f.life) { f.m.visible = false; continue; }
      f.t += dt;
      f.m.visible = f.t < f.life; placeV(f.m, f.pos); f.m.quaternion.copy(this.camera.quaternion);
      f.m.scale.setScalar(1.35 * f.size * (f.t < 0.03 ? 0.5 + f.t / 0.06 : 1)); f.m.material.uniforms.uT.value = f.t / f.life;
    }
    for (const q of this.dust) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; q.v.multiplyScalar(1 - 2.8 * dt); q.p.addScaledVector(q.v, dt);
      const u = Math.min(1, q.t / q.life);
      q.m.visible = true; placeV(q.m, q.p); q.m.quaternion.copy(this.camera.quaternion); q.m.scale.setScalar(q.size * (0.55 + 0.8 * out2(u))); q.m.material.uniforms.uT.value = u;
    }
    for (const sp of this.sparks) {
      if (sp.life >= sp.max) continue;
      sp.life += dt; sp.v.y -= 16 * dt; sp.v.multiplyScalar(1 - 1.8 * dt); sp.p.addScaledVector(sp.v, dt);
      if (sp.p.y < 0.03 && sp.v.y < 0) { sp.p.y = 0.03; sp.v.y *= -0.38; sp.v.x *= 0.6; sp.v.z *= 0.6; }   // a bounce
      const u = sp.life / sp.max;
      three[2].copy(sp.p); three[0].copy(sp.p).addScaledVector(sp.v, -0.04); three[1].copy(three[0]).lerp(three[2], 0.5);
      stripW = sp.w * (1 - u * 0.5); this.glow.strip(three, lineGlowW, 0.8 * (1 - u), sp.L.glow); this.core.strip(three, tailW, 1 - u * u, u < 0.35 ? WHITE : sp.L.edge);
    }
    for (const m of this.embers) {
      m.age += dt;
      const u = m.age / m.life;
      m.v.multiplyScalar(1 - 4 * dt); m.v.y += (2.2 * u - 0.6) * dt * 3;   // dips, then rises as it cools
      const sway = Math.sin(m.age * m.freq + m.phase) * m.amp * dt;
      m.v.x += sway * Math.cos(m.phase); m.v.z += sway * Math.sin(m.phase);
      m.p.addScaledVector(m.v, dt);
      const head = m.hist.length < HIST ? m.store[m.hist.length] : m.hist.pop();
      m.hist.unshift(head.copy(m.p));
    }
    compact(this.embers, this.emberAlive);
    for (const m of this.embers) {
      if (m.hist.length < 2) continue;
      const u = m.age / m.life, flick = 0.75 + 0.25 * Math.sin(m.age * m.flick + m.phase);
      const E = m.L.ember; if (u < 0.4) mixc(E[0], E[1], u / 0.4, this.col); else mixc(E[1], E[2], (u - 0.4) / 0.6, this.col);
      stripW = m.w; stripU = u;
      this.glow.strip(m.hist, emberGlowW, (1 - u * u) * flick * 0.6, this.col); this.core.strip(m.hist, emberCoreW, (1 - u * u) * flick, this.col);
    }
    placeV(this.light, this.lightAt); this.light.intensity = this.lightI;
    this.core.end(); this.glow.end();
  }
  // the bow wave at (x, z) facing `angle`: scale, alpha, extra cut-off and flow speed
  bowPose(x, z, angle, scale, alpha, cut, flow) {
    this.bow.forEach((m, l) => {
      m.visible = alpha > 0.01; if (!m.visible) return;
      place(m, x, 0.9, z); m.rotation.set(0, angle - Math.PI / 2, 0); m.scale.set(scale * (l ? 0.95 : 1), scale * 1.05, scale * 1.15);
      const U = m.material.uniforms; U.uTime.value = this.t; U.uAlpha.value = alpha; U.uCut.value = cut; U.uFlow.value = flow;
    });
  }
  clear() {
    const R = this.rush; R.on = false; R.wind = 9; R.end = 9;
    this.fortUp = false; this.fortDown = 9; this.wall.id = null;
    for (const m of [...this.bow, ...this.fort, ...this.wallShells, this.pool]) m.visible = false;
    this.lightI = 0; this.light.intensity = 0;
    for (const f of this.flashes) { f.t = 9; f.m.visible = false; }
    for (const q of this.dust) { q.t = q.life = 9; q.m.visible = false; }
    for (const sp of this.sparks) sp.life = sp.max;
    for (const m of this.embers) this.emberFree.push(m); this.embers.length = 0;
  }
}
