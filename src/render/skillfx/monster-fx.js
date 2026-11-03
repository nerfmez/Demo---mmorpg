// Monster attacks drawn as shapes of light (docs/MONSTER-ATTACKS.md). The owner turned down limb trails for
// monsters; the approved language is the companions' (skillfx/claw-fx.js, bite-fx.js): marks and jaws of
// see-through light on the game camera's plane, in each monster's own colours, plus a charge cue on the body
// part that attacks and a landing on the ground. Kit monsters (data/monsters.json behavior "kit") are drawn here
// by type and attack; anything not listed falls back to the old renderer.
//   leaf fox: snap - a jaw of light shuts on the prey; gust - its leaf tail glows and leaves gather round it
//     through the wind-up, then a cone of leaves of light streams out and cuts (two leaf-red claw marks on the
//     prey); pounce - while it freezes to listen, two arcs of light pulse by its ears; the landing throws
//     leaves up, a ring of dust runs out, and a hit pins the prey under three crossed marks; a miss puffs leaves
//     round its stuck nose.
// Cosmetic only; pooled, no allocation per frame.
import * as THREE from 'three';
import { LeafFx } from './leaf-fx.js';
import { BITE_SHUT } from './bite-fx.js';
import { lightSprite, glowTexture } from './light-kit.js';

const LEAF_HALO = new THREE.Color('#ff5a1e'), LEAF_RIM = new THREE.Color('#ffe2b0');
const PIN_HALO = new THREE.Color('#ff7a2a'), EAR = new THREE.Color('#ffd28a'), EAR_RIM = new THREE.Color('#fff4dc');
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class MonsterFx {
  /** companion: the CompanionFx whose jaw, claw marks and glints these share; call: its dust and rings. */
  constructor(scene, camera, companion, call, host) {
    this.camera = camera; this.companion = companion; this.call = call; this.host = host; this.onShake = null;
    this.leaves = new LeafFx(scene);
    this.cues = []; // live charge cues: { id, kind, t, total, next }
    this.glow = lightSprite(scene, glowTexture('fire'), true, 8);
    this.glow.material.opacity = 0;
    this.glowOn = null;
  }
  rig(id) { return this.host.monsterRig?.(id) || null; }
  bonePos(id, bone, out) { const r = this.rig(id), b = r?.bones?.[bone]; if (!b) return null; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }

  /** A strike reached its contact (core monsterSwing); true when drawn here. */
  swing(e, g) {
    // a strike whose look is 'light' (data/combat-fx.json monsters): claw marks of light raked across the prey
    const look = this.host.vfx?.monsterLook?.(e.type, e.name);
    if (look?.kind === 'light') { if (e.at) this.rake(e, look); return true; }
    if (e.type !== 'leaf_fox') return false;
    if (e.name === 'snap') {
      if (!e.at) return true; // a miss: the snap is in the pose alone
      const size = 0.38;
      this.companion.axes();
      this.companion.biteFx.bite(e.at[0], 0.75, e.at[1], size, Math.sin(e.angle) > 0 ? -0.18 : 0.18);
      this.companion.glint(e.at[0], 0.75, e.at[1], 0.8, BITE_SHUT);
      this.onShake?.(0.05, 0.08);
      return true;
    }
    if (e.name === 'gust') {
      // the leaves stream out of the whipped tail across the cone, at the height of the fox's back
      const t = this.bonePos(e.id, 'tail', _v) || _v.set(e.x, 0.9, e.z);
      const arc = (e.arc * Math.PI) / 180;
      this.leaves.cone(t.x, Math.max(0.6, t.y - 0.1), t.z, e.angle, arc, e.range, 18);
      if (e.at) {
        // the leaves arrive and cut: two leaf-red marks across the prey, a beat after they leave the tail
        const d = Math.hypot(e.at[0] - e.x, e.at[1] - e.z), delay = Math.min(0.2, d / (e.range * 2.4));
        this.companion.axes();
        this.companion.clawFx.mark(e.at[0], 0.9, e.at[1], 0.55, 0.9, -0.7, 1, LEAF_HALO, LEAF_RIM, delay, 0.32);
        this.companion.clawFx.mark(e.at[0], 0.75, e.at[1], 0.5, 0.85, -0.45, -1, LEAF_HALO, LEAF_RIM, delay + 0.05, 0.32);
      }
      this.endCue(e.id);
      return true;
    }
    return false;
  }

  rake(e, look) {
    const c = this.colors(look);
    this.companion.axes();
    _v.set(e.at[0], look.height ?? 0.8, e.at[1]);
    const side = Math.sin(e.angle) * this.camRightX() + Math.cos(e.angle) * this.camRightZ() >= 0 ? 1 : -1;
    this.companion.rake(_v, side, look.marks || 3, look.len || 0.6, look.wid || 1, look.gap || 0.28, c.halo, c.rim, 0.02);
    this.companion.glint(_v.x, _v.y, _v.z, 0.8 * (look.len || 0.6) / 0.6, 0.04);
    this.onShake?.(look.shake ?? 0.05, 0.08);
  }
  camRightX() { return this.camera.matrixWorld.elements[0]; }
  camRightZ() { return this.camera.matrixWorld.elements[2]; }
  colors(look) {
    this.colorCache ??= new Map();
    let c = this.colorCache.get(look);
    if (!c) this.colorCache.set(look, (c = { halo: new THREE.Color(look.halo || '#ff6a3a'), rim: new THREE.Color(look.rim || '#fff6e8') }));
    return c;
  }

  /** A wind-up began: start its charge cue. */
  windup(e, g) {
    const m = g.monsterById?.(e.id);
    if (m?.type !== 'leaf_fox') return;
    if (e.name === 'gust' || e.name === 'pounce') this.cues.push({ id: e.id, kind: e.name, t: 0, total: e.total, next: 0 });
  }

  /** A marked area went off (core burst with its source monster). */
  burst(e, g) {
    const m = e.source != null ? g.monsterById?.(e.source) : null;
    if (m?.type !== 'leaf_fox' || e.attack !== 'pounce') return;
    const y = this.host.groundAt?.(e.x, e.z) ?? 0;
    this.leaves.burst(e.x, y, e.z, 14, 3.6);
    this.call.ring(e.x, y + 0.1, e.z, e.radius * 1.4, undefined, 0.4);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.call.dust(e.x + Math.cos(a) * 0.4, y + 0.12, e.z + Math.sin(a) * 0.4, Math.cos(a) * 1.6, 0.35, Math.sin(a) * 1.6, 0.6, 0.45); }
    const p = g.player;
    if (!p.dead && Math.hypot(p.x - e.x, p.z - e.z) <= e.radius + (p.r || 0.4)) {
      // pinned: three marks crossed down over the prey
      this.companion.axes();
      for (let i = 0; i < 3; i++) this.companion.clawFx.mark(p.x, 0.85 - i * 0.05, p.z, 0.55, 1.0, -1.15 + i * 0.32, i % 2 ? -1 : 1, PIN_HALO, LEAF_RIM, i * 0.03, 0.36);
      this.companion.glint(p.x, 0.85, p.z, 1.1, 0.02);
    }
    this.onShake?.(0.09, 0.1);
  }

  /** A monster was stunned (core stunned; e.miss names the attack that missed). */
  stunned(e) {
    if (e.miss !== 'pounce') return;
    const n = this.bonePos(e.id, 'head', _v);
    if (n) this.leaves.burst(n.x, Math.max(0, n.y - 0.5), n.z, 8, 1.6);
  }

  endCue(id) { for (const c of this.cues) if (c.id === id) c.t = c.total + 1; }

  update(dt, g) {
    this.leaves.update(dt);
    let glowAt = null, glowK = 0;
    let live = 0;
    for (const c of this.cues) {
      c.t += dt;
      const m = g.monsterById?.(c.id);
      if (!m || m.dead || m.state !== 'windup' || c.t > c.total + 0.05) continue;
      this.cues[live++] = c;
      const k = Math.min(1, c.t / c.total);
      if (c.kind === 'gust') {
        // the leaf tail warms with light and leaves gather round it, faster as it nears the whip
        const t = this.bonePos(c.id, 'tail', _w);
        if (!t) continue;
        glowAt = t; glowK = k;
        c.next -= dt;
        if (c.next <= 0) { c.next = 0.09 - 0.05 * k; this.leaves.orbit(t.x, t.y + 0.1, t.z, 0.35 + 0.15 * k, 7 + 6 * k, 0.4, 0.22); }
      } else if (c.kind === 'pounce') {
        // listening: two little arcs of light pulse by its ears through the frozen part of the wind-up
        c.next -= dt;
        if (k > 0.3 && k < 0.85 && c.next <= 0) {
          c.next = 0.22;
          const h = this.bonePos(c.id, 'head', _w);
          if (h) {
            this.companion.axes();
            this.companion.clawFx.mark(h.x, h.y + 0.45, h.z, 0.16, 0.55, 1.2, 1, EAR, EAR_RIM, 0, 0.2, 0.8);
            this.companion.clawFx.mark(h.x, h.y + 0.45, h.z, 0.16, 0.55, -1.2, -1, EAR, EAR_RIM, 0, 0.2, 0.8);
          }
        }
      }
    }
    this.cues.length = live;
    if (glowAt) { this.glow.position.copy(glowAt); this.glow.scale.setScalar(1.2 + 0.8 * glowK); this.glow.material.opacity = 0.25 + 0.45 * glowK; this.glow.visible = true; }
    else if (this.glow.visible) { this.glow.material.opacity *= Math.exp(-dt * 18); if (this.glow.material.opacity < 0.02) this.glow.visible = false; }
  }
  clear() { this.leaves.clear(); this.cues.length = 0; this.glow.visible = false; }
}
