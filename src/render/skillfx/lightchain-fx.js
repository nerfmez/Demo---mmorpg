// Chain of Light (a priest's cooldown spell: a chain of light thrown straight ahead; the struck target is
// all but held still, 85% slower, for 2 s), held to the owner's bar (.claude/skills/skill-vfx), in the
// holy white-gold of Blessing and Holy Bell.
//  - the cast: motes of light gather at the hand;
//  - the throw: a real chain of light runs from the hand to its head (links: small rings of light, each
//    turned a quarter from the last, so it reads as a chain from any side) with a sheen running down it,
//    the head a glowing star with a turning cross of rays in a spinning ring; it pays out as the head flies;
//  - the catch (the rules' 'hit'): a flash, a ring and a burst of stars snap on the target, the chain
//    pulls taut, then dissolves link by link from the hand; three loops of chain wind round the target's
//    body, tighten and turn slowly, four chains shoot out from it to rings of light hanging in the air
//    round it (a web holding it still) and a seal (a ring and a star) turns over its head, for as long as
//    it stays slowed (its chill), then all fall away;
//  - a miss: the chain is drawn back to the hand and fades.
// Positions come from the rules' projectiles, 'hit' events and the target's live chill. The game's
// generic orb is not drawn for it (OWN_PROJECTILES). One ribbon pair, two sprites, pooled sparks.
import * as THREE from 'three';
import { Ribbon, mulberry32 } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, drawSparks, spark, lightOf, starTexture, glowTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const LINK_PTS = 9, LINK = 0.42, LINK_W = 0.16, RING = 17, BINDS = 3, LOOP_LINKS = 12, SPARKS = 40, STARS = 12, ANCHORS = 4;
const TAUT = 0.28, RETRACT = 0.22, FLASH = 0.3, BIND_MAX = 2.4, Y = 1.15;
const out2 = (k) => 1 - (1 - k) * (1 - k);

export class LightChainFx {
  constructor(scene, camera) {
    this.rnd = mulberry32(53); this.time = 0;
    this.core = new Ribbon(scene, camera, 9000, CORE_FS, THREE.NormalBlending);
    this.glow = new Ribbon(scene, camera, 9000, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 9; this.glow.mesh.renderOrder = 8;
    this.head = lightSprite(scene, starTexture('holy'), false, 12);
    this.flare = lightSprite(scene, glowTexture('holy'), true, 11);
    const star = starTexture('holy');
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, star, false, 12), p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1, size: 0.4 }));
    this.starI = 0; this.anchor = new THREE.Vector3(); this.body = new THREE.Vector3();
    this.link = Array.from({ length: LINK_PTS }, () => new THREE.Vector3());
    this.ring = Array.from({ length: RING }, () => new THREE.Vector3());
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.side = new THREE.Vector3(); this.upv = new THREE.Vector3(); this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.three = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.sparks = []; this.free = [];
    this.id = null; this.live = false; this.state = 'idle'; this.t = 0; this.hand = new THREE.Vector3();
    this.flashT = 9; this.flashAt = new THREE.Vector3();
    this.binds = Array.from({ length: BINDS }, () => ({ id: null, t: 9, end: 9, x: 0, z: 0, h: 1.2, r: 0.5, seal: lightSprite(scene, star, false, 12) }));
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
    for (let i = 0; i < 8; i++) { // a burst of stars
      const q = this.stars[this.starI++ % STARS], a = (i / 8) * 6.283 + r() * 0.4, sp = 2.5 + r() * 2;
      q.p.copy(c); q.v.set(Math.sin(a) * sp, 0.5 + r() * 1.5, Math.cos(a) * sp); q.t = -r() * 0.05; q.life = 0.45 + r() * 0.25; q.size = 0.35 + r() * 0.3;
    }
  }
  // one link: a small ring of light at c along d, its flat across `flat` (a unit vector across d)
  drawLink(c, d, flat, len, wid, al, w = 0.05) {
    for (let i = 0; i < LINK_PTS; i++) {
      const a = (i / (LINK_PTS - 1)) * Math.PI * 2;
      this.link[i].copy(c).addScaledVector(d, Math.cos(a) * len * 0.5).addScaledVector(flat, Math.sin(a) * wid * 0.5);
    }
    W.v = w; this.glow.strip(this.link, lineGlowW, 0.55 * al, LOOK.glow); this.core.strip(this.link, lineW, al, LOOK.edge);
  }
  // a chain from a to b: links along it, alternately flat and upright; only links whose place k (0 at a)
  // lies in [k0, k1] are drawn; sheen (0..1, or < 0 for none) brightens the links round that place
  drawChain(a, b, al, k0 = 0, k1 = 1, sag = 0, sheen = -1) {
    const d = this.dir.subVectors(b, a), len = d.length(); if (len < 0.05) return;
    d.multiplyScalar(1 / len);
    this.side.set(d.z, 0, -d.x).normalize(); this.upv.set(0, 1, 0);
    const n = Math.max(1, Math.floor(len / (LINK * 0.8)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n; if (k < k0 || k > k1) continue;
      this.p.copy(a).addScaledVector(d, len * k); this.p.y -= sag * Math.sin(Math.PI * k);
      const sh = sheen < 0 ? 0 : Math.max(0, 1 - Math.abs(k - sheen) * 8);
      this.drawLink(this.p, d, i % 2 ? this.side : this.upv, LINK * (1 + 0.15 * sh), LINK_W * (1 + 0.3 * sh), al, 0.05 + 0.04 * sh);
    }
  }
  update(dt) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    const hand = this.hand;
    if (this.state !== 'idle') {
      this.t += dt;
      if (this.state === 'fly') this.drawChain(hand, this.to, 1, 0, 1, 0.12, (this.time * 2.5) % 1);
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
        this.head.position.copy(this.to); this.head.scale.setScalar(1.0 + 0.1 * Math.sin(this.time * 20)); this.head.material.rotation = this.time * 6;
        circlePoints(this.ring, this.to.x, this.to.z, 0.42, this.to.y);
        W.v = 0.06; this.glow.strip(this.ring, lineGlowW, 0.6, LOOK.glow); this.core.strip(this.ring, lineW, 0.9, LOOK.edge);
        for (let i = 0; i < 4; i++) { // a turning cross of rays
          const a = this.time * 4 + (i / 4) * Math.PI * 2;
          this.three[0].set(this.to.x + Math.cos(a) * 0.15, this.to.y + Math.sin(a) * 0.15, this.to.z);
          this.three[2].set(this.to.x + Math.cos(a) * 0.8, this.to.y + Math.sin(a) * 0.8, this.to.z);
          this.three[1].copy(this.three[0]).lerp(this.three[2], 0.5);
          W.v = 0.07; this.glow.strip(this.three, lineGlowW, 0.5, LOOK.glow); this.core.strip(this.three, lineW, 0.8, LOOK.edge);
        }
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
      // the web: four chains out from the body to rings of light hanging in the air round it
      const reach = (0.6 + 1.7 * tighten) * (1 - 0.3 * fall);
      this.body.set(b.x, b.h, b.z);
      for (let j = 0; j < ANCHORS; j++) {
        const a = (j / ANCHORS) * Math.PI * 2 + Math.PI / 4 + b.t * 0.25;
        this.anchor.set(b.x + Math.cos(a) * reach, b.h + 0.4 + 1.2 * tighten - fall * 0.5, b.z + Math.sin(a) * reach);
        this.drawChain(this.body, this.anchor, al, 0.15, 1);
        circlePoints(this.ring, this.anchor.x, this.anchor.z, 0.3, this.anchor.y);
        W.v = 0.06; this.glow.strip(this.ring, lineGlowW, 0.6 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
      }
      // the seal turning over its head
      const sy = b.h + 1.5 + 0.1 * Math.sin(this.time * 3);
      circlePoints(this.ring, b.x, b.z, 0.55 * tighten, sy);
      W.v = 0.07; this.glow.strip(this.ring, lineGlowW, 0.7 * al, LOOK.glow); this.core.strip(this.ring, lineW, al, LOOK.edge);
      b.seal.visible = al > 0.02; b.seal.position.set(b.x, sy, b.z); b.seal.scale.setScalar(0.75 * tighten); b.seal.material.rotation = this.time * 1.5; b.seal.material.opacity = al;
    }
    for (const b of this.binds) if (b.t >= b.end) b.seal.visible = false;
    for (const q of this.stars) { // the catch's stars: pop, twinkle, slow, shrink away
      if (q.t >= q.life) { q.sp.visible = false; continue; }
      q.t += dt; if (q.t < 0) { q.sp.visible = false; continue; }
      const k = q.t / q.life;
      q.v.multiplyScalar(1 - 3 * dt); q.p.addScaledVector(q.v, dt);
      q.sp.visible = true; q.sp.position.copy(q.p); q.sp.scale.setScalar(q.size * Math.min(1, k * 6) * (1 - k * k)); q.sp.material.rotation = q.t * 3;
    }
    drawSparks(this.sparks, this.free, dt, this.core, this.glow, this.three, 4);
    this.core.end(); this.glow.end();
  }
  clear() {
    this.state = 'idle'; this.id = null; this.flashT = 9; this.head.visible = false; this.flare.visible = false;
    for (const b of this.binds) { b.t = b.end = 9; b.seal.visible = false; }
    for (const q of this.stars) { q.t = q.life = 9; q.sp.visible = false; }
    for (const q of this.sparks) this.free.push(q); this.sparks.length = 0;
  }
  get busy() { return this.state !== 'idle' || this.flashT < FLASH || this.binds.some((b) => b.t < b.end) || this.stars.some((q) => q.t < q.life) || this.sparks.length > 0; }
}
