// Frost Jaw (the trapper's ice trap, 2026-10-31; core: a trap whose burst stuns and chills). Its plate is the
// iron trap with a cold light in its middle (skillfx/trap-fx.js); when a monster steps in, the rules'
// trapSprung is drawn here as a jaw of ice, built the way Ice Spikes is (translucent crystals lit from
// within, lines and light, never pictures), but its own shape: not a line of spikes, a closing bite.
//   bite: two rows of ice fangs break out of the ground on opposite sides of the circle, leaning out like an
//     open jaw, then snap in over the middle in a few frames with an overshoot so their points almost meet
//     above whatever stepped in - a cage of fangs; a white glint where they meet, chips, a cold light;
//   frost: a snowflake of frost light drawn out from the middle to the circle's edge under the jaw (six
//     arms with branches), the true radius as a faint ring;
//   hold: the jaw stays shut while it stuns (the skill's stun), its fangs breathing a little light;
//   break: the fangs flash white and crack apart into chips, cold mist rises, the frost fades.
// Cosmetic only; pooled (one instanced fang mesh, one instanced chip mesh), no per-frame allocation.
import * as THREE from 'three';
import { mulberry32, BILLBOARD_VS, addLight, fxGround, place, conformPlane } from './fx-common.js';
import { crystalGeo } from './frost-fx.js';
import { ICE_VS, ICE_FS, MIST_FS } from './icespike-fx.js';
import { lightSprite, starTexture } from './light-kit.js';

const JAWS = 3, SIDE = 7, FANGS = SIDE * 2, CHIPS = 60, MISTS = 6;
const RISE = 0.06, SNAP = 0.1, BREAK = 0.2, FADE = 0.6;           // seconds
const OPEN = -0.9, SHUT = 0.82;                                    // fang lean (rad, + toward the middle)

const RIME_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// a snowflake of frost light on the ground (owner, round 1: "can the ground be a snowflake?"; additive, uv
// -1..1 over the radius): six arms, each with three pairs of branches at 60 degrees and a small hexagon at
// the heart, thin bright lines in a soft cold halo, drawn out from the middle behind uGrow (0..1); the true
// radius a faint ring at the edge; uA fades it, uSeed turns it
const RIME_FS = `varying vec2 vP; uniform float uGrow, uA, uSeed;
  float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h); }
  void main(){
    float r = length(vP); if (r > 1.0) discard;
    // fold into one half-arm: angle measured from the nearest arm, mirrored
    float a = atan(vP.y, vP.x) + uSeed, w = 1.0471976;
    a = mod(a + w*0.5, w) - w*0.5;
    vec2 q = r*vec2(cos(a), abs(sin(a)));
    const vec2 B = vec2(0.5, 0.8660254);                                  // a branch, 60 degrees off its arm
    float d = seg(q, vec2(0.0), vec2(0.9, 0.0));                          // the arm
    d = min(d, seg(q, vec2(0.28, 0.0), vec2(0.28, 0.0) + B*0.24));        // three pairs of branches
    d = min(d, seg(q, vec2(0.5, 0.0), vec2(0.5, 0.0) + B*0.19));
    d = min(d, seg(q, vec2(0.7, 0.0), vec2(0.7, 0.0) + B*0.12));
    d = min(d, seg(q, vec2(0.9, 0.0), vec2(0.9, 0.0) + B*0.06));          // a small fork at the tip
    d = min(d, seg(q, vec2(0.16, 0.0), vec2(0.08, 0.1385641)));           // the hexagon at the heart
    float line = 1.0 - smoothstep(0.008, 0.02, d), halo = exp(-d*d*700.0)*0.35;
    float lead = smoothstep(uGrow + 0.02, uGrow - 0.1, r);
    float ring = exp(-pow((r - 0.97)/0.02, 2.0))*0.5;
    float k = ((line*0.6 + halo)*lead + ring*step(0.9, uGrow) + (1.0 - r)*0.1*lead)*uA;
    if (k < 0.004) discard;
    gl_FragColor = vec4(vec3(0.45, 0.8, 1.0)*k + vec3(0.5, 0.6, 0.6)*k*k, 1.0); }`;

const easeBack = (k) => { const c = 2.0; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class JawFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(61); this.time = 0;
    const mat = new THREE.ShaderMaterial({ vertexShader: ICE_VS, fragmentShader: ICE_FS, transparent: true, depthWrite: false });
    const fangGeo = crystalGeo(113); fangGeo.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(JAWS * FANGS), 1));
    this.fangMesh = new THREE.InstancedMesh(fangGeo, mat, JAWS * FANGS); this.fangMesh.frustumCulled = false; this.fangMesh.renderOrder = 4;
    // both instanced pools hide while empty, so an idle trap costs no draw call (data/rendering.json budgets)
    for (let i = 0; i < this.fangMesh.count; i++) this.fangMesh.setMatrixAt(i, ZERO); this.fangMesh.visible = false; scene.add(this.fangMesh);
    const chipGeo = crystalGeo(97); chipGeo.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(CHIPS).fill(0.35), 1));
    this.chipMesh = new THREE.InstancedMesh(chipGeo, mat, CHIPS); this.chipMesh.frustumCulled = false; this.chipMesh.renderOrder = 4;
    for (let i = 0; i < CHIPS; i++) this.chipMesh.setMatrixAt(i, ZERO); this.chipMesh.visible = false; scene.add(this.chipMesh);
    this.chips = Array.from({ length: CHIPS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), t: 9, life: 0.6, size: 0.08 })); this.chipI = 0;
    const disc = new THREE.PlaneGeometry(1, 1, 8, 8), quad = new THREE.PlaneGeometry(1, 1);
    this.jaws = Array.from({ length: JAWS }, () => {
      const rime = new THREE.Mesh(disc, new THREE.ShaderMaterial({ uniforms: { uGrow: { value: 0 }, uA: { value: 0 }, uSeed: { value: 0 } }, vertexShader: RIME_VS, fragmentShader: RIME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      rime.rotation.x = -Math.PI / 2; rime.renderOrder = 2; rime.visible = false; scene.add(rime);
      return { rime, glint: lightSprite(scene, starTexture('cold'), false, 10), t: 9, x: 0, z: 0, R: 1.8, hold: 1.6, end: 0, yaw: 0, broke: false,
        fangs: Array.from({ length: FANGS }, () => ({ bx: 0, bz: 0, th: 0, h: 1, w: 0.2, at: 0, brk: 0, broke: false })) };
    });
    this.jawI = 0;
    this.mists = Array.from({ length: MISTS }, () => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 } }, vertexShader: BILLBOARD_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false })); m.visible = false; m.renderOrder = 6; m.frustumCulled = false; scene.add(m); return { m, p: new THREE.Vector3(), t: 9, size: 1 }; });
    this.light = addLight(scene, new THREE.PointLight('#a8dcff', 0, 7, 1.6)); this.lightT = 9;
  }
  /** The rules' trapSprung of a Frost Jaw at (x, z), over radius R; it holds shut `hold` s (the stun). The
   *  fangs close on (cx, cz): the monster that stepped in (the frost stays on the trap's true circle). */
  bite(x, z, R, hold, cx = x, cz = z) {
    const r = this.rnd, J = this.jaws[this.jawI++ % JAWS];
    Object.assign(J, { t: 0, x, z, R, hold, yaw: r() * 6.283, broke: false, cx, cz });
    const rb = R * 0.72, fx = cx, fz = cz;
    J.fangs.forEach((f, i) => {
      // two rows facing each other: each spans 140 degrees round its side; the middle fangs the tallest
      const side = i < SIDE ? 0 : Math.PI, k = (i % SIDE) / (SIDE - 1), th = J.yaw + side + (k - 0.5) * 2.45 + (r() - 0.5) * 0.08;
      const mid = 1 - Math.abs(k - 0.5) * 2;
      Object.assign(f, { bx: fx + Math.cos(th) * rb, bz: fz + Math.sin(th) * rb, th, h: (0.9 + 0.65 * mid) * (0.92 + r() * 0.16) * R / 1.8, w: (0.16 + 0.07 * mid) * (0.9 + r() * 0.2),
        at: Math.abs(k - 0.5) * 0.03, brk: hold + 0.05 + r() * 0.12, broke: false, lean: SHUT * (0.85 + 0.25 * mid) * (rb > 0 ? 1 : 0) });
    });
    J.rime.visible = true; place(J.rime, x, 0.03, z); J.rime.scale.setScalar(R * 2); conformPlane(J.rime, 0.03);
    J.rime.material.uniforms.uSeed.value = r() * 6.283;
    place(this.light, x, 1.0, z); this.lightT = 0;
    this.chipBurst(x, z, 8, R * 1.2, 0.04);
  }
  chipBurst(x, z, n, spread, delay, y = 0.25) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const c = this.chips[this.chipI++ % CHIPS], a = r() * 6.283, sp = 1.0 + r() * 2.2;
      c.p.set(x + (r() - 0.5) * spread, y + r() * 0.4, z + (r() - 0.5) * spread); c.v.set(Math.cos(a) * sp, 2.2 + r() * 2.5, Math.sin(a) * sp);
      c.spin.set(r() * 12 - 6, r() * 12 - 6, r() * 12 - 6); c.rot.set(r() * 6, r() * 6, r() * 6); c.t = -delay; c.life = 0.5 + r() * 0.3; c.size = 0.07 + r() * 0.06;
    }
  }
  mist(x, z, at, size) { const q = this.mists.find((m) => m.t >= 1.4) || this.mists[0]; q.p.set(x, 0.4, z); q.t = -at; q.size = size; q.m.material.uniforms.uSeed.value = this.rnd() * 40; }

  update(dt) {
    this.time += dt;
    const cam = this.camera.quaternion, flash = this.fangMesh.geometry.attributes.aFlash.array;
    let fangsUp = false, chipsOut = false;
    this.jaws.forEach((J, ji) => {
      const end = J.hold + BREAK + FADE + 0.2;
      if (J.t >= end) { if (J.rime.visible) { J.rime.visible = false; J.glint.visible = false; for (let i = 0; i < FANGS; i++) this.fangMesh.setMatrixAt(ji * FANGS + i, ZERO); } return; }
      const t = (J.t += dt);
      J.fangs.forEach((f, i) => {
        const slot = ji * FANGS + i, u = t - f.at;
        if (u <= 0) { this.fangMesh.setMatrixAt(slot, ZERO); return; }
        // out of the ground leaning out (open), then snapped in over the middle (shut) with an overshoot
        const grow = Math.min(1, u / RISE), snap = easeBack(Math.min(1, Math.max(0, (u - RISE) / SNAP)));
        const lean = OPEN + (f.lean - OPEN) * snap;
        const b = (t - f.brk) / BREAK, fl = Math.min(1, Math.max(0, (t - f.brk + 0.1) / 0.1));
        flash[slot] = b > 0 ? Math.max(0, 1 - b * 2.5) : fl * fl * 0.9 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 5 + i));
        let hk = grow, wk = 0.4 + 0.6 * grow;
        if (b > 0) {
          if (!f.broke) { f.broke = true; this.chipBurst(f.bx, f.bz, 2, 0.3, 0, f.h * 0.4); }
          hk *= Math.max(0, 1 - b); wk *= Math.max(0, 1 - 0.7 * b);
        }
        if (hk <= 0.001) { this.fangMesh.setMatrixAt(slot, ZERO); return; }
        // the fang's axis: up, leaned toward the middle (lean > 0) or away from it
        _d.set(-Math.cos(f.th) * Math.sin(lean), Math.cos(lean), -Math.sin(f.th) * Math.sin(lean));
        _q.setFromUnitVectors(_y, _d);
        _p.set(f.bx, fxGround.y(f.bx, f.bz) - 0.1, f.bz);
        _m.compose(_p, _q, _s.set(f.w * wk, f.h * hk, f.w * wk)); this.fangMesh.setMatrixAt(slot, _m); fangsUp = true;
      });
      // the snap: a glint where the points meet, a puff of chips and the frost running out
      const sk = (t - RISE - SNAP * 0.6) / 0.3;
      J.glint.visible = sk > 0 && sk < 1;
      if (J.glint.visible) { place(J.glint, J.cx, 1.0 * J.R / 1.8, J.cz); J.glint.scale.setScalar(0.9 * Math.sin(Math.PI * sk)); J.glint.material.rotation = sk * 1.4; J.glint.material.opacity = 1; }
      const U = J.rime.material.uniforms, fade = Math.max(0, (t - J.hold - BREAK) / FADE);
      U.uGrow.value = Math.min(1, Math.max(0, (t - RISE) / 0.25)); U.uA.value = Math.max(0, 1 - fade);
      if (!J.broke && t >= J.hold + 0.1) { J.broke = true; for (let i = 0; i < 3; i++) { const a = J.yaw + i * 2.1; this.mist(J.cx + Math.cos(a) * J.R * 0.4, J.cz + Math.sin(a) * J.R * 0.4, i * 0.06, 0.9 + this.rnd() * 0.4); } this.lightT = 0.15; }
    });
    this.fangMesh.instanceMatrix.needsUpdate = true; this.fangMesh.geometry.attributes.aFlash.needsUpdate = true; this.fangMesh.visible = fangsUp;
    for (let i = 0; i < CHIPS; i++) {
      const c = this.chips[i];
      if (c.t >= c.life) { this.chipMesh.setMatrixAt(i, ZERO); continue; }
      c.t += dt; if (c.t < 0) { this.chipMesh.setMatrixAt(i, ZERO); continue; }
      c.v.y -= 11 * dt; c.p.addScaledVector(c.v, dt); if (c.p.y < 0.03) { c.p.y = 0.03; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.3; }
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt; _q.setFromEuler(c.rot);
      const sz = c.size * Math.min(1, 2.5 * (1 - c.t / c.life));
      _p.set(c.p.x, c.p.y + fxGround.y(c.p.x, c.p.z), c.p.z); _m.compose(_p, _q, _s.set(sz * 0.45, sz * 2.6, sz * 0.45)); this.chipMesh.setMatrixAt(i, _m); chipsOut = true;
    }
    this.chipMesh.instanceMatrix.needsUpdate = true; this.chipMesh.visible = chipsOut;
    for (const q of this.mists) {
      if (q.t >= 1.4) { q.m.visible = false; continue; }
      q.t += dt; if (q.t < 0) { q.m.visible = false; continue; }
      q.m.visible = true; const u = q.t / 1.4;
      place(q.m, q.p.x, q.p.y + u * 0.5, q.p.z); q.m.quaternion.copy(cam); q.m.scale.setScalar(q.size * (0.8 + 0.6 * u)); q.m.material.uniforms.uT.value = u;
    }
    if (this.lightT < 0.5) { this.lightT += dt; this.light.intensity = 4 * (1 - this.lightT / 0.5); } else this.light.intensity = 0;
  }
  clear() {
    for (const J of this.jaws) { J.t = 99; J.rime.visible = false; J.glint.visible = false; }
    for (let i = 0; i < this.fangMesh.count; i++) this.fangMesh.setMatrixAt(i, ZERO); this.fangMesh.instanceMatrix.needsUpdate = true; this.fangMesh.visible = this.chipMesh.visible = false;
    for (const c of this.chips) c.t = 9; for (const q of this.mists) { q.t = 9; q.m.visible = false; }
    this.light.intensity = 0;
  }
}
