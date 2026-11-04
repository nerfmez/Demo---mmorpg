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
import { BubbleFx } from './bubble-fx.js';
import { BITE_SHUT } from './bite-fx.js';
import { lightSprite, glowTexture } from './light-kit.js';

const LEAF_HALO = new THREE.Color('#ff5a1e'), LEAF_RIM = new THREE.Color('#ffe2b0');
// the tanuki's own colours: the drum's warm gold sound, its green head-leaf, its transformation smoke
const DRUM = new THREE.Color('#ffc860'), DRUM_CORE = { core: [1.0, 0.95, 0.8], glow: [1.0, 0.72, 0.3] };
const HEAD_LEAF = new THREE.Color('#5ad04a'), HEAD_LEAF_RIM = new THREE.Color('#eaffd8');
const SLIME_HALO = new THREE.Color('#e0447a'), PEARL = 0xffe6a0;
const WATER_HALO = new THREE.Color('#5cc8ff');
const STONE_HALO = new THREE.Color('#e0b070'), STONE_RIM = new THREE.Color('#fff4dc'), DUST = 0xc8b48a;
// each monster's own contact look (owner, 2026-11-04: "why do they have the same effects"): claw marks only for
// real claws; a blunt blow is a burst star, a slap of water a crown splash, the clam's blast bubbles, the
// king's frill a slime splat
const STONE = { core: [1.0, 0.96, 0.86], glow: [0.95, 0.66, 0.3] };
const WATER = { core: [0.93, 0.99, 1.0], glow: [0.3, 0.72, 1.0] };
const SLIME = { core: [1.0, 0.86, 0.92], glow: [0.95, 0.22, 0.5] };
const PIN_HALO = new THREE.Color('#ff7a2a'), EAR = new THREE.Color('#ffd28a'), EAR_RIM = new THREE.Color('#fff4dc');
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
// monster shots drawn here (the View skips them, skill-fx.js OWN_PROJECTILES): colour, width and length of the shape,
// how often it sheds a droplet or sparkle, and that trail's colour
const SHOT_LOOKS = {
  jet: { color: 0x9fe6ff, w: 1, l: 3, drops: 0.6, trail: 0xbff0ff },
  volley: { color: 0x6ae8d4, w: 0.45, l: 2.6, drops: 0.35, trail: 0xe0ccff },
  snipe: { color: 0xfff2f8, w: 0.95, l: 1.6, drops: 0.7, trail: 0xffd8ec },
};
const SHOTS = {};

export class MonsterFx {
  /** companion: the CompanionFx whose jaw, claw marks and glints these share; call: its dust and rings. */
  constructor(scene, camera, companion, call, host) {
    this.camera = camera; this.companion = companion; this.call = call; this.host = host; this.onShake = null;
    this.leaves = new LeafFx(scene);
    // the clam's bubbles burst into a few droplets
    this.bubbles = new BubbleFx(scene, (x, y, z, size) => {
      const fx = this.host.vfx?.fx;
      if (fx) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + Math.random(); fx.add(x, y, z, Math.sin(a) * 1.4, 0.6, Math.cos(a) * 1.4, { color: 0xe8fbff, size: 0.08 + size * 0.15, sizeEnd: 0.02, life: 0.22, drag: 3 }); }
    });
    this.cues = []; // live charge cues: { id, kind, t, total, next }
    this.glow = lightSprite(scene, glowTexture('fire'), true, 8);
    this.glow.material.opacity = 0;
    this.glowOn = null;
    // the pearl fish's jet: a water slug stretched along its flight, its head swelling as it nears (an archerfish's)
    const slugMat = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    slugMat.userData.shared = true;
    this.slugGeo = new THREE.SphereGeometry(0.16, 10, 8); this.slugGeo.userData.shared = true;
    this.slugs = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(this.slugGeo, slugMat); m.visible = false; m.renderOrder = 9; scene.add(m); return m; });
    for (const [kind, c] of Object.entries(SHOT_LOOKS)) {
      const mat = new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      mat.userData.shared = true;
      SHOTS[kind] = { ...c, mat };
    }
    this.slugs.push(...Array.from({ length: 4 }, () => { const m = new THREE.Mesh(this.slugGeo, slugMat); m.visible = false; m.renderOrder = 9; scene.add(m); return m; }));
    // the snail king's pearl beam: a long plane of golden light with a hot core, swept with the monster's facing
    const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); beamGeo.userData.shared = true;
    const beamMat = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); return m; };
    this.beam = { glow: new THREE.Mesh(beamGeo, beamMat(0xffc860, 0.5)), core: new THREE.Mesh(beamGeo, beamMat(0xfff6dc, 0.9)), id: null };
    for (const m of [this.beam.glow, this.beam.core]) { m.visible = false; m.renderOrder = 10; scene.add(m); }
    this.splashes = new Set(); // flop landings already drawn (area ids)
    this.rings = new Set(); // drum rings already drawn (area ids)
    this.spinLeaf = -1; // the leaf instance riding a boomerang
  }
  rig(id) { return this.host.monsterRig?.(id) || null; }
  bonePos(id, bone, out) { const r = this.rig(id), b = r?.bones?.[bone]; if (!b) return null; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }

  /** A strike reached its contact (core monsterSwing); true when drawn here. */
  swing(e, g) {
    // a strike whose look is 'light' (data/combat-fx.json monsters): claw marks of light raked across the prey
    const look = this.host.vfx?.monsterLook?.(e.type, e.name);
    if (look?.kind === 'light') { if (e.at) this.rake(e, look); return true; }
    if (e.type === 'stone_pangolin') return this.pangolinSwing(e);
    if (e.type === 'pearl_snail_king' && e.name === 'crush') {
      // the frill slaps down: slime thrown along its edge, and a splat of slime on what it hits
      const fx = this.host.vfx?.fx, arc = (e.arc * Math.PI) / 180, y = this.host.groundAt?.(e.x, e.z) ?? 0;
      if (fx) for (let i = 0; i < 18; i++) { const a = e.angle + (i / 17 - 0.5) * arc, R = e.range * 0.9; fx.add(e.x + Math.sin(a) * R, y + 0.3, e.z + Math.cos(a) * R, Math.sin(a) * 2, 1.5 + Math.random() * 1.5, Math.cos(a) * 2, { color: i % 2 ? 0xe0447a : 0xffb8cc, size: 0.24, sizeEnd: 0.08, life: 0.55, gravity: 8, drag: 1 }); }
      if (e.at) this.slimeSplat(e.at[0], e.at[1]);
      this.call.ring(e.x + Math.sin(e.angle) * 1.6, y + 0.08, e.z + Math.cos(e.angle) * 1.6, 2.4, SLIME_HALO, 0.4);
      this.onShake?.(0.16, 0.14);
      return true;
    }
    if (e.type === 'eye_clam' && e.name === 'valve') {
      // the shell slams shut and blasts a cone of bubbles and spray; bubbles burst round what it hits
      const fx = this.host.vfx?.fx, arc = (e.arc * Math.PI) / 180, y = (this.host.groundAt?.(e.x, e.z) ?? 0) + 0.6;
      if (fx) for (let i = 0; i < 14; i++) {
        const a = e.angle + (Math.random() - 0.5) * arc, sp = e.range * (2.2 + Math.random() * 1.6);
        fx.add(e.x + Math.sin(a) * 0.6, y, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, 0.6 + Math.random(), Math.cos(a) * sp, { color: i % 3 ? 0x9fe6ff : 0xf0fbff, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.03, life: 0.4, gravity: 4, drag: 3 });
      }
      for (let i = 0; i < 9; i++) {
        const a = e.angle + (Math.random() - 0.5) * arc, sp = e.range * (2.4 + Math.random() * 1.8);
        this.bubbles.add(e.x + Math.sin(a) * 0.6, y, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, 0.3 + Math.random() * 0.6, Math.cos(a) * sp, 0.22 + Math.random() * 0.3, 0.55 + Math.random() * 0.35);
      }
      if (e.at) {
        const gy = this.host.groundAt?.(e.at[0], e.at[1]) ?? 0;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + Math.random() * 0.5, r = 0.25 + Math.random() * 0.25; this.bubbles.add(e.at[0] + Math.sin(a) * r, gy + 0.4 + Math.random() * 0.6, e.at[1] + Math.cos(a) * r, Math.sin(a) * 1.2, 0.5 + Math.random() * 0.6, Math.cos(a) * 1.2, 0.18 + Math.random() * 0.22, 0.3 + Math.random() * 0.3, 0xe0f8ff); }
        this.companion.glint(e.at[0], gy + 0.7, e.at[1], 0.7, 0.02);
      }
      this.onShake?.(0.08, 0.1);
      return true;
    }
    if (e.type === 'pearl_fish' && e.name === 'slap') {
      // the tail slaps water over the prey: a crown of water splashing up off it, droplets raining down
      if (e.at) { this.waterCrown(e.at[0], e.at[1]); this.onShake?.(0.06, 0.08); }
      else this.splash(e.x + Math.sin(e.angle) * 0.9, e.z + Math.cos(e.angle) * 0.9, 0.6);
      return true;
    }
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
    if (m?.type === 'pearl_slug' && e.name === 'volley') this.cues.push({ id: e.id, kind: 'slug_volley', t: 0, total: e.total, next: 0 });
    if (m?.type === 'eye_clam' && e.name === 'snipe') this.cues.push({ id: e.id, kind: 'clam_snipe', t: 0, total: e.total, next: 0 });
    if (m?.type === 'pearl_fish' && e.name === 'jet') this.cues.push({ id: e.id, kind: 'fish_jet', t: 0, total: e.total, next: 0 });
    if (m?.type === 'leaf_tanuki' && (e.name === 'drum' || e.name === 'boomerang' || e.name === 'doubles')) this.cues.push({ id: e.id, kind: 'tanuki_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type !== 'leaf_fox') return;
    if (e.name === 'gust' || e.name === 'pounce') this.cues.push({ id: e.id, kind: e.name, t: 0, total: e.total, next: 0 });
  }

  /** A marked area went off (core burst with its source monster). */
  burst(e, g) {
    const m = e.source != null ? g.monsterById?.(e.source) : null;
    if (e.attack === 'withdraw') return this.shellBurst(e);
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

  /** A splash of water at (x, z): droplets up and out and a ripple ring; size scales both. */
  splash(x, z, size = 1) {
    const y = this.host.groundAt?.(x, z) ?? 0, fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 14 * size; i++) {
      const a = Math.random() * 6.283, sp = (1.4 + Math.random() * 2.2) * size;
      fx.add(x, y + 0.2, z, Math.sin(a) * sp, 2 + Math.random() * 2.5 * size, Math.cos(a) * sp, { color: i % 3 ? 0x8fdcff : 0xf0fffb, size: 0.14 + Math.random() * 0.12, life: 0.55, gravity: 9, drag: 0.6 });
    }
    this.call.ring(x, y + 0.06, z, 1.1 * size, WATER_HALO, 0.45);
  }

  /**
   * A blunt blow at (x, y, z): a manga burst star (a zig-zag outline of light, its points flashing out from the
   * hit), a white flash and chips thrown out and falling. R its outer radius (m); look the stroke colours; chip
   * colours a and b.
   */
  burstStar(x, y, z, R, look, a, b) {
    const c = this.companion; c.axes();
    _v.set(x, y, z);
    const n = 6, rot = Math.random() * 1.0;
    for (let i = 0; i < n * 2; i++) {
      const a0 = rot + (i / (n * 2)) * 6.283, a1 = rot + ((i + 1) / (n * 2)) * 6.283, r0 = i % 2 ? R * 0.5 : R, r1 = i % 2 ? R : R * 0.5;
      c.stroke(_v, Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0, 0.05, look, 0.26, 0.04, 0, null);
    }
    c.glint(x, y, z, R * 1.6, 0);
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 12; i++) { const t = Math.random() * 6.283, sp = 2 + Math.random() * 2.5; fx.add(x, y, z, Math.sin(t) * sp, 1.5 + Math.random() * 2.5, Math.cos(t) * sp, { color: i % 2 ? a : b, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.08, life: 0.55, gravity: 14, drag: 0.8 }); }
  }
  /** A crown of water splashing up off the prey at (x, z): arcs of water curling out, droplets up and raining down. */
  waterCrown(x, z) {
    const c = this.companion, y = (this.host.groundAt?.(x, z) ?? 0) + 0.45; c.axes();
    _v.set(x, y, z);
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1, k = (i % 3) / 2, x0 = s * (0.08 + 0.1 * k), x1 = s * (0.35 + 0.35 * k);
      c.stroke(_v, x0, 0, x1, 0.55 + 0.35 * (1 - k), s * 0.12, 0.045, WATER, 0.32, 0.07, k * 0.02, null);
    }
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, sp = 0.8 + Math.random() * 1.2; fx.add(x + Math.sin(a) * 0.25, y, z + Math.cos(a) * 0.25, Math.sin(a) * sp, 3.2 + Math.random() * 2, Math.cos(a) * sp, { color: i % 3 ? 0x8fdcff : 0xf0fffb, size: 0.13 + Math.random() * 0.08, sizeEnd: 0.06, life: 0.7, gravity: 11, drag: 0.5 }); }
    this.call.ring(x, y - 0.4, z, 0.9, WATER_HALO, 0.4);
  }
  /** A splat of slime on the prey at (x, z): thick spikes of slime light out from the hit, blobs flung off their tips and dripping. */
  slimeSplat(x, z) {
    const c = this.companion, gy = this.host.groundAt?.(x, z) ?? 0, y = gy + 0.8; c.axes();
    _v.set(x, y, z);
    const n = 7, rot = Math.random();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * 6.283, L = 0.5 + Math.random() * 0.3;
      c.stroke(_v, Math.cos(a) * 0.08, Math.sin(a) * 0.08, Math.cos(a) * L, Math.sin(a) * L, (Math.random() - 0.5) * 0.15, 0.09, SLIME, 0.42, 0.06, 0, null);
    }
    c.glint(x, y, z, 1.0, 0);
    const fx = this.host.vfx?.fx, dust = this.host.vfx?.dust;
    if (fx) for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 2; fx.add(x, y, z, Math.sin(a) * sp, 1 + Math.random() * 2, Math.cos(a) * sp, { color: i % 2 ? 0xe0447a : 0xffb8cc, size: 0.26, sizeEnd: 0.14, life: 0.7, gravity: 10, drag: 0.8 }); }
    // the slime it leaves on the ground round the prey
    if (dust) for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; dust.add(x + Math.sin(a) * 0.3, gy + 0.06, z + Math.cos(a) * 0.3, Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6, { color: 0xd03a70, size: 0.5, sizeEnd: 1.1, life: 0.9, drag: 3, alpha: 0.7 }); }
  }

  /** The pangolin's rake (two claw marks of light per hit, stone chips) and tail lash (a wide sweep behind it). */
  pangolinSwing(e) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0;
    if (e.name === 'tail') {
      // the tail swung round behind it: dust thrown along the arc's edge; a blunt blow (no cut) on what it hits
      const arc = (e.arc * Math.PI) / 180;
      for (let i = 0; i < 9; i++) {
        const a = e.angle + (i / 8 - 0.5) * arc, R = e.range * 0.85;
        this.call.dust(e.x + Math.sin(a) * R, y + 0.15, e.z + Math.cos(a) * R, Math.sin(a) * 1.6, 0.5, Math.cos(a) * 1.6, 0.8, 0.5);
      }
      if (e.at) { this.burstStar(e.at[0], 0.7, e.at[1], 0.75, STONE, 0xb89a6a, 0xeedcb4); this.onShake?.(0.12, 0.12); }
      return true;
    }
    if (e.name === 'rake') {
      if (e.at) {
        this.companion.axes();
        _v.set(e.at[0], 0.75, e.at[1]);
        this.companion.rake(_v, e.hit === 2 ? -1 : 1, 2, 0.6, 1.0, 0.24, STONE_HALO, STONE_RIM, 0.02);
        this.onShake?.(0.05, 0.07);
      }
      return true;
    }
    return false;
  }
  /** The pangolin's ball bounces off the end of its lane (core rebound): a ring of dust and stone. */
  rebound(e) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0;
    this.call.ring(e.x, y + 0.1, e.z, 1.6, undefined, 0.35);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; this.call.dust(e.x + Math.cos(a) * 0.5, y + 0.2, e.z + Math.sin(a) * 0.5, Math.cos(a) * 2, 0.6, Math.sin(a) * 2, 0.8, 0.5); }
    this.onShake?.(0.1, 0.1);
  }

  /** A boomerang leaf hit (core impact of kind boomerang): two leaf cuts on the body it passed. */
  leafCut(e, g) {
    const p = g.player;
    if (Math.hypot(p.x - e.x, p.z - e.z) > 1.5) return;
    // one clean green cut the way the leaf passed, green motes off it
    this.companion.axes();
    this.companion.clawFx.mark(p.x, 0.85, p.z, 0.6, 0.7, e.back ? 0.25 : -0.25, e.back ? -1 : 1, HEAD_LEAF, HEAD_LEAF_RIM, 0, 0.28);
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283; fx.add(p.x, 0.85, p.z, Math.sin(a) * 2, 0.8 + Math.random(), Math.cos(a) * 2, { color: 0xb8f08a, size: 0.14, sizeEnd: 0.03, life: 0.35, drag: 2 }); }
    this.onShake?.(0.04, 0.06);
  }
  /** The pearl slug sheds its stinging plumes (core shed): they spring off its back in a puff of violet light. */
  shed(e) {
    const r = this.rig(e.id); if (r) r.shedT = 0.5;
    const fx = this.host.vfx?.fx, y = (this.host.groundAt?.(e.x, e.z) ?? 0) + 0.7;
    if (fx) for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 2; fx.add(e.x, y, e.z, Math.sin(a) * sp, 2 + Math.random() * 1.5, Math.cos(a) * sp, { color: i % 2 ? 0xb48cff : 0x6ae8d4, size: 0.2, sizeEnd: 0.06, life: 0.6, gravity: 7, drag: 1 }); }
    this.call.ring(e.x, y - 0.6, e.z, 1.8, undefined, 0.4);
  }
  /** The snail king's harpoon (core beam of kind harpoon): a stab of pink light down the lane, a flash where it ends. */
  harpoon(e) {
    this.companion.axes();
    const y = (this.host.groundAt?.(e.x, e.z) ?? 0) + 1.0, L = e.length, ex = e.x + Math.sin(e.angle) * L, ez = e.z + Math.cos(e.angle) * L;
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 20; i++) { const u = i / 19; fx.add(e.x + Math.sin(e.angle) * L * u, y, e.z + Math.cos(e.angle) * L * u, 0, 0.2, 0, { color: u > 0.8 ? 0xffffff : 0xff7aa8, size: 0.34 * (1 - u * 0.5), sizeEnd: 0.04, life: 0.22 + u * 0.1, drag: 3 }); }
    this.companion.glint(ex, y, ez, 1.2, 0.04);
    this.onShake?.(0.1, 0.1);
  }
  /** The snail king's withdraw ring going off as it bursts out (core burst of attack withdraw): nacre shards and dust. */
  shellBurst(e) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0, fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, sp = 4 + Math.random() * 4; fx.add(e.x, y + 1.2, e.z, Math.sin(a) * sp, 3 + Math.random() * 3, Math.cos(a) * sp, { color: [0xfff2f8, 0xffd8ec, 0xd8f4ff][i % 3], size: 0.24, sizeEnd: 0.06, life: 0.7, gravity: 9, drag: 1 }); }
    this.call.ring(e.x, y + 0.1, e.z, e.radius, undefined, 0.5);
    this.onShake?.(0.22, 0.18);
  }

  /** A pearl bursting into nacre where it struck. */
  nacre(x, z) {
    const fx = this.host.vfx?.fx, y = (this.host.groundAt?.(x, z) ?? 0) + 0.8;
    if (fx) for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, sp = 2 + Math.random() * 2.5; fx.add(x, y, z, Math.sin(a) * sp, 1 + Math.random() * 1.5, Math.cos(a) * sp, { color: [0xfff2f8, 0xffd8ec, 0xd8f4ff][i % 3], size: 0.16, sizeEnd: 0.04, life: 0.4, gravity: 3, drag: 2 }); }
    this.companion.glint(x, y, z, 1.0, 0);
    this.onShake?.(0.05, 0.07);
  }

  /**
   * The tanuki's transformation smoke (folklore: it changes shape in a puff): soft white-and-pink cloud puffs swell
   * out and drift up, with a pop of sparkle stars - for its doubles stepping out (core doubles) and an illusion
   * popping (illusionPop). Its own look: no leaves.
   */
  puff(x, z, n = 12) {
    const y = this.host.groundAt?.(x, z) ?? 0, dust = this.host.vfx?.dust;
    if (dust) for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * 0.5, sp = 0.8 + Math.random() * 1.2;
      dust.add(x + Math.sin(a) * 0.25, y + 0.35 + Math.random() * 0.6, z + Math.cos(a) * 0.25, Math.sin(a) * sp, 0.6 + Math.random() * 0.8, Math.cos(a) * sp, { color: i % 3 ? 0xfff4fa : 0xffcfe2, size: 0.55, sizeEnd: 1.5, life: 0.75 + Math.random() * 0.3, drag: 3 });
    }
    for (let i = 0; i < 3; i++) this.companion.glint(x + (Math.random() - 0.5) * 0.9, y + 0.6 + Math.random() * 0.7, z + (Math.random() - 0.5) * 0.9, 0.7, i * 0.06);
  }
  doubles(e, g) { this.puff(e.x, e.z, 16); for (const m of g.monsters) if (m.illusion?.of === e.id && !m.dead) this.puff(m.x, m.z, 10); }

  endCue(id) { for (const c of this.cues) if (c.id === id) c.t = c.total + 1; }

  update(dt, g) {
    this.tanuki(g);
    this.fish(g);
    this.king(g, dt);
    // a rolling pangolin kicks up dust behind it
    for (const m of g.monsters) if (m.type === 'stone_pangolin' && m.charge && !m.charge.hop && Math.random() < 0.7) {
      const y = this.host.groundAt?.(m.x, m.z) ?? 0;
      this.call.dust(m.x, y + 0.15, m.z, (Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8, 0.7, 0.45);
    }
    this.leaves.update(dt);
    this.bubbles.update(dt);
    let glowAt = null, glowK = 0, glowTint = 0xffffff;
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
      } else if (c.kind === 'slug_volley') {
        // the plume tips light one by one
        c.next -= dt;
        const b = this.bonePos(c.id, 'cerata', _w);
        if (b && c.next <= 0) { c.next = 0.08; const a = Math.random() * 6.283; this.host.vfx?.fx.add(b.x + Math.sin(a) * 0.35, b.y + 0.35 + Math.random() * 0.2, b.z + Math.cos(a) * 0.35, 0, 0.4, 0, { color: 0xe0ccff, size: 0.2, sizeEnd: 0.05, life: 0.35, drag: 2 }); }
        if (b) { glowAt = b; glowK = 0.3 + 0.4 * k; glowTint = 0xc8a8ff; }
      } else if (c.kind === 'clam_snipe') {
        // the eye glows gold as it fixes on its prey
        const h = this.bonePos(c.id, 'eye', _w);
        if (h) { glowAt = h; glowK = 0.4 + 0.6 * k; glowTint = 0xffe08a; }
      } else if (c.kind === 'fish_jet') {
        // droplets gather at its mouth as its cheeks swell
        c.next -= dt;
        const h = this.bonePos(c.id, 'head', _w);
        if (h && c.next <= 0) { c.next = 0.05; const a = Math.random() * 6.283; this.host.vfx?.fx.add(h.x + Math.sin(a) * 0.6, h.y + 0.2, h.z + Math.cos(a) * 0.6, -Math.sin(a) * 1.4, 0.3, -Math.cos(a) * 1.4, { color: 0xbff0ff, size: 0.12, life: 0.4, drag: 0.5 }); }
      } else if (c.kind === 'tanuki_drum') {
        // the belly glows warm as it swells
        const b = this.bonePos(c.id, 'chest', _w);
        if (b) { glowAt = b; glowK = k; glowTint = 0xffd890; }
      } else if (c.kind === 'tanuki_boomerang') {
        // the leaf on its head lights up, then leaves gather round the cocked foreleg
        const h = this.bonePos(c.id, k < 0.45 ? 'head' : 'leg0k', _w);
        if (h) { if (k < 0.45) h.y += 0.35; glowAt = h; glowK = 0.5 + 0.5 * k; glowTint = 0x9cf07a; }
      } else if (c.kind === 'tanuki_doubles') {
        c.next -= dt;
        const b = this.bonePos(c.id, 'body', _w);
        if (b && c.next <= 0) { c.next = 0.05; const a = Math.random() * 6.283; this.host.vfx?.dust.add(b.x + Math.sin(a) * 0.6, b.y - 0.2, b.z + Math.cos(a) * 0.6, Math.cos(a) * 1.5, 0.9, -Math.sin(a) * 1.5, { color: 0xfff0f6, size: 0.3, sizeEnd: 0.8, life: 0.5, drag: 2 }); }
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
    if (glowAt) { this.glow.material.color.setHex(glowTint); this.glow.position.copy(glowAt); this.glow.scale.setScalar(1.2 + 0.8 * glowK); this.glow.material.opacity = 0.25 + 0.45 * glowK; this.glow.visible = true; }
    else if (this.kingGlow) this.kingGlow = false; // the king's pearl or latch lit it this frame
    else if (this.glow.visible) { this.glow.material.opacity *= Math.exp(-dt * 18); if (this.glow.material.opacity < 0.02) this.glow.visible = false; }
  }
  /** The snail king's sweeping pearl beam (core m.sweep), and its pearl charging before it. */
  king(g, dt) {
    const B = this.beam;
    const m = g.monsters.find((q) => q.sweep && q.type === 'pearl_snail_king' && !q.dead);
    if (m) {
      const atk = m.def.attacks[m.sweep.name], p = this.bonePos(m.id, 'pearl', _w), y = p ? p.y - 0.3 : 1.6;
      const ang = m.sweep.from + (m.sweep.to - m.sweep.from) * Math.min(1, m.sweep.t / m.sweep.dur);
      const flick = 0.85 + Math.random() * 0.3;
      for (const [mesh, w] of [[B.glow, atk.width * 1.8], [B.core, atk.width * 0.45]]) {
        mesh.visible = true; mesh.position.set(m.x, y, m.z); mesh.rotation.set(0, ang, 0); mesh.scale.set(w * flick, 1, atk.range);
      }
      // where it ends it scorches the ground with dust and sparks
      const ex = m.x + Math.sin(ang) * atk.range, ez = m.z + Math.cos(ang) * atk.range, gy = this.host.groundAt?.(ex, ez) ?? 0;
      if (Math.random() < 0.8) this.host.vfx?.fx.add(ex, gy + 0.2, ez, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, { color: 0xffe6a0, size: 0.2, sizeEnd: 0.04, life: 0.4, gravity: 6, drag: 1 });
      if (Math.random() < 0.5) this.call.dust(ex, gy + 0.15, ez, 0, 0.6, 0, 0.8, 0.5);
      if (p) { this.glow.material.color.setHex(PEARL); this.glow.position.copy(p); this.glow.scale.setScalar(2.4 + Math.random() * 0.4); this.glow.material.opacity = 0.8; this.glow.visible = true; this.kingGlow = true; }
    } else if (B.glow.visible) { B.glow.visible = B.core.visible = false; }
    // the pearl charging (its wind-up): light gathers to it, motes drawn in from round it
    for (const q of g.monsters) {
      if (q.type !== 'pearl_snail_king' || q.dead || q.state !== 'windup' || !q.windup) continue;
      const k = Math.min(1, q.stateT / q.windup.total), name = q.windup.name;
      if (name === 'beam') {
        const p = this.bonePos(q.id, 'pearl', _w);
        if (!p) continue;
        this.glow.material.color.setHex(PEARL); this.glow.position.copy(p); this.glow.scale.setScalar(1 + 1.8 * k); this.glow.material.opacity = 0.3 + 0.6 * k; this.glow.visible = true; this.kingGlow = true;
        if (Math.random() < 0.7) { const a = Math.random() * 6.283, r = 1.5 + Math.random(); this.host.vfx?.fx.add(p.x + Math.sin(a) * r, p.y + (Math.random() - 0.5), p.z + Math.cos(a) * r, -Math.sin(a) * r * 2.5, 0, -Math.cos(a) * r * 2.5, { color: PEARL, size: 0.16, sizeEnd: 0.02, life: 0.38, drag: 0.5 }); }
      } else if (name === 'harpoon' && k > 0.65) {
        // the latch: the head glows pink and trembles, about to fire
        const h = this.bonePos(q.id, 'head', _w);
        if (h) { this.glow.material.color.setHex(0xff7aa8); this.glow.position.copy(h); this.glow.scale.setScalar(1.4 + Math.sin(g.time * 40) * 0.2); this.glow.material.opacity = 0.7; this.glow.visible = true; this.kingGlow = true; }
      }
    }
  }

  /** The pearl fish's jets in flight and its flop landings. */
  fish(g) {
    let n = 0;
    for (const pr of g.projectiles) {
      const look = SHOTS[pr.kind];
      if (!look || n >= this.slugs.length) continue;
      const m = this.slugs[n++], k = Math.min(1, pr.travelled / pr.range), y = (this.host.groundAt?.(pr.x, pr.z) ?? 0) + (pr.y ?? 0.7);
      m.visible = true; m.position.set(pr.x, y, pr.z);
      m.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
      m.material = look.mat;
      // the jet: thin, gathering into a heavy slug of water; a dart: long and thin; the pearl: round
      if (pr.kind === 'jet') m.scale.set(1 + 0.6 * k, 1 + 0.6 * k, 3.2 - 1.2 * k);
      else m.scale.set(look.w, look.w, look.l);
      if (Math.random() < look.drops) this.host.vfx?.fx.add(pr.x, y, pr.z, -pr.vx * 0.05 + (Math.random() - 0.5) * 0.6, 0.4, -pr.vz * 0.05 + (Math.random() - 0.5) * 0.6, { color: look.trail, size: 0.11, life: 0.32, gravity: pr.kind === 'jet' ? 6 : 0, drag: 1.5 });
    }
    for (let i = n; i < this.slugs.length; i++) this.slugs[i].visible = false;
    for (const a of g.areas) {
      if (a.attack !== 'flop' || a.t < a.delay || this.splashes.has(a.id)) continue;
      this.splashes.add(a.id);
      this.splash(a.x, a.z, 1);
      this.onShake?.(0.04, 0.06);
    }
    if (this.splashes.size > 64) this.splashes.clear();
  }

  /** The tanuki's drum rings (taiko sound waves) and its head-leaf boomerang. */
  tanuki(g) {
    for (const a of g.areas) {
      if (a.look !== 'drum' || a.t < a.delay || this.rings.has(a.id)) continue;
      this.rings.add(a.id);
      // a taiko beat: a ring of warm gold sound running out with the wave's edge (a thin echo ring behind it), dust
      // kicked up where the edge passes, and manga impact lines bursting off its belly; the last beat bigger
      const y = this.host.groundAt?.(a.x, a.z) ?? 0, life = (a.maxRadius - a.radius) / a.growth, last = !!a.knock;
      this.call.ring(a.x, y + 0.1, a.z, a.maxRadius, DRUM, life + 0.1);
      this.call.ring(a.x, y + 0.06, a.z, a.maxRadius * 0.82, DRUM, life + 0.18, 0.08);
      const dust = this.host.vfx?.dust, n = last ? 16 : 11;
      if (dust) for (let i = 0; i < n; i++) { const ang = (i / n) * 6.283 + a.beat; dust.add(a.x + Math.sin(ang) * 0.7, y + 0.15, a.z + Math.cos(ang) * 0.7, Math.sin(ang) * a.growth, 0.3, Math.cos(ang) * a.growth, { color: 0xc8b088, size: 0.35, sizeEnd: 0.9, life: life * 0.9, drag: 0.2 }); }
      const belly = this.bonePos(a.sourceId, 'chest', _w);
      if (belly) {
        this.companion.axes();
        const L = last ? 1.0 : 0.75;
        for (let i = 0; i < 10; i++) { const t = (i / 10) * 6.283 + a.beat * 0.3, cx = Math.cos(t), cy = Math.sin(t); this.companion.stroke(belly, cx * 0.35, cy * 0.35, cx * L, cy * L, 0, last ? 0.05 : 0.04, DRUM_CORE, 0.18, 0.04); }
        this.companion.glint(belly.x, belly.y, belly.z, last ? 1.3 : 0.9, 0);
      }
      this.onShake?.(last ? 0.12 : 0.06, 0.08);
    }
    if (this.rings.size > 64) this.rings.clear();
    // the leaf boomerang: one big leaf spinning flat along the projectile, a few small ones shed behind it
    const pr = g.projectiles.find((q) => q.boomerang);
    if (pr) {
      const y = (this.host.groundAt?.(pr.x, pr.z) ?? 0) + (pr.y ?? 0.9);
      // its own green head-leaf, spinning flat, a green swirl of wind shed behind it
      if (this.spinLeaf < 0) this.spinLeaf = this.leaves.leaf(pr.x, y, pr.z, 0, 0, 0, 1.5, 9, 0, 0, HEAD_LEAF);
      this.leaves.hold(this.spinLeaf, pr.x, y, pr.z, g.time * 22);
      const sw = g.time * 22;
      this.host.vfx?.fx.add(pr.x + Math.sin(sw) * 0.5, y, pr.z + Math.cos(sw) * 0.5, -pr.vx * 0.15, 0.2, -pr.vz * 0.15, { color: 0xb8f08a, size: 0.16, sizeEnd: 0.03, life: 0.35, drag: 2 });
    } else if (this.spinLeaf >= 0) { this.leaves.release(this.spinLeaf); this.spinLeaf = -1; }
  }
  clear() { this.leaves.clear(); this.bubbles.clear(); this.cues.length = 0; this.glow.visible = false; }
}
