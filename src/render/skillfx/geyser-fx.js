// Flame Geyser (the trapper's fire trap, 2026-10-31; core: frontier-content.js springTrap, trap.pulses).
// Its plate is an iron vent (skillfx/trap-fx.js); each of the rules' bursts at it (three, a second apart)
// is one eruption drawn here, made with Firebolt's fire (meteor-flame.js on V5_FIELD), not a picture:
//   a jet: a comet shell turned to point down into the vent, so its round hot head sits in the nozzle and
//     its tail tapers up into a tongue 3 m tall, the fire carried up along it; it shoots up in a few
//     frames with an overshoot, roars, then its cut rises so the top tears away first and it sinks;
//   a thin ring of fire racing out to the trap's true radius, and short tongues of the same fire licking up
//     from the ground where it passes, each torn away in a moment (round 1 had a squashed dome here: it
//     read as a flat blotchy disc);
//   embers thrown up the column, a warm light; between eruptions the jet sinks back into the vent.
// Nothing falls or flies at the target: it is fire from the ground. Pooled; no per-frame allocation.
import * as THREE from 'three';
import { addLight, place } from './fx-common.js';
import { flameMaterial, cometShell } from './meteor-flame.js';

const JETS = 6;
const RISE = 0.11, ROAR = 0.32, SINK = 0.42;          // seconds: shoot up, hold, tear away
const RING = 0.3, TONGUES = 6, LICK = 0.4, LICK_H = 1.3;  // the ring's run; tongues: how many, life, height
const HEIGHT = 3.0, WIDTH = 0.5;                      // the jet's height and its head's radius (m)
const COMET_LEN = 4, COMET_HEAD = 1;                  // cometShell(…, head, len): front at +0.9 head, tail at -len

const RING_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// a thin ring of fire racing out to the radius (uK 0..1), with a faint warm floor inside it
const RING_FS = `varying vec2 vP; uniform float uK;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float front = 0.25 + 0.75*sqrt(uK), w = 0.05 + 0.06*uK;
    float a = exp(-pow((r - front)/w, 2.0))*(1.0 - uK)*0.85 + (1.0 - smoothstep(0.0, front, r))*0.16*(1.0 - uK);
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(1.0, 0.9, 0.55), vec3(1.0, 0.42, 0.1), uK)*a, 1.0); }`;
const easeBack = (k) => { const c = 1.9; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };

export class GeyserFx {
  /** fire: the director's FireExtras (embers) */
  constructor(scene, camera, fire) {
    this.fire = fire; this.t = 0;
    const comet = [cometShell(0, COMET_HEAD, COMET_LEN), cometShell(1, COMET_HEAD, COMET_LEN)], disc = new THREE.PlaneGeometry(1, 1);
    const shell = (geo, mode, layer, filled, order, seed) => { const m = new THREE.Mesh(geo, flameMaterial(mode, layer, filled)); m.renderOrder = order; m.frustumCulled = false; m.material.uniforms.uSeed.value = seed; return m; };
    this.jets = Array.from({ length: JETS }, (_, k) => {
      // the jet: +x of the comet turned straight down (its head in the vent, its tail up)
      const jet = new THREE.Group();
      const outer = shell(comet[0], 0, 0, false, 7, k * 1.9), inner = shell(comet[1], 0, 1, false, 6, k * 1.9 + 0.7), core = shell(comet[1], 0, 1, true, 5, k * 1.9 + 1.3);
      core.scale.set(1, 0.55, 0.55);
      for (const m of [outer, inner, core]) { m.rotation.z = -Math.PI / 2; m.material.uniforms.uFlow.value = 3.6; m.material.uniforms.uLen.value = COMET_LEN; m.material.uniforms.uFront.value = COMET_HEAD * 0.9; jet.add(m); }
      jet.visible = false; scene.add(jet);
      // short tongues licking up where the ring passes: small comets pointing down, like the jet
      const tongues = Array.from({ length: TONGUES }, (_, i) => { const m = shell(comet[0], 0, 0, false, 7, k * 2.3 + i * 0.9); m.material.uniforms.uFlow.value = 4.2; m.material.uniforms.uLen.value = COMET_LEN; m.material.uniforms.uFront.value = COMET_HEAD * 0.9; m.rotation.z = -Math.PI / 2; m.visible = false; scene.add(m); return { m, x: 0, z: 0, at: 0, h: 1, w: 1 }; });
      const ring = new THREE.Mesh(disc, new THREE.ShaderMaterial({ uniforms: { uK: { value: 1 } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false; scene.add(ring);
      return { jet, tongues, ring, t: 9, x: 0, z: 0, R: 2.2, lean: 0, spin: 0 };
    });
    this.jetI = 0;
    this.light = addLight(scene, new THREE.PointLight('#ffb050', 0, 7, 1.6)); this.lightT = 9;
    this.p = new THREE.Vector3();
    this.rndK = 0; let seed = 71; this.rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  }
  /** One of the rules' bursts at a Flame Geyser (x, z), over its radius R. */
  erupt(x, z, R) {
    const j = this.jets[this.jetI++ % JETS], k = (this.rndK = (this.rndK * 9301 + 49297) % 233280) / 233280;
    Object.assign(j, { t: 0, x, z, R, lean: (k - 0.5) * 0.12, spin: k * 6.28 });
    j.jet.visible = true; j.ring.visible = true;
    place(j.jet, x, 0, z); place(j.ring, x, 0.04, z);
    // the tongues: round the vent between 0.45 and 0.9 of the radius, each when the ring's front reaches it
    j.tongues.forEach((q, i) => {
      const r = this.rnd(), a = (i + r * 0.7) / TONGUES * Math.PI * 2 + k * 6.28, f = 0.45 + 0.45 * this.rnd(), d = f * R;
      Object.assign(q, { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, at: ((f - 0.25) / 0.75) ** 2 * RING, h: LICK_H * (0.7 + 0.5 * this.rnd()), w: 0.3 + 0.12 * this.rnd() });
    });
    j.jet.rotation.set(j.lean, j.spin, 0); j.ring.scale.setScalar(R * 2);
    place(this.light, x, 1.4, z); this.lightT = 0;
    // embers thrown up the column and out over the splash
    this.fire?.burst(x, 0.6, z, 14, 0.9, 0.5);
    this.fire?.burst(x, 2.0, z, 8, 0.7, 0.3);
  }
  update(dt) {
    this.t += dt;
    for (const j of this.jets) {
      if (j.t >= RISE + ROAR + SINK + 0.1) { if (j.jet.visible) { j.jet.visible = false; j.ring.visible = false; for (const q of j.tongues) q.m.visible = false; } continue; }
      j.t += dt;
      const t = j.t, up = Math.min(1, t / RISE), tear = Math.max(0, (t - RISE - ROAR) / SINK);
      // the jet: shoots up (length) with an overshoot, roars with a flicker of its width, then tears away
      const len = HEIGHT * Math.max(0.05, easeBack(up)) * (1 - 0.25 * tear), wid = WIDTH * (0.75 + 0.25 * up) * (1 + 0.06 * Math.sin(this.t * 31 + j.spin)) * (1 - 0.35 * tear);
      const sx = len / (COMET_LEN + COMET_HEAD * 0.9);
      // after turning +x down: the comet's x runs along -y; its tail end (-COMET_LEN) at the top, the head's front at the ground
      j.jet.scale.set(wid, sx, wid);
      // as it tears away it sinks back into the vent, so no round head is left standing on the ground
      j.jet.position.y = -len * 0.55 * tear * tear;
      // the tongues: up fast where the ring passes, torn away from the top in a moment
      for (const q of j.tongues) {
        const lt = t - q.at, lu = lt / LICK;
        q.m.visible = lt > 0 && lu < 1; if (!q.m.visible) continue;
        const rise = Math.min(1, lt / 0.07), h = q.h * easeBack(rise) * (1 - 0.4 * lu);
        place(q.m, q.x, 0, q.z); q.m.position.y -= h * 0.3 * lu;
        q.m.scale.set(h / (COMET_LEN + COMET_HEAD * 0.9), q.w * (1 - 0.3 * lu), q.w * (1 - 0.3 * lu));
        const u = q.m.material.uniforms; u.uTime.value = this.t; u.uCut.value = 0.04 + 0.5 * lu * lu; u.uCool.value = 0.05 + 0.2 * lu; u.uAlpha.value = 1 - Math.max(0, lu - 0.7) / 0.3;
      }
      j.ring.material.uniforms.uK.value = Math.min(1, t / RING); j.ring.visible = t < RING;
      j.jet.children.forEach((m, i) => { const u = m.material.uniforms; u.uTime.value = this.t; u.uCut.value = 0.5 * tear * tear; u.uCool.value = 0.22 * tear;
        // the filled core has no cut to tear it: it fades out first
        u.uAlpha.value = Math.min(1, up * 3) * (i === 2 ? Math.max(0, 1 - tear * 2) : 1 - Math.max(0, tear - 0.6) / 0.4); });
    }
    if (this.lightT < 0.5) { this.lightT += dt; this.light.intensity = 4 * (1 - this.lightT / 0.5); } else this.light.intensity = 0;
  }
  clear() { for (const j of this.jets) { j.t = 9; j.jet.visible = false; j.ring.visible = false; for (const q of j.tongues) q.m.visible = false; } this.light.intensity = 0; }
}
