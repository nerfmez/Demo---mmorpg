// The trapper's traps (core: frontier-content.js placeTraps, game-simulation.js updateAreas; events trapSet,
// trapSprung, areaEnd). Made objects, not spells: a round iron trap plate tossed from the hand, set on the
// ground, and what it does when a monster steps in. Cel-shaded like the world (the toon ramp and same-hue
// outlines), with light only where it helps reading: an amber ring at the trigger range while it waits,
// speed lines and white-hot points on the spikes as they punch, and blood drops off what they strike.
//   toss (trapSet): the plate arcs from the hand to the aim point, spinning, and lands with a puff of dust;
//   armed (arm s): its teeth click up with a glint; a thin amber ring pulses at the trigger range;
//   Spike Trap springs (trapSprung): steel spikes punch up in two rings over the trap's radius with a
//     glint and dust, hold, then sink back and the plate is gone;
//   Blast Trap springs: its bomb (its fuse sparking since it armed) goes off in Flame Arrow Rain's burst of
//     fire (FlameRainFx.boom, through onBlast) over the trap's radius, with dust thrown out;
//   Net Trap springs: a dome of rope bursts up off the plate and drapes over the whole circle, iron weights
//     on its rim pinning it, held while it roots what is under it, then thinning away;
//   unsprung at the end of its life (areaEnd): the plate sinks away;
//   Lure Dummy (a static summon: summon, allyGone): it thumps in with dust and straw, a ring of amber light
//     runs out to its lure range each time it draws them, an amber tether sways from each monster it drew
//     to its chest, and it falls apart in straw when it is gone.
// Cosmetic only; pooled (8 plates, one instanced spike mesh with its outline), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32, BILLBOARD_VS, addLight, fxGround, place } from './fx-common.js';
import { DUST_FS } from './ground-kit.js';
import { lightSprite, starTexture, CORE_FS, GLOW_FS } from './light-kit.js';
import { toon, outlineMaterial } from '../toon.js';

const PLATES = 8, TEETH = 8, SPIKES_PER = 14, DUSTS = 24;
const TOSS = 0.32, SPRING = 0.07, HOLD = 0.42, SINK = 0.28; // seconds
const STEEL = '#8a95a6', IRON = '#4a4f5a', WOOD = '#7a5434', EDGE = '#262a33', ROPE = '#c8a46a', BOMB = '#2c2a33';
const NETS = 4, WEIGHTS = 8, NET_UP = 0.13, NET_DRAPE = 0.22, NET_FADE = 0.35; // seconds

// the net: a rope grid on a dome (uv.x round it, uv.y from its rim up to its top), lines not a fill: tan rope
// with a dark same-hue edge, lit from above, knots where the ropes cross; uA fades it, uSeed wobbles the cells
const NET_VS = `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const NET_FS = `varying vec2 vUv; varying vec3 vN; uniform float uA, uSeed;
  void main(){
    float el = vUv.y*1.5708;                                     // elevation up the dome
    vec2 g = vec2(vUv.x*18.0, vUv.y*6.5 + 0.12*sin(vUv.x*31.0 + uSeed));
    vec2 f = abs(fract(g) - 0.5);
    // distance to the nearest rope, in a parallel's cell units: a meridian's cells narrow toward the top
    float dm = (0.5 - f.x)*cos(el)*2.9, dp = 0.5 - f.y, d = min(dm, dp);
    float w = 0.085;
    if (d > w + 0.012 || vUv.y > 0.97) discard;                 // the holes between the ropes
    float edge = smoothstep(w*0.45, w, d);                       // a dark same-hue edge round a tan cord
    float knot = (1.0 - smoothstep(0.1, 0.2, max(dm, dp)));      // where two ropes cross
    float l = 0.62 + 0.38*max(0.0, normalize(vN).y);
    vec3 c = mix(vec3(0.82, 0.66, 0.42)*l, vec3(0.36, 0.24, 0.13), edge);
    c = mix(c, vec3(0.96, 0.84, 0.58), knot*0.55*(1.0 - edge));
    gl_FragColor = vec4(c, uA); }`;

// a thin ring of light on the ground (additive), pulsing outward from the trap: where it will spring
const RING_VS = `varying vec2 vUv; void main(){ vUv = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const RING_FS = `varying vec2 vUv; uniform float uA, uPulse;
  void main(){ float r = length(vUv);
    float edge = exp(-pow((r - 0.96)/0.02, 2.0));                       // the trigger range, steady
    float pulse = exp(-pow((r - uPulse)/0.035, 2.0))*(1.0 - uPulse);     // a soft ring running out to it
    float k = (edge*0.55 + pulse*0.5)*uA;
    if (k < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.72, 0.32)*k, 1.0); }`;

// a lure's pulse: one ring of amber light running out to its range (uPulse 0..1 of the plane), thinning
const PULSE_FS = `varying vec2 vUv; uniform float uA, uPulse;
  void main(){ float r = length(vUv);
    float ring = exp(-pow((r - uPulse*0.96)/0.012, 2.0)), inner = exp(-pow((r - uPulse*0.96)/0.08, 2.0))*0.18*step(r, uPulse*0.96);
    float k = (ring*0.6 + inner)*uA; if (k < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.66, 0.28)*k, 1.0); }`;

/** A spike: a four-sided steel blade from 0 (base) to 1 (tip) along +y, steel below and catching the light
 *  white at its point (vertex colours under a white toon material). */
function spikeGeometry() {
  const g = new THREE.ConeGeometry(0.08, 1, 4, 3).translate(0, 0.5, 0), pos = g.attributes.position, col = [];
  const steel = new THREE.Color(STEEL), hot = new THREE.Color('#f4f8ff'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(steel).lerp(hot, Math.max(0, (pos.getY(i) - 0.6) / 0.4)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData.shared = true; return g;
}
let sw = 0;
const lineW = (x) => sw * Math.sin(Math.PI * x), lineGlowW = (x) => sw * 2.6 * Math.sin(Math.PI * x), dropW = (x) => sw * (1 - x * 0.6);
const WHITE = [1, 0.97, 0.9], WARM = [1, 0.75, 0.4], BLOOD = [0.85, 0.08, 0.1], BLOOD_GLOW = [0.5, 0.02, 0.04], STRAW = [0.95, 0.8, 0.42], STRAW_GLOW = [0.3, 0.22, 0.06];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const easeBack = (k) => { const c = 2.4; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };

export class TrapFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(83); this.time = 0;
    // plates: a wooden disc in an iron rim with teeth round it (toon + outline hulls)
    const disc = new THREE.CylinderGeometry(0.4, 0.44, 0.08, 18), rim = new THREE.TorusGeometry(0.42, 0.045, 6, 22).rotateX(Math.PI / 2), tooth = new THREE.ConeGeometry(0.045, 0.14, 4).translate(0, 0.07, 0), hub = new THREE.CylinderGeometry(0.1, 0.12, 0.07, 10);
    const coilGeos = [0.13, 0.2, 0.27].map((r) => new THREE.TorusGeometry(r, 0.035, 5, 18).rotateX(Math.PI / 2));
    const bombGeo = new THREE.SphereGeometry(0.24, 14, 10), fuseGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6);
    for (const g of [disc, rim, tooth, hub, bombGeo, fuseGeo, ...coilGeos]) g.userData.shared = true;
    const edge = outlineMaterial(EDGE, 0.02);
    this.plates = Array.from({ length: PLATES }, () => {
      const g = new THREE.Group(), add = (geo, color, y = 0) => { const m = new THREE.Mesh(geo, toon(color)); m.position.y = y; const o = new THREE.Mesh(geo, edge); m.add(o); g.add(m); return m; };
      add(disc, WOOD, 0.04); add(rim, IRON, 0.07); add(hub, IRON, 0.1);
      const teeth = [];
      for (let i = 0; i < TEETH; i++) { const a = i / TEETH * Math.PI * 2, t = add(tooth, STEEL, 0.06); t.position.x = Math.cos(a) * 0.3; t.position.z = Math.sin(a) * 0.3; teeth.push(t); }
      // a net trap's plate carries its net rolled up in a coil of rope instead of teeth
      const coil = [0.13, 0.2, 0.27].map((r, i) => { const m = add(coilGeos[i], ROPE, 0.1 + (2 - i) * 0.025); m.visible = false; return m; });
      // a blast trap's plate carries a round black bomb with a short fuse that sparks once it is armed
      const bomb = [add(bombGeo, BOMB, 0.3), add(fuseGeo, ROPE, 0.55)]; for (const m of bomb) m.visible = false;
      const spark = lightSprite(scene, starTexture('fire'), true, 10);
      g.visible = false; scene.add(g);
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uPulse: { value: 0 } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false; scene.add(ring);
      return { g, teeth, coil, bomb, spark, ring, id: 0, skill: '', t: 0, state: 'off', from: new THREE.Vector3(), x: 0, z: 0, arm: 0.6, trigger: 1, radius: 1.4, springT: 0, spikes: [], seed: 0, spin: 0 };
    });
    // nets (Net Trap): a dome of rope that bursts up off the plate and drapes over the circle, with iron
    // weights on its rim flung out to pin it
    const dome = new THREE.SphereGeometry(1, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.userData.shared = true;
    this.nets = Array.from({ length: NETS }, () => { const m = new THREE.Mesh(dome, new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 }, uSeed: { value: 0 } }, vertexShader: NET_VS, fragmentShader: NET_FS, transparent: true, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 5; scene.add(m); return { m, t: 9, x: 0, z: 0, R: 2.4, hold: 2.5, seed: 0 }; });
    const ball = new THREE.SphereGeometry(0.11, 10, 8); ball.userData.shared = true;
    this.weights = new THREE.InstancedMesh(ball, toon(IRON), NETS * WEIGHTS); this.weights.frustumCulled = false;
    for (let i = 0; i < this.weights.count; i++) this.weights.setMatrixAt(i, ZERO); scene.add(this.weights);
    // spikes: one instanced draw for all plates, and its outline
    const sg = spikeGeometry();
    this.spikes = new THREE.InstancedMesh(sg, toon('#ffffff', { vertexColors: true }), PLATES * SPIKES_PER);
    this.spikeEdges = new THREE.InstancedMesh(sg, outlineMaterial(EDGE, 0.02), PLATES * SPIKES_PER);
    for (const m of [this.spikes, this.spikeEdges]) { m.frustumCulled = false; for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); scene.add(m); }
    for (const p of this.plates) p.spikes = Array.from({ length: SPIKES_PER }, () => ({ x: 0, z: 0, h: 1, w: 1, lean: 0, yaw: 0, delay: 0 }));
    const quad = new THREE.PlaneGeometry(1, 1);
    this.dusts = Array.from({ length: DUSTS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 0.6, size: 0.6 }; });
    this.dustI = 0;
    this.glints = Array.from({ length: 6 }, () => ({ s: lightSprite(scene, starTexture('holy'), false, 10), p: new THREE.Vector3(), t: 9, size: 0.6, life: 0.3 })); this.glintI = 0;
    this.light = addLight(scene, new THREE.PointLight('#ffd8a0', 0, 6, 1.6)); this.lightT = 9;
    // speed lines up the spikes as they punch, and blood drops off what they strike (light strips)
    this.core = new Ribbon(scene, camera, 600, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.drops = Array.from({ length: 64 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 0.5, col: BLOOD, glow: BLOOD_GLOW, w: 0.11, g: 12 })); this.dropI = 0;
    // Lure Dummy: rings of light pulsing out to its lure range each time it draws them, amber tethers from
    // what it drew, a thump and a burst of straw when it is set and when it is gone
    this.pulses = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uPulse: { value: 0 } }, vertexShader: RING_VS, fragmentShader: PULSE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return { m, t: 9, dur: 0.6, x: 0, z: 0, R: 5 }; }); this.pulseI = 0;
    this.lures = new Map(); this.tether = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.two = [new THREE.Vector3(), new THREE.Vector3()]; this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  /** The rules' trapSet: toss a plate from the hand (from: a ground-relative point) to (e.x, e.z). */
  set(e, def, from) {
    const p = this.plates.find((q) => q.state === 'off') || this.plates.reduce((a, b) => (a.t > b.t ? a : b));
    // a field's traps leave the hand one after another (e.i), each its own kind (e.look)
    const look = e.look || e.skill;
    Object.assign(p, { id: e.id, skill: look, t: -(e.look && e.look !== e.skill ? e.i || 0 : 0) * 0.06, state: 'toss', x: e.x, z: e.z, arm: e.arm ?? 0.6, trigger: e.trigger ?? def?.trap?.trigger ?? 1, radius: e.radius ?? def?.radius ?? 1.4, seed: this.rnd() * 10, spin: (this.rnd() - 0.5) * 12 });
    p.arm += p.t; // its teeth still click up when the rules arm it
    p.from.copy(from);
    p.g.visible = p.t >= 0; p.ring.visible = false;
    p.net = look === 'net_trap'; p.hold = e.hold ?? def?.root?.duration ?? 2.5; p.blast = look === 'blast_trap';
    for (const t of p.teeth) { t.scale.set(1, 0.3, 1); t.visible = !p.net && !p.blast; }
    for (const c of p.coil) c.visible = p.net;
    for (const m of p.bomb) m.visible = p.blast;
  }
  /** The rules' trapSprung. */
  spring(e) {
    const p = this.plates.find((q) => q.id === e.id && q.state !== 'off'); if (!p) return;
    p.state = 'spring'; p.springT = 0; p.ring.visible = false;
    const r = this.rnd, R = p.radius;
    if (p.blast) {
      // the bomb goes off: the plate is gone at once, the burst is Flame Arrow Rain's (onBlast)
      p.state = 'off'; p.clicked = false; p.g.visible = false; p.spark.visible = false;
      this.onBlast?.(p.x, p.z, R);
      this.glint(p.x, 0.9, p.z, 1.5, 0.3); place(this.light, p.x, 1, p.z); this.lightT = 0; // a clean glint, not a ragged flash
      for (let i = 0; i < 10; i++) { const a = r() * 6.283, sp = 2 + r() * 2.5; this.dust(p.x + Math.cos(a) * R * 0.4, 0.2, p.z + Math.sin(a) * R * 0.4, Math.cos(a) * sp, 0.8 + r() * 0.8, Math.sin(a) * sp, 0.9 + r() * 0.6, 0.7); }
      return;
    }
    if (p.net) {
      // the net bursts up off the plate and drapes over the whole circle; the plate is spent at once
      const n = this.nets.find((q) => q.t >= q.hold + NET_UP + NET_DRAPE + NET_FADE) || this.nets[0];
      Object.assign(n, { t: 0, x: p.x, z: p.z, R, hold: p.hold, seed: r() * 6 }); n.m.material.uniforms.uSeed.value = n.seed; n.m.visible = true;
      for (const c of p.coil) c.visible = false;
      for (let i = 0; i < 6; i++) { const a = r() * 6.283; this.dust(p.x + Math.cos(a) * R * 0.9, 0.12, p.z + Math.sin(a) * R * 0.9, Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8, 0.6, 0.5); }
      this.glint(p.x, 1.3, p.z, 0.8, 0.25);
      place(this.light, p.x, 1, p.z); this.lightT = 0;
      return;
    }
    p.spikes.forEach((k, i) => {
      const inner = i < 5, a = (i / (inner ? 5 : SPIKES_PER - 5)) * Math.PI * 2 + r() * 0.5, d = inner ? R * (0.12 + 0.25 * r()) : R * (0.45 + 0.4 * r());
      Object.assign(k, { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, h: inner ? 1.0 + 0.35 * r() : 0.55 + 0.3 * r(), w: inner ? 1.7 : 1.25, lean: (inner ? 0.12 : 0.35) + r() * 0.12, yaw: -a + Math.PI / 2, delay: (inner ? 0 : 0.03) + r() * 0.03 });
    });
    for (let i = 0; i < 8; i++) { const a = r() * 6.283, sp = 1.4 + r() * 1.6; this.dust(p.x + Math.cos(a) * R * 0.5, 0.15, p.z + Math.sin(a) * R * 0.5, Math.cos(a) * sp, 0.5 + r() * 0.6, Math.sin(a) * sp, 0.7 + r() * 0.5, 0.55); }
    this.glint(p.x, 0.9, p.z, 1.0, 0.28);
    place(this.light, p.x, 1, p.z); this.lightT = 0;
  }
  /** The rules' areaEnd: a trap that ran out its life unsprung sinks away (a sprung one is already ending). */
  end(id) { const p = this.plates.find((q) => q.id === id && (q.state === 'set' || q.state === 'toss')); if (p) { p.state = 'sink'; p.springT = 0; p.ring.visible = false; } }
  /** A struck body bleeds: a spray of drops off it (c: its centre, ground-relative). */
  bleed(c) {
    const r = this.rnd;
    for (let i = 0; i < 11; i++) { const q = this.drops[this.dropI++ % this.drops.length], a = r() * 6.283, sp = 1.2 + r() * 1.8; q.p.set(c.x, c.y, c.z); q.v.set(Math.cos(a) * sp, 1.5 + r() * 2, Math.sin(a) * sp); q.t = 0; q.life = 0.35 + r() * 0.25; Object.assign(q, { col: BLOOD, glow: BLOOD_GLOW, w: 0.11, g: 12 }); }
  }
  /** Straw thrown off a Lure Dummy (when it is set and when it is gone): light stalks that tumble and drift. */
  straw(x, z, n, up) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) { const q = this.drops[this.dropI++ % this.drops.length], a = r() * 6.283, sp = 0.8 + r() * 2; q.p.set(x + Math.cos(a) * 0.2, 0.6 + r() * 0.9, z + Math.sin(a) * 0.2); q.v.set(Math.cos(a) * sp, up * (0.8 + r() * 1.6), Math.sin(a) * sp); q.t = 0; q.life = 0.5 + r() * 0.5; Object.assign(q, { col: STRAW, glow: STRAW_GLOW, w: 0.07, g: 5 }); }
  }
  /** The rules' summon of a Lure Dummy (e.id, e.x, e.z): it thumps into the ground. */
  plant(e) {
    this.lures.set(e.id, { x: e.x, z: e.z, cd: 0 });
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + this.rnd(); this.dust(e.x + Math.cos(a) * 0.35, 0.1, e.z + Math.sin(a) * 0.35, Math.cos(a) * 1.4, 0.35, Math.sin(a) * 1.4, 0.55, 0.5); }
    this.straw(e.x, e.z, 6, 1); this.glint(e.x, 1.7, e.z, 0.7, 0.25);
    this.pulse(e.x, e.z, 1.6, 0.35);
  }
  /** The rules' allyGone: a Lure Dummy that ran out falls apart in a burst of straw. */
  gone(e) {
    if (!this.lures.has(e.id)) return;
    this.lures.delete(e.id);
    this.straw(e.x, e.z, 16, 1.4);
    for (let i = 0; i < 5; i++) { const a = this.rnd() * 6.283; this.dust(e.x + Math.cos(a) * 0.3, 0.3, e.z + Math.sin(a) * 0.3, Math.cos(a), 0.6, Math.sin(a), 0.6, 0.6); }
  }
  pulse(x, z, R, dur) { const q = this.pulses[this.pulseI++ % this.pulses.length]; Object.assign(q, { t: 0, x, z, R, dur }); q.m.visible = true; }
  dust(x, y, z, vx, vy, vz, size, life) { const q = this.dusts[this.dustI++ % DUSTS]; q.p.set(x, y, z); q.v.set(vx, vy, vz); q.t = 0; q.size = size; q.life = life; q.m.material.uniforms.uSeed.value = this.rnd() * 40; }
  glint(x, y, z, size, life) { const g = this.glints[this.glintI++ % this.glints.length]; g.p.set(x, y, z); g.t = 0; g.size = size; g.life = life; }

  update(dt, allies = null, monsters = null) {
    this.time += dt;
    // Lure Dummy: a ring of light runs out to the lure range each time it draws them (its tauntCd resets)
    for (const [id, L] of this.lures) {
      const a = allies?.find((q) => q.id === id);
      if (!a) continue;
      if ((a.tauntCd || 0) > L.cd + 0.3) this.pulse(a.x, a.z, a.tauntRadius || 5, 0.7);
      L.cd = a.tauntCd || 0; L.x = a.x; L.z = a.z;
    }
    for (const q of this.pulses) {
      if (q.t >= q.dur) { q.m.visible = false; continue; }
      q.t += dt; const u = q.t / q.dur;
      place(q.m, q.x, 0.04, q.z); q.m.scale.setScalar(q.R * 2 + 0.2);
      q.m.material.uniforms.uPulse.value = 0.15 + 0.85 * (1 - Math.pow(1 - u, 2)); q.m.material.uniforms.uA.value = 1 - u * u;
    }
    const cam = this.camera.quaternion;
    let k = 0;
    for (const p of this.plates) {
      if (p.state === 'off') { for (let j = 0; j < SPIKES_PER; j++, k++) { this.spikes.setMatrixAt(k, ZERO); this.spikeEdges.setMatrixAt(k, ZERO); } continue; }
      p.t += dt;
      const gy = fxGround.y(p.x, p.z);
      if (p.state === 'toss') {
        p.g.visible = p.t >= 0;
        const u = Math.max(0, Math.min(1, p.t / TOSS)), h = Math.sin(Math.PI * u) * 1.1;
        _p.copy(p.from).lerp(_p.set(p.x, 0, p.z), u);
        p.g.position.set(p.from.x + (p.x - p.from.x) * u, fxGround.y(_p.x, _p.z) + p.from.y * (1 - u) + h, p.from.z + (p.z - p.from.z) * u);
        p.g.rotation.set(p.spin * u * 0.5, p.spin * u, 0);
        if (u >= 1) {
          p.state = 'set'; p.g.position.set(p.x, gy, p.z); p.g.rotation.set(0, p.seed, 0);
          for (let i = 0; i < 4; i++) { const a = i * 1.57 + p.seed; this.dust(p.x + Math.cos(a) * 0.3, 0.1, p.z + Math.sin(a) * 0.3, Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7, 0.45, 0.45); }
        }
      } else if (p.state === 'set') {
        // a little settle after landing, then the teeth click up when it arms
        const land = p.t - TOSS, settle = land < 0.15 ? Math.sin(land / 0.15 * Math.PI) * 0.05 : 0;
        p.g.position.y = gy + settle;
        const armed = p.t >= p.arm, ak = armed ? Math.min(1, (p.t - p.arm) / 0.08) : 0;
        for (const t of p.teeth) t.scale.set(1, 0.3 + 0.7 * easeBack(ak), 1);
        if (armed && !p.clicked) { p.clicked = true; this.glint(p.x, gy + 0.35, p.z, 0.45, 0.22); }
        // a bomb's fuse sparks once armed, flickering
        p.spark.visible = p.blast && armed;
        if (p.spark.visible) { place(p.spark, p.x, 0.66, p.z); p.spark.scale.setScalar(0.32 + 0.1 * Math.sin(this.time * 37 + p.seed) + 0.06 * Math.sin(this.time * 23)); p.spark.material.rotation = this.time * 6; }
        // the trigger range, steady, with a soft ring running out to it every 1.4 s
        p.ring.visible = armed;
        if (armed) {
          place(p.ring, p.x, 0.03, p.z); p.ring.scale.setScalar(p.trigger * 2 + 0.2);
          const ph = ((p.t - p.arm) % 1.4) / 1.4;
          p.ring.material.uniforms.uPulse.value = ph; p.ring.material.uniforms.uA.value = Math.min(1, (p.t - p.arm) * 4) * (0.85 + 0.15 * Math.sin(this.time * 3));
        }
      } else if (p.state === 'spring' || p.state === 'sink') {
        p.spark.visible = false;
        p.springT += dt;
        const st = p.springT, gone = p.state === 'sink' ? st / SINK : Math.max(0, (st - SPRING - HOLD) / SINK);
        p.g.position.y = gy - 0.12 * Math.min(1, gone);
        p.g.scale.setScalar(Math.max(0.001, 1 - Math.max(0, gone - 0.3) / 0.7));
        if (gone >= 1) { p.state = 'off'; p.clicked = false; p.g.visible = false; p.g.scale.setScalar(1); }
      }
      // the spikes of a sprung trap: punch up fast with an overshoot, hold, sink back into the ground
      for (let j = 0; j < SPIKES_PER; j++, k++) {
        const s = p.spikes[j];
        if (p.state !== 'spring' || p.net) { this.spikes.setMatrixAt(k, ZERO); this.spikeEdges.setMatrixAt(k, ZERO); continue; }
        const u = (p.springT - s.delay) / SPRING;
        if (u <= 0) { this.spikes.setMatrixAt(k, ZERO); this.spikeEdges.setMatrixAt(k, ZERO); continue; }
        const out = Math.max(0, (p.springT - SPRING - HOLD - s.delay) / SINK), hk = easeBack(Math.min(1, u)) * (1 - Math.min(1, out));
        if (hk <= 0.001) { this.spikes.setMatrixAt(k, ZERO); this.spikeEdges.setMatrixAt(k, ZERO); continue; }
        _e.set(0, s.yaw, s.lean, 'YXZ'); _q.setFromEuler(_e);
        _p.set(s.x, fxGround.y(s.x, s.z) - 0.05, s.z); _m.compose(_p, _q, _s.set(s.w, s.h * hk, s.w));
        this.spikes.setMatrixAt(k, _m); this.spikeEdges.setMatrixAt(k, _m);
      }
    }
    this.spikes.instanceMatrix.needsUpdate = true; this.spikeEdges.instanceMatrix.needsUpdate = true;
    // nets: up off the plate fast (a tall narrow dome), then out and down over the circle (a low wide one)
    // with a little bounce, held while it roots them, then thinning away; weights fly out to its rim
    this.nets.forEach((n, ni) => {
      const end = n.hold + NET_UP + NET_DRAPE;
      if (n.t >= end + NET_FADE) { n.m.visible = false; for (let w = 0; w < WEIGHTS; w++) this.weights.setMatrixAt(ni * WEIGHTS + w, ZERO); return; }
      n.t += dt;
      const up = Math.min(1, n.t / NET_UP), dr = Math.min(1, Math.max(0, (n.t - NET_UP) / NET_DRAPE)), ed = easeBack(dr);
      const wide = n.R * (0.25 + 0.75 * up * 0.55 + 0.45 * ed), high = 1.5 * up * (1 - dr) + 0.75 * ed * (1 + 0.04 * Math.sin(n.t * 9) * (1 - Math.min(1, (n.t - NET_UP - NET_DRAPE) / 0.6)));
      place(n.m, n.x, 0.02, n.z); n.m.scale.set(Math.max(0.05, wide), Math.max(0.05, high), Math.max(0.05, wide)); n.m.rotation.y = n.seed;
      n.m.material.uniforms.uA.value = n.t < end ? 1 : Math.max(0, 1 - (n.t - end) / NET_FADE);
      for (let w = 0; w < WEIGHTS; w++) {
        const a = n.seed + (w / WEIGHTS) * Math.PI * 2, rr = wide * 1.0;
        _p.set(n.x + Math.cos(a) * rr, fxGround.y(n.x, n.z) + 0.1 + 0.6 * up * (1 - dr), n.z - Math.sin(a) * rr);
        const sc = n.t < end ? 1 : Math.max(0.001, 1 - (n.t - end) / NET_FADE);
        _m.compose(_p, _q.identity(), _s.set(sc, sc, sc)); this.weights.setMatrixAt(ni * WEIGHTS + w, _m);
      }
    });
    this.weights.instanceMatrix.needsUpdate = true;
    // speed lines: thin streaks shooting up beside the tall spikes as they punch (the first 0.16 s)
    this.core.begin(); this.glow.begin();
    for (const p of this.plates) {
      if (p.state !== 'spring' || p.springT > 0.16) continue;
      const u = p.springT / 0.16, two = this.two;
      for (let j = 0; j < 7; j++) {
        const s = p.spikes[j], ox = Math.cos(j * 2.4 + p.seed) * 0.18, oz = Math.sin(j * 2.4 + p.seed) * 0.18;
        two[0].set(s.x + ox, 0.2 + 1.4 * u, s.z + oz); two[1].set(s.x + ox, 0.2 + 1.4 * u + 0.7 * (1 - u), s.z + oz);
        sw = 0.04; this.glow.strip(two, lineGlowW, 0.8 * (1 - u), WARM); this.core.strip(two, lineW, 1 - u, WHITE);
      }
    }
    // amber tethers from each monster the dummy has drawn to its chest, sagging and swaying
    if (monsters && this.lures.size) for (const m of monsters) {
      if (m.dead || !(m.tauntT > 0)) continue;
      const L = this.lures.get(m.forcedTargetId); if (!L) continue;
      const n = this.tether.length, fade = Math.min(1, m.tauntT * 2) * (0.7 + 0.3 * Math.sin(this.time * 9 + m.x));
      for (let i = 0; i < n; i++) { const u = i / (n - 1), sag = Math.sin(Math.PI * u) * 0.35, wob = Math.sin(this.time * 7 + u * 6 + m.z) * 0.05 * Math.sin(Math.PI * u); this.tether[i].set(m.x + (L.x - m.x) * u, 1.0 + 0.25 * u - sag + wob, m.z + (L.z - m.z) * u); }
      sw = 0.09; this.glow.strip(this.tether, lineGlowW, 0.55 * fade, WARM); sw = 0.035; this.core.strip(this.tether, lineW, 0.8 * fade, [1.0, 0.85, 0.5]);
    }
    // blood drops: arcing down, thinning out
    for (const q of this.drops) {
      if (q.t >= q.life) continue;
      q.t += dt; const u = q.t / q.life; q.v.y -= 12 * dt; q.p.addScaledVector(q.v, dt);
      const three = this.three; three[0].copy(q.p).addScaledVector(q.v, -0.035); three[1].copy(q.p).lerp(three[0], 0.5); three[2].copy(q.p);
      q.v.y += (12 - q.g) * dt; sw = q.w * (1 - u * 0.5); this.glow.strip(three, dropW, 0.5 * (1 - u), q.glow); this.core.strip(three, dropW, 1 - u * 0.6, q.col);
    }
    this.core.end(); this.glow.end();
    for (const q of this.dusts) {
      if (q.t >= q.life) { q.m.visible = false; continue; }
      q.t += dt; const u = q.t / q.life; q.m.visible = true;
      q.v.multiplyScalar(Math.max(0, 1 - dt * 3)); q.p.addScaledVector(q.v, dt);
      q.m.material.uniforms.uT.value = u; place(q.m, q.p.x, q.p.y, q.p.z); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * (0.6 + 0.8 * u));
    }
    for (const g of this.glints) {
      if (g.t >= g.life) { g.s.visible = false; continue; }
      g.t += dt; const u = g.t / g.life; g.s.visible = true; place(g.s, g.p.x, g.p.y, g.p.z);
      g.s.scale.setScalar(g.size * (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8)); g.s.material.rotation = u * 1.2;
    }
    if (this.lightT < 0.35) { this.lightT += dt; this.light.intensity = 3 * (1 - this.lightT / 0.35); } else this.light.intensity = 0;
  }
  clear() {
    for (const p of this.plates) { p.state = 'off'; p.clicked = false; p.g.visible = false; p.ring.visible = false; p.spark.visible = false; p.g.scale.setScalar(1); }
    for (let i = 0; i < this.spikes.count; i++) { this.spikes.setMatrixAt(i, ZERO); this.spikeEdges.setMatrixAt(i, ZERO); }
    this.spikes.instanceMatrix.needsUpdate = true; this.spikeEdges.instanceMatrix.needsUpdate = true;
    for (const q of this.dusts) { q.t = 9; q.m.visible = false; } for (const g of this.glints) { g.t = 9; g.s.visible = false; }
    this.lures.clear(); for (const q of this.pulses) { q.t = 9; q.m.visible = false; }
    for (const n of this.nets) { n.t = 99; n.m.visible = false; } for (let i = 0; i < this.weights.count; i++) this.weights.setMatrixAt(i, ZERO); this.weights.instanceMatrix.needsUpdate = true;
    for (const q of this.drops) q.t = 9; this.core.begin(); this.core.end(); this.glow.begin(); this.glow.end();
    this.light.intensity = 0; this.lightT = 9;
  }
}
