// Chain of Light (a priest's cooldown spell: a chain of light thrown straight ahead; the struck target is
// all but held still, 85% slower, for 2 s), held to the owner's bar (.claude/skills/skill-vfx), in the
// holy white-gold of Blessing and Holy Bell.
//  - the cast: motes of light gather at the hand;
//  - the throw: a real chain of light runs from the hand to its head (links: small rings of light, each
//    turned a quarter from the last, so it reads as a chain from any side), the head a glowing star in a
//    spinning ring; it pays out as the head flies;
//  - the catch (the rules' 'hit'): a flash and a ring snap on the target, the chain pulls taut, then
//    dissolves link by link from the hand; three loops of chain wind round the target's body, tighten
//    and turn slowly for as long as it stays slowed (its chill), then fall away;
//  - a miss: the chain is drawn back to the hand and fades.
// Positions come from the rules' projectiles, 'hit' events and the target's live chill. The game's
// generic orb is not drawn for it (OWN_PROJECTILES). One ribbon pair, two sprites, pooled sparks.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, drawSparks, spark, lightOf, starTexture, glowTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const LINK_PTS = 9, LINK = 0.42, LINK_W = 0.16, RING = 17, BINDS = 3, LOOP_LINKS = 12, SPARKS = 40;
const TAUT = 0.28, RETRACT = 0.22, FLASH = 0.3, BIND_MAX = 2.4, Y = 1.15;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class LightChainFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(53); this.time = 0;
    this.core = new Ribbon(scene, camera, 4000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 4000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.head = lightSprite(scene, starTexture('holy'), false, 12);
    this.flare = lightSprite(scene, glowTexture('holy'), true, 11);
    this.link = Array.from({ length: LINK_PTS }, () => new THREE.Vector3());
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.side = new THREE.Vector3(); this.upv = new THREE.Vector3(); this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.sparks = []; this.free = [];
    this.id = null; this.live = false; this.state = 'idle'; this.t = 0; this.hand = new THREE.Vector3();
    this.flashT = 9; this.flashAt = new THREE.Vector3();
    this.binds = Array.from({ length: BINDS }, () => ({ id: null, t: 9, end: 9, x: 0, z: 0, h: 1.2, r: 0.5 }));
    this.locate = null; // (id) the live monster (the director sets it)
  }
  // the cast: motes gather at the hand
  gather(hand, dur) {
    const r = this.rnd;
    for (let i = 0; i < 12; i++) {
      const a = r() * 6.283, d = 0.6 + r() * 0.5, life = dur * (0.7 + r() * 0.3);
      this.p.set(hand.x + Math.sin(a) * d, hand.y + (r() - 0.5) * 0.8, hand.z + Math.cos(a) * d);
      this.v.copy(hand).sub(this.p).multiplyScalar(1 / life);
      spark(this.sparks, this.free, SPARKS, this.p, this.v, life, 0.04, LOOK);
    }
  }
  // the hand the chain hangs from, each frame
  follow(hand) { this.hand.copy(hand); }
  syncProjectiles(projectiles, kind) {
    let seen = false;
    for (const pr of projectiles) {
      if (pr.kind !== kind) continue;
      if (pr.id !== this.id) { this.id = pr.id; this.state = 'fly'; this.t = 0; }
      seen = true; this.to.set(pr.x, Y, pr.z);
    }
    if (!seen && this.state === 'fly') { this.state = 'retract'; this.t = 0; } // gone without a catch (a hit turns it taut first)
  }
  // the rules' hit: the target's id and centre
  hit(id, c, radius) {
    this.state = 'taut'; this.t = 0; this.to.set(c.x, Y, c.z);
    this.flashT = 0; this.flashAt.copy(c);
    const b = this.binds.find((q) => q.id === id) || this.binds.find((q) => q.t >= q.end) || this.binds[0];
    b.id = id; b.t = 0; b.end = BIND_MAX; b.x = c.x; b.z = c.z; b.h = c.y; b.r = (radius || 0.5) + 0.25;
    const r = this.rnd;
    for (let i = 0; i < 12; i++) { const a = r() * 6.283, s = 2 + r() * 3; this.p.copy(c); this.v.set(Math.sin(a) * s, 1 + r() * 2, Math.cos(a) * s); spark(this.sparks, this.free, SPARKS, this.p, this.v, 0.3 + r() * 0.2, 0.04, LOOK); }
  }
  // one link: a small ring of light at c along d, its flat across `flat` (a unit vector across d)
  drawLink(c, d, flat, len, wid, al) {
    for (let i = 0; i < LINK_PTS; i++) {
      const a = (i / (LINK_PTS - 1)) * Math.PI * 2;
      this.link[i].copy(c).addScaledVector(d, Math.cos(a) * len * 0.5).addScaledVector(flat, Math.sin(a) * wid * 0.5);
    }
    W.v = 0.05; this.glow.strip(this.link, lineGlowW, 0.55 * al, LOOK.glow); this.core.strip(this.link, lineW, al, LOOK.edge);
  }
  // a chain from a to b: links along it, alternately flat and upright; only links whose place k (0 at a)
  // lies in [k0, k1] are drawn
  drawChain(a, b, al, k0 = 0, k1 = 1, sag = 0) {
    const d = this.dir.subVectors(b, a), len = d.length(); if (len < 0.05) return;
    d.multiplyScalar(1 / len);
    this.side.set(d.z, 0, -d.x).normalize(); this.upv.set(0, 1, 0);
    const n = Math.max(1, Math.floor(len / (LINK * 0.8)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n; if (k < k0 || k > k1) continue;
      this.p.copy(a).addScaledVector(d, len * k); this.p.y -= sag * Math.sin(Math.PI * k);
      this.drawLink(this.p, d, i % 2 ? this.side : this.upv, LINK, LINK_W, al);
    }
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const hand = this.hand;
    if (this.state !== 'idle') {
      this.t += dt;
      if (this.state === 'fly') this.drawChain(hand, this.to, 1, 0, 1, 0.12);
      else if (this.state === 'taut') { // pulled taut, then dissolving from the hand outward
        const k = this.t / TAUT; this.drawChain(hand, this.to, 1 - k * 0.3, k, 1, 0);
        if (k >= 1) this.state = 'idle';
      } else if (this.state === 'retract') { // drawn back to the hand
        const k = this.t / RETRACT; this.p.copy(this.to).lerp(hand, out2(Math.min(1, k))); this.drawChain(hand, this.p, 1 - k, 0, 1, 0.12);
        if (k >= 1) this.state = 'idle';
      }
      // the head: a star in a spinning ring
      this.head.visible = this.state === 'fly';
      if (this.head.visible) {
        this.head.position.copy(this.to); this.head.scale.setScalar(0.7 + 0.08 * Math.sin(this.time * 20)); this.head.material.rotation = this.time * 6;
        circlePoints(this.ring, this.to.x, this.to.z, 0.35, this.to.y);
        W.v = 0.05; this.glow.strip(this.ring, lineGlowW, 0.6, LOOK.glow); this.core.strip(this.ring, lineW, 0.9, LOOK.edge);
      }
    } else this.head.visible = false;
    // the catch's flash and ring
    if (this.flashT < FLASH) {
      this.flashT += dt; const k = this.flashT / FLASH;
      this.flare.visible = true; this.flare.position.copy(this.flashAt); this.flare.scale.setScalar(2.4 * (0.6 + 0.4 * out2(Math.min(1, k * 4)))); this.flare.material.opacity = 1 - k * k;
      circlePoints(this.ring, this.flashAt.x, this.flashAt.z, 0.4 + 1.0 * out2(k), this.flashAt.y);
      W.v = 0.1 * (1 - k); this.glow.strip(this.ring, lineGlowW, 0.7 * (1 - k), LOOK.glow); this.core.strip(this.ring, lineW, 1 - k * k, LOOK.edge);
    } else this.flare.visible = false;
    // the bindings: three loops of chain round the body, tightening, turning, held while it is slowed
    for (const b of this.binds) {
      if (b.t >= b.end) continue;
      b.t += dt;
      const m = this.locate?.(b.id);
      if (m && !m.dead) { b.x = m.x; b.z = m.z; if (!m.statuses?.chill && b.end > b.t + 0.25) b.end = b.t + 0.25; } // freed: fall away
      else if (b.end > b.t + 0.25) b.end = b.t + 0.25;
      const tighten = out2(Math.min(1, b.t / 0.25)), fall = Math.max(0, 1 - (b.end - b.t) / 0.25), al = Math.min(1, b.t * 8) * (1 - fall);
      for (let j = 0; j < 3; j++) {
        const y = b.h * (0.45 + 0.35 * j) - fall * 0.4, rr = b.r * (1.6 - 0.6 * tighten) * (1 + 0.3 * fall), tilt = (j - 1) * 0.18, spin = this.time * (j % 2 ? 0.8 : -0.8) + j;
        for (let i = 0; i < LOOP_LINKS; i++) {
          const a = spin + (i / LOOP_LINKS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          this.p.set(b.x + ca * rr, y + sa * rr * tilt, b.z + sa * rr);
          this.dir.set(-sa, ca * tilt, ca).normalize(); // along the loop
          if (i % 2) this.side.set(ca, 0, sa); else this.side.set(0, 1, 0);
          this.drawLink(this.p, this.dir, this.side, LINK * 0.9, LINK_W * 0.9, al);
        }
      }
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 4);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.state = 'idle'; this.id = null; this.flashT = 9; this.head.visible = false; this.flare.visible = false;
    for (const b of this.binds) b.t = b.end = 9;
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.state !== 'idle' || this.flashT < FLASH || this.binds.some((b) => b.t < b.end) || this.sparks.length > 0; }
}
