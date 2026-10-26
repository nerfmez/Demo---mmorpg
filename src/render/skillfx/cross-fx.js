// Cross Cut (daggers: two quick cuts in front, 0.14 s apart), held to the owner's bar
// (.claude/skills/skill-vfx). The two cuts are the bench's slash crescents in violet with fixed, opposite
// steep tilts (SlashFx, tilt option), so together they draw an X. The X is not a picture over the scene
// (the owner: a ready-made X floating between the hero and its targets read as pasted on): each struck
// monster gets a cut line across its body as each cut lands, drawn in as the blade passes. The first zips across
// and waits; when the second crosses it, both flare, sparks burst from the crossing, and the lines thin
// out and fade, like an anime slash landing a beat after the swing. Cosmetic only.
import * as THREE from 'three';
import { Ribbon, mulberry32, addLight } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, drawSparks, spark } from './light-kit.js';

export const CROSS_PALETTE = { hot: [1, 0.95, 1], body: [0.8, 0.52, 1.0], glow: [0.56, 0.22, 1.0] };
const LOOK = { edge: [0.97, 0.9, 1.0], glow: [0.6, 0.25, 1.0] };
const WOUNDS = 8, SPARKS = 140, SEG = 9;
const TILT = 0.8, LENGTH = 1.5, ZIP = 0.05, WAIT = 0.45, FLARE_AT = 0.05, FLARE = 0.07, FADE = 0.3;
// a cut line: pointed at both ends, widest a little past its middle (the way the blade went)
const lineW = (x) => W.v * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, x))), 0.7);
const lineGlowW = (x) => lineW(x) * 2.6;

export class CrossFx {
  constructor(scene, camera) {
    this.camera = camera; this.rnd = mulberry32(57);
    this.core = new Ribbon(scene, camera, 1400, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 1400, GLOW_FS, THREE.AdditiveBlending);
    // the lines lie on the body's near side: drawn over it so the body does not swallow them
    this.core.mesh.renderOrder = 12; this.glow.mesh.renderOrder = 11; this.core.mesh.material.depthTest = false; this.glow.mesh.material.depthTest = false;
    this.wounds = Array.from({ length: WOUNDS }, () => ({ id: null, t: 9, second: -1, c: new THREE.Vector3(), right: new THREE.Vector3() }));
    this.sparks = []; this.free = [];
    this.light = addLight(scene, new THREE.PointLight('#c79bff', 0, 4, 2));
    this.pts = Array.from({ length: SEG }, () => new THREE.Vector3());
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.d = new THREE.Vector3(); this.camRight = new THREE.Vector3(); this.camUp = new THREE.Vector3(); this.v = new THREE.Vector3();
  }
  // a struck monster (body centre c, the hero at fromX/fromZ): the first cut opens a wound, the second
  // cut on the same monster crosses it
  hit(id, c, fromX, fromZ) {
    let w = this.wounds.find((q) => q.id === id && q.second < 0 && q.t < WAIT);
    if (w) { w.second = w.t; return; }
    w = this.wounds.reduce((a, b) => (a.t > b.t ? a : b));
    const fx = c.x - fromX, fz = c.z - fromZ, l = Math.hypot(fx, fz) || 1;
    w.id = id; w.t = 0; w.second = -1;
    w.right.set(fz / l, 0, -fx / l); // the hero's right, looking at the monster
    w.c.set(c.x - (fx / l) * 0.35, c.y + 0.1, c.z - (fz / l) * 0.35); // on the near side of the body
  }
  // one cut line across wound w: tilt k = +1 (the first cut) or -1, drawn from 0..reach of its length
  line(w, k, reach, alpha, width) {
    // across the camera's view (the game camera is high: a line in the hero's vertical plane is seen
    // edge-on), at the cut's tilt; it zips in from its upper end for the first cut, its lower end for
    // the second (the backhand rises)
    const t = TILT * k, d = this.d.copy(this.camRight).multiplyScalar(Math.cos(t)).addScaledVector(this.camUp, Math.sin(t));
    for (let i = 0; i < SEG; i++) {
      const s = (i / (SEG - 1)) * reach;
      this.pts[i].copy(w.c).addScaledVector(d, LENGTH * (0.5 - s));
    }
    W.v = width;
    this.glow.strip(this.pts, lineGlowW, alpha * 0.8, LOOK.glow);
    this.core.strip(this.pts, lineW, alpha, LOOK.edge);
  }
  update(dt) {
    this.core.begin(); this.glow.begin();
    this.camRight.setFromMatrixColumn(this.camera.matrixWorld, 0); this.camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    let light = 0;
    for (const w of this.wounds) {
      if (w.t >= 9) continue;
      w.t += dt;
      if (w.second < 0) {
        // one line, waiting for the second cut; it fades if the second cut never reaches this monster
        if (w.t > WAIT) { w.t = 9; continue; }
        const fade = Math.min(1, (WAIT - w.t) / 0.15);
        this.line(w, 1, Math.min(1, w.t / ZIP), 0.9 * fade, 0.07);
        continue;
      }
      const s = w.t - w.second; // since the second cut
      const flare = s - FLARE_AT; // the crossing flares a beat after the second line
      if (flare < 0) {
        this.line(w, 1, 1, 0.9, 0.07);
        this.line(w, -1, Math.min(1, s / ZIP), 0.95, 0.07);
        continue;
      }
      if (flare - dt < 0) {
        const r = this.rnd;
        for (let i = 0; i < 16; i++) {
          const a = r() * 6.283, sp = 3 + r() * 4;
          this.v.set(Math.cos(a) * sp, 1.5 + r() * 3, Math.sin(a) * sp);
          spark(this.sparks, this.free, SPARKS, w.c, this.v, 0.14 + r() * 0.16, 0.025, LOOK);
        }
        this.light.position.copy(w.c);
      }
      if (flare > FLARE + FADE) { w.t = 9; continue; }
      // flare: both lines swell bright, then thin to a hairline and fade
      const swell = flare < FLARE ? 1 + 1.8 * Math.sin((Math.PI * flare) / FLARE) : 1;
      const u = Math.max(0, (flare - FLARE) / FADE), alpha = 1 - u * u, width = 0.08 * swell * (1 - 0.7 * u);
      for (const k of [1, -1]) this.line(w, k, 1, alpha, width);
      light = Math.max(light, 5 * (1 - u));
    }
    this.light.intensity = light;
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 10);
    this.core.end(); this.glow.end();
  }
  clear() { for (const w of this.wounds) w.t = 9; for (const q of this.sparks) this.free.push(q); this.sparks.length = 0; this.light.intensity = 0; }
  get busy() { return this.wounds.some((w) => w.t < 9) || this.sparks.length > 0; }
}
