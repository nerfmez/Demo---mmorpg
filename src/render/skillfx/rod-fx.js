// Lightning Rod (the trapper's lightning trap, 2026-10-31; core: frontier-content.js springTrap/tickTrap,
// events trapSprung, trapRelay, trapZap, areaEnd). A made object first, then Chain Spark's lightning (`zig`,
// CRACKLE_FS: few straight segments, hard kinks, a white crackling core in a blue glow, re-jagged 15 times a
// second), never pictures. Not Chain Spark's hop from body to body: every bolt leaves the rod's tip.
//   raise (trapSprung): an iron rod wound with copper coils and a copper ball on top punches up out of the
//     plate with an overshoot; a burst of short arcs round the ball, a glint, a cold light;
//   relay (trapRelay): a long bolt from the ball to each of our traps it sets off, a glint where it lands;
//   stand (its zap life): small arcs keep crackling off the ball and its glow breathes;
//   zap (trapZap): a bolt from the ball down into the monster it strikes (the director adds the glint and
//     sparks on the body);
//   end (areaEnd): the rod sinks back into the ground.
// Cosmetic only; pooled (3 rods), no per-frame allocation.
import * as THREE from 'three';
import { Ribbon, lookOf, addLight, place } from './fx-common.js';
import { CRACKLE_FS, BOLT_GLOW_FS, Rng, zig, rewindPts } from './chain-fx.js';
import { lightSprite, glowTexture, starTexture } from './light-kit.js';
import { toon, outlineMaterial } from '../toon.js';

const LOOK = lookOf('lightning');
const RODS = 3, BOLTS = 12, HEIGHT = 1.7;
const RISE = 0.12, SINK = 0.3, BOLT_HOLD = 0.12, BOLT_FADE = 0.1;
const IRON = '#4a4f5a', COPPER = '#c97a3a', EDGE = '#262a33';
const R = new Rng(), R2 = new Rng();
let sw = 0, swk = null;
const boltW = (x, k) => sw * swk[k] * Math.min(1, x * 8, (1 - x) * 8), boltGlowW = (x, k) => sw * 2.6 * (0.5 + 0.5 * swk[k]);
const easeBack = (k) => { const c = 2.2; k -= 1; return 1 + (c + 1) * k * k * k + c * k * k; };

export class RodFx {
  constructor(scene, camera) {
    this.time = 0;
    this.core = new Ribbon(scene, camera, 2400, CRACKLE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 2400, BOLT_GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    // the rod: an iron pole (origin at its foot, 1 m tall, scaled to HEIGHT), copper coils, a copper ball
    const pole = new THREE.CylinderGeometry(0.045, 0.07, 1, 8).translate(0, 0.5, 0), coil = new THREE.TorusGeometry(0.085, 0.022, 5, 14).rotateX(Math.PI / 2), ball = new THREE.SphereGeometry(0.11, 12, 9), foot = new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10);
    for (const g of [pole, coil, ball, foot]) g.userData.shared = true;
    const edge = outlineMaterial(EDGE, 0.02);
    this.rods = Array.from({ length: RODS }, () => {
      const g = new THREE.Group(), add = (geo, color, y) => { const m = new THREE.Mesh(geo, toon(color)); m.position.y = y; m.add(new THREE.Mesh(geo, edge)); g.add(m); return m; };
      const body = new THREE.Group(); g.add(body);
      const addB = (geo, color, y) => { const m = new THREE.Mesh(geo, toon(color)); m.position.y = y; m.add(new THREE.Mesh(geo, edge)); body.add(m); return m; };
      add(foot, IRON, 0.04);
      addB(pole, IRON, 0); for (const y of [0.62, 0.72, 0.82]) addB(coil, COPPER, y);
      const top = addB(ball, COPPER, 1.0); top.scale.y = 1; // kept round: the body's y scale is undone below
      g.visible = false; scene.add(g);
      return { g, body, top, glow: lightSprite(scene, glowTexture('lightning'), true, 9), id: 0, t: 99, x: 0, z: 0, end: -1, nextArc: 0, tip: new THREE.Vector3() };
    });
    this.bolts = Array.from({ length: BOLTS }, () => ({ rod: null, to: new THREE.Vector3(), t: 99, seed: 0, w: 0.06, amp: 0.12, segs: 6, hold: BOLT_HOLD }));
    this.boltI = 0;
    this.glints = Array.from({ length: 6 }, () => ({ s: lightSprite(scene, starTexture('lightning'), false, 10), p: new THREE.Vector3(), t: 99, size: 0.6 })); this.glintI = 0;
    this.light = addLight(scene, new THREE.PointLight('#9fd0ff', 0, 7, 1.6)); this.lightT = 9;
    this.pts = []; this.ws = []; this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
  }
  rodOf(id) { return this.rods.find((r) => r.id === id && r.t < 90); }
  /** The rules' trapSprung of a Lightning Rod at (x, z). */
  raise(e) {
    const r = this.rods.find((q) => q.t >= 90) || this.rods[0];
    Object.assign(r, { id: e.id, t: 0, x: e.x, z: e.z, end: -1, nextArc: 0 });
    r.g.visible = true; place(r.g, e.x, 0, e.z); r.g.rotation.y = this.time * 3.7;
    for (let i = 0; i < 5; i++) this.arc(r, 0.5 + i * 0.05, 0.25);
    this.glint(e.x, HEIGHT + 0.1, e.z, 1.1);
    place(this.light, e.x, HEIGHT, e.z); this.lightT = 0;
  }
  /** The rules' trapRelay: a long bolt from the rod's ball to the trap it sets off at (tx, tz). */
  relay(e) {
    const r = this.rodOf(e.id); if (!r) return;
    this.bolt(r, this.a.set(e.tx, 0.35, e.tz), 0.12, 0.1, 7, 0.22);
    this.glint(e.tx, 0.5, e.tz, 0.9);
  }
  /** The rules' trapZap: a bolt from the ball into the struck body (its centre c, ground-relative). */
  zap(e, c) {
    const r = this.rodOf(e.id); if (!r || !c) return;
    this.bolt(r, c, 0.1, 0.12, 6, BOLT_HOLD);
    place(this.light, r.x, HEIGHT, r.z); this.lightT = 0.1;
  }
  /** The rules' areaEnd of the rod's area: it sinks back. */
  end(id) { const r = this.rodOf(id); if (r && r.end < 0) r.end = r.t; }
  bolt(r, to, w, amp, segs, hold) {
    const b = this.bolts[this.boltI++ % BOLTS];
    Object.assign(b, { rod: r, t: 0, seed: (this.time * 997) | 0, w, amp, segs, hold }); b.to.copy(to);
  }
  // a short arc off the ball to a point round it (hold s)
  arc(r, len, hold) {
    const a = Math.random() * 6.283, d = len * (0.6 + Math.random() * 0.6);
    this.bolt(r, this.b.set(r.x + Math.cos(a) * d, HEIGHT + 0.1 + (Math.random() - 0.6) * len, r.z + Math.sin(a) * d), 0.05, 0.22, 4, hold);
  }
  glint(x, y, z, size) { const g = this.glints[this.glintI++ % this.glints.length]; g.p.set(x, y, z); g.t = 0; g.size = size; }

  update(dt) {
    this.time += dt;
    rewindPts(); this.core.begin(); this.glow.begin();
    for (const r of this.rods) {
      if (r.t >= 90) continue;
      r.t += dt;
      // up out of the plate with an overshoot; at its end, back down into the ground
      const up = easeBack(Math.min(1, r.t / RISE)), down = r.end < 0 ? 0 : Math.min(1, (r.t - r.end) / SINK), h = Math.max(0.001, up * (1 - down));
      r.body.scale.set(1, HEIGHT * h, 1); r.top.scale.set(1, 1 / (HEIGHT * h), 1);
      r.tip.set(r.x, HEIGHT * h + 0.1, r.z);
      // the ball's glow breathes, and small arcs keep crackling off it while it stands
      r.glow.visible = down < 1; place(r.glow, r.tip.x, r.tip.y, r.tip.z); r.glow.scale.setScalar((0.55 + 0.12 * Math.sin(this.time * 23 + r.x)) * h); r.glow.material.opacity = 0.8 * (1 - down);
      if (r.end < 0 && r.t > RISE && this.time >= r.nextArc) { this.arc(r, 0.5, 0.08); r.nextArc = this.time + 0.18 + Math.random() * 0.2; }
      if (down >= 1) { r.t = 99; r.g.visible = false; r.glow.visible = false; }
    }
    // the bolts: from the rod's ball (where it is now) to their end, re-jagged 15 times a second
    const flick = Math.floor(this.time * 15);
    for (const b of this.bolts) {
      if (b.t >= b.hold + BOLT_FADE || !b.rod || b.rod.t >= 90) continue;
      b.t += dt;
      const alpha = b.t < b.hold ? 1 : Math.max(0, 1 - (b.t - b.hold) / BOLT_FADE);
      zig(b.rod.tip, b.to, R, b.seed + flick * 7, b.amp, b.segs, this.pts, this.ws);
      sw = b.w; swk = this.ws;
      this.glow.strip(this.pts, boltGlowW, alpha, LOOK.glow); this.core.strip(this.pts, boltW, alpha, LOOK.edge);
    }
    this.core.end(); this.glow.end();
    for (const g of this.glints) {
      const k = g.t / 0.3; g.s.visible = k < 1; if (!g.s.visible) continue;
      g.t += dt; place(g.s, g.p.x, g.p.y, g.p.z); g.s.scale.setScalar(g.size * Math.sin(Math.PI * Math.min(1, k))); g.s.material.rotation = k * 1.4;
    }
    if (this.lightT < 0.4) { this.lightT += dt; this.light.intensity = 4 * (1 - this.lightT / 0.4); } else this.light.intensity = 0;
  }
  clear() {
    for (const r of this.rods) { r.t = 99; r.g.visible = false; r.glow.visible = false; }
    for (const b of this.bolts) b.t = 99; for (const g of this.glints) { g.t = 99; g.s.visible = false; }
    this.light.intensity = 0;
  }
}
