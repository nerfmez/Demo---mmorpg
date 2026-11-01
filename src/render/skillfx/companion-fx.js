// The hunter's companions' strikes (owner, 2026-11-01: "no attack effect at all, and every Sic 'Em is the same
// daze"). Each animal's hit is drawn as its own weapon, lines and light on the game camera's plane (camera
// right and up at the hit), never pictures; the dust, feathers and rings come from the call effect
// (skillfx/call-fx.js) so the companions share one look:
//   wolf (allyStrike kind hunt_hound / pack_hound): a fang snap, an upper and a lower crescent closing on the
//     prey with a white glint where they meet; sent in (Sic 'Em: the pounce, which stuns) it is bigger and
//     the landing throws a ring of dust;
//   bear: three claw rakes torn diagonally across the prey (warm red glow), a dust puff and a short shake;
//     its Sic 'Em roar (companionPounce with roar) sends three warm sound rings out to the taunt's true
//     radius on the ground, dust round the bear and a hard shake;
//   eagle: two quick talon slashes crossed and a puff of feathers; its Sic 'Em dive (bleed and a hard
//     flinch) tears three deep red gashes, a ring of air and a burst of feathers.
// Cosmetic only; pooled (one ribbon pair, one glint pool), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightSprite, starTexture } from './light-kit.js';

const STROKES = 36, GLINTS = 6;
const WOLF = { core: [1.0, 0.97, 0.9], glow: [1.0, 0.72, 0.42] };
const BEAR = { core: [1.0, 0.92, 0.82], glow: [0.95, 0.3, 0.14] };
const HAWK = { core: [0.96, 0.99, 1.0], glow: [0.5, 0.72, 1.0] };
const GASH = { core: [1.0, 0.72, 0.66], glow: [0.95, 0.08, 0.06] };
const ROAR = new THREE.Color(1.0, 0.62, 0.3);
const HEIGHT = { hunt_hound: 0.6, pack_hound: 0.5, hunt_bear: 0.9, hunt_hawk: 0.8 };
let sw = 0;
const slashW = (x) => sw * Math.pow(Math.sin(Math.PI * x), 0.8), slashGlowW = (x) => sw * 2.6 * Math.sin(Math.PI * x);
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();

export class CompanionFx {
  /** call: the CallFx whose dust, feathers and rings these share. */
  constructor(scene, camera, call) {
    this.camera = camera; this.call = call; this.rnd = mulberry32(83); this.onShake = null;
    this.core = new Ribbon(scene, camera, 700, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 700, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 11; this.glow.mesh.renderOrder = 10;
    this.core.mesh.material.depthTest = false; this.glow.mesh.material.depthTest = false; // marks over the prey's body, as hit marks are drawn
    // a stroke: a quadratic curve a -> b over control c, drawn from its head (grows over `grow`) to its tail
    this.strokes = Array.from({ length: STROKES }, () => ({ t: 9, life: 0.3, grow: 0.06, delay: 0, w: 0.08, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), da: new THREE.Vector3(), db: new THREE.Vector3(), look: WOLF }));
    this.strokeI = 0;
    this.glints = Array.from({ length: GLINTS }, () => ({ s: lightSprite(scene, starTexture('steel'), true, 12), t: 9, life: 0.18, size: 0.8, delay: 0 }));
    for (const g of this.glints) g.s.material.depthTest = false;
    this.glintI = 0;
    this.pts = Array.from({ length: 10 }, () => new THREE.Vector3());
  }
  // the camera's right and up at this moment (strokes are drawn on the screen's plane)
  axes() { const m = this.camera.matrixWorld.elements; _r.set(m[0], m[1], m[2]).normalize(); _u.set(m[4], m[5], m[6]).normalize(); }
  // a stroke centred on c: from c + (x0, y0) to c + (x1, y1) in camera units, bowed by bow; drift moves both ends
  stroke(c, x0, y0, x1, y1, bow, w, look, life, grow, delay = 0, drift = null) {
    const s = this.strokes[this.strokeI++ % STROKES];
    s.a.copy(c).addScaledVector(_r, x0).addScaledVector(_u, y0);
    s.b.copy(c).addScaledVector(_r, x1).addScaledVector(_u, y1);
    // the bow: the control point pushed off the middle, square to the stroke on the screen
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    s.c.copy(c).addScaledVector(_r, mx - (dy / L) * bow).addScaledVector(_u, my + (dx / L) * bow);
    s.da.set(0, 0, 0); s.db.set(0, 0, 0);
    if (drift) { s.da.copy(drift); s.db.copy(drift); }
    Object.assign(s, { t: -delay, life, grow, w, look, delay });
    return s;
  }
  glint(x, y, z, size, delay = 0) { const g = this.glints[this.glintI++ % GLINTS]; g.t = -delay; g.size = size; g.s.position.set(x, y, z); }

  /** The rules' allyStrike of a companion (e.kind its type, e.sic: Sic 'Em's strike): true when drawn here. */
  strike(e) {
    const k = e.kind;
    if (!HEIGHT[k]) return false;
    this.axes();
    const big = e.sic ? 1 : 0, r = this.rnd;
    // the hit point: on the prey's near side, at the body's height
    const ang = Math.atan2(e.x - e.fromX, e.z - e.fromZ), near = 0.3, Z = 2.2; // Z: the marks' size (the prey's body, seen from the game camera)
    _c.set(e.x - Math.sin(ang) * near, HEIGHT[k] + (k === 'hunt_hawk' ? 0 : 0.1 * big), e.z - Math.cos(ang) * near);
    const side = Math.sin(ang) * _r.x + Math.cos(ang) * _r.z >= 0 ? 1 : -1; // which way across the screen it struck
    if (k === 'hunt_bear') {
      // three rakes torn down and across the prey, the far claw a beat behind
      const S = (big ? 1.25 : 1) * Z * 0.62; // shorter, thicker rakes: three claws, not three long cuts
      for (let i = 0; i < 3; i++) {
        const o = (i - 1) * 0.2 * S;
        this.stroke(_c, (-0.55 + o * 0.6) * side * S, (0.55 + o) * S, (0.5 + o * 0.6) * side * S, (-0.45 + o) * S, 0.12 * side * S, (big ? 0.3 : 0.24) * (1 - Math.abs(i - 1) * 0.15), BEAR, 0.42, 0.08, i * 0.02);
      }
      this.glint(_c.x, _c.y, _c.z, big ? 2.2 : 1.6, 0.06);
      this.call.dust(e.x, 0.15, e.z, Math.sin(ang) * 1.2, 0.4, Math.cos(ang) * 1.2, 0.7, 0.45);
      this.onShake?.(big ? 0.14 : 0.06, 0.1);
    } else if (k === 'hunt_hawk') {
      if (big) {
        // the dive's three deep gashes (it bleeds), a ring of air, a burst of feathers
        for (let i = 0; i < 3; i++) { const Q = Z * 0.7, o = (i - 1) * 0.22 * Q; this.stroke(_c, (-0.6 * Q + o * 0.4) * side, 0.5 * Q + o, (0.55 * Q + o * 0.4) * side, -0.5 * Q + o, 0.12 * side * Q, 0.24, GASH, 0.5, 0.07, i * 0.02); }
        this.glint(_c.x, _c.y, _c.z, 2.2, 0.04);
        this.call.ring(e.x, 0.9, e.z, 1.6, undefined, 0.4);
        this.call.feathersAt(_c.x, _c.y + 0.2, _c.z, 8);
        this.onShake?.(0.12, 0.1);
      } else {
        // two quick talon slashes crossed
        this.stroke(_c, -0.4 * side * Z, 0.35 * Z, 0.4 * side * Z, -0.3 * Z, 0.08 * side * Z, 0.14, HAWK, 0.32, 0.06);
        this.stroke(_c, -0.35 * side * Z, -0.25 * Z, 0.35 * side * Z, 0.32 * Z, -0.07 * side * Z, 0.12, HAWK, 0.32, 0.06, 0.04);
        this.glint(_c.x, _c.y, _c.z, 1.3, 0.04);
        if (r() < 0.6) this.call.feathersAt(_c.x, _c.y + 0.15, _c.z, 2);
      }
    } else {
      // the fang snap: an upper and a lower crescent closing on the prey (each drifts toward the middle)
      const S = (big ? 1.5 : 1) * Z, w = big ? 0.26 : 0.19;
      const up = _d1.copy(_u).multiplyScalar(-0.28 * S), dn = _d2.copy(_u).multiplyScalar(0.28 * S);
      this.stroke(_c, -0.42 * S, 0.3 * S, 0.42 * S, 0.3 * S, 0.2 * S, w, WOLF, 0.36, 0.06, 0, up);
      this.stroke(_c, -0.38 * S, -0.3 * S, 0.38 * S, -0.3 * S, -0.18 * S, w, WOLF, 0.36, 0.06, 0.015, dn);
      this.glint(_c.x, _c.y, _c.z, big ? 2.0 : 1.4, 0.08);
      if (big) {
        // the pounce lands: dust thrown out round the prey
        for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + r() * 0.4; this.call.dust(e.x + Math.cos(a) * 0.35, 0.12, e.z + Math.sin(a) * 0.35, Math.cos(a) * 1.5, 0.35, Math.sin(a) * 1.5, 0.65, 0.5); }
        this.onShake?.(0.14, 0.12);
      }
    }
    return true;
  }
  /** The bear's Sic 'Em roar (companionPounce with roar: its taunt radius): sound rings out to that radius. */
  roar(x, z, R) {
    for (let i = 0; i < 3; i++) this.call.ring(x, 0.06, z, R, ROAR, 0.55, i * 0.13);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + this.rnd() * 0.3; this.call.dust(x + Math.cos(a) * 0.6, 0.12, z + Math.sin(a) * 0.6, Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2, 0.9, 0.6); }
    this.onShake?.(0.22, 0.2);
  }

  update(dt) {
    this.core.begin(); this.glow.begin();
    const P = this.pts, n = P.length;
    for (const s of this.strokes) {
      if (s.t >= s.life) continue;
      s.t += dt; if (s.t < 0) continue;
      // the head runs out over grow, then the tail follows it out over the rest; the whole fades at the end
      const head = Math.min(1, s.t / s.grow), tail = Math.max(0, (s.t - s.grow * 0.8) / (s.life - s.grow * 0.8)) ** 1.5;
      if (head - tail < 0.02) continue;
      const k = Math.min(1, s.t / s.life), dk = Math.min(1, s.t / 0.12);
      for (let i = 0; i < n; i++) {
        const u = tail + (head - tail) * (i / (n - 1)), v = 1 - u;
        P[i].set(v * v * s.a.x + 2 * v * u * s.c.x + u * u * s.b.x, v * v * s.a.y + 2 * v * u * s.c.y + u * u * s.b.y, v * v * s.a.z + 2 * v * u * s.c.z + u * u * s.b.z).addScaledVector(s.da, dk);
      }
      const a = 1 - Math.max(0, (k - 0.6) / 0.4);
      sw = s.w * (1 - 0.3 * k); this.glow.strip(P, slashGlowW, 0.75 * a, s.look.glow); this.core.strip(P, slashW, a, s.look.core);
    }
    this.core.end(); this.glow.end();
    for (const g of this.glints) {
      if (g.t >= g.life) { g.s.visible = false; continue; }
      g.t += dt; g.s.visible = g.t >= 0; if (!g.s.visible) continue;
      const u = g.t / g.life; g.s.scale.setScalar(g.size * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.1))); g.s.material.rotation = u * 1.2; g.s.material.opacity = 1 - u * 0.5;
    }
  }
  clear() { for (const s of this.strokes) s.t = 9; for (const g of this.glints) { g.t = 9; g.s.visible = false; } }
}
