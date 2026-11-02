// The hunter's companions' strikes (owner, 2026-11-01: "no attack effect at all, and every Sic 'Em is the same
// daze"). Each animal's hit is drawn as its own weapon, lines and light on the game camera's plane (camera
// right and up at the hit), never pictures; the dust, feathers and rings come from the call effect
// (skillfx/call-fx.js) so the companions share one look:
//   wolf (allyStrike kind hunt_hound / pack_hound): a bite (skillfx/bite-fx.js, built from outside references
//     after the owner turned down crescents, line fangs and a jaw trail): a solid jaw of teeth opens wide over
//     the prey and slams shut; as it shuts, a white star flash, lines bursting out and a short shake; sent in
//     (Sic 'Em: the pounce, which stuns) it is bigger and the landing throws a ring of dust;
//   bear: three claw marks of see-through light (skillfx/claw-fx.js, like the bite) raked diagonally across
//     the prey with a warm red halo, a dust puff and a short shake;
//     its Sic 'Em roar (companionPounce with roar) sends three warm sound rings out to the taunt's true
//     radius on the ground, dust round the bear and a hard shake;
//   eagle: two talon marks of light crossed (pale blue halo) and a puff of feathers; its Sic 'Em dive (bleed and a hard
//     flinch) tears three deep red gashes, a ring of air and a burst of feathers.
// Cosmetic only; pooled (one ribbon pair, one glint pool), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, lightSprite, starTexture } from './light-kit.js';
import { BiteFx, BITE_SHUT } from './bite-fx.js';
import { ClawFx } from './claw-fx.js';
import { SicFx } from './sic-fx.js';
import { AssaultFx } from './assault-fx.js';
import { PackFx } from './pack-fx.js';

const STROKES = 36, GLINTS = 6;
const WOLF = { core: [1.0, 0.97, 0.9], glow: [1.0, 0.72, 0.42] };
const ROAR = new THREE.Color(1.0, 0.62, 0.3);
const BEAR_HALO = new THREE.Color('#ff5a2a'), BEAR_RIM = new THREE.Color('#ffe6c8');
const HAWK_HALO = new THREE.Color('#7fb6ff'), HAWK_RIM = new THREE.Color('#eef6ff');
const GASH_HALO = new THREE.Color('#ff2a2a'), GASH_RIM = new THREE.Color('#ffd0c8');
const HEIGHT = { hunt_hound: 0.6, pack_hound: 0.5, hunt_bear: 0.9, hunt_hawk: 0.8 };
let sw = 0;
const rushW = (x) => sw * (1 - x), rushGlowW = (x) => sw * 2.4 * (1 - x);
const slashW = (x) => sw * Math.pow(Math.sin(Math.PI * x), 0.8), slashGlowW = (x) => sw * 2.6 * Math.sin(Math.PI * x);
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();

export class CompanionFx {
  /** call: the CallFx whose dust, feathers and rings these share. */
  constructor(scene, camera, call) {
    this.camera = camera; this.call = call; this.rnd = mulberry32(83); this.onShake = null;
    this.biteFx = new BiteFx(scene, camera); // the wolf's jaw of teeth
    this.clawFx = new ClawFx(scene, camera); // the bear's and the eagle's claw marks of light
    this.assault = new AssaultFx(scene, camera, this); // the summoner's Assault: the blue charge marker, the rush, the knocks
    this.sic = new SicFx(scene, camera, this); // Sic 'Em: the marker over the prey, the lock, the rush
    this.pack = new PackFx(scene, camera, this); // Pack Hunt: the howl and the frenzy aura
    this.core = new Ribbon(scene, camera, 700, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 700, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 11; this.glow.mesh.renderOrder = 10;
    this.core.mesh.material.depthTest = false; this.glow.mesh.material.depthTest = false; // marks over the prey's body, as hit marks are drawn
    // a stroke: a quadratic curve a -> b over control c, drawn from its head (grows over `grow`) to its tail
    this.strokes = Array.from({ length: STROKES }, () => ({ t: 9, life: 0.3, grow: 0.06, delay: 0, w: 0.08, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), da: new THREE.Vector3(), db: new THREE.Vector3(), look: WOLF }));
    this.strokeI = 0;
    this.glints = Array.from({ length: GLINTS }, () => ({ s: lightSprite(scene, starTexture('steel'), true, 12), t: 9, life: 0.18, size: 0.8, delay: 0 }));
    for (const g of this.glints) g.s.material.depthTest = false;
    this.glintI = 0;
    this.pts = Array.from({ length: 10 }, () => new THREE.Vector3()); this.rushPts = Array.from({ length: 8 }, () => new THREE.Vector3());
  }
  upAxis() { return _u; } // the camera's up as last read by axes()
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
    // a summoner's spirit sent in by Assault: its charged hit knocks the target back (skillfx/assault-fx.js); the
    // spirit's own strike look still draws (the view's)
    if (e.sic && !HEIGHT[k]) { this.assault.strike(e); return false; }
    if (!HEIGHT[k]) return false;
    this.axes();
    const big = e.sic ? 1 : 0, r = this.rnd;
    // the hit point: on the prey's near side, at the body's height
    const ang = Math.atan2(e.x - e.fromX, e.z - e.fromZ), near = 0.3;
    _c.set(e.x - Math.sin(ang) * near, HEIGHT[k] + (k === 'hunt_hawk' ? 0 : 0.1 * big), e.z - Math.cos(ang) * near);
    const side = Math.sin(ang) * _r.x + Math.cos(ang) * _r.z >= 0 ? 1 : -1; // which way across the screen it struck
    if (k === 'hunt_bear') {
      // three claw marks of light (skillfx/claw-fx.js) raked down and across the prey, the far claw a beat behind
      this.rake(_c, side, 3, big ? 0.9 : 0.75, 1.15, 0.32, BEAR_HALO, BEAR_RIM, 0.02);
      this.glint(_c.x, _c.y, _c.z, big ? 1.3 : 0.95, 0.05);
      this.call.dust(e.x, 0.15, e.z, Math.sin(ang) * 1.2, 0.4, Math.cos(ang) * 1.2, 0.7, 0.45);
      this.onShake?.(big ? 0.14 : 0.06, 0.1);
    } else if (k === 'hunt_hawk') {
      if (big) {
        // the dive's three deep red gashes (it bleeds), a ring of air, a burst of feathers
        this.rake(_c, side, 3, 0.8, 1.0, 0.28, GASH_HALO, GASH_RIM, 0.02);
        this.glint(_c.x, _c.y, _c.z, 1.3, 0.04);
        this.call.ring(e.x, 0.9, e.z, 1.6, undefined, 0.4);
        this.call.feathersAt(_c.x, _c.y + 0.2, _c.z, 8);
        this.onShake?.(0.12, 0.1);
      } else {
        // two quick talon slashes crossed
        this.clawFx.mark(_c.x, _c.y, _c.z, 0.6, 0.85, side > 0 ? -0.75 : -Math.PI + 0.75, 1, HAWK_HALO, HAWK_RIM, 0, 0.3);
        this.clawFx.mark(_c.x, _c.y, _c.z, 0.55, 0.8, side > 0 ? 0.75 : Math.PI - 0.75, -1, HAWK_HALO, HAWK_RIM, 0.04, 0.3);
        this.glint(_c.x, _c.y, _c.z, 0.8, 0.04);
        if (r() < 0.6) this.call.feathersAt(_c.x, _c.y + 0.15, _c.z, 2);
      }
    } else {
      // the bite (skillfx/bite-fx.js): a solid jaw opens wide over the prey and slams shut on it; as the teeth
      // meet, the impact: a white star flash, lines bursting out from the bite, a few chips, a short shake
      const size = (big ? 0.56 : 0.42);
      this.biteFx.bite(_c.x, _c.y + 0.05, _c.z, size, -0.18 * side);
      this.glint(_c.x, _c.y, _c.z, big ? 1.2 : 0.85, BITE_SHUT);
      const n = big ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + r() * 0.3, cx = Math.cos(a), cy = Math.sin(a), r0 = size * (0.75 + r() * 0.15), r1 = size * (1.25 + r() * 0.35);
        _d1.copy(_r).multiplyScalar(cx * size * 0.4).addScaledVector(_u, cy * size * 0.4);
        this.stroke(_c, cx * r0, cy * r0, cx * r1, cy * r1, 0, big ? 0.045 : 0.035, WOLF, 0.16, 0.035, BITE_SHUT, _d1);
      }
      this.onShake?.(big ? 0.1 : 0.05, 0.08);
      if (big) {
        // the pounce lands: dust thrown out round the prey
        for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + r() * 0.4; this.call.dust(e.x + Math.cos(a) * 0.35, 0.12, e.z + Math.sin(a) * 0.35, Math.cos(a) * 1.5, 0.35, Math.sin(a) * 1.5, 0.65, 0.5); }
        this.onShake?.(0.14, 0.12);
      }
    }
    return true;
  }
  // n parallel claw marks across c, raked down toward the side struck: len their half-length (m), wid their
  // width, gap between them (m), each a beat (stagger s) behind the last
  rake(c, side, n, len, wid, gap, halo, rim, stagger) {
    const a = side > 0 ? -0.95 : -Math.PI + 0.95, px = -Math.sin(a), py = Math.cos(a);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap;
      _d1.copy(c).addScaledVector(_r, px * o).addScaledVector(_u, py * o);
      this.clawFx.mark(_d1.x, _d1.y, _d1.z, len * (1 - Math.abs(i - (n - 1) / 2) * 0.12), wid, a, side, halo, rim, i * stagger, 0.36);
    }
  }
  // a streak of light along a path of points (newest first), set off to one side by off (m): the rush
  rush(path, off, look, core, glow) {
    const P = this.rushPts, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = path[Math.min(path.length - 1, i)], b = path[Math.min(path.length - 1, i + 1)], dx = a.x - b.x, dz = a.z - b.z, L = Math.hypot(dx, dz) || 1;
      P[i].set(a.x - (dz / L) * off, a.y + 0.08 * Math.sign(off), a.z + (dx / L) * off);
    }
    sw = 0.06; glow.strip(P, rushGlowW, 0.5, look.glow); core.strip(P, rushW, 0.7, look.core);
  }
  // a line of light along path (world points), thickest in its middle: a tether, a crescent, a speed line
  line(path, look, core, glow, w, a) { sw = w; glow.strip(path, slashGlowW, 0.75 * a, look.glow); core.strip(path, slashW, a, look.core); }
  /** The bear's Sic 'Em roar (companionPounce with roar: its taunt radius): sound rings out to that radius. */
  roar(x, z, R) {
    for (let i = 0; i < 3; i++) this.call.ring(x, 0.06, z, R, ROAR, 0.55, i * 0.13);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + this.rnd() * 0.3; this.call.dust(x + Math.cos(a) * 0.6, 0.12, z + Math.sin(a) * 0.6, Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2, 0.9, 0.6); }
    this.onShake?.(0.22, 0.2);
  }

  update(dt) {
    this.biteFx.update(dt); this.clawFx.update(dt); this.pack.update(dt);
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
    this.sic.update(dt, this.core, this.glow); this.assault.update(dt, this.core, this.glow);
    this.core.end(); this.glow.end();
    for (const g of this.glints) {
      if (g.t >= g.life) { g.s.visible = false; continue; }
      g.t += dt; g.s.visible = g.t >= 0; if (!g.s.visible) continue;
      const u = g.t / g.life; g.s.scale.setScalar(g.size * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.1))); g.s.material.rotation = u * 1.2; g.s.material.opacity = 1 - u * 0.5;
    }
  }
  clear() { this.biteFx.clear(); this.clawFx.clear(); this.sic.clear(); this.assault.clear(); this.pack.clear(); for (const s of this.strokes) s.t = 9; for (const g of this.glints) { g.t = 9; g.s.visible = false; } }
}
